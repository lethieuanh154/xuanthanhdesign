import { Catalog, ipCode, Project } from '../geometry';

const MAT: Record<string, string> = {
  SPCC: 'thép sơn tĩnh điện',
  GALV: 'tôn mạ kẽm',
  INOX304: 'inox 304',
  INOX201: 'inox 201',
};
const DOOR: Record<string, string> = { single: '1 cánh', double: '2 cánh', inner_outer: 'cửa trong + ngoài', two_layer: '2 lớp (cửa ngoài + cửa trong khoét ô)' };
const LOCK: Record<string, string> = { handle: 'khóa tay nắm', square: 'khóa vuông', key: 'khóa có chìa' };
const VENT: Record<string, string> = { none: '', bottom: 'khe gió hông dưới', top_bottom: 'khe gió hông trên + dưới', fan: 'quạt hút có lọc', side_vertical: 'khe gió đứng 2 hông' };

/** Mô tả 1 đoạn tự sinh cho thẻ "Cấu hình của bạn" và báo giá. */
export function describeProject(p: Project, cat: Catalog): string {
  const e = p.enclosure;
  const tpl = cat.templates.find((t) => t.id === p.cabinetType);
  const parts: string[] = [];
  parts.push(`${tpl?.name ?? 'Tủ điện'} ${e.H}×${e.W}×${e.D}${e.base ? ` (khung đế ${e.base})` : ''}`);
  parts.push(`${MAT[e.material]} ${e.thickness}mm${e.material === 'SPCC' ? ` RAL ${e.ral ?? '7035'}` : ''}`);
  parts.push(ipCode(e));
  parts.push(`${DOOR[e.doorType]} ${LOCK[e.lock ?? 'handle']}`);
  if (VENT[e.vent]) parts.push(VENT[e.vent]);
  if (e.mounting === 'wall' && e.brackets) parts.push('4 tai treo ngoài');
  if (e.cableEntry === 'gland') parts.push('tấm che lỗ cáp đáy');
  // gom thiết bị: đèn báo gộp các màu
  const counts = new Map<string, number>();
  for (const d of p.devices) {
    const def = cat.devices.find((x) => x.id === d.deviceId);
    if (!def) continue;
    const name = def.type === 'PILOT_LAMP' ? 'đèn báo Ø22' : def.name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const [n, q] of counts) parts.push(`${q} ${n}`);
  parts.push(`thanh cái ${p.busbar.ratedA}A ${p.busbar.phases}`);
  return parts.join(', ') + '.';
}
