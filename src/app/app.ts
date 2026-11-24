import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ProjectStore } from './core/project.store';
import { PrintService } from './core/print.service';
import { PrintSheet } from './components/print-sheet';
import { QuoteSheet } from './components/quote-sheet';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PrintSheet, QuoteSheet],
  template: `
    <div class="screen"><router-outlet /></div>
    <div class="print-only">
      @if (printer.mode() === 'quote') {
        <app-quote-sheet class="quote-page" />
      } @else {
        <app-print-sheet />
      }
    </div>
    @if (store.toast(); as t) {
      <div class="toast no-print">{{ t }}</div>
    }
  `,
})
export class App {
  readonly store = inject(ProjectStore);
  readonly printer = inject(PrintService);
}
