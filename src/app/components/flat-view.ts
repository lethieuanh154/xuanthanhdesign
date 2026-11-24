import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import Konva from 'konva';
import { ProjectStore } from '../core/project.store';
import { ExportService } from '../core/export.service';
import { bboxH, bboxW, bendDeduction, MATERIAL_LABEL, Part, partNetArea, r2, tessellate } from '../geometry';
import { CncStage } from './konva-view';

const CUT = '#39FF14';
const BEND = '#FF00FF';
const MARK = '#FFD400';

/** Tab "Trải phẳng": biên dạng xanh lá, đường chấn tím có mũi tên chiều chấn, kích thước trải phẳng. */
@Component({
  selector: 'app-flat-view',
  template: `
    <div class="fv">
      <div class="plist">
        <div class="ph">CHI TIẾT ({{ store.parts().length }})</div>
        @for (p of store.parts(); track p.id) {
          <button class="pi" [class.on]="part()?.id === p.id" (click)="store.selectedPartId.set(p.id)">
            <span class="code">{{ p.code }}</span>
            <span class="nm">{{ p.name }}</span>
            <span class="meta">{{ p.thickness }}mm · SL{{ p.qty }}</span>
          </button>
        }
      </div>
      <div class="canvas">
        <div #el class="stage"></div>
        @if (part(); as p) {
          <div class="info">
            <div class="t">{{ p.name }} <span class="code">{{ p.code }}</span></div>
            <table>
              <tr><td>Vật liệu</td><td>{{ mat(p) }}</td></tr>
              <tr><td>Độ dày</td><td>{{ p.thickness }} mm · SL {{ p.qty }}</td></tr>
              <tr><td>KT trải phẳng</td><td class="hl">{{ w(p) }} × {{ h(p) }} mm</td></tr>
              <tr><td>BD dùng</td><td>{{ bd(p) }} mm / đường chấn <span class="dim">(số mẫu)</span></td></tr>
              <tr><td>Đường chấn</td><td>{{ p.bendLines.length }} ({{ ups(p) }} lên, {{ p.bendLines.length - ups(p) }} xuống)</td></tr>
              <tr><td>Lỗ / khoét</td><td>{{ p.holes.length }}</td></tr>
              <tr><td>Diện tích</td><td>{{ area(p) }} m² (thực) · {{ kg(p) }} kg/cái</td></tr>
            </table>
            <button class="dl" (click)="ex.downloadPartDxf(p)">⬇ Tải DXF chi tiết này</button>
          </div>
        }
        <div class="legend">
          <span><i [style.background]="cut"></i>CUT — cắt</span>
          <span><i [style.background]="bend"></i>BEND_UP ▲ chấn lên</span>
          <span><i class="dash"></i>BEND_DOWN ▼ chấn xuống</span>
          <span><i [style.background]="mark"></i>MARK — khắc</span>
          <span class="dim">cuộn = zoom · kéo = di chuyển · dbl-click = vừa khung</span>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; color: #cfd6dd; }
    .fv { display: flex; height: 100%; }
    .plist { width: 190px; flex: none; overflow: auto; border-right: 1px solid #222a33; background: #111419; }
    .ph { font-size: 11px; letter-spacing: .08em; color: #7c8792; padding: 10px 10px 6px; font-weight: 700; }
    .pi { display: grid; grid-template-columns: auto 1fr; gap: 0 6px; width: 100%; text-align: left; padding: 6px 10px; border: 0; border-left: 3px solid transparent; background: none; color: #cfd6dd; cursor: pointer; }
    .pi:hover { background: #1a1f26; }
    .pi.on { background: #18222e; border-left-color: #39FF14; }
    .pi .code { font-family: var(--mono); font-size: 11px; color: #39FF14; grid-row: span 2; align-self: center; min-width: 62px; }
    .pi .nm { font-size: 12.5px; }
    .pi .meta { font-size: 11px; color: #7c8792; }
    .canvas { position: relative; flex: 1; min-width: 0; }
    .stage { position: absolute; inset: 0; }
    .info { position: absolute; top: 10px; left: 10px; background: rgba(17,20,25,.92); border: 1px solid #2a323c; border-radius: 6px; padding: 10px 12px; font-size: 12px; min-width: 260px; }
    .info .t { font-weight: 700; font-size: 14px; color: #fff; margin-bottom: 6px; }
    .info .code { font-family: var(--mono); color: #39FF14; font-size: 12px; margin-left: 6px; }
    .info td { padding: 2px 8px 2px 0; vertical-align: top; }
    .info td:first-child { color: #7c8792; white-space: nowrap; }
    .info .hl { color: #39FF14; font-family: var(--mono); font-weight: 700; font-size: 13px; }
    .dim { color: #6b7783; }
    .dl { margin-top: 8px; width: 100%; height: 28px; background: #1E5AA8; color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
    .dl:hover { background: #2a6dc4; }
    .legend { position: absolute; bottom: 8px; left: 10px; right: 10px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: #9aa5b1; pointer-events: none; }
    .legend i { display: inline-block; width: 16px; height: 3px; margin-right: 5px; vertical-align: 3px; }
    .legend i.dash { background: repeating-linear-gradient(90deg, #FF00FF 0 4px, transparent 4px 7px); }
  `,
})
export class FlatView implements AfterViewInit, OnDestroy {
  readonly store = inject(ProjectStore);
  readonly ex = inject(ExportService);
  readonly cut = CUT;
  readonly bend = BEND;
  readonly mark = MARK;
  private readonly el = viewChild.required<ElementRef<HTMLDivElement>>('el');
  private readonly ready = signal(false);
  private cnc?: CncStage;
  private lastId: string | null = null;

