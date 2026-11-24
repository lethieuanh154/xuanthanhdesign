import { AfterViewInit, Component, ElementRef, effect, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import Konva from 'konva';
import { ProjectStore, snap } from '../core/project.store';
import { deviceCutout, deviceRect, generateParts, holeBBox, issuesByTarget, Project, Rect, runRules, sectionAt, lockX, coverWindows } from '../geometry';

type IssueMap = Map<string, { level: 'warn' | 'error'; messages: string[] }>;

const RULER = 22;
const C = {
  body: '#dfe4e9',
  bodyStroke: '#3c4752',
  plate: '#f6f7f8',
  plateStroke: '#a7b1bb',
  base: '#3c4752',
  accent: '#1E5AA8',
  dim: '#5b6672',
  err: '#E53935',
  warn: '#FB8C00',
  copper: '#C87533',
};

@Component({
  selector: 'app-front-canvas',
  imports: [CdkDropList],
  template: `
    <div class="fc">
      <div class="stage-wrap drop-stage" #wrap cdkDropList id="canvas-drop" [cdkDropListSortingDisabled]="true" (cdkDropListDropped)="onDrop($event)">
        <div #stageEl class="stage"></div>
        @if (tip(); as t) {
          <div class="tip" [class.err]="t.level === 'error'" [class.warn]="t.level === 'warn'" [style.left.px]="t.x" [style.top.px]="t.y">
            <b>{{ t.title }}</b>
            @for (m of t.lines; track $index) {
              <div>{{ t.level === 'error' ? '✗' : t.level === 'warn' ? '⚠' : '' }} {{ m }}</div>
            }
          </div>
        }
        <div class="legend">
          <span><i class="sw plate"></i>Tấm đế</span>
          <span><i class="sw door"></i>Gắn cửa</span>
          <span><i class="sw cut"></i>Lỗ khoét cửa</span>
          <span><i class="sw err"></i>Sai luật</span>
          <span><i class="sw cu"></i>Thanh cái</span>
        </div>
        @if (!store.project().devices.length) {
          <div class="empty">Kéo thiết bị từ THƯ VIỆN bên trái thả vào đây, hoặc bấm <b>+ Thêm</b></div>
        }
      </div>
      <div class="toolbar">
        <div class="btn-group">
          <button class="btn sm" (click)="zoomBy(1 / 1.25)" title="Thu nhỏ">−</button>
          <button class="btn sm mono" (click)="fit()" title="Vừa khung">{{ zoomPct() }}%</button>
          <button class="btn sm" (click)="zoomBy(1.25)" title="Phóng to">+</button>
        </div>
        <label class="check"><input type="checkbox" [checked]="store.snapOn()" (change)="store.snapOn.set($any($event.target).checked)" /> Lưới 5mm</label>
        <label class="check"><input type="checkbox" [checked]="store.showDims()" (change)="store.showDims.set($any($event.target).checked)" /> Hiện kích thước</label>
        <span class="sep"></span>
        <button class="btn sm" [disabled]="!store.selectedIds().length" (click)="store.rotateSelected()" title="Phím R">⟳ Xoay 90°</button>
        <button class="btn sm" [disabled]="!store.selectedIds().length" (click)="store.distribute()" title="Căn hàng ngang, khoảng cách đều">⇹ Căn đều</button>
        <button class="btn sm" [disabled]="!store.selectedIds().length" (click)="store.duplicateSelected()" title="Ctrl+D">⧉ Nhân bản</button>
        <button class="btn sm danger" [disabled]="!store.selectedIds().length" (click)="store.removeSelected()" title="Delete">🗑 Xoá</button>
        <span class="hint muted small">Del xoá · Ctrl+D nhân bản · R xoay · ←↑→↓ dịch · Shift+click chọn nhiều · cuộn = zoom · kéo nền = di chuyển</span>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .fc { display: flex; flex-direction: column; height: 100%; }
    .stage-wrap { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #fbfcfd; }
    .stage { position: absolute; inset: 0; }
    .toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-top: 1px solid var(--steel-200); background: var(--steel-50); flex-wrap: wrap; }
    .sep { width: 1px; height: 20px; background: var(--steel-200); }
    .hint { margin-left: auto; }
    .tip { position: absolute; pointer-events: none; background: #fff; border: 1px solid var(--steel-300); border-radius: 6px; padding: 6px 9px; box-shadow: 0 6px 18px rgba(0,0,0,.15); max-width: 320px; font-size: 12px; z-index: 5; }
    .tip.err { border-color: var(--err); } .tip.err div { color: var(--err); }
    .tip.warn { border-color: var(--warn); } .tip.warn div { color: #9a5b00; }
    .legend { position: absolute; left: 30px; bottom: 8px; display: flex; gap: 12px; font-size: 11px; color: var(--steel-500); background: rgba(255,255,255,.85); padding: 3px 8px; border-radius: 4px; pointer-events: none; }
    .sw { display: inline-block; width: 12px; height: 10px; margin-right: 4px; vertical-align: -1px; border: 1px solid #333; }
    .sw.plate { background: #59636e; } .sw.door { background: #dfe9f7; border-color: #1E5AA8; }
    .sw.cut { border: 1.5px dashed #1E5AA8; } .sw.err { background: rgba(229,57,53,.35); border-color: #E53935; } .sw.cu { background: #C87533; border-color: #C87533; }
    .empty { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,.92); border: 1.5px dashed var(--steel-300); padding: 14px 18px; border-radius: 8px; color: var(--steel-500); pointer-events: none; }
  `,
})
export class FrontCanvas implements AfterViewInit, OnDestroy {
  readonly store = inject(ProjectStore);
  private readonly wrap = viewChild.required<ElementRef<HTMLDivElement>>('wrap');
  private readonly stageEl = viewChild.required<ElementRef<HTMLDivElement>>('stageEl');

  readonly tip = signal<{ x: number; y: number; title: string; lines: string[]; level: 'ok' | 'warn' | 'error' } | null>(null);
  readonly zoomPct = signal(100);
  private readonly ready = signal(false);

  private stage!: Konva.Stage;
  private layer!: Konva.Layer;
  private world!: Konva.Group;
  private selDims!: Konva.Group;
  private rulerLayer!: Konva.Layer;
  private ro?: ResizeObserver;
  private s = 1;
  private fitS = 1;
  private offX = 60;
  private offY = 60;
  private fitted = false;
  private sizeKey = '';
  private dragging: string | null = null;
  private nodes = new Map<string, Konva.Group>();

  constructor() {
    // Vẽ lại toàn bộ khi dự án / bố cục đổi
    effect(() => {
      this.store.project();
      this.store.layout();
      this.store.showDims();
      this.store.snapOn();
      if (!this.ready() || this.dragging) return;
      untracked(() => this.render());
    });
    // Chỉ đổi màu / kích thước chọn khi lựa chọn hoặc kết quả luật đổi
    effect(() => {
      const issues = this.store.issues();
      this.store.selectedIds();
      if (!this.ready() || this.dragging) return;
      untracked(() => this.refreshStyles(issues));
    });
  }

  ngAfterViewInit(): void {
    const el = this.stageEl().nativeElement;
    this.stage = new Konva.Stage({ container: el, width: el.clientWidth || 800, height: el.clientHeight || 600 });
    this.layer = new Konva.Layer();
    this.world = new Konva.Group({ draggable: true });
    this.layer.add(this.world);
    this.rulerLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.layer, this.rulerLayer);

    this.world.on('dragmove', (e) => {
      if ((e.target as unknown) !== this.world) return;
      this.offX = this.world.x();
      this.offY = this.world.y();
      this.drawRulers();
    });
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const ptr = this.stage.getPointerPosition();
      if (!ptr) return;
      this.zoomAt(ptr.x, ptr.y, e.evt.deltaY < 0 ? 1.12 : 1 / 1.12);
    });

    this.ro = new ResizeObserver(() => {
      this.stage.size({ width: el.clientWidth, height: el.clientHeight });
      if (!this.fitted && el.clientWidth > 50) {
        this.fitted = true;
        this.fit();
      } else this.render();
    });
    this.ro.observe(el);
    this.ready.set(true);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.stage?.destroy();
  }

  // ---------- khung nhìn ----------
  fit(): void {
    const p = this.store.project();
    const { W, H, base } = p.enclosure;
    const cw = this.stage.width() - RULER,
      ch = this.stage.height() - RULER;
    const s = Math.max(0.05, Math.min((cw - 120) / (W + 140), (ch - 90) / (H + base + 90)));
    this.s = this.fitS = s;
    this.offX = RULER + (cw - W * s) / 2 - 15 * s;
    this.offY = RULER + (ch - (H + base) * s) / 2 + 8;
    this.render();
  }

  zoomBy(k: number): void {
    this.zoomAt(this.stage.width() / 2, this.stage.height() / 2, k);
  }

  private zoomAt(px: number, py: number, k: number): void {
    const wx = (px - this.offX) / this.s,
      wy = (py - this.offY) / this.s;
    this.s = Math.min(this.fitS * 12, Math.max(this.fitS * 0.3, this.s * k));
    this.offX = px - wx * this.s;
    this.offY = py - wy * this.s;
    this.render();
  }

  /** Toạ độ màn hình (trong stage) → toạ độ thân tủ (mm, Y lên). */
  private toBody(px: number, py: number): { x: number; y: number } {
    const H = this.store.project().enclosure.H;
    return { x: (px - this.offX) / this.s, y: H - (py - this.offY) / this.s };
  }

  onDrop(e: CdkDragDrop<unknown>): void {
    const id = e.item.data as string;
    const r = this.stageEl().nativeElement.getBoundingClientRect();
    const px = e.dropPoint.x - r.left,
      py = e.dropPoint.y - r.top;
    if (px < 0 || py < 0 || px > r.width || py > r.height) return;
    this.store.addDevice(id, this.toBody(px, py));
  }

  // ---------- vẽ ----------
  private px(n: number): number {
    return n / this.s;
  }

  private render(): void {
    if (!this.stage) return;
    const st = this.store;
    const p = st.project();
    const lay = st.layout();
    const { W, H, base } = p.enclosure;
    // kích thước tủ đổi (đổi loại tủ, sửa H/W) → tự vừa khung lại
    const key = `${W}x${H}x${base}`;
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      if (this.fitted) return this.fit();
    }
    const Y = (y: number): number => H - y; // thân tủ (Y lên) → toạ độ vẽ (Y xuống)
    const w = this.world;
    w.destroyChildren();
    this.nodes.clear();
    w.position({ x: this.offX, y: this.offY });
    w.scale({ x: this.s, y: this.s });
    this.zoomPct.set(Math.round((this.s / this.fitS) * 100));

    // nền bắt sự kiện (click bỏ chọn, kéo = pan)
    const bg = new Konva.Rect({ x: -20000, y: -20000, width: 40000 + W, height: 40000 + H, fill: '#fbfcfd' });
    bg.on('mousedown touchstart', (e) => {
      if (!e.evt.shiftKey) st.select(null);
    });
    w.add(bg);

    // khung đế
    if (base) {
      w.add(new Konva.Rect({ x: 0, y: H, width: W, height: base, fill: C.base, stroke: '#1f262e', strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
      w.add(new Konva.Text({ x: 0, y: H + base / 2 - this.px(6), width: W, align: 'center', text: `KHUNG ĐẾ ${base}`, fontSize: this.px(11), fill: '#d6dce2', listening: false }));
    }
    // thân tủ
    w.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: C.body, stroke: C.bodyStroke, strokeWidth: 2, strokeScaleEnabled: false, listening: false }));
    // tấm đế
    const pl = lay.plate;
    w.add(new Konva.Rect({ x: pl.x, y: Y(pl.y + pl.h), width: pl.w, height: pl.h, fill: C.plate, stroke: C.plateStroke, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    // lưới
    this.addGrid(w, pl, Y);

    // ngăn
    lay.sections.forEach((s, i) => {
      if (i < lay.sections.length - 1) {
        w.add(new Konva.Line({ points: [0, Y(s.y0), W, Y(s.y0)], stroke: C.bodyStroke, strokeWidth: 1.5, dash: [this.px(10), this.px(5)], strokeScaleEnabled: false, listening: false }));
      }
      w.add(new Konva.Text({ x: pl.x + this.px(4), y: Y(s.y1) + this.px(4), text: `Ngăn ${i + 1}`, fontSize: this.px(11), fill: '#6b7783', fontStyle: 'bold', listening: false }));
    });

    // thanh cái
    for (const b of lay.bars) {
      w.add(new Konva.Rect({ x: b.rect.x, y: Y(b.rect.y + b.rect.h), width: b.rect.w, height: b.rect.h, fill: C.copper, opacity: 0.8, cornerRadius: 1, listening: false }));
      w.add(new Konva.Text({ x: b.rect.x + b.rect.w + this.px(3), y: Y(b.rect.y + b.rect.h / 2) - this.px(5), text: b.phase, fontSize: this.px(10), fill: C.copper, fontStyle: 'bold', listening: false }));
    }

    // cửa (nét đứt xanh)
    // cửa trong (tủ 2 lớp) + ô khoét lộ aptomat
    if (lay.cover) {
      const cv = lay.cover;
      w.add(new Konva.Rect({ x: cv.x, y: Y(cv.y + cv.h), width: cv.w, height: cv.h, stroke: '#8a6d00', strokeWidth: 1.4, dash: [this.px(3), this.px(4)], strokeScaleEnabled: false, listening: false }));
      w.add(new Konva.Text({ x: cv.x + this.px(4), y: Y(cv.y) - this.px(14), text: 'Cửa trong', fontSize: this.px(10), fill: '#8a6d00', listening: false }));
      for (const win of coverWindows(p, st.cat)) {
        w.add(new Konva.Rect({ x: win.rect.x, y: Y(win.rect.y + win.rect.h), width: win.rect.w, height: win.rect.h, stroke: '#c79100', strokeWidth: 1.5, dash: [this.px(5), this.px(3)], strokeScaleEnabled: false, listening: false }));
      }
    }
    for (const leaf of lay.leaves) {
      const r = leaf.rect;
      w.add(new Konva.Rect({ x: r.x, y: Y(r.y + r.h), width: r.w, height: r.h, stroke: C.accent, strokeWidth: leaf.carriesCutouts ? 1.6 : 1, dash: [this.px(8), this.px(5)], strokeScaleEnabled: false, opacity: leaf.carriesCutouts ? 0.9 : 0.45, listening: false }));
      const hx = leaf.hinge === 'left' ? r.x : r.x + r.w - 6;
      const n = r.h <= 1000 ? 2 : r.h <= 1800 ? 3 : 4;
      for (let i = 0; i < n; i++) {
        const cy = r.y + 150 + ((r.h - 300) * i) / Math.max(1, n - 1);
        w.add(new Konva.Rect({ x: hx, y: Y(cy + 25), width: 6, height: 50, fill: C.accent, opacity: 0.5, listening: false }));
      }
      if (leaf.hasLock) {
        const lx = r.x + lockX(leaf);
        w.add(new Konva.Circle({ x: lx, y: Y(r.y + r.h / 2), radius: 11.25, stroke: C.accent, strokeWidth: 1.5, strokeScaleEnabled: false, listening: false }));
      }
      w.add(new Konva.Text({ x: r.x + this.px(4), y: Y(r.y) - this.px(15), text: leaf.name, fontSize: this.px(10.5), fill: C.accent, listening: false }));
    }

    // thiết bị
    for (const pd of p.devices) {
      const def = st.defOf(pd.deviceId);
      if (!def) continue;
      const r = deviceRect(pd, def);
      const g = new Konva.Group({ x: r.x, y: Y(r.y + r.h), draggable: true, id: pd.uid });
      const isDoor = pd.mount === 'door';
      const round = def.doorCutout?.shape === 'circle' && isDoor;
      const dark = !isDoor;
      g.add(new Konva.Rect({ name: 'frame', width: r.w, height: r.h, fill: dark ? (def.isBreaker ? '#2f363d' : '#59636e') : '#dfe9f7', cornerRadius: Math.min(3, r.w / 10), stroke: '#11161b', strokeWidth: 1, strokeScaleEnabled: false }));
      if (round) {
        g.add(new Konva.Circle({ x: r.w / 2, y: r.h / 2, radius: Math.min(r.w, r.h) * 0.36, fill: def.color ?? '#9aa5b1', stroke: '#11161b', strokeWidth: 1, strokeScaleEnabled: false }));
        if (def.type === 'SELECTOR') g.add(new Konva.Rect({ x: r.w / 2 - 3, y: r.h * 0.2, width: 6, height: r.h * 0.6, fill: '#11161b', cornerRadius: 2 }));
      } else if (def.isBreaker) {
        // cần gạt
        const hw = Math.min(r.w * 0.22, 26),
          hh = Math.min(r.h * 0.3, 60);
        g.add(new Konva.Rect({ x: r.w / 2 - hw / 2, y: r.h / 2 - hh / 2, width: hw, height: hh, fill: '#f5f7f9', cornerRadius: 1.5 }));
        g.add(new Konva.Rect({ x: 3, y: 3, width: r.w - 6, height: Math.min(14, r.h * 0.1), fill: '#7c8792', opacity: 0.7 }));
        g.add(new Konva.Rect({ x: 3, y: r.h - 3 - Math.min(14, r.h * 0.1), width: r.w - 6, height: Math.min(14, r.h * 0.1), fill: '#7c8792', opacity: 0.7 }));
      } else if (isDoor) {
        g.add(new Konva.Rect({ x: r.w * 0.1, y: r.h * 0.1, width: r.w * 0.8, height: r.h * 0.5, fill: '#fff', stroke: '#6b7783', strokeWidth: 1, strokeScaleEnabled: false }));
        g.add(new Konva.Line({ points: [r.w - 10, 0, r.w, 0, r.w, 10], closed: true, fill: C.accent }));
      }
      // lỗ khoét cửa của thiết bị lắp tấm đế
      const cut = deviceCutout(pd, def);
      if (cut && !isDoor) {
        const bb = holeBBox(cut);
        g.add(new Konva.Rect({ x: bb.minX - r.x, y: Y(bb.maxY) - Y(r.y + r.h), width: bb.maxX - bb.minX, height: bb.maxY - bb.minY, stroke: '#7fb3ff', strokeWidth: 1.5, dash: [this.px(5), this.px(3)], strokeScaleEnabled: false, listening: false }));
      }
      // nhãn
      if (r.w >= 40 && r.h >= 40) {
        const fs = Math.max(this.px(8), Math.min(r.w / 7, this.px(12), 16));
        g.add(new Konva.Text({ x: 2, y: isDoor ? r.h * 0.64 : r.h * 0.74, width: r.w - 4, align: 'center', text: pd.label || def.model, fontSize: fs, fill: dark ? '#fff' : '#1f262e', wrap: 'none', ellipsis: true, listening: false }));
      }
      if (pd.isMain) g.add(new Konva.Text({ x: 2, y: 2 + Math.min(14, r.h * 0.1), width: r.w - 4, align: 'center', text: 'TỔNG', fontSize: this.px(9), fill: '#FFD54F', fontStyle: 'bold', listening: false }));
      g.add(new Konva.Rect({ name: 'overlay', width: r.w, height: r.h, fill: 'rgba(229,57,53,0.32)', visible: false, listening: false, cornerRadius: Math.min(3, r.w / 10) }));
      g.add(new Konva.Rect({ name: 'sel', x: -this.px(4), y: -this.px(4), width: r.w + this.px(8), height: r.h + this.px(8), stroke: C.accent, strokeWidth: 1.5, dash: [this.px(4), this.px(3)], strokeScaleEnabled: false, visible: false, listening: false }));

      this.bindDevice(g, pd.uid, r);
      w.add(g);
      this.nodes.set(pd.uid, g);
    }

    // kích thước tổng
    if (st.showDims()) {
      const off = this.px(26);
      this.dimH(w, 0, W, -off, `${W}`);
      this.dimV(w, -off, 0, H, `${H}`);
      if (base) this.dimV(w, -off, H, H + base, `${base}`);
      const xr = W + this.px(22);
      lay.sections.forEach((s) => this.dimV(w, xr, Y(s.y1), Y(s.y0), `${s.h}`));
    }
    this.selDims = new Konva.Group({ listening: false });
    w.add(this.selDims);
    this.refreshStyles(st.issues());
    this.drawRulers();
  }

  private addGrid(w: Konva.Group, pl: Rect, Y: (y: number) => number): void {
    const s = this.s;
    const minor = this.store.snapOn() ? [5, 10, 25, 50].find((v) => v * s >= 6) ?? 100 : [10, 50, 100].find((v) => v * s >= 8) ?? 100;
    const major = minor <= 10 ? 50 : minor * 4;
    const mk = (step: number, color: string): Konva.Shape =>
      new Konva.Shape({
        listening: false,
        stroke: color,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        sceneFunc: (ctx, shape) => {
          ctx.beginPath();
          for (let x = pl.x; x <= pl.x + pl.w + 0.01; x += step) {
            ctx.moveTo(x, Y(pl.y));
            ctx.lineTo(x, Y(pl.y + pl.h));
          }
          for (let y = pl.y; y <= pl.y + pl.h + 0.01; y += step) {
            ctx.moveTo(pl.x, Y(y));
            ctx.lineTo(pl.x + pl.w, Y(y));
          }
          ctx.strokeShape(shape);
        },
      });
    w.add(mk(minor, '#eef1f4'));
    w.add(mk(major, '#dde3e9'));
  }

  private bindDevice(g: Konva.Group, uidv: string, r0: Rect): void {
    const st = this.store;
    const H = st.project().enclosure.H;
    const container = this.stage.container();
    const toBodyY = (gy: number): number => H - gy - r0.h;
    g.on('mousedown touchstart', (e) => {
      e.cancelBubble = true;
      const add = (e.evt as MouseEvent).shiftKey;
      if (add || !st.selectedIds().includes(uidv)) st.select(uidv, add);
    });
    g.on('dragstart', () => {
      this.dragging = uidv;
      this.tip.set(null);
      g.moveToTop();
    });
    g.on('dragmove', () => {
      const on = st.snapOn();
      const x = snap(g.x(), on);
      const y = snap(toBodyY(g.y()), on);
      g.position({ x, y: H - y - r0.h });
      this.liveCheck(uidv, x, y);
    });
    g.on('dragend', () => {
      const x = snap(g.x(), st.snapOn());
      const y = snap(toBodyY(g.y()), st.snapOn());
      this.dragging = null;
      st.moveDevice(uidv, x, y);
    });
    g.on('mouseenter', () => {
      container.style.cursor = 'move';
      this.showTip(uidv);
    });
    g.on('mousemove', () => this.showTip(uidv));
    g.on('mouseleave', () => {
      container.style.cursor = 'default';
      this.tip.set(null);
    });
  }

  private showTip(uidv: string): void {
    if (this.dragging) return;
    const pd = this.store.project().devices.find((d) => d.uid === uidv);
    const def = pd && this.store.defOf(pd.deviceId);
    const ptr = this.stage.getPointerPosition();
    if (!pd || !def || !ptr) return;
    const iss = this.store.issues().get(uidv);
    const r = deviceRect(pd, def);
    this.tip.set({
      x: Math.min(ptr.x + 14, this.stage.width() - 330),
      y: ptr.y + 16,
      title: `${pd.label || def.model} · ${def.name} · ${r.w}×${r.h} · x=${pd.x} y=${pd.y}`,
      lines: iss ? iss.messages : [pd.mount === 'door' ? 'Gắn trên cửa (lỗ khoét)' : 'Gắn trên tấm đế'],
      level: iss ? iss.level : 'ok',
    });
  }

  /** Kiểm tra luật trực tiếp khi đang kéo (không ghi vào store). */
  private liveCheck(uidv: string, x: number, y: number): void {
    const st = this.store;
    const p0 = st.project();
    const tmp: Project = { ...p0, devices: p0.devices.map((d) => (d.uid === uidv ? { ...d, x, y } : d)) };
    const issues = issuesByTarget(runRules(tmp, st.cat, st.layout(), generateParts(tmp, st.cat)));
    this.refreshStyles(issues, tmp);
  }

  private refreshStyles(issues: IssueMap, proj?: Project): void {
    if (!this.layer || !this.selDims) return;
    const sel = this.store.selectedIds();
    for (const [uidv, g] of this.nodes) {
      const iss = issues.get(uidv);
      const frame = g.findOne<Konva.Rect>('.frame');
      const overlay = g.findOne<Konva.Rect>('.overlay');
      const selR = g.findOne<Konva.Rect>('.sel');
      if (!frame) continue;
      frame.stroke(iss ? (iss.level === 'error' ? C.err : C.warn) : sel.includes(uidv) ? C.accent : '#11161b');
      frame.strokeWidth(iss ? 3 : sel.includes(uidv) ? 2.5 : 1);
      if (overlay) overlay.fill(iss?.level === 'warn' ? 'rgba(251,140,0,0.25)' : 'rgba(229,57,53,0.32)');
      overlay?.visible(!!iss);
      selR?.visible(sel.includes(uidv));
    }
    this.drawSelDims(proj ?? this.store.project());
    this.layer.batchDraw();
  }

  /** Kích thước tự động cho thiết bị đang chọn: tới mép vùng lắp và đáy ngăn. */
  private drawSelDims(p: Project): void {
    this.selDims.destroyChildren();
    const st = this.store;
    if (!st.showDims()) return;
    const ids = st.selectedIds();
    if (ids.length !== 1) return;
    const pd = p.devices.find((d) => d.uid === ids[0]);
    const def = pd && st.defOf(pd.deviceId);
    if (!pd || !def) return;
    const lay = st.layout();
    const H = p.enclosure.H;
    const Y = (y: number): number => H - y;
    const r = deviceRect(pd, def);
    const area = pd.mount === 'plate' ? lay.plate : (lay.leaves.find((l) => l.carriesCutouts && r.x + r.w / 2 >= l.rect.x && r.x + r.w / 2 <= l.rect.x + l.rect.w) ?? lay.leaves[0]).rect;
    const cy = Y(r.y + r.h / 2);
    if (r.x > area.x) this.dimH(this.selDims, area.x, r.x, cy, `${Math.round(r.x - area.x)}`, true);
    if (area.x + area.w > r.x + r.w) this.dimH(this.selDims, r.x + r.w, area.x + area.w, cy, `${Math.round(area.x + area.w - r.x - r.w)}`, true);
    const sec = sectionAt(lay, r.y + r.h / 2);
    const bottom = pd.mount === 'plate' ? Math.max(area.y, sec?.y0 ?? area.y) : area.y;
    const cx = r.x + r.w / 2;
    if (r.y > bottom) this.dimV(this.selDims, cx, Y(r.y), Y(bottom), `${Math.round(r.y - bottom)}`, true);
    this.selDims.add(new Konva.Text({ x: r.x, y: Y(r.y + r.h) - this.px(15), width: r.w, align: 'center', text: `${r.w}×${r.h}`, fontSize: this.px(11), fill: C.accent, fontStyle: 'bold' }));
  }

  private dimH(g: Konva.Group, x1: number, x2: number, y: number, label: string, hot = false): void {
    const col = hot ? C.accent : C.dim;
    const pl = this.px(7),
      pw = this.px(5);
    g.add(new Konva.Arrow({ points: [x1, y, x2, y], pointerAtBeginning: true, pointerLength: pl, pointerWidth: pw, stroke: col, fill: col, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    const ext = this.px(6);
    g.add(new Konva.Line({ points: [x1, y - ext, x1, y + ext], stroke: col, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    g.add(new Konva.Line({ points: [x2, y - ext, x2, y + ext], stroke: col, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    this.dimLabel(g, (x1 + x2) / 2, y - this.px(8), label, col);
  }

  private dimV(g: Konva.Group, x: number, y1: number, y2: number, label: string, hot = false): void {
    const col = hot ? C.accent : C.dim;
    const pl = this.px(7),
      pw = this.px(5);
    g.add(new Konva.Arrow({ points: [x, y1, x, y2], pointerAtBeginning: true, pointerLength: pl, pointerWidth: pw, stroke: col, fill: col, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    const ext = this.px(6);
    g.add(new Konva.Line({ points: [x - ext, y1, x + ext, y1], stroke: col, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    g.add(new Konva.Line({ points: [x - ext, y2, x + ext, y2], stroke: col, strokeWidth: 1, strokeScaleEnabled: false, listening: false }));
    this.dimLabel(g, x, (y1 + y2) / 2, label, col, -90);
  }

  private dimLabel(g: Konva.Group, x: number, y: number, text: string, color: string, rotation = 0): void {
    const fs = this.px(11);
    const lbl = new Konva.Label({ x, y, rotation, listening: false });
    lbl.add(new Konva.Tag({ fill: 'rgba(255,255,255,0.9)', cornerRadius: this.px(2) }));
    lbl.add(new Konva.Text({ text, fontSize: fs, fill: color, padding: this.px(1.5), fontFamily: 'Consolas, monospace' }));
    lbl.offsetX(lbl.width() / 2);
    lbl.offsetY(lbl.height() / 2);
    g.add(lbl);
  }

  /** Thước mm trên/trái (toạ độ màn hình). Gốc X = mép trái thân tủ, gốc Y = mặt sàn. */
  private drawRulers(): void {
    const L = this.rulerLayer;
    L.destroyChildren();
    const sw = this.stage.width(),
      sh = this.stage.height();
    const { H, base } = this.store.project().enclosure;
    const s = this.s;
    const major = [10, 20, 50, 100, 200, 500, 1000].find((v) => v * s >= 55) ?? 1000;
    const minor = major / (major === 20 || major === 200 ? 4 : 5);
    L.add(new Konva.Rect({ x: 0, y: 0, width: sw, height: RULER, fill: '#eef1f4', stroke: '#cfd6dd', strokeWidth: 1 }));
    L.add(new Konva.Rect({ x: 0, y: 0, width: RULER, height: sh, fill: '#eef1f4', stroke: '#cfd6dd', strokeWidth: 1 }));
    const ticks = new Konva.Shape({
      stroke: '#7c8792',
      strokeWidth: 1,
      sceneFunc: (ctx, shape) => {
        ctx.beginPath();
        const x0 = Math.floor((RULER - this.offX) / s / minor) * minor;
        for (let xm = x0; this.offX + xm * s < sw; xm += minor) {
          const sx = Math.round(this.offX + xm * s) + 0.5;
          if (sx < RULER) continue;
          const big = Math.abs(xm % major) < 1e-6;
          ctx.moveTo(sx, RULER);
          ctx.lineTo(sx, big ? 6 : 15);
        }
        // trục Y: mm từ sàn
        const yAt = (yf: number): number => this.offY + (H + base - yf) * s;
        const yTop = H + base - (RULER - this.offY) / s;
        const yBottom = H + base - (sh - this.offY) / s;
        for (let yf = Math.floor(yBottom / minor) * minor; yf <= yTop; yf += minor) {
          const sy = Math.round(yAt(yf)) + 0.5;
          if (sy < RULER) continue;
          const big = Math.abs(yf % major) < 1e-6;
          ctx.moveTo(RULER, sy);
          ctx.lineTo(big ? 6 : 15, sy);
        }
        ctx.strokeShape(shape);
      },
    });
    L.add(ticks);
    const x0 = Math.ceil((RULER - this.offX) / s / major) * major;
    for (let xm = x0; this.offX + xm * s < sw; xm += major) {
      L.add(new Konva.Text({ x: this.offX + xm * s + 2, y: 2, text: String(xm), fontSize: 9, fill: '#3c4752' }));
    }
    const yTop = H + base - (RULER - this.offY) / s;
    const yBottom = H + base - (sh - this.offY) / s;
    for (let yf = Math.ceil(yBottom / major) * major; yf <= yTop; yf += major) {
      L.add(new Konva.Text({ x: 2, y: this.offY + (H + base - yf) * s - 2, text: String(yf), fontSize: 9, fill: '#3c4752', rotation: -90 }));
    }
    L.add(new Konva.Rect({ x: 0, y: 0, width: RULER, height: RULER, fill: '#dfe4e9' }));
    L.add(new Konva.Text({ x: 3, y: 6, text: 'mm', fontSize: 8, fill: '#3c4752' }));
    L.batchDraw();
  }
}
