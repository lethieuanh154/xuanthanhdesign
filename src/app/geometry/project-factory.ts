import { BusbarConfig, CabinetTemplate, Catalog, Project } from './model';
import { suggestAccessories } from './bom';

export function uid(prefix = 'd'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Gợi ý kích thước thanh cái theo dòng định mức (bảng busbar.json). */
export function suggestBusbar(cat: Catalog, ratedA: number): { w: number; t: number; ratedA: number } {
  const rows = [...cat.busbars].sort((a, b) => a.ratedA - b.ratedA);
  const row = rows.find((r) => r.ratedA >= ratedA) ?? rows[rows.length - 1];
  return { w: row.w, t: row.t, ratedA: row.ratedA };
}

export function orderCodeNow(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const n = String(Math.floor(Math.random() * 90) + 10);
  return `DH-${dd}${mm}-${n}`;
}

export function createProject(cat: Catalog, tpl: CabinetTemplate, base?: Partial<Project>): Project {
  const bb = suggestBusbar(cat, tpl.busbarA);
  const busbar: BusbarConfig = {
    ratedA: bb.ratedA,
    phases: '3P+N+PE',
    position: 'top',
    w: bb.w,
    t: bb.t,
    shape: 'straight',
    diversity: 0.8,
  };
  const now = new Date().toISOString();
  const p: Project = {
    id: base?.id ?? uid('p'),
    name: base?.name ?? `${tpl.name}`,
    customer: base?.customer ?? 'Cty ABC',
    orderCode: base?.orderCode ?? orderCodeNow(),
    drafter: base?.drafter ?? 'KS. Xuân Thành',
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    cabinetType: tpl.id,
    enclosure: structuredClone(tpl.enclosure),
    devices: [],
    busbar,
    accessories: [],
    // khổ tôn máy laser của xưởng (theo ảnh màn hình CAM: 1500×3000)
    sheetSize: '1500x3000',
  };
  p.accessories = suggestAccessories(p, cat).map((a) => ({ ...a, auto: true }));
  return p;
}
