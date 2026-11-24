import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { BaseHeight, glandOpening } from '../../geometry';
import { WizardService } from '../wizard.service';
import { COMMON_SIZES, SIZE_LIMITS } from '../wizard-data';

type Dim = 'H' | 'W' | 'D';

/** Bước 2: kích thước. */
@Component({
  selector: 'app-step-size',
  template: `
    @for (d of dims; track d.k) {
      <label class="w-label">{{ d.label }}</label>
      <div class="num">
        <input class="input" type="number" step="50" [value]="e()[d.k]" (change)="set(d.k, +$any($event.target).value)" [attr.aria-label]="d.label" />
        <div class="spin">
          <button (click)="set(d.k, e()[d.k] + 50)" aria-label="Tăng 50">▲</button>
          <button (click)="set(d.k, e()[d.k] - 50)" aria-label="Giảm 50">▼</button>
        </div>
        <span class="unit">mm</span>
      </div>
      <div class="w-hint">Cho phép {{ lim[d.k][0] }} – {{ lim[d.k][1] }} mm</div>
    }

    <label class="w-label">Kích thước phổ biến <span class="muted">(Cao × Rộng × Sâu)</span></label>
    <div class="chips">
      @for (s of sizes; track $index) {
        <button class="chip-btn" [class.on]="s.H === e().H && s.W === e().W && s.D === e().D" (click)="store.setEnclosure({ H: s.H, W: s.W, D: s.D })">{{ s.H }}×{{ s.W }}×{{ s.D }}</button>
      }
    </div>

    @if (e().mounting === 'floor') {
      <label class="w-label">Số ngăn</label>
      <div class="seg">
        @for (n of [1, 2, 3, 4]; track n) {
          <button [class.on]="e().sections === n" (click)="store.setEnclosure({ sections: n })">{{ n }} ngăn</button>
        }
      </div>
      @if (e().sections > 1) {
        <div class="secs">
          @for (h of e().sectionHeights; track $index) {
            <label>Ngăn {{ $index + 1 }}<input class="input" type="number" step="50" [value]="h" (change)="store.setSectionHeight($index, +$any($event.target).value)" /></label>
          }
        </div>
      }
      <label class="w-label">Khung đế</label>
      <div class="seg">
        @for (b of bases; track b) {
          <button [class.on]="e().base === b" (click)="store.setEnclosure({ base: b })">{{ b ? 'Cao ' + b : 'Không' }}</button>
        }
      </div>
    }

    @if (e().mounting === 'wall') {
      <label class="w-label">Kiểu treo</label>
      <div class="seg">
        <button [class.on]="!e().brackets" (click)="store.setEnclosure({ brackets: false })">Lỗ treo trên hậu</button>
        <button [class.on]="!!e().brackets" (click)="store.setEnclosure({ brackets: true })">4 tai treo ngoài</button>
      </div>
    }
    <label class="w-label">Lỗ đi cáp ở đáy</label>
    <div class="seg">
      <button [class.on]="!gland()" (click)="store.setEnclosure({ cableEntry: 'knockout' })">Lỗ tròn knock-out</button>
      <button [class.on]="gland()" (click)="store.setEnclosure({ cableEntry: 'gland' })">Ô chữ nhật + tấm che</button>
    </div>

    @for (r of wz.issuesOf(2); track r.id) {
      <div class="w-warn" [class.warn]="r.level === 'warn'">⚠ {{ r.message }}</div>
      @if (r.rule === 'sheet' && store.project().sheetSize === '1250x2500') {
        <button class="btn sm" style="margin-top:4px" (click)="store.setMeta({ sheetSize: '1500x3000' })">Dùng khổ tôn 1500×3000</button>
      }
    }
  `,
  styles: `
    .num { display: flex; align-items: center; gap: 6px; }
    .num .input { height: 40px; font-size: 16px; font-weight: 600; width: 130px; }
    .spin { display: flex; flex-direction: column; gap: 2px; }
    .spin button { width: 26px; height: 19px; border: 1px solid var(--steel-300); background: #fff; border-radius: 4px; font-size: 9px; cursor: pointer; color: var(--steel-700); }
    .spin button:hover { background: var(--steel-50); }
    .unit { color: var(--steel-500); font-size: 13px; }
    .secs { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 6px; margin-top: 8px; }
    .secs label { font-size: 11.5px; color: var(--steel-500); display: flex; flex-direction: column; gap: 2px; }
  `,
})
export class StepSizeComponent {
  readonly store = inject(ProjectStore);
  readonly wz = inject(WizardService);
  readonly e = computed(() => this.store.project().enclosure);
  readonly lim = SIZE_LIMITS;
  readonly gland = computed(() => glandOpening(this.store.project()) !== null);
  readonly sizes = COMMON_SIZES;
  readonly bases: BaseHeight[] = [0, 100, 150];
  readonly dims: { k: Dim; label: string }[] = [
    { k: 'H', label: 'Cao (H)' },
    { k: 'W', label: 'Rộng (W)' },
    { k: 'D', label: 'Sâu (D)' },
  ];

  set(k: Dim, v: number): void {
    if (!isFinite(v)) return;
    const [lo, hi] = SIZE_LIMITS[k];
    this.store.setEnclosure({ [k]: Math.min(hi, Math.max(lo, Math.round(v))) });
  }
}
