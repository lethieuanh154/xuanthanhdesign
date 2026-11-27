import { AfterViewInit, Component, computed, effect, ElementRef, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import Konva from 'konva';
import { CncStage } from '../components/konva-view';
import { drawNest, drawSource, LayerMode, NEST_BG, nestLayout, sourceToWorld } from '../components/dxf-nest-render';
import { saveBlob } from '../core/export.service';
import { detectParts, DxfDocLike, explodeDxf, ImportedPart, packRects, pointInPolygon, removeDiacritics, slug } from '../geometry';

type SheetPreset = '1250x2500' | '1500x3000' | 'custom';

/** Layer mặc định TẮT (kích thước, chữ, hatch, khung tên…) — so khớp tên đã bỏ dấu. */
const OFF_RE = /(^|[^a-z])(dim|dims|dimension|kich ?thuoc|kt|text|txt|chu|note|ghi ?chu|hatch|defpoints|title|khung|frame|vport|viewport)([^a-z]|$)/i;
/** Layer mặc định CHỈ HIỆN (đường chấn). */
const SHOW_RE = /(bend|chan|gap|fold)/i;

/** Khoá ổn định của chi tiết (không đổi khi chỉnh dung sai / layer khác) = vị trí + kích thước trong bản vẽ. */
const keyOf = (p: ImportedPart): string => `${Math.round(p.world.minX)},${Math.round(p.world.minY)},${Math.round(p.w)},${Math.round(p.h)}`;

/**
 * SẮP TÔN TỪ FILE DXF: đọc bản vẽ chi tiết (DXF) → nhận dạng chi tiết (biên dạng kín + lỗ)
 * → xếp lên khổ tôn (MaxRects) → xuất ảnh JPG các tấm tôn.
 * Không cần dự án / backend: mọi thứ chạy trong trình duyệt.
 */
@Component({
  selector: 'app-dxf-nest-page',
  imports: [RouterLink],
  templateUrl: './dxf-nest-page.html',
  styleUrl: './dxf-nest-page.scss',
})
export class DxfNestPage implements AfterViewInit, OnDestroy {
  // ── file ──
  readonly fileName = signal('');
  readonly fileSize = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly dragOver = signal(false);
  private readonly doc = signal<DxfDocLike | null>(null);

  // ── nhận dạng ──
  readonly userScale = signal(1);
  /** Đơn vị bản vẽ: 'auto' = theo header + tự đoán; số = hệ số ra mm. */
  readonly unit = signal<'auto' | number>('auto');
  readonly units: { v: 'auto' | number; label: string }[] = [
    { v: 'auto', label: 'Tự động' },
    { v: 1, label: 'mm' },
    { v: 10, label: 'cm' },
    { v: 1000, label: 'm' },
    { v: 25.4, label: 'inch' },
  ];
  readonly tol = signal(0.1);
  readonly minSize = signal(20);
  readonly modes = signal<Record<string, LayerMode>>({});

  // ── chọn chi tiết ──
  readonly excluded = signal<ReadonlySet<string>>(new Set());
  readonly qty = signal<Record<string, number>>({});
  readonly sets = signal(1);
  readonly hover = signal<string | null>(null);
  readonly selecting = signal(false);

  // ── sắp tôn ──
  readonly preset = signal<SheetPreset>('1250x2500');
  readonly customW = signal(1250);
  readonly customH = signal(2500);
  readonly gap = signal(10);
  readonly margin = signal(10);
  readonly rotate = signal(true);

  // ── xuất ──
  readonly res = signal(1);
  readonly titles = signal(true);
  readonly codes = signal(false);
  readonly colorMode = signal<'white' | 'drawing'>('white');
  readonly view = signal<'src' | 'nest'>('src');
  readonly exporting = signal(false);

  readonly exploded = computed(() => {
    const d = this.doc();
    if (!d) return null;
    const u = this.unit();
    return explodeDxf(d, { unitScale: u === 'auto' ? undefined : u, scale: this.userScale() });
  });

  readonly detected = computed(() => {
    const ex = this.exploded();
    if (!ex) return null;
    const m = this.modes();
    const pick = (mode: LayerMode): Set<string> => new Set(ex.layers.filter((l) => (m[l.name] ?? 'cut') === mode).map((l) => l.name));
    return detectParts(ex, { cutLayers: pick('cut'), showLayers: pick('show'), tol: this.tol(), minSize: this.minSize() });
  });

  readonly parts = computed(() => this.detected()?.parts ?? []);
  readonly partsByKey = computed(() => new Map(this.parts().map((p) => [keyOf(p), p])));
  readonly includedParts = computed(() => this.parts().filter((p) => !this.excluded().has(keyOf(p))));

  readonly sheet = computed(() => {
    const p = this.preset();
    if (p === 'custom') return { w: Math.max(100, this.customW()), h: Math.max(100, this.customH()) };
    const [w, h] = p.split('x').map(Number);
    return { w, h };
  });

  readonly packed = computed(() => {
    const s = this.sheet();
    const items = this.includedParts().map((p) => ({ id: keyOf(p), w: p.w, h: p.h, qty: this.qtyOf(p) * Math.max(1, this.sets()) }));
    return packRects(items, { sheetW: s.w, sheetH: s.h, gap: Math.max(0, this.gap()), margin: Math.max(0, this.margin()), allowRotate: this.rotate() });
  });

  readonly stats = computed(() => {
    const r = this.packed();
    const s = this.sheet();
    const map = this.partsByKey();
    // tấm đã sắp sẵn trong bản vẽ không tính % (chi tiết dính nhau, không tách được diện tích)
    const nested = r.sheets.filter((sh) => !sh.whole);
    const net = nested.reduce((a, sh) => a + sh.placements.reduce((b, pl) => b + (map.get(pl.id)?.area ?? 0), 0), 0);
    const count = nested.reduce((a, sh) => a + sh.placements.length, 0);
    const unplaced = [...new Set(r.unplaced)].map((k) => map.get(k)?.code ?? k);
    return {
      sheets: r.sheets.length,
      whole: r.sheets.length - nested.length,
      util: nested.length ? net / (nested.length * s.w * s.h) : 0,
      count,
      unplaced,
      unplacedCount: r.unplaced.length,
    };
  });

  readonly layout = computed(() => nestLayout(this.packed().sheets.length, this.sheet().w, this.sheet().h, this.titles()));

  private readonly el = viewChild.required<ElementRef<HTMLDivElement>>('stage');
  private readonly ready = signal(false);
  private cnc?: CncStage;
  private selRect?: Konva.Rect;
  private down: { x: number; y: number } | null = null;
  private selStart: { x: number; y: number } | null = null;

  constructor() {
    // vẽ lại khi bất kỳ dữ liệu hiển thị nào đổi
    effect(() => {
      this.view();
      this.detected();
      this.excluded();
      this.hover();
      this.packed();
      this.layout();
      this.codes();
      this.colorMode();
      if (!this.ready()) return;
      untracked(() => this.cnc?.layer.batchDraw());
    });
    // thu phóng vừa khung khi đổi tab / đổi bản vẽ / đổi số tấm
    effect(() => {
      this.view();
      this.exploded();
      this.layout();
      if (!this.ready()) return;
      untracked(() => this.refit());
    });
    effect(() => {
      const sel = this.selecting();
      if (this.ready()) untracked(() => this.cnc?.stage.draggable(!sel));
    });
  }

  ngAfterViewInit(): void {
    const cnc = new CncStage(this.el().nativeElement);
    this.cnc = cnc;
    cnc.layer.add(new Konva.Shape({ listening: false, sceneFunc: (ctx) => this.paint(ctx) }));
    this.selRect = new Konva.Rect({ visible: false, listening: false, stroke: '#ffd400', strokeWidth: 1, strokeScaleEnabled: false, dash: [6, 4], fill: 'rgba(255,212,0,0.08)' });
    cnc.layer.add(this.selRect);
    cnc.onResize = () => this.refit();
    cnc.stage.on('dblclick dbltap', () => this.refit());
    cnc.stage.on('mousedown touchstart', () => {
      this.down = cnc.stage.getPointerPosition();
      if (this.selecting()) {
        this.selStart = cnc.layer.getRelativePointerPosition();
        if (this.selStart) this.selRect?.setAttrs({ x: this.selStart.x, y: this.selStart.y, width: 0, height: 0, visible: true });
      }
    });
    cnc.stage.on('mousemove touchmove', () => {
      if (!this.selStart) return;
      const p = cnc.layer.getRelativePointerPosition();
      if (!p) return;
      this.selRect?.setAttrs({ x: Math.min(p.x, this.selStart.x), y: Math.min(p.y, this.selStart.y), width: Math.abs(p.x - this.selStart.x), height: Math.abs(p.y - this.selStart.y) });
      cnc.layer.batchDraw();
    });
    cnc.stage.on('mouseup touchend', (e) => {
      const up = cnc.stage.getPointerPosition();
      if (this.selStart) {
        const p = cnc.layer.getRelativePointerPosition();
        if (p) this.finishRegion(this.selStart, p, (e.evt as MouseEvent).shiftKey);
        this.selStart = null;
        this.selRect?.visible(false);
        this.selecting.set(false);
        cnc.layer.batchDraw();
      } else if (this.down && up && Math.hypot(up.x - this.down.x, up.y - this.down.y) < 4) {
        const p = cnc.layer.getRelativePointerPosition();
        if (p) this.clickAt(p);
      }
      this.down = null;
    });
    this.ready.set(true);
  }

  ngOnDestroy(): void {
    this.cnc?.destroy();
  }

  // ───────────── file ─────────────

  onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.load(f);
    input.value = '';
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) void this.load(f);
  }

  async load(f: File): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    this.fileName.set(f.name);
    this.fileSize.set(f.size);
    try {
      const head = new TextDecoder('latin1').decode(await f.slice(0, 22).arrayBuffer());
      if (/^AC10\d\d/.test(head)) throw new Error('Đây là file DWG. Hãy mở bằng AutoCAD và lưu ra DXF (Save As → AutoCAD DXF) rồi chọn lại.');
      if (head.startsWith('AutoCAD Binary DXF')) throw new Error('DXF dạng nhị phân chưa hỗ trợ. Hãy lưu lại DXF dạng ASCII (mặc định của AutoCAD).');
      const text = await f.text();
      await new Promise((r) => setTimeout(r, 20)); // cho giao diện kịp hiện "Đang đọc…"
      const { default: DxfParser } = await import('dxf-parser');
      const parsed = new DxfParser().parseSync(text) as unknown as DxfDocLike | null;
      if (!parsed?.entities) throw new Error('Không đọc được nội dung DXF.');
      const ex = explodeDxf(parsed);
      if (!ex.paths.length) throw new Error('Bản vẽ không có nét nào trong Model (chỉ có chữ / kích thước, hoặc nằm ở Layout).');
      // chế độ mặc định từng layer
      const modes: Record<string, LayerMode> = {};
      for (const l of ex.layers) {
        const n = removeDiacritics(l.name);
        modes[l.name] = !l.visible || OFF_RE.test(n) ? 'off' : SHOW_RE.test(n) ? 'show' : 'cut';
      }
      this.userScale.set(1);
      this.unit.set('auto');
      this.modes.set(modes);
      this.excluded.set(new Set());
      this.qty.set({});
      this.view.set('src');
      this.doc.set(parsed);
    } catch (e) {
      this.doc.set(null);
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }

  // ───────────── layer / chi tiết ─────────────

  setMode(layer: string, mode: LayerMode): void {
    this.modes.update((m) => ({ ...m, [layer]: mode }));
  }

  setAllModes(mode: LayerMode): void {
    this.modes.update((m) => Object.fromEntries(Object.keys(m).map((k) => [k, mode])));
  }

  modeOf(layer: string): LayerMode {
    return this.modes()[layer] ?? 'cut';
  }

  key(p: ImportedPart): string {
    return keyOf(p);
  }

  isOn(p: ImportedPart): boolean {
    return !this.excluded().has(keyOf(p));
  }

  toggle(p: ImportedPart): void {
    const k = keyOf(p);
    this.excluded.update((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  selectAll(on: boolean): void {
    this.excluded.set(on ? new Set() : new Set(this.parts().map(keyOf)));
  }

  qtyOf(p: ImportedPart): number {
    return Math.max(0, Math.floor(this.qty()[keyOf(p)] ?? 1));
  }

  setQty(p: ImportedPart, v: string): void {
    const n = Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));
    this.qty.update((q) => ({ ...q, [keyOf(p)]: n }));
  }

  num(v: string, min: number, max: number, fallback: number): number {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  // ───────────── khung xem ─────────────

  private refit(): void {
    const cnc = this.cnc;
    if (!cnc) return;
    if (this.view() === 'nest' && this.packed().sheets.length) {
      const lay = this.layout();
      cnc.fit(lay.W, lay.H, 16);
    } else {
      const ex = this.exploded();
      if (ex) cnc.fit(ex.extents.maxX - ex.extents.minX, ex.extents.maxY - ex.extents.minY, 30);
    }
    cnc.layer.batchDraw();
  }

  private paint(ctx: Konva.Context): void {
    const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
    const k = this.cnc?.stage.scaleX() ?? 1;
    if (this.view() === 'nest') {
      const r = this.packed();
      if (r.sheets.length) drawNest(c, k, r.sheets, this.partsByKey(), this.sheet(), this.layout(), { titles: this.titles(), codes: this.codes(), colorMode: this.colorMode(), highlight: this.hover() });
      return;
    }
    const ex = this.exploded(),
      det = this.detected();
    if (!ex || !det) return;
    const exc = this.excluded();
    drawSource(c, k, ex, det, this.modes(), (key) => !exc.has(key), keyOf, this.hover());
  }

  private partAt(p: { x: number; y: number }): ImportedPart | null {
    const ex = this.exploded();
    if (!ex) return null;
    const w = sourceToWorld(ex.extents, p);
    let best: ImportedPart | null = null;
    for (const part of this.parts()) {
      const b = part.world;
      if (w.x < b.minX || w.x > b.maxX || w.y < b.minY || w.y > b.maxY) continue;
      if (!pointInPolygon({ x: w.x - b.minX, y: w.y - b.minY }, part.outline)) continue;
      if (!best || part.w * part.h < best.w * best.h) best = part;
    }
    return best;
  }

  private clickAt(p: { x: number; y: number }): void {
    if (this.view() !== 'src') return;
    const part = this.partAt(p);
    if (part) this.toggle(part);
  }

  /** Kéo khung: chỉ giữ chi tiết nằm gọn trong khung (Shift = thêm vào lựa chọn hiện có). */
  private finishRegion(a: { x: number; y: number }, b: { x: number; y: number }, add: boolean): void {
    const ex = this.exploded();
    if (!ex || Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return;
    const p1 = sourceToWorld(ex.extents, a),
      p2 = sourceToWorld(ex.extents, b);
    const box = { minX: Math.min(p1.x, p2.x), maxX: Math.max(p1.x, p2.x), minY: Math.min(p1.y, p2.y), maxY: Math.max(p1.y, p2.y) };
    const inside = (q: ImportedPart): boolean => q.world.minX >= box.minX && q.world.maxX <= box.maxX && q.world.minY >= box.minY && q.world.maxY <= box.maxY;
    this.excluded.update((s) => {
      const n = new Set(add ? s : this.parts().map(keyOf));
      for (const q of this.parts()) if (inside(q)) n.delete(keyOf(q));
      return n;
    });
  }

  startSelect(): void {
    this.view.set('src');
    this.selecting.set(!this.selecting());
  }

  // ───────────── xuất JPG ─────────────

  async exportJpg(): Promise<void> {
    const r = this.packed();
    if (!r.sheets.length) return;
    this.exporting.set(true);
    try {
      const lay = this.layout();
      // giới hạn canvas của trình duyệt ~16 384 px mỗi chiều
      const k = Math.min(this.res(), 16000 / lay.W, 16000 / lay.H);
      const cv = document.createElement('canvas');
      cv.width = Math.round(lay.W * k);
      cv.height = Math.round(lay.H * k);
      const c = cv.getContext('2d');
      if (!c) throw new Error('Trình duyệt không tạo được canvas.');
      c.fillStyle = NEST_BG;
      c.fillRect(0, 0, cv.width, cv.height);
      c.scale(k, k);
      drawNest(c, k, r.sheets, this.partsByKey(), this.sheet(), lay, { titles: this.titles(), codes: this.codes(), colorMode: this.colorMode(), highlight: null });
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Không tạo được ảnh JPG.');
      const base = slug(this.fileName().replace(/\.dxf$/i, '')) || 'ban-ve';
      const s = this.sheet();
      saveBlob(blob, `${base}_SapTon_${s.w}x${s.h}_${r.sheets.length}tam.jpg`, 'image/jpeg');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.exporting.set(false);
    }
  }

  // ───────────── hiển thị ─────────────

  fmt(v: number, d = 1): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }).format(v);
  }

  pct(v: number): string {
    return this.fmt(v * 100, 1) + '%';
  }

  skippedText(): string {
    const s = this.exploded()?.skipped ?? {};
    return Object.entries(s)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} ${n}`)
      .join(' · ');
  }
}
