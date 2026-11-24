/**
 * Kiểu dữ liệu hình học cơ bản — TypeScript thuần, KHÔNG phụ thuộc Angular.
 * Hệ toạ độ: mm, trục X sang phải, trục Y hướng LÊN (giống CAD/DXF).
 * Khi port sang Python: Pt ~ tuple(float, float), Polyline ~ list điểm + bulge (ezdxf LWPOLYLINE).
 */

export interface Pt {
  x: number;
  y: number;
}

/** Hình chữ nhật trục song song: (x, y) là góc DƯỚI TRÁI. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Đa tuyến. `bulges[i]` là độ phồng (bulge) của đoạn i → i+1 theo chuẩn DXF:
 * bulge = tan(góc cung / 4); 0 = đoạn thẳng; 1 = nửa đường tròn ngược chiều kim đồng hồ.
 */
export interface Polyline {
  kind: 'poly';
  pts: Pt[];
  bulges?: number[];
  closed: boolean;
  /** Tham chiếu tới thiết bị sinh ra lỗ này (uid) — dùng cho bộ luật kiểm tra. */
  ref?: string;
}

export interface Circle {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  ref?: string;
}

export type Hole = Circle | Polyline;

export type BendDir = 'UP' | 'DOWN';

export interface BendLine {
  a: Pt;
  b: Pt;
  direction: BendDir;
  /** Góc chấn (độ). */
  angle: number;
}

export interface TextMark {
  x: number;
  y: number;
  height: number;
  text: string;
  layer: 'MARK' | 'TEXT';
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type PartMaterial = 'SPCC' | 'INOX304' | 'CU';

export type PartGroup = 'vo' | 'cua' | 'tam-de' | 'khung-de' | 'thanh-c' | 'thanh-cai';

/** Một chi tiết trải phẳng — đơn vị sản xuất nhỏ nhất đưa vào máy CNC. */
export interface Part {
  id: string;
  /** Mã chi tiết (dùng trong tên file DXF), ví dụ "CUA", "HONG-T". */
  code: string;
  name: string;
  group: PartGroup;
  material: PartMaterial;
  thickness: number;
  qty: number;
  /** Biên dạng ngoài — luôn khép kín. Gốc (0,0) ở góc dưới trái của bbox. */
  outline: Polyline;
  holes: Hole[];
  bendLines: BendLine[];
  marks: TextMark[];
  bbox: BBox;
  /** Có xếp trên khổ tôn không (thanh cái đồng: không). */
  nestable: boolean;
  note?: string;
}
