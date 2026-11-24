import { Component, computed, inject } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { deviceRect, sectionAt } from '../geometry';
import { DeviceIcon } from './device-icon';
import { vnd } from '../core/export.service';

/** Thuộc tính thiết bị đang chọn (bước ③). */
@Component({
  selector: 'app-device-props',
  imports: [DeviceIcon],
  template: `
    @if (one(); as x) {
      <div class="head">
        <app-device-icon [def]="x.def" [size]="40" />
        <div>
          <b>{{ x.def.model }}</b><br />
          <span class="muted small">{{ x.def.name }} · {{ x.def.brand }} {{ x.def.series }} · {{ price(x.def.price) }}</span>
        </div>
      </div>
      @if (issues(); as iss) {
        <div class="iss" [class.warn]="iss.level === 'warn'">
          @for (m of iss.messages; track $index) {
            <div>{{ iss.level === 'error' ? '✗' : '⚠' }} {{ m }}</div>
          }
        </div>
      }
      <div class="field">
        <label>Nhãn (ký hiệu trên bản vẽ)</label>
        <input class="input" [value]="x.pd.label ?? ''" [placeholder]="x.def.model" (change)="store.patchDevice(x.pd.uid, { label: $any($event.target).value || undefined })" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label>X (mm)</label>
          <input class="input num" type="number" step="5" [value]="x.pd.x" (change)="store.patchDevice(x.pd.uid, { x: +$any($event.target).value })" />
        </div>
        <div class="field">
          <label>Y (mm, từ đáy)</label>
          <input class="input num" type="number" step="5" [value]="x.pd.y" (change)="store.patchDevice(x.pd.uid, { y: +$any($event.target).value })" />
        </div>
      </div>
      <div class="field">
        <label>Gắn lên</label>
        <div class="seg">
          <button [class.on]="x.pd.mount === 'plate'" (click)="store.patchDevice(x.pd.uid, { mount: 'plate', doorCutout: !!x.def.cutoutDefault })">Tấm đế (lỗ bắt vít)</button>
          <button [class.on]="x.pd.mount === 'door'" (click)="store.patchDevice(x.pd.uid, { mount: 'door', doorCutout: true })">Lỗ khoét cửa</button>
        </div>
      </div>
      @if (x.pd.mount === 'plate' && store.project().enclosure.doorType === 'two_layer') {
        <p class="muted small">Tủ 2 lớp: thiết bị lộ ra qua ô khoét của cửa trong (tự sinh).</p>
      }
      @if (x.pd.mount === 'plate' && x.def.doorCutout && store.project().enclosure.doorType !== 'two_layer') {
        <div class="opt"><label class="check"><input type="checkbox" [checked]="x.pd.doorCutout" (change)="store.patchDevice(x.pd.uid, { doorCutout: $any($event.target).checked })" /> Khoét cửa để lộ mặt thiết bị ({{ cutText(x.def) }})</label></div>
      }
      <div class="row opt">
        <div class="seg">
          <button [class.on]="x.pd.rot === 0" (click)="x.pd.rot !== 0 && store.rotateSelected()">0°</button>
          <button [class.on]="x.pd.rot === 90" (click)="x.pd.rot !== 90 && store.rotateSelected()">90°</button>
        </div>
        @if (x.def.isBreaker) {
          <label class="check"><input type="checkbox" [checked]="!!x.pd.isMain" (change)="store.patchDevice(x.pd.uid, { isMain: $any($event.target).checked })" /> Aptomat tổng</label>
        }
      </div>
      <table class="kv">
        <tr><td>Kích thước R×C×S</td><td class="num">{{ x.def.size.w }}×{{ x.def.size.h }}×{{ x.def.size.d }}</td></tr>
        <tr><td>Khoảng hở yêu cầu</td><td class="num">{{ x.def.din ? '0 (ray DIN) / ' : '' }}{{ x.def.clearance }} mm</td></tr>
        <tr><td>Ngăn</td><td>{{ section() }}</td></tr>
        @if (x.def.ratedCurrent) {
          <tr><td>Dòng định mức</td><td class="num">{{ x.def.ratedCurrent }} A {{ x.def.poles }}P</td></tr>
        }
        <tr><td>Lỗ bắt vít</td><td class="num">{{ x.pd.mount === 'plate' ? x.def.plateHoles.length : 0 }}</td></tr>
      </table>
      <div class="row">
        <button class="btn sm" (click)="store.duplicateSelected()">⧉ Nhân bản</button>
        <button class="btn sm" (click)="store.distribute()">⇹ Căn đều hàng</button>
        <button class="btn sm danger" (click)="store.removeSelected()">🗑 Xoá</button>
      </div>
    } @else if (store.selectedIds().length > 1) {
      <p><b>{{ store.selectedIds().length }} thiết bị</b> đang chọn.</p>
      <div class="row">
        <button class="btn sm" (click)="store.distribute()">⇹ Căn đều</button>
        <button class="btn sm" (click)="store.rotateSelected()">⟳ Xoay</button>
        <button class="btn sm" (click)="store.duplicateSelected()">⧉ Nhân bản</button>
        <button class="btn sm danger" (click)="store.removeSelected()">🗑 Xoá</button>
      </div>
    } @else {
      <p class="muted">Chọn một thiết bị trên canvas để sửa thuộc tính.</p>
      <ul class="muted small tips">
        <li>Kéo card từ THƯ VIỆN thả vào canvas, hoặc bấm <b>+ Thêm</b> (tự tìm chỗ trống).</li>
        <li>Snap 5 mm · <b>R</b> xoay 0/90° · <b>Delete</b> xoá · <b>Ctrl+D</b> nhân bản.</li>
        <li>Thiết bị viền <span style="color:var(--err)">đỏ</span> = vi phạm luật, rê chuột để xem lý do.</li>
      </ul>
    }
  `,
  styles: `
    .opt { margin-bottom: 10px; }
    .head { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
    .iss { background: #fdecea; color: var(--err); border-radius: 6px; padding: 6px 8px; margin-bottom: 10px; font-size: 12px; }
    .iss.warn { background: #fff4e0; color: #9a5b00; }
    .kv { width: 100%; font-size: 12px; margin: 4px 0 10px; border-collapse: collapse; }
    .kv td { padding: 3px 0; border-bottom: 1px solid var(--steel-100); }
    .kv td:last-child { text-align: right; }
    .tips { padding-left: 18px; line-height: 1.6; }
  `,
})
export class DeviceProps {
  readonly store = inject(ProjectStore);
  readonly one = computed(() => {
    const sel = this.store.selectedDevices();
    if (sel.length !== 1) return null;
    const def = this.store.defOf(sel[0].deviceId);
    return def ? { pd: sel[0], def } : null;
  });
  readonly issues = computed(() => {
    const x = this.one();
    return x ? this.store.issues().get(x.pd.uid) : undefined;
  });
  readonly section = computed(() => {
    const x = this.one();
    if (!x) return '';
    const r = deviceRect(x.pd, x.def);
    const s = sectionAt(this.store.layout(), r.y + r.h / 2);
    return s ? `Ngăn ${s.index + 1} (cao ${s.h} mm)` : '—';
  });

  cutText(def: { doorCutout?: { shape: string; w?: number; h?: number; d?: number } }): string {
    const c = def.doorCutout;
    if (!c) return '';
    return c.shape === 'circle' ? `Ø${c.d}` : `${c.w}×${c.h}`;
  }

  price(v: number): string {
    return vnd(v);
  }
}
