import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { Phases, suggestAccessoryQty, suggestBusbar } from '../../geometry';
import { vnd } from '../../core/export.service';
import { WizardService } from '../wizard.service';
import { OPTIONAL_ACCESSORIES } from '../wizard-data';

/** Bước 7: thanh cái & phụ kiện. */
@Component({
  selector: 'app-step-busbar',
  template: `
    <label class="w-label">Dòng định mức thanh cái</label>
    <select class="input sel" (change)="store.setBusbar({ ratedA: +$any($event.target).value })">
      @for (r of store.cat.busbars; track r.ratedA) {
        <option [value]="r.ratedA" [selected]="r.ratedA === b().ratedA">{{ r.ratedA }} A — đồng {{ r.w }}×{{ r.t }} mm</option>
      }
    </select>
    @if (suggest(); as s) {
      @if (s.ratedA !== b().ratedA) {
        <div class="sug">
          Gợi ý theo tải: <b>{{ s.ratedA }} A</b> <span class="muted">({{ s.reason }})</span>
          <button class="btn sm" (click)="store.setBusbar({ ratedA: s.ratedA })">Áp dụng</button>
        </div>
      } @else {
        <p class="w-note">✓ Đúng gợi ý theo tải ({{ s.reason }}).</p>
      }
    }

    <label class="w-label">Số pha</label>
    <div class="seg">
      @for (ph of phases; track ph) {
        <button [class.on]="b().phases === ph" (click)="store.setBusbar({ phases: ph })">{{ ph }}</button>
      }
    </div>
    <label class="w-label">Vị trí thanh cái</label>
    <div class="seg">
      <button [class.on]="b().position === 'top'" (click)="store.setBusbar({ position: 'top' })">Phía trên</button>
      <button [class.on]="b().position === 'bottom'" (click)="store.setBusbar({ position: 'bottom' })">Phía dưới</button>
    </div>
    @for (r of wz.issuesOf(7); track r.id) {
      <div class="w-warn" [class.warn]="r.level === 'warn'">⚠ {{ r.message }}</div>
    }

    <label class="w-label">Phụ kiện</label>
    <div class="acc">
      @for (a of optional(); track a.def.id) {
        <label class="arow">
          <input type="checkbox" [checked]="a.qty > 0" (change)="toggle(a.def.id, $any($event.target).checked)" />
          <span class="nm">{{ a.def.name }}<br /><small class="muted">{{ a.def.spec }}</small></span>
          <span class="pr">{{ a.qty > 0 ? a.qty + ' ' + a.def.unit + ' · ' : '' }}{{ money(a.def.price) }}/{{ a.def.unit }}</span>
        </label>
      }
    </div>
    @if (autoList().length) {
      <p class="w-note">Tự động theo cấu hình: {{ autoList() }}</p>
    }
  `,
  styles: `
    .sel { height: 38px; }
    .sug { margin-top: 6px; font-size: 12.5px; background: #fff8e1; border-radius: 8px; padding: 6px 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .acc { display: flex; flex-direction: column; border: 1px solid var(--steel-200); border-radius: 10px; overflow: hidden; }
    .arow { display: grid; grid-template-columns: 20px 1fr auto; gap: 8px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--steel-100); cursor: pointer; font-size: 13px; }
    .arow:last-child { border-bottom: 0; }
    .arow:hover { background: var(--steel-50); }
    .pr { font-size: 12px; color: var(--steel-700); white-space: nowrap; }
  `,
})
export class StepBusbarComponent {
  readonly store = inject(ProjectStore);
  readonly wz = inject(WizardService);
  readonly b = computed(() => this.store.project().busbar);
  readonly phases: Phases[] = ['3P', '3P+N', '3P+N+PE'];

  /** Gợi ý thanh cái: bậc nhỏ nhất ≥ max(aptomat tổng, tổng tải × Ks). */
  readonly suggest = computed(() => {
    const p = this.store.project();
    const br = p.devices
      .map((d) => this.store.defOf(d.deviceId))
      .filter((d) => d?.isBreaker && d.ratedCurrent)
      .map((d) => d!.ratedCurrent!)
      .sort((a, c) => c - a);
    if (!br.length) return null;
    const mains = p.cabinetType === 'ATS' ? br.slice(0, 2) : br.slice(0, 1);
    const mainA = Math.max(...mains);
    const load = Math.round(br.slice(mains.length).reduce((s, v) => s + v, 0) * (p.busbar.diversity || 1));
    const need = Math.max(mainA, load);
    const s = suggestBusbar(this.store.cat, need);
    return { ratedA: s.ratedA, reason: `aptomat tổng ${mainA} A, tải ${load} A` };
  });

  readonly optional = computed(() =>
    OPTIONAL_ACCESSORIES.map((id) => this.store.cat.accessories.find((a) => a.id === id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map((def) => ({ def, qty: this.store.project().accessories.find((l) => l.id === def.id)?.qty ?? 0 })),
  );

  readonly autoList = computed(() =>
    this.store
      .project()
      .accessories.filter((l) => !OPTIONAL_ACCESSORIES.includes(l.id) && l.qty > 0)
      .map((l) => {
        const d = this.store.cat.accessories.find((a) => a.id === l.id);
        return d ? `${d.name} ${l.qty} ${d.unit}` : '';
      })
      .filter(Boolean)
      .join(' · '),
  );

  toggle(id: string, on: boolean): void {
    if (!on) return this.store.setAccessoryQty(id, 0);
    const def = this.store.cat.accessories.find((a) => a.id === id)!;
    const sug = suggestAccessoryQty(this.store.project(), def, this.store.cat);
    if (sug > 0) this.store.setAccessoryQty(id, null);
    else this.store.setAccessoryQty(id, 1);
  }

  money(v: number): string {
    return vnd(v);
  }
}
