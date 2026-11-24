import { BBox, BendDir, BendLine, Hole, Polyline, Pt } from './types';
import { bboxOfPoints, cleanPoints, r2, translateHole, translatePt } from './math';

/** Một đoạn gấp mép, `len` là KÍCH THƯỚC NGOÀI sau khi chấn. */
export interface FlangeStep {
  len: number;
  dir: BendDir;
}

export type Side = 'bottom' | 'right' | 'top' | 'left';

export interface PanelSpec {
  /** Kích thước ngoài của mặt chính. */
  faceW: number;
  faceH: number;
  /** Các đoạn gấp mép từng cạnh, tính từ mặt chính ra ngoài (1 đoạn = gấp mép; 2 đoạn = gấp mép hồi). */
  flanges: Partial<Record<Side, FlangeStep[]>>;
  bd: number;
  /** Cạnh ô khoét giảm ứng suất (corner relief) ở góc giữa 2 mép gấp. */
  relief: number;
  /** Lỗ theo toạ độ MẶT NGOÀI (gốc ở góc dưới trái của mặt chính, chưa trải phẳng). */
  holes?: Hole[];
}

export interface PanelGeom {
  outline: Polyline;
  holes: Hole[];
  bendLines: BendLine[];
  bbox: BBox;
  /** Phép dời từ toạ độ mặt ngoài → toạ độ trải phẳng: flat = face + offset. */
  faceOffset: Pt;
  /** Kích thước mặt chính sau trải phẳng (giữa các đường chấn). */
  faceFlat: { w: number; h: number };
}

const ORDER: Side[] = ['bottom', 'right', 'top', 'left'];

/**
 * TRẢI PHẲNG TẤM CÓ GẤP MÉP 4 CẠNH.
 *
 * Quy ước BD: mỗi đường chấn trừ BD, chia đôi cho 2 đoạn kề nhau.
 *  - Mặt chính: wFlat = faceW − (BD/2 nếu có mép trái) − (BD/2 nếu có mép phải).
 *  - Đoạn mép thứ i: flat_i = len_i − BD/2 − (BD/2 nếu còn đoạn tiếp theo).
 *  → Tổng 1 chiều = Σ kích thước ngoài − n·BD (khớp công thức trong bend.ts).
 *
 * Góc giữa 2 mép gấp: cắt ô vuông relief×relief vào góc mặt chính để chấn không bị xé/chồng.
 * Các đoạn hồi (đoạn thứ 2 trở đi) được thu ngắn 2 đầu để không đè lên mép hồi của cạnh bên.
 */
