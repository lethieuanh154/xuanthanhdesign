import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { ExportService } from '../core/export.service';

@Component({
  selector: 'app-header',
  template: `
    <header class="hdr no-print">
      <div class="logo" title="Công ty Xuân Thành — Đà Nẵng">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <rect x="3" y="2" width="24" height="26" rx="2" fill="#1E5AA8" />
          <rect x="6" y="5" width="18" height="20" rx="1" fill="none" stroke="#fff" stroke-width="1.4" />
          <path d="M16 8 L11 16 H15 L13 22 L19 13 H15 Z" fill="#FFD54F" />
        </svg>
        <div>
          <b>XUÂN THÀNH</b>
          <span>Tủ Điện Builder</span>
        </div>
      </div>
      <div class="proj">
        <span class="muted">Dự án:</span>
        <input class="name" [value]="p().name" (change)="store.setMeta({ name: $any($event.target).value })" title="Tên dự án" />
        <span class="muted">–</span>
        <input class="cust" [value]="p().customer" (change)="store.setMeta({ customer: $any($event.target).value })" title="Khách hàng" />
        <input class="code mono" [value]="p().orderCode" (change)="store.setMeta({ orderCode: $any($event.target).value })" title="Mã đơn hàng" />
      </div>
      <div class="actions">
        @if (store.lastSavedAt(); as t) {
          <span class="muted small">Đã lưu {{ t }}</span>
        }
        <button class="btn" (click)="store.newProject()">＋ Dự án mới</button>
        <div class="dropdown">
          <button class="btn" (click)="toggle('open', $event)">Mở dự án ▾</button>
          @if (menu() === 'open') {
            <div class="menu" (click)="$event.stopPropagation()">
              @for (s of store.savedList(); track s.id) {
                <div class="saved" [class.cur]="s.id === p().id">
                  <button class="mi" (click)="store.openProject(s.id); menu.set(null)">
                    <span class="chip">{{ s.cabinetType }}</span>
                    <span class="grow">
                      <b>{{ s.name }}</b><br />
                      <span class="muted small mono">{{ s.orderCode }} · {{ s.customer }} · {{ fmt(s.updatedAt) }}</span>
                    </span>
                  </button>
                  @if (s.id !== p().id) {
                    <button class="btn ghost sm danger" title="Xoá" (click)="store.deleteProject(s.id)">✕</button>
                  }
                </div>
              } @empty {
                <div class="mi muted">Chưa có dự án đã lưu</div>
              }
            </div>
          }
        </div>
        <button class="btn" (click)="store.saveNow()">💾 Lưu</button>
        <div class="dropdown">
          <button class="btn primary" (click)="toggle('export', $event)">Xuất ▾</button>
          @if (menu() === 'export') {
            <div class="menu" (click)="menu.set(null)">
              <button class="mi" (click)="ex.downloadCombinedDxf()">⬇ DXF gộp tất cả chi tiết</button>
              <button class="mi" (click)="ex.downloadAllDxf()">⬇ DXF từng chi tiết ({{ store.parts().length }} file)</button>
              <hr />
              <button class="mi" (click)="ex.downloadBomXlsx()">⬇ BOM Excel (.xlsx)</button>
              <button class="mi" (click)="ex.downloadBomCsv()">⬇ BOM CSV</button>
              <hr />
              <button class="mi" (click)="ex.print()">🖨 Bản vẽ tổng thể (PDF)</button>
              <button class="mi" (click)="store.step.set(5)">☰ Mở bước ⑤ Xuất…</button>
            </div>
          }
        </div>
      </div>
    </header>
  `,
  styles: `
    .hdr { height: 52px; display: flex; align-items: center; gap: 16px; padding: 0 14px; background: var(--steel-900); color: #fff; }
    .logo { display: flex; align-items: center; gap: 8px; line-height: 1.05; }
    .logo b { letter-spacing: .08em; font-size: 14px; display: block; }
    .logo span { font-size: 11px; color: var(--steel-300); }
    .proj { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
    .proj input { background: transparent; border: 1px solid transparent; color: #fff; height: 30px; border-radius: 4px; padding: 0 6px; min-width: 0; }
    .proj input:hover, .proj input:focus { border-color: var(--steel-500); background: rgba(255,255,255,.06); outline: none; }
    .proj .name { font-weight: 700; font-size: 14px; width: 220px; }
    .proj .cust { width: 140px; }
    .proj .code { width: 110px; color: #9cc3ff; }
    .proj .muted { color: var(--steel-300); }
    .actions { display: flex; align-items: center; gap: 6px; }
    .actions > .muted { color: var(--steel-300); margin-right: 4px; }
    .actions .btn:not(.primary) { background: transparent; color: #fff; border-color: var(--steel-500); }
    .actions .btn:not(.primary):hover { background: rgba(255,255,255,.08); }
    .menu { color: var(--steel-900); min-width: 300px; }
    .saved { display: flex; align-items: center; border-radius: 4px; }
    .saved.cur { background: var(--accent-50); }
    .grow { flex: 1; min-width: 0; }
    .menu .btn.ghost { color: var(--err) !important; border-color: transparent !important; }
  `,
})
export class AppHeader {
  readonly store = inject(ProjectStore);
  readonly ex = inject(ExportService);
  readonly p = computed(() => this.store.project());
  readonly menu = signal<'open' | 'export' | null>(null);

  toggle(m: 'open' | 'export', e: Event): void {
    e.stopPropagation();
    if (m === 'open') void this.store.refreshList();
    this.menu.update((v) => (v === m ? null : m));
  }

  @HostListener('document:click')
  close(): void {
    this.menu.set(null);
  }

  fmt(iso: string): string {
    return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }
}
