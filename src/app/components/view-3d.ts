import { AfterViewInit, Component, effect, ElementRef, inject, input, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { ViewerService } from '../core/viewer.service';
import * as THREE from 'three';
import { ProjectStore } from '../core/project.store';
import { buildCabinet } from '../three/cabinet-scene';
import { CabinetStage } from '../three/stage';

/**
 * Khung xem 3D. showroom = true: tường bê tông, sàn, bóng đổ (wizard). false: chế độ nâng cao.
 * Đơn vị mm. X = rộng, Y = cao, Z = sâu (mặt trước ở Z = D).
 */
@Component({
  selector: 'app-view-3d',
  template: `
    <div class="v3" [class.showroom]="showroom()">
      <div #host class="host" (pointerdown)="down($event)" (pointerup)="up($event)"></div>
      @if (!showroom()) {
        <div class="ctrl">
          <label class="check"><input type="checkbox" [checked]="store.doorOpen()" (change)="store.doorOpen.set($any($event.target).checked)" /> Mở cửa</label>
          <label class="check"><input type="checkbox" [checked]="xray()" (change)="xray.set($any($event.target).checked)" /> Vỏ trong suốt</label>
          <button class="btn sm" (click)="resetCam()">⟲ Góc nhìn</button>
          <span class="muted small">Kéo chuột trái = xoay · phải = di chuyển · cuộn = zoom</span>
        </div>
      }
      <div #arrowsEl class="arrows" [style.display]="'none'">
        <button class="ar up" title="Lên 5 mm" (click)="store.nudge(0, 5)">▲</button>
        <button class="ar down" title="Xuống 5 mm" (click)="store.nudge(0, -5)">▼</button>
        <button class="ar left" title="Trái 5 mm" (click)="store.nudge(-5, 0)">◀</button>
        <button class="ar right" title="Phải 5 mm" (click)="store.nudge(5, 0)">▶</button>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .v3 { position: relative; height: 100%; background: linear-gradient(#f4f6f8, #dfe4e9); overflow: hidden; }
    .v3.showroom { background: #c9ccd0; }
    .host { position: absolute; inset: 0; }
    .host :is(canvas) { display: block; width: 100%; height: 100%; }
    .ctrl { position: absolute; top: 10px; left: 10px; display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,.9); border: 1px solid var(--steel-200); border-radius: 6px; padding: 6px 10px; }
    .arrows { position: absolute; pointer-events: none; outline: 2px dashed #1E5AA8; outline-offset: 3px; border-radius: 2px; }
    .ar { position: absolute; pointer-events: auto; width: 30px; height: 30px; border: 0; border-radius: 50%; background: #1E5AA8; color: #fff; font-size: 13px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); display: grid; place-items: center; }
    .ar:hover { background: #174a8c; }
    .ar.up { left: 50%; top: -44px; transform: translateX(-50%); }
    .ar.down { left: 50%; bottom: -44px; transform: translateX(-50%); }
    .ar.left { top: 50%; left: -44px; transform: translateY(-50%); }
    .ar.right { top: 50%; right: -44px; transform: translateY(-50%); }
  `,
})
export class View3d implements AfterViewInit, OnDestroy {
  readonly store = inject(ProjectStore);
  private readonly viewer = inject(ViewerService);
  readonly showroom = input(false);
  /** Góc mở cửa (độ). null = theo ô "Mở cửa" của chế độ nâng cao. */
  readonly doorAngle = input<number | null>(null);
  readonly showWall = input(true);
  /** Hiện 4 mũi tên dịch 5 mm quanh thiết bị đang chọn. */
  readonly arrows = input(false);
  readonly xray = signal(false);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly arrowsEl = viewChild.required<ElementRef<HTMLDivElement>>('arrowsEl');
  private readonly ready = signal(false);
  private stage?: CabinetStage;
  private raf = 0;
  private ro?: ResizeObserver;
  private framedFor = '';
  private downAt = { x: 0, y: 0 };
  private readonly ray = new THREE.Raycaster();

  constructor() {
    effect(() => {
      const p = this.store.project();
      const lay = this.store.layout();
      const x = this.xray();
      const sr = this.showroom();
      if (!this.ready() || !this.stage) return;
      untracked(() => {
        const key = `${p.id}|${p.enclosure.W}|${p.enclosure.H}|${p.enclosure.D}|${p.enclosure.base}|${p.enclosure.mounting}`;
        this.stage!.setCabinet(buildCabinet(p, this.store.cat, lay, { xray: x, showroom: sr }), key !== this.framedFor);
        this.framedFor = key;
        this.applySelection();
      });
    });
    effect(() => {
      const a = this.doorAngle();
      const open = this.store.doorOpen();
      if (this.stage) this.stage.targetAngle = a ?? (open ? 110 : 0);
    });
    effect(() => {
      const v = this.showWall();
      this.stage?.setWallVisible(v);
    });
    effect(() => {
      this.store.selectedIds();
      if (this.ready()) untracked(() => this.applySelection());
    });
  }

  ngAfterViewInit(): void {
    const el = this.host().nativeElement;
    const st = new CabinetStage({ showroom: this.showroom(), interactive: true });
    this.stage = st;
    st.targetAngle = st.angle = this.doorAngle() ?? 0;
    el.appendChild(st.renderer.domElement);
    st.setWallVisible(this.showWall());
    st.resize(el.clientWidth || 800, el.clientHeight || 600);
    this.ro = new ResizeObserver(() => {
      st.resize(el.clientWidth, el.clientHeight);
      if (!this.framedFor) return;
      st.frame();
    });
    this.ro.observe(el);
    this.viewer.active = this;
    this.ready.set(true);
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop);
      st.tick();
      this.placeArrows();
    };
    loop();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    if (this.viewer.active === this) this.viewer.active = null;
    this.stage?.dispose();
  }

  resetCam(): void {
    this.stage?.frame();
  }

  snapshot(w: number, h: number, angleDeg: number): string | null {
    return this.stage ? this.stage.snapshot(w, h, angleDeg) : null;
  }

  /** Tô sáng thiết bị đang chọn. */
  private applySelection(): void {
    const sel = new Set(this.store.selectedIds());
    for (const [uid, m] of this.stage?.cab?.devices ?? []) {
      const on = sel.has(uid);
      const mats = [m.material, ...m.children.map((c) => (c as THREE.Mesh).material)].filter(Boolean) as THREE.Material[];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        if (sm.isMeshStandardMaterial) {
          sm.emissive = new THREE.Color(on ? 0x1e5aa8 : 0x000000);
          sm.emissiveIntensity = on ? 0.55 : 0;
        }
      }
    }
  }

  /** Đặt khung 4 mũi tên quanh hình chiếu màn hình của thiết bị đang chọn. */
  private placeArrows(): void {
    const el = this.arrowsEl().nativeElement;
    const ids = this.store.selectedIds();
    const cab = this.stage?.cab;
    if (!this.arrows() || !ids.length || !cab) {
      el.style.display = 'none';
      return;
    }
    const box = new THREE.Box3();
    let any = false;
    for (const id of ids) {
      const m = cab.devices.get(id);
      if (m) {
        box.expandByObject(m);
        any = true;
      }
    }
    if (!any) {
      el.style.display = 'none';
      return;
    }
    const cam = this.stage!.camera;
    const host = this.host().nativeElement;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      const sx = ((v.x + 1) / 2) * host.clientWidth;
      const sy = ((1 - v.y) / 2) * host.clientHeight;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    el.style.display = 'block';
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${Math.max(8, maxX - minX)}px`;
    el.style.height = `${Math.max(8, maxY - minY)}px`;
  }

  down(e: PointerEvent): void {
    this.downAt = { x: e.clientX, y: e.clientY };
  }

  /** Click (không kéo) lên thiết bị → chọn. */
  up(e: PointerEvent): void {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 4 || !this.stage?.cab) return;
    const r = this.host().nativeElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.stage.camera);
    const hits = this.ray.intersectObjects([...this.stage.cab.devices.values()], true);
    let o: THREE.Object3D | null = hits[0]?.object ?? null;
    while (o && !o.userData['uid']) o = o.parent;
    const uid = o?.userData['uid'] as string | undefined;
    if (uid) this.selectBatchOf(uid, e.shiftKey);
    else if (!e.shiftKey) this.store.select(null);
  }

  /** Trong wizard chọn cả nhóm (1 dòng bảng); chế độ nâng cao chọn từng cái. */
  private selectBatchOf(uid: string, additive: boolean): void {
    if (!this.showroom()) return this.store.select(uid, additive);
    const b = this.store.batches().find((x) => x.uids.includes(uid));
    this.store.selectedIds.set(b ? b.uids : [uid]);
  }
}
