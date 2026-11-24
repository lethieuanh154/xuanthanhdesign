import * as THREE from 'three';
import { ralHex } from './ral';
export { RAL_COLORS, ralHex } from './ral';
import { Catalog, coverWindows, deviceCutout, deviceRect, EnclosureLayout, holeBBox, lockX, Project, ROOF_OVERHANG } from '../geometry';

/**
 * Dựng mô hình 3D tủ điện từ Project (Three.js thuần, không phụ thuộc Angular).
 * Đơn vị mm. X = rộng, Y = cao (sàn = 0), Z = sâu (mặt trước ở Z = D, tường ở Z < 0).
 */

export interface DoorRig {
  pivot: THREE.Group;
  sign: number;
  inner: boolean;
  /** Trục bản lề: 'y' = cửa bản lề hông (mặc định); 'x' = bản lề cạnh dưới (dự phòng). */
  axis?: 'x' | 'y';
}

export interface CabinetScene {
  root: THREE.Group;
  doors: DoorRig[];
  /** uid thiết bị → khối thân (để tô sáng, chiếu mũi tên). */
  devices: Map<string, THREE.Mesh>;
  /** Kích thước tổng và độ cao lắp (tủ treo tường được treo lên tường). */
  W: number;
  D: number;
  tall: number;
  elev: number;
  dispose(): void;
}

export interface BuildOpts {
  xray?: boolean;
  /** Bóng đổ + chất liệu PBR đẹp hơn (khung xem showroom). */
  showroom?: boolean;
}

export function shellMaterial(p: Project, xray = false): THREE.MeshStandardMaterial {
  const e = p.enclosure;
  const base = { transparent: xray, opacity: xray ? 0.22 : 1, side: THREE.DoubleSide, depthWrite: !xray } as const;
  switch (e.material) {
    case 'GALV':
      return new THREE.MeshStandardMaterial({ color: 0xbec4ca, metalness: 0.7, roughness: 0.42, ...base });
    case 'INOX304':
      return new THREE.MeshStandardMaterial({ color: 0xd6d9dc, metalness: 0.92, roughness: 0.2, ...base });
    case 'INOX201':
      return new THREE.MeshStandardMaterial({ color: 0xcdcbc3, metalness: 0.88, roughness: 0.3, ...base });
    default:
      return new THREE.MeshStandardMaterial({ color: new THREE.Color(ralHex(e.ral)), metalness: 0.05, roughness: 0.62, ...base });
  }
}

