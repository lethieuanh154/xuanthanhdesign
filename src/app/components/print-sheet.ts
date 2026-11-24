import { Component, computed, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ProjectStore } from '../core/project.store';
import { vnd } from '../core/export.service';
import { bboxH, bboxW, deviceCutout, deviceRect, holeBBox, MATERIAL_LABEL, r2, lockX, coverWindows } from '../geometry';

const SCALES = [5, 10, 15, 20, 25, 30, 40, 50];

/** Trang in A3 ngang: bản vẽ tổng thể (3 hình chiếu) + khung tên; trang 2: BOM & chi tiết. */
@Component({
  selector: 'app-print-sheet',
  template: `
    <div class="sheet" [innerHTML]="svg()"></div>
    <div class="sheet page2">
      <h2>BẢNG KÊ VẬT TƯ — {{ p().orderCode }} — {{ p().name }}</h2>
      <table>
        <thead><tr><th>#</th><th>Nhóm</th><th>Mã</th><th>Tên</th><th>Quy cách</th><th>SL</th><th>ĐVT</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>
          @for (r of store.bom().rows; track $index) {
            <tr><td>{{ $index + 1 }}</td><td>{{ r.category }}</td><td>{{ r.code }}</td><td>{{ r.name }}</td><td>{{ r.spec }}</td><td class="r">{{ r.qty }}</td><td>{{ r.unit }}</td><td class="r">{{ money(r.unitPrice) }}</td><td class="r">{{ money(r.amount) }}</td></tr>
          }
        </tbody>
        <tfoot><tr><td colspan="8" class="r"><b>TỔNG TẠM TÍNH (chưa VAT)</b></td><td class="r"><b>{{ money(store.bom().total) }}</b></td></tr></tfoot>
      </table>
      <h2>DANH SÁCH CHI TIẾT TRẢI PHẲNG</h2>
      <table>
        <thead><tr><th>Mã</th><th>Tên</th><th>Vật liệu</th><th>Dày</th><th>SL</th><th>KT trải phẳng (mm)</th><th>Lỗ</th><th>Chấn</th></tr></thead>
        <tbody>
          @for (pt of store.parts(); track pt.id) {
            <tr><td>{{ pt.code }}</td><td>{{ pt.name }}</td><td>{{ mat(pt.material) }}</td><td class="r">{{ pt.thickness }}</td><td class="r">{{ pt.qty }}</td><td class="r">{{ dims(pt) }}</td><td class="r">{{ pt.holes.length }}</td><td class="r">{{ pt.bendLines.length }}</td></tr>
          }
        </tbody>
      </table>
      <p class="note">Kích thước thiết bị, bảng BD và đơn giá là số mẫu — cần thay bằng datasheet / số đo thực tế của xưởng trước khi sản xuất.</p>
    </div>
  `,
  styles: `
    .sheet { width: 404mm; height: 281mm; page-break-after: always; break-after: page; overflow: hidden; }
    .page2 { page-break-after: auto; break-after: auto; height: auto; font-family: var(--font); font-size: 10pt; }
    h2 { font-size: 13pt; margin: 4mm 0 2mm; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    th, td { border: 0.3mm solid #333; padding: 1mm 2mm; text-align: left; }
    th { background: #e9edf1; }
    .r { text-align: right; }
    .note { font-size: 9pt; color: #555; }
  `,
})
export class PrintSheet {
  readonly store = inject(ProjectStore);
  private readonly san = inject(DomSanitizer);
  readonly p = computed(() => this.store.project());

  readonly svg = computed<SafeHtml>(() => this.san.bypassSecurityTrustHtml(this.buildSvg()));

  money(v: number): string {
    return vnd(v);
  }
  mat(m: string): string {
    return MATERIAL_LABEL[m] ?? m;
  }
  dims(pt: { bbox: Parameters<typeof bboxW>[0] }): string {
    return `${r2(bboxW(pt.bbox))} × ${r2(bboxH(pt.bbox))}`;
  }

