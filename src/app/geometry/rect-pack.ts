/**
 * XẾP HÌNH CHỮ NHẬT LÊN KHỔ TÔN — thuật toán MaxRects (Jukka Jylänki, 2010).
 * Mỗi chi tiết được thay bằng hình chữ nhật bao. Chặt hơn xếp kệ (shelf) vì tận dụng được
 * khoảng trống bên cạnh chi tiết thấp. Toạ độ: gốc ở góc TRÊN TRÁI tấm, trục Y hướng XUỐNG
 * (tấm được lấp từ trên xuống, giống cách thợ xếp tay).
 *
 * Cách dùng khe hở: phình mỗi chi tiết thêm `gap` rồi xếp vào vùng (khổ − 2·lề + gap) —
 * hai chi tiết kề nhau luôn cách đúng `gap`, chi tiết sát lề cách mép tôn đúng `margin`.
 */

export interface PackItem {
  id: string;
  w: number;
  h: number;
  qty: number;
}

export interface PackPlacement {
  id: string;
  /** Góc trên trái chi tiết trên tấm (mm). */
  x: number;
  y: number;
  /** Kích thước chiếm chỗ sau khi xoay. */
  w: number;
  h: number;
  /** Đã xoay 90° ngược chiều kim đồng hồ. */
  rotated: boolean;
}

export interface PackSheet {
  index: number;
  placements: PackPlacement[];
  /** Tổng diện tích hình bao đã xếp (mm²). */
  usedArea: number;
  /** Tấm chỉ chứa 1 cụm cỡ bằng khổ tôn (bản vẽ đã sắp sẵn) — đặt nguyên, bỏ qua lề / khe. */
  whole?: boolean;
}

export interface PackOptions {
  sheetW: number;
  sheetH: number;
  gap: number;
  margin: number;
  allowRotate: boolean;
}

export interface PackResult {
  sheets: PackSheet[];
  /** id các chi tiết lớn hơn khổ tôn (mỗi bản sao 1 lần). */
  unplaced: string[];
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Heuristic = 'bssf' | 'baf' | 'bl';

const EPS = 1e-6;

class MaxRectsBin {
  free: FreeRect[];
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.free = [{ x: 0, y: 0, w: W, h: H }];
  }

  /** Tìm chỗ tốt nhất cho w×h; trả điểm (nhỏ hơn = tốt hơn). */
  find(w: number, h: number, rotate: boolean, heu: Heuristic): { x: number; y: number; rot: boolean; s1: number; s2: number } | null {
    let best: { x: number; y: number; rot: boolean; s1: number; s2: number } | null = null;
    const tryFit = (fr: FreeRect, ww: number, hh: number, rot: boolean): void => {
      if (ww > fr.w + EPS || hh > fr.h + EPS) return;
      const lw = fr.w - ww,
        lh = fr.h - hh;
      let s1: number, s2: number;
      if (heu === 'bssf') {
        s1 = Math.min(lw, lh);
        s2 = Math.max(lw, lh);
      } else if (heu === 'baf') {
        s1 = fr.w * fr.h - ww * hh;
        s2 = Math.min(lw, lh);
      } else {
        s1 = fr.y + hh;
        s2 = fr.x;
      }
      if (!best || s1 < best.s1 - EPS || (Math.abs(s1 - best.s1) <= EPS && s2 < best.s2)) best = { x: fr.x, y: fr.y, rot, s1, s2 };
    };
    for (const fr of this.free) {
      tryFit(fr, w, h, false);
      if (rotate && Math.abs(w - h) > EPS) tryFit(fr, h, w, true);
    }
    return best;
  }

  place(r: FreeRect): void {
    const next: FreeRect[] = [];
    for (const fr of this.free) {
      // không giao → giữ nguyên
      if (r.x >= fr.x + fr.w - EPS || r.x + r.w <= fr.x + EPS || r.y >= fr.y + fr.h - EPS || r.y + r.h <= fr.y + EPS) {
        next.push(fr);
        continue;
      }
      // tách phần còn lại của ô trống thành tối đa 4 ô (có thể chồng nhau)
      if (r.x > fr.x + EPS) next.push({ x: fr.x, y: fr.y, w: r.x - fr.x, h: fr.h });
      if (r.x + r.w < fr.x + fr.w - EPS) next.push({ x: r.x + r.w, y: fr.y, w: fr.x + fr.w - (r.x + r.w), h: fr.h });
      if (r.y > fr.y + EPS) next.push({ x: fr.x, y: fr.y, w: fr.w, h: r.y - fr.y });
      if (r.y + r.h < fr.y + fr.h - EPS) next.push({ x: fr.x, y: r.y + r.h, w: fr.w, h: fr.y + fr.h - (r.y + r.h) });
    }
    // bỏ ô nằm gọn trong ô khác
    this.free = next.filter(
      (a, i) => !next.some((b, j) => j !== i && a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS && (j < i || a.w * a.h < b.w * b.h - EPS)),
    );
  }
}

