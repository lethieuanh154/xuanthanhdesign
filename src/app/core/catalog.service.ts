import { Injectable, signal } from '@angular/core';
import { Catalog } from '../geometry';

export interface CustomerSeed {
  name: string;
  contact: string;
  phone: string;
  address: string;
  province: string;
}

/** Nạp thư viện thiết bị, template, bảng chấn... từ src/assets/data/*.json. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly _catalog = signal<Catalog | null>(null);
  readonly error = signal<string | null>(null);
  /** Khách hàng mẫu cho ô gợi ý (bước 8). */
  readonly customers = signal<CustomerSeed[]>([]);

  get catalog(): Catalog {
    const c = this._catalog();
    if (!c) throw new Error('Catalog chưa được nạp');
    return c;
  }

  async load(): Promise<void> {
    const get = async <T>(name: string): Promise<T> => {
      const r = await fetch(`assets/data/${name}.json`);
      if (!r.ok) throw new Error(`Không tải được ${name}.json (${r.status})`);
      return (await r.json()) as T;
    };
    try {
      const [devices, templates, bend, busbar, accessories, pricing] = await Promise.all([
        get<{ devices: Catalog['devices'] }>('devices'),
        get<{ templates: Catalog['templates'] }>('templates'),
        get<Catalog['bend']>('bend-table'),
        get<{ busbars: Catalog['busbars'] }>('busbar'),
        get<{ accessories: Catalog['accessories'] }>('accessories'),
        get<Catalog['pricing']>('pricing'),
      ]);
      get<{ customers: CustomerSeed[] }>('customers')
        .then((c) => this.customers.set(c.customers))
        .catch(() => undefined);
      this._catalog.set({
        devices: devices.devices,
        templates: templates.templates,
        bend,
        busbars: busbar.busbars,
        accessories: accessories.accessories,
        pricing,
      });
    } catch (e) {
      this.error.set(String(e));
      throw e;
    }
  }
}
