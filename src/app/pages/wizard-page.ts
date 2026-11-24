import { Component, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProjectStore } from '../core/project.store';
import { View3d } from '../components/view-3d';
import { ViewerService } from '../core/viewer.service';
import { WizardService } from '../wizard/wizard.service';
import { Front2d } from '../wizard/front-2d';
import { PriceCounter } from '../wizard/price-counter';
import { StepTypeComponent } from '../wizard/steps/step-type.component';
import { StepSizeComponent } from '../wizard/steps/step-size.component';
import { StepMaterialComponent } from '../wizard/steps/step-material.component';
import { StepProtectionComponent } from '../wizard/steps/step-protection.component';
import { StepDoorComponent } from '../wizard/steps/step-door.component';
import { StepDevicesComponent } from '../wizard/steps/step-devices.component';
import { StepBusbarComponent } from '../wizard/steps/step-busbar.component';
import { StepOrderComponent } from '../wizard/steps/step-order.component';

/** Trang cấu hình dạng wizard: /cau-hinh/:id ('moi' = tạo mới). */
@Component({
  selector: 'app-wizard-page',
  imports: [
    RouterLink,
    View3d,
    Front2d,
    PriceCounter,
    StepTypeComponent,
    StepSizeComponent,
    StepMaterialComponent,
    StepProtectionComponent,
    StepDoorComponent,
    StepDevicesComponent,
    StepBusbarComponent,
    StepOrderComponent,
  ],
  templateUrl: './wizard-page.html',
  styleUrl: './wizard-page.scss',
})
export class WizardPage {
  readonly id = input<string>('moi');
  readonly store = inject(ProjectStore);
  readonly wz = inject(WizardService);
  private readonly router = inject(Router);
  private readonly viewer = inject(ViewerService);
  readonly angles = [0, 30, 90, 150];

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(async () => {
        const real = await this.store.ensureProject(id);
        if (!real) return void this.router.navigate(['/cau-hinh', 'moi'], { replaceUrl: true });
        this.wz.reset(this.store.project());
        if (real !== id) void this.router.navigate(['/cau-hinh', real], { replaceUrl: true });
      });
    });
  }

  primary(): void {
    if (this.wz.step() < 8) return this.wz.next();
    void this.finish();
  }

  /** Hoàn tất đơn: chụp ảnh render (cửa mở), đánh dấu đơn xong, sang trang Kết quả. */
  async finish(): Promise<void> {
    if (this.wz.hasErrors()) return;
    const thumb = this.viewer.snapshot(480, 380, 90);
    this.store.update((p) => {
      p.status = 'done';
      p.completedAt = new Date().toISOString();
      p.filesGeneratedAt = undefined;
      if (thumb) p.thumbnail = thumb;
    });
    await this.store.saveNow(false);
    void this.router.navigate(['/don-hang', this.store.project().id]);
  }
}