  private buildSvg(): string {
    const p = this.p();
    const st = this.store;
    const e = p.enclosure;
    const lay = st.layout();
    const PW = 404,
      PH = 281;
    const tall = e.H + e.base;
    // chọn tỉ lệ chuẩn để 3 hình chiếu vừa vùng vẽ
    const availW = PW - 30,
      availH = PH - 70;
    const N = SCALES.find((n) => (2 * e.W + e.D + 3 * 260) / n <= availW && (tall + 260) / n <= availH) ?? 60;
    const k = 1 / N;
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const out: string[] = [];
    const L = (x1: number, y1: number, x2: number, y2: number, w = 0.25, dash = ''): void => {
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
    };
    const R = (x: number, y: number, w: number, h: number, sw = 0.35, fill = 'none', dash = ''): void => {
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#000" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
    };
    const T = (x: number, y: number, s: string, size = 2.5, anchor = 'middle', weight = 'normal', rot = 0): void => {
      out.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" font-family="Arial" ${rot ? `transform="rotate(${rot} ${x} ${y})"` : ''}>${esc(s)}</text>`);
    };
    const dimH = (x1: number, x2: number, y: number, label: string): void => {
      L(x1, y, x2, y, 0.18);
      L(x1, y - 1.5, x1, y + 1.5, 0.18);
      L(x2, y - 1.5, x2, y + 1.5, 0.18);
      T((x1 + x2) / 2, y - 1, label, 2.2);
    };
    const dimV = (x: number, y1: number, y2: number, label: string): void => {
      L(x, y1, x, y2, 0.18);
      L(x - 1.5, y1, x + 1.5, y1, 0.18);
      L(x - 1.5, y2, x + 1.5, y2, 0.18);
      T(x - 1, (y1 + y2) / 2, label, 2.2, 'middle', 'normal', -90);
    };

    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}mm" height="${PH}mm">`);
    out.push(`<rect x="0" y="0" width="${PW}" height="${PH}" fill="#fff"/>`);
    R(5, 5, PW - 10, PH - 10, 0.7);

    const gapX = (availW - (2 * e.W + e.D) * k) / 4;
    const top = 20 + (availH - tall * k) / 2;
    const yB = (y: number): number => top + (e.H - y) * k; // thân tủ → giấy
    // ---- Hình 1: mặt ngoài (cửa đóng) ----
    const x1 = 15 + gapX;
    const X1 = (x: number): number => x1 + x * k;
    R(X1(0), yB(e.H), e.W * k, e.H * k, 0.5);
    if (e.base) R(X1(0), yB(0), e.W * k, e.base * k, 0.35, '#ddd');
    for (const leaf of lay.leaves) {
      R(X1(leaf.rect.x), yB(leaf.rect.y + leaf.rect.h), leaf.rect.w * k, leaf.rect.h * k, leaf.carriesCutouts ? 0.35 : 0.25, 'none', leaf.id === 'inner' ? '1.5 1' : '');
      if (leaf.hasLock) {
        const lx = leaf.rect.x + lockX(leaf);
        out.push(`<circle cx="${X1(lx)}" cy="${yB(leaf.rect.y + leaf.rect.h / 2)}" r="${11.25 * k}" fill="none" stroke="#000" stroke-width="0.25"/>`);
      }
    }
    for (const pd of p.devices) {
      const def = st.defOf(pd.deviceId);
      if (!def) continue;
      const cut = deviceCutout(pd, def);
      if (!cut) continue;
      if (cut.kind === 'circle') out.push(`<circle cx="${X1(cut.cx)}" cy="${yB(cut.cy)}" r="${cut.r * k}" fill="none" stroke="#000" stroke-width="0.3"/>`);
      else {
        const bb = holeBBox(cut);
        R(X1(bb.minX), yB(bb.maxY), (bb.maxX - bb.minX) * k, (bb.maxY - bb.minY) * k, 0.3);
      }
      const r = deviceRect(pd, def);
      if (pd.mount === 'door') T(X1(r.x + r.w / 2), yB(r.y) + 2.6, pd.label || def.model, 1.6);
    }
    dimH(X1(0), X1(e.W), yB(e.H) - 6, `${e.W}`);
    dimV(X1(0) - 6, yB(e.H), yB(0), `${e.H}`);
    if (e.base) dimV(X1(0) - 6, yB(0), yB(-e.base), `${e.base}`);
    T(X1(e.W / 2), yB(-e.base) + 9, 'MẶT NGOÀI (CỬA ĐÓNG)', 3, 'middle', 'bold');

