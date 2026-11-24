import { AccessoryDef, Catalog, MATERIAL_LABEL, Project } from './model';
import { Part } from './types';
import { bboxH, bboxW, r2 } from './math';
import { hingeCount } from './templates';
import { computeLayout } from './layout';

export interface BomRow {
  category: 'Thiết bị' | 'Tôn' | 'Đồng' | 'Gia công' | 'Phụ kiện';
  code: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface SheetSummary {
  material: string;
  thickness: number;
  areaM2: number;
  kg: number;
}

export interface BomResult {
  rows: BomRow[];
  sheets: SheetSummary[];
  sheetAreaM2: number;
  sheetKg: number;
  copperKg: number;
  deviceCount: number;
  total: number;
}

/**
 * KHỐI LƯỢNG:
 *  - Tôn: kg = diện tích bao trải phẳng (m²) × độ dày (mm) × 7.85 (tỉ trọng thép, kg/dm³)
 *    (dùng diện tích hình bao vì đó là lượng tôn tiêu hao thực tế khi cắt).
 *  - Đồng: kg = rộng × dày × dài (mm³) × 8.9e-6.
 */
export function computeBom(p: Project, cat: Catalog, parts: Part[]): BomResult {
  const rows: BomRow[] = [];
  // 1. Thiết bị
  const devCount = new Map<string, number>();
  for (const d of p.devices) devCount.set(d.deviceId, (devCount.get(d.deviceId) ?? 0) + 1);
  for (const [id, qty] of devCount) {
    const def = cat.devices.find((d) => d.id === id);
    if (!def) continue;
    rows.push({
      category: 'Thiết bị',
      code: def.model,
      name: def.name,
      spec: `${def.brand} ${def.series}${def.ratedCurrent ? ` ${def.ratedCurrent}A` : ''}${def.poles ? ` ${def.poles}P` : ''}`,
      unit: 'cái',
      qty,
      unitPrice: def.price,
      amount: def.price * qty,
    });
  }
  // 2. Tôn theo vật liệu + độ dày
  const dens = cat.pricing.density;
  const sheetMap = new Map<string, SheetSummary>();
  let copperKg = 0;
  for (const part of parts) {
    const a = (bboxW(part.bbox) * bboxH(part.bbox) * part.qty) / 1e6;
    if (part.material === 'CU') {
      copperKg += bboxW(part.bbox) * bboxH(part.bbox) * part.thickness * part.qty * dens.copper * 1e-6;
      continue;
    }
    const key = `${part.material}|${part.thickness}`;
    const cur = sheetMap.get(key) ?? { material: part.material, thickness: part.thickness, areaM2: 0, kg: 0 };
    cur.areaM2 += a;
    cur.kg += a * part.thickness * dens.steel;
    sheetMap.set(key, cur);
  }
  const sheets = [...sheetMap.values()].map((s) => ({ ...s, areaM2: r2(s.areaM2), kg: r2(s.kg) }));
  for (const s of sheets) {
    const price = cat.pricing.steelPerKg[s.material as 'SPCC' | 'INOX304'] ?? cat.pricing.steelPerKg.SPCC;
    rows.push({ category: 'Tôn', code: `TON-${s.material}-${s.thickness}`, name: `Tôn ${MATERIAL_LABEL[s.material] ?? s.material} dày ${s.thickness} mm`, spec: `${s.areaM2} m²`, unit: 'kg', qty: s.kg, unitPrice: price, amount: Math.round(s.kg * price) });
  }
  const sheetAreaM2 = r2(sheets.reduce((a, s) => a + s.areaM2, 0));
  copperKg = r2(copperKg);
  if (copperKg > 0) {
    rows.push({ category: 'Đồng', code: 'CU-BAR', name: `Thanh cái đồng ${p.busbar.w}×${p.busbar.t}`, spec: `${p.busbar.phases}, ${p.busbar.ratedA} A`, unit: 'kg', qty: copperKg, unitPrice: cat.pricing.copperPerKg, amount: Math.round(copperKg * cat.pricing.copperPerKg) });
  }
  if (sheetAreaM2 > 0) {
    rows.push({ category: 'Gia công', code: 'GC', name: 'Gia công cắt laser – chấn – hàn – sơn', spec: `${sheetAreaM2} m²`, unit: 'm²', qty: sheetAreaM2, unitPrice: cat.pricing.fabricationPerM2, amount: Math.round(sheetAreaM2 * cat.pricing.fabricationPerM2) });
  }
  // 3. Phụ kiện
  for (const line of p.accessories) {
    const def = cat.accessories.find((a) => a.id === line.id);
    if (!def || line.qty <= 0) continue;
    rows.push({ category: 'Phụ kiện', code: def.id.toUpperCase(), name: def.name, spec: def.spec, unit: def.unit, qty: line.qty, unitPrice: def.price, amount: Math.round(line.qty * def.price) });
  }
  return {
    rows,
    sheets,
    sheetAreaM2,
    sheetKg: r2(sheets.reduce((a, s) => a + s.kg, 0)),
    copperKg,
    deviceCount: p.devices.length,
    total: rows.reduce((s, r) => s + r.amount, 0),
  };
}

/** Gợi ý số lượng phụ kiện theo kích thước tủ. */
export function suggestAccessoryQty(p: Project, def: AccessoryDef, cat: Catalog): number {
  const e = p.enclosure;
  const layout = computeLayout(e, p.busbar);
  const leaves = layout.leaves;
  const outerLeaves = leaves.filter((l) => l.id !== 'inner');
  switch (def.id) {
    case 'tay-nam':
      return leaves.filter((l) => l.hasLock).length;
    case 'khoa':
      return leaves.filter((l) => l.hasLock).length + (e.doorType === 'double' ? 1 : 0);
    case 'ban-le':
      return leaves.reduce((s, l) => s + hingeCount(l.rect.h), 0);
    case 'ron':
      return r2(outerLeaves.reduce((s, l) => s + (2 * (l.rect.w + l.rect.h)) / 1000, 0));
    case 'oc-vit':
      return 1;
    case 'ray-din': {
      const din = p.devices.filter((d) => cat.devices.find((x) => x.id === d.deviceId)?.din).length;
      return din > 0 ? r2(Math.ceil((layout.plate.w - 40) / 100) / 10) : 0;
    }
    case 'mang-dien':
      return r2((2 * (layout.plate.w + layout.plate.h)) / 1000);
    default:
      return 0;
  }
}

export function suggestAccessories(p: Project, cat: Catalog): { id: string; qty: number }[] {
  return cat.accessories.map((a) => ({ id: a.id, qty: suggestAccessoryQty(p, a, cat) }));
}
