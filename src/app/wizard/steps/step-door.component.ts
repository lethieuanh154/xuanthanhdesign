import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { DoorType, LockType } from '../../geometry';

/** Bước 5: cửa & khóa (khung 3D tự mở cửa 90°). */
@Component({
  selector: 'app-step-door',
  template: `
    <label class="w-label">Số cánh</label>
    <div class="choices">
      @for (d of doors; track d.v) {
        <button class="choice" [class.on]="e().doorType === d.v" (click)="store.setEnclosure({ doorType: d.v })">
          <svg viewBox="0 0 60 70" width="54" height="64" aria-hidden="true">
            <rect x="6" y="4" width="48" height="62" rx="2" fill="#dfe3e7" stroke="#3c4752" stroke-width="1.5" />
            @if (d.v === 'double') {
              <line x1="30" y1="4" x2="30" y2="66" stroke="#3c4752" stroke-width="1.5" />
              <rect x="25" y="30" width="2.5" height="10" fill="#3c4752" /><rect x="32.5" y="30" width="2.5" height="10" fill="#3c4752" />
            } @else {
              <rect x="45" y="29" width="3" height="12" rx="1" fill="#3c4752" />
            }
            @if (d.v === 'two_layer') {
              <rect x="10" y="10" width="40" height="50" fill="#f2f4f6" stroke="#8a6d00" stroke-width="1.2" stroke-dasharray="2 2" />
              <rect x="15" y="16" width="10" height="16" fill="#3c4752" /><rect x="29" y="16" width="16" height="16" fill="#3c4752" /><rect x="15" y="38" width="30" height="8" fill="#3c4752" />
            }
            @if (d.v === 'inner_outer') {
              <rect x="12" y="10" width="34" height="50" fill="none" stroke="#1E5AA8" stroke-width="1.5" stroke-dasharray="3 2" />
            }
          </svg>
          <span>{{ d.l }}</span>
        </button>
      }
    </div>

    <label class="w-label">Chiều mở (vị trí bản lề)</label>
    <div class="seg">
      <button [class.on]="(e().hinge ?? 'left') === 'left'" [disabled]="e().doorType === 'double'" (click)="store.setEnclosure({ hinge: 'left' })">⟲ Bản lề trái</button>
      <button [class.on]="e().hinge === 'right'" [disabled]="e().doorType === 'double'" (click)="store.setEnclosure({ hinge: 'right' })">Bản lề phải ⟳</button>
    </div>
    @if (e().doorType === 'two_layer') {
      <p class="w-note">Tủ 2 lớp: đồng hồ, đèn, relay gắn trên cửa ngoài; cửa trong (bản lề cùng phía) khoét ô lộ cần gạt aptomat, tự sinh theo thiết bị ở bước 6.</p>
    }
    @if (e().doorType === 'double') {
      <p class="w-note">Cửa 2 cánh: bản lề hai bên, khóa ở cánh phải, cánh trái có chốt.</p>
    }

    <label class="w-label">Kiểu khóa</label>
    <div class="choices three">
      @for (l of locks; track l.v) {
        <button class="choice lock" [class.on]="(e().lock ?? 'handle') === l.v" (click)="store.setEnclosure({ lock: l.v })">
          <svg viewBox="0 0 60 80" width="56" height="74" aria-hidden="true">
            @switch (l.v) {
              @case ('handle') {
                <rect x="20" y="6" width="20" height="68" rx="5" fill="#3c4752" />
                <rect x="25" y="14" width="10" height="44" rx="3" fill="#9aa5b1" />
                <circle cx="30" cy="65" r="3" fill="#cfd6dd" />
              }
              @case ('square') {
                <circle cx="30" cy="40" r="17" fill="#3c4752" />
                <rect x="24" y="34" width="12" height="12" fill="#cfd6dd" />
              }
              @case ('key') {
                <circle cx="30" cy="40" r="17" fill="#3c4752" />
                <circle cx="30" cy="36" r="4" fill="#cfd6dd" /><rect x="28" y="38" width="4" height="10" fill="#cfd6dd" />
              }
            }
          </svg>
          <span>{{ l.l }}</span>
          <small>{{ l.d }}</small>
        </button>
      }
    </div>
  `,
  styles: `
    .lock { padding-top: 12px; }
    .seg button:disabled { opacity: .4; cursor: not-allowed; }
  `,
})
export class StepDoorComponent {
  readonly store = inject(ProjectStore);
  readonly e = computed(() => this.store.project().enclosure);
  readonly doors: { v: DoorType; l: string }[] = [
    { v: 'single', l: '1 cánh' },
    { v: 'double', l: '2 cánh' },
    { v: 'inner_outer', l: 'Trong + ngoài' },
    { v: 'two_layer', l: '2 lớp (cửa trong khoét ô)' },
  ];
  readonly locks: { v: LockType; l: string; d: string }[] = [
    { v: 'handle', l: 'Tay nắm', d: 'MS480' },
    { v: 'square', l: 'Khóa vuông', d: 'Quay ¼' },
    { v: 'key', l: 'Có chìa', d: '2 chìa' },
  ];
}
