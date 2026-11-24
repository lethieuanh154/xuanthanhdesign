import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectStore } from '../core/project.store';
import { ViewKind, ViewPref } from '../core/view-pref';
import { OrderList } from '../components/order-list';

/**
 * Trang đầu: chọn Wizard View (cấu hình từng bước, cho người bán hàng)
 * hoặc Detail View (giao diện đầy đủ, cho bộ phận Thiết kế).
 * Nếu đã tick "Ghi nhớ", lần sau mở thẳng giao diện đã chọn; vào lại trang này bằng /?chon=1.
 */
@Component({
  selector: 'app-home-page',
  imports: [OrderList],
  template: `
    <div class="home">
      <header>
        <div class="logo">
          <svg width="40" height="40" viewBox="0 0 30 30" aria-hidden="true">
            <rect x="3" y="2" width="24" height="26" rx="2" fill="#1E5AA8" />
            <rect x="6" y="5" width="18" height="20" rx="1" fill="none" stroke="#fff" stroke-width="1.4" />
            <path d="M16 8 L11 16 H15 L13 22 L19 13 H15 Z" fill="#FFD54F" />
          </svg>
          <div><b>XUÂN THÀNH</b><span>Tủ Điện Builder</span></div>
        </div>
      </header>

      <h1>Chọn giao diện làm việc</h1>
      <p class="sub">Hai giao diện dùng chung dữ liệu — có thể chuyển qua lại bất cứ lúc nào.</p>

      <div class="cards">
        <button class="card" (click)="open('wizard')">
          <svg viewBox="0 0 220 130" aria-hidden="true">
            <rect x="1" y="1" width="218" height="128" rx="8" fill="#c9ccd0" />
            <rect x="40" y="22" width="62" height="88" rx="2" fill="#e3e6e9" stroke="#8a939c" />
            <path d="M66 50 l9 -15 l9 15 z" fill="#F7C600" stroke="#111" stroke-width="1" />
            <rect x="93" y="62" width="3" height="16" fill="#3c4752" />
            <rect x="146" y="1" width="73" height="128" fill="#fff" />
            <rect x="154" y="12" width="44" height="6" rx="2" fill="#1E5AA8" />
            @for (i of [0, 1, 2, 3, 4, 5, 6, 7]; track i) {
              <rect [attr.x]="154 + i * 7" y="24" width="5" height="2" rx="1" [attr.fill]="i < 2 ? '#1E5AA8' : '#d6dce2'" />
            }
            <rect x="154" y="34" width="27" height="22" rx="3" fill="#eaf1fb" stroke="#1E5AA8" />
            <rect x="185" y="34" width="27" height="22" rx="3" fill="#fff" stroke="#d6dce2" />
            <rect x="154" y="60" width="27" height="22" rx="3" fill="#fff" stroke="#d6dce2" />
            <rect x="185" y="60" width="27" height="22" rx="3" fill="#fff" stroke="#d6dce2" />
            <rect x="154" y="110" width="58" height="11" rx="3" fill="#1E5AA8" />
          </svg>
          <h2>Wizard View</h2>
          <p>Cấu hình <b>từng bước</b> (8 bước), khung 3D lớn, giá cập nhật ngay. Dành cho <b>người bán hàng</b> — cấu hình xong 1 tủ trong vài phút.</p>
          <span class="go">Tạo cấu hình mới →</span>
        </button>

        <button class="card" (click)="open('detail')">
          <svg viewBox="0 0 220 130" aria-hidden="true">
            <rect x="1" y="1" width="218" height="128" rx="8" fill="#f2f4f7" />
            <rect x="1" y="1" width="218" height="12" rx="4" fill="#1f262e" />
            <rect x="1" y="13" width="48" height="96" fill="#fff" stroke="#d6dce2" />
            @for (i of [0, 1, 2, 3, 4]; track i) {
              <rect x="6" [attr.y]="20 + i * 17" width="38" height="13" rx="2" fill="#f5f7f9" stroke="#d6dce2" />
            }
            <rect x="52" y="16" width="118" height="92" fill="#fbfcfd" stroke="#d6dce2" />
            <rect x="85" y="28" width="52" height="70" fill="#dfe4e9" stroke="#3c4752" />
            <rect x="93" y="40" width="14" height="22" fill="#2f363d" stroke="#E53935" stroke-width="1.5" />
            <rect x="112" y="40" width="14" height="22" fill="#2f363d" />
            <rect x="173" y="16" width="45" height="92" fill="#fff" stroke="#d6dce2" />
            @for (i of [0, 1, 2, 3]; track i) {
              <rect x="178" [attr.y]="22 + i * 10" width="35" height="4" rx="2" fill="#d6dce2" />
            }
            <rect x="1" y="110" width="218" height="19" fill="#fff" stroke="#d6dce2" />
            <rect x="6" y="115" width="140" height="3" fill="#d6dce2" /><rect x="6" y="121" width="120" height="3" fill="#d6dce2" />
          </svg>
          <h2>Detail View</h2>
          <p>Giao diện <b>đầy đủ</b>: thư viện kéo thả, canvas có thước & lưới, trải phẳng, sắp tôn, kiểm tra, bảng chi tiết. Dành cho <b>bộ phận Thiết kế</b>.</p>
          <span class="go">Mở giao diện chi tiết →</span>
        </button>
      </div>

      <label class="check remember"><input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)" /> Ghi nhớ lựa chọn, lần sau mở thẳng giao diện này</label>

      <section class="recent">
        <h3>Đơn gần đây</h3>
        <app-order-list [limit]="10" />
      </section>
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: var(--bg); }
    .home { max-width: 980px; margin: 0 auto; padding: 28px 24px 48px; }
    .logo { display: flex; align-items: center; gap: 10px; line-height: 1.1; }
    .logo b { display: block; letter-spacing: .08em; color: var(--accent); font-size: 15px; }
    .logo span { font-size: 12px; color: var(--steel-500); }
    h1 { margin: 28px 0 4px; font-size: 26px; }
    .sub { margin: 0 0 20px; color: var(--steel-500); }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .card { display: flex; flex-direction: column; gap: 8px; text-align: left; background: #fff; border: 2px solid transparent; border-radius: 14px; padding: 16px 18px 18px; cursor: pointer; box-shadow: 0 1px 3px rgba(16,24,40,.1); transition: border-color .15s, box-shadow .15s, transform .15s; }
    .card:hover { border-color: var(--accent); box-shadow: 0 8px 24px rgba(30,90,168,.15); transform: translateY(-2px); }
    .card svg { width: 100%; height: auto; }
    .card h2 { margin: 6px 0 0; font-size: 20px; }
    .card p { margin: 0; color: var(--steel-700); line-height: 1.5; font-size: 13.5px; }
    .go { margin-top: 6px; color: var(--accent); font-weight: 600; }
    .remember { margin: 16px 0 0; color: var(--steel-700); }
    .recent { margin-top: 28px; background: #fff; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(16,24,40,.08); }
    .recent h3 { margin: 0 0 8px; font-size: 15px; }
    @media (max-width: 720px) { .cards { grid-template-columns: 1fr; } .home { padding: 18px 14px 32px; } }
  `,
})
export class HomePage implements OnInit {
  /** ?chon=1 → luôn hiện trang chọn (bỏ qua lựa chọn đã ghi nhớ). */
  readonly chon = input<string | undefined>(undefined);
  private readonly router = inject(Router);
  private readonly pref = inject(ViewPref);
  readonly store = inject(ProjectStore);
  readonly remember = signal(true);

  ngOnInit(): void {
    const saved = this.pref.get();
    // đã ghi nhớ → mở thẳng đơn gần nhất ở giao diện đó (không tạo đơn mới mỗi lần mở app)
    if (saved && !this.chon()) void this.router.navigate(ViewPref.path(saved, this.store.project()?.id ?? 'moi'), { replaceUrl: true });
  }

  open(v: ViewKind): void {
    this.pref.set(this.remember() ? v : null);
    void this.router.navigate(ViewPref.path(v, 'moi'));
  }
}
