import { inject, Injectable, signal } from '@angular/core';
import { CatalogService } from '../core/catalog.service';
import { computeLayout, createProject, Project } from '../geometry';

/** Ảnh render tủ (offscreen). Three.js được tải lazy để trang đầu nhẹ. */
@Injectable({ providedIn: 'root' })
export class ThumbService {
  private readonly catalog = inject(CatalogService);
  readonly templates = signal<Record<string, string>>({});
  private loading = false;

  /** Ảnh 4 loại tủ cho thẻ chọn ở bước 1 (cửa hé 25°, có sẵn bộ thiết bị mẫu). */
  async loadTemplateThumbs(): Promise<void> {
    if (this.loading || Object.keys(this.templates()).length) return;
    this.loading = true;
    const cat = this.catalog.catalog;
    const [{ renderImages }, { buildCabinet }] = await Promise.all([import('../three/stage'), import('../three/cabinet-scene')]);
    const projects = cat.templates.map((tpl) => createProject(cat, tpl));
    const urls = renderImages(
      projects.map((p) => () => buildCabinet(p, cat, computeLayout(p.enclosure, p.busbar), { showroom: true })),
      360,
      300,
      0,
    );
    const out: Record<string, string> = {};
    cat.templates.forEach((t, i) => (out[t.id] = urls[i]));
    this.templates.set(out);
    this.loading = false;
  }

  /** Ảnh 1 dự án (khi không có khung 3D đang mở). */
  async renderProject(p: Project, angle = 90): Promise<string> {
    const cat = this.catalog.catalog;
    const [{ renderImages }, { buildCabinet }] = await Promise.all([import('../three/stage'), import('../three/cabinet-scene')]);
    return renderImages([() => buildCabinet(p, cat, computeLayout(p.enclosure, p.busbar), { showroom: true })], 480, 400, angle)[0];
  }
}

