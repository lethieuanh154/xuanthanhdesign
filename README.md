# Tủ Điện Builder — Xuân Thành

Web app cấu hình tủ điện kiểu **wizard từng bước** (giống trình cấu hình DriveWorks Live): khung 3D lớn bên trái,
panel hẹp bên phải mỗi lần chỉ hiện **một bước**, giá cập nhật ngay; bước cuối sinh **DXF trải phẳng cho máy laser
CNC**, **BOM (XLSX)**, **bản vẽ tổng thể PDF** và **báo giá cho khách**.

Giao diện nhiều panel cũ vẫn còn, đổi tên thành **Chế độ nâng cao** (cho bộ phận Thiết kế).

> Bản demo. Kích thước thiết bị, bảng BD, bảng thanh cái và đơn giá đều là **số mẫu**.

## Các trang (route)

| Route | Trang | Dành cho |
|---|---|---|
| `/` | **Trang chọn giao diện**: Wizard View / Detail View + danh sách đơn gần đây | Mọi người |
| `/cau-hinh/moi` | Tạo cấu hình mới → chuyển sang `/cau-hinh/{id}` | Người bán hàng |
| `/cau-hinh/:id` | **Wizard View** — 8 bước, có nút **Detail View ↗** mở cùng đơn ở giao diện đầy đủ | Người bán hàng |
| `/don-hang/:id` | Trang Kết quả: bản vẽ PDF, ZIP DXF / tải lẻ, **DXF gộp**, BOM **XLSX + CSV**, báo giá; **sắp tôn** (số tấm, % sử dụng); **đơn đã lưu**; xem trước trải phẳng | Người bán hàng, xưởng |
| `/nang-cao/:id` | **Detail View** — giao diện đầy đủ của bản v1 (thư viện, canvas, 4 tab, kiểm tra, bảng chi tiết), có nút **‹ Wizard View** | Thiết kế |

**Trang chọn giao diện:** lần đầu mở app luôn hiện trang này. Nếu tick "Ghi nhớ lựa chọn" (mặc định bật), lần sau mở
`/` sẽ vào thẳng giao diện đã chọn với đơn gần nhất. Muốn chọn lại: bấm logo **XUÂN THÀNH** ở cả hai giao diện,
hoặc mở `/?chon=1`.

Cả hai giao diện dùng chung `ProjectStore`, nên dữ liệu **đồng bộ hai chiều**: sửa ở Detail View rồi quay về wizard
thì thấy ngay, và ngược lại. Mọi thay đổi tự lưu nháp vào `localStorage` sau ~0,4 giây.

### Wizard View có gì, Detail View có thêm gì

Wizard cố ý gọn cho người bán hàng. Các tùy chỉnh kỹ thuật sau **chỉ có ở Detail View**: xoay thiết bị 0/90°, "Căn đều",
phím tắt (Delete, Ctrl+D, R, mũi tên), đổi gắn tấm đế ↔ cửa, đánh dấu aptomat tổng, nhãn thiết bị, bật/tắt khoét cửa
cho thiết bị tấm đế, kích thước đồng / uốn Z / hệ số Ks của thanh cái, sửa số lượng phụ kiện, chiều cao ngăn cho tủ treo,
khổ tôn, thước & lưới, sơ đồ sắp tôn, panel KIỂM TRA / TÓM TẮT đầy đủ, bảng danh sách chi tiết.
Kịch bản nghiệm thu v1 (mục bên dưới) đã chạy lại trên Detail View sau bản v2 — đạt.

### Luồng wizard

1. **Loại tủ** — 4 thẻ có ảnh render 3D (DB, MSB, ATS, tụ bù) → điền sẵn thông số mặc định.
2. **Kích thước** — Cao/Rộng/Sâu (▲▼ bước 50 mm, phạm vi cho phép), chip kích thước phổ biến, số ngăn + khung đế (tủ đặt sàn). Báo ngay nếu chi tiết vượt khổ tôn.
3. **Vật liệu & sơn** — thép sơn tĩnh điện / tôn mạ kẽm / inox 304 / inox 201, độ dày, màu RAL. 3D đổi chất liệu ngay.
4. **Cấp bảo vệ & thông gió** — mã IP tổng hợp; IP ≥ 54 tự thêm ron cửa; không / hông dưới / trên + dưới / quạt hút.
5. **Cửa & khóa** — 1 cánh / 2 cánh / trong + ngoài, chiều mở trái/phải, khóa tay nắm / vuông / có chìa. Khung 3D tự mở cửa 90°.
6. **Thiết bị** — bảng nhóm thiết bị (Thêm · Sửa · Nhân bản · Xóa), form 3 ô chọn nối tiếp Nhóm → Hãng/dòng → Model,
   "Chèn bộ mẫu" theo loại tủ. App **tự xếp chỗ** hợp lệ đầu tiên (trên → dưới, trái → phải, đủ khoảng hở).
   Tick "Hiện mũi tên di chuyển" để dịch thiết bị đang chọn 5 mm/lần (trên 3D hoặc 2D); kéo thả trong 2D vẫn được.
