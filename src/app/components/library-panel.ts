import { Component, computed, inject, signal } from '@angular/core';
import { CdkDrag, CdkDragPlaceholder, CdkDragPreview, CdkDropList } from '@angular/cdk/drag-drop';
import { DeviceDef, removeDiacritics } from '../geometry';
import { ProjectStore } from '../core/project.store';
import { DeviceIcon } from './device-icon';
import { vnd } from '../core/export.service';

const DEVICE_CATS = ['ACB', 'MCCB/MCB', 'Đo lường', 'Điều khiển & báo', 'Tụ bù & contactor'];

@Component({
  selector: 'app-library-panel',
  imports: [CdkDropList, CdkDrag, CdkDragPreview, CdkDragPlaceholder, DeviceIcon],
  template: `
    <div class="panel-title">Thư viện <span class="muted small">kéo thả hoặc + Thêm</span></div>
    <div class="filters">
      <input class="input" placeholder="🔍 Tìm model, tên, dòng định mức…" [value]="q()" (input)="q.set($any($event.target).value)" />
      <div class="grid-2">
        <select class="input" [value]="brand()" (change)="brand.set($any($event.target).value); series.set('')">
          <option value="">Hãng: tất cả</option>
          @for (b of brands(); track b) {
            <option [value]="b">{{ b }}</option>
          }
        </select>
        <select class="input" [value]="series()" (change)="series.set($any($event.target).value)">
          <option value="">Dòng: tất cả</option>
          @for (s of seriesList(); track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
      </div>
    </div>

    <!-- Vỏ tủ -->
    <div class="cat">
      <button class="cat-h" (click)="toggle('vo')">{{ open('vo') ? '▾' : '▸' }} Vỏ tủ <span class="badge grey">{{ store.cat.templates.length }}</span></button>
      @if (open('vo')) {
        <div class="vo-list">
          @for (t of store.cat.templates; track t.id) {
            <button class="vo" [class.on]="store.project().cabinetType === t.id" (click)="pickTemplate(t.id)">
              <b>{{ t.id }}</b><span class="mono small">{{ t.enclosure.H }}×{{ t.enclosure.W }}×{{ t.enclosure.D }}</span>
            </button>
          }
        </div>
      }
    </div>

    <div cdkDropList id="library" class="drop-src" [cdkDropListConnectedTo]="['canvas-drop']" [cdkDropListSortingDisabled]="true" [cdkDropListEnterPredicate]="noEnter">
      @for (c of cats; track c) {
        @if (byCat()[c]?.length) {
          <div class="cat">
            <button class="cat-h" (click)="toggle(c)">{{ open(c) ? '▾' : '▸' }} {{ c }} <span class="badge grey">{{ byCat()[c].length }}</span></button>
            @if (open(c)) {
              <div class="cards">
                @for (d of byCat()[c]; track d.id) {
                  <div class="dcard" cdkDrag [cdkDragData]="d.id" [title]="'Kéo vào canvas mặt trước — ' + d.name">
                    <div class="ico"><app-device-icon [def]="d" [size]="44" /></div>
                    <div class="body">
                      <b class="model">{{ d.model }}</b>
                      <span class="small">{{ d.name }}</span>
                      <span class="muted small mono">{{ d.size.h }}×{{ d.size.w }}×{{ d.size.d }} · {{ d.mount === 'door' ? 'gắn cửa' : 'tấm đế' }}</span>
                      <div class="foot">
                        <span class="price">{{ price(d.price) }}</span>
                        <button class="btn sm primary" (click)="store.addDevice(d.id)" (mousedown)="$event.stopPropagation()" (touchstart)="$event.stopPropagation()">+ Thêm</button>
                      </div>
                    </div>
                    <div *cdkDragPreview class="drag-preview">
                      <app-device-icon [def]="d" [size]="40" />
                      <span><b>{{ d.model }}</b><br /><span class="small">{{ d.size.w }}×{{ d.size.h }} mm</span></span>
                    </div>
                    <div *cdkDragPlaceholder class="dcard ph"><b class="model">{{ d.model }}</b></div>
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- Thanh cái -->
    <div class="cat">
      <button class="cat-h" (click)="toggle('tc')">{{ open('tc') ? '▾' : '▸' }} Thanh cái <span class="badge grey">{{ store.cat.busbars.length }}</span></button>
      @if (open('tc')) {
        <div class="bus">
          @for (b of store.cat.busbars; track b.ratedA) {
            <button class="vo" [class.on]="store.project().busbar.ratedA === b.ratedA" (click)="store.setBusbar({ ratedA: b.ratedA }); store.step.set(4)">
              <b>{{ b.ratedA }} A</b><span class="mono small">Cu {{ b.w }}×{{ b.t }}</span>
            </button>
          }
        </div>
      }
    </div>

    <!-- Phụ kiện -->
    <div class="cat">
      <button class="cat-h" (click)="toggle('pk')">{{ open('pk') ? '▾' : '▸' }} Phụ kiện <span class="badge grey">{{ store.cat.accessories.length }}</span></button>
      @if (open('pk')) {
        <div class="acc">
          @for (a of store.cat.accessories; track a.id) {
            <div class="acc-row">
              <span><b>{{ a.name }}</b><br /><span class="muted small">{{ a.spec }} · {{ price(a.price) }}/{{ a.unit }}</span></span>
              <span class="mono">{{ accQty(a.id) }}</span>
              <button class="btn sm" (click)="store.setAccessoryQty(a.id, accQty(a.id) + 1)">+1</button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; padding-bottom: 20px; }
    .filters { padding: 0 10px 6px; display: flex; flex-direction: column; gap: 6px; }
    .cat { border-top: 1px solid var(--steel-100); }
    .cat-h { width: 100%; text-align: left; border: 0; background: none; padding: 8px 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .cat-h:hover { background: var(--steel-50); }
    .cat-h .badge { margin-left: auto; }
    .cards { display: flex; flex-direction: column; gap: 6px; padding: 2px 10px 10px; }
    .dcard { display: flex; gap: 8px; padding: 8px; border: 1px solid var(--steel-200); border-radius: 8px; background: #fff; cursor: grab; }
    .dcard:hover { border-color: var(--accent); box-shadow: var(--shadow); }
    .dcard.ph { opacity: .4; border-style: dashed; }
    .ico { width: 48px; height: 48px; display: grid; place-items: center; background: var(--steel-50); border-radius: 6px; flex: none; }
    .body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
    .model { font-size: 12.5px; }
    .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 3px; }
    .price { font-weight: 700; color: var(--accent); }
    .drag-preview { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #fff; border: 2px solid var(--accent); border-radius: 8px; }
    .vo-list, .bus { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 2px 10px 10px; }
    .vo { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 8px; border: 1px solid var(--steel-200); border-radius: 6px; background: #fff; cursor: pointer; }
    .vo.on { border-color: var(--accent); background: var(--accent-50); }
    .acc { padding: 2px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
    .acc-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }
  `,
})
export class LibraryPanel {
  readonly store = inject(ProjectStore);
  readonly cats = DEVICE_CATS;
  readonly q = signal('');
  readonly brand = signal('');
  readonly series = signal('');
  private readonly opened = signal<Set<string>>(new Set(['ACB', 'MCCB/MCB', 'Đo lường', 'Điều khiển & báo', 'Tụ bù & contactor']));

