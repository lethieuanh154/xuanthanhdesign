import { Catalog, DeviceDef, Project } from './model';
import { BendLine, Hole, Part, PartGroup, PartMaterial, Polyline, TextMark } from './types';
import { bendDeduction } from './bend';
import { allSides, flangedPanel, FlangeStep, PanelSpec, profileStrip } from './panel';
import { circle, oblong, r2, rectPoly, translateHole } from './math';
import { coverWindows } from './cover';
import { computeLayout, deviceCutout, devicePlateHoles, DoorLeaf, EnclosureLayout, lockX } from './layout';

/**
 * TEMPLATE CHI TIẾT: mỗi hàm nhận tham số → trả về Part trải phẳng.
 * Đây là phần sẽ port sang Python (ezdxf + shapely) để chạy trên Cloud Run.
 */

export const FLANGE = 20; // mép gấp chuẩn
export const DOOR_RETURN = 12; // mép hồi cửa
export const ROOF_OVERHANG = 20; // mái nhô nóc tủ
export const ROOF_FLANGE = 25;

interface PartInit {
  id: string;
  code: string;
  name: string;
  group: PartGroup;
  material: PartMaterial;
  thickness: number;
  qty: number;
  nestable?: boolean;
  note?: string;
}

function makePart(init: PartInit, g: { outline: Polyline; holes: Hole[]; bendLines: BendLine[]; bbox: Part['bbox'] }): Part {
  const w = g.bbox.maxX;
  const h = g.bbox.maxY;
  const th = Math.max(3, Math.min(20, Math.min(w, h) / 12));
  const marks: TextMark[] = [
    { x: r2(w / 2), y: r2(h / 2 + th * 0.8), height: r2(th), text: init.code, layer: 'MARK' },
    { x: r2(w / 2), y: r2(h / 2 - th * 0.8), height: r2(th * 0.6), text: `${init.thickness}mm x${init.qty}`, layer: 'TEXT' },
  ];
  return { nestable: true, ...init, outline: g.outline, holes: g.holes, bendLines: g.bendLines, bbox: g.bbox, marks };
}

function panelPart(init: PartInit, spec: PanelSpec): Part {
  return makePart(init, flangedPanel(spec));
}

/** Khe thông gió oblong: các hàng khe nằm ngang, đặt giữa chiều rộng mặt. */
export function ventSlots(faceW: number, yStart: number, rows = 5): Hole[] {
  const slotLen = 60,
    slotW = 8,
    pitchY = 16,
    pitchX = 85;
  const cols = Math.max(1, Math.floor((faceW - 80) / pitchX));
  const x0 = faceW / 2 - ((cols - 1) * pitchX) / 2;
  const holes: Hole[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) holes.push(oblong(x0 + c * pitchX, yStart + r * pitchY, slotLen, slotW));
  }
  return holes;
}

/** Lỗ lắp quạt 120×120: lỗ tròn Ø114 + 4 lỗ bắt vít Ø4.5 bước 105 (số mẫu). */
export function fanCutout(cx: number, cy: number): Hole[] {
  const holes: Hole[] = [circle(cx, cy, 114)];
  for (const [dx, dy] of [
    [-52.5, -52.5],
    [52.5, -52.5],
    [-52.5, 52.5],
    [52.5, 52.5],
  ])
    holes.push(circle(cx + dx, cy + dy, 4.5));
  return holes;
}

/** 3 khe gió oblong đứng 10×100 ở phía trước – dưới của hông (như tủ 2 lớp xưởng hay làm). */
export function verticalSlots(faceW: number): Hole[] {
  const holes: Hole[] = [];
  const x0 = faceW - 55;
  for (let i = 0; i < 3; i++) holes.push(oblong(x0 - i * 24, 150, 100, 10, true));
  return holes;
}

