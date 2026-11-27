import { BBox, Pt } from './types';
import { bboxOfPoints, polygonArea, tessellate } from './math';

/**
 * NHẬP DXF BẢN VẼ CHI TIẾT → danh sách chi tiết (biên dạng ngoài + lỗ) để sắp tôn.
 * TypeScript thuần. Đầu vào là object do thư viện `dxf-parser` trả về (`parseSync`).
 *
 * Hai bước (tách ra để đổi tuỳ chọn không phải đọc lại file):
 *  1. `explodeDxf`  — bung toàn bộ entity (kể cả block INSERT lồng nhau, mảng, lật OCS) thành các đường
 *                     gấp khúc trong toạ độ thế giới (mm). Cung / ellipse / spline được rải thành điểm.
 *                     Đơn vị theo $INSUNITS, có tự đoán khi header ghi inch mà bản vẽ thực ra là mm.
 *  2. `detectParts` — gom các nét chạm nhau (kể cả chạm chữ T, chồng nét) thành nhóm; nhóm nằm gọn trong
 *                     nhóm khác (lỗ, ký hiệu trong lỗ) gộp vào nhóm đó; nhóm ngoài cùng = chi tiết.
 *                     Biên dạng = vòng kín lớn nhất nếu trùng hình bao, nếu không thì bao lồi.
 *
 * Chi tiết đặt sát nhau dùng chung đường cắt (bản vẽ đã sắp sẵn) sẽ thành 1 nhóm — `packRects` nhận ra
 * nhóm cỡ bằng khổ tôn và đặt nguyên cả tấm.
 */

// ───────────── kiểu dữ liệu tối thiểu của dxf-parser (chỉ khai báo trường dùng tới) ─────────────

interface V3 {
  x: number;
  y: number;
  z?: number;
}

export interface DxfEntityLike {
  type: string;
  layer?: string;
  inPaperSpace?: boolean;
  colorIndex?: number;
  color?: number;
  vertices?: (V3 & { bulge?: number })[];
  shape?: boolean;
  closed?: boolean;
  center?: V3;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  majorAxisEndPoint?: V3;
  axisRatio?: number;
  name?: string;
  position?: V3;
  xScale?: number;
  yScale?: number;
  rotation?: number;
  columnCount?: number;
  rowCount?: number;
  columnSpacing?: number;
  rowSpacing?: number;
  extrusionDirection?: V3;
  controlPoints?: V3[];
  fitPoints?: V3[];
  knotValues?: number[];
  degreeOfSplineCurve?: number;
  is3dPolygonMesh?: boolean;
  isPolyfaceMesh?: boolean;
}

export interface DxfDocLike {
  header?: Record<string, unknown>;
  tables?: Record<string, { layers?: Record<string, { name?: string; color?: number; visible?: boolean; frozen?: boolean }> } | undefined>;
  blocks?: Record<string, { position?: V3; entities?: DxfEntityLike[] }>;
  entities: DxfEntityLike[];
}

// ───────────── kết quả ─────────────

/** Một đường gấp khúc sau khi bung (toạ độ thế giới, mm). */
export interface RawPath {
  pts: Pt[];
  closed: boolean;
  layer: string;
  /** Màu hiển thị #rrggbb (màu entity, hoặc màu layer nếu BYLAYER). */
  color: string;
}

export interface LayerInfo {
  name: string;
  color: string;
  /** Số đường (sau khi bung block). */
  count: number;
  /** Layer đang bật và không bị đóng băng trong bản vẽ gốc. */
  visible: boolean;
}

export interface ExplodedDxf {
  paths: RawPath[];
  layers: LayerInfo[];
  extents: BBox;
  /** Số entity bỏ qua theo loại (TEXT, DIMENSION, HATCH…). */
  skipped: Record<string, number>;
  /** Hệ số đơn vị bản vẽ → mm đã dùng (không gồm `scale` người dùng nhân thêm). */
  unitScale: number;
  /** Hệ số theo $INSUNITS trong header (để hiển thị). */
  headerUnitScale: number;
  /** Ghi chú khi tự đoán đơn vị khác header (ví dụ header ghi inch nhưng kích thước là mm). */
  unitNote: string;
}

export interface ExplodeOptions {
  /** Hệ số đơn vị → mm do người dùng chọn; bỏ trống = tự động. */
  unitScale?: number;
  /** Nhân thêm (bản vẽ vẽ theo tỉ lệ, ví dụ 1:10 → 10). */
  scale?: number;
}