export function flangedPanel(spec: PanelSpec): PanelGeom {
  const { bd, relief: r } = spec;
  const fl = spec.flanges;
  const has = (s: Side): boolean => (fl[s]?.length ?? 0) > 0;

  const offL = has('left') ? bd / 2 : 0;
  const offR = has('right') ? bd / 2 : 0;
  const offB = has('bottom') ? bd / 2 : 0;
  const offT = has('top') ? bd / 2 : 0;
  const FW = spec.faceW - offL - offR;
  const FH = spec.faceH - offB - offT;

  // Khung toạ độ cục bộ từng cạnh: P0 (điểm đầu), u (dọc cạnh, ngược chiều kim đồng hồ), n (pháp tuyến ra ngoài)
  const frames: Record<Side, { p0: Pt; u: Pt; n: Pt; L: number }> = {
    bottom: { p0: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, L: FW },
    right: { p0: { x: FW, y: 0 }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, L: FH },
    top: { p0: { x: FW, y: FH }, u: { x: -1, y: 0 }, n: { x: 0, y: 1 }, L: FW },
    left: { p0: { x: 0, y: FH }, u: { x: 0, y: -1 }, n: { x: -1, y: 0 }, L: FH },
  };
  const toGlobal = (side: Side, s: number, d: number): Pt => {
    const f = frames[side];
    return { x: f.p0.x + f.u.x * s + f.n.x * d, y: f.p0.y + f.u.y * s + f.n.y * d };
  };

  const pts: Pt[] = [];
  const bends: BendLine[] = [];

  ORDER.forEach((side, k) => {
    const prev = ORDER[(k + 3) % 4];
    const next = ORDER[(k + 1) % 4];
    const steps = fl[side] ?? [];
    const L = frames[side].L;
    if (steps.length > 0) {
      const prevHas = has(prev);
      const nextHas = has(next);
      // chiều dài trải phẳng từng đoạn mép
      const flats = steps.map((st, i) => st.len - bd / 2 - (i < steps.length - 1 ? bd / 2 : 0));
      const depth: number[] = [0];
      flats.forEach((f, i) => depth.push(depth[i] + f));
      const spans: { a: number; b: number }[] = [];
      let inset = 0;
      for (let i = 0; i < steps.length; i++) {
        if (i > 0) inset += flats[i];
        const a = (prevHas ? r : 0) + (prevHas ? inset : 0);
        const b = L - (nextHas ? r : 0) - (nextHas ? inset : 0);
        if (b - a < 1) break;
        spans.push({ a, b });
      }
      const m = spans.length;
      // biên dạng răng (tab) đi ra rồi quay về
      for (let i = 0; i < m; i++) {
        pts.push(toGlobal(side, spans[i].a, depth[i]));
        pts.push(toGlobal(side, spans[i].a, depth[i + 1]));
      }
      for (let i = m - 1; i >= 0; i--) {
        pts.push(toGlobal(side, spans[i].b, depth[i + 1]));
        pts.push(toGlobal(side, spans[i].b, depth[i]));
      }
      // đường chấn: i = 0 nằm trên mép mặt chính, i > 0 nằm giữa các đoạn mép
      for (let i = 0; i < m; i++) {
        bends.push({
          a: toGlobal(side, spans[i].a, depth[i]),
          b: toGlobal(side, spans[i].b, depth[i]),
          direction: steps[i].dir,
          angle: 90,
        });
      }
    }
    // góc giữa cạnh này và cạnh kế tiếp
    const corner = frames[next].p0;
    if (steps.length > 0 && has(next)) {
      const u1 = frames[side].u;
      const u2 = frames[next].u;
      pts.push({ x: corner.x - u1.x * r + u2.x * r, y: corner.y - u1.y * r + u2.y * r });
    } else {
      pts.push(corner);
    }
  });

  const cleaned = cleanPoints(pts, true);
  const bb = bboxOfPoints(cleaned);
  const dx = -bb.minX;
  const dy = -bb.minY;
  const outline: Polyline = { kind: 'poly', closed: true, pts: cleaned.map((p) => translatePt(p, dx, dy)) };
  const faceOffset = { x: r2(dx - offL), y: r2(dy - offB) };
  const holes = (spec.holes ?? []).map((h) => translateHole(h, faceOffset.x, faceOffset.y));
  const bendLines = bends.map((b) => ({ ...b, a: translatePt(b.a, dx, dy), b: translatePt(b.b, dx, dy) }));
  return {
    outline,
    holes,
    bendLines,
    bbox: { minX: 0, minY: 0, maxX: r2(bb.maxX - bb.minX), maxY: r2(bb.maxY - bb.minY) },
    faceOffset,
    faceFlat: { w: r2(FW), h: r2(FH) },
  };
}

/** Các mép gấp giống nhau cho cả 4 cạnh. */
export function allSides(steps: FlangeStep[]): Partial<Record<Side, FlangeStep[]>> {
  return { bottom: steps, right: steps, top: steps, left: steps };
}

/**
 * Thanh profile chấn dọc (thép U, thanh C, thanh cái Z...): trải phẳng là HÌNH CHỮ NHẬT
 * dài `length`, rộng = Σ đoạn tiết diện − n·BD; các đường chấn chạy dọc chiều dài.
 * `profile` là các đoạn tiết diện (kích thước ngoài) từ dưới lên.
 */
export function profileStrip(
  length: number,
  profile: FlangeStep[],
  bd: number,
): { outline: Polyline; bendLines: BendLine[]; width: number; segFlat: number[] } {
  const n = profile.length;
  const segFlat = profile.map((s, i) => s.len - (i > 0 ? bd / 2 : 0) - (i < n - 1 ? bd / 2 : 0));
  const width = r2(segFlat.reduce((a, b) => a + b, 0));
  const bendLines: BendLine[] = [];
  let y = 0;
  for (let i = 0; i < n - 1; i++) {
    y += segFlat[i];
    // hướng chấn lấy theo đoạn phía sau đường chấn
    bendLines.push({ a: { x: 0, y: r2(y) }, b: { x: length, y: r2(y) }, direction: profile[i + 1].dir, angle: 90 });
  }
  return {
    outline: {
      kind: 'poly',
      closed: true,
      pts: [
        { x: 0, y: 0 },
        { x: length, y: 0 },
        { x: length, y: width },
        { x: 0, y: width },
      ],
    },
    bendLines,
    width,
    segFlat,
  };
}
