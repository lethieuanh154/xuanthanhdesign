import { Catalog, DeviceDef, PlacedDevice, Project, SHEET_SIZES } from './model';
import { Part, Rect } from './types';
import { bboxIntersect, bboxH, bboxW, holeBBox, r2, rectGap, rectInside, rectsIntersect, segmentHitsBBox } from './math';
import { deviceCutout, deviceRect, EnclosureLayout, PLATE_MARGIN, SECTION_MARGIN, sectionAt } from './layout';

/** Kết quả một luật. step = bước của stepper hiển thị badge lỗi. */
export interface RuleResult {
  id: string;
  rule: string;
  level: 'ok' | 'warn' | 'error';
  message: string;
  targetIds: string[];
  step: 2 | 3 | 4;
}

export const DOOR_EDGE_MIN = 30; // lỗ khoét cách mép cửa tối thiểu
export const ACB_SECTION_MIN_H = 500;
export const DEFAULT_CLEARANCE = 20;

interface Ctx {
  p: Project;
  cat: Catalog;
  layout: EnclosureLayout;
  parts: Part[];
  placed: { pd: PlacedDevice; def: DeviceDef; rect: Rect }[];
}

const nameOf = (x: { pd: PlacedDevice; def: DeviceDef }): string => x.pd.label || x.def.model;

let seq = 0;
const res = (rule: string, level: RuleResult['level'], message: string, targetIds: string[], step: RuleResult['step']): RuleResult => ({
  id: `${rule}-${seq++}`,
  rule,
  level,
  message,
  targetIds,
  step,
});

/** Luật 1: không chồng lấn, khoảng hở ≥ clearance (thiết bị DIN đặt sát nhau được). */
export function ruleCollision(c: Ctx): RuleResult[] {
  const out: RuleResult[] = [];
  const list = c.placed;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i],
        b = list[j];
      if (a.pd.mount !== b.pd.mount) continue;
      const need = a.def.din && b.def.din ? 0 : Math.max(a.def.clearance ?? DEFAULT_CLEARANCE, b.def.clearance ?? DEFAULT_CLEARANCE);
      if (rectsIntersect(a.rect, b.rect)) {
        out.push(res('collision', 'error', `${nameOf(a)} chồng lấn ${nameOf(b)}`, [a.pd.uid, b.pd.uid], 3));
        continue;
      }
      const gap = rectGap(a.rect, b.rect);
      if (gap < need - 0.01) {
        out.push(res('clearance', 'error', `Hở ${nameOf(a)} – ${nameOf(b)} = ${r2(gap)} mm < ${need} mm`, [a.pd.uid, b.pd.uid], 3));
      }
    }
  }
  if (!out.length) out.push(res('collision', 'ok', 'Không va chạm, khoảng hở đạt', [], 3));
  return out;
}

/** Luật 2: thiết bị nằm trong vùng lắp của ngăn (trừ lề). */
export function ruleMountArea(c: Ctx): RuleResult[] {
  const out: RuleResult[] = [];
  for (const x of c.placed) {
    if (x.pd.mount === 'plate') {
      if (!rectInside(x.rect, c.layout.plate, PLATE_MARGIN)) {
        out.push(res('mount-area', 'error', `${nameOf(x)} nằm ngoài vùng lắp tấm đế (lề ${PLATE_MARGIN} mm)`, [x.pd.uid], 3));
        continue;
      }
    } else if (!rectInside(x.rect, c.layout.body, 0)) {
      out.push(res('mount-area', 'error', `${nameOf(x)} nằm ngoài mặt cửa`, [x.pd.uid], 3));
      continue;
    }
    if (x.pd.mount === 'plate') {
      const s = sectionAt(c.layout, x.rect.y + x.rect.h / 2);
      if (s && (x.rect.y < s.y0 + SECTION_MARGIN - 0.01 || x.rect.y + x.rect.h > s.y1 - SECTION_MARGIN + 0.01)) {
        out.push(res('section', 'error', `${nameOf(x)} vắt qua ranh giới ngăn ${s.index + 1}`, [x.pd.uid], 3));
      }
    }
  }
  if (!out.length) out.push(res('mount-area', 'ok', 'Thiết bị nằm trong vùng lắp', [], 3));
  return out;
}