/** Hông trái/phải: mặt D×H, gấp mép 4 cạnh, khe thông gió tuỳ chọn. */
export function sidePanel(p: Project, bd: number, relief: number, side: 'T' | 'P'): Part {
  const e = p.enclosure;
  const holes: Hole[] = [];
  if (e.vent === 'bottom' || e.vent === 'top_bottom') holes.push(...ventSlots(e.D, 90));
  if (e.vent === 'side_vertical') holes.push(...verticalSlots(e.D));
  if (e.vent === 'top_bottom') holes.push(...ventSlots(e.D, e.H - 90 - 4 * 16));
  if (e.vent === 'fan') {
    // quạt hút 120 ở hông phải phía dưới, khe gió vào ở hông trái phía trên
    if (side === 'P') holes.push(...fanCutout(e.D / 2, 160));
    else holes.push(...ventSlots(e.D, e.H - 90 - 4 * 16));
  }
  return panelPart(
    { id: `hong-${side}`, code: side === 'T' ? 'HONG-T' : 'HONG-P', name: side === 'T' ? 'Hông trái' : 'Hông phải', group: 'vo', material: e.material, thickness: e.thickness, qty: 1 },
    { faceW: e.D, faceH: e.H, flanges: allSides([{ len: FLANGE, dir: 'UP' }]), bd, relief, holes },
  );
}

/** Hậu: mặt W×H, gấp mép 4 cạnh; tủ treo tường có 4 lỗ treo. */
export function backPanel(p: Project, bd: number, relief: number): Part {
  const e = p.enclosure;
  const holes: Hole[] = [];
  if (e.mounting === 'wall' && !e.brackets) {
    const m = 45;
    for (const [x, y] of [
      [m, m],
      [e.W - m, m],
      [m, e.H - m],
      [e.W - m, e.H - m],
    ])
      holes.push(oblong(x, y, 20, 10, true));
  }
  holes.push(circle(e.W / 2, 60, 6.5)); // lỗ tiếp địa
  return panelPart(
    { id: 'hau', code: 'HAU', name: 'Hậu', group: 'vo', material: e.material, thickness: e.thickness, qty: 1 },
    { faceW: e.W, faceH: e.H, flanges: allSides([{ len: FLANGE, dir: 'UP' }]), bd, relief, holes },
  );
}

/** Nóc: mái nhô ra 2 bên và phía trước, gấp mép xuống. */
export function roofPanel(p: Project, bd: number, relief: number): Part {
  const e = p.enclosure;
  const fw = e.W + 2 * ROOF_OVERHANG;
  const fh = e.D + ROOF_OVERHANG;
  const holes: Hole[] = [];
  if (e.mounting === 'floor') {
    holes.push(circle(ROOF_OVERHANG + 80, fh / 2, 14), circle(fw - ROOF_OVERHANG - 80, fh / 2, 14)); // lỗ tai móc cẩu
  }
  return panelPart(
    { id: 'noc', code: 'NOC', name: 'Nóc (mái nhô)', group: 'vo', material: e.material, thickness: e.thickness, qty: 1 },
    { faceW: fw, faceH: fh, flanges: allSides([{ len: ROOF_FLANGE, dir: 'DOWN' }]), bd, relief, holes },
  );
}

/** Đáy: có lỗ đi cáp (tủ đặt sàn: ô chữ nhật + 4 lỗ bắt nắp; tủ treo: các lỗ tròn knock-out). */
export function bottomPanel(p: Project, bd: number, relief: number): Part {
  const e = p.enclosure;
  const holes: Hole[] = [];
  const g = glandOpening(p);
  if (g) {
    const cw = g.w,
      ch = g.h;
    const x = (e.W - cw) / 2,
      y = (e.D - ch) / 2;
    holes.push(rectPoly(x, y, cw, ch));
    for (const [hx, hy] of [
      [x - 15, y - 15],
      [x + cw + 15, y - 15],
      [x - 15, y + ch + 15],
      [x + cw + 15, y + ch + 15],
    ])
      holes.push(circle(hx, hy, 6.5));
  } else {
    const n = Math.max(2, Math.floor((e.W - 100) / 70));
    const x0 = e.W / 2 - ((n - 1) * 70) / 2;
    for (let i = 0; i < n; i++) holes.push(circle(x0 + i * 70, e.D / 2, i % 2 === 0 ? 28.3 : 22.5));
  }
  return panelPart(
    { id: 'day', code: 'DAY', name: 'Đáy', group: 'vo', material: e.material, thickness: e.thickness, qty: 1 },
    { faceW: e.W, faceH: e.D, flanges: allSides([{ len: FLANGE, dir: 'UP' }]), bd, relief, holes },
  );
}