7. **Thanh cái & phụ kiện** — gợi ý dòng thanh cái theo aptomat tổng/tổng tải, số pha, vị trí; phụ kiện dạng checkbox có giá.
8. **Thông tin đơn hàng** — mã đơn tự sinh `XT-yymm-0001`, khách hàng (gợi ý khi gõ, tự điền liên hệ), địa chỉ, ghi chú,
   ảnh render tủ cửa mở. Nút xanh **Hoàn tất đơn** (bị khóa nếu còn lỗi) → trang Kết quả.

Cảnh báo chỉ hiện **trong đúng bước liên quan**; bước còn lỗi thì chấm tiến độ đỏ. Bảng gán luật → bước nằm ở
`RULE_STEP` trong `src/app/wizard/wizard.service.ts`.

Trên điện thoại/tablet dọc (≤ 820 px): khung 3D ở trên (45vh), panel thành bottom sheet, nút ‹ và giá luôn ở dưới cùng.

### Tủ 2 lớp (cửa ngoài + cửa trong khoét ô)

Loại tủ mẫu **"Tủ điện 2 lớp treo tường"** (800×500×250, tôn 1.5) và kiểu cửa `two_layer`, làm theo tủ thực tế của xưởng.
Giống kiểu "cửa trong + ngoài", nhưng **cửa trong không gắn thiết bị mà khoét ô lộ cần gạt aptomat**:

- **Cửa ngoài** gắn relay chạm đất Mikro 96×96, đồng hồ Volt + công tắc chuyển mạch, đèn báo, khóa tay nắm;
  mặt sau có **2 gân tăng cứng** (chi tiết `GAN-CUA`, thép U chấn 12-20-12). Cửa ngoài **không** khoét cho thiết bị tấm đế.
- **Cửa trong** (`CUA-TRONG`, `geometry/cover.ts`): gấp mép 20, **bản lề cùng phía cửa ngoài**, khoá ¼ vòng phía đối diện.
  Ô khoét **tự sinh** theo thiết bị trên tấm đế: aptomat dùng kích thước lỗ khoét trong `devices.json`, thiết bị ray DIN
  lộ phần mặt cao 48 mm; các ô sát nhau (< 8 mm) gộp thành 1 ô (cả hàng MCB/cầu chì/relay). Biến dòng, ZCT, tụ không cần ô.
  Luật `cover-window`: ô khoét phải cách mép cửa trong ≥ 20 mm.
- **4 tai treo ngoài** (`TAI-TREO`, thép 2 mm chấn L) thay cho lỗ treo trên hậu — tuỳ chọn `brackets` ở bước 2.
- **Tấm che lỗ cáp đáy** (`TAM-CHE-DAY`) bắt 4 bulông vào ô chữ nhật ở đáy — tuỳ chọn `cableEntry: 'gland'` ở bước 2.
- **Khe gió đứng 2 hông** (3 khe oblong 10×100) — `vent: 'side_vertical'` ở bước 4.
- Thiết bị mới: relay chạm đất Mikro 96×96, ZCT Ø80, cầu chì 3 cực, MCB 2P 6A, MCCB 4P 100A Schneider CVS.
  "Chèn bộ mẫu" ở bước 6 nạp đúng bộ thiết bị như tủ trong ảnh.
- 3D: góc mở 90° → cửa trong hé 30°; 150° → cửa trong mở 90°.

### Thêm một bước mới vào wizard

1. Tạo `src/app/wizard/steps/step-xxx.component.ts` (standalone, inject `ProjectStore` để đọc/ghi dự án,
   `WizardService.issuesOf(n)` để hiện cảnh báo của bước).
