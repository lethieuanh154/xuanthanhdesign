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
  CabinetTemplate,
  Catalog,
  createProject,
  detectParts,
  DeviceDef,
  DxfDocLike,
  explodeDxf,
  generateParts,
  packRects,
  partsToCombinedDxf,
} from './index';
import { DwgDatabaseLike, dwgDatabaseToDoc, DwgEntityLike } from './dwg-import';

const cat: Catalog = {
  devices: devicesJson.devices as DeviceDef[],
  templates: templatesJson.templates as CabinetTemplate[],
  bend: bendJson as Catalog['bend'],
  busbars: busbarJson.busbars,
  accessories: accessoriesJson.accessories,
  pricing: pricingJson as Catalog['pricing'],
};

const parse = (text: string): DxfDocLike => new DxfParser().parseSync(text) as unknown as DxfDocLike;

/** DXF tối thiểu viết tay: HEADER (mm) + BLOCKS + ENTITIES. */
function dxf(blocks: string[][], entities: string[][]): string {
  const out: string[] = [];
  const g = (c: number, v: string | number): void => void out.push(String(c), String(v));
  g(0, 'SECTION'), g(2, 'HEADER'), g(9, '$INSUNITS'), g(70, 4), g(0, 'ENDSEC');
  g(0, 'SECTION'), g(2, 'BLOCKS');
  for (const b of blocks) out.push(...b);
  g(0, 'ENDSEC');
  g(0, 'SECTION'), g(2, 'ENTITIES');
  for (const e of entities) out.push(...e);
  g(0, 'ENDSEC'), g(0, 'EOF');
  return out.join('\n') + '\n';
}
const line = (layer: string, x1: number, y1: number, x2: number, y2: number): string[] =>
  ['0', 'LINE', '8', layer, '10', `${x1}`, '20', `${y1}`, '30', '0', '11', `${x2}`, '21', `${y2}`, '31', '0'];
const arc = (layer: string, cx: number, cy: number, r: number, a0: number, a1: number): string[] =>
  ['0', 'ARC', '8', layer, '10', `${cx}`, '20', `${cy}`, '30', '0', '40', `${r}`, '50', `${a0}`, '51', `${a1}`];
const circle = (layer: string, cx: number, cy: number, r: number): string[] => ['0', 'CIRCLE', '8', layer, '10', `${cx}`, '20', `${cy}`, '30', '0', '40', `${r}`];
const text = (layer: string, s: string): string[] => ['0', 'TEXT', '8', layer, '10', '0', '20', '0', '30', '0', '40', '5', '1', s];

const ALL = (ex: ReturnType<typeof explodeDxf>): Set<string> => new Set(ex.layers.map((l) => l.name));

