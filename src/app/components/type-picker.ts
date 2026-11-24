import { Component, inject } from '@angular/core';
import { CabinetTemplate, CabinetType } from '../geometry';
import { ProjectStore } from '../core/project.store';

/** Bước ①: chọn 1 trong 4 loại tủ mẫu. */
@Component({
  selector: 'app-type-picker',
  template: `
    <div class="panel-title">① Chọn loại tủ</div>
    <div class="list">
      @for (t of store.cat.templates; track t.id) {
        <button class="tcard" [class.on]="store.project().cabinetType === t.id" (click)="pick(t.id)">
          <svg viewBox="0 0 80 90" width="64" height="72" aria-hidden="true">
            <g [attr.transform]="tf(t)">
              <rect [attr.width]="t.enclosure.W" [attr.height]="t.enclosure.H" fill="#c9d0d7" stroke="#3c4752" [attr.stroke-width]="sw(t)" />
              @if (t.enclosure.doorType === 'double') {
                <line [attr.x1]="t.enclosure.W / 2" y1="0" [attr.x2]="t.enclosure.W / 2" [attr.y2]="t.enclosure.H" stroke="#1E5AA8" [attr.stroke-width]="sw(t)" />
              }
              <rect [attr.x]="t.enclosure.W * 0.06" [attr.y]="t.enclosure.H * 0.04" [attr.width]="t.enclosure.W * 0.88" [attr.height]="t.enclosure.H * 0.92" fill="none" stroke="#1E5AA8" [attr.stroke-width]="sw(t) * 1.4" />
              <rect [attr.x]="t.enclosure.W * 0.85" [attr.y]="t.enclosure.H * 0.45" [attr.width]="t.enclosure.W * 0.04" [attr.height]="t.enclosure.H * 0.1" fill="#3c4752" />
              @if (t.enclosure.base) {
                <rect [attr.y]="t.enclosure.H" [attr.width]="t.enclosure.W" [attr.height]="t.enclosure.base" fill="#3c4752" />
              }
            </g>
          </svg>
          <div class="info">
            <b>{{ t.name }}</b>
            <span class="mono">{{ t.enclosure.H }}×{{ t.enclosure.W }}×{{ t.enclosure.D }}</span>
            <span class="muted small">{{ t.description }}</span>
            <span class="tags">
              <span class="chip">{{ t.enclosure.mounting === 'wall' ? 'Treo tường' : 'Đặt sàn' }}</span>
              <span class="chip">Tôn {{ t.enclosure.thickness }}</span>
              @if (t.enclosure.base) {
                <span class="chip">Đế {{ t.enclosure.base }}</span>
              }
            </span>
          </div>
        </button>
      }
    </div>
    <div class="hint muted small">Chọn mẫu → thông số được nạp sẵn, chỉnh tiếp ở bước ②. Thiết bị đã đặt được giữ nguyên.</div>
  `,
  styles: `
    .list { display: flex; flex-direction: column; gap: 8px; padding: 0 10px; }
    .tcard { display: flex; gap: 10px; align-items: center; text-align: left; padding: 10px; border: 1.5px solid var(--steel-200); border-radius: 8px; background: #fff; cursor: pointer; }
    .tcard:hover { border-color: var(--steel-500); }
    .tcard.on { border-color: var(--accent); background: var(--accent-50); box-shadow: 0 0 0 3px rgba(30,90,168,.12); }
    .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
    .hint { padding: 12px; }
  `,
})
export class TypePicker {
  readonly store = inject(ProjectStore);

  pick(t: CabinetType): void {
    this.store.chooseTemplate(t);
    this.store.step.set(2);
  }

  /** Thu phóng hình mẫu vào khung 80×90. */
  tf(t: CabinetTemplate): string {
    const e = t.enclosure;
    const k = Math.min(70 / e.W, 82 / (e.H + e.base));
    const x = (80 - e.W * k) / 2;
    const y = (90 - (e.H + e.base) * k) / 2;
    return `translate(${x} ${y}) scale(${k})`;
  }

  sw(t: CabinetTemplate): number {
    return 1.2 / Math.min(70 / t.enclosure.W, 82 / (t.enclosure.H + t.enclosure.base));
  }
}
