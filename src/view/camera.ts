import type { V2 } from '../core/geom/vec';
import type { Bounds } from '../core/model/types';

export const MIN_SCALE = 0.0005, MAX_SCALE = 2; // px per mm

/** Plan view camera. (cx, cy) is the world point (mm) at the centre of the view; scale is px per mm. */
export class Camera {
  cx = 0; cy = 0; scale = 0.05; w = 1; h = 1;
  setViewport(w: number, h: number): void { this.w = Math.max(1, w); this.h = Math.max(1, h); }
  toScreen(p: V2): V2 { return { x: this.w / 2 + (p.x - this.cx) * this.scale, y: this.h / 2 - (p.y - this.cy) * this.scale }; }
  toWorld(s: V2): V2 { return { x: this.cx + (s.x - this.w / 2) / this.scale, y: this.cy - (s.y - this.h / 2) / this.scale }; }
  zoomAt(s: V2, factor: number): void {
    const before = this.toWorld(s);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    this.cx = before.x - (s.x - this.w / 2) / this.scale;
    this.cy = before.y + (s.y - this.h / 2) / this.scale;
  }
  panBy(dx: number, dy: number): void { this.cx -= dx / this.scale; this.cy += dy / this.scale; }
  fit(b: Bounds, margin = 40): void {
    const bw = Math.max(1, b.max.x - b.min.x), bh = Math.max(1, b.max.y - b.min.y);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((this.w - 2 * margin) / bw, (this.h - 2 * margin) / bh)));
    this.cx = (b.min.x + b.max.x) / 2; this.cy = (b.min.y + b.max.y) / 2;
  }
  viewBounds(): Bounds {
    const a = this.toWorld({ x: 0, y: this.h }), b = this.toWorld({ x: this.w, y: 0 });
    return { min: { x: a.x, y: a.y }, max: { x: b.x, y: b.y } };
  }
}