/** Luật 3: lỗ khoét cửa cách mép cửa ≥ 30 mm và không cắt qua đường chấn / khe giữa 2 cánh. */
export function ruleDoorCutouts(c: Ctx): RuleResult[] {
  const out: RuleResult[] = [];
  const leaves = c.layout.leaves.filter((l) => l.carriesCutouts);
  for (const x of c.placed) {
    const cut = deviceCutout(x.pd, x.def);
    if (!cut) continue;
    const bb = holeBBox(cut);
    const cx = (bb.minX + bb.maxX) / 2;
    const leaf = leaves.find((l) => cx >= l.rect.x && cx <= l.rect.x + l.rect.w);
    if (!leaf) {
      out.push(res('door-edge', 'error', `Lỗ khoét ${nameOf(x)} rơi vào khe giữa 2 cánh`, [x.pd.uid], 3));
      continue;
    }
    const L = leaf.rect;
    const d = Math.min(bb.minX - L.x, L.x + L.w - bb.maxX, bb.minY - L.y, L.y + L.h - bb.maxY);
    if (bb.minX < L.x || bb.maxX > L.x + L.w) {
      out.push(res('door-edge', 'error', `Lỗ khoét ${nameOf(x)} cắt qua mép ${leaf.name.toLowerCase()}`, [x.pd.uid], 3));
    } else if (d < DOOR_EDGE_MIN - 0.01) {
      out.push(res('door-edge', 'error', `Lỗ khoét ${nameOf(x)} cách mép ${leaf.name.toLowerCase()} ${r2(Math.max(0, d))} mm < ${DOOR_EDGE_MIN} mm`, [x.pd.uid], 3));
    }
  }
  // Kiểm tra trên bản trải phẳng: lỗ cắt qua đường chấn, lỗ chồng lỗ
  for (const part of c.parts) {
    const boxes = part.holes.map((h) => ({ h, bb: holeBBox(h) }));
    for (const { h, bb } of boxes) {
      if (part.bendLines.some((bl) => segmentHitsBBox(bl.a, bl.b, bb))) {
        out.push(res('bend-cross', 'error', `${part.name}: lỗ ${h.ref ? 'khoét thiết bị ' : ''}cắt qua đường chấn`, h.ref ? [h.ref] : [part.id], 3));
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (bboxIntersect(boxes[i].bb, boxes[j].bb)) {
          const ids = [boxes[i].h.ref, boxes[j].h.ref].filter((v): v is string => !!v);
          // hai lỗ cùng 1 thiết bị chồng nhau đã được bắt ở luật va chạm
          if (ids.length === 2 && ids[0] === ids[1]) continue;
          out.push(res('hole-overlap', 'error', `${part.name}: 2 lỗ chồng lên nhau`, ids.length ? ids : [part.id], 3));
        }
      }
    }
  }
  if (!out.length) out.push(res('door-edge', 'ok', `Lỗ khoét cửa cách mép ≥ ${DOOR_EDGE_MIN} mm`, [], 3));
  return out;
}

/** Luật 4: ngăn có ACB phải cao ≥ 500 mm. */
export function ruleAcbSection(c: Ctx): RuleResult[] {
  const out: RuleResult[] = [];
  for (const x of c.placed.filter((v) => v.def.type === 'ACB')) {
    const s = sectionAt(c.layout, x.rect.y + x.rect.h / 2);
    if (s && s.h < ACB_SECTION_MIN_H) {
      out.push(res('acb-section', 'error', `Ngăn ${s.index + 1} chứa ACB chỉ cao ${s.h} mm < ${ACB_SECTION_MIN_H} mm`, [x.pd.uid], 2));
    }
  }
  return out;
}