/** Ô đi cáp chữ nhật ở đáy (null = dùng lỗ tròn knock-out). */
export function glandOpening(p: Project): { w: number; h: number } | null {
  const e = p.enclosure;
  if (e.cableEntry === 'gland') return { w: Math.max(80, e.W - 160), h: Math.max(60, e.D - 110) };
  if (e.cableEntry !== 'knockout' && e.mounting === 'floor' && e.W > 300 && e.D > 300) return { w: e.W - 200, h: e.D - 200 };
  return null;
}

/** Tấm che lỗ cáp ở đáy: tấm phẳng phủ ô đi cáp + 25 mm mỗi bên, 4 lỗ bulông khớp với đáy. */
export function glandPlate(p: Project): Part[] {
  const g = glandOpening(p);
  if (!g) return [];
  const e = p.enclosure;
  const w = g.w + 50,
    h = g.h + 50;
  const holes: Hole[] = [
    [10, 10],
    [w - 10, 10],
    [10, h - 10],
    [w - 10, h - 10],
  ].map(([x, y]) => circle(x, y, 6.5));
  return [makePart({ id: 'tam-che-day', code: 'TAM-CHE-DAY', name: 'Tấm che lỗ cáp đáy', group: 'vo', material: e.material, thickness: e.thickness, qty: 1 }, { outline: rectPoly(0, 0, w, h), holes, bendLines: [], bbox: { minX: 0, minY: 0, maxX: w, maxY: h } })];
}

/** Tai treo ngoài: thép 2 mm chấn L (chân 25 hàn lưng tủ, cánh 60 có lỗ Ø10.5), 4 cái. */
export function bracketParts(p: Project, bdOf: (t: number) => number): Part[] {
  const e = p.enclosure;
  if (e.mounting !== 'wall' || !e.brackets) return [];
  const t = 2.0;
  const s = profileStrip(50, [
    { len: 25, dir: 'UP' },
    { len: 60, dir: 'UP' },
  ], bdOf(t));
  const holes: Hole[] = [oblong(25, s.segFlat[0] + s.segFlat[1] * 0.55, 18, 10.5, true)];
  return [makePart({ id: 'tai-treo', code: 'TAI-TREO', name: 'Tai treo tủ', group: 'vo', material: 'SPCC', thickness: t, qty: 4 }, { outline: s.outline, holes, bendLines: s.bendLines, bbox: { minX: 0, minY: 0, maxX: 50, maxY: s.width } })];
}

/**
 * Cửa trong của tủ 2 lớp: gấp mép đơn 20, bản lề cùng phía cửa ngoài,
 * ô khoét lộ cần gạt aptomat (tự sinh), lỗ khoá ¼ vòng ở phía đối diện bản lề.
 */
export function coverPanel(p: Project, cat: Catalog, layout: EnclosureLayout, bd: number, relief: number): Part[] {
  const cov = layout.cover;
  if (!cov) return [];
  const e = p.enclosure;
  const holes: Hole[] = coverWindows(p, cat).map((w) => rectPoly(w.rect.x - cov.x, w.rect.y - cov.y, w.rect.w, w.rect.h, w.uids[0]));
  // bản lề: 2 lỗ Ø6.5 mỗi bản lề, cách mép bản lề 22 mm (như cửa ngoài)
  const hingeLeft = (e.hinge ?? 'left') === 'left';
  const hx = hingeLeft ? 22 : cov.w - 22;
  const n = hingeCount(cov.h);
  for (let i = 0; i < n; i++) {
    const cy = 120 + ((cov.h - 240) * i) / Math.max(1, n - 1);
    holes.push(circle(hx, cy - 15, 6.5), circle(hx, cy + 15, 6.5));
  }
  // khoá ¼ vòng Ø16 phía đối diện bản lề, giữa chiều cao
  holes.push(circle(hingeLeft ? cov.w - 25 : 25, cov.h / 2, 16));
  return [
    panelPart(
      { id: 'cua-trong-2l', code: 'CUA-TRONG', name: 'Cửa trong (khoét lộ aptomat)', group: 'cua', material: e.material, thickness: e.thickness, qty: 1 },
      { faceW: cov.w, faceH: cov.h, flanges: allSides([{ len: FLANGE, dir: 'UP' }]), bd, relief, holes },
    ),
  ];
}

