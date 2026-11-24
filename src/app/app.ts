import { Component, HostListener, inject } from '@angular/core';
import { ProjectStore, ViewTab } from './core/project.store';
import { AppHeader } from './components/app-header';
import { Stepper } from './components/stepper';
import { TypePicker } from './components/type-picker';
import { LibraryPanel } from './components/library-panel';
import { FrontCanvas } from './components/front-canvas';
import { View3d } from './components/view-3d';
import { FlatView } from './components/flat-view';
import { NestingView } from './components/nesting-view';
import { RightPanel } from './components/right-panel';
import { PartsTable } from './components/parts-table';
import { ExportPanel } from './components/export-panel';
import { PrintSheet } from './components/print-sheet';

@Component({
  selector: 'app-root',
  imports: [AppHeader, Stepper, TypePicker, LibraryPanel, FrontCanvas, View3d, FlatView, NestingView, RightPanel, PartsTable, ExportPanel, PrintSheet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly store = inject(ProjectStore);
  readonly tabs: { id: ViewTab; label: string }[] = [
    { id: 'front', label: 'Mặt trước' },
    { id: '3d', label: '3D' },
    { id: 'flat', label: 'Trải phẳng' },
    { id: 'nest', label: 'Sắp tôn' },
  ];

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.store.view() !== 'front' || this.store.step() === 5) return;
    const s = this.store;
    const step = s.snapOn() ? 5 : 1;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (s.selectedIds().length) {
        s.removeSelected();
        e.preventDefault();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      s.duplicateSelected();
    } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
      s.rotateSelected();
    } else if (e.key === 'Escape') {
      s.select(null);
    } else if (e.key.startsWith('Arrow') && s.selectedIds().length) {
      e.preventDefault();
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key] ?? [0, 0];
      s.nudge(d[0], d[1]);
    }
  }
}
