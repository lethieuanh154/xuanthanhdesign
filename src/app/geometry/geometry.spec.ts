import DxfParser from 'dxf-parser';
import devicesJson from '../../assets/data/devices.json';
import templatesJson from '../../assets/data/templates.json';
import bendJson from '../../assets/data/bend-table.json';
import busbarJson from '../../assets/data/busbar.json';
import accessoriesJson from '../../assets/data/accessories.json';
import pricingJson from '../../assets/data/pricing.json';
import {
  bboxH,
  bboxW,
  bendDeduction,
  Catalog,
  CabinetTemplate,
  computeBom,
  computeLayout,
  coverWindows,
  createProject,
  DeviceDef,
  dxfFileName,
  flangedPanel,
  flatLength,
  generateParts,
  holeBBox,
  nestParts,
  partToDxf,
  partsToCombinedDxf,
  PlacedDevice,
  Project,
  runRules,
  SHEET_SIZES,
  tessellate,
} from './index';

const cat: Catalog = {
  devices: devicesJson.devices as DeviceDef[],
  templates: templatesJson.templates as CabinetTemplate[],
  bend: bendJson as Catalog['bend'],
  busbars: busbarJson.busbars,
  accessories: accessoriesJson.accessories,
  pricing: pricingJson as Catalog['pricing'],
};

function place(id: string, x: number, y: number, mount: 'plate' | 'door', uid: string): PlacedDevice {
  return { uid, deviceId: id, x, y, rot: 0, mount, doorCutout: mount === 'door' };
}

/** Dựng kịch bản nghiệm thu: tủ ATS 800×600×250, tôn 1.5. */
function atsProject(mccbGap = 60): Project {
  const tpl = cat.templates.find((t) => t.id === 'ATS')!;
  const p = createProject(cat, tpl, { orderCode: 'DH-2611-01' });
  p.enclosure.thickness = 1.5;
  p.busbar.position = 'top';
  p.devices = [
    place('mccb-4p-100', 120, 150, 'plate', 'm1'),
    place('mccb-4p-100', 120 + 100 + mccbGap, 150, 'plate', 'm2'),
    place('meter-multi', 252, 560, 'door', 'pm'),
    place('lamp-red', 200, 470, 'door', 'l1'),
    place('lamp-yellow', 285, 470, 'door', 'l2'),
    place('lamp-blue', 370, 470, 'door', 'l3'),
    place('selector-v', 276, 380, 'door', 'sw'),
  ];
  return p;
}

describe('Trải phẳng (bend.ts / panel.ts)', () => {
  it('tra bảng BD và nội suy', () => {
    expect(bendDeduction(cat.bend, 'steel', 1.5)).toBe(2.6);
    expect(bendDeduction(cat.bend, 'steel', 1.75)).toBeCloseTo(3.05, 2);
  });

  it('L = Σ kích thước ngoài − n·BD', () => {
    expect(flatLength([20, 250, 20], 2.6)).toBeCloseTo(284.8, 6);
  });

  it('tấm gấp mép 4 cạnh có kích thước trải phẳng đúng', () => {
    const g = flangedPanel({
      faceW: 250,
      faceH: 800,
      bd: 2.6,
      relief: 2.5,
      flanges: { bottom: [{ len: 20, dir: 'UP' }], right: [{ len: 20, dir: 'UP' }], top: [{ len: 20, dir: 'UP' }], left: [{ len: 20, dir: 'UP' }] },
    });
    expect(bboxW(g.bbox)).toBeCloseTo(284.8, 2);
    expect(bboxH(g.bbox)).toBeCloseTo(834.8, 2);
    expect(g.bendLines.length).toBe(4);
    expect(g.outline.closed).toBe(true);
    // hình chữ thập + 4 ô relief: mỗi góc 3 điểm (2 đầu mép + 1 điểm khoét) → 12 đỉnh
    expect(g.outline.pts.length).toBe(12);
    expect(g.outline.pts).toContainEqual({ x: 21.2, y: 21.2 });
  });
});