2. Thêm 1 dòng vào `WIZARD_STEPS` trong `wizard.service.ts` (số bước, key, tiêu đề) và đánh lại số các bước sau.
3. Thêm `@case (n) { <app-step-xxx /> }` trong `src/app/pages/wizard-page.html` và import component trong `wizard-page.ts`.
4. Nếu bước có luật kiểm tra riêng: thêm `ruleId: n` vào `RULE_STEP`.
5. Nếu bước cần trường dữ liệu mới: thêm (tuỳ chọn, có `?`) vào `Project`/`EnclosureConfig` trong `geometry/model.ts`
   để dự án cũ vẫn mở được.

### Trang Kết quả

- **Cấu hình của bạn**: ảnh render (chụp lúc hoàn tất), mã đơn, ngày, tổng giá, mô tả tự sinh (`core/describe.ts`).
- **Tiến độ tạo file**: giả lập vài giây ở lần mở đầu sau khi hoàn tất.
- **File & tài liệu**: bản vẽ tổng thể (A3 ngang, khung tên), ZIP DXF (hoặc tải lẻ từng file), BOM `.xlsx`,
  báo giá cho khách (A4: logo, hạng mục, VAT, tổng bằng chữ, điều khoản). PDF dùng hộp thoại in của trình duyệt →
  **Lưu thành PDF** (khổ giấy tự đặt theo loại tài liệu).
- **Xem trước trải phẳng**: khung CNC nền đen, chọn chi tiết, chỉ xem.

### Sắp tôn từ file DWG / DXF → ảnh JPG (`/sap-ton-dxf`)

Công cụ độc lập (không cần dự án): nhập **bản vẽ gia công đã vẽ sẵn** (DWG hoặc DXF), tự nhận dạng chi tiết, xếp lên
khổ tôn, xuất **ảnh JPG** các tấm tôn (nền tối, nét trắng, kiểu màn hình CAM). Vào từ trang chọn giao diện hoặc menu **Xuất ▾**.

1. **Chọn file .DWG / .DXF** (hoặc kéo thả).
   - **DXF** ASCII: đọc bằng `dxf-parser`.
   - **DWG**: đọc ngay trong trình duyệt bằng **LibreDWG** biên dịch WebAssembly (`@mlightcad/libredwg-web`), không cần
     AutoCAD / ODA, không gửi file đi đâu. `libredwg-web.wasm` (~7,8 MB, nén gzip khi phục vụ) chỉ tải khi chọn file DWG
     lần đầu; được copy vào `assets/libredwg/` lúc build (`angular.json` → `assets`). `geometry/dwg-import.ts` đổi
     `DwgDatabase` sang cùng dạng `dxf-parser` (cờ LWPOLYLINE DWG bit 512 = khép kín; INSERT.rotation radian → độ).
     Đã đối chiếu với `dwg2dxf` (LibreDWG CLI) trên bản vẽ PENTA-SHOP (AC1032, 4 118 entity, 680 block): cùng 12 157 nét,
     cùng khung bao, cùng số nét từng layer. LibreDWG vẫn báo lỗi với MTEXT / màu chữ của DWG 2018 — không ảnh hưởng hình học.
   - ⚠ `@mlightcad/libredwg-web` giấy phép **GPL-3.0**. Dùng nội bộ thì không sao; nếu phát hành app cho bên ngoài phải
     tuân thủ GPL (công bố mã nguồn phần liên quan) — cân nhắc trước khi mở cho khách hàng.
   - `angular.json` có `"externalDependencies": ["node:module"]`: glue Emscripten có `import("node:module")` chỉ chạy
     trong Node, trình duyệt không bao giờ gọi tới.
2. **Layer**: mỗi layer chọn *Cắt* (nhận dạng biên dạng/lỗ), *Hiện* (chỉ vẽ — đường chấn) hoặc *Tắt*.
   Mặc định tự đoán theo tên: `DIM`, `TEXT`, `KHUNG`, `HATCH`, `DEFPOINTS`… → Tắt; `BEND`, `CHAN` → Hiện; layer đang tắt/đóng băng → Tắt.
   **Đơn vị bản vẽ**: Tự động / mm / cm / m / inch. Tự động = theo `$INSUNITS`, nhưng nếu header ghi inch mà bản vẽ
   dài quá 30 m khi đổi (số đo gốc 200…30 000) thì coi là mm — nhiều file template mặc định bị ghi sai inch.
   Kèm *Tỉ lệ ×* (bản vẽ vẽ theo tỉ lệ), *Dung sai* chạm nét (mặc định 0,1 mm), *Nhỏ nhất* (bỏ nhóm < 20 mm: chữ vẽ bằng nét, ký hiệu).
