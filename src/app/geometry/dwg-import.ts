import { DxfDocLike, DxfEntityLike } from './dxf-import';

/**
 * ĐỌC DWG: chuyển `DwgDatabase` do thư viện `@mlightcad/libredwg-web` (LibreDWG biên dịch WebAssembly)
 * trả về → cùng dạng object như `dxf-parser`, để `explodeDxf` / `detectParts` dùng chung.
 * TypeScript thuần — chỉ khai báo các trường dùng tới, không phụ thuộc kiểu của thư viện.
 *
 * Khác biệt DWG ↔ DXF cần đổi:
 *  - LWPOLYLINE: cờ DWG thô — bit 512 = khép kín (DXF dùng bit 1).
 *  - INSERT.rotation: radian (dxf-parser trả độ).
 *  - POLYLINE2D / POLYLINE3D → POLYLINE; SPLINE.knots → knotValues, degree → degreeOfSplineCurve.
 *  - Model space: entity có chủ là block record "*Model_Space"; còn lại là paper space.
 */

interface P3 {
  x: number;
  y: number;
  z?: number;
}

export interface DwgEntityLike {
  type: string;
  layer?: string;
  colorIndex?: number;
  color?: number;
  isVisible?: boolean;
  ownerBlockRecordSoftId?: string;
  startPoint?: P3;
  endPoint?: P3;
  center?: P3;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  flag?: number;
  vertices?: (P3 & { bulge?: number; flag?: number })[];
  majorAxisEndPoint?: P3;
  axisRatio?: number;
  degree?: number;
  knots?: number[];
  controlPoints?: P3[];
  fitPoints?: P3[];
  name?: string;
  insertionPoint?: P3;
  xScale?: number;
  yScale?: number;
  rotation?: number;
  columnCount?: number;
  rowCount?: number;
  columnSpacing?: number;
  rowSpacing?: number;
  extrusionDirection?: P3;
}

export interface DwgDatabaseLike {
  header?: { INSUNITS?: number };
  entities: DwgEntityLike[];
  tables?: {
    LAYER?: { entries?: { name: string; color?: number; colorIndex?: number; off?: boolean; frozen?: boolean }[] };
    BLOCK_RECORD?: { entries?: { handle?: string; name: string; basePoint?: P3; entities?: DwgEntityLike[] }[] };
  };
}

/** Màu ACI 1–7 (đủ cho bản vẽ kỹ thuật); số khác → để màu layer. */
const ACI_BASIC: Record<number, number> = { 1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff };

/** Vector pháp tuyến hợp lệ (bản DWG đôi khi để (0,0,0) = mặc định). */
const ext = (v?: P3): P3 | undefined => (v && (v.x !== 0 || v.y !== 0 || (v.z ?? 0) !== 0) ? v : undefined);

function convertEntity(e: DwgEntityLike, paper: boolean): DxfEntityLike {
  const base: DxfEntityLike = {
    type: e.type,
    layer: e.layer,
    colorIndex: e.colorIndex,
    color: e.colorIndex !== undefined ? ACI_BASIC[e.colorIndex] : undefined,
    inPaperSpace: paper,
    extrusionDirection: ext(e.extrusionDirection),
  };
  switch (e.type) {
    case 'LINE':
      return e.startPoint && e.endPoint ? { ...base, vertices: [e.startPoint, e.endPoint] } : base;
    case 'CIRCLE':
    case 'ARC':
      return { ...base, center: e.center, radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle };
    case 'LWPOLYLINE':
      return { ...base, vertices: (e.vertices ?? []).map((v) => ({ x: v.x, y: v.y, bulge: v.bulge ?? 0 })), shape: ((e.flag ?? 0) & 512) !== 0 };
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const f = e.flag ?? 0;
      // bỏ đỉnh khung điều khiển spline (cờ đỉnh 16) — chỉ giữ đỉnh thật của đường
      const verts = (e.vertices ?? []).filter((v) => ((v.flag ?? 0) & 16) === 0);
      return { ...base, type: 'POLYLINE', vertices: verts.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge ?? 0 })), shape: (f & 1) !== 0, isPolyfaceMesh: (f & 64) !== 0, is3dPolygonMesh: (f & 16) !== 0 };
    }
    case 'ELLIPSE':
      return { ...base, center: e.center, majorAxisEndPoint: e.majorAxisEndPoint, axisRatio: e.axisRatio, startAngle: e.startAngle, endAngle: e.endAngle };
    case 'SPLINE':
      return { ...base, controlPoints: e.controlPoints, fitPoints: e.fitPoints, knotValues: e.knots, degreeOfSplineCurve: e.degree, closed: ((e.flag ?? 0) & 1) !== 0 };
    case 'INSERT':
      return {
        ...base,
        name: e.name,
        position: e.insertionPoint,
        xScale: e.xScale,
        yScale: e.yScale,
        rotation: ((e.rotation ?? 0) * 180) / Math.PI,
        columnCount: e.columnCount,
        rowCount: e.rowCount,
        columnSpacing: e.columnSpacing,
        rowSpacing: e.rowSpacing,
      };
    default:
      return base; // TEXT, MTEXT, DIMENSION, HATCH… — explodeDxf đếm vào "bỏ qua"
  }
}

export function dwgDatabaseToDoc(db: DwgDatabaseLike): DxfDocLike {
  const records = db.tables?.BLOCK_RECORD?.entries ?? [];
  const model = records.find((b) => b.name.toLowerCase() === '*model_space');
  const visible = (e: DwgEntityLike): boolean => e.isVisible !== false;

  const layers: Record<string, { name: string; color?: number; visible: boolean; frozen: boolean }> = {};
  for (const l of db.tables?.LAYER?.entries ?? []) {
    layers[l.name] = { name: l.name, color: l.color ?? (l.colorIndex !== undefined ? ACI_BASIC[Math.abs(l.colorIndex)] : undefined), visible: !l.off, frozen: !!l.frozen };
  }

  const blocks: NonNullable<DxfDocLike['blocks']> = {};
  for (const b of records) {
    if (b.name.startsWith('*') && /^\*(model|paper)_space/i.test(b.name)) continue;
    blocks[b.name] = { position: b.basePoint, entities: (b.entities ?? []).filter(visible).map((e) => convertEntity(e, false)) };
  }

  const entities = db.entities.filter(visible).map((e) => convertEntity(e, !!model?.handle && !!e.ownerBlockRecordSoftId && e.ownerBlockRecordSoftId !== model.handle));
  return {
    header: { $INSUNITS: db.header?.INSUNITS ?? 0 },
    tables: { layer: { layers } },
    blocks,
    entities,
  };
}