function packWith(items: { id: string; w: number; h: number }[], o: PackOptions, heu: Heuristic): PackResult {
  const binW = o.sheetW - 2 * o.margin + o.gap;
  const binH = o.sheetH - 2 * o.margin + o.gap;
  const fitsEmpty = (w: number, h: number): boolean => (w <= binW + EPS && h <= binH + EPS) || (o.allowRotate && h <= binW + EPS && w <= binH + EPS);

  const unplaced: string[] = [];
  const whole: PackSheet[] = [];
  let left = items.filter((it) => {
    if (fitsEmpty(it.w + o.gap, it.h + o.gap)) return true;
    // không vừa khi tính lề/khe nhưng vừa khổ tôn → cụm đã sắp sẵn cả tấm: đặt nguyên, căn giữa
    const straight = it.w <= o.sheetW + EPS && it.h <= o.sheetH + EPS;
    const rot = o.allowRotate && it.h <= o.sheetW + EPS && it.w <= o.sheetH + EPS;
    if (straight || rot) {
      const w = straight ? it.w : it.h,
        h = straight ? it.h : it.w;
      whole.push({ index: 0, placements: [{ id: it.id, x: (o.sheetW - w) / 2, y: (o.sheetH - h) / 2, w, h, rotated: !straight }], usedArea: w * h, whole: true });
    } else unplaced.push(it.id);
    return false;
  });
  const sheets: PackSheet[] = [];
  while (left.length) {
    const bin = new MaxRectsBin(binW, binH);
    const sheet: PackSheet = { index: sheets.length + 1, placements: [], usedArea: 0 };
    // mỗi vòng chọn cặp (chi tiết, vị trí) có điểm tốt nhất trong số còn lại
    for (;;) {
      let pick: { k: number; x: number; y: number; rot: boolean; s1: number; s2: number } | null = null;
      for (let k = 0; k < left.length; k++) {
        const it = left[k];
        const f = bin.find(it.w + o.gap, it.h + o.gap, o.allowRotate, heu);
        if (f && (!pick || f.s1 < pick.s1 - EPS || (Math.abs(f.s1 - pick.s1) <= EPS && f.s2 < pick.s2))) pick = { k, ...f };
      }
      if (!pick) break;
      const it = left[pick.k];
      const w = pick.rot ? it.h : it.w,
        h = pick.rot ? it.w : it.h;
      bin.place({ x: pick.x, y: pick.y, w: w + o.gap, h: h + o.gap });
      sheet.placements.push({ id: it.id, x: o.margin + pick.x, y: o.margin + pick.y, w, h, rotated: pick.rot });
      sheet.usedArea += w * h;
      left = left.filter((_, k) => k !== pick!.k);
    }
    if (!sheet.placements.length) break; // an toàn: không bao giờ xảy ra vì đã lọc vượt khổ
    sheets.push(sheet);
  }
  // tấm sắp sẵn đứng trước, đánh lại số thứ tự
  const all = [...whole, ...sheets];
  all.forEach((s, i) => (s.index = i + 1));
  return { sheets: all, unplaced };
}

/**
 * Xếp các chi tiết (bung theo số lượng) lên ít tấm nhất.
 * Chạy 3 tiêu chí (BSSF, BAF, BL) và giữ kết quả ít tấm nhất; hoà thì tấm cuối dùng ít nhất
 * (phần tôn thừa dồn về 1 tấm để dùng lại).
 */
export function packRects(items: PackItem[], o: PackOptions): PackResult {
  const flat = items.flatMap((it) => Array.from({ length: Math.max(0, Math.floor(it.qty)) }, () => ({ id: it.id, w: it.w, h: it.h })));
  let best: PackResult | null = null;
  for (const heu of ['bssf', 'baf', 'bl'] as const) {
    const r = packWith(flat, o, heu);
    const lastUse = (x: PackResult): number => x.sheets[x.sheets.length - 1]?.usedArea ?? 0;
    if (!best || r.sheets.length < best.sheets.length || (r.sheets.length === best.sheets.length && lastUse(r) < lastUse(best))) best = r;
  }
  return best!;
}
