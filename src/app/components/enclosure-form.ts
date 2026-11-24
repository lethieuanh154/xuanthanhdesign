import { Component, computed, inject } from '@angular/core';
import { BaseHeight, DoorType, EnclosureConfig, Material, Mounting, VentType } from '../geometry';
import { ProjectStore } from '../core/project.store';

/** Bước ②: vỏ & kích thước — preview cập nhật ngay. */
@Component({
  selector: 'app-enclosure-form',
  template: `
    <div class="grid-3">
      <div class="field">
        <label>Cao H</label>
        <div class="input-unit"><input class="input num" type="number" step="10" min="300" max="2600" [value]="e().H" (change)="num('H', $event)" /><span>mm</span></div>
      </div>
      <div class="field">
        <label>Rộng W</label>
        <div class="input-unit"><input class="input num" type="number" step="10" min="200" max="1600" [value]="e().W" (change)="num('W', $event)" /><span>mm</span></div>
      </div>
      <div class="field">
        <label>Sâu D</label>
        <div class="input-unit"><input class="input num" type="number" step="10" min="120" max="1000" [value]="e().D" (change)="num('D', $event)" /><span>mm</span></div>
      </div>
    </div>

    <div class="field">
      <label>Số ngăn · chiều cao từng ngăn (trên → dưới)</label>
      <div class="row">
        <div class="seg" style="flex:none">
          @for (n of [1, 2, 3, 4]; track n) {
            <button [class.on]="e().sections === n" (click)="set({ sections: n })">{{ n }}</button>
          }
        </div>
        <div class="secs">
          @for (h of e().sectionHeights; track $index) {
            <input class="input num" type="number" step="10" [value]="h" (change)="store.setSectionHeight($index, +$any($event.target).value)" [title]="'Ngăn ' + ($index + 1)" />
          }
        </div>
      </div>
    </div>

    <div class="field">
      <label>Độ dày tôn</label>
      <div class="seg">
        @for (t of [1.2, 1.5, 2.0]; track t) {
          <button [class.on]="e().thickness === t" (click)="set({ thickness: t })">{{ t.toFixed(1) }} mm</button>
        }
      </div>
    </div>
    <div class="field">
      <label>Vật liệu</label>
      <div class="seg">
        @for (m of materials; track m.v) {
          <button [class.on]="e().material === m.v" (click)="set({ material: m.v })">{{ m.l }}</button>
        }
      </div>
    </div>
    <div class="field">
      <label>Kiểu cửa</label>
      <div class="seg">
        @for (d of doors; track d.v) {
          <button [class.on]="e().doorType === d.v" (click)="set({ doorType: d.v })">{{ d.l }}</button>
        }
      </div>
    </div>
    <div class="field">
      <label>Khe thông gió</label>
      <div class="seg">
        @for (v of vents; track v.v) {
          <button [class.on]="e().vent === v.v" (click)="set({ vent: v.v })">{{ v.l }}</button>
        }
      </div>
    </div>
    <div class="grid-2">
      <div class="field">
        <label>Kiểu lắp</label>
        <div class="seg">
          @for (m of mounts; track m.v) {
            <button [class.on]="e().mounting === m.v" (click)="set({ mounting: m.v, base: m.v === 'wall' ? 0 : e().base || 100 })">{{ m.l }}</button>
          }
        </div>
      </div>
      <div class="field">
        <label>Khung đế</label>
        <div class="seg">
          @for (b of bases; track b) {
            <button [class.on]="e().base === b" [disabled]="e().mounting === 'wall' && b > 0" (click)="set({ base: b })">{{ b ? b : 'Không' }}</button>
          }
        </div>
      </div>
    </div>
    <div class="field">
      <label>Khổ tôn cắt laser</label>
      <div class="seg">
        <button [class.on]="store.project().sheetSize === '1250x2500'" (click)="store.setMeta({ sheetSize: '1250x2500' })">1250×2500</button>
        <button [class.on]="store.project().sheetSize === '1500x3000'" (click)="store.setMeta({ sheetSize: '1500x3000' })">1500×3000</button>
      </div>
    </div>
    <p class="muted small">Tôn {{ store.bom().sheetAreaM2 }} m² · {{ store.bom().sheetKg }} kg · {{ store.parts().length }} chi tiết. BD theo bend-table.json (số mẫu).</p>
  `,
  styles: `
    .secs { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; flex: 1; }
    .secs .input { padding: 0 4px; text-align: center; }
    .seg button:disabled { opacity: .4; cursor: not-allowed; }
  `,
})
export class EnclosureForm {
  readonly store = inject(ProjectStore);
  readonly e = computed(() => this.store.project().enclosure);
  readonly materials: { v: Material; l: string }[] = [
    { v: 'SPCC', l: 'SPCC sơn tĩnh điện' },
    { v: 'INOX304', l: 'Inox 304' },
  ];
  readonly doors: { v: DoorType; l: string }[] = [
    { v: 'single', l: '1 cánh' },
    { v: 'double', l: '2 cánh' },
    { v: 'inner_outer', l: 'Cửa trong + ngoài' },
  ];
  readonly vents: { v: VentType; l: string }[] = [
    { v: 'none', l: 'Không' },
    { v: 'bottom', l: 'Hông dưới' },
    { v: 'top_bottom', l: 'Hông trên + dưới' },
  ];
  readonly mounts: { v: Mounting; l: string }[] = [
    { v: 'wall', l: 'Treo' },
    { v: 'floor', l: 'Đặt sàn' },
  ];
  readonly bases: BaseHeight[] = [0, 100, 150];

  set(patch: Partial<EnclosureConfig>): void {
    this.store.setEnclosure(patch);
  }

  num(k: 'H' | 'W' | 'D', ev: Event): void {
    const v = Math.round(+(ev.target as HTMLInputElement).value);
    const lim = { H: [300, 2600], W: [200, 1600], D: [120, 1000] }[k];
    if (!isFinite(v)) return;
    this.set({ [k]: Math.min(lim[1], Math.max(lim[0], v)) });
  }
}
