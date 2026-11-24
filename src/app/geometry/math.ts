import { BBox, Circle, Hole, Part, Polyline, Pt, Rect } from './types';

const EPS = 1e-6;

/** Làm tròn 2 chữ số thập phân (tránh số rác 0.30000000004 khi xuất). */
export const r2 = (v: number): number => Math.round(v * 100) / 100;

export function rectPoly(x: number, y: number, w: number, h: number, ref?: string): Polyline {
  return {
    kind: 'poly',
    closed: true,
    pts: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    ref,
  };
}

export function circle(cx: number, cy: number, d: number, ref?: string): Circle {
  return { kind: 'circle', cx, cy, r: d / 2, ref };
}

/**
 * Lỗ oblong (hình chữ nhật bo 2 đầu tròn).
 * len = tổng chiều dài (kể cả 2 đầu tròn), width = bề rộng = đường kính đầu tròn.
 * Hai đầu dùng bulge = 1 (nửa đường tròn) → DXF chỉ có 1 POLYLINE khép kín, không SPLINE.
 */
export function oblong(cx: number, cy: number, len: number, width: number, vertical = false): Polyline {
  const r = width / 2;
  const half = Math.max(0, len / 2 - r);
  if (!vertical) {
    return {
      kind: 'poly',
      closed: true,
      pts: [
        { x: cx - half, y: cy - r },
        { x: cx + half, y: cy - r },
        { x: cx + half, y: cy + r },
        { x: cx - half, y: cy + r },
      ],
      bulges: [0, 1, 0, 1],
    };
  }
  return {
    kind: 'poly',
    closed: true,
    pts: [
      { x: cx + r, y: cy - half },
      { x: cx + r, y: cy + half },
      { x: cx - r, y: cy + half },
      { x: cx - r, y: cy - half },
    ],
    bulges: [0, 1, 0, 1],
  };
}

export function bboxOfPoints(pts: Pt[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function holeBBox(h: Hole): BBox {
  if (h.kind === 'circle') {
    return { minX: h.cx - h.r, minY: h.cy - h.r, maxX: h.cx + h.r, maxY: h.cy + h.r };
  }
  return bboxOfPoints(tessellate(h));
}

export const bboxW = (b: BBox): number => b.maxX - b.minX;
export const bboxH = (b: BBox): number => b.maxY - b.minY;

export function rectToBBox(r: Rect): BBox {
  return { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h };
}

/**
 * Rải cung bulge thành các điểm (để vẽ lên canvas / tính diện tích).
 * Công thức: góc cung θ = 4·atan(bulge); bán kính R = c / (2·sin(θ/2)) với c = dây cung;
 * tâm nằm trên pháp tuyến trái của dây cung, cách trung điểm h = R·cos(θ/2).
 */
export function tessellate(poly: Polyline, segPerArc = 16): Pt[] {
  const out: Pt[] = [];
  const n = poly.pts.length;
  const segCount = poly.closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p1 = poly.pts[i];
    const p2 = poly.pts[(i + 1) % n];
    const b = poly.bulges?.[i] ?? 0;
    out.push(p1);
    if (Math.abs(b) < EPS) continue;
    const theta = 4 * Math.atan(b);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const c = Math.hypot(dx, dy);
    if (c < EPS) continue;
    const R = c / (2 * Math.sin(theta / 2));
    const hOff = R * Math.cos(theta / 2);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const cx = mx + (-dy / c) * hOff;
    const cy = my + (dx / c) * hOff;
    const a1 = Math.atan2(p1.y - cy, p1.x - cx);
    const rad = Math.abs(R);
    for (let k = 1; k < segPerArc; k++) {
      const a = a1 + (theta * k) / segPerArc;
      out.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    }
  }
  if (!poly.closed && n > 0) out.push(poly.pts[n - 1]);
  return out;
}

/** Diện tích đa giác (công thức Shoelace), luôn dương. */
export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function holeArea(h: Hole): number {
  return h.kind === 'circle' ? Math.PI * h.r * h.r : polygonArea(tessellate(h));
}

/** Diện tích tôn thực (biên dạng trừ lỗ), mm². */
export function partNetArea(p: Part): number {
  return polygonArea(tessellate(p.outline)) - p.holes.reduce((s, h) => s + holeArea(h), 0);
}

/** Bỏ điểm trùng liên tiếp và điểm thẳng hàng ở giữa (chỉ áp dụng cho đa tuyến không có bulge). */
export function cleanPoints(pts: Pt[], closed = true): Pt[] {
  let res: Pt[] = [];
  for (const p of pts) {
    const last = res[res.length - 1];
    if (!last || Math.abs(last.x - p.x) > EPS || Math.abs(last.y - p.y) > EPS) res.push({ x: r2(p.x), y: r2(p.y) });
  }
  if (closed && res.length > 1) {
    const f = res[0];
    const l = res[res.length - 1];
    if (Math.abs(f.x - l.x) < EPS && Math.abs(f.y - l.y) < EPS) res.pop();
  }
  // loại điểm thẳng hàng
  let changed = true;
  while (changed && res.length > 3) {
    changed = false;
    const next: Pt[] = [];
    const n = res.length;
    for (let i = 0; i < n; i++) {
      const a = res[(i - 1 + n) % n];
      const b = res[i];
      const c = res[(i + 1) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(cross) < 1e-4 && dot > 0 && (closed || (i > 0 && i < n - 1))) {
        changed = true;
        continue;
      }
      next.push(b);
    }
    res = next;
  }
  return res;
}

export function translatePt(p: Pt, dx: number, dy: number): Pt {
  return { x: r2(p.x + dx), y: r2(p.y + dy) };
}

export function translateHole(h: Hole, dx: number, dy: number): Hole {
  if (h.kind === 'circle') return { ...h, cx: r2(h.cx + dx), cy: r2(h.cy + dy) };
  return { ...h, pts: h.pts.map((p) => translatePt(p, dx, dy)) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

/** Khoảng hở nhỏ nhất giữa 2 hình chữ nhật (0 nếu chạm/chồng). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

export function rectInside(inner: Rect, outer: Rect, margin = 0): boolean {
  return (
    inner.x >= outer.x + margin - EPS &&
    inner.y >= outer.y + margin - EPS &&
    inner.x + inner.w <= outer.x + outer.w - margin + EPS &&
    inner.y + inner.h <= outer.y + outer.h - margin + EPS
  );
}

export function bboxIntersect(a: BBox, b: BBox): boolean {
  return a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minY < b.maxY - EPS && b.minY < a.maxY - EPS;
}

/** Đoạn thẳng AB có cắt (đi xuyên) bbox không — dùng kiểm tra lỗ khoét cắt đường chấn. */
export function segmentHitsBBox(a: Pt, b: Pt, box: BBox): boolean {
  // Liang–Barsky clipping
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const checks: [number, number][] = [
    [-dx, a.x - box.minX],
    [dx, box.maxX - a.x],
    [-dy, a.y - box.minY],
    [dy, box.maxY - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < EPS) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > EPS;
}

/** Bỏ dấu tiếng Việt → ASCII (dùng cho tên file và chữ trong DXF R12). */
export function removeDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function slug(s: string): string {
  return removeDiacritics(s)
    .trim()
    .replace(/[^A-Za-z0-9.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
