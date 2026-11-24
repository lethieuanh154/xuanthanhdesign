# Tủ Điện Builder — Xuân Thành (demo UX/UI)

Web app kiểu "trang tự build PC" cho tủ điện: chọn loại tủ → chỉnh vỏ → kéo thả thiết bị → thanh cái & phụ kiện → xuất
**DXF trải phẳng cho máy laser CNC**, **BOM (CSV/XLSX)** và **bản vẽ tổng thể PDF**.

> Đây là bản demo để hình dung UX/UI. Hình học đủ đúng để DXF mở được trong CAD/CAM, **chưa phải số liệu sản xuất**.
> Kích thước thiết bị, bảng BD, bảng thanh cái và đơn giá đều là **số mẫu**.

## Chạy

Yêu cầu: Node 22.22+ / 24.15+ / 26+ (đã thử với Node 26.3), npm.

```bash
npm install
npm start            # = ng serve → http://localhost:4200
npm run build        # bản production → dist/tu-dien-builder/browser
npm test             # unit test module hình học (Vitest)
```

> **Windows:** chạy `npm test` từ đường dẫn có ổ đĩa **viết hoa** (`E:\phuc\tu-dien-builder`, ví dụ trong PowerShell
> `Set-Location E:\phuc\tu-dien-builder`). Nếu terminal đang ở `e:\...` (chữ thường), Vitest nạp thư viện 2 lần và báo
> *"Vitest failed to find the runner"*.

Không cần backend. Dự án tự lưu vào `localStorage` (F5 vẫn còn); nút **Dự án mới** / **Mở dự án** để quản lý nhiều dự án.

## Công nghệ

| Phần | Thư viện |
|---|---|
| Khung app | Angular 22 (standalone components, signals, zoneless, SCSS) |
| Canvas mặt trước, trải phẳng, sắp tôn | Konva.js |
| Xem 3D | Three.js + OrbitControls (tải lazy bằng `@defer`) |
| Kéo từ thư viện vào canvas | Angular CDK drag-drop |
| DXF | Writer DXF R12 (AC1009) tự viết — `src/app/geometry/dxf.ts` |
| BOM | CSV (UTF-8 BOM, mở được bằng Excel) + XLSX (SheetJS, tải lazy) |
| PDF | Trang in A3 ngang có khung tên → "Lưu thành PDF" của trình duyệt |
| Test | Vitest + `dxf-parser` (xuất DXF rồi parse lại) |

## Cấu trúc thư mục

```
src/
├─ assets/data/                 ← DỮ LIỆU — sửa JSON, không cần sửa code
│  ├─ devices.json              thư viện thiết bị (22 mẫu)
│  ├─ templates.json            4 loại tủ mẫu (DB, MSB, ATS, tụ bù)
│  ├─ bend-table.json           bảng BD (bend deduction) theo độ dày
│  ├─ busbar.json               bảng chọn thanh cái đồng theo dòng định mức
│  ├─ accessories.json          phụ kiện vỏ tủ
│  └─ pricing.json              đơn giá tôn, đồng, gia công, tỉ trọng
└─ app/
   ├─ geometry/                 ← TypeScript THUẦN, không phụ thuộc Angular (sẽ port sang Python)
   │  ├─ types.ts               Pt, Polyline (có bulge), Circle, BendLine, Part…
   │  ├─ model.ts               Project, EnclosureConfig, PlacedDevice, Catalog…
   │  ├─ math.ts                bbox, rải cung bulge, diện tích, va chạm hình chữ nhật…
   │  ├─ bend.ts                tra bảng BD, công thức trải phẳng
   │  ├─ panel.ts               trải phẳng tấm gấp mép 4 cạnh + corner relief; thanh profile chấn dọc
   │  ├─ layout.ts              bố cục mặt trước: ngăn, tấm đế, lá cửa, vùng thanh cái, lỗ khoét
   │  ├─ templates.ts           template chi tiết: hông, hậu, nóc, đáy, cửa, tấm đế, khung đế, thanh C, thanh cái
   │  ├─ rules.ts               bộ luật kiểm tra
   │  ├─ nesting.ts             sắp tôn demo (shelf packing)
   │  ├─ dxf.ts                 writer DXF R12 + quy tắc đặt tên file
   │  ├─ bom.ts                 BOM, khối lượng, gợi ý số lượng phụ kiện
   │  ├─ project-factory.ts     tạo dự án từ template
   │  └─ geometry.spec.ts       unit test (20 test)
   ├─ core/
   │  ├─ catalog.service.ts     nạp JSON
   │  ├─ project-repository.ts  interface ProjectRepository + bản localStorage
   │  ├─ project.store.ts       state toàn app (signals) + thao tác
   │  └─ export.service.ts      tải DXF / CSV / XLSX / in
   └─ components/               header, stepper, thư viện, canvas, 3D, trải phẳng, sắp tôn, panel phải, bảng chi tiết, xuất, trang in
```

## Quy ước hình học