/** Luật 5: tổng dòng tải ≤ dòng định mức thanh cái và aptomat tổng. */
export function ruleLoad(c: Ctx): RuleResult[] {
  const breakers = c.placed.filter((x) => x.def.isBreaker && x.def.ratedCurrent);
  if (!breakers.length) return [res('load', 'ok', 'Chưa có aptomat để tính tải', [], 4)];
  const sorted = [...breakers].sort((a, b) => (b.def.ratedCurrent ?? 0) - (a.def.ratedCurrent ?? 0));
  let mains = breakers.filter((x) => x.pd.isMain);
  if (!mains.length) mains = c.p.cabinetType === 'ATS' ? sorted.slice(0, 2) : sorted.slice(0, 1);
  const mainA = Math.max(...mains.map((m) => m.def.ratedCurrent ?? 0));
  const feeders = breakers.filter((x) => !mains.includes(x));
  const ks = c.p.busbar.diversity || 1;
  const load = r2(feeders.reduce((s, f) => s + (f.def.ratedCurrent ?? 0), 0) * ks);
  const bus = c.p.busbar.ratedA;
  const out: RuleResult[] = [];
  const mainIds = mains.map((m) => m.pd.uid);
  if (load > mainA) out.push(res('load', 'error', `Tổng tải ${load} A (Ks=${ks}) > aptomat tổng ${mainA} A`, mainIds, 4));
  if (load > bus) out.push(res('load', 'error', `Tổng tải ${load} A > thanh cái ${bus} A`, [], 4));
  if (mainA > bus) out.push(res('load', 'warn', `Aptomat tổng ${mainA} A lớn hơn định mức thanh cái ${bus} A`, mainIds, 4));
  if (!out.length) {
    const lim = Math.min(mainA, bus);
    if (load > 0.9 * lim) out.push(res('load', 'warn', `Tổng tải ${load} A gần ngưỡng ${lim} A (> 90%)`, [], 4));
    else out.push(res('load', 'ok', `Tải ${load} A ≤ aptomat tổng ${mainA} A, thanh cái ${bus} A`, [], 4));
  }
  return out;
}

/** Luật 6: chi tiết trải phẳng phải lọt khổ tôn. */
export function ruleSheetSize(c: Ctx): RuleResult[] {
  const sheet = SHEET_SIZES[c.p.sheetSize];
  const big = SHEET_SIZES['1500x3000'];
  const fits = (w: number, h: number, s: { w: number; h: number }): boolean => (w <= s.w && h <= s.h) || (w <= s.h && h <= s.w);
  const out: RuleResult[] = [];
  for (const part of c.parts.filter((x) => x.nestable)) {
    const w = bboxW(part.bbox),
      h = bboxH(part.bbox);
    if (!fits(w, h, sheet)) {
      const hint = c.p.sheetSize === '1250x2500' && fits(w, h, big) ? ' — chọn khổ 1500×3000' : '';
      out.push(res('sheet', 'error', `${part.name} trải phẳng ${r2(w)}×${r2(h)} vượt khổ tôn ${c.p.sheetSize.replace('x', '×')}${hint}`, [part.id], 2));
    }
  }
  if (!out.length) out.push(res('sheet', 'ok', `Mọi chi tiết lọt khổ tôn ${c.p.sheetSize.replace('x', '×')}`, [], 2));
  return out;
}

/** Luật phụ: chiều sâu thiết bị, chồng lên vùng thanh cái. */
export function ruleDepthAndBusbar(c: Ctx): RuleResult[] {
  const out: RuleResult[] = [];
  const avail = c.p.enclosure.D - 60;
  for (const x of c.placed) {
    if (x.def.size.d > avail) out.push(res('depth', 'error', `${nameOf(x)} sâu ${x.def.size.d} mm > chiều sâu khả dụng ${avail} mm`, [x.pd.uid], 3));
    if (x.pd.mount === 'plate' && c.layout.busbarZone && rectsIntersect(x.rect, c.layout.busbarZone)) {
      out.push(res('busbar-zone', 'warn', `${nameOf(x)} đè lên vùng thanh cái`, [x.pd.uid], 3));
    }
  }
  return out;
}

export function runRules(p: Project, cat: Catalog, layout: EnclosureLayout, parts: Part[]): RuleResult[] {
  seq = 0;
  const placed = p.devices
    .map((pd) => {
      const def = cat.devices.find((d) => d.id === pd.deviceId);
      return def ? { pd, def, rect: deviceRect(pd, def) } : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const c: Ctx = { p, cat, layout, parts, placed };
  return [...ruleCollision(c), ...ruleMountArea(c), ...ruleDoorCutouts(c), ...ruleAcbSection(c), ...ruleDepthAndBusbar(c), ...ruleLoad(c), ...ruleSheetSize(c)];
}

/** Gom kết quả theo thiết bị để tô màu trên canvas. */
export function issuesByTarget(results: RuleResult[]): Map<string, { level: 'warn' | 'error'; messages: string[] }> {
  const m = new Map<string, { level: 'warn' | 'error'; messages: string[] }>();
  for (const r of results) {
    if (r.level === 'ok') continue;
    for (const id of r.targetIds) {
      const cur = m.get(id) ?? { level: 'warn' as const, messages: [] };
      if (r.level === 'error') cur.level = 'error';
      cur.messages.push(r.message);
      m.set(id, cur);
    }
  }
  return m;
}
