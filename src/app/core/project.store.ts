import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import {
  CabinetType,
  Catalog,
  computeBom,
  computeLayout,
  createProject,
  DeviceDef,
  deviceFootprint,
  deviceRect,
  EnclosureConfig,
  generateParts,
  issuesByTarget,
  nestParts,
  normalizeSections,
  PlacedDevice,
  Project,
  rectGap,
  rectInside,
  rectsIntersect,
  Rect,
  runRules,
  SHEET_SIZES,
  suggestAccessories,
  suggestBusbar,
  uid,
  BusbarConfig,
  sectionAt,
} from '../geometry';
import { CatalogService } from './catalog.service';
import { PROJECT_REPOSITORY, ProjectSummary } from './project-repository';

export type Step = 1 | 2 | 3 | 4 | 5;
export type ViewTab = 'front' | '3d' | 'flat' | 'nest';

export const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Loại tủ' },
  { n: 2, label: 'Vỏ & kích thước' },
  { n: 3, label: 'Bố trí thiết bị' },
  { n: 4, label: 'Thanh cái & PK' },
  { n: 5, label: 'Xuất' },
];

const SNAP = 5;
export const snap = (v: number, on = true): number => (on ? Math.round(v / SNAP) * SNAP : Math.round(v));

/** Trạng thái toàn app (signals). Mọi tính toán hình học gọi module geometry/ thuần. */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly catalogSvc = inject(CatalogService);
  private readonly repo = inject(PROJECT_REPOSITORY);

  get cat(): Catalog {
    return this.catalogSvc.catalog;
  }

  readonly project = signal<Project>(null as unknown as Project);
  readonly step = signal<Step>(1);
  readonly view = signal<ViewTab>('front');
  readonly selectedIds = signal<string[]>([]);
  readonly selectedPartId = signal<string | null>(null);
  readonly showDims = signal(true);
  readonly snapOn = signal(true);
  readonly doorOpen = signal(false);
  readonly savedList = signal<ProjectSummary[]>([]);
  readonly toast = signal<string | null>(null);
  readonly lastSavedAt = signal<string | null>(null);
  readonly partsTableOpen = signal(true);

  readonly layout = computed(() => computeLayout(this.project().enclosure, this.project().busbar));
  readonly parts = computed(() => generateParts(this.project(), this.cat));
  readonly rules = computed(() => runRules(this.project(), this.cat, this.layout(), this.parts()));
  readonly issues = computed(() => issuesByTarget(this.rules()));
  readonly bom = computed(() => computeBom(this.project(), this.cat, this.parts()));
  readonly nesting = computed(() => nestParts(this.parts(), SHEET_SIZES[this.project().sheetSize]));
  readonly errorCount = computed(() => this.rules().filter((r) => r.level === 'error').length);
  readonly warnCount = computed(() => this.rules().filter((r) => r.level === 'warn').length);
  readonly stepErrors = computed(() => {
    const m: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of this.rules()) if (r.level === 'error') m[r.step]++;
    return m;
  });
  readonly selectedDevices = computed(() => {
    const ids = this.selectedIds();
    return this.project().devices.filter((d) => ids.includes(d.uid));
  });

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Tự lưu (debounce) mỗi khi dự án thay đổi → F5 vẫn còn dữ liệu
    effect(() => {
      const p = this.project();
      if (!p) return;
      untracked(() => {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => void this.persist(p), 400);
      });
    });
  }

  /** Khởi động: mở dự án gần nhất hoặc tạo mới. */
  async init(): Promise<void> {
    const last = this.repo.getLastOpenedId();
    const loaded = last ? await this.repo.load(last) : null;
    if (loaded) {
      this.project.set(this.migrate(loaded));
      this.step.set(3);
    } else {
      // dự án mặc định lúc khởi động: chưa lưu cho tới khi người dùng sửa gì đó
      const p = createProject(this.cat, this.cat.templates[2]);
      this.pristine = p;
      this.project.set(p);
      this.step.set(1);
    }
    this.repo.setLastOpenedId(this.project().id);
    await this.refreshList();
  }

  private migrate(p: Project): Project {
    return { ...p, sheetSize: p.sheetSize ?? '1500x3000', accessories: p.accessories ?? [], devices: p.devices ?? [] };
  }

  defOf(id: string): DeviceDef | undefined {
    return this.cat.devices.find((d) => d.id === id);
  }

  // ---------- cập nhật dự án ----------
  update(mut: (p: Project) => void): void {
    const p = structuredClone(this.project());
    mut(p);
    p.enclosure.sectionHeights = normalizeSections(p.enclosure);
    p.enclosure.sections = p.enclosure.sectionHeights.length;
    // phụ kiện tự tính
    const sug = suggestAccessories(p, this.cat);
    p.accessories = this.cat.accessories.map((a) => {
      const cur = p.accessories.find((x) => x.id === a.id);
      const s = sug.find((x) => x.id === a.id)?.qty ?? 0;
      return cur && !cur.auto ? cur : { id: a.id, qty: s, auto: true };
    });
    // tủ 2 lớp: thiết bị tấm đế lộ qua cửa trong, cửa ngoài không khoét cho chúng
    if (p.enclosure.doorType === 'two_layer') p.devices.forEach((d) => d.mount === 'plate' && (d.doorCutout = false));
    p.updatedAt = new Date().toISOString();
    this.project.set(p);
  }

  setMeta(patch: Partial<Pick<Project, 'name' | 'customer' | 'orderCode' | 'drafter' | 'sheetSize'>>): void {
    this.update((p) => Object.assign(p, patch));
  }

  setEnclosure(patch: Partial<EnclosureConfig>): void {
    this.update((p) => {
      const e = p.enclosure;
      const oldH = e.H;
      Object.assign(e, patch);
      if (patch.sections !== undefined && patch.sections !== e.sectionHeights.length) {
        const n = Math.max(1, Math.min(6, Math.round(patch.sections)));
        const each = Math.floor(e.H / n);
        e.sectionHeights = Array.from({ length: n }, (_, i) => (i === n - 1 ? e.H - each * (n - 1) : each));
      } else if (patch.H !== undefined && patch.H !== oldH) {
        // co giãn theo tỉ lệ
        const k = e.H / oldH;
        e.sectionHeights = e.sectionHeights.map((h) => Math.round(h * k));
      }
      if (patch.mounting === 'wall') e.base = 0;
    });
  }

  setSectionHeight(i: number, h: number): void {
    this.update((p) => {
      const hs = p.enclosure.sectionHeights;
      if (i < 0 || i >= hs.length) return;
      const n = hs.length;
      const clamped = Math.max(100, Math.round(h));
      const delta = clamped - hs[i];
      hs[i] = clamped;
      // bù vào ngăn kế bên (hoặc ngăn trên nếu là ngăn cuối)
      const j = i < n - 1 ? i + 1 : i - 1;
      if (j >= 0) hs[j] = Math.max(100, hs[j] - delta);
    });
  }

  setBusbar(patch: Partial<BusbarConfig>): void {
    this.update((p) => {
      Object.assign(p.busbar, patch);
      if (patch.ratedA !== undefined && patch.w === undefined) {
        const s = suggestBusbar(this.cat, patch.ratedA);
        p.busbar.w = s.w;
        p.busbar.t = s.t;
      }
    });
  }

  setAccessoryQty(id: string, qty: number | null): void {
    this.update((p) => {
      const line = p.accessories.find((a) => a.id === id);
      if (!line) return;
      if (qty === null) line.auto = true;
      else {
        line.qty = Math.max(0, qty);
        line.auto = false;
      }
    });
  }

  chooseTemplate(type: CabinetType): void {
    const tpl = this.cat.templates.find((t) => t.id === type);
    if (!tpl) return;
    const cur = this.project();
    const next = createProject(this.cat, tpl, { id: cur.id, name: cur.name, customer: cur.customer, orderCode: cur.orderCode, drafter: cur.drafter, createdAt: cur.createdAt });
    if (cur.cabinetType !== type && /^Tủ /.test(cur.name)) next.name = tpl.name;
    next.devices = cur.devices;
    this.project.set(next);
    this.update(() => undefined);
  }

  // ---------- thiết bị ----------
  /** Thêm thiết bị. `center` (toạ độ thân tủ) nếu kéo thả; không có thì tự tìm chỗ trống. */
  addDevice(deviceId: string, center?: { x: number; y: number }, opts: { batch?: string; quiet?: boolean } = {}): string | null {
    const def = this.defOf(deviceId);
    if (!def) return null;
    const pd: PlacedDevice = { uid: uid('d'), deviceId, x: 0, y: 0, rot: 0, mount: def.mount, doorCutout: def.mount === 'door' || !!def.cutoutDefault, batch: opts.batch };
    const f = deviceFootprint(def, 0);
    if (center) {
      const e = this.project().enclosure;
      // thả ra ngoài thân tủ → kẹp lại vào trong (luật vẫn báo nếu chưa hợp lệ)
      const cx = Math.min(e.W - f.w / 2, Math.max(f.w / 2, center.x));
      const cy = Math.min(e.H - f.h / 2, Math.max(f.h / 2, center.y));
      pd.x = snap(cx - f.w / 2, this.snapOn());
      pd.y = snap(cy - f.h / 2, this.snapOn());
    } else {
      const spot = this.findFreeSpot(def, pd);
      pd.x = spot.x;
      pd.y = spot.y;
    }
    this.update((p) => p.devices.push(pd));
    if (opts.quiet) return pd.uid;
    this.selectedIds.set([pd.uid]);
    if (this.step() < 3) this.step.set(3);
    this.view.set('front');
    return pd.uid;
  }

  /** Thêm `qty` thiết bị cùng 1 nhóm, mỗi cái tự tìm chỗ hợp lệ đầu tiên. Trả về id nhóm. */
  addBatch(deviceId: string, qty: number, batch = uid('b')): string {
    const ids: string[] = [];
    for (let i = 0; i < Math.max(1, Math.min(50, Math.round(qty))); i++) {
      const id = this.addDevice(deviceId, undefined, { batch, quiet: true });
      if (id) ids.push(id);
    }
    this.selectedIds.set(ids);
    return batch;
  }

  /** Các nhóm thiết bị (thiết bị cũ chưa có batch → mỗi cái 1 nhóm). */
  readonly batches = computed(() => {
    const list: { id: string; deviceId: string; mount: 'plate' | 'door'; uids: string[] }[] = [];
    for (const d of this.project().devices) {
      const key = d.batch ?? d.uid;
      const g = list.find((x) => x.id === key);
      if (g) g.uids.push(d.uid);
      else list.push({ id: key, deviceId: d.deviceId, mount: d.mount, uids: [d.uid] });
    }
    return list;
  });

  removeUids(ids: string[]): void {
    this.update((p) => (p.devices = p.devices.filter((d) => !ids.includes(d.uid))));
    this.selectedIds.update((s) => s.filter((x) => !ids.includes(x)));
  }

  /** Đổi model / số lượng / vị trí gắn của 1 nhóm (xếp lại chỗ cho cả nhóm). */
  replaceBatch(batchId: string, deviceId: string, qty: number, mount?: 'plate' | 'door'): void {
    const g = this.batches().find((b) => b.id === batchId);
    if (!g) return;
    const keep = g.deviceId === deviceId && (!mount || mount === g.mount);
    if (keep && qty >= g.uids.length) {
      for (let i = g.uids.length; i < qty; i++) this.addDevice(deviceId, undefined, { batch: batchId, quiet: true });
    } else if (keep) {
      this.removeUids(g.uids.slice(qty));
    } else {
      this.removeUids(g.uids);
      for (let i = 0; i < qty; i++) {
        const id = this.addDevice(deviceId, undefined, { batch: batchId, quiet: true });
        if (id && mount) this.patchDevice(id, { mount, doorCutout: mount === 'door' || !!this.defOf(deviceId)?.cutoutDefault, x: 0, y: 0 });
        if (id && mount) {
          const pd = this.project().devices.find((d) => d.uid === id)!;
          const spot = this.findFreeSpot(this.defOf(deviceId)!, pd, id);
          this.patchDevice(id, spot);
        }
      }
    }
    this.selectedIds.set(this.batches().find((b) => b.id === batchId)?.uids ?? []);
  }

  duplicateBatch(batchId: string): void {
    const g = this.batches().find((b) => b.id === batchId);
    if (g) this.addBatch(g.deviceId, g.uids.length);
  }

  /** Quét từ trên xuống, trái sang phải tìm vị trí không va chạm. */
  findFreeSpot(def: DeviceDef, pd: PlacedDevice, ignoreUid?: string): { x: number; y: number } {
    const lay = this.layout();
    const f = deviceFootprint(def, pd.rot);
    const area: Rect =
      pd.mount === 'plate'
        ? { x: lay.plate.x + 20, y: lay.plate.y + 20, w: lay.plate.w - 40, h: lay.plate.h - 40 }
        : (() => {
            const leaf = lay.leaves.find((l) => l.carriesCutouts) ?? lay.leaves[0];
            return { x: leaf.rect.x + 40, y: leaf.rect.y + 40, w: leaf.rect.w - 80, h: leaf.rect.h - 80 };
          })();
    const others = this.project()
      .devices.filter((d) => d.mount === pd.mount && d.uid !== ignoreUid)
      .map((d) => {
        const od = this.defOf(d.deviceId);
        return od ? { r: deviceRect(d, od), c: Math.max(od.clearance, def.clearance), din: !!od.din && !!def.din } : null;
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
    const blocked = (r: Rect): boolean => {
      if (others.some((o) => rectsIntersect(r, o.r) || rectGap(r, o.r) < (o.din ? 0 : o.c))) return true;
      if (pd.mount === 'plate' && lay.busbarZone && rectsIntersect(r, lay.busbarZone)) return true;
      const s = sectionAt(lay, r.y + r.h / 2);
      if (pd.mount === 'plate' && s && (r.y < s.y0 + 12 || r.y + r.h > s.y1 - 12)) return true;
      return false;
    };
    for (let y = area.y + area.h - f.h; y >= area.y; y -= 5) {
      for (let x = area.x; x + f.w <= area.x + area.w; x += 5) {
        const r = { x: snap(x), y: snap(y), w: f.w, h: f.h };
        if (rectInside(r, area) && !blocked(r)) return { x: r.x, y: r.y };
      }
    }
    return { x: snap(area.x + area.w / 2 - f.w / 2), y: snap(area.y + area.h / 2 - f.h / 2) };
  }

  moveDevice(uidv: string, x: number, y: number): void {
    this.update((p) => {
      const d = p.devices.find((v) => v.uid === uidv);
      if (d) {
        d.x = x;
        d.y = y;
      }
    });
  }

  nudge(dx: number, dy: number): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    this.update((p) => p.devices.filter((d) => ids.includes(d.uid)).forEach((d) => ((d.x += dx), (d.y += dy))));
  }

  patchDevice(uidv: string, patch: Partial<PlacedDevice>): void {
    this.update((p) => {
      const d = p.devices.find((v) => v.uid === uidv);
      if (!d) return;
      if (patch.isMain) p.devices.forEach((o) => (o.isMain = false));
      Object.assign(d, patch);
    });
  }

  rotateSelected(): void {
    const ids = this.selectedIds();
    this.update((p) =>
      p.devices
        .filter((d) => ids.includes(d.uid))
        .forEach((d) => {
          const def = this.defOf(d.deviceId);
          if (!def) return;
          // xoay quanh tâm
          const f0 = deviceFootprint(def, d.rot);
          const cx = d.x + f0.w / 2,
            cy = d.y + f0.h / 2;
          d.rot = d.rot === 0 ? 90 : 0;
          const f1 = deviceFootprint(def, d.rot);
          d.x = snap(cx - f1.w / 2);
          d.y = snap(cy - f1.h / 2);
        }),
    );
  }

  removeSelected(): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    this.update((p) => (p.devices = p.devices.filter((d) => !ids.includes(d.uid))));
    this.selectedIds.set([]);
  }

  removeDevice(uidv: string): void {
    this.update((p) => (p.devices = p.devices.filter((d) => d.uid !== uidv)));
    this.selectedIds.update((s) => s.filter((x) => x !== uidv));
  }

  /** Ctrl+D: nhân bản, đặt bên phải bản gốc (nếu chật thì tự tìm chỗ). */
  duplicateSelected(): void {
    const sel = this.selectedDevices();
    if (!sel.length) return;
    const newIds: string[] = [];
    this.update((p) => {
      for (const d of sel) {
        const def = this.defOf(d.deviceId);
        if (!def) continue;
        const f = deviceFootprint(def, d.rot);
        const copy: PlacedDevice = { ...d, uid: uid('d'), isMain: false, x: d.x + f.w + Math.max(def.clearance, 10) };
        p.devices.push(copy);
        newIds.push(copy.uid);
      }
    });
    this.selectedIds.set(newIds);
  }

  /** Căn đều: xếp các thiết bị cùng hàng ngang, khoảng cách bằng nhau. */
  distribute(): void {
    const lay = this.layout();
    let targets = this.selectedDevices();
    if (targets.length === 1) {
      const ref = targets[0];
      const def = this.defOf(ref.deviceId)!;
      const rr = deviceRect(ref, def);
      const sec = sectionAt(lay, rr.y + rr.h / 2);
      targets = this.project().devices.filter((d) => {
        const dd = this.defOf(d.deviceId);
        if (!dd || d.mount !== ref.mount) return false;
        const r = deviceRect(d, dd);
        // cùng hàng: chồng nhau theo phương đứng
        return r.y < rr.y + rr.h && rr.y < r.y + r.h && (!sec || sectionAt(lay, r.y + r.h / 2) === sec);
      });
    }
    if (targets.length < 2) {
      this.flash('Chọn ≥ 2 thiết bị (Shift + click) hoặc 1 thiết bị trong hàng cần căn');
      return;
    }
    const items = targets
      .map((d) => ({ d, r: deviceRect(d, this.defOf(d.deviceId)!) }))
      .sort((a, b) => a.r.x - b.r.x);
    const baseY = Math.min(...items.map((i) => i.r.y));
    const totalW = items.reduce((s, i) => s + i.r.w, 0);
    let x0 = items[0].r.x;
    let span = items[items.length - 1].r.x + items[items.length - 1].r.w - x0;
    const minGap = 20;
    if (span < totalW + minGap * (items.length - 1)) {
      const area = items[0].d.mount === 'plate' ? lay.plate : (lay.leaves.find((l) => l.carriesCutouts) ?? lay.leaves[0]).rect;
      const pad = items[0].d.mount === 'plate' ? 25 : 40;
      x0 = area.x + pad;
      span = area.w - 2 * pad;
    }
    const gap = (span - totalW) / (items.length - 1);
    const pos = new Map<string, { x: number; y: number }>();
    let cx = x0;
    for (const i of items) {
      pos.set(i.d.uid, { x: snap(cx, false), y: baseY });
      cx += i.r.w + gap;
    }
    this.update((p) => p.devices.forEach((d) => pos.has(d.uid) && Object.assign(d, pos.get(d.uid))));
    this.flash(`Đã căn đều ${items.length} thiết bị`);
  }

  select(uidv: string | null, additive = false): void {
    if (!uidv) return this.selectedIds.set([]);
    if (additive) this.selectedIds.update((s) => (s.includes(uidv) ? s.filter((x) => x !== uidv) : [...s, uidv]));
    else this.selectedIds.set([uidv]);
  }

  // ---------- lưu / mở ----------
  /** Dự án tạo tự động lúc mở app, chưa bị sửa → không lưu (tránh đơn rỗng trong danh sách). */
  private pristine: Project | null = null;

  private async persist(p: Project): Promise<void> {
    if (p === this.pristine) return;
    await this.repo.save(p);
    this.repo.setLastOpenedId(p.id);
    this.lastSavedAt.set(new Date().toLocaleTimeString('vi-VN'));
    await this.refreshList();
  }

  async saveNow(flash = true): Promise<void> {
    await this.persist(this.project());
    if (flash) this.flash('Đã lưu dự án vào trình duyệt');
  }

  async refreshList(): Promise<void> {
    this.savedList.set(await this.repo.list());
  }

  /** Mở dự án theo id trên URL; 'moi' → tạo mới. Trả về id thực. */
  async ensureProject(id: string): Promise<string | null> {
    if (id === 'moi') {
      await this.persist(this.project());
      const p = createProject(this.cat, this.cat.templates.find((t) => t.id === 'ATS') ?? this.cat.templates[0]);
      p.name = 'Cấu hình mới';
      p.customer = '';
      p.status = 'draft';
      p.orderCode = this.repo.nextOrderCode();
      this.project.set(p);
      this.selectedIds.set([]);
      this.repo.setLastOpenedId(p.id);
      return p.id;
    }
    if (this.project()?.id === id) return id;
    const p = await this.repo.load(id);
    if (!p) return null;
    await this.persist(this.project());
    this.project.set(this.migrate(p));
    this.selectedIds.set([]);
    this.repo.setLastOpenedId(id);
    return id;
  }

  async newProject(): Promise<void> {
    await this.persist(this.project());
    const p = createProject(this.cat, this.cat.templates[2]);
    p.name = 'Dự án mới';
    p.orderCode = this.repo.nextOrderCode();
    this.project.set(p);
    this.selectedIds.set([]);
    this.step.set(1);
    this.view.set('front');
    this.flash('Đã tạo dự án mới');
  }

  async openProject(id: string): Promise<void> {
    await this.persist(this.project());
    const p = await this.repo.load(id);
    if (!p) return this.flash('Không tìm thấy dự án');
    this.project.set(this.migrate(p));
    this.selectedIds.set([]);
    this.step.set(3);
    this.repo.setLastOpenedId(id);
    this.flash(`Đã mở: ${p.name}`);
  }

  async deleteProject(id: string): Promise<void> {
    if (id === this.project().id) return this.flash('Không xoá được dự án đang mở');
    await this.repo.remove(id);
    await this.refreshList();
  }

  flash(msg: string): void {
    this.toast.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2600);
  }
}
