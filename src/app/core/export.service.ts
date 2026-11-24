import { inject, Injectable } from '@angular/core';
import { bboxH, bboxW, BomRow, dxfFileName, MATERIAL_LABEL, Part, partsToCombinedDxf, partToDxf, r2, slug } from '../geometry';
import { ProjectStore } from './project.store';

export function saveBlob(data: BlobPart, filename: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const vnd = (v: number): string => new Intl.NumberFormat('vi-VN').format(Math.round(v)) + ' đ';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly store = inject(ProjectStore);

  downloadPartDxf(part: Part): void {
    saveBlob(partToDxf(part), dxfFileName(this.store.project().orderCode, part), 'application/dxf');
  }

  async downloadAllDxf(): Promise<void> {
    for (const p of this.store.parts()) {
      this.downloadPartDxf(p);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  downloadCombinedDxf(): void {
    const p = this.store.project();
    saveBlob(partsToCombinedDxf(this.store.parts(), p.orderCode), `${slug(p.orderCode)}_GOP_${this.store.parts().length}chitiet.dxf`, 'application/dxf');
  }

  private bomTable(): (string | number)[][] {
    const bom = this.store.bom();
    const head = ['STT', 'Nhóm', 'Mã', 'Tên', 'Quy cách', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền'];
    const rows = bom.rows.map((r: BomRow, i) => [i + 1, r.category, r.code, r.name, r.spec, r.unit, r.qty, r.unitPrice, r.amount]);
    return [head, ...rows, ['', '', '', 'TỔNG TẠM TÍNH (chưa VAT)', '', '', '', '', bom.total]];
  }

  private partsTable(): (string | number)[][] {
    const dens = this.store.cat.pricing.density;
    return [
      ['Mã', 'Tên chi tiết', 'Vật liệu', 'Dày (mm)', 'SL', 'Trải phẳng D (mm)', 'Trải phẳng R (mm)', 'Diện tích bao (m²)', 'Khối lượng (kg)', 'Số lỗ', 'Số đường chấn', 'File DXF'],
      ...this.store.parts().map((p) => {
        const w = bboxW(p.bbox),
          h = bboxH(p.bbox);
        const a = (w * h * p.qty) / 1e6;
        const kg = p.material === 'CU' ? w * h * p.thickness * p.qty * dens.copper * 1e-6 : a * p.thickness * dens.steel;
        return [p.code, p.name, MATERIAL_LABEL[p.material] ?? p.material, p.thickness, p.qty, r2(w), r2(h), r2(a), r2(kg), p.holes.length, p.bendLines.length, dxfFileName(this.store.project().orderCode, p)];
      }),
    ];
  }

  private headerRows(): string[][] {
    const p = this.store.project();
    return [
      ['CÔNG TY XUÂN THÀNH — BẢNG KÊ VẬT TƯ (BOM)'],
      [`Dự án: ${p.name}`, `Khách hàng: ${p.customer}`, `Mã đơn: ${p.orderCode}`],
      [`Kích thước: ${p.enclosure.H}×${p.enclosure.W}×${p.enclosure.D} mm`, `Tôn: ${MATERIAL_LABEL[p.enclosure.material]} ${p.enclosure.thickness} mm`, `Ngày: ${new Date().toLocaleDateString('vi-VN')}`],
      [],
    ];
  }

  downloadBomCsv(): void {
    const esc = (v: string | number): string => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [...this.headerRows(), ...this.bomTable(), [], ['DANH SÁCH CHI TIẾT'], ...this.partsTable()].map((r) => r.map(esc).join(','));
    // BOM UTF-8 để Excel đọc đúng tiếng Việt
    saveBlob('﻿' + lines.join('\r\n'), `${slug(this.store.project().orderCode)}_BOM.csv`, 'text/csv;charset=utf-8');
  }

  async downloadBomXlsx(): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const bomAoa = [...this.headerRows(), ...this.bomTable()];
    const ws = XLSX.utils.aoa_to_sheet(bomAoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 18 }, { wch: 42 }, { wch: 26 }, { wch: 6 }, { wch: 9 }, { wch: 13 }, { wch: 15 }];
    // định dạng số tiền
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let R = 5; R <= range.e.r; R++) {
      for (const C of [7, 8]) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && typeof cell.v === 'number') cell.z = '#,##0';
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    const ws2 = XLSX.utils.aoa_to_sheet(this.partsTable());
    ws2['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 24 }, { wch: 8 }, { wch: 5 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 7 }, { wch: 10 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Chi tiết');
    const bom = this.store.bom();
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['Vật liệu', 'Dày (mm)', 'Diện tích (m²)', 'Khối lượng (kg)'],
      ...bom.sheets.map((s) => [MATERIAL_LABEL[s.material] ?? s.material, s.thickness, s.areaM2, s.kg]),
      ['Đồng thanh cái', '', '', bom.copperKg],
      [],
      ['Ghi chú: kg tôn = m² × dày × 7.85; diện tích lấy theo hình bao trải phẳng. Số liệu demo.'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Tôn & đồng');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    saveBlob(out, `${slug(this.store.project().orderCode)}_BOM.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  print(): void {
    window.print();
  }
}
