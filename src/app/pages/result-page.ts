import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProjectStore } from '../core/project.store';
import { ExportService, vnd } from '../core/export.service';
import { describeProject } from '../core/describe';
import { FlatView } from '../components/flat-view';
import { OrderList } from '../components/order-list';
import { ThumbService } from '../wizard/thumb.service';
import { dxfFileName, MATERIAL_LABEL, Part } from '../geometry';

interface Job {
  key: 'model' | 'pdf' | 'dxf' | 'docs';
  label: string;
  ms: number;
  pct: number;
}

/** Trang Kết quả: tải bản vẽ, DXF, BOM, báo giá. Route /don-hang/:id */
@Component({
  selector: 'app-result-page',
  imports: [RouterLink, FlatView, OrderList],
  templateUrl: './result-page.html',
  styleUrl: './result-page.scss',
})
export class ResultPage implements OnDestroy {
  readonly id = input<string>('');
  readonly store = inject(ProjectStore);
  readonly ex = inject(ExportService);
  private readonly router = inject(Router);
  private readonly thumbs = inject(ThumbService);
  readonly loaded = signal(false);
  readonly dxfOpen = signal(false);
  readonly jobs = signal<Job[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly p = computed(() => this.store.project());
  readonly desc = computed(() => describeProject(this.p(), this.store.cat));
  readonly created = computed(() => new Date(this.p().completedAt ?? this.p().createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }));
  readonly ready = computed(() => {
    const m: Record<string, boolean> = {};
    for (const j of this.jobs()) m[j.key] = j.pct >= 100;
    return m;
  });
  readonly flatPart = computed<Part | undefined>(() => {
    const parts = this.store.parts();
    return parts.find((x) => x.id === this.store.selectedPartId()) ?? parts.find((x) => x.group === 'cua');
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(async () => {
        const real = await this.store.ensureProject(id);
        if (!real || id === 'moi') return void this.router.navigate(['/cau-hinh', 'moi'], { replaceUrl: true });
        this.loaded.set(true);
        this.store.selectedPartId.set(this.store.parts().find((x) => x.group === 'cua')?.id ?? null);
        this.startJobs();
        if (!this.p().thumbnail) {
          const url = await this.thumbs.renderProject(this.p(), 90);
          this.store.update((p) => (p.thumbnail = url));
        }
      });
    });
  }

  /** Giả lập tạo file vài giây cho giống thật (chỉ lần đầu sau khi hoàn tất đơn). */
  private startJobs(): void {
    const n = this.store.parts().length;
    const jobs: Job[] = [
      { key: 'model', label: 'Mô hình 3D', ms: 900, pct: 0 },
      { key: 'pdf', label: 'Bản vẽ PDF', ms: 1700, pct: 0 },
      { key: 'dxf', label: `DXF (${n} chi tiết)`, ms: 2500, pct: 0 },
      { key: 'docs', label: 'BOM & báo giá', ms: 3300, pct: 0 },
    ];
    if (this.p().filesGeneratedAt) {
      this.jobs.set(jobs.map((j) => ({ ...j, pct: 100 })));
      return;
    }
    this.jobs.set(jobs);
    const t0 = performance.now();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const t = performance.now() - t0;
      const next = jobs.map((j) => ({ ...j, pct: Math.min(100, Math.round((t / j.ms) * 100)) }));
      this.jobs.set(next);
      if (next.every((j) => j.pct >= 100)) {
        clearInterval(this.timer!);
        this.timer = null;
        this.store.update((p) => (p.filesGeneratedAt = new Date().toISOString()));
      }
    }, 80);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  readonly totalSheets = computed(() => this.store.nesting().reduce((s, g) => s + g.sheets.length, 0));

  pct(v: number): number {
    return Math.round(v * 1000) / 10;
  }

  mat(m: string): string {
    return MATERIAL_LABEL[m] ?? m;
  }

  fname(p: Part): string {
    return dxfFileName(this.p().orderCode, p);
  }

  money(v: number): string {
    return vnd(v);
  }
}