/** Gân tăng cứng mặt sau cửa ngoài (thép U chấn 12-20-12), 2 thanh — tủ 2 lớp. */
export function doorStiffeners(p: Project, layout: EnclosureLayout, bd: number): Part[] {
  if (p.enclosure.doorType !== 'two_layer') return [];
  const door = layout.leaves[0];
  const L = door.rect.h - 120;
  const s = profileStrip(L, [
    { len: 12, dir: 'UP' },
    { len: 20, dir: 'UP' },
    { len: 12, dir: 'UP' },
  ], bd);
  const holes: Hole[] = [circle(20, s.width / 2, 5.5), circle(L - 20, s.width / 2, 5.5)];
  return [makePart({ id: 'gan-cua', code: 'GAN-CUA', name: 'Gân cửa', group: 'cua', material: p.enclosure.material, thickness: p.enclosure.thickness, qty: 2 }, { outline: s.outline, holes, bendLines: s.bendLines, bbox: { minX: 0, minY: 0, maxX: L, maxY: s.width } })];
}

export function hingeCount(h: number): number {
  return h <= 1000 ? 2 : h <= 1800 ? 3 : 4;
}

/** Cửa: gấp mép hồi 4 cạnh + lỗ bản lề + lỗ khoá + lỗ khoét thiết bị. */
export function doorPanel(p: Project, cat: Catalog, layout: EnclosureLayout, leaf: DoorLeaf, bd: number, relief: number): Part {
  const e = p.enclosure;
  const { w, h } = leaf.rect;
  const holes: Hole[] = [];
  // bản lề: 2 lỗ Ø6.5 mỗi bản lề
  const n = hingeCount(h);
  const hx = leaf.hinge === 'left' ? 22 : w - 22;
  for (let i = 0; i < n; i++) {
    const cy = n === 1 ? h / 2 : 150 + ((h - 300) * i) / (n - 1);
    holes.push(circle(hx, cy - 15, 6.5), circle(hx, cy + 15, 6.5));
  }
  // khoá tay nắm Ø22
  if (leaf.hasLock) {
    const lx = lockX(leaf);
    const lock = e.lock ?? 'handle';
    // khoá tay nắm: lỗ chữ nhật 26×80; khoá vuông Ø22.5; khoá chìa Ø19
    if (lock === 'handle') holes.push(rectPoly(lx - 13, h / 2 - 40, 26, 80));
    else holes.push(circle(lx, h / 2, lock === 'square' ? 22.5 : 19));
  }
  // lỗ khoét thiết bị (đổi từ toạ độ thân tủ → toạ độ mặt cửa)
  if (leaf.carriesCutouts) {
    for (const pd of p.devices) {
      if (e.doorType === 'two_layer' && pd.mount === 'plate') continue;
      const def = cat.devices.find((d) => d.id === pd.deviceId);
      if (!def) continue;
      const cut = deviceCutout(pd, def);
      if (!cut) continue;
      const cx = cut.kind === 'circle' ? cut.cx : (cut.pts[0].x + cut.pts[2].x) / 2;
      const owner = layout.leaves.find((l) => l.carriesCutouts && cx >= l.rect.x && cx <= l.rect.x + l.rect.w);
      if (owner?.id !== leaf.id) continue;
      holes.push(translateHole(cut, -leaf.rect.x, -leaf.rect.y));
    }
  }
  const steps: FlangeStep[] = leaf.hem
    ? [
        { len: FLANGE, dir: 'UP' },
        { len: DOOR_RETURN, dir: 'UP' },
      ]
    : [{ len: FLANGE, dir: 'UP' }];
  return panelPart(
    { id: `cua-${leaf.id}`, code: doorCode(leaf), name: leaf.name, group: 'cua', material: e.material, thickness: e.thickness, qty: 1 },
    { faceW: w, faceH: h, flanges: allSides(steps), bd, relief, holes },
  );
}

function doorCode(leaf: DoorLeaf): string {
  return { single: 'CUA', left: 'CUA-T', right: 'CUA-P', inner: 'CUA-TRONG', outer: 'CUA-NGOAI' }[leaf.id];
}

