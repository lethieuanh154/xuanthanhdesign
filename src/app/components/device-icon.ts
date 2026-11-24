import { Component, computed, input } from '@angular/core';
import { DeviceDef } from '../geometry';

/** Hình vẽ khối đơn giản của thiết bị (SVG tự vẽ, không dùng logo hãng). */
@Component({
  selector: 'app-device-icon',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" aria-hidden="true">
      @switch (kind()) {
        @case ('breaker') {
          <rect [attr.x]="32 - bw() / 2" y="6" [attr.width]="bw()" height="52" rx="3" [attr.fill]="def().type === 'ACB' ? '#3c4752' : '#2b3138'" />
          @for (i of poles(); track i) {
            <rect [attr.x]="32 - bw() / 2 + 3 + i * ((bw() - 6) / poles().length)" y="9" [attr.width]="(bw() - 6) / poles().length - 2" height="7" fill="#9aa5b1" />
            <rect [attr.x]="32 - bw() / 2 + 3 + i * ((bw() - 6) / poles().length)" y="48" [attr.width]="(bw() - 6) / poles().length - 2" height="7" fill="#9aa5b1" />
          }
          <rect [attr.x]="32 - bw() / 4" y="22" [attr.width]="bw() / 2" height="20" rx="2" fill="#11161b" />
          <rect x="29" y="25" width="6" height="11" rx="1" fill="#f5f7f9" />
        }
        @case ('meter') {
          <rect x="6" y="6" width="52" height="52" rx="3" fill="#2b3138" />
          <rect x="11" y="11" width="42" height="42" rx="2" fill="#f5f7f9" />
          @if (def().type === 'METER_MULTI' || def().type === 'PFR') {
            <rect x="15" y="17" width="34" height="16" rx="1" fill="#103b23" />
            <text x="32" y="29" text-anchor="middle" font-size="10" font-family="monospace" fill="#39ff14">{{ def().type === 'PFR' ? 'cosφ' : '230.4' }}</text>
            <circle cx="20" cy="44" r="3" fill="#6b7783" /><circle cx="32" cy="44" r="3" fill="#6b7783" /><circle cx="44" cy="44" r="3" fill="#6b7783" />
          } @else {
            <path d="M16 42 A18 18 0 0 1 48 42" fill="none" stroke="#2b3138" stroke-width="1.5" />
            <line x1="32" y1="44" x2="42" y2="26" stroke="#d32f2f" stroke-width="2" />
            <text x="32" y="52" text-anchor="middle" font-size="9" font-weight="700" fill="#2b3138">{{ def().type === 'METER_V' ? 'V' : 'A' }}</text>
          }
        }
        @case ('round') {
          <rect x="14" y="14" width="36" height="36" rx="4" fill="#3c4752" />
          <circle cx="32" cy="32" r="13" [attr.fill]="def().color || '#9aa5b1'" stroke="#11161b" stroke-width="2" />
          @if (def().type === 'PILOT_LAMP') {
            <circle cx="28" cy="28" r="4" fill="#fff" opacity=".55" />
          }
          @if (def().type === 'SELECTOR') {
            <rect x="29" y="19" width="6" height="26" rx="2" fill="#11161b" />
          }
        }
        @case ('ct') {
          <rect x="10" y="12" width="44" height="40" rx="6" fill="#3c4752" />
          <rect x="22" y="22" width="20" height="14" rx="2" fill="#fff" />
          <text x="32" y="48" text-anchor="middle" font-size="8" fill="#fff">CT</text>
        }
        @case ('cap') {
          <rect x="18" y="6" width="28" height="52" rx="5" fill="#8a96a3" />
          <rect x="22" y="2" width="20" height="6" fill="#3c4752" />
          <path d="M28 26 v12 M36 26 v12 M22 32 h6 M36 32 h6" stroke="#fff" stroke-width="2" />
        }
        @default {
          <rect x="14" y="8" width="36" height="48" rx="3" fill="#2b3138" />
          <rect x="18" y="12" width="28" height="10" fill="#9aa5b1" />
          <rect x="18" y="42" width="28" height="10" fill="#9aa5b1" />
          <rect x="24" y="27" width="16" height="10" rx="1" fill="#f5f7f9" />
        }
      }
    </svg>
  `,
  styles: `:host { display: inline-flex; }`,
})
export class DeviceIcon {
  readonly def = input.required<DeviceDef>();
  readonly size = input(48);

  readonly kind = computed(() => {
    const t = this.def().type;
    if (t === 'ACB' || t === 'MCCB' || t === 'MCB') return 'breaker';
    if (t === 'METER_V' || t === 'METER_A' || t === 'METER_MULTI' || t === 'PFR') return 'meter';
    if (t === 'PILOT_LAMP' || t === 'PUSH_BUTTON' || t === 'SELECTOR') return 'round';
    if (t === 'CT') return 'ct';
    if (t === 'CAPACITOR') return 'cap';
    return 'box';
  });
  readonly poles = computed(() => Array.from({ length: Math.max(1, this.def().poles ?? 3) }, (_, i) => i));
  /** Bề rộng khối tỉ lệ theo số cực. */
  readonly bw = computed(() => Math.min(52, 14 + (this.def().poles ?? 3) * 9));
}
