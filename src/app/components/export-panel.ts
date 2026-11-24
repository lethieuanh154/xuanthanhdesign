import { Component, computed, inject, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { ExportService, vnd } from '../core/export.service';
import { bboxH, bboxW, dxfFileName, r2 } from '../geometry';

/** Bước ⑤: checklist xuất file. */
@Component({
  selector: 'app-export-panel',
  template: `
    <div class="ep">
      <h2>⑤ Xuất hồ sơ sản xuất</h2>
      <p class="muted">Đơn <b class="mono">{{ p().orderCode }}</b> · {{ p().name }} · {{ p().customer }}</p>
      @if (store.errorCount()) {
        <div class="banner err">✗ Còn <b>{{ store.errorCount() }} lỗi</b> trong bộ kiểm tra. Vẫn xuất được để xem thử, nhưng chưa nên đưa vào sản xuất.</div>
      } @else {
        <div class="banner ok">✓ Không có lỗi. {{ store.warnCount() ? store.warnCount() + ' cảnh báo cần xem lại.' : 'Sẵn sàng xuất.' }}</div>
      }

      <div class="item">
        <div class="chk" [class.done]="done().has('dxf')">✓</div>
        <div class="body">
          <b>DXF từng chi tiết</b>
          <span class="muted small">R12 ASCII · mm · gốc (0,0) góc dưới trái · layer CUT/BEND_UP/BEND_DOWN/MARK/TEXT · tên file: MaDon_MaChiTiet_Ten_DoDay_SL.dxf</span>
          <div class="files">
            @for (pt of store.parts(); track pt.id) {
              <button class="file" (click)="ex.downloadPartDxf(pt); mark('dxf')">
                <span class="mono">{{ fname(pt) }}</span>
                <span class="muted small">{{ w(pt) }}×{{ h(pt) }}</span>
              </button>
            }
          </div>
        </div>
        <button class="btn primary" (click)="ex.downloadAllDxf(); mark('dxf')">⬇ Tải tất cả ({{ store.parts().length }})</button>
      </div>

      <div class="item">
        <div class="chk" [class.done]="done().has('gop')">✓</div>
        <div class="body">
          <b>DXF gộp</b>
          <span class="muted small">Tất cả chi tiết xếp rời nhau, có nhãn tên (layer TEXT) — dùng để kiểm tra nhanh hoặc nạp vào phần mềm sắp mẫu.</span>
        </div>
        <button class="btn primary" (click)="ex.downloadCombinedDxf(); mark('gop')">⬇ DXF gộp</button>
      </div>

      <div class="item">
        <div class="chk" [class.done]="done().has('bom')">✓</div>
        <div class="body">
          <b>BOM — bảng kê vật tư</b>
          <span class="muted small">{{ store.bom().rows.length }} dòng: thiết bị, tôn (m², kg = m² × dày × 7.85), đồng, gia công, phụ kiện · Tổng {{ money(store.bom().total) }}</span>
        </div>
        <div class="row">
          <button class="btn" (click)="ex.downloadBomCsv(); mark('bom')">⬇ CSV</button>
          <button class="btn primary" (click)="ex.downloadBomXlsx(); mark('bom')">⬇ XLSX</button>
        </div>
      </div>

      <div class="item">
        <div class="chk" [class.done]="done().has('pdf')">✓</div>
        <div class="body">
          <b>Bản vẽ tổng thể (PDF)</b>
          <span class="muted small">Khổ A3 ngang, khung tên: công ty, khách hàng, mã đơn, ngày, người vẽ, tỉ lệ. Trang 2: BOM & danh sách chi tiết. Chọn "Lưu thành PDF" trong hộp thoại in.</span>
        </div>
        <button class="btn primary" (click)="ex.print(); mark('pdf')">🖨 In / PDF</button>
      </div>

      <h3>Xem trước BOM</h3>
      <table class="bom">
        <thead><tr><th>Nhóm</th><th>Mã</th><th>Tên</th><th>Quy cách</th><th class="r">SL</th><th>ĐVT</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead>
        <tbody>
          @for (r of store.bom().rows; track $index) {
            <tr><td>{{ r.category }}</td><td class="mono">{{ r.code }}</td><td>{{ r.name }}</td><td class="muted">{{ r.spec }}</td><td class="r num">{{ r.qty }}</td><td>{{ r.unit }}</td><td class="r num">{{ money(r.unitPrice) }}</td><td class="r num">{{ money(r.amount) }}</td></tr>
          }
        </tbody>
        <tfoot><tr><td colspan="7" class="r"><b>Tổng tạm tính (chưa VAT)</b></td><td class="r num"><b>{{ money(store.bom().total) }}</b></td></tr></tfoot>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; background: var(--bg); }
    .ep { max-width: 980px; margin: 0 auto; padding: 18px 20px 40px; }
    h2 { margin: 0 0 4px; } h3 { margin: 24px 0 8px; }
    .banner { padding: 9px 12px; border-radius: 6px; margin: 10px 0 14px; }
    .banner.err { background: #fdecea; color: var(--err); } .banner.ok { background: #e8f5e9; color: var(--ok); }
    .item { display: flex; gap: 12px; align-items: flex-start; background: #fff; border: 1px solid var(--steel-200); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
    .chk { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--steel-300); color: transparent; display: grid; place-items: center; font-weight: 700; flex: none; }
    .chk.done { background: var(--ok); border-color: var(--ok); color: #fff; }
    .body { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .files { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .file { display: flex; gap: 8px; align-items: center; border: 1px solid var(--steel-200); background: var(--steel-50); border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 11.5px; }
    .file:hover { border-color: var(--accent); }
    .bom { width: 100%; border-collapse: collapse; background: #fff; font-size: 12px; border: 1px solid var(--steel-200); }
    .bom th, .bom td { padding: 5px 8px; border-bottom: 1px solid var(--steel-100); text-align: left; }
    .bom th { background: var(--steel-50); color: var(--steel-500); }
    .r { text-align: right !important; }
  `,
})
export class ExportPanel {
  readonly store = inject(ProjectStore);
  readonly ex = inject(ExportService);
  readonly p = computed(() => this.store.project());
  readonly done = signal(new Set<string>());

  mark(k: string): void {
    this.done.update((s) => new Set([...s, k]));
  }
  fname(pt: Parameters<typeof dxfFileName>[1]): string {
    return dxfFileName(this.p().orderCode, pt);
  }
  w(pt: { bbox: Parameters<typeof bboxW>[0] }): number {
    return r2(bboxW(pt.bbox));
  }
  h(pt: { bbox: Parameters<typeof bboxH>[0] }): number {
    return r2(bboxH(pt.bbox));
  }
  money(v: number): string {
    return vnd(v);
  }
}
