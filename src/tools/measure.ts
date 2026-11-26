import type { Tool, AppCtx } from './tool';
import type { Mods } from '../view/input';
import type { V2 } from '../core/geom/vec';
import { SNAP_PX } from './tool';
import { snap } from '../core/snap';

/** Two taps measure distance and angle. Never changes the document. */
export class MeasureTool implements Tool {
  id = 'measure'; label = 'Measure'; cursor = 'crosshair';
  result: { a: V2; b: V2; distance: number; angle: number } | null = null;
  private app!: AppCtx; private a: V2 | null = null;

  activate(app: AppCtx) {
    this.app = app; this.a = null; this.result = null;
    app.preview = (ctx, cam) => {
      const r = this.result; const pa = this.a;
      if (!r && !pa) return;
      ctx.strokeStyle = '#5fcf8f'; ctx.fillStyle = '#5fcf8f'; ctx.lineWidth = 2;
      if (r) {
        const s1 = cam.toScreen(r.a), s2 = cam.toScreen(r.b);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillText(`${app.units.fmt(r.distance)}  ${Math.round(r.angle)}°`, (s1.x + s2.x) / 2 + 8, (s1.y + s2.y) / 2 - 8);
      } else if (pa) { const s = cam.toScreen(pa); ctx.fillRect(s.x - 4, s.y - 4, 8, 8); }
    };
    app.notify('Tap two points to measure.');
  }
  deactivate() { if (this.app) { this.app.preview = null; this.app.notify(''); } }

  onTap(s: V2, _m?: Mods) {
    const app = this.app;
    const p = snap(app.camera.toWorld(s), { doc: app.doc, index: app.index, tolWorld: SNAP_PX / app.camera.scale, grid: 0, exclude: new Set() }).p;
    if (!this.a || this.result) { this.a = p; this.result = null; app.notify('Tap the second point.'); }
    else {
      const d = Math.hypot(p.x - this.a.x, p.y - this.a.y), ang = (Math.atan2(p.y - this.a.y, p.x - this.a.x) * 180) / Math.PI;
      this.result = { a: this.a, b: p, distance: d, angle: ang };
      app.notify(`Distance ${app.units.fmt(d)}, angle ${Math.round(ang)}°.`);
    }
    app.requestDraw();
  }
}
