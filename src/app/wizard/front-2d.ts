import { Component, computed, ElementRef, inject, input, viewChild } from '@angular/core';
import { ProjectStore, snap } from '../core/project.store';
import { coverWindows, deviceCutout, deviceRect, holeBBox, lockX } from '../geometry';
import { ralHex } from '../three/ral';

interface DevView {
  uid: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door: boolean;
  breaker: boolean;
  round: boolean;
  color: string;
  label: string;
  level: 'ok' | 'warn' | 'error';
  sel: boolean;
}

/** Mặt trước 2D gọn cho wizard (không thước, không lưới). Cửa vẽ nét đứt để thấy bên trong. */
@Component({
  selector: 'app-front-2d',
  template: `
    <svg #svg class="f2d" [attr.viewBox]="vb()" preserveAspectRatio="xMidYMid meet" (pointermove)="move($event)" (pointerup)="end()" (pointerleave)="end()" (click)="bgClick($event)">
      @if (e().base) {
        <rect [attr.x]="0" [attr.y]="e().H" [attr.width]="e().W" [attr.height]="e().base" fill="#3c4752" />
      }
      <rect x="0" y="0" [attr.width]="e().W" [attr.height]="e().H" [attr.fill]="shell()" stroke="#3c4752" stroke-width="3" />
      <rect [attr.x]="lay().plate.x" [attr.y]="Y(lay().plate.y + lay().plate.h)" [attr.width]="lay().plate.w" [attr.height]="lay().plate.h" fill="#eef0f2" stroke="#b5bec7" stroke-width="1.5" />
      @for (s of lay().sections.slice(0, -1); track s.index) {
        <line x1="0" [attr.y1]="Y(s.y0)" [attr.x2]="e().W" [attr.y2]="Y(s.y0)" stroke="#6b7783" stroke-width="2" stroke-dasharray="12 7" />
      }
      @for (b of lay().bars; track b.phase) {
        <rect [attr.x]="b.rect.x" [attr.y]="Y(b.rect.y + b.rect.h)" [attr.width]="b.rect.w" [attr.height]="b.rect.h" fill="#C87533" opacity=".75" rx="1" />
      }
      @for (l of lay().leaves; track l.id) {
        <rect [attr.x]="l.rect.x" [attr.y]="Y(l.rect.y + l.rect.h)" [attr.width]="l.rect.w" [attr.height]="l.rect.h" fill="none" stroke="#1E5AA8" stroke-width="2" stroke-dasharray="10 6" [attr.opacity]="l.carriesCutouts ? 0.85 : 0.4" />
        @if (l.hasLock) {
          <rect [attr.x]="l.rect.x + lockXOf(l) - 9" [attr.y]="Y(l.rect.y + l.rect.h / 2 + 45)" width="18" height="90" rx="4" fill="#2f363d" opacity=".55" />
        }
      }
      @if (lay().cover; as cv) {
        <rect [attr.x]="cv.x" [attr.y]="Y(cv.y + cv.h)" [attr.width]="cv.w" [attr.height]="cv.h" fill="none" stroke="#8a6d00" stroke-width="2" stroke-dasharray="3 5" />
        @for (wn of windows(); track $index) {
          <rect [attr.x]="wn.rect.x" [attr.y]="Y(wn.rect.y + wn.rect.h)" [attr.width]="wn.rect.w" [attr.height]="wn.rect.h" fill="rgba(199,145,0,.08)" stroke="#c79100" stroke-width="2" stroke-dasharray="6 4" />
        }
      }
      @for (c of cuts(); track $index) {
        <rect [attr.x]="c.x" [attr.y]="c.y" [attr.width]="c.w" [attr.height]="c.h" fill="none" stroke="#7fb3ff" stroke-width="2" stroke-dasharray="6 4" />
      }
      @for (d of devs(); track d.uid) {
        <g class="dev" [attr.transform]="'translate(' + d.x + ' ' + d.y + ')'" (pointerdown)="start($event, d.uid)" (click)="$event.stopPropagation()">
          <rect [attr.width]="d.w" [attr.height]="d.h" rx="3" [attr.fill]="d.door ? '#e4ecf7' : d.breaker ? '#30363d' : '#4f5962'" [attr.stroke]="d.level === 'error' ? '#E53935' : d.level === 'warn' ? '#FB8C00' : d.sel ? '#1E5AA8' : '#11161b'" [attr.stroke-width]="d.level !== 'ok' ? 5 : d.sel ? 4 : 1.2" />
          @if (d.level === 'error') {
            <rect [attr.width]="d.w" [attr.height]="d.h" rx="3" fill="rgba(229,57,53,.3)" />
          }
          @if (d.round) {
            <circle [attr.cx]="d.w / 2" [attr.cy]="d.h / 2" [attr.r]="Math.min(d.w, d.h) * 0.36" [attr.fill]="d.color" stroke="#11161b" stroke-width="1.5" />
          } @else if (d.breaker) {
            <rect [attr.x]="d.w * 0.4" [attr.y]="d.h * 0.34" [attr.width]="d.w * 0.2" [attr.height]="d.h * 0.24" fill="#e53935" rx="2" />
          } @else if (d.door) {
            <rect [attr.x]="d.w * 0.12" [attr.y]="d.h * 0.12" [attr.width]="d.w * 0.76" [attr.height]="d.h * 0.42" fill="#103b23" />
          }
          @if (d.w >= 50 && d.h >= 50) {
            <text [attr.x]="d.w / 2" [attr.y]="d.h * 0.86" text-anchor="middle" [attr.font-size]="Math.min(d.w / 7, 13)" [attr.fill]="d.door ? '#1f262e' : '#fff'">{{ d.label }}</text>
          }
        </g>
      }
      @if (arrowBox(); as a) {
        <rect [attr.x]="a.x - 6" [attr.y]="a.y - 6" [attr.width]="a.w + 12" [attr.height]="a.h + 12" fill="none" stroke="#1E5AA8" stroke-width="2" stroke-dasharray="6 4" />
        <g class="ar" (click)="nudge($event, 0, 5)"><circle [attr.cx]="a.x + a.w / 2" [attr.cy]="a.y - 34" [attr.r]="ar()" /><path [attr.d]="tri(a.x + a.w / 2, a.y - 34, 'up')" /></g>
        <g class="ar" (click)="nudge($event, 0, -5)"><circle [attr.cx]="a.x + a.w / 2" [attr.cy]="a.y + a.h + 34" [attr.r]="ar()" /><path [attr.d]="tri(a.x + a.w / 2, a.y + a.h + 34, 'down')" /></g>
        <g class="ar" (click)="nudge($event, -5, 0)"><circle [attr.cx]="a.x - 34" [attr.cy]="a.y + a.h / 2" [attr.r]="ar()" /><path [attr.d]="tri(a.x - 34, a.y + a.h / 2, 'left')" /></g>
        <g class="ar" (click)="nudge($event, 5, 0)"><circle [attr.cx]="a.x + a.w + 34" [attr.cy]="a.y + a.h / 2" [attr.r]="ar()" /><path [attr.d]="tri(a.x + a.w + 34, a.y + a.h / 2, 'right')" /></g>
      }
      <text [attr.x]="e().W / 2" y="-22" text-anchor="middle" font-size="22" fill="#3c4752">{{ e().W }}</text>
      <text [attr.x]="-24" [attr.y]="e().H / 2" text-anchor="middle" font-size="22" fill="#3c4752" [attr.transform]="'rotate(-90 -24 ' + e().H / 2 + ')'">{{ e().H }}</text>
    </svg>
  `,
  styles: `
    :host { display: block; height: 100%; background: #e9ecef; }
    .f2d { width: 100%; height: 100%; display: block; touch-action: none; user-select: none; }
    .dev { cursor: grab; }
    .ar { cursor: pointer; }
    .ar circle { fill: #1E5AA8; }
    .ar path { fill: #fff; }
    .ar:hover circle { fill: #174a8c; }
  `,
})
export class Front2d {
  readonly store = inject(ProjectStore);
  readonly arrows = input(false);
  readonly Math = Math;
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private drag: { uid: string; ids: string[]; sx: number; sy: number; last: string; orig: Map<string, { x: number; y: number }> } | null = null;