    // ---- Hình 2: bố trí tấm đế ----
    const x2 = x1 + e.W * k + gapX;
    const X2 = (x: number): number => x2 + x * k;
    R(X2(0), yB(e.H), e.W * k, e.H * k, 0.5);
    if (e.base) R(X2(0), yB(0), e.W * k, e.base * k, 0.35, '#ddd');
    R(X2(lay.plate.x), yB(lay.plate.y + lay.plate.h), lay.plate.w * k, lay.plate.h * k, 0.25, '#f6f6f6');
    lay.sections.slice(0, -1).forEach((s) => L(X2(0), yB(s.y0), X2(e.W), yB(s.y0), 0.25, '2 1'));
    if (lay.cover) {
      R(X2(lay.cover.x), yB(lay.cover.y + lay.cover.h), lay.cover.w * k, lay.cover.h * k, 0.25, 'none', '0.8 0.8');
      for (const wdw of coverWindows(p, st.cat)) R(X2(wdw.rect.x), yB(wdw.rect.y + wdw.rect.h), wdw.rect.w * k, wdw.rect.h * k, 0.2, 'none', '1.5 0.8');
    }
    for (const b of lay.bars) R(X2(b.rect.x), yB(b.rect.y + b.rect.h), b.rect.w * k, b.rect.h * k, 0.15, '#e8c39e');
    for (const pd of p.devices.filter((d) => d.mount === 'plate')) {
      const def = st.defOf(pd.deviceId);
      if (!def) continue;
      const r = deviceRect(pd, def);
      R(X2(r.x), yB(r.y + r.h), r.w * k, r.h * k, 0.3, '#e3e3e3');
      T(X2(r.x + r.w / 2), yB(r.y + r.h / 2) + 0.8, pd.label || def.model, Math.min(2, (r.w * k) / 6));
    }
    lay.sections.forEach((s) => dimV(X2(e.W) + 6, yB(s.y1), yB(s.y0), `${s.h}`));
    T(X2(e.W / 2), yB(-e.base) + 9, 'BỐ TRÍ THIẾT BỊ (BỎ CỬA)', 3, 'middle', 'bold');

    // ---- Hình 3: mặt hông ----
    const x3 = x2 + e.W * k + gapX;
    const X3 = (z: number): number => x3 + z * k;
    R(X3(0), yB(e.H), e.D * k, e.H * k, 0.5);
    R(X3(0), yB(e.H) - 0.8, (e.D + 20) * k, 0.8, 0.3);
    if (e.base) R(X3(0), yB(0), e.D * k, e.base * k, 0.35, '#ddd');
    if (e.vent !== 'none') {
      const ys = e.vent === 'top_bottom' ? [90, e.H - 154] : [90];
      for (const y0 of ys) for (let i = 0; i < 5; i++) L(X3(e.D / 2 - 60), yB(y0 + i * 16), X3(e.D / 2 + 60), yB(y0 + i * 16), 0.5);
    }
    dimH(X3(0), X3(e.D), yB(e.H) - 6, `${e.D}`);
    T(X3(e.D / 2), yB(-e.base) + 9, 'MẶT HÔNG', 3, 'middle', 'bold');

    // ---- Khung tên ----
    const tw = 190,
      th = 38,
      tx = PW - 5 - tw,
      ty = PH - 5 - th;
    R(tx, ty, tw, th, 0.6, '#fff');
    const rows = [ty + 10, ty + 17, ty + 24, ty + 31];
    rows.forEach((y) => L(tx + 60, y, tx + tw, y, 0.25));
    L(tx + 60, ty, tx + 60, ty + th, 0.4);
    L(tx + 125, ty + 10, tx + 125, ty + th, 0.25);
    T(tx + 30, ty + 15, 'CÔNG TY XUÂN THÀNH', 4, 'middle', 'bold');
    T(tx + 30, ty + 21, 'Sản xuất tủ điện — Đà Nẵng', 2.4);
    T(tx + 30, ty + 30, 'TỦ ĐIỆN BUILDER', 2.4, 'middle', 'bold');
    T(tx + 62, ty + 7, `${p.name}`.slice(0, 60), 3.6, 'start', 'bold');
    const cell = (x: number, y: number, k1: string, v: string): void => {
      T(x + 2, y + 5, k1, 2, 'start');
      T(x + 22, y + 5, v.slice(0, 32), 2.6, 'start', 'bold');
    };
    cell(tx + 60, ty + 10, 'Khách hàng', p.customer);
    cell(tx + 125, ty + 10, 'Mã đơn', p.orderCode);
    cell(tx + 60, ty + 17, 'Kích thước', `${e.H}×${e.W}×${e.D}${e.base ? ' +đế ' + e.base : ''}`);
    cell(tx + 125, ty + 17, 'Tỉ lệ', `1:${N}`);
    cell(tx + 60, ty + 24, 'Vật liệu', `${e.material === 'INOX304' ? 'Inox 304' : 'SPCC sơn TĐ'} ${e.thickness}mm`);
    cell(tx + 125, ty + 24, 'Ngày', new Date().toLocaleDateString('vi-VN'));
    cell(tx + 60, ty + 31, 'Người vẽ', p.drafter);
    cell(tx + 125, ty + 31, 'Tờ', '1/2 — A3');
    T(10, PH - 9, `Thiết bị: ${p.devices.length} · Chi tiết: ${st.parts().length} · Tôn ${st.bom().sheetAreaM2} m² · Đồng ${st.bom().copperKg} kg · Tạm tính ${vnd(st.bom().total)}`, 2.6, 'start');
    out.push('</svg>');
    return out.join('');
  }
}
