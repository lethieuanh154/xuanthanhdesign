import { Catalog, DeviceDef, DeviceType, PlacedDevice, Project } from './model';
import { Rect } from './types';
import { r2, rectGap, rectInside, rectsIntersect } from './math';
import { deviceRect, EnclosureLayout } from './layout';

/**
 * CỬA TRONG CỦA TỦ 2 LỚP.
 * Giống kiểu "cửa trong + ngoài", nhưng cánh trong không gắn thiết bị mà khoét các ô chữ nhật
 * để lộ cần gạt / mặt aptomat; bản lề cùng phía với cửa ngoài.
 * Ô khoét sinh tự động theo thiết bị trên tấm đế; các ô sát nhau (< 8 mm) được gộp thành 1 ô
 * — đúng như thực tế xưởng hay khoét 1 ô dài cho cả hàng MCB / 2 MCCB xếp chồng.
 */

export const COVER_WINDOW_MERGE_GAP = 8;
export const COVER_EDGE_MIN = 20;
/** Thiết bị không cần lộ ra cửa trong (nằm hẳn sau cửa trong). */
const HIDDEN: DeviceType[] = ['CT', 'CAPACITOR'];
/** Chiều cao phần mặt nhô ra của thiết bị ray DIN (MCB, cầu chì, relay…). */
const DIN_FACE_H = 48;

export interface CoverWindow {
  rect: Rect;
  /** Thiết bị lộ ra qua ô này. */
  uids: string[];
}

/** Ô khoét cho 1 thiết bị (toạ độ thân tủ). */
export function deviceWindow(pd: PlacedDevice, def: DeviceDef): Rect | null {
  if (pd.mount !== 'plate' || HIDDEN.includes(def.type)) return null;
  const r = deviceRect(pd, def);
  const cx = r.x + r.w / 2,
    cy = r.y + r.h / 2;
  let w: number, h: number;
  if (def.doorCutout?.shape === 'rect') {
    // aptomat: ô lộ mặt + cần gạt (kích thước lỗ khoét cửa trong thư viện)
    w = pd.rot === 90 ? def.doorCutout.h : def.doorCutout.w;
    h = pd.rot === 90 ? def.doorCutout.w : def.doorCutout.h;
  } else {
    // thiết bị ray DIN: lộ phần mặt nhô cao ~48 mm, rộng hơn thân 2 mm mỗi bên
    w = r.w + 4;
    h = Math.min(r.h - 10, DIN_FACE_H);
    if (pd.rot === 90) [w, h] = [Math.min(r.w - 10, DIN_FACE_H), r.h + 4];
  }
  return { x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h) };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Danh sách ô khoét cửa trong (đã gộp các ô sát nhau). */
export function coverWindows(p: Project, cat: Catalog): CoverWindow[] {
  if (p.enclosure.doorType !== 'two_layer') return [];
  let list: CoverWindow[] = [];
  for (const pd of p.devices) {
    const def = cat.devices.find((d) => d.id === pd.deviceId);
    const r = def && deviceWindow(pd, def);
    if (r) list.push({ rect: r, uids: [pd.uid] });
  }
  // gộp lặp đến khi không còn cặp nào chồng/sát nhau
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].rect,
          b = list[j].rect;
        if (rectsIntersect(a, b) || rectGap(a, b) < COVER_WINDOW_MERGE_GAP) {
          const m: CoverWindow = { rect: union(a, b), uids: [...list[i].uids, ...list[j].uids] };
          list = [...list.filter((_, k) => k !== i && k !== j), m];
          merged = true;
          break outer;
        }
      }
    }
  }
  return list.map((w) => ({ ...w, rect: { x: r2(w.rect.x), y: r2(w.rect.y), w: r2(w.rect.w), h: r2(w.rect.h) } }));
}

/** Ô khoét phải nằm trong cửa trong, cách mép ≥ 20 mm (chừa gấp mép và bản lề). */
export function coverWindowProblems(p: Project, cat: Catalog, layout: EnclosureLayout): { uids: string[]; msg: string }[] {
  const cov = layout.cover;
  if (!cov) return [];
  const out: { uids: string[]; msg: string }[] = [];
  for (const w of coverWindows(p, cat)) {
    if (!rectInside(w.rect, cov, COVER_EDGE_MIN)) {
      const names = w.uids
        .map((u) => {
          const pd = p.devices.find((d) => d.uid === u);
          return pd ? (pd.label ?? cat.devices.find((d) => d.id === pd.deviceId)?.model ?? '') : '';
        })
        .join(', ');
      out.push({ uids: w.uids, msg: `Ô khoét cửa trong cho ${names} cách mép cửa trong < ${COVER_EDGE_MIN} mm` });
    }
  }
  return out;
}