export interface ImportedPart {
  id: string;
  /** Mã hiển thị: CT01, CT02… đánh theo vị trí trong bản vẽ (trên → dưới, trái → phải). */
  code: string;
  layer: string;
  /** Kích thước bao (mm). */
  w: number;
  h: number;
  /** Toạ độ CỤC BỘ: gốc ở góc dưới trái hình bao, trục Y hướng lên. */
  outline: Pt[];
  /**
   * true = biên dạng là vòng kín thật của bản vẽ; false = biên dạng hở / chạm chữ T / chồng nét →
   * `outline` là bao lồi (chỉ dùng để tính diện tích, chọn), hình thật nằm trong `cuts`.
   */
  outlineExact: boolean;
  /** Lỗ kín (vòng kín nằm trong biên dạng) — trừ diện tích. */
  holes: Pt[][];
  holeColors: string[];
  /** Các nét cắt còn lại của chi tiết (biên dạng hở, nét nối chữ T, ký hiệu trong lỗ…). */
  cuts: { pts: Pt[]; closed: boolean; color: string }[];
  /** Nét layer "Hiện" nằm trong chi tiết (đường chấn…) — chỉ để vẽ, màu mờ. */
  lines: { pts: Pt[]; color: string }[];
  color: string;
  /** Diện tích tôn thực ≈ biên dạng − lỗ (mm²). */
  area: number;
  /** Hình bao trong bản vẽ gốc (toạ độ thế giới). */
  world: BBox;
}

export interface DetectOptions {
  /** Layer dùng để nhận dạng biên dạng cắt. */
  cutLayers: ReadonlySet<string>;
  /** Layer chỉ để hiện (đường chấn, ký hiệu) — vẽ nếu nằm trong chi tiết. */
  showLayers: ReadonlySet<string>;
  /** Dung sai: 2 nét cách nhau ≤ giá trị này coi là chạm nhau (mm). */
  tol: number;
  /** Chi tiết có cạnh bao nhỏ hơn giá trị này bị bỏ (chữ vẽ bằng nét, ký hiệu…). */
  minSize: number;
}

export interface DetectResult {
  parts: ImportedPart[];
  /** Nét trên layer cắt bị bỏ: nhóm quá nhỏ hoặc chỉ là đường thẳng lẻ (toạ độ thế giới). */
  ignored: Pt[][];
  /** Số chi tiết có biên dạng hở (dùng bao lồi). */
  approxCount: number;
}

// ───────────── ma trận afin 2D: x' = a·x + c·y + e ; y' = b·x + d·y + f ─────────────

type M = [number, number, number, number, number, number];
const IDENT: M = [1, 0, 0, 1, 0, 0];
/** m ∘ n (áp n trước rồi tới m). */
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, p: { x: number; y: number }): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const translate = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const scaleM = (sx: number, sy: number): M => [sx, 0, 0, sy, 0, 0];
const rotateM = (rad: number): M => [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
/** Hệ toạ độ đối tượng (OCS) với pháp tuyến (0,0,-1) = lật trục X (entity bị mirror trong AutoCAD). */
const ocs = (e: DxfEntityLike): M => ((e.extrusionDirection?.z ?? 1) < 0 ? [-1, 0, 0, 1, 0, 0] : IDENT);

// ───────────── màu ─────────────

const hex = (rgb: number | undefined, fallback = '#ffffff'): string =>
  rgb === undefined || rgb === null || Number.isNaN(rgb) ? fallback : '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');

// ───────────── rải cung / ellipse / spline ─────────────

/** Số đoạn cho cung bán kính r, góc quét sweep: sai số dây cung ≤ 0,1 mm, tối thiểu 4, tối đa 180. */
function arcSegments(r: number, sweep: number): number {
  const step = r > 0.1 ? 2 * Math.acos(Math.max(-1, 1 - 0.1 / r)) : Math.PI / 4;
  return Math.max(4, Math.min(180, Math.ceil(Math.abs(sweep) / Math.max(step, Math.PI / 90))));
}

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = arcSegments(r, sweep);
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Điểm trên B-spline (thuật toán de Boor, bỏ qua trọng số). */
function splinePoints(ctrl: V3[], degree: number, knots: number[]): Pt[] {
  const n = ctrl.length;
  if (n < 2) return ctrl.map((p) => ({ x: p.x, y: p.y }));
  const p = Math.min(degree, n - 1);
  const U = knots.length === n + p + 1 ? knots : uniformClampedKnots(n, p);
  const t0 = U[p],
    t1 = U[n];
  const samples = Math.max(16, n * 8);
  const out: Pt[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = s === samples ? t1 - 1e-9 * (t1 - t0) : t0 + ((t1 - t0) * s) / samples;
    let k = p;
    while (k < n - 1 && t >= U[k + 1]) k++;
    const d = Array.from({ length: p + 1 }, (_, j) => ({ x: ctrl[j + k - p].x, y: ctrl[j + k - p].y }));
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const den = U[j + 1 + k - r] - U[j + k - p];
        const alpha = den === 0 ? 0 : (t - U[j + k - p]) / den;
        d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
      }
    }
    out.push(d[p]);
  }
  return out;
}