/** Mặt trước thiết bị: nền xám đậm, cần gạt màu đỏ, tên model. */
function deviceFace(text: string, w: number, h: number, breaker: boolean): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  const k = 4;
  c.width = Math.max(16, Math.round(w * k));
  c.height = Math.max(16, Math.round(h * k));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = breaker ? '#30363d' : '#4a535c';
  ctx.fillRect(0, 0, c.width, c.height);
  if (breaker) {
    ctx.fillStyle = '#1d2227';
    ctx.fillRect(c.width * 0.3, c.height * 0.28, c.width * 0.4, c.height * 0.38);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(c.width * 0.43, c.height * 0.32, c.width * 0.14, c.height * 0.24);
  }
  ctx.fillStyle = '#e9edf1';
  ctx.font = `600 ${Math.max(10, Math.min(c.width / 8, 48))}px Inter, Segoe UI, Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height * 0.84, c.width * 0.9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
}

/** Biển cảnh báo điện: tam giác vàng viền đen, tia sét. */
function warningSign(size: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.moveTo(128, 14);
  ctx.lineTo(244, 230);
  ctx.lineTo(12, 230);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128, 44);
  ctx.lineTo(220, 216);
  ctx.lineTo(36, 216);
  ctx.closePath();
  ctx.fillStyle = '#F7C600';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(140, 92);
  ctx.lineTo(104, 160);
  ctx.lineTo(130, 160);
  ctx.lineTo(114, 206);
  ctx.lineTo(156, 140);
  ctx.lineTo(130, 140);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5 }));
}

export function buildCabinet(p: Project, cat: Catalog, lay: EnclosureLayout, opts: BuildOpts = {}): CabinetScene {
  const e = p.enclosure;
  const xray = !!opts.xray;
  const showroom = !!opts.showroom;
  const t = Math.max(e.thickness, 1.2) * 1.5; // phóng độ dày cho dễ nhìn
  const B = e.base;
  const elev = showroom && e.mounting === 'wall' ? 450 : 0;
  const root = new THREE.Group();
  root.position.y = elev;
  const devices = new Map<string, THREE.Mesh>();
  const doors: DoorRig[] = [];
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => (disposables.push(x), x);

  const shell = track(shellMaterial(p, xray));
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x2f363d, roughness: 0.7 }));
  const plateMat = track(new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.45, roughness: 0.45 }));
  const copper = track(new THREE.MeshStandardMaterial({ color: 0xc87533, metalness: 0.8, roughness: 0.3 }));
  const edgeMat = track(new THREE.LineBasicMaterial({ color: 0x20262c, transparent: true, opacity: showroom ? 0.22 : 0.45 }));
  const holeMat = track(new THREE.MeshBasicMaterial({ color: 0x15191e }));

  const box = (parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, edges = true): THREE.Mesh => {
    const g = track(new THREE.BoxGeometry(Math.max(w, 0.5), Math.max(h, 0.5), Math.max(d, 0.5)));
    const m = new THREE.Mesh(g, mat);
    m.position.set(x + w / 2, y + h / 2, z + d / 2);
    m.castShadow = showroom && !xray;
    m.receiveShadow = showroom;
    parent.add(m);
    if (edges) m.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(g)), edgeMat));
    return m;
  };

  // khung đế
  if (B) {
    box(root, 0, 0, 0, e.W, B, 40, dark);
    box(root, 0, 0, e.D - 40, e.W, B, 40, dark);
    box(root, 0, 0, 40, 40, B, e.D - 80, dark);
    box(root, e.W - 40, 0, 40, 40, B, e.D - 80, dark);
  }
  // vỏ: hậu, hông, đáy, nóc + mái nhô
  box(root, 0, B, 0, e.W, e.H, t, shell);
  box(root, 0, B, 0, t, e.H, e.D, shell);
  box(root, e.W - t, B, 0, t, e.H, e.D, shell);
  box(root, 0, B, 0, e.W, t, e.D, shell);
  const ov = ROOF_OVERHANG;
  box(root, -ov, B + e.H, 0, e.W + 2 * ov, t, e.D + ov, shell);
  box(root, -ov, B + e.H - 25, e.D + ov - t, e.W + 2 * ov, 25, t, shell);
  box(root, -ov, B + e.H - 25, 0, t, 25, e.D + ov, shell);
  box(root, e.W + ov - t, B + e.H - 25, 0, t, 25, e.D + ov, shell);

  // khe thông gió / quạt trên 2 hông
  const ventMat = track(new THREE.MeshBasicMaterial({ color: 0x1f262e }));
  const slots = (y0: number, x: number): void => {
    const cols = Math.max(1, Math.floor((e.D - 80) / 85));
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < cols; c++) {
        const z = e.D / 2 - ((cols - 1) * 85) / 2 + c * 85;
        box(root, x, B + y0 + r * 16 - 4, z - 30, t, 8, 60, ventMat, false);
      }
  };
  const L = -0.6,
    R = e.W - t + 0.6;
  if (e.vent === 'bottom' || e.vent === 'top_bottom') [L, R].forEach((x) => slots(90, x));
  if (e.vent === 'top_bottom') [L, R].forEach((x) => slots(e.H - 154, x));
  if (e.vent === 'side_vertical') {
    // 3 khe đứng 10×100 phía trước – dưới mỗi hông
    for (const x of [L, R]) for (let i = 0; i < 3; i++) box(root, x, B + 100, e.D - 55 - i * 24 - 5, t, 100, 10, ventMat, false);
  }
  // tai treo ngoài: 4 tai áp tường, nhô khỏi đỉnh và đáy hậu
  if (e.mounting === 'wall' && e.brackets) {
    for (const x of [30, e.W - 80])
      for (const [y0, hy] of [
        [B - 55, B - 30],
        [B + e.H - 5, B + e.H + 30],
      ]) {
        box(root, x, y0, -2.5, 50, 60, 2.5, shell);
        const hole = new THREE.Mesh(track(new THREE.CylinderGeometry(5.5, 5.5, 3, 16)), ventMat);
        hole.rotation.x = Math.PI / 2;
        hole.position.set(x + 25, hy, -1);
        root.add(hole);
      }
  }
  if (e.vent === 'fan') {
    slots(e.H - 154, L);
    const fan = new THREE.Mesh(track(new THREE.CylinderGeometry(57, 57, t + 2, 32)), ventMat);
    fan.rotation.z = Math.PI / 2;
    fan.position.set(e.W, B + 160, e.D / 2);
    root.add(fan);
    box(root, e.W + 0.5, B + 160 - 62, e.D / 2 - 62, 6, 124, 124, dark);
  }

  // tấm đế + thanh cái
  const pz = 30;
  const pl = lay.plate;
  box(root, pl.x, B + pl.y, pz, pl.w, pl.h, 2, plateMat);
  for (const b of lay.bars) box(root, b.rect.x, B + b.rect.y, pz + 60, b.rect.w, b.rect.h, p.busbar.t * 2, copper, false);

  // thiết bị trên tấm đế
  for (const pd of p.devices.filter((d) => d.mount === 'plate')) {
    const def = cat.devices.find((d) => d.id === pd.deviceId);
    if (!def) continue;
    const r = deviceRect(pd, def);
    const d = Math.min(def.size.d, e.D - pz - 20);
    const body = new THREE.MeshStandardMaterial({ color: def.isBreaker ? 0x30363d : 0x4a535c, roughness: 0.6 });
    track(body);
    const m = box(root, r.x, B + r.y, pz + 2, r.w, r.h, d, body);
    const faceMat = track(deviceFace(pd.label || def.model, r.w, r.h, !!def.isBreaker));
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(r.w, r.h)), faceMat);
    face.position.set(0, 0, d / 2 + 0.3);
    m.add(face);
    m.userData['uid'] = pd.uid;
    devices.set(pd.uid, m);
  }

  // cửa: pivot đặt ở bản lề
  for (const leaf of lay.leaves) {
    const inner = leaf.id === 'inner';
    const zFront = inner ? e.D - 30 : e.D;
    const pivot = new THREE.Group();
    const hingeX = leaf.hinge === 'left' ? leaf.rect.x : leaf.rect.x + leaf.rect.w;
    pivot.position.set(hingeX, B + leaf.rect.y, zFront);
    root.add(pivot);
    doors.push({ pivot, sign: leaf.hinge === 'left' ? -1 : 1, inner });
    const g = new THREE.Group();
    g.position.set(leaf.hinge === 'left' ? 0 : -leaf.rect.w, 0, 0);
    pivot.add(g);
    const W = leaf.rect.w,
      H = leaf.rect.h;
    const mat = inner ? track(new THREE.MeshStandardMaterial({ color: 0xc9d0d7, metalness: 0.2, roughness: 0.5, transparent: xray, opacity: xray ? 0.3 : 1 })) : shell;
    box(g, 0, 0, -t, W, H, t, mat);
    box(g, 0, 0, -20, t, H, 20, mat, false);
    box(g, W - t, 0, -20, t, H, 20, mat, false);
    box(g, 0, 0, -20, W, t, 20, mat, false);
    box(g, 0, H - t, -20, W, t, 20, mat, false);
    if (e.doorType === 'two_layer') {
      for (const k of [0.27, 0.73]) box(g, W * k - 10, 60, -t - 20, 20, H - 120, 20, mat);
    }
    if (leaf.hasLock) {
      const lx = lockX(leaf);
      const lock = e.lock ?? 'handle';
      if (lock === 'handle') {
        box(g, lx - 13, H / 2 - 50, 0, 26, 100, 8, dark);
        box(g, lx - 6, H / 2 - 40, 8, 12, 70, 14, dark);
      } else {
        const knob = new THREE.Mesh(track(new THREE.CylinderGeometry(lock === 'square' ? 13 : 11, lock === 'square' ? 13 : 11, 12, 24)), dark);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(lx, H / 2, 6);
        g.add(knob);
      }
    }
    // thiết bị gắn cửa + lỗ khoét
    const cutBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    if (leaf.carriesCutouts) {
      for (const pd of p.devices) {
        const def = cat.devices.find((d) => d.id === pd.deviceId);
        if (!def) continue;
        const cut = deviceCutout(pd, def);
        if (!cut) continue;
        const bb = holeBBox(cut);
        const cx = (bb.minX + bb.maxX) / 2;
        if (cx < leaf.rect.x || cx > leaf.rect.x + leaf.rect.w) continue;
        const lx = bb.minX - leaf.rect.x,
          ly = bb.minY - leaf.rect.y;
        cutBoxes.push({ x0: lx, y0: ly, x1: bb.maxX - leaf.rect.x, y1: bb.maxY - leaf.rect.y });
        if (pd.mount === 'door') {
          const r = deviceRect(pd, def);
          const rx = r.x - leaf.rect.x,
            ry = r.y - leaf.rect.y;
          const col = def.color ? new THREE.Color(def.color).getHex() : 0x20262c;
          const isMeter = def.type.startsWith('METER') || def.type === 'PFR' || def.type === 'EARTH_RELAY';
          const faceMat = track(new THREE.MeshStandardMaterial({ color: isMeter ? 0xf5f7f9 : 0x2f363d, roughness: 0.5 }));
          const m = box(g, rx, ry, 0, r.w, r.h, 6, faceMat);
          m.userData['uid'] = pd.uid;
          devices.set(pd.uid, m);
          if (cut.kind === 'circle') {
            const lamp = track(new THREE.MeshStandardMaterial({ color: col, emissive: def.type === 'PILOT_LAMP' ? col : 0x000000, emissiveIntensity: 0.45 }));
            const cyl = new THREE.Mesh(track(new THREE.CylinderGeometry(cut.r * 0.9, cut.r * 0.9, 14, 24)), lamp);
            cyl.rotation.x = Math.PI / 2;
            cyl.position.set(rx + r.w / 2, ry + r.h / 2, 8);
            cyl.castShadow = showroom;
            g.add(cyl);
          } else if (isMeter) {
            const scr = track(new THREE.MeshBasicMaterial({ color: 0x103b23 }));
            const s = new THREE.Mesh(track(new THREE.PlaneGeometry(r.w * 0.7, r.h * 0.32)), scr);
            s.position.set(rx + r.w / 2, ry + r.h * 0.62, 6.3);
            g.add(s);
          }
          box(g, lx, ly, -t - Math.min(def.size.d, 80), bb.maxX - bb.minX, bb.maxY - bb.minY, Math.min(def.size.d, 80), dark, false);
        } else {
          box(g, lx, ly, 0.3, bb.maxX - bb.minX, bb.maxY - bb.minY, 0.6, holeMat, false);
        }
      }
    }
    // biển cảnh báo điện trên cửa ngoài có khoá
    if (leaf.hasLock && !inner) {
      const size = Math.min(110, W * 0.28);
      const cx = W / 2;
      const ys = [0.78, 0.55, 0.3, 0.88].map((k) => H * k);
      const y = ys.find((yy) => !cutBoxes.some((b) => cx + size / 2 > b.x0 && cx - size / 2 < b.x1 && yy + size / 2 > b.y0 && yy - size / 2 < b.y1)) ?? H * 0.78;
      const sign = warningSign(size);
      track(sign.geometry);
      track(sign.material as THREE.Material);
      sign.position.set(cx, y, 0.6);
      g.add(sign);
    }
  }

  // cửa trong của tủ 2 lớp: cánh bản lề cùng phía cửa ngoài, khoét ô lộ cần gạt aptomat
  if (lay.cover) {
    const cov = lay.cover;
    const hingeLeft = (e.hinge ?? 'left') === 'left';
    const pivot = new THREE.Group();
    pivot.position.set(hingeLeft ? cov.x : cov.x + cov.w, B + cov.y, e.D - 36);
    root.add(pivot);
    doors.push({ pivot, sign: hingeLeft ? -1 : 1, inner: true });
    const g = new THREE.Group();
    g.position.x = hingeLeft ? 0 : -cov.w;
    pivot.add(g);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(cov.w, 0);
    shape.lineTo(cov.w, cov.h);
    shape.lineTo(0, cov.h);
    shape.closePath();
    for (const w of coverWindows(p, cat)) {
      const x0 = w.rect.x - cov.x,
        y0 = w.rect.y - cov.y;
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x0, y0 + w.rect.h);
      hole.lineTo(x0 + w.rect.w, y0 + w.rect.h);
      hole.lineTo(x0 + w.rect.w, y0);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = track(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }));
    const plateM = new THREE.Mesh(geo, shell);
    plateM.position.z = -t;
    plateM.castShadow = showroom && !xray;
    plateM.receiveShadow = showroom;
    plateM.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geo, 30)), edgeMat));
    g.add(plateM);
    // gấp mép 20 quanh cánh trong
    box(g, 0, 0, -20, cov.w, t, 20, shell, false);
    box(g, 0, cov.h - t, -20, cov.w, t, 20, shell, false);
    box(g, 0, 0, -20, t, cov.h, 20, shell, false);
    box(g, cov.w - t, 0, -20, t, cov.h, 20, shell, false);
    // núm vặn khoá ¼ ở phía đối diện bản lề
    const knob = new THREE.Mesh(track(new THREE.CylinderGeometry(9, 9, 10, 16)), dark);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(hingeLeft ? cov.w - 25 : 25, cov.h / 2, 5);
    g.add(knob);
  }

  return {
    root,
    doors,
    devices,
    W: e.W,
    D: e.D,
    tall: e.H + B,
    elev,
    dispose: () => {
      for (const d of disposables) d.dispose();
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        m?.map?.dispose();
      });
    },
  };
}

/** Góc mở cửa (độ). Cửa trong (kiểu trong + ngoài) mở sau cửa ngoài 60°. */
export function setDoorAngle(sc: CabinetScene, deg: number): void {
  for (const d of sc.doors) {
    const a = d.inner ? Math.min(90, Math.max(0, deg - 60)) : deg;
    if (d.axis === 'x') d.pivot.rotation.x = (a * Math.PI) / 180;
    else d.pivot.rotation.y = (d.sign * a * Math.PI) / 180;
  }
}

/** Texture bê tông xám nhạt sinh thủ tục (procedural). */
export function concreteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b9bcbf';
  ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // vệt loang + lỗ rỗ nhỏ
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)';
    ctx.beginPath();
    ctx.arc(rnd() * 512, rnd() * 512, 14 + rnd() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = 'rgba(70,72,75,0.35)';
    ctx.beginPath();
    ctx.arc(rnd() * 512, rnd() * 512, 0.6 + rnd() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
