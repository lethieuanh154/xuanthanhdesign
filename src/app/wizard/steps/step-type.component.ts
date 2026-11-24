import { Component, inject, OnInit } from '@angular/core';
import { ProjectStore } from '../../core/project.store';
import { CabinetType } from '../../geometry';
import { ThumbService } from '../thumb.service';

/** Bước 1: loại tủ — 4 thẻ lớn có ảnh render. */
@Component({
  selector: 'app-step-type',
  template: `
    <div class="choices">
      @for (t of store.cat.templates; track t.id) {
        <button class="choice tc" [class.on]="store.project().cabinetType === t.id" (click)="pick(t.id)">
          <div class="img">
            @if (thumbs.templates()[t.id]; as src) {
              <img [src]="src" [alt]="t.name" />
            } @else {
              <span class="ph"></span>
            }
          </div>
          <span>{{ short[t.id] }}</span>
          <small class="mono">{{ t.enclosure.H }}×{{ t.enclosure.W }}×{{ t.enclosure.D }}</small>
        </button>
      }
    </div>
    <p class="w-hint">{{ desc() }}</p>
  `,
  styles: `
    .tc { padding: 6px 6px 10px; }
    .img { width: 100%; aspect-ratio: 6 / 5; border-radius: 6px; overflow: hidden; background: #c9ccd0; }
    .img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ph { display: block; width: 100%; height: 100%; background: linear-gradient(110deg, #c9ccd0 30%, #d8dbde 50%, #c9ccd0 70%); background-size: 200% 100%; animation: sh 1.2s infinite linear; }
    @keyframes sh { to { background-position: -200% 0; } }
  `,
})
export class StepTypeComponent implements OnInit {
  readonly store = inject(ProjectStore);
  readonly thumbs = inject(ThumbService);
  readonly short: Record<string, string> = { DB: 'DB treo tường', MSB: 'MSB đặt sàn', ATS: 'ATS treo tường', CAP: 'Tủ tụ bù', '2L': 'Tủ 2 lớp' };

  ngOnInit(): void {
    void this.thumbs.loadTemplateThumbs();
  }

  desc(): string {
    return this.store.cat.templates.find((t) => t.id === this.store.project().cabinetType)?.description ?? '';
  }

  pick(id: CabinetType): void {
    const p = this.store.project();
    if (p.cabinetType === id) return;
    const keepName = p.name && p.name !== 'Cấu hình mới' && !/^Tủ /.test(p.name);
    this.store.chooseTemplate(id);
    if (!keepName) this.store.setMeta({ name: this.store.cat.templates.find((t) => t.id === id)!.name });
  }
}
