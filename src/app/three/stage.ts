import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CabinetScene, concreteTexture, setDoorAngle } from './cabinet-scene';

export interface StageOpts {
  /** Phòng trưng bày: tường bê tông, sàn, bóng đổ mềm. false = nền gradient + lưới (chế độ nâng cao). */
  showroom: boolean;
  /** Cho phép xoay/zoom bằng chuột. */
  interactive: boolean;
  /** Giữ buffer để chụp ảnh bất kỳ lúc nào (thumbnail offscreen). */
  preserve?: boolean;
}

/** Sân khấu 3D: renderer + camera + ánh sáng + tường/sàn, nhận 1 CabinetScene. */
export class CabinetStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 10, 60000);
  readonly controls?: OrbitControls;
  cab?: CabinetScene;
  /** Góc mở cửa hiện tại / mục tiêu (độ) — hoạt cảnh tiến dần. */
  angle = 0;
  targetAngle = 0;
  private wall?: THREE.Mesh;
  private floor?: THREE.Mesh;
  private sun = new THREE.DirectionalLight(0xffffff, 2.0);
  private envTex?: THREE.Texture;
  private wallTex?: THREE.Texture;

  constructor(private readonly opts: StageOpts) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: !opts.showroom, preserveDrawingBuffer: !!opts.preserve });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    // canvas được chèn động → CSS của component không áp vào, đặt style trực tiếp
    Object.assign(r.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9099, opts.showroom ? 0.7 : 1.3));
    this.sun.position.set(-1500, 3600, 3200);
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(2500, 1200, 2000);
    this.scene.add(fill);

    if (opts.showroom) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 1.5;
      this.scene.background = new THREE.Color(0xc9ccd0);
      this.wallTex = concreteTexture();
      this.wallTex.repeat.set(7, 3.5);
      this.wall = new THREE.Mesh(new THREE.PlaneGeometry(14000, 7000), new THREE.MeshStandardMaterial({ map: this.wallTex, roughness: 0.95, metalness: 0 }));
      this.wall.position.set(0, 3500, -4);
      this.wall.receiveShadow = true;
      this.scene.add(this.wall);
      this.floor = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ color: 0xd3d5d8, roughness: 0.92 }));
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.position.set(0, 0, 7000 - 4);
      this.floor.receiveShadow = true;
      this.scene.add(this.floor);
      this.scene.fog = new THREE.Fog(0xc9ccd0, 9000, 22000);
    } else {
      this.scene.add(new THREE.GridHelper(6000, 60, 0xb9c1c9, 0xd6dce2));
    }
    if (opts.interactive) {
      this.controls = new OrbitControls(this.camera, r.domElement);
      this.controls.enableDamping = true;
      this.controls.maxPolarAngle = Math.PI * 0.495;
    }
  }

  setWallVisible(v: boolean): void {
    if (this.wall) this.wall.visible = v;
    if (this.opts.showroom) this.scene.background = new THREE.Color(v ? 0xc9ccd0 : 0xe4e7ea);
  }

  setCabinet(sc: CabinetScene, reframe = false): void {
    if (this.cab) {
      this.scene.remove(this.cab.root);
      this.cab.dispose();
    }
    this.cab = sc;
    this.scene.add(sc.root);
    setDoorAngle(sc, this.angle);
    // bóng đổ bám theo tủ
    const cx = sc.W / 2;
    this.sun.position.set(cx - 1500, sc.elev + sc.tall + 2600, sc.D + 2800);
    this.sun.target.position.set(cx, sc.elev, sc.D / 2);
    const s = Math.max(sc.W, sc.tall) * 1.6 + 800;
    const cam = this.sun.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 100;
    cam.far = 12000;
    cam.updateProjectionMatrix();
    if (this.wall) this.wall.position.x = cx;
    if (this.floor) this.floor.position.x = cx;
    if (reframe) this.frame();
  }

  /** Góc nhìn 3/4 từ phía trước bên phải. */
  frame(kind: 'three-quarter' | 'front' = 'three-quarter'): void {
    const sc = this.cab;
    if (!sc) return;
    const cx = sc.W / 2;
    const cy = sc.elev + sc.tall / 2;
    const size = Math.max(sc.W * 1.25, sc.tall);
    const aspect = this.camera.aspect || 1.5;
    const fit = (size / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * Math.max(1, 1.1 / aspect) * 1.6;
    if (kind === 'front') this.camera.position.set(cx, cy, sc.D + fit);
    else this.camera.position.set(cx + fit * 0.36, cy + fit * 0.16, sc.D + fit * 0.94);
    // lệch tâm nhìn sang trái 1 chút để còn chỗ cho cánh cửa khi mở
    const target = new THREE.Vector3(cx - sc.W * (kind === 'front' ? 0 : 0.18), cy, sc.D / 2);
    if (this.controls) {
      this.controls.target.copy(target);
      this.controls.update();
    } else this.camera.lookAt(target);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Gọi mỗi khung hình. Trả về true nếu cửa còn đang chuyển động. */
  tick(): boolean {
    let moving = false;
    if (this.cab && Math.abs(this.targetAngle - this.angle) > 0.05) {
      this.angle += (this.targetAngle - this.angle) * 0.16;
      if (Math.abs(this.targetAngle - this.angle) < 0.3) this.angle = this.targetAngle;
      setDoorAngle(this.cab, this.angle);
      moving = true;
    }
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    return moving;
  }

  /** Chụp ảnh JPEG (dùng cho thumbnail, báo giá). */
  snapshot(w: number, h: number, angleDeg: number): string {
    const oldSize = new THREE.Vector2();
    this.renderer.getSize(oldSize);
    const oldAngle = this.angle;
    const oldAspect = this.camera.aspect;
    if (this.cab) setDoorAngle(this.cab, angleDeg);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/jpeg', 0.82);
    this.renderer.setSize(oldSize.x, oldSize.y, false);
    this.camera.aspect = oldAspect;
    this.camera.updateProjectionMatrix();
    if (this.cab) setDoorAngle(this.cab, oldAngle);
    this.renderer.render(this.scene, this.camera);
    return url;
  }

  dispose(): void {
    this.cab?.dispose();
    this.controls?.dispose();
    this.envTex?.dispose();
    this.wallTex?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m === this.wall || m === this.floor)) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Ảnh render nhiều dự án bằng 1 renderer offscreen (thẻ loại tủ bước 1, trang Kết quả). */
export function renderImages(builds: (() => CabinetScene)[], w: number, h: number, angleDeg: number): string[] {
  const st = new CabinetStage({ showroom: true, interactive: false, preserve: true });
  st.resize(w, h);
  const out: string[] = [];
  for (const b of builds) {
    st.angle = st.targetAngle = angleDeg;
    st.setCabinet(b(), true);
    out.push(st.snapshot(w, h, angleDeg));
  }
  st.dispose();
  st.renderer.forceContextLoss();
  return out;
}
