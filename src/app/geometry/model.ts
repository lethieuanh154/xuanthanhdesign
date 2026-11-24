/**
 * Model dữ liệu dự án & thư viện (catalog). TypeScript thuần — dùng chung cho UI, bộ luật, xuất file.
 * Mọi kích thước tính bằng mm, dòng điện tính bằng A, giá tính bằng VNĐ.
 */

/** 2L = tủ 2 lớp (cửa ngoài gắn thiết bị đo + cửa trong che trong). */
export type CabinetType = 'DB' | 'MSB' | 'ATS' | 'CAP' | '2L';
/** two_layer = cửa ngoài (gắn đồng hồ, đèn, relay) + cửa trong khoét ô lộ cần gạt aptomat, bản lề dưới. */
export type DoorType = 'single' | 'double' | 'inner_outer' | 'two_layer';
export type VentType = 'none' | 'bottom' | 'top_bottom' | 'fan' | 'side_vertical';
export type Mounting = 'wall' | 'floor';
/** SPCC = thép sơn tĩnh điện, GALV = tôn mạ kẽm. */
export type Material = 'SPCC' | 'GALV' | 'INOX304' | 'INOX201';
export type LockType = 'handle' | 'square' | 'key';
export type Hinge = 'left' | 'right';
export type MountSurface = 'plate' | 'door';
export type BaseHeight = 0 | 100 | 150;
export type SheetSize = '1250x2500' | '1500x3000';
export type Phases = '3P' | '3P+N' | '3P+N+PE';

export type DeviceType =
  | 'ACB'
  | 'MCCB'
  | 'MCB'
  | 'METER_V'
  | 'METER_A'
  | 'METER_MULTI'
  | 'CT'
  | 'PILOT_LAMP'
  | 'PUSH_BUTTON'
  | 'SELECTOR'
  | 'PFR'
  | 'CONTACTOR'
  | 'PHASE_RELAY'
  | 'EARTH_RELAY'
  | 'FUSE'
  | 'CAPACITOR';

export type DoorCutoutDef = { shape: 'rect'; w: number; h: number } | { shape: 'circle'; d: number };

export interface DeviceDef {
  id: string;
  brand: string;
  series: string;
  model: string;
  name: string;
  type: DeviceType;
  category: string;
  ratedCurrent?: number;
  poles?: number;
  size: { w: number; h: number; d: number };
  mount: MountSurface;
  doorCutout?: DoorCutoutDef;
  /** Thiết bị lắp tấm đế nhưng mặc định khoét cửa để lộ mặt (ví dụ mặt ACB). */
  cutoutDefault?: boolean;
  /** Lỗ bắt vít trên tấm đế, toạ độ so với góc dưới trái thiết bị (chưa xoay). */
  plateHoles: { x: number; y: number; d: number }[];
  clearance: number;
  price: number;
  isBreaker?: boolean;
  /** Màu hiển thị (đèn báo, nút nhấn). */
  color?: string;
  /** Lắp trên thanh ray DIN — các thiết bị DIN đặt sát nhau không cần khoảng hở. */
  din?: boolean;
}

export interface EnclosureConfig {
  H: number;
  W: number;
  D: number;
  sections: number;
  /** Chiều cao từng ngăn, từ TRÊN xuống DƯỚI. Tổng = H. */
  sectionHeights: number[];
  thickness: number;
  material: Material;
  doorType: DoorType;
  vent: VentType;
  base: BaseHeight;
  mounting: Mounting;
  /** Chiều mở cửa: bản lề bên trái/phải (cửa 1 cánh, cửa trong + ngoài). */
  hinge?: Hinge;
  lock?: LockType;
  /** Mã màu sơn RAL (chỉ áp dụng cho thép sơn tĩnh điện). */
  ral?: string;
  /** Cấp bảo vệ IP: chữ số thứ nhất (bụi) và thứ hai (nước). */
  ipDust?: number;
  ipWater?: number;
  /** Tủ treo: 4 tai treo hàn ngoài lưng (thay cho lỗ treo trên hậu). */
  brackets?: boolean;
  /** Lỗ đi cáp ở đáy: lỗ tròn knock-out, hoặc ô chữ nhật + tấm che bắt 4 bulông. */
  cableEntry?: 'knockout' | 'gland';
}

