import { Hole, Part, Polyline, TextMark } from './types';
import { bboxH, bboxW, removeDiacritics, slug } from './math';

/**
 * DXF WRITER — ASCII, AutoCAD R12 (AC1009).
 * - Đơn vị mm ($INSUNITS = 4), gốc (0,0) ở góc dưới trái mỗi chi tiết.
 * - Chỉ dùng LINE, CIRCLE, POLYLINE khép kín (có bulge cho cung), TEXT. KHÔNG SPLINE.
 * - Layer theo màu ACI: CUT=3, BEND_UP=6, BEND_DOWN=5, MARK=2, TEXT=7.
 * R12 được chọn vì mọi phần mềm CNC/CAM đều đọc được và không cần handle/OBJECTS.
 */

export const LAYERS: { name: string; color: number }[] = [
  { name: 'CUT', color: 3 },
  { name: 'BEND_UP', color: 6 },
  { name: 'BEND_DOWN', color: 5 },
  { name: 'MARK', color: 2 },
  { name: 'TEXT', color: 7 },
];

const f = (v: number): string => {
  const s = (Math.round(v * 10000) / 10000).toFixed(4);
  return s.replace(/\.?0+$/, '') || '0';
};

class DxfBuilder {
  private lines: string[] = [];
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  private g(code: number, value: string | number): void {
    this.lines.push(String(code).padStart(3, ' '), typeof value === 'number' ? f(value) : value);
  }
  private ext(x: number, y: number): void {
    this.minX = Math.min(this.minX, x);
    this.minY = Math.min(this.minY, y);
    this.maxX = Math.max(this.maxX, x);
    this.maxY = Math.max(this.maxY, y);
  }

  line(layer: string, x1: number, y1: number, x2: number, y2: number): void {
    this.g(0, 'LINE');
    this.g(8, layer);
    this.g(10, x1);
    this.g(20, y1);
    this.g(30, 0);
    this.g(11, x2);
    this.g(21, y2);
    this.g(31, 0);
    this.ext(x1, y1);
    this.ext(x2, y2);
  }

  circle(layer: string, cx: number, cy: number, r: number): void {
    this.g(0, 'CIRCLE');
    this.g(8, layer);
    this.g(10, cx);
    this.g(20, cy);
    this.g(30, 0);
    this.g(40, r);
    this.ext(cx - r, cy - r);
    this.ext(cx + r, cy + r);
  }

  /** POLYLINE R12 khép kín (cờ 70 = 1), VERTEX có bulge (mã 42). */
  polyline(layer: string, poly: Polyline, dx: number, dy: number): void {
    this.g(0, 'POLYLINE');
    this.g(8, layer);
    this.g(66, 1);
    this.g(10, 0);
    this.g(20, 0);
    this.g(30, 0);
    this.g(70, poly.closed ? 1 : 0);
    poly.pts.forEach((p, i) => {
      this.g(0, 'VERTEX');
      this.g(8, layer);
      this.g(10, p.x + dx);
      this.g(20, p.y + dy);
      this.g(30, 0);
      const b = poly.bulges?.[i] ?? 0;
      if (b !== 0) this.g(42, b);
      this.ext(p.x + dx, p.y + dy);
    });
    this.g(0, 'SEQEND');
    this.g(8, layer);
  }

  text(layer: string, x: number, y: number, h: number, text: string, center = true): void {
    this.g(0, 'TEXT');
    this.g(8, layer);
    this.g(10, x);
    this.g(20, y);
    this.g(30, 0);
    this.g(40, h);
    this.g(1, removeDiacritics(text).replace(/[^\x20-\x7E]/g, '?'));
    if (center) {
      this.g(72, 1); // canh giữa ngang
      this.g(73, 2); // canh giữa dọc
      this.g(11, x);
      this.g(21, y);
      this.g(31, 0);
    }
  }

