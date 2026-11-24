import { BusbarConfig, DeviceDef, EnclosureConfig, PlacedDevice } from './model';
import { Hole, Rect } from './types';
import { circle, rectPoly } from './math';

/**
 * BỐ CỤC MẶT TRƯỚC TỦ (toạ độ thân tủ: gốc ở góc dưới trái thân tủ, không tính khung đế, Y hướng lên).
 * Dùng chung cho canvas, bộ luật, sinh chi tiết, 3D và bản in.
 */

export const DOOR_GAP = 3; // khe hở cửa với thân tủ
export const INNER_DOOR_INSET = 40; // cửa trong thụt vào so với thân
export const SECTION_MARGIN = 10; // lề trong mỗi ngăn
export const PLATE_MARGIN = 15; // lề an toàn trên tấm đế
export const COVER_INSET = 30; // cửa trong (tủ 2 lớp) thụt vào so với thân

export interface DoorLeaf {
  id: 'single' | 'left' | 'right' | 'inner' | 'outer';
  name: string;
  rect: Rect;
  hinge: 'left' | 'right';
  /** Lá cửa có khoét lỗ thiết bị không. */
  carriesCutouts: boolean;
  /** Gấp mép hồi (2 đoạn) hay gấp mép đơn. */
  hem: boolean;
  hasLock: boolean;
}

export interface SectionBand {
  index: number;
  y0: number;
  y1: number;
  h: number;
}

export interface BusbarBar {
  phase: string;
  rect: Rect;
}

export interface EnclosureLayout {
  W: number;
  H: number;
  D: number;
  base: number;
  body: Rect;
  sections: SectionBand[];
  plate: Rect;
  leaves: DoorLeaf[];
  busbarZone: Rect | null;
  bars: BusbarBar[];
  /** Cửa trong của tủ 2 lớp (bản lề cạnh dưới). null nếu không có. */
  cover: Rect | null;
}

export function plateMarginFor(e: EnclosureConfig): number {
  return Math.min(e.W, e.H) <= 500 ? 40 : 50;
}

export function phaseList(phases: BusbarConfig['phases']): string[] {
  if (phases === '3P') return ['L1', 'L2', 'L3'];
  if (phases === '3P+N') return ['L1', 'L2', 'L3', 'N'];
  return ['L1', 'L2', 'L3', 'N', 'PE'];
}

/** Chuẩn hoá chiều cao ngăn: luôn đủ số ngăn, tổng = H. */
export function normalizeSections(e: EnclosureConfig): number[] {
  const n = Math.max(1, Math.round(e.sections));
  let hs = e.sectionHeights.slice(0, n).map((h) => Math.max(50, h || 0));
  if (hs.length !== n || Math.abs(hs.reduce((a, b) => a + b, 0) - e.H) > 0.5) {
    if (hs.length === n) {
      // giữ tỉ lệ, dồn phần dư vào ngăn cuối
      const sum = hs.slice(0, -1).reduce((a, b) => a + b, 0);
      const last = e.H - sum;
      if (last >= 50) return [...hs.slice(0, -1), last];
    }
    const each = Math.floor(e.H / n);
    hs = Array.from({ length: n }, (_, i) => (i === n - 1 ? e.H - each * (n - 1) : each));
  }
  return hs;
}

