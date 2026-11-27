import Konva from 'konva';

/** Stage Konva nền đen kiểu phần mềm CNC: zoom bằng con lăn, kéo để di chuyển, fit theo khung. */
export class CncStage {
  readonly stage: Konva.Stage;
  readonly layer: Konva.Layer;
  private ro: ResizeObserver;
  private fitBox = { w: 100, h: 100, pad: 70, padLeft: 70, x: 0, y: 0 };
  onResize: () => void = () => undefined;

  constructor(el: HTMLDivElement) {
    this.stage = new Konva.Stage({ container: el, width: el.clientWidth || 800, height: el.clientHeight || 500, draggable: true });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const old = this.stage.scaleX();
      const ptr = this.stage.getPointerPosition();
      if (!ptr) return;
      const k = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.max(1e-4, Math.min(50, old * k));
      const mp = { x: (ptr.x - this.stage.x()) / old, y: (ptr.y - this.stage.y()) / old };
      this.stage.scale({ x: ns, y: ns });
      this.stage.position({ x: ptr.x - mp.x * ns, y: ptr.y - mp.y * ns });
    });
    this.ro = new ResizeObserver(() => {
      this.stage.size({ width: el.clientWidth, height: el.clientHeight });
      this.onResize();
    });
    this.ro.observe(el);
  }

  /** Thu phóng vừa vùng (x,y)–(x+w,y+h) (mặc định gốc 0,0) với lề pad px. */
  fit(w: number, h: number, pad = 70, padLeft = pad, x = 0, y = 0): void {
    this.fitBox = { w, h, pad, padLeft, x, y };
    const cw = this.stage.width(),
      ch = this.stage.height();
    const s = Math.max(1e-6, Math.min(50, (cw - pad - padLeft) / Math.max(w, 1e-6), (ch - 2 * pad) / Math.max(h, 1e-6)));
    this.stage.scale({ x: s, y: s });
    this.stage.position({ x: padLeft + (cw - pad - padLeft - w * s) / 2 - x * s, y: (ch - h * s) / 2 - y * s });
  }

  refit(): void {
    const b = this.fitBox;
    this.fit(b.w, b.h, b.pad, b.padLeft, b.x, b.y);
  }

  /** Chuyển px màn hình → đơn vị bản vẽ ở mức zoom hiện tại. */
  px(n: number): number {
    return n / this.stage.scaleX();
  }

  destroy(): void {
    this.ro.disconnect();
    this.stage.destroy();
  }
}
