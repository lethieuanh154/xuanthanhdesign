import { AfterViewInit, Component, computed, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import Konva from 'konva';
import { ProjectStore } from '../core/project.store';
import { MATERIAL_LABEL, NestGroup, Part, SheetSize, tessellate } from '../geometry';
import { CncStage } from './konva-view';

/** Tab "Sắp tôn" (demo): xếp kệ chữ nhật trên khổ tôn, hiện số tấm và % sử dụng. */
@Component({
  selector: 'app-nesting-view',
  template: `
    <div class="nv">
      <div class="bar">
        <span class="lbl">Khổ tôn</span>
        <div class="seg dark">
          @for (s of sizes; track s) {
            <button [class.on]="store.project().sheetSize === s" (click)="store.setMeta({ sheetSize: s })">{{ s.replace('x', '×') }}</button>
          }
        </div>
        <span class="lbl">Nhóm</span>
        <div class="seg dark">
          @for (g of store.nesting(); track g.key) {
            <button [class.on]="group()?.key === g.key" (click)="groupKey.set(g.key)">{{ g.material }} {{ g.thickness }}mm</button>
          }
        </div>
        <span class="spacer"></span>
        @if (group(); as g) {
          <span class="stat"><b>{{ g.sheets.length }}</b> tấm</span>
          <span class="stat">Sử dụng <b [class.lo]="g.utilization < 0.5">{{ pct(g.utilization) }}%</b></span>
          <span class="stat">{{ g.sheets.reduce(sumPl, 0) }} chi tiết</span>
        }
      </div>
      <div class="canvas">
        <div #el class="stage"></div>
        <div class="total">
          @for (g of store.nesting(); track g.key) {
            <div>
              {{ mat(g.material) }} {{ g.thickness }}mm: <b>{{ g.sheets.length }} tấm</b> · {{ pct(g.utilization) }}%
              @if (g.unplaced.length) {
                <span class="err"> · {{ g.unplaced.length }} chi tiết vượt khổ!</span>
              }
            </div>
          }
          <div class="dim">Demo shelf-packing theo hình bao. Nesting thật do phần mềm CNC đảm nhận.</div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; color: #cfd6dd; }
    .nv { display: flex; flex-direction: column; height: 100%; }
    .bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #222a33; background: #111419; flex-wrap: wrap; }
    .lbl { font-size: 11px; color: #7c8792; text-transform: uppercase; letter-spacing: .06em; }
    .seg.dark button { background: #1a1f26; border-color: #2e3742; color: #cfd6dd; }
    .seg.dark button.on { background: #1E5AA8; border-color: #1E5AA8; color: #fff; }
    .spacer { flex: 1; }
    .stat { font-size: 13px; } .stat b { color: #39FF14; font-size: 15px; } .stat b.lo { color: #FFB300; }
    .canvas { position: relative; flex: 1; min-height: 0; }
    .stage { position: absolute; inset: 0; }
    .total { position: absolute; right: 10px; bottom: 10px; background: rgba(17,20,25,.92); border: 1px solid #2a323c; border-radius: 6px; padding: 8px 12px; font-size: 12px; line-height: 1.6; }
    .total b { color: #39FF14; } .err { color: #ff5252; } .dim { color: #6b7783; font-size: 11px; }
  `,
})
export class NestingView implements AfterViewInit, OnDestroy {
  readonly store = inject(ProjectStore);
  readonly sizes: SheetSize[] = ['1250x2500', '1500x3000'];
  readonly groupKey = signal<string | null>(null);
  private readonly el = viewChild.required<ElementRef<HTMLDivElement>>('el');
  private readonly ready = signal(false);
  private cnc?: CncStage;

  readonly group = computed<NestGroup | undefined>(() => {
    const gs = this.store.nesting();
    return gs.find((g) => g.key === this.groupKey()) ?? gs.find((g) => g.thickness === this.store.project().enclosure.thickness) ?? gs[0];
  });

  readonly sumPl = (s: number, x: { placements: unknown[] }): number => s + x.placements.length;

  constructor() {
    effect(() => {
      const g = this.group();
      if (!this.ready() || !g) return;
      untracked(() => this.draw(g));
    });
  }

  ngAfterViewInit(): void {
    this.cnc = new CncStage(this.el().nativeElement);
    this.cnc.onResize = () => {
      const g = this.group();
      if (g) this.draw(g);
    };
    this.cnc.stage.on('dblclick', () => this.cnc?.refit());
    this.ready.set(true);
  }

  ngOnDestroy(): void {
    this.cnc?.destroy();
  }

  private draw(g: NestGroup): void {
    const cnc = this.cnc;
    if (!cnc) return;
    const gap = 120;
    const totalH = g.sheets.length * (g.sheetH + gap) - gap;
    cnc.fit(g.sheetW, Math.max(totalH, g.sheetH), 50);
    const L = cnc.layer;
    L.destroyChildren();
    const px = (n: number): number => cnc.px(n);
    const parts = new Map<string, Part>(this.store.parts().map((p) => [p.id, p]));
    g.sheets.forEach((s, i) => {
      const oy = i * (g.sheetH + gap);
      const Y = (y: number): number => oy + g.sheetH - y;
      L.add(new Konva.Rect({ x: 0, y: oy, width: g.sheetW, height: g.sheetH, fill: '#161b21', stroke: '#6b7783', strokeWidth: 1.2, strokeScaleEnabled: false }));
      L.add(new Konva.Text({ x: 0, y: oy - px(18), text: `Tấm ${s.index}/${g.sheets.length} — ${g.sheetW}×${g.sheetH} — ${this.mat(g.material)} ${g.thickness}mm — sử dụng ${this.pct(s.utilization)}%`, fontSize: px(12), fill: '#cfd6dd' }));
      for (const pl of s.placements) {
        const part = parts.get(pl.partId);
        if (!part) continue;
        const pw = part.bbox.maxX,
          ph = part.bbox.maxY;
        // đổi toạ độ chi tiết → toạ độ tấm (xoay 90° nếu cần)
        const tf = (q: { x: number; y: number }): number[] => {
          const lx = pl.rotated ? ph - q.y : q.x;
          const ly = pl.rotated ? q.x : q.y;
          return [pl.x + lx, Y(pl.y + ly)];
        };
        L.add(new Konva.Rect({ x: pl.x, y: Y(pl.y + pl.h), width: pl.w, height: pl.h, stroke: '#2b3a2b', strokeWidth: 1, dash: [px(3), px(3)], strokeScaleEnabled: false }));
        L.add(new Konva.Line({ points: tessellate(part.outline, 6).flatMap(tf), closed: true, stroke: '#39FF14', strokeWidth: 1.1, strokeScaleEnabled: false, fill: 'rgba(57,255,20,0.08)' }));
        for (const h of part.holes) {
          if (h.kind === 'circle') {
            const [cx, cy] = tf({ x: h.cx, y: h.cy });
            L.add(new Konva.Circle({ x: cx, y: cy, radius: h.r, stroke: '#39FF14', strokeWidth: 0.8, strokeScaleEnabled: false }));
          } else L.add(new Konva.Line({ points: tessellate(h, 6).flatMap(tf), closed: true, stroke: '#39FF14', strokeWidth: 0.8, strokeScaleEnabled: false }));
        }
        for (const b of part.bendLines) {
          L.add(new Konva.Line({ points: [...tf(b.a), ...tf(b.b)], stroke: '#FF00FF', strokeWidth: 0.8, strokeScaleEnabled: false, opacity: 0.7 }));
        }
        const fs = Math.min(px(12), Math.min(pl.w, pl.h) / 4);
        L.add(new Konva.Text({ x: pl.x, y: Y(pl.y + pl.h / 2) - fs / 2, width: pl.w, align: 'center', text: pl.code, fontSize: fs, fill: '#FFD400', fontStyle: 'bold' }));
      }
    });
    L.batchDraw();
  }

  pct(v: number): number {
    return Math.round(v * 1000) / 10;
  }
  mat(m: string): string {
    return MATERIAL_LABEL[m] ?? m;
  }
}
