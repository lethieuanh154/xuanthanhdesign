import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { RuleResult, MATERIAL_LABEL } from '../geometry';
import { EnclosureForm } from './enclosure-form';
import { DeviceProps } from './device-props';
import { BusbarForm } from './busbar-form';
import { vnd } from '../core/export.service';

@Component({
  selector: 'app-right-panel',
  imports: [EnclosureForm, DeviceProps, BusbarForm],
  template: `
    <div class="wrap">
      <div class="ctx">
        @switch (store.step()) {
          @case (1) {
            <div class="panel-title">Thông tin dự án</div>
            <div class="pad">
              <div class="field"><label>Tên dự án</label><input class="input" [value]="p().name" (change)="store.setMeta({ name: $any($event.target).value })" /></div>
              <div class="field"><label>Khách hàng</label><input class="input" [value]="p().customer" (change)="store.setMeta({ customer: $any($event.target).value })" /></div>
              <div class="grid-2">
                <div class="field"><label>Mã đơn</label><input class="input mono" [value]="p().orderCode" (change)="store.setMeta({ orderCode: $any($event.target).value })" /></div>
                <div class="field"><label>Người vẽ</label><input class="input" [value]="p().drafter" (change)="store.setMeta({ drafter: $any($event.target).value })" /></div>
              </div>
              <p class="muted small">Đã chọn: <b>{{ tplName() }}</b>. Bấm <b>Tiếp ›</b> để chỉnh vỏ & kích thước.</p>
            </div>
          }
          @case (2) {
            <div class="panel-title">② Vỏ & kích thước</div>
            <div class="pad"><app-enclosure-form /></div>
          }
          @case (3) {
            <div class="panel-title">Thuộc tính <span class="muted small">{{ store.project().devices.length }} thiết bị</span></div>
            <div class="pad"><app-device-props /></div>
          }
          @case (4) {
            <div class="panel-title">④ Thanh cái & phụ kiện</div>
            <div class="pad"><app-busbar-form /></div>
          }
          @case (5) {
            <div class="panel-title">Khung tên bản vẽ</div>
            <div class="pad">
              <div class="field"><label>Người vẽ</label><input class="input" [value]="p().drafter" (change)="store.setMeta({ drafter: $any($event.target).value })" /></div>
              <div class="field"><label>Khách hàng</label><input class="input" [value]="p().customer" (change)="store.setMeta({ customer: $any($event.target).value })" /></div>
            </div>
          }
        }
      </div>

      <div class="checks">
        <div class="panel-title">
          Kiểm tra
          <span>
            @if (store.errorCount()) {
              <span class="badge">{{ store.errorCount() }}</span>
            }
            @if (store.warnCount()) {
              <span class="badge warn">{{ store.warnCount() }}</span>
            }
            @if (!store.errorCount() && !store.warnCount()) {
              <span class="badge ok">✓</span>
            }
          </span>
        </div>
        <ul class="rl">
          @for (r of sorted(); track r.id) {
            <li [class]="r.level" (click)="focus(r)" [title]="'Bước ' + r.step">
              <span class="ic">{{ r.level === 'ok' ? '✓' : r.level === 'warn' ? '⚠' : '✗' }}</span>
              <span>{{ r.message }}</span>
            </li>
          }
        </ul>
      </div>

      <div class="summary">
        <div class="panel-title">Tóm tắt</div>
        <div class="sum">
          <div class="line"><span>Thiết bị</span><b>{{ bom().deviceCount }}</b></div>
          @for (s of bom().sheets; track s.material + s.thickness) {
            <div class="line sub"><span>Tôn {{ s.material === 'INOX304' ? 'Inox' : 'SPCC' }} {{ s.thickness }}mm</span><b class="num">{{ fmt(s.areaM2) }} m² · {{ fmt(s.kg) }} kg</b></div>
          }
          <div class="line"><span>Tôn tổng</span><b class="num">{{ fmt(bom().sheetAreaM2) }} m²</b></div>
          <div class="line"><span>Đồng thanh cái</span><b class="num">{{ fmt(bom().copperKg) }} kg</b></div>
          <div class="line"><span>Chi tiết / tấm tôn</span><b class="num">{{ store.parts().length }} / {{ sheets() }}</b></div>
          <div class="line"><span>Lỗi / cảnh báo</span><b><span [class.e]="store.errorCount()">{{ store.errorCount() }}</span> / <span [class.w]="store.warnCount()">{{ store.warnCount() }}</span></b></div>
          <div class="total"><span>Tạm tính</span><b>{{ money(bom().total) }}</b></div>
          <div class="muted small">{{ mat() }} · chưa VAT · giá mẫu</div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .wrap { display: flex; flex-direction: column; min-height: 100%; }
    .pad { padding: 0 12px 10px; }
    .ctx { border-bottom: 1px solid var(--steel-100); }
    .checks { flex: 1; }
    .rl { list-style: none; margin: 0; padding: 0 8px 10px; }
    .rl li { display: flex; gap: 6px; padding: 5px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1.35; }
    .rl li:hover { background: var(--steel-50); }
    .rl li.ok .ic { color: var(--ok); }
    .rl li.warn { color: #9a5b00; }
    .rl li.error { color: var(--err); background: #fdf1f0; margin-bottom: 2px; }
    .ic { font-weight: 700; width: 12px; flex: none; }
    .summary { position: sticky; bottom: 0; background: #fff; border-top: 2px solid var(--accent); box-shadow: 0 -4px 12px rgba(16,24,40,.06); }
    .sum { padding: 0 12px 12px; }
    .line { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12.5px; }
    .line.sub { color: var(--steel-500); font-size: 11.5px; padding-left: 8px; }
    .line .e { color: var(--err); } .line .w { color: var(--warn); }
    .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--steel-200); }
    .total b { font-size: 18px; color: var(--accent); }
  `,
})
export class RightPanel {
  readonly store = inject(ProjectStore);
  readonly p = computed(() => this.store.project());
  readonly bom = computed(() => this.store.bom());
  readonly tplName = computed(() => this.store.cat.templates.find((t) => t.id === this.p().cabinetType)?.name ?? '');
  readonly sheets = computed(() => this.store.nesting().reduce((s, g) => s + g.sheets.length, 0));
  readonly mat = computed(() => `${MATERIAL_LABEL[this.p().enclosure.material]} ${this.p().enclosure.thickness} mm`);
  readonly sorted = computed(() => {
    const order = { error: 0, warn: 1, ok: 2 };
    return [...this.store.rules()].sort((a, b) => order[a.level] - order[b.level] || a.step - b.step);
  });

  focus(r: RuleResult): void {
    const devIds = r.targetIds.filter((id) => this.store.project().devices.some((d) => d.uid === id));
    if (devIds.length) {
      this.store.selectedIds.set(devIds);
      this.store.step.set(3);
      this.store.view.set('front');
    } else if (r.targetIds.length) {
      this.store.selectedPartId.set(r.targetIds[0]);
      this.store.view.set('flat');
      if (this.store.step() === 5) this.store.step.set(r.step);
    } else this.store.step.set(r.step);
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);
  }
  money(v: number): string {
    return vnd(v);
  }
}
