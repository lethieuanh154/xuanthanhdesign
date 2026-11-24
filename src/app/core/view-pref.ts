import { Injectable } from '@angular/core';

export type ViewKind = 'wizard' | 'detail';
const KEY = 'tdb.view';

/** Ghi nhớ giao diện người dùng chọn ở trang đầu (Wizard View / Detail View). */
@Injectable({ providedIn: 'root' })
export class ViewPref {
  get(): ViewKind | null {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'wizard' || v === 'detail' ? v : null;
    } catch {
      return null;
    }
  }

  set(v: ViewKind | null): void {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* trình duyệt chặn storage → mỗi lần mở đều hỏi lại */
    }
  }

  /** Đường dẫn mở 1 đơn theo giao diện. */
  static path(v: ViewKind, id: string): string[] {
    return [v === 'wizard' ? '/cau-hinh' : '/nang-cao', id];
  }
}