function uniformClampedKnots(n: number, p: number): number[] {
  const m = n + p + 1;
  return Array.from({ length: m }, (_, i) => (i <= p ? 0 : i >= n ? 1 : (i - p) / (n - p)));
}

// ───────────── bước 1: bung entity ─────────────

/** $INSUNITS → hệ số ra mm. 0 (không đơn vị) coi là mm. */
export function insUnitsToMm(code: unknown): number {
  const table: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0000254, 9: 0.0254, 10: 914.4, 14: 100 };
  return typeof code === 'number' ? (table[code] ?? 1) : 1;
}

/**
 * Đoán hệ số đơn vị → mm. Nhiều file xuất từ template mặc định ghi $INSUNITS = inch (1) nhưng
 * thực tế vẽ bằng mm: khi đổi theo header mà bản vẽ dài quá 30 m trong khi số đo gốc nằm trong
 * khoảng hợp lý của mm (200 … 30 000) → coi là mm.
 */
export function guessUnitScale(headerScale: number, rawMaxDim: number): { scale: number; note: string } {
  if (headerScale !== 1 && rawMaxDim * headerScale > 30000 && rawMaxDim >= 200 && rawMaxDim <= 30000) {
    return { scale: 1, note: `Header ghi đơn vị ×${headerScale} nhưng kích thước giống mm (bản vẽ ${Math.round(rawMaxDim)} đơn vị) → dùng mm.` };
  }
  return { scale: headerScale, note: '' };
}