describe('Nhập DXF (dxf-import.ts)', () => {
  it('DXF gộp do app xuất: nhận lại đủ chi tiết, đúng kích thước và số lỗ', () => {
    const p = createProject(cat, cat.templates.find((t) => t.id === 'ATS')!, { orderCode: 'T-01' });
    const parts = generateParts(p, cat).filter((x) => x.nestable);
    const ex = explodeDxf(parse(partsToCombinedDxf(parts, 'T-01')));
    expect(ex.unitScale).toBe(1);
    expect(ex.skipped['TEXT']).toBeGreaterThan(0);

    const res = detectParts(ex, { cutLayers: new Set(['CUT']), showLayers: new Set(['BEND_UP', 'BEND_DOWN']), tol: 0.05, minSize: 5 });
    expect(res.parts.length).toBe(parts.length);
    // mỗi chi tiết gốc khớp đúng 1 chi tiết nhận dạng (kích thước ±0,05, số lỗ, số đường chấn)
    const pool = [...res.parts];
    for (const src of parts) {
      const k = pool.findIndex(
        (q) => Math.abs(q.w - bboxW(src.bbox)) < 0.05 && Math.abs(q.h - bboxH(src.bbox)) < 0.05 && q.holes.length === src.holes.length && q.lines.length === src.bendLines.length,
      );
      expect(k, `không khớp ${src.code} ${bboxW(src.bbox)}×${bboxH(src.bbox)} lỗ=${src.holes.length}`).toBeGreaterThanOrEqual(0);
      pool.splice(k, 1);
    }
    expect(res.ignored.length).toBe(0);
    expect(res.approxCount).toBe(0);
  });

  it('Mọi layer là layer cắt: đường chấn hở vẫn được gán vào chi tiết, không sinh chi tiết thừa', () => {
    const p = createProject(cat, cat.templates.find((t) => t.id === 'DB')!, { orderCode: 'T-02' });
    const parts = generateParts(p, cat).filter((x) => x.nestable);
    const ex = explodeDxf(parse(partsToCombinedDxf(parts, 'T-02')));
    const all = ALL(ex);
    const res = detectParts(ex, { cutLayers: all, showLayers: all, tol: 0.05, minSize: 5 });
    expect(res.parts.length).toBe(parts.length);
    expect(res.parts.reduce((s, q) => s + q.cuts.filter((c) => !c.closed).length, 0)).toBe(parts.reduce((s, q) => s + q.bendLines.length, 0));
  });

  it('Nối nét rời (LINE ngược chiều, vẽ trùng, ARC) thành vòng kín; lỗ tròn + lỗ oblong', () => {
    const ents = [
      // tấm 300×200 vẽ bằng 4 LINE, 1 cạnh ngược chiều, 1 cạnh vẽ trùng 2 lần, sai lệch đầu mút 0,02 mm
      line('CAT', 0, 0, 300, 0),
      line('CAT', 300, 200, 300.02, 0),
      line('CAT', 300, 200, 0, 200),
      line('CAT', 300, 200, 0, 200),
      line('CAT', 0, 200, 0, 0),
      // lỗ tròn Ø20
      circle('CAT', 50, 100, 10),
      // lỗ oblong 100×20 = 2 LINE + 2 ARC
      line('CAT', 150, 90, 230, 90),
      arc('CAT', 230, 100, 10, 270, 90),
      line('CAT', 230, 110, 150, 110),
      arc('CAT', 150, 100, 10, 90, 270),
      // đường chấn ở layer khác + chữ
      line('CHAN', 0, 20, 300, 20),
      text('CHU', 'CUA'),
      // nét hở lạc ngoài chi tiết
      line('CAT', 500, 0, 600, 50),
    ];
    const ex = explodeDxf(parse(dxf([], ents)));
    const res = detectParts(ex, { cutLayers: new Set(['CAT']), showLayers: new Set(['CHAN']), tol: 0.1, minSize: 10 });
    expect(res.parts.length).toBe(1);
    const q = res.parts[0];
    expect(Math.abs(q.w - 300)).toBeLessThanOrEqual(0.03); // điểm lệch 0,02 được gộp vào điểm nối
    expect(q.h).toBeCloseTo(200, 2);
    expect(q.holes.length).toBe(2);
    expect(q.lines.length).toBe(1);
    // diện tích tôn = 300×200 − π·10² − (80×20 + π·10²); cung rải thành đa giác → sai số < 0,05%
    const exact = 300 * 200 - 2 * Math.PI * 100 - 1600;
    expect(Math.abs(q.area - exact) / exact).toBeLessThan(5e-4);
    expect(res.ignored.length).toBe(1); // nét lẻ ngoài chi tiết bị bỏ
  });

  it('Biên dạng chạm chữ T (tấm trải phẳng có mép gấp) + ký hiệu trong lỗ: 1 chi tiết, không tách ký hiệu', () => {
    const ents = [
      // biên dạng 600×400 vẽ thành 1 polyline hở, 2 đầu dừng giữa thân cạnh dưới (chạm chữ T) — không khép kín
      ['0', 'LWPOLYLINE', '8', 'CAT', '90', '4', '70', '0', '10', '20', '20', '0', '10', '0', '20', '0', '10', '0', '20', '400', '10', '600', '20', '400'],
      ['0', 'LWPOLYLINE', '8', 'CAT', '90', '3', '70', '0', '10', '600', '20', '400', '10', '600', '20', '0', '10', '580', '20', '0'],
      line('CAT', 10, 0, 590, 0), // cạnh dưới phủ qua 2 đầu mút trên
      line('CAT', 20, 0, 20, 400), // đường mép gấp chạm 2 cạnh
      // lỗ tay nắm 40×120 + ký hiệu khoá vẽ bên trong lỗ (không chạm lỗ)
      ...[line('CAT', 500, 140, 540, 140), line('CAT', 540, 140, 540, 260), line('CAT', 540, 260, 500, 260), line('CAT', 500, 260, 500, 140)],
      circle('CAT', 520, 200, 8),
    ];
    const ex = explodeDxf(parse(dxf([], ents)));
    const res = detectParts(ex, { cutLayers: new Set(['CAT']), showLayers: new Set(), tol: 0.1, minSize: 20 });
    expect(res.parts.length).toBe(1);
    const q = res.parts[0];
    expect(q.w).toBeCloseTo(600, 6);
    expect(q.h).toBeCloseTo(400, 6);
    expect(q.outlineExact).toBe(false); // biên dạng hở → dùng bao lồi
    expect(q.holes.length).toBe(1); // lỗ tay nắm; vòng tròn bên trong lỗ chỉ là nét vẽ
    expect(q.area).toBeCloseTo(600 * 400 - 40 * 120, -1);
  });

  it('Block INSERT: xoay 90°, tỉ lệ 2, lật (extrusion −Z), mảng 2 cột; layer 0 thừa hưởng layer INSERT', () => {
    const block = ['0', 'BLOCK', '8', '0', '2', 'TAM', '70', '0', '10', '10', '20', '0', '30', '0', '3', 'TAM', ...line('0', 10, 0, 110, 0), ...line('0', 110, 0, 110, 50), ...line('0', 110, 50, 10, 50), ...line('0', 10, 50, 10, 0), '0', 'ENDBLK'];
    const insert = (x: number, extra: string[]): string[] => ['0', 'INSERT', '8', 'CAT', '2', 'TAM', '10', `${x}`, '20', '0', '30', '0', ...extra];
    const ents = [
      insert(1000, ['41', '2', '42', '2', '50', '90']), // 100×50 → xoay 90 → 100 rộng × 200 cao
      insert(2000, ['210', '0', '220', '0', '230', '-1']), // lật: nằm ở x ∈ [-2100, -2000]
      insert(3000, ['70', '2', '44', '500']), // MINSERT 2 cột cách 500
    ];
    const ex = explodeDxf(parse(dxf([block], ents)));
    expect(ex.layers.map((l) => l.name)).toEqual(['CAT']);
    const res = detectParts(ex, { cutLayers: new Set(['CAT']), showLayers: new Set(), tol: 0.01, minSize: 10 });
    expect(res.parts.length).toBe(4);
    const rot = res.parts.find((q) => Math.abs(q.world.minX - 900) < 0.01)!;
    expect(rot.w).toBeCloseTo(100, 4);
    expect(rot.h).toBeCloseTo(200, 4);
    expect(rot.world.minY).toBeCloseTo(0, 4);
    const mir = res.parts.find((q) => q.world.maxX < 0)!;
    expect(mir.world.minX).toBeCloseTo(-2100, 4);
    expect(mir.world.maxX).toBeCloseTo(-2000, 4);
    expect(res.parts.filter((q) => q.world.minX >= 2999).map((q) => Math.round(q.world.minX))).toEqual(expect.arrayContaining([3000, 3500]));
  });

  it('$INSUNITS = inch → nhân 25,4; tỉ lệ người dùng nhân thêm', () => {
    const text = dxf([], [line('A', 0, 0, 10, 0), line('A', 10, 0, 10, 10), line('A', 10, 10, 0, 10), line('A', 0, 10, 0, 0)]).replace('$INSUNITS\n70\n4', '$INSUNITS\n70\n1');
    const ex = explodeDxf(parse(text), { scale: 2 });
    expect(ex.unitScale).toBe(25.4);
    const res = detectParts(ex, { cutLayers: new Set(['A']), showLayers: new Set(), tol: 0.1, minSize: 1 });
    expect(res.parts[0].w).toBeCloseTo(508, 3);
  });

  it('Header ghi inch nhưng bản vẽ cỡ mm (tủ 4920 đơn vị) → tự dùng mm; người dùng chọn thì theo người dùng', () => {
    const text = dxf([], [line('A', 0, 0, 4920, 0), line('A', 4920, 0, 4920, 2496), line('A', 4920, 2496, 0, 2496), line('A', 0, 2496, 0, 0)]).replace(
      '$INSUNITS\n70\n4',
      '$INSUNITS\n70\n1',
    );
    const auto = explodeDxf(parse(text));
    expect(auto.headerUnitScale).toBe(25.4);
    expect(auto.unitScale).toBe(1);
    expect(auto.unitNote).not.toBe('');
    expect(auto.extents.maxX).toBeCloseTo(4920, 6);
    const forced = explodeDxf(parse(text), { unitScale: 25.4 });
    expect(forced.extents.maxX).toBeCloseTo(4920 * 25.4, 3);
    expect(forced.unitNote).toBe('');
  });
});