  build(): string {
    const ext = isFinite(this.minX) ? [this.minX, this.minY, this.maxX, this.maxY] : [0, 0, 0, 0];
    const out: string[] = [];
    const g = (c: number, v: string | number): void => {
      out.push(String(c).padStart(3, ' '), typeof v === 'number' ? f(v) : v);
    };
    // HEADER
    g(0, 'SECTION');
    g(2, 'HEADER');
    g(9, '$ACADVER');
    g(1, 'AC1009');
    g(9, '$INSUNITS');
    g(70, 4);
    g(9, '$MEASUREMENT');
    g(70, 1);
    g(9, '$EXTMIN');
    g(10, ext[0]);
    g(20, ext[1]);
    g(30, 0);
    g(9, '$EXTMAX');
    g(10, ext[2]);
    g(20, ext[3]);
    g(30, 0);
    g(0, 'ENDSEC');
    // TABLES
    g(0, 'SECTION');
    g(2, 'TABLES');
    g(0, 'TABLE');
    g(2, 'LTYPE');
    g(70, 1);
    g(0, 'LTYPE');
    g(2, 'CONTINUOUS');
    g(70, 0);
    g(3, 'Solid line');
    g(72, 65);
    g(73, 0);
    g(40, 0);
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'LAYER');
    g(70, LAYERS.length + 1);
    for (const l of [{ name: '0', color: 7 }, ...LAYERS]) {
      g(0, 'LAYER');
      g(2, l.name);
      g(70, 0);
      g(62, l.color);
      g(6, 'CONTINUOUS');
    }
    g(0, 'ENDTAB');
    g(0, 'TABLE');
    g(2, 'STYLE');
    g(70, 1);
    g(0, 'STYLE');
    g(2, 'STANDARD');
    g(70, 0);
    g(40, 0);
    g(41, 1);
    g(50, 0);
    g(71, 0);
    g(42, 2.5);
    g(3, 'txt');
    g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    // BLOCKS (rỗng)
    g(0, 'SECTION');
    g(2, 'BLOCKS');
    g(0, 'ENDSEC');
    // ENTITIES
    g(0, 'SECTION');
    g(2, 'ENTITIES');
    out.push(...this.lines);
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }
}

function writeHole(b: DxfBuilder, h: Hole, dx: number, dy: number): void {
  if (h.kind === 'circle') b.circle('CUT', h.cx + dx, h.cy + dy, h.r);
  else b.polyline('CUT', h, dx, dy);
}

function writeMark(b: DxfBuilder, m: TextMark, dx: number, dy: number): void {
  b.text(m.layer, m.x + dx, m.y + dy, m.height, m.text);
}

function writePart(b: DxfBuilder, p: Part, dx: number, dy: number, withText: boolean): void {
  b.polyline('CUT', p.outline, dx, dy);
  for (const h of p.holes) writeHole(b, h, dx, dy);
  for (const bl of p.bendLines) b.line(bl.direction === 'UP' ? 'BEND_UP' : 'BEND_DOWN', bl.a.x + dx, bl.a.y + dy, bl.b.x + dx, bl.b.y + dy);
  if (withText) for (const m of p.marks) writeMark(b, m, dx, dy);
}

/** DXF một chi tiết, gốc (0,0) tại góc dưới trái. */
export function partToDxf(p: Part, opts: { withText?: boolean } = {}): string {
  const b = new DxfBuilder();
  writePart(b, p, -p.bbox.minX, -p.bbox.minY, opts.withText ?? true);
  return b.build();
}

/** DXF gộp: các chi tiết xếp rời nhau theo hàng, nhãn tên đặt bên dưới (layer TEXT). */
export function partsToCombinedDxf(parts: Part[], orderCode: string, gap = 80, rowWidth = 6000): string {
  const b = new DxfBuilder();
  let x = 0,
    y = 0,
    rowH = 0;
  const sorted = [...parts].sort((a, c) => bboxH(c.bbox) - bboxH(a.bbox));
  for (const p of sorted) {
    const w = bboxW(p.bbox),
      h = bboxH(p.bbox);
    if (x > 0 && x + w > rowWidth) {
      y -= rowH + gap + 40;
      x = 0;
      rowH = 0;
    }
    writePart(b, p, x - p.bbox.minX, y - h - p.bbox.minY, true);
    b.text('TEXT', x + w / 2, y - h - 25, 14, `${p.code} - ${p.name} - ${p.thickness}mm - SL${p.qty}`);
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  b.text('TEXT', 0, 60, 25, `DON HANG ${orderCode}`, false);
  return b.build();
}

/** Tên file: {MaDon}_{MaChiTiet}_{TenChiTiet}_{DoDay}mm_SL{qty}.dxf */
export function dxfFileName(orderCode: string, p: Part): string {
  return `${slug(orderCode)}_${slug(p.code)}_${slug(p.name)}_${p.thickness}mm_SL${p.qty}.dxf`;
}