/** Bung toàn bộ entity model space thành đường gấp khúc (mm). */
export function explodeDxf(doc: DxfDocLike, opt: ExplodeOptions = {}): ExplodedDxf {
  const headerUnitScale = insUnitsToMm(doc.header?.['$INSUNITS']);
  const layerTable = doc.tables?.['layer']?.layers ?? {};
  const paths: RawPath[] = [];
  const skipped: Record<string, number> = {};
  const counts = new Map<string, number>();

  const layerColor = (name: string): string => hex(layerTable[name]?.color);
  const push = (pts: Pt[], closed: boolean, layer: string, color: string): void => {
    if (pts.length < 2) return;
    paths.push({ pts, closed, layer, color });
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  };

  const walk = (ents: DxfEntityLike[], m: M, parentLayer: string | null, parentColor: string | null, depth: number): void => {
    if (depth > 12) return; // chống block tự tham chiếu
    for (const e of ents) {
      if (e.inPaperSpace) continue;
      // entity trong block ở layer "0" / màu BYBLOCK thừa hưởng từ INSERT
      const layer = (e.layer === '0' || !e.layer) && parentLayer ? parentLayer : (e.layer ?? '0');
      const ci = e.colorIndex;
      const color = ci === undefined || ci === 256 ? layerColor(layer) : ci === 0 ? (parentColor ?? layerColor(layer)) : hex(e.color, layerColor(layer));
      const t = mul(m, ocs(e));
      const P = (q: { x: number; y: number }): Pt => apply(t, q);

      switch (e.type) {
        case 'LINE': {
          const v = e.vertices ?? [];
          if (v.length >= 2) push([P(v[0]), P(v[1])], false, layer, color);
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          if (e.is3dPolygonMesh || e.isPolyfaceMesh) {
            skipped[e.type] = (skipped[e.type] ?? 0) + 1;
            break;
          }
          const v = e.vertices ?? [];
          if (v.length < 2) break;
          const closed = !!e.shape;
          const local = tessellate({ kind: 'poly', closed, pts: v.map((q) => ({ x: q.x, y: q.y })), bulges: v.map((q) => q.bulge ?? 0) }, 24);
          push(local.map(P), closed, layer, color);
          break;
        }
        case 'CIRCLE':
        case 'ARC': {
          if (!e.center || !e.radius) break;
          const full = e.type === 'CIRCLE';
          const pts = full ? arcPoints(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI).slice(0, -1) : arcPoints(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? 0);
          push(pts.map(P), full, layer, color);
          break;
        }
        case 'ELLIPSE': {
          if (!e.center || !e.majorAxisEndPoint) break;
          const mx = e.majorAxisEndPoint.x,
            my = e.majorAxisEndPoint.y;
          const ratio = e.axisRatio ?? 1;
          let a0 = e.startAngle ?? 0,
            a1 = e.endAngle ?? 2 * Math.PI;
          while (a1 <= a0) a1 += 2 * Math.PI;
          const full = Math.abs(a1 - a0 - 2 * Math.PI) < 1e-6;
          const n = arcSegments(Math.hypot(mx, my), a1 - a0);
          const pts: Pt[] = [];
          for (let i = 0; i <= n; i++) {
            const a = a0 + ((a1 - a0) * i) / n;
            pts.push({ x: e.center.x + Math.cos(a) * mx - Math.sin(a) * ratio * my, y: e.center.y + Math.cos(a) * my + Math.sin(a) * ratio * mx });
          }
          if (full) pts.pop();
          push(pts.map(P), full, layer, color);
          break;
        }
        case 'SPLINE': {
          const ctrl = e.controlPoints ?? [];
          const fit = e.fitPoints ?? [];
          const pts = ctrl.length >= 2 ? splinePoints(ctrl, e.degreeOfSplineCurve ?? 3, e.knotValues ?? []) : fit.map((q) => ({ x: q.x, y: q.y }));
          if (pts.length < 2) break;
          const closed = !!e.closed || Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;
          if (closed) pts.pop();
          push(pts.map(P), closed, layer, color);
          break;
        }
        case 'INSERT': {
          const blk = e.name ? doc.blocks?.[e.name] : undefined;
          if (!blk?.entities?.length) break;
          const base = blk.position ?? { x: 0, y: 0 };
          const pos = e.position ?? { x: 0, y: 0 };
          const rot = ((e.rotation ?? 0) * Math.PI) / 180;
          const sx = e.xScale ?? 1,
            sy = e.yScale ?? 1;
          const cols = Math.max(1, e.columnCount ?? 1),
            rows = Math.max(1, e.rowCount ?? 1);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              // mảng (MINSERT): bước cột/hàng tính trong hệ đã xoay
              const off = apply(rotateM(rot), { x: c * (e.columnSpacing ?? 0), y: r * (e.rowSpacing ?? 0) });
              const local = mul(translate(pos.x + off.x, pos.y + off.y), mul(rotateM(rot), mul(scaleM(sx, sy), translate(-base.x, -base.y))));
              walk(blk.entities, mul(t, local), layer, color, depth + 1);
            }
          }
          break;
        }
        default:
          // TEXT, MTEXT, DIMENSION, HATCH, SOLID, POINT… không phải biên dạng cắt
          skipped[e.type] = (skipped[e.type] ?? 0) + 1;
      }
    }
  };

  walk(doc.entities ?? [], IDENT, null, null, 0);

  const layers: LayerInfo[] = [...counts.entries()]
    .map(([name, count]) => ({ name, count, color: layerColor(name), visible: layerTable[name] ? layerTable[name].visible !== false && !layerTable[name].frozen : true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  let ext = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of paths)
    for (const q of p.pts) {
      if (q.x < ext.minX) ext.minX = q.x;
      if (q.y < ext.minY) ext.minY = q.y;
      if (q.x > ext.maxX) ext.maxX = q.x;
      if (q.y > ext.maxY) ext.maxY = q.y;
    }
  if (!paths.length) ext = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  // đơn vị: người dùng chọn > tự đoán từ header + độ lớn bản vẽ
  const guess = guessUnitScale(headerUnitScale, Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY));
  const unitScale = opt.unitScale ?? guess.scale;
  const k = unitScale * (opt.scale ?? 1);
  if (k !== 1) {
    for (const p of paths) p.pts = p.pts.map((q) => ({ x: q.x * k, y: q.y * k }));
    ext = { minX: ext.minX * k, minY: ext.minY * k, maxX: ext.maxX * k, maxY: ext.maxY * k };
  }
  return { paths, layers, extents: ext, skipped, unitScale, headerUnitScale, unitNote: opt.unitScale === undefined ? guess.note : '' };
}