describe('Đọc DWG (dwg-import.ts — dữ liệu dạng libredwg-web)', () => {
  const rect = (flag: number, owner = 'M'): DwgEntityLike => ({
    type: 'LWPOLYLINE',
    layer: 'CAT',
    ownerBlockRecordSoftId: owner,
    flag,
    vertices: [
      { x: 0, y: 0, bulge: 0 },
      { x: 100, y: 0, bulge: 0 },
      { x: 100, y: 50, bulge: 0 },
      { x: 0, y: 50, bulge: 0 },
    ],
  });
  const db = (entities: DwgEntityLike[], blocks: DwgDatabaseLike['tables'] = {}): DwgDatabaseLike => ({
    header: { INSUNITS: 4 },
    entities,
    tables: {
      LAYER: { entries: [{ name: 'CAT', color: 0x00ff00, off: false, frozen: false }] },
      BLOCK_RECORD: { entries: [{ handle: 'M', name: '*Model_Space' }, { handle: 'P', name: '*Paper_Space' }, ...(blocks?.BLOCK_RECORD?.entries ?? [])] },
    },
  });

  it('LWPOLYLINE: bit 512 của cờ DWG = khép kín (bit 8 = có cao độ, không phải khép kín)', () => {
    const ex = explodeDxf(dwgDatabaseToDoc(db([rect(512 + 8), rect(8)])));
    expect(ex.paths.map((p) => p.closed)).toEqual([true, false]);
  });

  it('INSERT: góc xoay radian → độ; entity paper space và entity ẩn bị bỏ', () => {
    const blk = { BLOCK_RECORD: { entries: [{ handle: 'B', name: 'TAM', basePoint: { x: 0, y: 0 }, entities: [rect(512, 'B')] }] } };
    const ins: DwgEntityLike = { type: 'INSERT', layer: 'CAT', ownerBlockRecordSoftId: 'M', name: 'TAM', insertionPoint: { x: 1000, y: 0 }, xScale: 1, yScale: 1, rotation: Math.PI / 2 };
    const ex = explodeDxf(dwgDatabaseToDoc(db([ins, rect(512, 'P'), { ...rect(512), isVisible: false }], blk)));
    expect(ex.paths.length).toBe(1);
    expect(ex.extents.minX).toBeCloseTo(950, 6); // xoay 90°: 100×50 → 50 rộng × 100 cao, nằm bên trái điểm chèn
    expect(ex.extents.maxX).toBeCloseTo(1000, 6);
    expect(ex.extents.maxY).toBeCloseTo(100, 6);
  });
});

