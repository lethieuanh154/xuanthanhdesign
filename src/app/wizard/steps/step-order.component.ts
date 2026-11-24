import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { CatalogService } from '../../core/catalog.service';
import { vnd } from '../../core/export.service';
import { ViewerService } from '../../core/viewer.service';
import { WizardService } from '../wizard.service';
import { PROVINCES } from '../wizard-data';

/** Bước 8: thông tin đơn hàng. Nút "Hoàn tất đơn" nằm ở chân panel. */
@Component({
  selector: 'app-step-order',
  template: `
    <div class="head">
      <div><span class="muted small">Mã đơn</span><br /><b class="mono code">{{ p().orderCode }}</b></div>
      <div class="r"><span class="muted small">Tổng tạm tính</span><br /><b class="price">{{ money(store.bom().total) }}</b></div>
    </div>

    <label class="w-label">Khách hàng</label>
    <input class="input" list="kh-list" placeholder="Gõ tên để gợi ý…" [value]="p().customer" (change)="setCustomer($any($event.target).value)" />
    <datalist id="kh-list">
      @for (c of customerNames(); track c) {
        <option [value]="c"></option>
      }
    </datalist>
    <div class="grid-2">
      <div><label class="w-label">Người liên hệ</label><input class="input" [value]="p().contact ?? ''" (change)="set('contact', $any($event.target).value)" /></div>
      <div><label class="w-label">Điện thoại</label><input class="input" type="tel" [value]="p().phone ?? ''" (change)="set('phone', $any($event.target).value)" /></div>
    </div>
    <label class="w-label">Địa chỉ</label>
    <input class="input" [value]="p().address ?? ''" (change)="set('address', $any($event.target).value)" />
    <label class="w-label">Tỉnh / TP</label>
    <select class="input" (change)="set('province', $any($event.target).value)">
      <option value="">— Chọn —</option>
      @for (pv of provinces; track pv) {
        <option [value]="pv" [selected]="p().province === pv">{{ pv }}</option>
      }
    </select>
    <label class="w-label">Ghi chú</label>
    <textarea class="input note" rows="2" [value]="p().note ?? ''" (change)="set('note', $any($event.target).value)" placeholder="Thời gian giao, yêu cầu riêng…"></textarea>

    @if (wz.hasErrors()) {
      <div class="w-warn">✗ Còn lỗi ở bước {{ errSteps() }} — sửa xong mới hoàn tất được.
        <button class="btn sm" (click)="wz.go(firstErr())">Đến bước {{ firstErr() }}</button>
      </div>
    }

    @if (thumb()) {
      <img class="thumb" [src]="thumb()" alt="Ảnh render tủ hoàn chỉnh" />
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: flex-end; background: var(--steel-50); border-radius: 10px; padding: 10px 12px; margin-bottom: 4px; }
    .code { font-size: 16px; color: var(--accent); }
    .price { font-size: 20px; }
    .r { text-align: right; }
    .note { height: auto; padding: 6px 8px; resize: vertical; }
    .thumb { width: 100%; border-radius: 10px; margin-top: 14px; display: block; }
    .w-warn .btn { margin-left: 6px; }
  `,
})
export class StepOrderComponent implements OnInit {
  readonly store = inject(ProjectStore);
  readonly wz = inject(WizardService);
  private readonly catalog = inject(CatalogService);
  private readonly viewer = inject(ViewerService);
  readonly p = computed(() => this.store.project());
  readonly provinces = PROVINCES;
  readonly thumb = signal<string | null>(null);

  readonly customerNames = computed(() => {
    const names = new Set<string>(this.catalog.customers().map((c) => c.name));
    for (const s of this.store.savedList()) if (s.customer) names.add(s.customer);
    return [...names];
  });
  readonly errSteps = computed(() => [...this.wz.errorSteps()].sort().join(', '));
  readonly firstErr = computed(() => Math.min(...this.wz.errorSteps()));

  ngOnInit(): void {
    // ảnh render tủ hoàn chỉnh (cửa mở) — chụp sau khi khung 3D dựng xong
    setTimeout(() => this.thumb.set(this.viewer.snapshot(480, 380, 90)), 400);
  }

  set(k: 'contact' | 'phone' | 'address' | 'province' | 'note', v: string): void {
    this.store.update((p) => (p[k] = v));
  }

  /** Chọn khách đã biết → điền sẵn liên hệ, địa chỉ (nếu đang trống). */
  setCustomer(name: string): void {
    const seed = this.catalog.customers().find((c) => c.name === name);
    this.store.update((p) => {
      p.customer = name;
      if (seed) {
        p.contact ||= seed.contact;
        p.phone ||= seed.phone;
        p.address ||= seed.address;
        p.province ||= seed.province;
      }
      if (name && (p.name === 'Cấu hình mới' || /^Tủ /.test(p.name)) && !p.name.includes(' - ')) p.name = `${p.name} - ${name}`;
    });
  }

  money(v: number): string {
    return vnd(v);
  }
}
