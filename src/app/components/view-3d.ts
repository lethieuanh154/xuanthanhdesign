import { AfterViewInit, Component, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ProjectStore } from '../core/project.store';
import { deviceCutout, deviceRect, holeBBox, ROOF_OVERHANG } from '../geometry';

/** Xem trước 3D: dựng khối các tấm tôn theo độ dày. Đơn vị mm. X = rộng, Y = cao, Z = sâu (mặt trước ở Z = D). */
@Component({
  selector: 'app-view-3d',
  template: `
    <div class="v3">
      <div #host class="host"></div>
      <div class="ctrl">
        <label class="check"><input type="checkbox" [checked]="store.doorOpen()" (change)="store.doorOpen.set($any($event.target).checked)" /> Mở cửa</label>
        <label class="check"><input type="checkbox" [checked]="xray()" (change)="xray.set($any($event.target).checked)" /> Vỏ trong suốt</label>
        <button class="btn sm" (click)="resetCam()">⟲ Góc nhìn</button>
        <span class="muted small">Kéo chuột trái = xoay · phải = di chuyển · cuộn = zoom</span>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .v3 { position: relative; height: 100%; background: linear-gradient(#f4f6f8, #dfe4e9); }
    .host { position: absolute; inset: 0; }
    .ctrl { position: absolute; top: 10px; left: 10px; display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,.9); border: 1px solid var(--steel-200); border-radius: 6px; padding: 6px 10px; }
  `,
})
export class View3d implements AfterViewInit, OnDestroy {
  readonly store = inject(ProjectStore);
  readonly xray = signal(false);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly ready = signal(false);

  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 10, 50000);
  private controls?: OrbitControls;
  private root = new THREE.Group();
  private doors: { pivot: THREE.Group; sign: number; max: number }[] = [];
  private raf = 0;
  private ro?: ResizeObserver;
  private doorAngle = 0;

  constructor() {
    effect(() => {
      this.store.project();
      this.store.layout();
      const x = this.xray();
      if (!this.ready()) return;
      untracked(() => this.build(x));
    });
  }

  ngAfterViewInit(): void {
    const el = this.host().nativeElement;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(r.domElement);
    this.renderer = r;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2000, 3000, 2500);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-2500, 1200, -1500);
    this.scene.add(fill);
    const grid = new THREE.GridHelper(6000, 60, 0xb9c1c9, 0xd6dce2);
    this.scene.add(grid);
    this.scene.add(this.root);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.ro = new ResizeObserver(() => {
      r.setSize(el.clientWidth, el.clientHeight);
      this.camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      this.camera.updateProjectionMatrix();
    });
    this.ro.observe(el);
    this.ready.set(true);
    this.resetCam();
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop);
      // hoạt cảnh mở/đóng cửa
      const target = this.store.doorOpen() ? 1 : 0;
      this.doorAngle += (target - this.doorAngle) * 0.12;
      for (const d of this.doors) d.pivot.rotation.y = d.sign * d.max * this.doorAngle;
      this.controls?.update();
      r.render(this.scene, this.camera);
    };
    loop();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.clear();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }

  resetCam(): void {
    const e = this.store.project().enclosure;
    const tall = e.H + e.base;
    const dist = Math.max(e.W, tall) * 2.1;
    this.camera.position.set(e.W / 2 + dist * 0.55, tall * 0.65, e.D + dist * 0.85);
    this.controls?.target.set(e.W / 2, tall / 2, e.D / 2);
    this.controls?.update();
  }

  private clear(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.root.clear();
    this.doors = [];
  }

  /** Hộp có viền cạnh (đặt theo góc min). */
  private box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, edges = true): THREE.Mesh {
    const g = new THREE.BoxGeometry(Math.max(w, 0.5), Math.max(h, 0.5), Math.max(d, 0.5));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x + w / 2, y + h / 2, z + d / 2);
    parent.add(m);
    if (edges) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x2b3138, transparent: true, opacity: 0.45 }));
      m.add(l);
    }
    return m;
  }

  private label(text: string, w: number, h: number, bg: string, fg: string): THREE.MeshBasicMaterial {
    const c = document.createElement('canvas');
    const k = 4;
    c.width = Math.max(16, Math.round(w * k));
    c.height = Math.max(16, Math.round(h * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg;
    ctx.font = `bold ${Math.max(10, Math.min(c.width / 7, 56))}px Segoe UI, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height * 0.8, c.width * 0.92);
    // cần gạt
    ctx.fillStyle = '#f5f7f9';
    ctx.fillRect(c.width * 0.42, c.height * 0.32, c.width * 0.16, c.height * 0.3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex });
  }

  private build(xray: boolean): void {
    this.clear();
    const st = this.store;
    const p = st.project();
    const e = p.enclosure;
    const lay = st.layout();
    const t = Math.max(e.thickness, 1.2) * 1.5; // phóng độ dày cho dễ nhìn
    const B = e.base;
    const inox = e.material === 'INOX304';
    const shell = new THREE.MeshStandardMaterial({ color: inox ? 0xc6ccd2 : 0x9aa4ae, metalness: inox ? 0.7 : 0.25, roughness: inox ? 0.3 : 0.6, transparent: xray, opacity: xray ? 0.25 : 1, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2f363d, roughness: 0.7 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xe0e3e6, metalness: 0.35, roughness: 0.45 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xc87533, metalness: 0.75, roughness: 0.3 });
    const doorMat = new THREE.MeshStandardMaterial({ color: inox ? 0xd0d5da : 0xb4bcc4, metalness: inox ? 0.7 : 0.2, roughness: 0.5, transparent: xray, opacity: xray ? 0.3 : 1, side: THREE.DoubleSide });
    const R = this.root;

    // khung đế
    if (B) {
      this.box(R, 0, 0, 0, e.W, B, 40, dark);
      this.box(R, 0, 0, e.D - 40, e.W, B, 40, dark);
      this.box(R, 0, 0, 40, 40, B, e.D - 80, dark);
      this.box(R, e.W - 40, 0, 40, 40, B, e.D - 80, dark);
    }
    // vỏ: hậu, hông, đáy, nóc
    this.box(R, 0, B, 0, e.W, e.H, t, shell);
    this.box(R, 0, B, 0, t, e.H, e.D, shell);
    this.box(R, e.W - t, B, 0, t, e.H, e.D, shell);
    this.box(R, 0, B, 0, e.W, t, e.D, shell);
    const ov = ROOF_OVERHANG;
    this.box(R, -ov, B + e.H, 0, e.W + 2 * ov, t, e.D + ov, shell);
    this.box(R, -ov, B + e.H - 25, e.D + ov - t, e.W + 2 * ov, 25, t, shell);
    this.box(R, -ov, B + e.H - 25, 0, t, 25, e.D + ov, shell);
    this.box(R, e.W + ov - t, B + e.H - 25, 0, t, 25, e.D + ov, shell);
    // khe thông gió (vạch tối trên hông)
    if (e.vent !== 'none') {
      const ventMat = new THREE.MeshBasicMaterial({ color: 0x1f262e });
      const ys = e.vent === 'top_bottom' ? [90, e.H - 154] : [90];
      for (const y0 of ys)
        for (let r = 0; r < 5; r++)
          for (const x of [-0.6, e.W - t + 0.6]) {
            const cols = Math.max(1, Math.floor((e.D - 80) / 85));
            for (let c = 0; c < cols; c++) {
              const z = e.D / 2 - ((cols - 1) * 85) / 2 + c * 85;
              this.box(R, x, B + y0 + r * 16 - 4, z - 30, t, 8, 60, ventMat, false);
            }
          }
    }
    // tấm đế
    const pz = 30;
    const pl = lay.plate;
    this.box(R, pl.x, B + pl.y, pz, pl.w, pl.h, 2, plateMat);
    // thanh cái
    for (const b of lay.bars) this.box(R, b.rect.x, B + b.rect.y, pz + 60, b.rect.w, b.rect.h, p.busbar.t * 2, copper, false);

    // thiết bị trên tấm đế
    for (const pd of p.devices.filter((d) => d.mount === 'plate')) {
      const def = st.defOf(pd.deviceId);
      if (!def) continue;
      const r = deviceRect(pd, def);
      const d = Math.min(def.size.d, e.D - pz - 20);
      const body = new THREE.MeshStandardMaterial({ color: def.isBreaker ? 0x30363d : 0x5b6570, roughness: 0.6 });
      const m = this.box(R, r.x, B + r.y, pz + 2, r.w, r.h, d, body);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), this.label(pd.label || def.model, r.w, r.h, def.isBreaker ? '#30363d' : '#5b6570', '#ffffff'));
      face.position.set(0, 0, d / 2 + 0.3);
      m.add(face);
    }

    // cửa: pivot ở bản lề
    for (const leaf of lay.leaves) {
      const inner = leaf.id === 'inner';
      const zFront = inner ? e.D - 30 : e.D;
      const pivot = new THREE.Group();
      const hingeX = leaf.hinge === 'left' ? leaf.rect.x : leaf.rect.x + leaf.rect.w;
      pivot.position.set(hingeX, B + leaf.rect.y, zFront);
      R.add(pivot);
      const sign = leaf.hinge === 'left' ? -1 : 1;
      this.doors.push({ pivot, sign, max: inner ? (95 * Math.PI) / 180 : (110 * Math.PI) / 180 });
      const g = new THREE.Group();
      g.position.set(leaf.hinge === 'left' ? 0 : -leaf.rect.w, 0, 0);
      pivot.add(g);
      const W = leaf.rect.w,
        H = leaf.rect.h;
      const mat = inner ? new THREE.MeshStandardMaterial({ color: 0xc9d0d7, metalness: 0.2, roughness: 0.5, transparent: xray, opacity: xray ? 0.3 : 1 }) : doorMat;
      // mặt cửa + mép gấp
      this.box(g, 0, 0, -t, W, H, t, mat);
      this.box(g, 0, 0, -20, t, H, 20, mat, false);
      this.box(g, W - t, 0, -20, t, H, 20, mat, false);
      this.box(g, 0, 0, -20, W, t, 20, mat, false);
      this.box(g, 0, H - t, -20, W, t, 20, mat, false);
      // viền xanh (nhận diện)
      if (!inner) {
        const accent = new THREE.MeshStandardMaterial({ color: 0x1e5aa8, roughness: 0.5 });
        this.box(g, 8, 8, 0.2, W - 16, 4, 1, accent, false);
        this.box(g, 8, H - 12, 0.2, W - 16, 4, 1, accent, false);
        this.box(g, 8, 8, 0.2, 4, H - 16, 1, accent, false);
        this.box(g, W - 12, 8, 0.2, 4, H - 16, 1, accent, false);
      }
      if (leaf.hasLock) {
        const lx = leaf.id === 'right' ? 35 : W - 35;
        this.box(g, lx - 12, H / 2 - 40, 0, 24, 80, 18, dark);
      }
      // thiết bị gắn cửa + lỗ khoét của thiết bị tấm đế
      if (leaf.carriesCutouts) {
        for (const pd of p.devices) {
          const def = st.defOf(pd.deviceId);
          if (!def) continue;
          const cut = deviceCutout(pd, def);
          if (!cut) continue;
          const bb = holeBBox(cut);
          const cx = (bb.minX + bb.maxX) / 2;
          if (cx < leaf.rect.x || cx > leaf.rect.x + leaf.rect.w) continue;
          const lx = bb.minX - leaf.rect.x,
            ly = bb.minY - leaf.rect.y;
          if (pd.mount === 'door') {
            const r = deviceRect(pd, def);
            const rx = r.x - leaf.rect.x,
              ry = r.y - leaf.rect.y;
            const col = def.color ? new THREE.Color(def.color).getHex() : 0x20262c;
            const faceMat = new THREE.MeshStandardMaterial({ color: def.type.startsWith('METER') || def.type === 'PFR' ? 0xf5f7f9 : 0x2f363d, roughness: 0.5 });
            this.box(g, rx, ry, 0, r.w, r.h, 6, faceMat);
            if (cut.kind === 'circle') {
              const cyl = new THREE.Mesh(new THREE.CylinderGeometry(cut.r * 0.9, cut.r * 0.9, 14, 24), new THREE.MeshStandardMaterial({ color: col, emissive: def.type === 'PILOT_LAMP' ? col : 0x000000, emissiveIntensity: 0.4 }));
              cyl.rotation.x = Math.PI / 2;
              cyl.position.set(rx + r.w / 2, ry + r.h / 2, 8);
              g.add(cyl);
            }
            this.box(g, lx, ly, -t - Math.min(def.size.d, 80), bb.maxX - bb.minX, bb.maxY - bb.minY, Math.min(def.size.d, 80), dark, false);
          } else {
            // lỗ khoét: mảng tối thể hiện lỗ (nhìn thấy mặt thiết bị phía sau)
            this.box(g, lx, ly, 0.3, bb.maxX - bb.minX, bb.maxY - bb.minY, 0.6, new THREE.MeshBasicMaterial({ color: 0x15191e }), false);
          }
        }
      }
    }
  }
}
