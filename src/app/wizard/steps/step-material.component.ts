import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { Material } from '../../geometry';
import { RAL_COLORS, ralHex } from '../../three/ral';

/** Bước 3: vật liệu & sơn — mô hình 3D đổi chất liệu ngay. */
@Component({
  selector: 'app-step-material',
  template: `
    <label class="w-label">Vật liệu</label>
    <div class="choices">
      @for (m of mats; track m.v) {
        <button class="choice" [class.on]="e().material === m.v" (click)="store.setEnclosure({ material: m.v })">
          <span class="sw" [style.background]="swatch(m.v)"></span>
          {{ m.l }}
          <small>{{ m.d }}</small>
        </button>
      }
    </div>

    <label class="w-label">Độ dày tôn</label>
    <select class="input sel" [value]="e().thickness" (change)="store.setEnclosure({ thickness: +$any($event.target).value })">
      @for (t of [1.2, 1.5, 2.0]; track t) {
        <option [value]="t" [selected]="e().thickness === t">{{ t.toFixed(1) }} mm</option>
      }
    </select>

    <label class="w-label">Màu sơn</label>
    @if (e().material === 'SPCC') {
      <div class="rals">
        @for (r of rals; track r.code) {
          <button class="ral" [class.on]="(e().ral ?? '7035') === r.code" (click)="store.setEnclosure({ ral: r.code })" [title]="'RAL ' + r.code + ' — ' + r.name">
            <span class="dot" [style.background]="r.hex"></span>
            <span><b>RAL {{ r.code }}</b><br /><small>{{ r.name }}</small></span>
          </button>
        }
      </div>
    } @else {
      <p class="w-note">{{ e().material === 'GALV' ? 'Tôn mạ kẽm để nguyên bề mặt, không sơn.' : 'Inox để nguyên bề mặt xước (hairline), không sơn.' }}</p>
    }
  `,
  styles: `
    .sw { width: 100%; height: 54px; border-radius: 6px; border: 1px solid rgba(0,0,0,.08); }
    .sel { height: 38px; }
    .rals { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .ral { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1.5px solid var(--steel-200); border-radius: 8px; background: #fff; cursor: pointer; text-align: left; font-size: 12px; }
    .ral.on { border: 2px solid var(--accent); padding: 5.5px 7.5px; }
    .ral small { color: var(--steel-500); }
    .dot { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); flex: none; }
  `,
})
export class StepMaterialComponent {
  readonly store = inject(ProjectStore);
  readonly e = computed(() => this.store.project().enclosure);
  readonly rals = RAL_COLORS;
  readonly mats: { v: Material; l: string; d: string }[] = [
    { v: 'SPCC', l: 'Thép sơn tĩnh điện', d: 'Phổ biến, trong nhà' },
    { v: 'GALV', l: 'Tôn mạ kẽm', d: 'Chống gỉ, giá tốt' },
    { v: 'INOX304', l: 'Inox 304', d: 'Ngoài trời, ven biển' },
    { v: 'INOX201', l: 'Inox 201', d: 'Inox giá rẻ, trong nhà' },
  ];

  swatch(m: Material): string {
    switch (m) {
      case 'SPCC':
        return ralHex(this.e().ral);
      case 'GALV':
        return 'linear-gradient(135deg,#c5cacf 0%,#e4e7ea 22%,#b4bac0 40%,#dfe3e6 62%,#bcc2c7 80%,#e8ebee 100%)';
      case 'INOX304':
        return 'repeating-linear-gradient(90deg,#d9dcdf 0 2px,#c9cdd1 2px 3px,#e6e8ea 3px 5px)';
      default:
        return 'repeating-linear-gradient(90deg,#d3d1ca 0 2px,#c4c2ba 2px 3px,#dfddd6 3px 5px)';
    }
  }
}