describe('Sinh chi tiết (templates.ts)', () => {
  const p = atsProject();
  const parts = generateParts(p, cat);

  it('có đủ các chi tiết chính', () => {
    const codes = parts.map((x) => x.code);
    for (const c of ['HONG-T', 'HONG-P', 'HAU', 'NOC', 'DAY', 'CUA', 'TAM-DE', 'CB-PHA']) expect(codes).toContain(c);
  });

  it('cửa gấp mép hồi: rộng = 594 + 2·(20+12) − 4·BD', () => {
    const door = parts.find((x) => x.code === 'CUA')!;
    expect(bboxW(door.bbox)).toBeCloseTo(594 + 64 - 4 * 2.6, 2);
    expect(door.bendLines.length).toBe(8);
  });

  it('cửa có lỗ khoét đúng vị trí thiết bị (đổi toạ độ thân tủ → trải phẳng)', () => {
    const door = parts.find((x) => x.code === 'CUA')!;
    const pm = door.holes.find((h) => h.ref === 'pm')!;
    const bb = holeBBox(pm);
    expect(bb.maxX - bb.minX).toBeCloseTo(92, 3);
    // tâm đồng hồ trên thân tủ: x = 252 + 48 = 300; lá cửa bắt đầu ở x = 3; offset trải phẳng = mép (20+12) − 2·BD + BD/2... kiểm tra lệch hằng số
    const layout = computeLayout(p.enclosure, p.busbar);
    const leaf = layout.leaves[0];
    const lamp = door.holes.find((h) => h.ref === 'l1')!;
    const lb = holeBBox(lamp);
    const dxPm = (bb.minX + bb.maxX) / 2 - (300 - leaf.rect.x);
    const dxLamp = (lb.minX + lb.maxX) / 2 - (215 - leaf.rect.x);
    expect(dxPm).toBeCloseTo(dxLamp, 6);
    expect(door.holes.filter((h) => h.ref).length).toBe(5);
  });

  it('tấm đế có lỗ bắt MCCB', () => {
    const plate = parts.find((x) => x.code === 'TAM-DE')!;
    expect(plate.holes.filter((h) => h.ref === 'm1').length).toBe(2);
  });
});

describe('Bộ luật kiểm tra (rules.ts)', () => {
  const errorsFor = (p: Project) => {
    const parts = generateParts(p, cat);
    return runRules(p, cat, computeLayout(p.enclosure, p.busbar), parts).filter((r) => r.level === 'error');
  };

  it('kịch bản demo đặt hợp lệ → không lỗi', () => {
    expect(errorsFor(atsProject(60)).map((r) => r.message)).toEqual([]);
  });

  it('2 MCCB đặt sát nhau → báo lỗi trên cả 2 thiết bị', () => {
    const errs = errorsFor(atsProject(5));
    const hit = errs.find((r) => r.rule === 'clearance');
    expect(hit).toBeTruthy();
    expect(hit!.targetIds).toEqual(['m1', 'm2']);
  });

  it('2 MCCB chồng lấn → lỗi chồng lấn', () => {
    expect(errorsFor(atsProject(-30)).some((r) => r.rule === 'collision')).toBe(true);
  });

  it('lỗ khoét gần mép cửa < 30mm → lỗi', () => {
    const p = atsProject();
    p.devices.push(place('lamp-red', 10, 300, 'door', 'edge'));
    expect(errorsFor(p).some((r) => r.rule === 'door-edge' && r.targetIds.includes('edge'))).toBe(true);
  });

  it('ACB trong ngăn thấp < 500 → lỗi', () => {
    const tpl = cat.templates.find((t) => t.id === 'MSB')!;
    const p = createProject(cat, tpl);
    p.enclosure.sectionHeights = [400, 800, 800];
    p.devices = [place('acb-3p-800', 260, 1630, 'plate', 'acb')];
    expect(errorsFor(p).some((r) => r.rule === 'acb-section')).toBe(true);
  });

  it('chi tiết vượt khổ tôn → lỗi', () => {
    const tpl = cat.templates.find((t) => t.id === 'MSB')!;
    const p = createProject(cat, tpl);
    p.sheetSize = '1250x2500';
    p.enclosure.H = 2600;
    p.enclosure.sectionHeights = [600, 1000, 1000];
    expect(errorsFor(p).some((r) => r.rule === 'sheet')).toBe(true);
  });
});

