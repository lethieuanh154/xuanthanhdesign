import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { ipCode, needsGasket, VentType } from '../../geometry';
import { IP_DUST, IP_WATER } from '../wizard-data';

/** Bước 4: cấp bảo vệ IP & thông gió. */
@Component({
  selector: 'app-step-protection',
  template: `
    <div class="ip">
      <div class="code">{{ ip() }}</div>
      <div class="muted small">Cấp bảo vệ tổng hợp (IEC 60529)</div>
    </div>
    <label class="w-label">Chống bụi (chữ số thứ nhất)</label>
    <select class="input sel" (change)="store.setEnclosure({ ipDust: +$any($event.target).value })">
      @for (o of dust; track o.v) {
        <option [value]="o.v" [selected]="(e().ipDust ?? 4) === o.v">{{ o.label }}</option>
      }
    </select>
    <label class="w-label">Chống nước (chữ số thứ hai)</label>
    <select class="input sel" (change)="store.setEnclosure({ ipWater: +$any($event.target).value })">
      @for (o of water; track o.v) {
        <option [value]="o.v" [selected]="(e().ipWater ?? 3) === o.v">{{ o.label }}</option>
      }
    </select>
    @if (gasket()) {
      <p class="w-note">✓ Đã tự động thêm ron cửa ({{ ronQty() }} m).</p>
    }

    <label class="w-label">Thông gió</label>
    <div class="choices">
      @for (v of vents; track v.v) {
        <button class="choice" [class.on]="e().vent === v.v" (click)="store.setEnclosure({ vent: v.v })">
          <svg viewBox="0 0 80 64" width="80" height="64" aria-hidden="true">
            <rect x="14" y="4" width="52" height="56" rx="2" fill="#dfe3e7" stroke="#6b7783" stroke-width="1.5" />
            @if (v.v === 'bottom' || v.v === 'top_bottom') {
              @for (i of [0, 1, 2, 3]; track i) {
                <rect x="26" [attr.y]="40 + i * 4" width="28" height="2" rx="1" fill="#3c4752" />
              }
            }
            @if (v.v === 'top_bottom') {
              @for (i of [0, 1, 2, 3]; track i) {
                <rect x="26" [attr.y]="10 + i * 4" width="28" height="2" rx="1" fill="#3c4752" />
              }
            }
            @if (v.v === 'fan') {
              <circle cx="40" cy="44" r="11" fill="#3c4752" />
              <path d="M40 44 L40 35 A9 9 0 0 1 47 40 Z M40 44 L48 48 A9 9 0 0 1 40 53 Z M40 44 L32 48 A9 9 0 0 1 33 37 Z" fill="#cfd6dd" />
              @for (i of [0, 1, 2]; track i) {
                <rect x="28" [attr.y]="10 + i * 4" width="24" height="2" rx="1" fill="#3c4752" />
              }
            }
            @if (v.v === 'side_vertical') {
              @for (i of [0, 1, 2]; track i) {
                <rect [attr.x]="44 + i * 6" y="34" width="3" height="20" rx="1.5" fill="#3c4752" />
              }
            }
            @if (v.v === 'none') {
              <path d="M30 26 L50 42 M50 26 L30 42" stroke="#9aa5b1" stroke-width="2" />
            }
          </svg>
          {{ v.l }}
        </button>
      }
    </div>
    @if (gasket() && (e().vent === 'bottom' || e().vent === 'top_bottom')) {
      <div class="w-warn warn">⚠ Khe thông gió hở làm giảm cấp IP. Với {{ ip() }} nên chọn "Quạt hút" (có tấm lọc).</div>
    }
  `,
  styles: `
    .ip { display: flex; align-items: baseline; gap: 10px; background: var(--accent-50); border-radius: 10px; padding: 10px 14px; margin-bottom: 6px; }
    .code { font-size: 30px; font-weight: 700; color: var(--accent); letter-spacing: .02em; }
    .sel { height: 38px; }
  `,
})
export class StepProtectionComponent {
  readonly store = inject(ProjectStore);
  readonly e = computed(() => this.store.project().enclosure);
  readonly ip = computed(() => ipCode(this.e()));
  readonly gasket = computed(() => needsGasket(this.e()));
  readonly ronQty = computed(() => this.store.project().accessories.find((a) => a.id === 'ron')?.qty ?? 0);
  readonly dust = IP_DUST;
  readonly water = IP_WATER;
  readonly vents: { v: VentType; l: string }[] = [
    { v: 'none', l: 'Không' },
    { v: 'bottom', l: 'Hông dưới' },
    { v: 'top_bottom', l: 'Hông trên + dưới' },
    { v: 'fan', l: 'Quạt hút' },
    { v: 'side_vertical', l: 'Khe đứng 2 hông' },
  ];
}