  readonly e = computed(() => this.store.project().enclosure);
  readonly lay = computed(() => this.store.layout());
  readonly shell = computed(() => (this.e().material === 'SPCC' ? ralHex(this.e().ral) : this.e().material === 'GALV' ? '#c3c8cd' : '#d8dbde'));
  readonly vb = computed(() => {
    const e = this.e();
    const pad = Math.max(e.W, e.H) * 0.12 + 60;
    return `${-pad} ${-pad} ${e.W + 2 * pad} ${e.H + e.base + 2 * pad}`;
  });
  readonly ar = computed(() => 15);

  readonly devs = computed<DevView[]>(() => {
    const st = this.store;
    const H = this.e().H;
    const sel = new Set(st.selectedIds());
    const iss = st.issues();
    return st
      .project()
      .devices.map((pd) => {
        const def = st.defOf(pd.deviceId);
        if (!def) return null;
        const r = deviceRect(pd, def);
        const door = pd.mount === 'door';
        return {
          uid: pd.uid,
          x: r.x,
          y: H - r.y - r.h,
          w: r.w,
          h: r.h,
          door,
          breaker: !!def.isBreaker,
          round: door && def.doorCutout?.shape === 'circle',
          color: def.color ?? '#9aa5b1',
          label: pd.label || def.model,
          level: iss.get(pd.uid)?.level ?? 'ok',
          sel: sel.has(pd.uid),
        } as DevView;
      })
      .filter((v): v is DevView => !!v)
      .sort((a, b) => Number(a.door) - Number(b.door));
  });