- Đơn vị **mm**. Toạ độ thân tủ: gốc ở **góc dưới trái thân tủ** (không tính khung đế), trục Y hướng lên.
- `H` là chiều cao **thân tủ**; khung đế (100/150) cộng thêm bên dưới.
- Ngăn (sections) xếp **từ trên xuống**; `sectionHeights[0]` là ngăn trên cùng.
- **Trải phẳng:** `L = Σ kích thước ngoài − n × BD`. Mỗi đường chấn trừ BD, chia đôi cho 2 đoạn kề nhau
  (xem chú thích trong `panel.ts`). Ví dụ cửa ATS 594 rộng, mép 20 + mép hồi 12, tôn 1.5 (BD 2.6):
  `594 + 2×(20+12) − 4×2.6 = 647.6 mm`.
- Cửa: gấp mép hồi 2 đoạn (20 + 12) mỗi cạnh; cửa trong (kiểu "cửa trong + ngoài") gấp mép đơn và mang lỗ khoét.
- Góc giữa 2 mép gấp có ô khoét giảm ứng suất `relief = t + 1` mm.

## DXF xuất ra

- ASCII **R12 (AC1009)**, `$INSUNITS = 4` (mm), gốc (0,0) ở góc dưới trái mỗi chi tiết.
- Chỉ dùng `LINE`, `CIRCLE`, `POLYLINE` khép kín (cung dùng bulge, ví dụ lỗ oblong), `TEXT`. **Không SPLINE.**
- Layer / màu ACI: `CUT`=3 xanh lá · `BEND_UP`=6 tím · `BEND_DOWN`=5 xanh dương · `MARK`=2 vàng · `TEXT`=7.
- Tên file: `{MaDon}_{MaChiTiet}_{TenChiTiet}_{DoDay}mm_SL{qty}.dxf`, ví dụ `DH-2611-01_CUA_Cua_1.5mm_SL1.dxf`.
- Chữ trong DXF được bỏ dấu tiếng Việt (R12 không chắc đọc đúng Unicode trên mọi máy CNC).
- Đã kiểm tra: unit test parse lại bằng `dxf-parser`; `ezdxf` audit (Python) → 0 lỗi, 0 sửa.

Tự kiểm tra bằng ezdxf:

```bash
python -m venv .venv && .venv/Scripts/pip install ezdxf     # Linux/mac: .venv/bin/pip
.venv/Scripts/python -c "from ezdxf import recover; d,a=recover.readfile('file.dxf'); print(len(a.errors), 'lỗi')"
```

## Thêm thiết bị mới

Thêm 1 object vào `src/assets/data/devices.json`:

```jsonc
{
  "id": "mccb-3p-160",                 // duy nhất
  "brand": "LS", "series": "Metasol", "model": "ABN163c 160A",
  "name": "MCCB 3P 160A",
  "type": "MCCB",                      // ACB | MCCB | MCB | METER_V | METER_A | METER_MULTI | CT | PILOT_LAMP
                                       // | PUSH_BUTTON | SELECTOR | PFR | CONTACTOR | PHASE_RELAY | CAPACITOR
  "category": "MCCB/MCB",              // nhóm trong thư viện: ACB | MCCB/MCB | Đo lường | Điều khiển & báo | Tụ bù & contactor
  "ratedCurrent": 160, "poles": 3,
  "size": { "w": 90, "h": 155, "d": 60 },   // rộng × cao × sâu nhìn từ mặt trước
  "mount": "plate",                    // plate = tấm đế (lỗ bắt vít) | door = lỗ khoét cửa
  "doorCutout": { "shape": "rect", "w": 60, "h": 80 },   // hoặc { "shape": "circle", "d": 22.5 }
  "cutoutDefault": false,              // true: thiết bị tấm đế nhưng mặc định khoét cửa (mặt ACB)
  "plateHoles": [ { "x": 45, "y": 12, "d": 4.5 }, { "x": 45, "y": 143, "d": 4.5 } ],  // từ góc dưới trái thiết bị
  "clearance": 20,                     // khoảng hở tối thiểu tới thiết bị khác
  "price": 2100000,
  "isBreaker": true,                   // tham gia luật tổng tải
  "din": false,                        // true: ray DIN — các thiết bị DIN đặt sát nhau không cần khoảng hở
  "color": "#E53935"                   // tuỳ chọn, cho đèn/nút
}
```

## Thêm / sửa loại tủ

Sửa `src/assets/data/templates.json` (`id` là một trong `DB | MSB | ATS | CAP`). Muốn thêm **loại** tủ mới: thêm id vào
`CabinetType` trong `geometry/model.ts` rồi thêm object vào JSON.

Thêm **chi tiết** mới (ví dụ vách ngăn, nắp che thanh cái): viết 1 hàm `(project, …) => Part` trong
`geometry/templates.ts` (dùng `flangedPanel` cho tấm gấp mép, `profileStrip` cho thanh chấn dọc) rồi thêm vào
`generateParts()`. DXF, sắp tôn, BOM, bảng chi tiết tự nhận.

## Thay bảng BD thực tế

`src/assets/data/bend-table.json`:

```json
{ "steel": { "1.2": 2.0, "1.5": 2.6, "2.0": 3.5 }, "copper": { "5": 8.5 } }
```

