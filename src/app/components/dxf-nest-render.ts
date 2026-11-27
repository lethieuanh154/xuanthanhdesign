import { BBox, DetectResult, ExplodedDxf, ImportedPart, PackSheet, Pt } from '../geometry';

/**
 * Vẽ bằng Canvas 2D thuần — dùng chung cho khung xem (bên trong Konva.Shape) và xuất JPG (canvas ẩn).
 * Đơn vị vẽ là mm; `k` = số px màn hình trên 1 mm ở mức zoom hiện tại (để nét luôn mảnh đều).
 */

export const NEST_BG = '#1f252d';

export interface NestDrawOpts {
  titles: boolean;
  codes: boolean;
  /** 'white' = nét trắng như phần mềm CAM; 'drawing' = giữ màu nét của bản vẽ gốc. */
  colorMode: 'white' | 'drawing';
  /** Chi tiết đang trỏ chuột trong danh sách (key) — tô vàng. */
  highlight?: string | null;
}

export interface NestLayout {
  /** Góc trên trái từng tấm (mm). */
  boxes: { x: number; y: number }[];
  W: number;
  H: number;
  titleH: number;
}

/** Xếp các tấm thành hàng (tối đa `perRow` tấm/hàng), có lề và chỗ ghi tiêu đề. */
export function nestLayout(n: number, sheetW: number, sheetH: number, titles: boolean, perRow = 6): NestLayout {
  const gap = Math.round(Math.max(sheetW, sheetH) * 0.06);
  const titleH = titles ? Math.round(Math.max(sheetW, sheetH) * 0.035) : 0;
  const pad = gap;
  const cols = Math.max(1, Math.min(n, perRow));
  const rows = Math.max(1, Math.ceil(n / perRow));
  const boxes = Array.from({ length: n }, (_, i) => ({
    x: pad + (i % perRow) * (sheetW + gap),
    y: pad + titleH + Math.floor(i / perRow) * (sheetH + titleH + gap),
  }));
  return { boxes, W: 2 * pad + cols * sheetW + (cols - 1) * gap, H: 2 * pad + rows * (sheetH + titleH) + (rows - 1) * gap, titleH };
}

function polyPath(c: CanvasRenderingContext2D, pts: Pt[], tf: (p: Pt) => Pt, closed: boolean): void {
  if (!pts.length) return;
  const a = tf(pts[0]);
  c.moveTo(a.x, a.y);
  for (let i = 1; i < pts.length; i++) {
    const b = tf(pts[i]);
    c.lineTo(b.x, b.y);
  }
  if (closed) c.closePath();
}

/** Toạ độ cục bộ chi tiết (Y lên) → toạ độ tấm (Y xuống), có xoay 90° ngược chiều kim đồng hồ. */
function placeTf(part: ImportedPart, x: number, y: number, rotated: boolean): (p: Pt) => Pt {
  return rotated ? (p) => ({ x: x + (part.h - p.y), y: y + (part.w - p.x) }) : (p) => ({ x: x + p.x, y: y + (part.h - p.y) });
}