  readonly part = computed<Part | undefined>(() => {
    const parts = this.store.parts();
    const id = this.store.selectedPartId();
    return parts.find((p) => p.id === id) ?? parts.find((p) => p.group === 'cua') ?? parts[0];
  });

  constructor() {
    effect(() => {
      const p = this.part();
      if (!this.ready() || !p) return;
      untracked(() => this.draw(p));
    });
  }

  ngAfterViewInit(): void {
    this.cnc = new CncStage(this.el().nativeElement);
    this.cnc.stage.on('dblclick', () => {
      this.cnc?.refit();
      const p = this.part();
      if (p) this.draw(p, false);
    });
    this.cnc.onResize = () => {
      const p = this.part();
      if (p) this.draw(p, true);
    };
    this.ready.set(true);
  }

  ngOnDestroy(): void {
    this.cnc?.destroy();
  }

  private draw(p: Part, refit = p.id !== this.lastId): void {
    const cnc = this.cnc;
    if (!cnc) return;
    const W = bboxW(p.bbox),
      H = bboxH(p.bbox);
    if (refit) cnc.fit(W, H, 80, 300);
    this.lastId = p.id;
    const L = cnc.layer;
    L.destroyChildren();
    const Y = (y: number): number => H - y;
    const flat = (pts: { x: number; y: number }[]): number[] => pts.flatMap((q) => [q.x, Y(q.y)]);
    const px = (n: number): number => cnc.px(n);

    // biên dạng ngoài
    L.add(new Konva.Line({ points: flat(tessellate(p.outline)), closed: true, stroke: CUT, strokeWidth: 1.6, strokeScaleEnabled: false, fill: 'rgba(57,255,20,0.04)' }));
    // lỗ
    for (const h of p.holes) {
      if (h.kind === 'circle') L.add(new Konva.Circle({ x: h.cx, y: Y(h.cy), radius: h.r, stroke: CUT, strokeWidth: 1.2, strokeScaleEnabled: false }));
      else L.add(new Konva.Line({ points: flat(tessellate(h)), closed: true, stroke: CUT, strokeWidth: 1.2, strokeScaleEnabled: false }));
    }
    // đường chấn + mũi tên chiều chấn
    p.bendLines.forEach((b, bi) => {
      const up = b.direction === 'UP';
      L.add(new Konva.Line({ points: [b.a.x, Y(b.a.y), b.b.x, Y(b.b.y)], stroke: BEND, strokeWidth: 1.3, dash: up ? undefined : [px(7), px(4)], strokeScaleEnabled: false }));
      // so le vị trí nhãn để 2 đường chấn song song (mép + mép hồi) không đè chữ
      const tpos = bi % 2 === 0 ? 0.5 : 0.3;
      const mx = b.a.x + (b.b.x - b.a.x) * tpos,
        my = Y(b.a.y + (b.b.y - b.a.y) * tpos);
      const horiz = Math.abs(b.a.y - b.b.y) < 1e-6;
      // mũi tên vuông góc đường chấn: ▲ lên = hướng lên màn hình/trái, ▼ xuống = ngược lại
      const len = px(16);
      const dx = horiz ? 0 : up ? -len : len;
      const dy = horiz ? (up ? -len : len) : 0;
      L.add(new Konva.Arrow({ points: [mx, my, mx + dx, my + dy], stroke: BEND, fill: BEND, strokeWidth: 1.5, pointerLength: px(6), pointerWidth: px(6), strokeScaleEnabled: false }));
      const t = new Konva.Text({ x: mx + (horiz ? px(6) : dx) , y: my + (horiz ? dy : px(4)), text: `${up ? '▲ LÊN' : '▼ XUỐNG'} ${b.angle}°`, fontSize: px(10), fill: BEND, rotation: horiz ? 0 : -90 });
      L.add(t);
    });
    // chữ khắc / chữ thông tin
    for (const m of p.marks) {
      const t = new Konva.Text({ x: m.x, y: Y(m.y), text: m.text, fontSize: m.height, fill: m.layer === 'MARK' ? MARK : '#cfd6dd', fontFamily: 'Consolas, monospace' });
      t.offsetX(t.width() / 2);
      t.offsetY(t.height() / 2);
      L.add(t);
    }
    // kích thước trải phẳng
    const col = '#e6e6e6';
    const off = px(28);
    this.dim(L, 0, Y(0) + off, W, Y(0) + off, `${r2(W)}`, col, px);
    this.dim(L, W + off, Y(H), W + off, Y(0), `${r2(H)}`, col, px, true);
    // kích thước từng đoạn mép (theo đường chấn dọc)
    const xs = [...new Set(p.bendLines.filter((b) => Math.abs(b.a.x - b.b.x) < 1e-6).map((b) => b.a.x))].sort((a, c) => a - c);
    if (xs.length && xs.length <= 8) {
      const stops = [0, ...xs, W];
      for (let i = 0; i < stops.length - 1; i++) this.dim(L, stops[i], Y(H) - px(18), stops[i + 1], Y(H) - px(18), `${r2(stops[i + 1] - stops[i])}`, '#9aa5b1', px);
    }
    const ys = [...new Set(p.bendLines.filter((b) => Math.abs(b.a.y - b.b.y) < 1e-6).map((b) => b.a.y))].sort((a, c) => a - c);
    if (ys.length && ys.length <= 8) {
      const stops = [0, ...ys, H];
      for (let i = 0; i < stops.length - 1; i++) this.dim(L, -px(18), Y(stops[i + 1]), -px(18), Y(stops[i]), `${r2(stops[i + 1] - stops[i])}`, '#9aa5b1', px, true);
    }
    // gốc toạ độ DXF
    L.add(new Konva.Circle({ x: 0, y: Y(0), radius: px(3), fill: '#ff5252' }));
    L.add(new Konva.Text({ x: px(5), y: Y(0) + px(3), text: '(0,0)', fontSize: px(9), fill: '#ff5252' }));
    L.batchDraw();
  }

