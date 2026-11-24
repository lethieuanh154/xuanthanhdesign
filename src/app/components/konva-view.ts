import Konva from 'konva';

/** Stage Konva nền đen kiểu phần mềm CNC: zoom bằng con lăn, kéo để di chuyển, fit theo khung. */
export class CncStage {
  readonly stage: Konva.Stage;
  readonly layer: Konva.Layer;
  private ro: ResizeObserver;
  private fitBox = { w: 100, h: 100, pad: 70, padLeft: 70 };
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
      const ns = Math.max(0.01, Math.min(50, old * k));
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

  /** Thu phóng vừa vùng (0,0)–(w,h) với lề pad px. */
  fit(w: number, h: number, pad = 70, padLeft = pad): void {
    this.fitBox = { w, h, pad, padLeft };
    const cw = this.stage.width(),
      ch = this.stage.height();
    const s = Math.max(0.01, Math.min((cw - pad - padLeft) / Math.max(w, 1), (ch - 2 * pad) / Math.max(h, 1)));
    this.stage.scale({ x: s, y: s });
    this.stage.position({ x: padLeft + (cw - pad - padLeft - w * s) / 2, y: (ch - h * s) / 2 });
  }

  refit(): void {
    this.fit(this.fitBox.w, this.fitBox.h, this.fitBox.pad, this.fitBox.padLeft);
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
