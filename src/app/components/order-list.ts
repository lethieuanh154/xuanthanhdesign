import { Component, inject, input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectStore } from '../core/project.store';

/** Danh sách đơn đã lưu: mở ở Wizard View, Detail View hoặc trang Kết quả. */
@Component({
  selector: 'app-order-list',
  imports: [RouterLink],
  template: `
    @if (store.savedList().length) {
      <table class="ol">
        <thead>
          <tr><th>Mã đơn</th><th>Tên / khách hàng</th><th>Loại</th><th>Cập nhật</th><th></th></tr>
        </thead>
        <tbody>
          @for (s of store.savedList().slice(0, limit()); track s.id) {
            <tr [class.cur]="s.id === currentId()">
              <td class="mono code">{{ s.orderCode }}</td>
              <td>
                <b>{{ s.name }}</b>
                @if (s.customer) {
                  <br /><span class="muted small">{{ s.customer }}</span>
                }
              </td>
              <td><span class="chip">{{ s.cabinetType }}</span></td>
              <td class="muted small">
                {{ fmt(s.updatedAt) }}
                @if (s.status === 'done') {
                  <br /><span class="done">● Hoàn tất</span>
                }
              </td>
              <td class="acts">
                <a [routerLink]="['/cau-hinh', s.id]">Wizard</a>
                <a [routerLink]="['/nang-cao', s.id]">Detail</a>
                @if (s.status === 'done') {
                  <a [routerLink]="['/don-hang', s.id]">Kết quả</a>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="muted small">Chưa có đơn nào được lưu.</p>
    }
  `,
  styles: `
    .ol { width: 100%; border-collapse: collapse; font-size: 13px; }
    .ol th { text-align: left; font-weight: 500; color: var(--steel-500); font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--steel-200); }
    .ol td { padding: 8px; border-bottom: 1px solid var(--steel-100); vertical-align: middle; }
    .ol tr.cur td { background: var(--accent-50); }
    .code { color: var(--accent); font-weight: 600; white-space: nowrap; }
    .done { color: var(--ok); }
    .acts { white-space: nowrap; text-align: right; }
    .acts a { color: var(--accent); text-decoration: none; font-weight: 600; margin-left: 10px; font-size: 12.5px; }
    .acts a:hover { text-decoration: underline; }
  `,
})
export class OrderList implements OnInit {
  readonly store = inject(ProjectStore);
  readonly limit = input(20);
  readonly currentId = input<string | null>(null);

  ngOnInit(): void {
    void this.store.refreshList();
  }

  fmt(iso: string): string {
    return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }
}
