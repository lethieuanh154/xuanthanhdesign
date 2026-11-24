import { CabinetType, DeviceType } from '../geometry';

/** Nhóm thiết bị ở ô chọn thứ nhất của bước 6. */
export const DEVICE_GROUPS: { key: string; label: string; types: DeviceType[] }[] = [
  { key: 'ACB', label: 'ACB', types: ['ACB'] },
  { key: 'MCCB', label: 'MCCB', types: ['MCCB'] },
  { key: 'MCB', label: 'MCB', types: ['MCB'] },
  { key: 'DO', label: 'Đo lường', types: ['METER_V', 'METER_A', 'METER_MULTI', 'CT'] },
  { key: 'DK', label: 'Điều khiển', types: ['PILOT_LAMP', 'PUSH_BUTTON', 'SELECTOR', 'CONTACTOR', 'PFR'] },
  { key: 'BV', label: 'Bảo vệ', types: ['PHASE_RELAY', 'EARTH_RELAY', 'FUSE'] },
  { key: 'TB', label: 'Tụ bù', types: ['CAPACITOR'] },
];

/** "Chèn bộ mẫu": bộ thiết bị điển hình theo loại tủ (deviceId, số lượng). */
export const DEVICE_PRESETS: Record<CabinetType, [string, number][]> = {
  ATS: [
    ['mccb-4p-100', 1],
    ['mccb-4p-100', 1],
    ['meter-multi', 1],
    ['lamp-red', 1],
    ['lamp-yellow', 1],
    ['lamp-blue', 1],
    ['selector-v', 1],
  ],
  // tổng nhánh (2×32 + 3×16) × Ks 0.8 = 89.6 A ≤ aptomat tổng 100 A
  DB: [
    ['mccb-3p-100', 1],
    ['mcb-3p-32', 2],
    ['mcb-1p-16', 3],
    ['lamp-red', 1],
    ['lamp-yellow', 1],
    ['lamp-blue', 1],
  ],
  MSB: [
    ['acb-3p-800', 1],
    ['mccb-3p-250', 4],
    ['meter-multi', 1],
    ['meter-v', 1],
    ['meter-a', 1],
    ['lamp-red', 1],
    ['lamp-yellow', 1],
    ['lamp-blue', 1],
    ['ct-200', 3],
  ],
  // theo tủ 2 lớp thực tế của xưởng: 2 MCCB nguồn xếp chồng, MCCB 4P Schneider, relay pha, cầu chì, ZCT;
  // cửa ngoài: 2 relay chạm đất Mikro, đồng hồ Volt + công tắc chuyển mạch, 3 đèn báo
  '2L': [
    ['mccb-3p-100', 1],
    ['mccb-3p-100', 1],
    ['mccb-4p-100-cvs', 1],
    ['mcb-2p-6', 1],
    ['relay-phase', 1],
    ['fuse-3p', 1],
    ['zct-80', 2],
    ['elr-mikro', 2],
    ['meter-v', 1],
    ['selector-v', 1],
    ['lamp-red', 1],
    ['lamp-yellow', 1],
    ['lamp-blue', 1],
  ],
  CAP: [
    ['mccb-3p-400', 1],
    ['pfr-6', 1],
    ['contactor-40', 6],
    ['cap-20', 6],
    ['lamp-red', 1],
    ['lamp-yellow', 1],
    ['lamp-blue', 1],
  ],
};

export const COMMON_SIZES: { H: number; W: number; D: number }[] = [
  { H: 600, W: 400, D: 200 },
  { H: 800, W: 600, D: 250 },
  { H: 1000, W: 800, D: 300 },
  { H: 1800, W: 700, D: 500 },
  { H: 2000, W: 800, D: 600 },
];

export const SIZE_LIMITS = { H: [400, 2200], W: [300, 1200], D: [150, 800] } as const;

export const IP_DUST: { v: number; label: string }[] = [
  { v: 2, label: '2 — vật > 12 mm' },
  { v: 3, label: '3 — vật > 2,5 mm' },
  { v: 4, label: '4 — vật > 1 mm' },
  { v: 5, label: '5 — chống bụi' },
  { v: 6, label: '6 — kín bụi hoàn toàn' },
];

export const IP_WATER: { v: number; label: string }[] = [
  { v: 0, label: '0 — không chống nước' },
  { v: 1, label: '1 — nước nhỏ giọt' },
  { v: 2, label: '2 — nhỏ giọt nghiêng 15°' },
  { v: 3, label: '3 — mưa phun' },
  { v: 4, label: '4 — tia nước bắn mọi hướng' },
  { v: 5, label: '5 — vòi phun nước' },
  { v: 6, label: '6 — vòi phun mạnh' },
];

/** Phụ kiện chọn bằng checkbox ở bước 7 (các phụ kiện khác tự tính theo cấu hình). */
export const OPTIONAL_ACCESSORIES = ['ray-din', 'mang-dien', 'den-tu', 'quat', 'o-cam'];

export const PROVINCES = ['Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Thừa Thiên Huế', 'Quảng Trị', 'Bình Định', 'Khánh Hoà', 'Hà Nội', 'TP. Hồ Chí Minh', 'Gia Lai', 'Đắk Lắk'];