export interface PlacedDevice {
  uid: string;
  deviceId: string;
  /** Góc dưới trái của thiết bị trên mặt trước (toạ độ thân tủ, gốc ở góc dưới trái thân tủ). */
  x: number;
  y: number;
  rot: 0 | 90;
  mount: MountSurface;
  /** Có khoét cửa cho thiết bị này không (thiết bị gắn cửa: luôn có). */
  doorCutout: boolean;
  isMain?: boolean;
  label?: string;
  /** Nhóm thêm cùng lúc (wizard bước 6 hiển thị 1 dòng/nhóm). */
  batch?: string;
}

export interface BusbarConfig {
  ratedA: number;
  phases: Phases;
  position: 'top' | 'bottom';
  w: number;
  t: number;
  shape: 'straight' | 'Z';
  /** Hệ số đồng thời Ks dùng khi cộng dòng các nhánh. */
  diversity: number;
}

export interface AccessoryLine {
  id: string;
  qty: number;
  /** true = số lượng tự tính theo kích thước tủ. */
  auto: boolean;
}

export interface Project {
  id: string;
  name: string;
  customer: string;
  orderCode: string;
  drafter: string;
  createdAt: string;
  updatedAt: string;
  cabinetType: CabinetType;
  enclosure: EnclosureConfig;
  devices: PlacedDevice[];
  busbar: BusbarConfig;
  accessories: AccessoryLine[];
  sheetSize: SheetSize;
  // ---- thông tin đơn hàng (wizard bước 8) ----
  contact?: string;
  phone?: string;
  address?: string;
  province?: string;
  note?: string;
  status?: 'draft' | 'done';
  completedAt?: string;
  /** Ảnh render nhỏ (JPEG data URL) chụp từ khung 3D khi hoàn tất. */
  thumbnail?: string;
  filesGeneratedAt?: string;
}

export interface CabinetTemplate {
  id: CabinetType;
  name: string;
  description: string;
  enclosure: EnclosureConfig;
  busbarA: number;
}

export interface BendTable {
  note: string;
  /** Độ dày (chuỗi, ví dụ "1.5") → BD (mm) cho thép tấm, góc 90°. */
  steel: Record<string, number>;
  /** Độ dày thanh đồng → BD (mm). */
  copper: Record<string, number>;
}

export interface BusbarRow {
  ratedA: number;
  w: number;
  t: number;
}

export interface AccessoryDef {
  id: string;
  name: string;
  unit: string;
  price: number;
  spec: string;
}

export interface Pricing {
  note: string;
  steelPerKg: Record<Material, number>;
  copperPerKg: number;
  fabricationPerM2: number;
  /** Thuế VAT áp cho báo giá, ví dụ 0.1 = 10%. */
  vat: number;
  density: { steel: number; copper: number };
}

export interface Catalog {
  devices: DeviceDef[];
  templates: CabinetTemplate[];
  bend: BendTable;
  busbars: BusbarRow[];
  accessories: AccessoryDef[];
  pricing: Pricing;
}

export const SHEET_SIZES: Record<SheetSize, { w: number; h: number }> = {
  '1250x2500': { w: 2500, h: 1250 },
  '1500x3000': { w: 3000, h: 1500 },
};

export const MATERIAL_LABEL: Record<string, string> = {
  SPCC: 'Thép SPCC sơn tĩnh điện',
  GALV: 'Tôn mạ kẽm',
  INOX304: 'Inox 304',
  INOX201: 'Inox 201',
  CU: 'Đồng đỏ',
};

export function ipCode(e: EnclosureConfig): string {
  return `IP${e.ipDust ?? 4}${e.ipWater ?? 3}`;
}

/** IP ≥ 54 → cần ron cửa. */
export function needsGasket(e: EnclosureConfig): boolean {
  return (e.ipDust ?? 4) >= 5 && (e.ipWater ?? 3) >= 4;
}