export function computeLayout(e: EnclosureConfig, busbar?: BusbarConfig): EnclosureLayout {
  const { W, H, D } = e;
  const hs = normalizeSections(e);
  const sections: SectionBand[] = [];
  let top = H;
  hs.forEach((h, i) => {
    sections.push({ index: i, y0: top - h, y1: top, h });
    top -= h;
  });

  const pm = plateMarginFor(e);
  const plate: Rect = { x: pm, y: pm, w: W - 2 * pm, h: H - 2 * pm };

  const g = DOOR_GAP;
  const leaves: DoorLeaf[] = [];
  const hinge = e.hinge ?? 'left';
  if (e.doorType === 'single') {
    leaves.push({ id: 'single', name: 'Cửa', rect: { x: g, y: g, w: W - 2 * g, h: H - 2 * g }, hinge, carriesCutouts: true, hem: true, hasLock: true });
  } else if (e.doorType === 'double') {
    const lw = (W - 3 * g) / 2;
    leaves.push({ id: 'left', name: 'Cửa trái', rect: { x: g, y: g, w: lw, h: H - 2 * g }, hinge: 'left', carriesCutouts: true, hem: true, hasLock: false });
    leaves.push({ id: 'right', name: 'Cửa phải', rect: { x: 2 * g + lw, y: g, w: lw, h: H - 2 * g }, hinge: 'right', carriesCutouts: true, hem: true, hasLock: true });
  } else if (e.doorType === 'two_layer') {
    // lớp ngoài: cửa gắn đồng hồ/đèn/relay; lớp trong: cửa trong (layout.cover)
    leaves.push({ id: 'outer', name: 'Cửa ngoài', rect: { x: g, y: g, w: W - 2 * g, h: H - 2 * g }, hinge, carriesCutouts: true, hem: true, hasLock: true });
  } else {
    const i = INNER_DOOR_INSET;
    leaves.push({ id: 'inner', name: 'Cửa trong', rect: { x: i, y: i, w: W - 2 * i, h: H - 2 * i }, hinge, carriesCutouts: true, hem: false, hasLock: false });
    leaves.push({ id: 'outer', name: 'Cửa ngoài', rect: { x: g, y: g, w: W - 2 * g, h: H - 2 * g }, hinge, carriesCutouts: false, hem: true, hasLock: true });
  }

  let busbarZone: Rect | null = null;
  const bars: BusbarBar[] = [];
  if (busbar) {
    const phases = phaseList(busbar.phases);
    const pitch = Math.max(busbar.w + 25, 50);
    const zoneH = phases.length * pitch;
    const x = plate.x + 10;
    const w = plate.w - 20;
    const y0 = busbar.position === 'top' ? plate.y + plate.h - PLATE_MARGIN - zoneH : plate.y + PLATE_MARGIN;
    busbarZone = { x, y: y0, w, h: zoneH };
    phases.forEach((ph, i) => {
      const bw = ph === 'PE' ? Math.max(15, Math.round(busbar.w / 2)) : busbar.w;
      const cy = y0 + zoneH - pitch * (i + 0.5);
      bars.push({ phase: ph, rect: { x, y: cy - bw / 2, w, h: bw } });
    });
  }

  const c = COVER_INSET;
  const cover = e.doorType === 'two_layer' ? { x: c, y: c, w: W - 2 * c, h: H - 2 * c } : null;
  return { W, H, D, base: e.base, body: { x: 0, y: 0, w: W, h: H }, sections, plate, leaves, busbarZone, bars, cover };
}

/** Kích thước thiết bị sau khi xoay (nhìn từ mặt trước). */
export function deviceFootprint(def: DeviceDef, rot: 0 | 90): { w: number; h: number } {
  return rot === 90 ? { w: def.size.h, h: def.size.w } : { w: def.size.w, h: def.size.h };
}

export function deviceRect(pd: PlacedDevice, def: DeviceDef): Rect {
  const f = deviceFootprint(def, pd.rot);
  return { x: pd.x, y: pd.y, w: f.w, h: f.h };
}

/** Xoay toạ độ cục bộ (u, v) của thiết bị 90° ngược chiều kim đồng hồ: (u, v) → (h − v, u). */
export function rotateLocal(u: number, v: number, def: DeviceDef, rot: 0 | 90): { x: number; y: number } {
  if (rot === 0) return { x: u, y: v };
  return { x: def.size.h - v, y: u };
}

/** Lỗ khoét cửa của thiết bị theo toạ độ thân tủ (null nếu không khoét). */
export function deviceCutout(pd: PlacedDevice, def: DeviceDef): Hole | null {
  const wantCut = pd.mount === 'door' || pd.doorCutout;
  if (!wantCut) return null;
  const r = deviceRect(pd, def);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const c = def.doorCutout;
  if (!c) {
    if (pd.mount !== 'door') return null;
    return rectPoly(cx - (r.w - 4) / 2, cy - (r.h - 4) / 2, r.w - 4, r.h - 4, pd.uid);
  }
  if (c.shape === 'circle') return circle(cx, cy, c.d, pd.uid);
  const cw = pd.rot === 90 ? c.h : c.w;
  const ch = pd.rot === 90 ? c.w : c.h;
  return rectPoly(cx - cw / 2, cy - ch / 2, cw, ch, pd.uid);
}

/** Lỗ bắt vít trên tấm đế theo toạ độ thân tủ. */
export function devicePlateHoles(pd: PlacedDevice, def: DeviceDef): Hole[] {
  if (pd.mount !== 'plate') return [];
  return def.plateHoles.map((h) => {
    const p = rotateLocal(h.x, h.y, def, pd.rot);
    return circle(pd.x + p.x, pd.y + p.y, h.d, pd.uid);
  });
}

export function sectionAt(layout: EnclosureLayout, y: number): SectionBand | undefined {
  return layout.sections.find((s) => y >= s.y0 && y <= s.y1);
}

export function leafAt(layout: EnclosureLayout, x: number, y: number): DoorLeaf | undefined {
  return layout.leaves.find(
    (l) => l.carriesCutouts && x >= l.rect.x && x <= l.rect.x + l.rect.w && y >= l.rect.y && y <= l.rect.y + l.rect.h,
  );
}

/** Toạ độ X (trong lá cửa) của khoá: luôn ở phía đối diện bản lề. */
export function lockX(leaf: DoorLeaf): number {
  return leaf.hinge === 'left' ? leaf.rect.w - 35 : 35;
}