Cách đo: chấn thử 1 mẫu dải tôn dài `L0` (ví dụ 100 mm) một nếp 90°, đo 2 cạnh ngoài `a`, `b` →
`BD = a + b − L0`. Đo theo **từng độ dày + cối V + lô tôn** đang dùng. Độ dày không có trong bảng sẽ được nội suy tuyến tính.

Các hằng số khác: mép gấp chuẩn `FLANGE = 20`, mép hồi cửa `DOOR_RETURN = 12`, mái nhô `ROOF_OVERHANG = 20`
(`templates.ts`); khe cửa, lề tấm đế (`layout.ts`); ngưỡng luật (`rules.ts`).

## Bộ luật kiểm tra (`rules.ts`)

Mỗi luật trả `{ level: 'ok' | 'warn' | 'error', message, targetIds, step }`:

1. Thiết bị không chồng lấn; khoảng hở ≥ `clearance` (mặc định 20 mm; DIN–DIN = 0).
2. Thiết bị nằm trong vùng lắp tấm đế (lề 15 mm) và không vắt qua ranh giới ngăn.
3. Lỗ khoét cửa cách mép cửa ≥ 30 mm, không rơi vào khe 2 cánh; trên bản trải phẳng: lỗ không cắt đường chấn, lỗ không chồng lỗ.
4. Ngăn có ACB phải cao ≥ 500 mm.
5. Tổng tải (Σ aptomat nhánh × Ks) ≤ aptomat tổng và ≤ thanh cái. Aptomat tổng = cái được đánh dấu, nếu không thì cái lớn nhất (tủ ATS: 2 cái lớn nhất là 2 nguồn).
6. Chi tiết trải phẳng phải lọt khổ tôn đang chọn (1250×2500 / 1500×3000).
7. Phụ: thiết bị quá sâu so với tủ (error), đè lên vùng thanh cái (warn).

## Kịch bản demo (tiêu chí nghiệm thu)

1. Chọn **Tủ ATS treo tường** → 800×600×250, bấm **1.5 mm**.
2. Bước ③: kéo **MCCB 4P 100A** vào canvas (hoặc **+ Thêm**) ×2; thêm đồng hồ đa năng 96×96, 3 đèn báo Ø22, công tắc chuyển mạch (tự lên cửa).
3. Kéo 2 MCCB sát nhau → cả 2 tô đỏ, panel KIỂM TRA báo `Hở … < 20 mm`, stepper có badge đỏ. Kéo ra xa → hết.
4. Tab **3D**: xoay bằng chuột, tick **Mở cửa**.
5. Tab **Trải phẳng** → chọn **Cửa**: biên dạng xanh lá, lỗ khoét đúng vị trí, đường chấn tím có mũi tên, KT 647.6 × 847.6.
6. Tab **Sắp tôn**: số tấm + % sử dụng.
7. Bước ⑤: tải DXF cửa, BOM XLSX.
8. F5 → dự án còn nguyên.

Đã chạy tự động toàn bộ kịch bản trên bằng Chrome headless — đạt, không có lỗi console.

## Hướng port sang Python / Cloud Run / Firebase

**Module hình học** (`src/app/geometry/`) không import Angular, chỉ dùng kiểu dữ liệu thuần → port 1-1:

| TypeScript | Python |
|---|---|
| `types.ts`, `model.ts` | `pydantic` models (hoặc `dataclasses`) — cùng tên trường để dùng chung JSON |
| `math.ts` | `shapely` (`box`, `Polygon.area`, `intersects`, `distance`) thay cho hàm tự viết |
| `panel.ts`, `templates.ts` | giữ nguyên thuật toán; kết quả là list điểm + bulge |
| `dxf.ts` | `ezdxf`: `doc = ezdxf.new('R2010', setup=True)`, `doc.units = units.MM`, `msp.add_lwpolyline(pts, format='xyb', close=True)`, `add_circle`, `add_line`; chạy `doc.audit()` trước khi lưu |
| `nesting.ts` | giữ shelf packing, hoặc thay bằng `rectpack` / `pynest2d` |
| `rules.ts` | giữ nguyên; `shapely` cho va chạm đa giác thật |
| `geometry.spec.ts` | `pytest` với cùng bộ dữ liệu mẫu trong `assets/data` → so kết quả 2 phía |

Gợi ý API Cloud Run: `POST /parts` (Project → Part[]), `POST /dxf/{partId}`, `POST /dxf/combined`, `POST /bom.xlsx`.
Phía Angular chỉ cần đổi `ExportService` gọi API thay vì gọi hàm TS cục bộ.

**Lưu dự án lên Firestore:** viết `FirestoreProjectRepository implements ProjectRepository`
(`core/project-repository.ts`: `list / load / save / remove`) với collection `projects/{id}`, rồi trong `app.config.ts`:

```ts
providers: [{ provide: PROJECT_REPOSITORY, useClass: FirestoreProjectRepository }]
```

UI không phải sửa. Thư viện thiết bị có thể chuyển sang collection `devices` — `CatalogService.load()` là chỗ duy nhất đọc dữ liệu.