  private dim(L: Konva.Layer, x1: number, y1: number, x2: number, y2: number, label: string, col: string, px: (n: number) => number, vertical = false): void {
    if (Math.hypot(x2 - x1, y2 - y1) < px(34)) return; // đoạn quá ngắn trên màn hình → bỏ nhãn
    L.add(new Konva.Arrow({ points: [x1, y1, x2, y2], pointerAtBeginning: true, pointerLength: px(6), pointerWidth: px(5), stroke: col, fill: col, strokeWidth: 1, strokeScaleEnabled: false }));
    const t = new Konva.Text({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, text: label, fontSize: px(11), fill: col, fontFamily: 'Consolas, monospace', rotation: vertical ? -90 : 0 });
    t.offsetX(t.width() / 2);
    t.offsetY(t.height() + px(2));
    L.add(t);
  }

  w(p: Part): number {
    return r2(bboxW(p.bbox));
  }
  h(p: Part): number {
    return r2(bboxH(p.bbox));
  }
  mat(p: Part): string {
    return MATERIAL_LABEL[p.material] ?? p.material;
  }
  bd(p: Part): number {
    return bendDeduction(this.store.cat.bend, p.material === 'CU' ? 'copper' : 'steel', p.thickness);
  }
  ups(p: Part): number {
    return p.bendLines.filter((b) => b.direction === 'UP').length;
  }
  area(p: Part): number {
    return r2(partNetArea(p) / 1e6);
  }
  kg(p: Part): number {
    const d = p.material === 'CU' ? this.store.cat.pricing.density.copper : this.store.cat.pricing.density.steel;
    return r2((partNetArea(p) / 1e6) * p.thickness * d);
  }
}