export function drawNest(
  c: CanvasRenderingContext2D,
  k: number,
  sheets: PackSheet[],
  parts: ReadonlyMap<string, ImportedPart>,
  sheet: { w: number; h: number },
  lay: NestLayout,
  opts: NestDrawOpts,
): void {
  const lw = 1.25 / k;
  const white = '#eef1f4';
  sheets.forEach((s, i) => {
    const o = lay.boxes[i];
    if (!o) return;
    // tấm tôn
    c.fillStyle = '#262d36';
    c.fillRect(o.x, o.y, sheet.w, sheet.h);
    c.strokeStyle = '#5d6874';
    c.lineWidth = lw;
    c.strokeRect(o.x, o.y, sheet.w, sheet.h);
    if (opts.titles) {
      const net = s.placements.reduce((a, p) => a + (parts.get(p.id)?.area ?? 0), 0);
      const pct = Math.round((net / (sheet.w * sheet.h)) * 1000) / 10;
      c.fillStyle = '#cfd6dd';
      c.font = `600 ${lay.titleH * 0.55}px Inter, 'Segoe UI', Arial, sans-serif`;
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      const info = s.whole ? 'sắp sẵn' : `${s.placements.length} chi tiết · ${pct}%`;
      c.fillText(`Tấm ${s.index}/${sheets.length} · ${sheet.w}×${sheet.h} · ${info}`, o.x, o.y - lay.titleH * 0.3);
    }
    for (const pl of s.placements) {
      const part = parts.get(pl.id);
      if (!part) continue;
      const tf = placeTf(part, o.x + pl.x, o.y + pl.y, pl.rotated);
      const hi = opts.highlight === pl.id;
      if (hi) {
        c.beginPath();
        polyPath(c, part.outline, tf, true);
        c.fillStyle = 'rgba(255, 212, 0, 0.18)';
        c.fill();
      }
      // nét phụ (đường chấn…) vẽ trước, mờ hơn
      c.lineWidth = lw * 0.8;
      for (const l of part.lines) {
        c.beginPath();
        polyPath(c, l.pts, tf, false);
        c.strokeStyle = opts.colorMode === 'drawing' ? l.color : '#8f9aa6';
        c.stroke();
      }
      c.lineWidth = lw;
      const col = (drawingColor: string): string => (hi ? '#ffd400' : opts.colorMode === 'drawing' ? drawingColor : white);
      // biên dạng hở: bao lồi chỉ là hình tính toán, không vẽ — hình thật nằm trong `cuts`
      if (part.outlineExact) {
        c.beginPath();
        polyPath(c, part.outline, tf, true);
        c.strokeStyle = col(part.color);
        c.stroke();
      }
      part.holes.forEach((h, j) => {
        c.beginPath();
        polyPath(c, h, tf, true);
        c.strokeStyle = col(part.holeColors[j]);
        c.stroke();
      });
      for (const k2 of part.cuts) {
        c.beginPath();
        polyPath(c, k2.pts, tf, k2.closed);
        c.strokeStyle = col(k2.color);
        c.stroke();
      }
      if (opts.codes) {
        const fs = Math.min(Math.max(14 / k, 40), Math.min(pl.w, pl.h) / 3);
        c.fillStyle = '#ffd400';
        c.font = `700 ${fs}px Inter, 'Segoe UI', Arial, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(part.code, o.x + pl.x + pl.w / 2, o.y + pl.y + pl.h / 2);
      }
    }
  });
}

export type LayerMode = 'cut' | 'show' | 'off';

/** Bản vẽ gốc: nét mờ + chi tiết nhận dạng (xanh = đưa vào sắp tôn, xám đứt = bỏ), nét hở màu đỏ. */
export function drawSource(
  c: CanvasRenderingContext2D,
  k: number,
  ex: ExplodedDxf,
  det: DetectResult,
  modes: Readonly<Record<string, LayerMode>>,
  included: (key: string) => boolean,
  keyOf: (p: ImportedPart) => string,
  highlight: string | null,
): void {
  const ext = ex.extents;
  const W = (p: Pt): Pt => ({ x: p.x - ext.minX, y: ext.maxY - p.y });
  const lw = 1 / k;
  // 1) toàn bộ nét theo layer — gộp 1 path cho mỗi nhóm để vẽ nhanh
  for (const mode of ['show', 'cut'] as const) {
    c.beginPath();
    for (const p of ex.paths) if ((modes[p.layer] ?? 'cut') === mode) polyPath(c, p.pts, W, p.closed);
    c.strokeStyle = mode === 'cut' ? '#56606b' : '#39424c';
    c.lineWidth = lw;
    c.stroke();
  }
  // 2) chi tiết
  for (const part of det.parts) {
    const key = keyOf(part);
    const on = included(key);
    const hi = highlight === key;
    const tf = (p: Pt): Pt => W({ x: p.x + part.world.minX, y: p.y + part.world.minY });
    // vùng chi tiết (biên dạng thật hoặc bao lồi) — tô nền
    c.beginPath();
    polyPath(c, part.outline, tf, true);
    for (const h of part.holes) polyPath(c, h, tf, true);
    if (on || hi) {
      c.fillStyle = hi ? 'rgba(255, 212, 0, 0.22)' : part.outlineExact ? 'rgba(57, 255, 20, 0.09)' : 'rgba(255, 152, 0, 0.10)';
      c.fill('evenodd');
    }
    // nét: xanh = biên dạng kín; cam = biên dạng hở (vẽ bao lồi đứt nét + nét thật)
    const stroke = hi ? '#ffd400' : !on ? '#8a96a3' : part.outlineExact ? '#39ff14' : '#ff9800';
    c.strokeStyle = stroke;
    c.lineWidth = (on ? 1.4 : 1) * lw;
    c.setLineDash(on && part.outlineExact ? [] : [6 / k, 4 / k]);
    c.beginPath();
    polyPath(c, part.outline, tf, true);
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    for (const h of part.holes) polyPath(c, h, tf, true);
    for (const q of part.cuts) polyPath(c, q.pts, tf, q.closed);
    c.lineWidth = lw;
    c.stroke();
    // mã chi tiết
    const fs = Math.min(13 / k, Math.min(part.w, part.h) / 3);
    if (fs * k >= 6) {
      c.fillStyle = on ? '#ffd400' : '#8a96a3';
      c.font = `700 ${fs}px Inter, 'Segoe UI', Arial, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const m = W({ x: (part.world.minX + part.world.maxX) / 2, y: (part.world.minY + part.world.maxY) / 2 });
      c.fillText(part.code, m.x, m.y);
    }
  }
  // 3) nét layer cắt bị bỏ (đường lẻ, nhóm quá nhỏ)
  c.beginPath();
  for (const o of det.ignored) polyPath(c, o, W, false);
  c.strokeStyle = '#ff5252';
  c.lineWidth = 1.2 * lw;
  c.stroke();
}

/** Toạ độ thế giới của điểm trên khung xem bản vẽ gốc. */
export function sourceToWorld(ext: BBox, p: Pt): Pt {
  return { x: p.x + ext.minX, y: ext.maxY - p.y };
}