describe('Xuất DXF (dxf.ts) — xuất rồi parse lại', () => {
  const p = atsProject();
  const parts = generateParts(p, cat);
  const parser = new DxfParser();

  it('DXF cửa: đúng layer, đúng số entity, polyline khép kín, kích thước đúng', () => {
    const door = parts.find((x) => x.code === 'CUA')!;
    const text = partToDxf(door);
    const dxf = parser.parseSync(text)!;
    expect(dxf.header['$INSUNITS']).toBe(4);
    const layers = dxf.tables['layer'].layers as Record<string, { color: number; colorIndex: number }>;
    expect(layers['CUT'].colorIndex).toBe(3);
    expect(layers['BEND_UP'].colorIndex).toBe(6);
    expect(layers['BEND_DOWN'].colorIndex).toBe(5);
    expect(layers['MARK'].colorIndex).toBe(2);
    expect(layers['TEXT'].colorIndex).toBe(7);
    const ents = dxf.entities as unknown as { type: string; layer: string; shape?: boolean; vertices?: { x: number; y: number }[] }[];
    const polys = ents.filter((e) => e.type === 'POLYLINE');
    const circles = ents.filter((e) => e.type === 'CIRCLE');
    const lines = ents.filter((e) => e.type === 'LINE');
    expect(polys.length + circles.length).toBe(1 + door.holes.length);
    expect(lines.length).toBe(door.bendLines.length);
    expect(polys.every((e) => e.shape === true)).toBe(true);
    expect(ents.some((e) => e.type === 'SPLINE')).toBe(false);
    expect(lines.every((e) => e.layer === 'BEND_UP' || e.layer === 'BEND_DOWN')).toBe(true);
    // gốc (0,0) ở góc dưới trái, kích thước = bbox trải phẳng
    const outline = polys[0].vertices!;
    const xs = outline.map((v) => v.x),
      ys = outline.map((v) => v.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(bboxW(door.bbox), 3);
  });

  it('không có đoạn biên dạng trùng lặp', () => {
    for (const part of parts) {
      const seen = new Set<string>();
      const pts = part.outline.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
          b = pts[(i + 1) % pts.length];
        const k = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('|');
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        expect(a.x === b.x && a.y === b.y).toBe(false);
      }
    }
  });

  it('DXF gộp parse được, có nhãn tên từng chi tiết', () => {
    const dxf = parser.parseSync(partsToCombinedDxf(parts, p.orderCode))!;
    const ents = dxf.entities as unknown as { type: string; layer: string }[];
    expect(ents.filter((e) => e.type === 'POLYLINE' && e.layer === 'CUT').length).toBeGreaterThanOrEqual(parts.length);
    expect(ents.filter((e) => e.type === 'TEXT').length).toBeGreaterThanOrEqual(parts.length);
  });

  it('tên file theo quy ước', () => {
    const door = parts.find((x) => x.code === 'CUA')!;
    expect(dxfFileName(p.orderCode, door)).toBe('DH-2611-01_CUA_Cua_1.5mm_SL1.dxf');
  });

  it('bulge oblong rải thành cung đúng bán kính', () => {
    const side = parts.find((x) => x.code === 'HONG-T')!;
    const slot = side.holes.find((h) => h.kind === 'poly')!;
    const bb = holeBBox(slot);
    expect(bb.maxY - bb.minY).toBeCloseTo(8, 1);
    expect(bb.maxX - bb.minX).toBeCloseTo(60, 1);
    expect(tessellate(slot as never).length).toBeGreaterThan(10);
  });
});

describe('Sắp tôn & BOM', () => {
  const p = atsProject();
  const parts = generateParts(p, cat);

  it('xếp được, % sử dụng trong (0,1]', () => {
    const groups = nestParts(parts, SHEET_SIZES['1250x2500']);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.unplaced).toEqual([]);
      expect(g.sheets.length).toBeGreaterThan(0);
      expect(g.utilization).toBeGreaterThan(0);
      expect(g.utilization).toBeLessThanOrEqual(1);
      // không chồng nhau trên cùng tấm
      for (const s of g.sheets) {
        for (let i = 0; i < s.placements.length; i++)
          for (let j = i + 1; j < s.placements.length; j++) {
            const a = s.placements[i],
              b = s.placements[j];
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap).toBe(false);
          }
      }
    }
  });

  it('BOM có thiết bị, tôn (kg = m² × dày × 7.85), phụ kiện, tổng tiền', () => {
    const bom = computeBom(p, cat, parts);
    expect(bom.rows.filter((r) => r.category === 'Thiết bị').reduce((s, r) => s + r.qty, 0)).toBe(7);
    const s15 = bom.sheets.find((s) => s.thickness === 1.5)!;
    expect(s15.kg).toBeCloseTo(s15.areaM2 * 1.5 * 7.85, 0);
    expect(bom.rows.some((r) => r.category === 'Phụ kiện')).toBe(true);
    expect(bom.total).toBe(bom.rows.reduce((s, r) => s + r.amount, 0));
  });
});

