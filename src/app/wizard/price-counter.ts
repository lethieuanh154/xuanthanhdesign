import { Component, effect, input, OnDestroy, signal, untracked } from '@angular/core';
import { vnd } from '../core/export.service';

/** Giá có hiệu ứng đếm số khi thay đổi (≈ 450 ms). */
@Component({
  selector: 'app-price-counter',
  template: `<span class="pc" [class.up]="flash() === 'up'" [class.down]="flash() === 'down'">{{ text() }}</span>`,
  styles: `
    .pc { font-variant-numeric: tabular-nums; transition: color .3s; }
    .pc.up { color: #c62828; } .pc.down { color: #2e7d32; }
  `,
})
export class PriceCounter implements OnDestroy {
  readonly value = input.required<number>();
  readonly text = signal('');
  readonly flash = signal<'up' | 'down' | null>(null);
  private shown = 0;
  private raf = 0;
  private first = true;

  constructor() {
    effect(() => {
      const target = this.value();
      untracked(() => this.animate(target));
    });
  }

  private animate(target: number): void {
    cancelAnimationFrame(this.raf);
    if (this.first) {
      this.first = false;
      this.shown = target;
      this.text.set(vnd(target));
      return;
    }
    const from = this.shown;
    if (from === target) return;
    this.flash.set(target > from ? 'up' : 'down');
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / 450);
      const ease = 1 - Math.pow(1 - k, 3);
      this.shown = Math.round(from + (target - from) * ease);
      this.text.set(vnd(this.shown));
      if (k < 1) this.raf = requestAnimationFrame(step);
      else setTimeout(() => this.flash.set(null), 250);
    };
    this.raf = requestAnimationFrame(step);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