/** Tấm đế lắp thiết bị: lỗ bắt vít theo thiết bị + 4 lỗ bắt tấm đế. */
export function mountingPlate(p: Project, cat: Catalog, layout: EnclosureLayout, bdOf: (t: number) => number, relief: number): Part {
  const e = p.enclosure;
  const t = Math.max(e.thickness, 2.0);
  const pl = layout.plate;
  const holes: Hole[] = [];
  for (const [x, y] of [
    [25, 25],
    [pl.w - 25, 25],
    [25, pl.h - 25],
    [pl.w - 25, pl.h - 25],
  ])
    holes.push(circle(x, y, 8));
  for (const pd of p.devices) {
    const def = cat.devices.find((d) => d.id === pd.deviceId);
    if (!def) continue;
    for (const hole of devicePlateHoles(pd, def)) holes.push(translateHole(hole, -pl.x, -pl.y));
  }
  return panelPart(
    { id: 'tam-de', code: 'TAM-DE', name: 'Tấm đế lắp thiết bị', group: 'tam-de', material: 'SPCC', thickness: t, qty: 1, note: 'Tôn mạ kẽm / SPCC' },
    { faceW: pl.w, faceH: pl.h, flanges: allSides([{ len: FLANGE, dir: 'UP' }]), bd: bdOf(t), relief, holes },
  );
}

/** Khung đế: thép U chấn (cánh 40 – bụng = chiều cao đế – cánh 40). */
export function baseFrameParts(p: Project, bdOf: (t: number) => number): Part[] {
  const e = p.enclosure;
  if (!e.base) return [];
  const t = 2.0;
  const bd = bdOf(t);
  const prof: FlangeStep[] = [
    { len: 40, dir: 'UP' },
    { len: e.base, dir: 'UP' },
    { len: 40, dir: 'UP' },
  ];
  const mk = (id: string, code: string, name: string, L: number): Part => {
    const s = profileStrip(L, prof, bd);
    const yc = s.segFlat[0] / 2;
    const holes: Hole[] = [circle(60, yc, 14), circle(L - 60, yc, 14)];
    // lỗ bulông liên kết thân tủ trên cánh trên
    const yt = s.width - s.segFlat[2] / 2;
    holes.push(circle(60, yt, 10.5), circle(L - 60, yt, 10.5));
    return makePart({ id, code, name, group: 'khung-de', material: 'SPCC', thickness: t, qty: 2 }, { outline: s.outline, holes, bendLines: s.bendLines, bbox: { minX: 0, minY: 0, maxX: L, maxY: s.width } });
  };
  return [mk('kd-ts', 'KD-TS', 'Khung đế trước/sau', e.W), mk('kd-hong', 'KD-HONG', 'Khung đế hông', e.D - 80)];
}

/** Thanh C đục lỗ (oblong dọc thân bụng) — khung lắp thiết bị cho tủ đặt sàn. */
export function cChannelParts(p: Project, bdOf: (t: number) => number): Part[] {
  const e = p.enclosure;
  if (e.mounting !== 'floor') return [];
  const t = 2.0;
  const L = e.H - 100;
  const prof: FlangeStep[] = [
    { len: 10, dir: 'UP' },
    { len: 25, dir: 'UP' },
    { len: 40, dir: 'UP' },
    { len: 25, dir: 'UP' },
    { len: 10, dir: 'UP' },
  ];
  const s = profileStrip(L, prof, bdOf(t));
  const yc = s.width / 2;
  const holes: Hole[] = [];
  const pitch = 25;
  const count = Math.floor((L - 40) / pitch);
  const x0 = (L - (count - 1) * pitch) / 2;
  for (let i = 0; i < count; i++) holes.push(oblong(x0 + i * pitch, yc, 14, 7));
  return [makePart({ id: 'thanh-c', code: 'THANH-C', name: 'Thanh C đục lỗ', group: 'thanh-c', material: 'SPCC', thickness: t, qty: 2 }, { outline: s.outline, holes, bendLines: s.bendLines, bbox: { minX: 0, minY: 0, maxX: L, maxY: s.width } })];
}