describe('Tủ 2 lớp (cửa ngoài + cửa trong khoét ô)', () => {
  const make = (): Project => {
    const tpl = cat.templates.find((t) => t.id === '2L')!;
    const p = createProject(cat, tpl, { orderCode: 'XT-2611-0009' });
    p.devices = [
      place('mccb-3p-100', 60, 300, 'plate', 'm1'),
      place('mccb-3p-100', 60, 150, 'plate', 'm2'),
      place('mccb-4p-100-cvs', 170, 250, 'plate', 'cvs'),
      place('mcb-2p-6', 330, 380, 'plate', 'mcb'),
      place('fuse-3p', 366, 380, 'plate', 'fuse'),
      place('relay-phase', 330, 280, 'plate', 'rl'),
      place('zct-80', 200, 60, 'plate', 'z1'),
      place('zct-80', 330, 110, 'plate', 'z2'),
      place('elr-mikro', 60, 600, 'door', 'e1'),
      place('elr-mikro', 180, 600, 'door', 'e2'),
      place('meter-v', 300, 600, 'door', 'v'),
      place('selector-v', 60, 480, 'door', 'sw'),
      place('lamp-red', 140, 500, 'door', 'l1'),
      place('lamp-yellow', 190, 500, 'door', 'l2'),
      place('lamp-blue', 240, 500, 'door', 'l3'),
    ];
    return p;
  };

  it('sinh đủ chi tiết: cửa trong, gân cửa, 4 tai treo, tấm che đáy', () => {
    const parts = generateParts(make(), cat);
    const by = (c: string) => parts.find((x) => x.code === c);
    expect(by('CUA-TRONG')).toBeTruthy();
    expect(by('GAN-CUA')?.qty).toBe(2);
    expect(by('TAI-TREO')?.qty).toBe(4);
    expect(by('TAM-CHE-DAY')?.holes.length).toBe(4);
    expect(by('CUA-NGOAI')).toBeTruthy();
    // tai treo ngoài → hậu không còn 4 lỗ treo oblong
    expect(by('HAU')!.holes.filter((h) => h.kind === 'poly').length).toBe(0);
  });

  it('cửa ngoài chỉ khoét cho thiết bị gắn cửa; cửa trong khoét ô lộ aptomat, gộp ô sát nhau', () => {
    const p = make();
    const parts = generateParts(p, cat);
    const door = parts.find((x) => x.code === 'CUA-NGOAI')!;
    expect(door.holes.filter((h) => h.ref).map((h) => h.ref).sort()).toEqual(['e1', 'e2', 'l1', 'l2', 'l3', 'sw', 'v']);
    const wins = coverWindows(p, cat);
    // m1, m2, cvs, relay riêng; MCB + cầu chì đặt sát nhau (ray DIN) gộp thành 1 ô; ZCT không cần ô
    expect(wins.length).toBe(5);
    const merged = wins.find((w) => w.uids.includes('mcb'))!;
    expect(merged.uids.sort()).toEqual(['fuse', 'mcb']);
    expect(merged.rect.w).toBeCloseTo(36 + 54 + 4, 1);
    const cover = parts.find((x) => x.code === 'CUA-TRONG')!;
    expect(cover.holes.filter((h) => h.kind === 'poly').length).toBe(5);
  });

  it('bố trí mẫu không có lỗi; ô khoét sát mép cửa trong → lỗi', () => {
    const p = make();
    const errs = (pp: Project) => runRules(pp, cat, computeLayout(pp.enclosure, pp.busbar), generateParts(pp, cat)).filter((r) => r.level === 'error');
    expect(errs(p).map((r) => r.message)).toEqual([]);
    p.devices.find((d) => d.uid === 'm2')!.x = 42;
    p.devices.find((d) => d.uid === 'm2')!.y = 42;
    expect(errs(p).some((r) => r.rule === 'cover-window' || r.rule === 'mount-area')).toBe(true);
  });

  it('DXF cửa trong parse lại được, biên dạng khép kín, đúng layer', () => {
    const cover = generateParts(make(), cat).find((x) => x.code === 'CUA-TRONG')!;
    const dxf = new DxfParser().parseSync(partToDxf(cover))!;
    const ents = dxf.entities as unknown as { type: string; layer: string; shape?: boolean }[];
    const polys = ents.filter((e) => e.type === 'POLYLINE');
    expect(polys.every((e) => e.shape && e.layer === 'CUT')).toBe(true);
    expect(polys.length + ents.filter((e) => e.type === 'CIRCLE').length).toBe(1 + cover.holes.length);
    expect(ents.filter((e) => e.type === 'LINE').length).toBe(4);
  });
});
