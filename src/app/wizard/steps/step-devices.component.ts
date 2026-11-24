import { Component, computed, inject, signal } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { DeviceDef } from '../../geometry';
import { DeviceIcon } from '../../components/device-icon';
import { vnd } from '../../core/export.service';
import { WizardService } from '../wizard.service';
import { DEVICE_GROUPS, DEVICE_PRESETS } from '../wizard-data';

/** Bước 6: thiết bị — danh sách nhóm thiết bị, hoặc form thêm/sửa bằng 3 ô chọn nối tiếp. */
@Component({
  selector: 'app-step-devices',
  imports: [DeviceIcon],
  template: `
    <div class="bar">
      <button class="btn sm" [class.primary]="mode() !== 'list'" (click)="openAdd()">Thêm</button>
      <button class="btn sm" [disabled]="!selBatch()" (click)="openEdit()">Sửa</button>
      <button class="btn sm" [disabled]="!selBatch()" (click)="dup()">Nhân bản</button>
      <button class="btn sm danger" [disabled]="!selBatch()" (click)="del()">Xóa</button>
    </div>

    <table class="tbl">
      <thead><tr><th>#</th><th>Thiết bị</th><th class="r">SL</th><th>Gắn</th></tr></thead>
      <tbody>
        @for (b of rows(); track b.id; let i = $index) {
          <tr [class.on]="selBatch()?.id === b.id" [class.bad]="b.level === 'error'" (click)="select(b.id)">
            <td>{{ i + 1 }}</td>
            <td>{{ b.name }}</td>
            <td class="r">{{ b.qty }}</td>
            <td>{{ b.mount === 'door' ? 'Cửa' : 'Tấm đế' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="empty">Chưa có thiết bị. Bấm <b>Thêm</b> hoặc <a (click)="preset()">chèn bộ mẫu</a>.</td></tr>
        }
      </tbody>
    </table>
    <div class="row links">
      <a (click)="preset()">＋ Chèn bộ mẫu {{ store.project().cabinetType }}</a>
      <label class="check"><input type="checkbox" [checked]="wz.showArrows()" (change)="wz.showArrows.set($any($event.target).checked)" /> Hiện mũi tên di chuyển</label>
    </div>

    @if (mode() !== 'list') {
      <div class="form">
        <b>{{ mode() === 'add' ? 'Thêm thiết bị' : 'Sửa thiết bị' }}</b>
        <div class="fr"><span>Nhóm</span>
          <select class="input" (change)="setGroup($any($event.target).value)">
            @for (g of groups; track g.key) {
              <option [value]="g.key" [selected]="group() === g.key">{{ g.label }}</option>
            }
          </select>
        </div>
        <div class="fr"><span>Hãng / dòng</span>
          <select class="input" (change)="setSeries($any($event.target).value)">
            @for (s of seriesList(); track s) {
              <option [value]="s" [selected]="series() === s">{{ s }}</option>
            }
          </select>
        </div>
        <div class="fr"><span>Model</span>
          <select class="input" (change)="model.set($any($event.target).value)">
            @for (d of models(); track d.id) {
              <option [value]="d.id" [selected]="model() === d.id">{{ d.model }}{{ d.name !== d.model ? ' — ' + d.name : '' }}</option>
            }
          </select>
        </div>
        @if (def(); as d) {
          <div class="prev">
            <div class="ico"><app-device-icon [def]="d" [size]="52" /></div>
            <div class="small">
              <b>{{ d.name }}</b><br />
              <span class="muted mono">{{ d.size.w }}×{{ d.size.h }}×{{ d.size.d }} mm</span><br />
              <span class="muted">{{ d.mount === 'door' ? 'Gắn lỗ khoét cửa' : 'Gắn tấm đế' }} · {{ price(d.price) }}</span>
            </div>
          </div>
        }
        <div class="fr act"><span>Số lượng</span>
          <input class="input qty" type="number" min="1" max="50" [value]="qty()" (input)="qty.set(+$any($event.target).value || 1)" />
          <button class="btn ghost danger" (click)="mode.set('list')">Hủy</button>
          <button class="btn primary" [disabled]="!model()" (click)="confirm()">{{ mode() === 'add' ? 'Thêm thiết bị' : 'Lưu' }}</button>
        </div>
      </div>
    }

    @for (r of wz.issuesOf(6); track r.id) {
      <div class="w-warn" [class.warn]="r.level === 'warn'">⚠ {{ r.message }}</div>
    }
    @if (rows().length && !wz.issuesOf(6).length) {
      <p class="w-note">✓ App đã tự xếp chỗ hợp lệ (từ trên xuống, trái sang phải, đủ khoảng hở).</p>
    }
  `,
  styles: `
    .bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
    .bar .btn { justify-content: center; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .tbl th { text-align: left; color: var(--steel-500); font-weight: 500; padding: 4px 6px; border-bottom: 1px solid var(--steel-200); }
    .tbl td { padding: 6px; border-bottom: 1px solid var(--steel-100); cursor: pointer; }
    .tbl tr.on td { background: var(--accent-50); color: var(--accent); font-weight: 600; }
    .tbl tr.bad td:nth-child(2) { color: var(--err); }
    .tbl .r { text-align: right; }
    .tbl td:last-child, .tbl th:last-child { white-space: nowrap; }
    .empty { color: var(--steel-500); text-align: center; padding: 16px 6px !important; cursor: default !important; }
    a { color: var(--accent); cursor: pointer; text-decoration: none; font-size: 12.5px; }
    a:hover { text-decoration: underline; }
    .links { justify-content: space-between; margin: 8px 0 10px; flex-wrap: wrap; font-size: 12.5px; }
    .form { border: 1px solid var(--steel-200); border-radius: 10px; padding: 10px 12px; background: var(--steel-50); display: flex; flex-direction: column; gap: 7px; }
    .fr { display: grid; grid-template-columns: 84px 1fr; align-items: center; gap: 8px; font-size: 12.5px; color: var(--steel-500); }
    .fr.act { grid-template-columns: 84px 56px auto 1fr; }
    .qty { text-align: center; }
    .prev { display: flex; gap: 10px; align-items: center; background: #fff; border-radius: 8px; padding: 8px; }
    .ico { width: 58px; height: 58px; display: grid; place-items: center; background: var(--steel-50); border-radius: 6px; flex: none; }
  `,
})
export class StepDevicesComponent {
  readonly store = inject(ProjectStore);
  readonly wz = inject(WizardService);
  readonly groups = DEVICE_GROUPS;
  readonly mode = signal<'list' | 'add' | 'edit'>('list');
  readonly group = signal('MCCB');
  readonly series = signal('');
  readonly model = signal('');
  readonly qty = signal(1);