  readonly cuts = computed(() => {
    const st = this.store;
    const H = this.e().H;
    return st
      .project()
      .devices.filter((d) => d.mount === 'plate' && d.doorCutout)
      .map((pd) => {
        const def = st.defOf(pd.deviceId);
        const c = def && deviceCutout(pd, def);
        if (!c) return null;
        const b = holeBBox(c);
        return { x: b.minX, y: H - b.maxY, w: b.maxX - b.minX, h: b.maxY - b.minY };
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
  });

  readonly windows = computed(() => coverWindows(this.store.project(), this.store.cat));

  readonly arrowBox = computed(() => {
    if (!this.arrows()) return null;
    const sel = this.devs().filter((d) => d.sel);
    if (!sel.length) return null;
    const x0 = Math.min(...sel.map((d) => d.x)),
      y0 = Math.min(...sel.map((d) => d.y));
    const x1 = Math.max(...sel.map((d) => d.x + d.w)),
      y1 = Math.max(...sel.map((d) => d.y + d.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });

  Y(y: number): number {
    return this.e().H - y;
  }

  lockXOf(l: Parameters<typeof lockX>[0]): number {
    return lockX(l);
  }

  tri(cx: number, cy: number, d: 'up' | 'down' | 'left' | 'right'): string {
    const s = 7;
    if (d === 'up') return `M${cx} ${cy - s} L${cx + s} ${cy + s * 0.6} L${cx - s} ${cy + s * 0.6} Z`;
    if (d === 'down') return `M${cx} ${cy + s} L${cx + s} ${cy - s * 0.6} L${cx - s} ${cy - s * 0.6} Z`;
    if (d === 'left') return `M${cx - s} ${cy} L${cx + s * 0.6} ${cy - s} L${cx + s * 0.6} ${cy + s} Z`;
    return `M${cx + s} ${cy} L${cx - s * 0.6} ${cy - s} L${cx - s * 0.6} ${cy + s} Z`;
  }

  nudge(ev: Event, dx: number, dy: number): void {
    ev.stopPropagation();
    this.store.nudge(dx, dy);
  }

  private toMm(ev: PointerEvent): { x: number; y: number } {
    const svg = this.svg().nativeElement;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  }

  /** Chọn cả nhóm thiết bị (1 dòng trong bảng) rồi cho kéo. */
  start(ev: PointerEvent, uid: string): void {
    ev.stopPropagation();
    const b = this.store.batches().find((x) => x.uids.includes(uid));
    const ids = this.store.selectedIds().includes(uid) ? this.store.selectedIds() : b ? b.uids : [uid];
    this.store.selectedIds.set(ids);
    const p = this.toMm(ev);
    const orig = new Map(this.store.project().devices.filter((d) => ids.includes(d.uid)).map((d) => [d.uid, { x: d.x, y: d.y }]));
    this.drag = { uid, ids, sx: p.x, sy: p.y, last: '0,0', orig };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }

  move(ev: PointerEvent): void {
    if (!this.drag) return;
    const p = this.toMm(ev);
    const dx = snap(p.x - this.drag.sx),
      dy = snap(-(p.y - this.drag.sy));
    const d = this.drag;
    if (`${dx},${dy}` === d.last) return;
    d.last = `${dx},${dy}`;
    this.store.update((pr) =>
      pr.devices.forEach((x) => {
        const o = d.orig.get(x.uid);
        if (o) {
          x.x = o.x + dx;
          x.y = o.y + dy;
        }
      }),
    );
  }

  end(): void {
    this.drag = null;
  }

  bgClick(ev: MouseEvent): void {
    if (!this.drag && ev.target === this.svg().nativeElement) this.store.select(null);
  }
}
