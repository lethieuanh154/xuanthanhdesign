import { Part } from './types';
import { bboxH, bboxW, partNetArea } from './math';

/**
 * SẮP TÔN (DEMO) — thuật toán xếp kệ (shelf / bin-packing chữ nhật).
 * Mỗi chi tiết được thay bằng hình chữ nhật bao (bbox). Chỉ để ước lượng số tấm và % sử dụng;
 * nesting thật (xoay tự do, lồng chi tiết) sẽ do phần mềm CNC đảm nhận.
 */

export interface NestPlacement {
  partId: string;
  name: string;
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface NestSheet {
  index: number;
  placements: NestPlacement[];
  usedArea: number;
  utilization: number;
}

export interface NestGroup {
  key: string;
  material: string;
  thickness: number;
  sheetW: number;
  sheetH: number;
  sheets: NestSheet[];
  unplaced: string[];
  utilization: number;
}

export function nestParts(parts: Part[], sheet: { w: number; h: number }, gap = 10, margin = 10): NestGroup[] {
  const groups = new Map<string, Part[]>();
  for (const p of parts.filter((x) => x.nestable)) {
    const key = `${p.material}|${p.thickness}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const usableW = sheet.w - 2 * margin;
  const usableH = sheet.h - 2 * margin;
  const result: NestGroup[] = [];

  for (const [key, list] of groups) {
    // Bung theo số lượng, xoay để cạnh dài nằm ngang (theo chiều dài tấm tôn)
    const items = list.flatMap((p) => {
      let w = bboxW(p.bbox),
        h = bboxH(p.bbox),
        rotated = false;
      if ((h > w && h <= usableW && w <= usableH) || w > usableW) {
        [w, h] = [h, w];
        rotated = true;
      }
      const area = partNetArea(p);
      return Array.from({ length: p.qty }, () => ({ p, w, h, rotated, area }));
    });
    items.sort((a, b) => b.h - a.h || b.w - a.w);

    const sheets: NestSheet[] = [];
    const unplaced: string[] = [];
    let cur: NestSheet | null = null;
    let shelfY = 0,
      shelfH = 0,
      cursorX = 0;
    const newSheet = (): NestSheet => {
      const s: NestSheet = { index: sheets.length + 1, placements: [], usedArea: 0, utilization: 0 };
      sheets.push(s);
      shelfY = 0;
      shelfH = 0;
      cursorX = 0;
      return s;
    };

    for (const it of items) {
      if (it.w > usableW || it.h > usableH) {
        unplaced.push(it.p.name);
        continue;
      }
      if (!cur) cur = newSheet();
      // không vừa kệ hiện tại → mở kệ mới
      if (cursorX + it.w > usableW) {
        shelfY += shelfH + gap;
        shelfH = 0;
        cursorX = 0;
      }
      // không vừa chiều cao tấm → tấm mới
      if (shelfY + it.h > usableH) cur = newSheet();
      cur.placements.push({ partId: it.p.id, name: it.p.name, code: it.p.code, x: margin + cursorX, y: margin + shelfY, w: it.w, h: it.h, rotated: it.rotated });
      cur.usedArea += it.area;
      cursorX += it.w + gap;
      shelfH = Math.max(shelfH, it.h);
    }
    const sheetArea = sheet.w * sheet.h;
    sheets.forEach((s) => (s.utilization = s.usedArea / sheetArea));
    const total = sheets.reduce((s, x) => s + x.usedArea, 0);
    const [material, t] = key.split('|');
    result.push({
      key,
      material,
      thickness: parseFloat(t),
      sheetW: sheet.w,
      sheetH: sheet.h,
      sheets,
      unplaced,
      utilization: sheets.length ? total / (sheets.length * sheetArea) : 0,
    });
  }
  return result;
}