// ───────────── bước 2: nối nét, dựng cây vòng, tách chi tiết ─────────────

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Bỏ nét trùng nhau hoàn toàn (vẽ đè 2 lần — rất hay gặp, làm hỏng việc nối nét). */
function dedupe(paths: RawPath[]): RawPath[] {
  const seen = new Set<string>();
  const out: RawPath[] = [];
  for (const p of paths) {
    const fwd = p.pts.map((q) => `${Math.round(q.x * 100)},${Math.round(q.y * 100)}`);
    const a = fwd.join(';');
    const b = [...fwd].reverse().join(';');
    const key = (p.closed ? 'c' : 'o') + (a < b ? a : b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Nối các nét hở có đầu mút trùng nhau (trong dung sai) thành chuỗi; chuỗi quay về điểm đầu = vòng kín.
 * Dùng lưới băm theo ô cỡ `tol` để tìm đầu mút lân cận nhanh.
 */
function chainPaths(open: RawPath[], tol: number): { loops: RawPath[]; rest: RawPath[] } {
  const cell = Math.max(tol, 1e-6);
  const key = (x: number, y: number): string => `${Math.floor(x / cell)}|${Math.floor(y / cell)}`;
  const grid = new Map<string, { i: number; end: 0 | 1 }[]>();
  open.forEach((p, i) => {
    for (const end of [0, 1] as const) {
      const q = end === 0 ? p.pts[0] : p.pts[p.pts.length - 1];
      const k = key(q.x, q.y);
      grid.set(k, [...(grid.get(k) ?? []), { i, end }]);
    }
  });
  const used = new Array<boolean>(open.length).fill(false);
  const findNext = (q: Pt): { i: number; end: 0 | 1 } | null => {
    const cx = Math.floor(q.x / cell),
      cy = Math.floor(q.y / cell);
    let best: { i: number; end: 0 | 1 } | null = null,
      bestD = tol;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const c of grid.get(`${cx + dx}|${cy + dy}`) ?? []) {
          if (used[c.i]) continue;
          const p = open[c.i].pts;
          const d = dist(q, c.end === 0 ? p[0] : p[p.length - 1]);
          if (d <= bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    return best;
  };

  const loops: RawPath[] = [];
  const rest: RawPath[] = [];
  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = [...open[i].pts];
    const closedNow = (): boolean => chain.length > 2 && dist(chain[0], chain[chain.length - 1]) <= tol;
    // kéo dài về phía cuối
    while (!closedNow()) {
      const nx = findNext(chain[chain.length - 1]);
      if (!nx) break;
      used[nx.i] = true;
      const seg = nx.end === 0 ? open[nx.i].pts : [...open[nx.i].pts].reverse();
      chain.push(...seg.slice(1));
    }
    // kéo dài về phía đầu
    while (!closedNow()) {
      const nx = findNext(chain[0]);
      if (!nx) break;
      used[nx.i] = true;
      const seg = nx.end === 1 ? open[nx.i].pts : [...open[nx.i].pts].reverse();
      chain.unshift(...seg.slice(0, -1));
    }
    if (closedNow()) {
      chain.pop();
      loops.push({ ...open[i], pts: chain, closed: true });
    } else rest.push({ ...open[i], pts: chain, closed: false });
  }
  return { loops, rest };
}

/** Điểm trong đa giác (ray casting). */
export function pointInPolygon(q: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const bboxInside = (inner: BBox, outer: BBox, eps: number): boolean =>
  inner.minX >= outer.minX - eps && inner.minY >= outer.minY - eps && inner.maxX <= outer.maxX + eps && inner.maxY <= outer.maxY + eps;

/** Vòng A nằm trong vòng B: đa số (≥ 60%) điểm mẫu của A nằm trong B — chịu được điểm nằm đúng trên biên. */
function loopInside(a: Pt[], b: Pt[]): boolean {
  const step = Math.max(1, Math.floor(a.length / 7));
  let tot = 0,
    hit = 0;
  for (let i = 0; i < a.length; i += step) {
    tot++;
    if (pointInPolygon(a[i], b)) hit++;
  }
  return hit / tot >= 0.6;
}

// ───────────── gom nhóm nét chạm nhau (chịu được chạm chữ T, chồng nét, cắt ngang) ─────────────

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  path: number;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

function ptSegDist(x: number, y: number, s: Seg): number {
  const dx = s.bx - s.ax,
    dy = s.by - s.ay;
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / L)) : 0;
  return Math.hypot(x - s.ax - t * dx, y - s.ay - t * dy);
}

/** Khoảng cách nhỏ nhất giữa 2 đoạn thẳng (0 nếu cắt nhau). */
function segSegDist(s: Seg, t: Seg): number {
  const o1 = orient(s.ax, s.ay, s.bx, s.by, t.ax, t.ay),
    o2 = orient(s.ax, s.ay, s.bx, s.by, t.bx, t.by),
    o3 = orient(t.ax, t.ay, t.bx, t.by, s.ax, s.ay),
    o4 = orient(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
  if (((o1 < 0 && o2 > 0) || (o1 > 0 && o2 < 0)) && ((o3 < 0 && o4 > 0) || (o3 > 0 && o4 < 0))) return 0;
  return Math.min(ptSegDist(s.ax, s.ay, t), ptSegDist(s.bx, s.by, t), ptSegDist(t.ax, t.ay, s), ptSegDist(t.bx, t.by, s));
}

class Dsu {
  private p: Int32Array;
  constructor(n: number) {
    this.p = new Int32Array(n).map((_, i) => i);
  }
  find(i: number): number {
    while (this.p[i] !== i) {
      this.p[i] = this.p[this.p[i]];
      i = this.p[i];
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a),
      rb = this.find(b);
    if (ra !== rb) this.p[ra] = rb;
  }
}

/** Bao lồi (Andrew monotone chain), ngược chiều kim đồng hồ. */
export function convexHull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = [],
    hi: Pt[] = [];
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
    hi.push(p);
  }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/**
 * Gom các nét chạm nhau (khoảng cách ≤ tol) thành nhóm — lưới băm theo ô để chỉ so các đoạn gần nhau.
 * Cỡ ô theo độ dài đoạn điển hình (trung vị × 2), KHÔNG theo khổ bản vẽ: bản vẽ có thứ nằm rải rác
 * rất xa (khung tên, sơ đồ cách hàng trăm mét) sẽ làm ô quá to → mọi đoạn rơi vào vài ô → so O(n²).
 */
function groupTouching(paths: RawPath[], tol: number): number[][] {
  const segs: Seg[] = [];
  paths.forEach((p, i) => {
    const n = p.pts.length;
    const m = p.closed ? n : n - 1;
    for (let k = 0; k < m; k++) {
      const a = p.pts[k],
        b = p.pts[(k + 1) % n];
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, path: i });
    }
  });
  const dsu = new Dsu(paths.length);
  const lens = segs.map((s) => Math.hypot(s.bx - s.ax, s.by - s.ay)).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 1;
  const total = lens.reduce((a, b) => a + b, 0);
  // giới hạn ~2 triệu lượt chèn ô (đoạn rất dài phủ nhiều ô)
  const cell = Math.max(tol * 4, median * 2, total / 2_000_000, 1e-3);
  const grid = new Map<number, number[]>();
  const K = (cx: number, cy: number): number => cx * 1000003 + cy;
  segs.forEach((s, si) => {
    const x0 = Math.floor((Math.min(s.ax, s.bx) - tol) / cell),
      x1 = Math.floor((Math.max(s.ax, s.bx) + tol) / cell);
    const y0 = Math.floor((Math.min(s.ay, s.by) - tol) / cell),
      y1 = Math.floor((Math.max(s.ay, s.by) + tol) / cell);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = K(cx, cy);
        const bucket = grid.get(k);
        if (!bucket) {
          grid.set(k, [si]);
          continue;
        }
        for (const sj of bucket) {
          const t = segs[sj];
          if (t.path === s.path || dsu.find(t.path) === dsu.find(s.path)) continue;
          if (segSegDist(s, t) <= tol) dsu.union(s.path, t.path);
        }
        bucket.push(si);
      }
  });
  const groups = new Map<number, number[]>();
  paths.forEach((_, i) => {
    const r = dsu.find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });
  return [...groups.values()];
}

