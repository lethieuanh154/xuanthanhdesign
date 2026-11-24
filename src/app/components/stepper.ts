import { Component, inject } from '@angular/core';
import { ProjectStore, STEPS } from '../core/project.store';

const CIRCLED = ['①', '②', '③', '④', '⑤'];

@Component({
  selector: 'app-stepper',
  template: `
    <nav class="stepper no-print">
      @for (s of steps; track s.n; let last = $last) {
        <button class="step" [class.on]="store.step() === s.n" [class.done]="store.step() > s.n" (click)="store.step.set(s.n)">
          <span class="n">{{ circled[s.n - 1] }}</span>
          <span>{{ s.label }}</span>
          @if (store.stepErrors()[s.n]; as c) {
            <span class="badge" [title]="c + ' lỗi ở bước này'">{{ c }}</span>
          }
        </button>
        @if (!last) {
          <span class="line"></span>
        }
      }
      <span class="spacer"></span>
      <button class="btn sm" [disabled]="store.step() === 1" (click)="store.step.set($any(store.step() - 1))">‹ Trước</button>
      <button class="btn sm primary" [disabled]="store.step() === 5" (click)="store.step.set($any(store.step() + 1))">Tiếp ›</button>
    </nav>
  `,
  styles: `
    .stepper { height: 46px; display: flex; align-items: center; gap: 4px; padding: 0 14px; background: #fff; border-bottom: 1px solid var(--steel-200); }
    .step { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: 16px; background: none; cursor: pointer; color: var(--steel-500); font-weight: 600; }
    .step:hover { background: var(--steel-50); }
    .step .n { font-size: 16px; }
    .step.done { color: var(--steel-700); }
    .step.on { background: var(--accent); color: #fff; }
    .line { width: 26px; height: 2px; background: var(--steel-200); }
    .spacer { flex: 1; }
    .stepper .btn + .btn { margin-left: 4px; }
  `,
})
export class Stepper {
  readonly store = inject(ProjectStore);
  readonly steps = STEPS;
  readonly circled = CIRCLED;
}
