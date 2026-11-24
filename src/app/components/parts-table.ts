import { Component, inject } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { ExportService } from '../core/export.service';
import { bboxH, bboxW, MATERIAL_LABEL, Part, r2 } from '../geometry';

@Component({
  selector: 'app-parts-table',
  template: `
    <div class="pt no-print">
      <button class="hdr" (click)="store.partsTableOpen.set(!store.partsTableOpen())">
        {{ store.partsTableOpen() ? '▾' : '▸' }} DANH SÁCH CHI TIẾT <span class="badge grey">{{ store.parts().length }}</span>
        <span class="muted small">bấm dòng để xem trải phẳng</span>
        <span class="spacer"></span>
        <span class="lnk" (click)="$event.stopPropagation(); ex.downloadCombinedDxf()">⬇ DXF gộp</span>
      </button>
      @if (store.partsTableOpen()) {
        <div class="scroll">
          <table>
            <thead>
              <tr><th>Mã</th><th>Tên</th><th>Vật liệu</th><th class="r">Dày</th><th class="r">SL</th><th class="r">KT trải phẳng</th><th class="r">Lỗ</th><th class="r">Chấn</th><th>Kiểm tra</th><th>DXF</th></tr>
            </thead>
            <tbody>
              @for (p of store.parts(); track p.id) {
                <tr [class.on]="store.selectedPartId() === p.id" (click)="open(p)">
                  <td class="mono code">{{ p.code }}</td>
                  <td>{{ p.name }}@if (p.note) {<span class="muted small"> · {{ p.note }}</span>}</td>
                  <td>{{ mat(p) }}</td>
                  <td class="r num">{{ p.thickness }}</td>
                  <td class="r num">{{ p.qty }}</td>
                  <td class="r num">{{ w(p) }} × {{ h(p) }}</td>
                  <td class="r num">{{ p.holes.length }}</td>
                  <td class="r num">{{ p.bendLines.length }}</td>
                  <td>
                    @if (err(p); as e) {
                      <span class="bad" [title]="e">✗ {{ e }}</span>
                    } @else {
                      <span class="good">✓</span>
                    }
                  </td>
                  <td><button class="btn sm" (click)="$event.stopPropagation(); ex.downloadPartDxf(p)">⬇</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .hdr { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; background: var(--steel-50); padding: 6px 12px; font-weight: 700; font-size: 11.5px; letter-spacing: .06em; cursor: pointer; text-align: left; }
    .spacer { flex: 1; }
    .lnk { color: var(--accent); font-weight: 600; letter-spacing: 0; }
    .scroll { max-height: 170px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { position: sticky; top: 0; background: #fff; text-align: left; font-weight: 600; color: var(--steel-500); border-bottom: 1px solid var(--steel-200); padding: 4px 8px; }
    td { padding: 3px 8px; border-bottom: 1px solid var(--steel-100); white-space: nowrap; }
    tr:hover td { background: var(--steel-50); cursor: pointer; }
    tr.on td { background: var(--accent-50); }
    .r { text-align: right; }
    .code { color: var(--accent); font-weight: 700; }
    .bad { color: var(--err); max-width: 260px; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: bottom; }
    .good { color: var(--ok); }
    .btn.sm { height: 20px; padding: 0 6px; }
  `,
})
export class PartsTable {
  readonly store = inject(ProjectStore);
  readonly ex = inject(ExportService);

  open(p: Part): void {
    this.store.selectedPartId.set(p.id);
    this.store.view.set('flat');
    if (this.store.step() === 5) this.store.step.set(3);
  }
  w(p: Part): number {
    return r2(bboxW(p.bbox));
  }
  h(p: Part): number {
    return r2(bboxH(p.bbox));
  }
  mat(p: Part): string {
    return MATERIAL_LABEL[p.material] ?? p.material;
  }
  err(p: Part): string | null {
    const r = this.store.rules().find((x) => x.level === 'error' && x.targetIds.includes(p.id));
    return r ? r.message : null;
  }
}