interface Loop {
  pts: Pt[];
  area: number;
  bbox: BBox;
  color: string;
}

interface Comp {
  paths: RawPath[];
  bbox: BBox;
  /** Biên dạng: vòng kín thật (exact) hoặc bao lồi. */
  outline: Pt[];
  outlineArea: number;
  exact: boolean;
  outlineLoop: Loop | null;
  /** Vòng kín bên trong (cấp 1) — ứng viên lỗ. */
  holes: Loop[];
  /** Nét còn lại (hở, vòng kín cấp sâu). */
  cuts: { pts: Pt[]; closed: boolean; color: string }[];
  color: string;
  children: Comp[];
}

const bboxArea = (b: BBox): number => (b.maxX - b.minX) * (b.maxY - b.minY);

function buildComp(paths: RawPath[], tol: number): Comp {
  const closed: RawPath[] = [];
  const open: RawPath[] = [];
  for (const p of paths) {
    if (p.closed) closed.push(p);
    else if (p.pts.length > 2 && dist(p.pts[0], p.pts[p.pts.length - 1]) <= tol) closed.push({ ...p, pts: p.pts.slice(0, -1), closed: true });
    else open.push(p);
  }
  const { loops: chained, rest } = chainPaths(open, tol);
  const loops: Loop[] = [...closed, ...chained]
    .filter((p) => p.pts.length >= 3)
    .map((p) => ({ pts: p.pts, area: polygonArea(p.pts), bbox: bboxOfPoints(p.pts), color: p.color }))
    .filter((l) => l.area > 1e-3)
    .sort((a, b) => b.area - a.area);
  const allPts = paths.flatMap((p) => p.pts);
  const bbox = bboxOfPoints(allPts);
  // biên dạng thật = vòng kín lớn nhất có hình bao trùng hình bao cả nhóm
  const eb = Math.max(2 * tol, 0.5);
  const big = loops[0];
  const exact =
    !!big && Math.abs(big.bbox.minX - bbox.minX) <= eb && Math.abs(big.bbox.minY - bbox.minY) <= eb && Math.abs(big.bbox.maxX - bbox.maxX) <= eb && Math.abs(big.bbox.maxY - bbox.maxY) <= eb;
  const outline = exact ? big.pts : convexHull(allPts);
  const outlineArea = exact ? big.area : polygonArea(outline);
  const holes: Loop[] = [];
  const cuts: Comp['cuts'] = rest.map((r) => ({ pts: r.pts, closed: false, color: r.color }));
  for (const l of exact ? loops.slice(1) : loops) {
    // lỗ cấp 1: không nằm trong lỗ khác, nhỏ hơn 60% biên dạng (vòng to hơn thường là đường chấn khép kín)
    const nested = holes.some((h) => bboxInside(l.bbox, h.bbox, tol) && loopInside(l.pts, h.pts));
    if (!nested && l.area < 0.6 * outlineArea) holes.push(l);
    else cuts.push({ pts: l.pts, closed: true, color: l.color });
  }
  return { paths, bbox, outline, outlineArea, exact, outlineLoop: exact ? big : null, holes, cuts, color: big?.color ?? paths[0].color, children: [] };
}