  /** Mỗi dòng = 1 nhóm; tô đỏ khi vướng lỗi của chính bước 6 (va chạm, vùng lắp, lỗ khoét…). */
  readonly rows = computed(() => {
    const bad = new Set(this.wz.issuesOf(6).filter((r) => r.level === 'error').flatMap((r) => r.targetIds));
    return this.store.batches().map((b) => {
      const def = this.store.defOf(b.deviceId);
      return { ...b, name: def?.name ?? b.deviceId, qty: b.uids.length, level: b.uids.some((u) => bad.has(u)) ? 'error' : 'ok' };
    });
  });
  readonly selBatch = computed(() => {
    const sel = this.store.selectedIds();
    return this.store.batches().find((b) => b.uids.some((u) => sel.includes(u))) ?? null;
  });
  private readonly inGroup = computed(() => {
    const g = DEVICE_GROUPS.find((x) => x.key === this.group());
    return this.store.cat.devices.filter((d) => g?.types.includes(d.type));
  });
  readonly seriesList = computed(() => [...new Set(this.inGroup().map((d) => `${d.brand} · ${d.series}`))]);
  readonly models = computed(() => this.inGroup().filter((d) => `${d.brand} · ${d.series}` === this.series()));
  readonly def = computed<DeviceDef | undefined>(() => this.store.defOf(this.model()));

  select(id: string): void {
    const b = this.store.batches().find((x) => x.id === id);
    this.store.selectedIds.set(b?.uids ?? []);
  }

  setGroup(key: string): void {
    this.group.set(key);
    this.setSeries(this.seriesList()[0] ?? '');
  }

  setSeries(s: string): void {
    this.series.set(s);
    this.model.set(this.models()[0]?.id ?? '');
  }

  openAdd(): void {
    this.mode.set('add');
    this.qty.set(1);
    this.setGroup(this.group());
  }

  openEdit(): void {
    const b = this.selBatch();
    const def = b && this.store.defOf(b.deviceId);
    if (!b || !def) return;
    this.group.set(DEVICE_GROUPS.find((g) => g.types.includes(def.type))?.key ?? 'MCCB');
    this.series.set(`${def.brand} · ${def.series}`);
    this.model.set(def.id);
    this.qty.set(b.uids.length);
    this.mode.set('edit');
  }

  confirm(): void {
    const id = this.model();
    if (!id) return;
    if (this.mode() === 'add') this.store.addBatch(id, this.qty());
    else {
      const b = this.selBatch();
      if (b) this.store.replaceBatch(b.id, id, this.qty());
    }
    this.mode.set('list');
  }

  dup(): void {
    const b = this.selBatch();
    if (b) this.store.duplicateBatch(b.id);
  }

  del(): void {
    const b = this.selBatch();
    if (b) this.store.removeUids(b.uids);
    this.mode.set('list');
  }

  preset(): void {
    for (const [id, n] of DEVICE_PRESETS[this.store.project().cabinetType]) this.store.addBatch(id, n);
    this.store.select(null);
  }

  price(v: number): string {
    return vnd(v);
  }
}
