import { computed, inject, Injectable, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { RuleResult } from '../geometry';

export interface WizardStep {
  n: number;
  key: string;
  title: string;
}

/** 8 bước cấu hình. Thêm bước mới: thêm vào đây + 1 component step-* + 1 nhánh @case trong wizard-page. */
export const WIZARD_STEPS: WizardStep[] = [
  { n: 1, key: 'loai-tu', title: 'Loại tủ' },
  { n: 2, key: 'kich-thuoc', title: 'Kích thước' },
  { n: 3, key: 'vat-lieu', title: 'Vật liệu & sơn' },
  { n: 4, key: 'bao-ve', title: 'Cấp bảo vệ & thông gió' },
  { n: 5, key: 'cua-khoa', title: 'Cửa & khóa' },
  { n: 6, key: 'thiet-bi', title: 'Thiết bị' },
  { n: 7, key: 'thanh-cai', title: 'Thanh cái & phụ kiện' },
  { n: 8, key: 'don-hang', title: 'Thông tin đơn hàng' },
];

/** Luật kiểm tra (rules.ts) → bước wizard hiển thị cảnh báo. */
const RULE_STEP: Record<string, number> = {
  sheet: 2,
  'acb-section': 2,
  collision: 6,
  clearance: 6,
  'mount-area': 6,
  section: 6,
  'door-edge': 6,
  'bend-cross': 6,
  'hole-overlap': 6,
  depth: 6,
  'busbar-zone': 6,
  'cover-window': 6,
  load: 7,
};

@Injectable({ providedIn: 'root' })
export class WizardService {
  private readonly store = inject(ProjectStore);
  readonly steps = WIZARD_STEPS;
  readonly step = signal(1);
  /** Chiều trượt khi chuyển bước: 1 = sang phải, -1 = quay lại. */
  readonly dir = signal<1 | -1>(1);
  readonly maxVisited = signal(1);
  readonly doorAngle = signal(0);
  readonly hideWall = signal(false);
  readonly view = signal<'3d' | '2d'>('3d');
  readonly showArrows = signal(false);

  readonly current = computed(() => WIZARD_STEPS[this.step() - 1]);

  /** Cảnh báo (warn/error) theo từng bước. */
  readonly issues = computed(() => {
    const m: Record<number, RuleResult[]> = {};
    for (const r of this.store.rules()) {
      if (r.level === 'ok') continue;
      const n = RULE_STEP[r.rule] ?? (r.step === 3 ? 6 : r.step === 4 ? 7 : 2);
      (m[n] ??= []).push(r);
    }
    return m;
  });
  readonly errorSteps = computed(() => {
    const out = new Set<number>();
    for (const [n, list] of Object.entries(this.issues())) if (list.some((r) => r.level === 'error')) out.add(+n);
    return out;
  });
  readonly hasErrors = computed(() => this.errorSteps().size > 0);

  issuesOf(n: number): RuleResult[] {
    return this.issues()[n] ?? [];
  }

  /** Khi mở dự án đã có nội dung → cho nhảy tự do giữa các bước. */
  reset(p: { devices: unknown[]; status?: string }): void {
    this.step.set(1);
    this.maxVisited.set(p.status === 'done' || p.devices.length ? 8 : 1);
    this.doorAngle.set(0);
    this.showArrows.set(false);
  }

  go(n: number): void {
    if (n < 1 || n > 8 || n === this.step()) return;
    if (n > this.maxVisited() + 1) return;
    // rời bước Thiết bị → bỏ tô sáng thiết bị đang chọn
    if (this.step() === 6) this.store.select(null);
    this.dir.set(n > this.step() ? 1 : -1);
    this.step.set(n);
    this.maxVisited.update((m) => Math.max(m, n));
    // bước Cửa & khóa / Thiết bị: tự mở cửa 90° để nhìn vào trong
    if (n === 5 || n === 6) this.doorAngle.set(90);
    if (n === 8) this.view.set('3d');
  }

  next(): void {
    this.go(this.step() + 1);
  }

  prev(): void {
    this.go(this.step() - 1);
  }
}
