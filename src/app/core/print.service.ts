import { effect, Injectable, signal } from '@angular/core';

const PAGE_CSS = {
  drawing: '@page { size: A3 landscape; margin: 8mm; }',
  quote: '@page { size: A4 portrait; margin: 12mm; }',
};

/** Chọn bố cục in: bản vẽ tổng thể (A3 ngang) hoặc báo giá cho khách (A4 dọc), rồi mở hộp thoại in → "Lưu thành PDF". */
@Injectable({ providedIn: 'root' })
export class PrintService {
  readonly mode = signal<'drawing' | 'quote'>('drawing');
  private readonly style = document.createElement('style');

  constructor() {
    this.style.id = 'print-page-size';
    document.head.appendChild(this.style);
    // khổ giấy đi theo chế độ in (ghi đè @page mặc định trong styles.scss)
    effect(() => (this.style.textContent = PAGE_CSS[this.mode()]));
  }

  print(mode: 'drawing' | 'quote'): void {
    this.mode.set(mode);
    // chờ Angular vẽ lại bố cục in trước khi mở hộp thoại
    setTimeout(() => window.print(), 80);
  }
}
