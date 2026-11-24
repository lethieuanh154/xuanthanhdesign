import { Component, effect, HostListener, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectStore, ViewTab } from '../core/project.store';
import { AppHeader } from '../components/app-header';
import { Stepper } from '../components/stepper';
import { TypePicker } from '../components/type-picker';
import { LibraryPanel } from '../components/library-panel';
import { FrontCanvas } from '../components/front-canvas';
import { View3d } from '../components/view-3d';
import { FlatView } from '../components/flat-view';
import { NestingView } from '../components/nesting-view';
import { RightPanel } from '../components/right-panel';
import { PartsTable } from '../components/parts-table';
import { ExportPanel } from '../components/export-panel';

@Component({
  selector: 'app-advanced-page',
  imports: [AppHeader, Stepper, TypePicker, LibraryPanel, FrontCanvas, View3d, FlatView, NestingView, RightPanel, PartsTable, ExportPanel],
  templateUrl: './advanced-page.html',
  styleUrl: './advanced-page.scss',
})
/** Chế độ nâng cao (giao diện nhiều panel cũ) cho bộ phận Thiết kế. Route /nang-cao/:id */
export class AdvancedPage {
  readonly id = input<string>('');
  readonly store = inject(ProjectStore);
  private readonly router = inject(Router);

  constructor() {
    // dùng chung ProjectStore với wizard → dữ liệu đồng bộ hai chiều
    effect(() => {
      const id = this.id();
      untracked(async () => {
        const real = await this.store.ensureProject(id);
        if (!real) return void this.router.navigate(['/cau-hinh', 'moi'], { replaceUrl: true });
        if (id === 'moi') this.store.step.set(1);
        else if (this.store.step() === 1 && this.store.project().devices.length) this.store.step.set(3);
        if (real !== id) void this.router.navigate(['/nang-cao', real], { replaceUrl: true });
      });
    });
  }

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
