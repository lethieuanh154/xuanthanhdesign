import { BendTable } from './model';

/**
 * TRA BẢNG BD (Bend Deduction — lượng trừ khi chấn 90°).
 *
 * Chiều dài trải phẳng L = Σ(kích thước ngoài các đoạn) − n × BD
 *   với n = số đường chấn.
 * Ví dụ tấm hông sâu D = 250, gấp mép 20 hai đầu, tôn 1.5 (BD = 2.6):
 *   L = 20 + 250 + 20 − 2 × 2.6 = 284.8 mm
 *
 * LƯU Ý: số trong bend-table.json là SỐ MẪU. Xưởng cần chấn thử từng độ dày
 * trên máy chấn + cối thực tế rồi thay vào bảng.
 */
export function bendDeduction(table: BendTable, kind: 'steel' | 'copper', thickness: number): number {
  const t = kind === 'steel' ? table.steel : table.copper;
  const key = String(thickness);
  if (t[key] !== undefined) return t[key];
  // Không có trong bảng → nội suy tuyến tính theo độ dày
  const rows = Object.entries(t)
    .map(([k, v]) => [parseFloat(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) return 1.7 * thickness;
  if (thickness <= rows[0][0]) return (rows[0][1] / rows[0][0]) * thickness;
  for (let i = 1; i < rows.length; i++) {
    const [t0, v0] = rows[i - 1];
    const [t1, v1] = rows[i];
    if (thickness <= t1) return v0 + ((v1 - v0) * (thickness - t0)) / (t1 - t0);
  }
  const [tl, vl] = rows[rows.length - 1];
  return (vl / tl) * thickness;
}

/** L = Σ kích thước ngoài − n × BD, với n = số đoạn − 1. */
export function flatLength(outerSegments: number[], bd: number): number {
  const sum = outerSegments.reduce((s, v) => s + v, 0);
  const n = Math.max(0, outerSegments.length - 1);
  return sum - n * bd;
}