  readonly brands = computed(() => [...new Set(this.store.cat.devices.map((d) => d.brand))].sort());
  readonly seriesList = computed(() => [...new Set(this.store.cat.devices.filter((d) => !this.brand() || d.brand === this.brand()).map((d) => d.series))].sort());

  readonly filtered = computed(() => {
    const q = removeDiacritics(this.q().toLowerCase().trim());
    return this.store.cat.devices.filter((d) => {
      if (this.brand() && d.brand !== this.brand()) return false;
      if (this.series() && d.series !== this.series()) return false;
      if (!q) return true;
      const hay = removeDiacritics(`${d.model} ${d.name} ${d.brand} ${d.series} ${d.ratedCurrent ?? ''}a ${d.type}`.toLowerCase());
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
  });

  readonly byCat = computed(() => {
    const m: Record<string, DeviceDef[]> = {};
    for (const d of this.filtered()) (m[d.category] ??= []).push(d);
    return m;
  });

  readonly noEnter = (): boolean => false;

  open(c: string): boolean {
    return this.opened().has(c) || !!this.q();
  }

  toggle(c: string): void {
    this.opened.update((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  }

  pickTemplate(id: 'DB' | 'MSB' | 'ATS' | 'CAP'): void {
    if (id === this.store.project().cabinetType) return;
    if (confirm('Đổi loại tủ sẽ nạp lại thông số vỏ theo mẫu (giữ thiết bị đã đặt). Tiếp tục?')) this.store.chooseTemplate(id);
  }

  accQty(id: string): number {
    return this.store.project().accessories.find((a) => a.id === id)?.qty ?? 0;
  }

  price(v: number): string {
    return vnd(v);
  }
}
