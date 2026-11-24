import { Injectable } from '@angular/core';

export interface SnapshotSource {
  snapshot(w: number, h: number, angleDeg: number): string | null;
}

/** Giữ tham chiếu khung 3D đang hiển thị để chụp ảnh render (bước 8, hoàn tất đơn). Không import three. */
@Injectable({ providedIn: 'root' })
export class ViewerService {
  active: SnapshotSource | null = null;
  snapshot(w: number, h: number, angleDeg: number): string | null {
    return this.active?.snapshot(w, h, angleDeg) ?? null;
  }
}
