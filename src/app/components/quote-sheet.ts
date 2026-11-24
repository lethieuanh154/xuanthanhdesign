import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { vnd } from '../core/export.service';
import { describeProject } from '../core/describe';

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** Đọc 3 chữ số tiếng Việt. */
function read3(n: number, full: boolean): string {
  const tr = Math.floor(n / 100),
    ch = Math.floor((n % 100) / 10),
    dv = n % 10;
  const out: string[] = [];
  if (full || tr) out.push(`${DIGITS[tr]} trăm`);
  if (ch > 1) out.push(`${DIGITS[ch]} mươi`);
  else if (ch === 1) out.push('mười');
  else if ((full || tr) && dv) out.push('lẻ');
  if (dv) out.push(ch > 1 && dv === 1 ? 'mốt' : ch >= 1 && dv === 5 ? 'lăm' : DIGITS[dv]);
  return out.join(' ');
}

/** Số tiền bằng chữ (VNĐ). */
export function moneyInWords(v: number): string {
  let n = Math.round(v);
  if (n === 0) return 'Không đồng';
  const units = ['', ' nghìn', ' triệu', ' tỷ'];
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    words.push(read3(groups[i], i < groups.length - 1) + units[i % 4]);
  }
  const s = words.join(' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

/** Báo giá cho khách (in A4 dọc → Lưu thành PDF). */
@Component({
  selector: 'app-quote-sheet',
  template: `
    <div class="q">
      <header>
        <div class="logo">
          <svg width="46" height="46" viewBox="0 0 30 30"><rect x="3" y="2" width="24" height="26" rx="2" fill="#1E5AA8" /><rect x="6" y="5" width="18" height="20" rx="1" fill="none" stroke="#fff" stroke-width="1.4" /><path d="M16 8 L11 16 H15 L13 22 L19 13 H15 Z" fill="#FFD54F" /></svg>
          <div><b>CÔNG TY XUÂN THÀNH</b><br />Sản xuất tủ điện — Đà Nẵng<br /><span class="muted">Hotline: 0236 xxx xxx · xuanthanh.vn</span></div>
        </div>
        <div class="tt"><h1>BÁO GIÁ</h1><div>Số: <b>{{ p().orderCode }}</b></div><div>Ngày: {{ today }}</div></div>
      </header>

      <table class="info">
        <tr><td>Kính gửi:</td><td><b>{{ p().customer || '…………………………' }}</b></td></tr>
        <tr><td>Người liên hệ:</td><td>{{ p().contact || '' }} {{ p().phone ? '· ' + p().phone : '' }}</td></tr>
        <tr><td>Địa chỉ:</td><td>{{ addr() }}</td></tr>
      </table>

      <div class="desc">
        @if (p().thumbnail) {
          <img [src]="p().thumbnail" alt="" />
        }
        <p>Công ty Xuân Thành trân trọng gửi Quý khách báo giá tủ điện theo cấu hình:<br /><i>{{ desc() }}</i></p>
      </div>

      <table class="items">
        <thead><tr><th>STT</th><th>Hạng mục</th><th>ĐVT</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead>
        <tbody>
          @for (it of items(); track $index) {
            <tr [class.grp]="it.group">
              <td>{{ it.group ? it.stt : '' }}</td>
              <td>{{ it.name }}@if (it.spec) {<br /><small>{{ it.spec }}</small>}</td>
              <td>{{ it.unit }}</td>
              <td class="r">{{ it.qty }}</td>
              <td class="r">{{ it.price ? money(it.price) : '' }}</td>
              <td class="r">{{ money(it.amount) }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr><td colspan="5" class="r">Cộng tiền hàng</td><td class="r">{{ money(sub()) }}</td></tr>
          <tr><td colspan="5" class="r">Thuế GTGT {{ vatPct() }}%</td><td class="r">{{ money(vat()) }}</td></tr>
          <tr class="tot"><td colspan="5" class="r">TỔNG CỘNG</td><td class="r">{{ money(sub() + vat()) }}</td></tr>
        </tfoot>
      </table>
      <p class="words">Bằng chữ: <i>{{ words() }}</i></p>

      <h3>Điều khoản</h3>
      <ol class="terms">
        <li>Báo giá có hiệu lực 15 ngày kể từ ngày lập.</li>
        <li>Thanh toán: tạm ứng 50% khi ký hợp đồng, 50% còn lại khi giao hàng và nghiệm thu.</li>
        <li>Thời gian sản xuất: 10–15 ngày làm việc sau khi duyệt bản vẽ và nhận tạm ứng.</li>
        <li>Giao hàng tại công trình trong địa bàn {{ p().province || 'Đà Nẵng' }}. Chưa bao gồm lắp đặt, đấu nối tại công trình.</li>
        <li>Bảo hành vỏ tủ 12 tháng; thiết bị bảo hành theo chính sách của hãng.</li>
        <li>Thiết bị có thể thay bằng hãng tương đương nếu Quý khách đồng ý.</li>
      </ol>
      <div class="sign">
        <div>XÁC NHẬN CỦA KHÁCH HÀNG<br /><br /><br /><br /></div>
        <div>ĐẠI DIỆN CÔNG TY XUÂN THÀNH<br /><br /><br /><br />{{ p().drafter }}</div>
      </div>
    </div>
  `,
  styles: `
    .q { width: 186mm; font-family: var(--font); font-size: 10pt; color: #111; }
    header { display: flex; justify-content: space-between; border-bottom: 0.6mm solid #1E5AA8; padding-bottom: 3mm; }
    .logo { display: flex; gap: 3mm; align-items: center; line-height: 1.35; }
    .logo b { color: #1E5AA8; font-size: 13pt; }
    .tt { text-align: right; } .tt h1 { margin: 0; color: #1E5AA8; font-size: 22pt; letter-spacing: .1em; }
    .muted { color: #666; }
    .info { margin: 4mm 0 2mm; } .info td { padding: 0.6mm 3mm 0.6mm 0; vertical-align: top; } .info td:first-child { color: #555; }
    .desc { display: flex; gap: 4mm; align-items: center; margin-bottom: 3mm; }
    .desc img { width: 42mm; border-radius: 2mm; }
    .desc p { margin: 0; line-height: 1.45; }
    .items { width: 100%; border-collapse: collapse; }
    .items th { background: #1E5AA8; color: #fff; padding: 1.6mm 2mm; text-align: left; font-weight: 600; }
    .items td { padding: 1.4mm 2mm; border-bottom: 0.2mm solid #ccc; vertical-align: top; }
    .items tr.grp td { background: #eef3fa; font-weight: 600; }
    .items small { color: #666; }
    .items tfoot td { border: 0; padding: 1mm 2mm; }
    .items .tot td { font-weight: 700; font-size: 12pt; color: #1E5AA8; border-top: 0.4mm solid #1E5AA8; }
    .r { text-align: right; white-space: nowrap; }
    .words { margin: 2mm 0 4mm; }
    h3 { font-size: 11pt; margin: 3mm 0 1mm; }
    .terms { margin: 0; padding-left: 5mm; line-height: 1.5; }
    .sign { display: flex; justify-content: space-around; text-align: center; margin-top: 8mm; font-weight: 600; }
  `,
})
export class QuoteSheet {
  readonly store = inject(ProjectStore);
  readonly p = computed(() => this.store.project());
  readonly today = new Date().toLocaleDateString('vi-VN');
  readonly desc = computed(() => describeProject(this.p(), this.store.cat));
  readonly addr = computed(() => [this.p().address, this.p().province].filter((x) => !!x).join(', '));
  readonly vatPct = computed(() => Math.round((this.store.cat.pricing.vat ?? 0.1) * 100));

  /** Gom BOM thành hạng mục cho khách: Vỏ tủ (trọn gói), Thanh cái, Thiết bị. */
  readonly items = computed(() => {
    const bom = this.store.bom();
    const e = this.p().enclosure;
    const shellAmt = bom.rows.filter((r) => r.category === 'Tôn' || r.category === 'Gia công' || r.category === 'Phụ kiện').reduce((s, r) => s + r.amount, 0);
    const cu = bom.rows.filter((r) => r.category === 'Đồng').reduce((s, r) => s + r.amount, 0);
    const out: { group: boolean; stt: string; name: string; spec?: string; unit: string; qty: number | string; price: number; amount: number }[] = [];
    out.push({ group: true, stt: 'A', name: 'VỎ TỦ (trọn gói)', unit: 'bộ', qty: 1, price: shellAmt, amount: shellAmt, spec: `${e.H}×${e.W}×${e.D} mm, tôn ${e.thickness} mm, gồm gia công, sơn/hoàn thiện và phụ kiện vỏ` });
    if (cu) out.push({ group: true, stt: 'B', name: `HỆ THANH CÁI ĐỒNG ${this.p().busbar.ratedA} A`, unit: 'bộ', qty: 1, price: cu, amount: cu, spec: `${this.p().busbar.phases}, đồng ${this.p().busbar.w}×${this.p().busbar.t}` });
    const devRows = bom.rows.filter((r) => r.category === 'Thiết bị');
    const devAmt = devRows.reduce((s, r) => s + r.amount, 0);
    if (devRows.length) {
      out.push({ group: true, stt: cu ? 'C' : 'B', name: 'THIẾT BỊ ĐIỆN', unit: '', qty: '', price: 0, amount: devAmt });
      for (const r of devRows) out.push({ group: false, stt: '', name: r.name, spec: r.spec, unit: r.unit, qty: r.qty, price: r.unitPrice, amount: r.amount });
    }
    return out;
  });
  readonly sub = computed(() => this.store.bom().total);
  readonly vat = computed(() => Math.round(this.sub() * (this.store.cat.pricing.vat ?? 0.1)));
  readonly words = computed(() => moneyInWords(this.sub() + this.vat()));

  money(v: number): string {
    return vnd(v);
  }
}