describe('Xếp hình chữ nhật (rect-pack.ts)', () => {
  const o = { sheetW: 1250, sheetH: 2500, gap: 10, margin: 10, allowRotate: true };

  const noOverlap = (pl: { x: number; y: number; w: number; h: number }[], gap: number): boolean =>
    pl.every((a, i) => pl.every((b, j) => i === j || a.x + a.w + gap <= b.x + 1e-6 || b.x + b.w + gap <= a.x + 1e-6 || a.y + a.h + gap <= b.y + 1e-6 || b.y + b.h + gap <= a.y + 1e-6));

  it('4 tấm 600×1200 vừa 1 tờ 1250×2500 (khe 10, lề 10); tấm thứ 5 sang tờ 2', () => {
    expect(packRects([{ id: 'a', w: 600, h: 1200, qty: 4 }], o).sheets.length).toBe(1);
    expect(packRects([{ id: 'a', w: 600, h: 1200, qty: 5 }], o).sheets.length).toBe(2);
  });

  it('Không chồng nhau, đủ khe hở, nằm trong lề; chi tiết vượt khổ báo riêng', () => {
    const items = [
      { id: 'a', w: 647.6, h: 847.6, qty: 2 },
      { id: 'b', w: 300, h: 1100, qty: 3 },
      { id: 'c', w: 120, h: 80, qty: 15 },
      { id: 'd', w: 2400, h: 400, qty: 1 }, // phải xoay mới vừa
      { id: 'x', w: 1300, h: 2600, qty: 1 }, // vượt khổ
    ];
    const r = packRects(items, o);
    expect(r.unplaced).toEqual(['x']);
    const placed = r.sheets.flatMap((s) => s.placements);
    expect(placed.length).toBe(2 + 3 + 15 + 1);
    expect(placed.find((p) => p.id === 'd')!.rotated).toBe(true);
    for (const s of r.sheets) {
      expect(noOverlap(s.placements, 10)).toBe(true);
      for (const p of s.placements) {
        expect(p.x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(p.x + p.w).toBeLessThanOrEqual(1240 + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(2490 + 1e-6);
      }
    }
  });

  it('Cụm cỡ bằng khổ tôn (bản vẽ đã sắp sẵn) → đặt nguyên 1 tấm, căn giữa, không báo vượt khổ', () => {
    const r = packRects(
      [
        { id: 'tam', w: 1248, h: 2495.5, qty: 2 },
        { id: 'nho', w: 300, h: 300, qty: 1 },
      ],
      o,
    );
    expect(r.unplaced).toEqual([]);
    expect(r.sheets.length).toBe(3);
    expect(r.sheets.filter((s) => s.whole).length).toBe(2);
    const p = r.sheets[0].placements[0];
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(2.25, 6);
    expect(r.sheets.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('Không cho xoay: chi tiết nằm ngang dài hơn khổ rộng bị báo vượt khổ', () => {
    const r = packRects([{ id: 'd', w: 2400, h: 400, qty: 1 }], { ...o, allowRotate: false });
    expect(r.unplaced).toEqual(['d']);
    expect(r.sheets.length).toBe(0);
  });
});