3. **Chi tiết**: danh sách CT01, CT02… (đánh theo vị trí trên → dưới, trái → phải), số lỗ, số lượng/bộ, *Số bộ*.
   Bấm vào chi tiết trên bản vẽ để bật/tắt; **Chọn vùng** = kéo khung chỉ lấy chi tiết nằm gọn trong khung (Shift = thêm).
   Viền **xanh** = biên dạng kín; viền **cam** = biên dạng hở / chạm chữ T (vẫn xếp theo hình bao, dùng bao lồi để tính);
   nét **đỏ** = nét lẻ không thuộc chi tiết nào (bị bỏ).
4. **Khổ tôn** 1250×2500 / 1500×3000 / tuỳ chỉnh, khe hở, lề tấm, cho xoay 90° → số tấm, % sử dụng (theo diện tích tôn thực).
   Cụm cỡ bằng khổ tôn (bản vẽ **đã sắp sẵn**, chi tiết đặt sát nhau dùng chung đường cắt — ví dụ file phôi đưa vào
   2D CutAhead) được đặt nguyên 1 tấm, không xếp lại, không tính %.
5. **Xuất JPG**: độ nét (0,5 / 1 / 2 px/mm), màu nét trắng hoặc theo bản vẽ, tiêu đề từng tấm, mã chi tiết.
   Tên file `{TenDXF}_SapTon_{Rong}x{Dai}_{N}tam.jpg`; nhiều tấm xếp cạnh nhau (tối đa 6 tấm/hàng).

Nhận dạng (`geometry/dxf-import.ts`): bung LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE/POLYLINE (bulge), SPLINE, INSERT
(lồng nhau, xoay, tỉ lệ, mảng MINSERT, lật OCS, layer 0 thừa hưởng) → bỏ nét trùng → **gom nét chạm nhau**
(khoảng cách đoạn–đoạn ≤ dung sai, nên chạm chữ T / chồng nét / cắt ngang đều thành 1 nhóm) → nhóm nằm gọn trong nhóm
khác (lỗ, ký hiệu khoá vẽ trong lỗ tay nắm) gộp vào → nhóm ngoài cùng = chi tiết. Biên dạng = vòng kín lớn nhất nếu trùng
hình bao nhóm, nếu không thì bao lồi; lỗ = vòng kín cấp 1 bên trong. Bỏ qua TEXT, MTEXT, DIMENSION, HATCH, SOLID, paper space.
Sắp xếp (`geometry/rect-pack.ts`): MaxRects theo hình bao, thử 3 tiêu chí (BSSF/BAF/BL) và giữ phương án ít tấm nhất.
Đây là xếp theo **hình chữ nhật bao** — không lồng chi tiết vào lỗ / chỗ khuyết của chi tiết khác.

## Chạy

Yêu cầu: Node 22.22+ / 24.15+ / 26+ (đã thử với Node 26.3), npm.

