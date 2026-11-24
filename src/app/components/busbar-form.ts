import { Component, computed, inject } from '@angular/core';
import { Phases } from '../geometry';
import { ProjectStore } from '../core/project.store';
import { vnd } from '../core/export.service';

/** Bước ④: thanh cái & phụ kiện. */
@Component({
  selector: 'app-busbar-form',
  template: `
    <div class="field">
      <label>Dòng định mức thanh cái</label>
      <select class="input" [value]="b().ratedA" (change)="store.setBusbar({ ratedA: +$any($event.target).value })">
        @for (r of store.cat.busbars; track r.ratedA) {
          <option [value]="r.ratedA" [selected]="r.ratedA === b().ratedA">{{ r.ratedA }} A — gợi ý Cu {{ r.w }}×{{ r.t }}</option>
        }
      </select>
    </div>
    <div class="grid-2">
      <div class="field">
        <label>Rộng đồng</label>
        <div class="input-unit"><input class="input num" type="number" [value]="b().w" (change)="store.setBusbar({ w: +$any($event.target).value })" /><span>mm</span></div>
      </div>
      <div class="field">
        <label>Dày đồng</label>
        <div class="input-unit"><input class="input num" type="number" [value]="b().t" (change)="store.setBusbar({ t: +$any($event.target).value })" /><span>mm</span></div>
      </div>
    </div>
    <div class="field">
      <label>Số pha</label>
      <div class="seg">
        @for (ph of phases; track ph) {
          <button [class.on]="b().phases === ph" (click)="store.setBusbar({ phases: ph })">{{ ph }}</button>
        }
      </div>
    </div>
    <div class="grid-2">
      <div class="field">
        <label>Vị trí</label>
        <div class="seg">
          <button [class.on]="b().position === 'top'" (click)="store.setBusbar({ position: 'top' })">Trên</button>
          <button [class.on]="b().position === 'bottom'" (click)="store.setBusbar({ position: 'bottom' })">Dưới</button>
        </div>
      </div>
      <div class="field">
        <label>Dạng</label>
        <div class="seg">
          <button [class.on]="b().shape === 'straight'" (click)="store.setBusbar({ shape: 'straight' })">Thẳng</button>
          <button [class.on]="b().shape === 'Z'" (click)="store.setBusbar({ shape: 'Z' })">Uốn Z</button>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Hệ số đồng thời Ks (tính tổng tải)</label>
      <input class="input num" type="number" step="0.05" min="0.3" max="1" [value]="b().diversity" (change)="store.setBusbar({ diversity: +$any($event.target).value })" />
    </div>

    <div class="panel-sub">Phụ kiện <button class="btn ghost sm" (click)="resetAll()">↺ Tự tính lại</button></div>
    <table class="acc">
      @for (a of rows(); track a.def.id) {
        <tr>
          <td>
            {{ a.def.name }}<br /><span class="muted small">{{ a.def.spec }} · {{ price(a.def.price) }}/{{ a.def.unit }}</span>
          </td>
          <td class="q">
            <input class="input num" type="number" min="0" [step]="a.def.unit === 'm' ? 0.1 : 1" [value]="a.line.qty" (change)="store.setAccessoryQty(a.def.id, +$any($event.target).value)" />
          </td>
          <td class="u muted small">{{ a.def.unit }}@if (a.line.auto) {<br /><span class="auto" title="Tự tính theo kích thước tủ">tự</span>}</td>
        </tr>
      }
    </table>
  `,
  styles: `
    .panel-sub { display: flex; align-items: center; justify-content: space-between; font-weight: 700; margin: 12px 0 4px; }
    .acc { width: 100%; border-collapse: collapse; font-size: 12px; }
    .acc td { padding: 4px 0; border-bottom: 1px solid var(--steel-100); vertical-align: middle; }
    .acc .q { width: 74px; padding-left: 6px; } .acc .q .input { height: 26px; padding: 0 4px; text-align: right; }
    .acc .u { width: 32px; padding-left: 4px; }
    .auto { font-size: 10px; background: var(--accent-50); color: var(--accent); border-radius: 3px; padding: 0 3px; }
  `,
})
export class BusbarForm {
  readonly store = inject(ProjectStore);
  readonly b = computed(() => this.store.project().busbar);
  readonly phases: Phases[] = ['3P', '3P+N', '3P+N+PE'];
  readonly rows = computed(() =>
    this.store.cat.accessories.map((def) => ({ def, line: this.store.project().accessories.find((a) => a.id === def.id) ?? { id: def.id, qty: 0, auto: true } })),
  );

  resetAll(): void {
    for (const a of this.store.cat.accessories) this.store.setAccessoryQty(a.id, null);
  }

  price(v: number): string {
    return vnd(v);
  }
}