/** Thanh cái đồng: thẳng hoặc uốn Z, lỗ bulông 2 đầu + bước 100 mm. */
export function busbarParts(p: Project, cat: Catalog, layout: EnclosureLayout): Part[] {
  const b = p.busbar;
  const parts: Part[] = [];
  const L = layout.plate.w - 20;
  const groups: { id: string; code: string; name: string; w: number; qty: number }[] = [{ id: 'cb-pha', code: 'CB-PHA', name: 'Thanh cái pha L1-L3', w: b.w, qty: 3 }];
  if (b.phases !== '3P') groups.push({ id: 'cb-n', code: 'CB-N', name: 'Thanh cái trung tính N', w: b.w, qty: 1 });
  if (b.phases === '3P+N+PE') groups.push({ id: 'cb-pe', code: 'CB-PE', name: 'Thanh cái tiếp địa PE', w: Math.max(15, Math.round(b.w / 2)), qty: 1 });
  const bd = bendDeduction(cat.bend, 'copper', b.t);
  for (const g of groups) {
    const prof: FlangeStep[] =
      b.shape === 'Z'
        ? [
            { len: 80, dir: 'UP' },
            { len: 50, dir: 'UP' },
            { len: L - 80, dir: 'DOWN' },
          ]
        : [{ len: L, dir: 'UP' }];
    // Với thanh cái, chấn theo chiều dài → dựng dải rộng g.w, dài = trải phẳng; đường chấn cắt ngang
    const segFlat = prof.map((s, i) => s.len - (i > 0 ? bd / 2 : 0) - (i < prof.length - 1 ? bd / 2 : 0));
    const len = r2(segFlat.reduce((a, c) => a + c, 0));
    const bendLines: BendLine[] = [];
    let x = 0;
    for (let i = 0; i < prof.length - 1; i++) {
      x += segFlat[i];
      bendLines.push({ a: { x: r2(x), y: 0 }, b: { x: r2(x), y: g.w }, direction: prof[i + 1].dir, angle: 90 });
    }
    const hd = g.w >= 40 ? 13 : 11;
    const holes: Hole[] = [];
    const xs: number[] = [25, len - 25];
    for (let hx = 125; hx < len - 100; hx += 100) {
      if (!bendLines.some((bl) => Math.abs(bl.a.x - hx) < hd + 10)) xs.push(hx);
    }
    xs.sort((a, c) => a - c).forEach((hx) => holes.push(circle(hx, g.w / 2, hd)));
    parts.push(
      makePart(
        { id: g.id, code: g.code, name: g.name, group: 'thanh-cai', material: 'CU', thickness: b.t, qty: g.qty, nestable: false, note: `${g.w}×${b.t} ${b.shape === 'Z' ? 'uốn Z' : 'thẳng'}` },
        { outline: rectPoly(0, 0, len, g.w), holes, bendLines, bbox: { minX: 0, minY: 0, maxX: len, maxY: g.w } },
      ),
    );
  }
  return parts;
}

/** Sinh toàn bộ chi tiết của dự án. */
export function generateParts(p: Project, cat: Catalog): Part[] {
  const e = p.enclosure;
  const bdOf = (t: number): number => bendDeduction(cat.bend, 'steel', t);
  const bd = bdOf(e.thickness);
  const relief = r2(e.thickness + 1);
  const layout = computeLayout(e, p.busbar);
  const parts: Part[] = [
    sidePanel(p, bd, relief, 'T'),
    sidePanel(p, bd, relief, 'P'),
    backPanel(p, bd, relief),
    roofPanel(p, bd, relief),
    bottomPanel(p, bd, relief),
    ...layout.leaves.map((l) => doorPanel(p, cat, layout, l, bd, relief)),
    mountingPlate(p, cat, layout, bdOf, relief),
    ...baseFrameParts(p, bdOf),
    ...coverPanel(p, cat, layout, bd, relief),
    ...doorStiffeners(p, layout, bd),
    ...glandPlate(p),
    ...bracketParts(p, bdOf),
    ...cChannelParts(p, bdOf),
    ...busbarParts(p, cat, layout),
  ];
  return parts;
}

export function findDevice(cat: Catalog, id: string): DeviceDef | undefined {
  return cat.devices.find((d) => d.id === id);
}