/**
 * Nhận dạng chi tiết:
 *  1. gom các nét layer "Cắt" chạm nhau (≤ tol) thành nhóm — biên dạng vẽ bằng nhiều đoạn chạm chữ T vẫn là 1 nhóm;
 *  2. mỗi nhóm: biên dạng = vòng kín lớn nhất nếu trùng hình bao, nếu không thì bao lồi (biên dạng hở);
 *  3. nhóm nằm gọn trong một nhóm lớn hơn (lỗ tròn, ký hiệu khoá trong lỗ tay nắm…) gộp vào nhóm đó;
 *  4. nhóm cấp ngoài cùng đủ lớn = chi tiết; còn lại (đường lẻ, chữ vẽ bằng nét) bị bỏ.
 */
export function detectParts(src: ExplodedDxf, opt: DetectOptions): DetectResult {
  const tol = Math.max(1e-4, opt.tol);
  const cut = dedupe(src.paths.filter((p) => opt.cutLayers.has(p.layer)));
  const comps = groupTouching(cut, tol)
    .map((idx) => buildComp(idx.map((i) => cut[i]), tol))
    .sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox));

  // nhóm nằm gọn trong nhóm ngoài cùng nhỏ nhất chứa nó → gộp vào
  const tops: Comp[] = [];
  for (const c of comps) {
    const center = { x: (c.bbox.minX + c.bbox.maxX) / 2, y: (c.bbox.minY + c.bbox.maxY) / 2 };
    let parent: Comp | null = null;
    for (const t of tops) {
      if (t.outlineArea < 0.02 * bboxArea(t.bbox)) continue; // nhóm chỉ là đường thẳng
      if (!bboxInside(c.bbox, t.bbox, tol) || !pointInPolygon(center, t.outline)) continue;
      if (!parent || bboxArea(t.bbox) < bboxArea(parent.bbox)) parent = t;
    }
    if (parent) parent.children.push(c);
    else tops.push(c);
  }

  const ignored: Pt[][] = [];
  const drafts: Comp[] = [];
  const flatPaths = (c: Comp): RawPath[] => [...c.paths, ...c.children.flatMap(flatPaths)];
  for (const t of tops) {
    const w = t.bbox.maxX - t.bbox.minX,
      h = t.bbox.maxY - t.bbox.minY;
    if (Math.min(w, h) < opt.minSize || t.outlineArea < 0.02 * w * h) {
      for (const p of flatPaths(t)) ignored.push(p.closed ? [...p.pts, p.pts[0]] : p.pts);
      continue;
    }
    drafts.push(t);
  }

  // nét layer "Hiện" → chi tiết nhỏ nhất chứa nó
  const showLines = drafts.map(() => [] as { pts: Pt[]; color: string }[]);
  for (const p of src.paths) {
    if (!opt.showLayers.has(p.layer) || opt.cutLayers.has(p.layer)) continue;
    const b = bboxOfPoints(p.pts);
    const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    let best = -1;
    drafts.forEach((d, i) => {
      if (!bboxInside(b, d.bbox, tol) || !pointInPolygon(c, d.outline)) return;
      if (best < 0 || bboxArea(d.bbox) < bboxArea(drafts[best].bbox)) best = i;
    });
    if (best >= 0) showLines[best].push({ pts: p.closed ? [...p.pts, p.pts[0]] : p.pts, color: p.color });
  }

  // đánh mã theo vị trí: chia hàng theo mép trên (lệch ≤ 50 mm so với chi tiết đầu hàng = cùng hàng),
  // hàng trên trước, trong hàng trái → phải
  const byTop = drafts.map((_, i) => i).sort((a, b) => drafts[b].bbox.maxY - drafts[a].bbox.maxY);
  const order: number[] = [];
  for (let s = 0; s < byTop.length; ) {
    const top = drafts[byTop[s]].bbox.maxY;
    let e = s;
    while (e < byTop.length && top - drafts[byTop[e]].bbox.maxY <= 50) e++;
    order.push(...byTop.slice(s, e).sort((a, b) => drafts[a].bbox.minX - drafts[b].bbox.minX));
    s = e;
  }

  const parts: ImportedPart[] = order.map((di, i) => {
    const t = drafts[di];
    const { minX, minY, maxX, maxY } = t.bbox;
    const loc = (q: Pt): Pt => ({ x: q.x - minX, y: q.y - minY });
    const candidates: Loop[] = [...t.holes];
    const cuts = [...t.cuts];
    const addChild = (c: Comp): void => {
      // nhóm con: biên dạng kín → ứng viên lỗ; phần còn lại → nét cắt
      if (c.outlineLoop && c.outlineLoop.area < 0.6 * t.outlineArea) candidates.push(c.outlineLoop);
      else if (c.outlineLoop) cuts.push({ pts: c.outlineLoop.pts, closed: true, color: c.outlineLoop.color });
      for (const h of c.holes) cuts.push({ pts: h.pts, closed: true, color: h.color });
      cuts.push(...c.cuts);
      c.children.forEach(addChild);
    };
    t.children.forEach(addChild);
    // chỉ vòng cấp 1 là lỗ; vòng nằm trong lỗ khác (ký hiệu vẽ trong lỗ) là nét
    const holes: Loop[] = [];
    for (const l of candidates.sort((a, b) => b.area - a.area)) {
      if (holes.some((h) => bboxInside(l.bbox, h.bbox, tol) && loopInside(l.pts, h.pts))) cuts.push({ pts: l.pts, closed: true, color: l.color });
      else holes.push(l);
    }
    return {
      id: `p${i + 1}`,
      code: `CT${String(i + 1).padStart(2, '0')}`,
      layer: t.paths[0].layer,
      w: maxX - minX,
      h: maxY - minY,
      outline: t.outline.map(loc),
      outlineExact: t.exact,
      holes: holes.map((h) => h.pts.map(loc)),
      holeColors: holes.map((h) => h.color),
      cuts: cuts.map((c) => ({ pts: c.pts.map(loc), closed: c.closed, color: c.color })),
      lines: showLines[di].map((l) => ({ pts: l.pts.map(loc), color: l.color })),
      color: t.color,
      area: Math.max(0, t.outlineArea - holes.reduce((s, h) => s + h.area, 0)),
      world: t.bbox,
    };
  });
  return { parts, ignored, approxCount: parts.filter((p) => !p.outlineExact).length };
}