```bash
npm install
npm start            # = ng serve → http://localhost:4200 (mở /cau-hinh/moi)
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
| Xem 3D | Three.js: tường bê tông procedural, sàn, bóng đổ mềm, vật liệu PBR (`src/app/three/`, tải lazy) |
| Router | Angular Router, `withComponentInputBinding` (`:id` → `input()`) |
| ZIP DXF | fflate (tải lazy) |
| Font | Inter (`@fontsource/inter`, đóng gói kèm app, có tiếng Việt) |
| Kéo từ thư viện vào canvas | Angular CDK drag-drop |
| DXF | Writer DXF R12 (AC1009) tự viết — `src/app/geometry/dxf.ts`; đọc DXF: `dxf-parser` |
| Đọc DWG | LibreDWG WebAssembly — `@mlightcad/libredwg-web` (GPL-3.0, tải lazy) |
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
│  ├─ accessories.json          phụ kiện vỏ tủ (khoá, bản lề, ron, quạt, đèn tủ…)
│  ├─ customers.json            khách hàng mẫu cho ô gợi ý ở bước 8
│  └─ pricing.json              đơn giá tôn (SPCC/mạ kẽm/inox), đồng, gia công, tỉ trọng, VAT
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
   │  ├─ dxf-import.ts          đọc DXF bản vẽ có sẵn → chi tiết (biên dạng + lỗ) cho /sap-ton-dxf
   │  ├─ dwg-import.ts          DwgDatabase (libredwg-web) → cùng dạng dxf-parser
   │  ├─ rect-pack.ts           xếp hình chữ nhật MaxRects (dùng cho /sap-ton-dxf)
   │  ├─ geometry.spec.ts       unit test (20 test)
   │  └─ dxf-import.spec.ts     unit test nhập DXF/DWG + MaxRects (13 test)
   ├─ pages/                    wizard-page (/cau-hinh), result-page (/don-hang), advanced-page (/nang-cao),
   │                            dxf-nest-page (/sap-ton-dxf)
   ├─ wizard/
   │  ├─ wizard.service.ts      trạng thái wizard (signals), 8 bước, gán luật → bước
   │  ├─ wizard-data.ts         nhóm thiết bị, bộ mẫu, kích thước phổ biến, IP, phụ kiện tuỳ chọn
   │  ├─ front-2d.ts            mặt trước 2D (SVG) + mũi tên dịch + kéo thả
   │  ├─ thumb.service.ts       ảnh render offscreen (thẻ loại tủ, trang Kết quả)
   │  ├─ price-counter.ts       giá có hiệu ứng đếm số
   │  └─ steps/step-*.component.ts   8 bước
   ├─ three/
   │  ├─ cabinet-scene.ts       dựng tủ 3D từ Project (vỏ, cửa có bản lề, thiết bị, biển cảnh báo)
   │  ├─ stage.ts               renderer, tường/sàn, bóng đổ, môi trường PBR, góc nhìn, chụp ảnh
   │  └─ ral.ts                 bảng màu RAL
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

## Thêm / sửa loại tủ, bộ mẫu thiết bị

Bộ mẫu cho nút "Chèn bộ mẫu" ở bước 6: `DEVICE_PRESETS` trong `src/app/wizard/wizard-data.ts`.
Nhóm ở ô chọn thứ nhất: `DEVICE_GROUPS` (theo `type` của thiết bị).

### Loại tủ

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

## Kịch bản demo bản v1 (chế độ nâng cao)

1. Chọn **Tủ ATS treo tường** → 800×600×250, bấm **1.5 mm**.
2. Bước ③: kéo **MCCB 4P 100A** vào canvas (hoặc **+ Thêm**) ×2; thêm đồng hồ đa năng 96×96, 3 đèn báo Ø22, công tắc chuyển mạch (tự lên cửa).
3. Kéo 2 MCCB sát nhau → cả 2 tô đỏ, panel KIỂM TRA báo `Hở … < 20 mm`, stepper có badge đỏ. Kéo ra xa → hết.
4. Tab **3D**: xoay bằng chuột, tick **Mở cửa**.
5. Tab **Trải phẳng** → chọn **Cửa**: biên dạng xanh lá, lỗ khoét đúng vị trí, đường chấn tím có mũi tên, KT 647.6 × 847.6.
6. Tab **Sắp tôn**: số tấm + % sử dụng.
7. Bước ⑤: tải DXF cửa, BOM XLSX.
8. F5 → dự án còn nguyên.

Đã chạy tự động toàn bộ kịch bản trên bằng Chrome headless — đạt, không có lỗi console.

## Kịch bản demo bản v2 (wizard)

1. Mở `/cau-hinh/moi`: chỉ thấy khung 3D + panel bước 1.
2. Đi hết 8 bước bằng "Tiếp tục"; bấm chấm tiến độ để quay lại bước đã qua.
3. Đổi kích thước / vật liệu / góc mở cửa: 3D và giá cập nhật ngay (đo trên GPU thật: tính toán 1–2 ms, vẽ lại 3D 23–33 ms).
4. Bước 6: thêm 2 MCCB 4P 100A + 1 đồng hồ đa năng bằng 3 ô chọn → tự xếp chỗ hợp lệ; bật mũi tên để dịch;
   đặt trùng nhau → cảnh báo đỏ dưới bảng, chấm bước 6 đỏ, "Hoàn tất" bị khóa.
5. "Hoàn tất đơn" → trang Kết quả, thanh tiến độ chạy rồi tải được PDF tổng thể, ZIP DXF, BOM xlsx, báo giá PDF.
6. Điện thoại 375 px: cấu hình đủ 8 bước bằng bottom sheet.
7. "Chế độ nâng cao" mở đúng dự án đó trong giao diện cũ; sửa ở đó rồi quay lại wizard thấy thay đổi.

Đã chạy tự động (Playwright, desktop 1440 px + mobile 375 px) — đạt; 10 file DXF trong ZIP qua `ezdxf` audit 0 lỗi.

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
