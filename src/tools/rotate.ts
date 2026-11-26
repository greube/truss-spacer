import type { Tool, AppCtx } from './tool';
import type { Command } from '../core/commands/history';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';
import { transform } from '../core/commands/ops';
import { rotateAboutZ } from '../core/geom/matrix';
import { entityBounds } from '../core/model/doc';

const STEP = Math.PI / 12;

/** Rotate the selection about a pivot (its centre; tap to move the pivot). Snaps to 15°; Alt for free rotation. */
export class RotateTool implements Tool {
  id = 'rotate'; label = 'Rotate'; cursor = 'crosshair';
  pivot: V2 = { x: 0, y: 0 };
  private app!: AppCtx; private a0 = 0; private temp: Command | null = null; private angle = 0; private active = false;

  activate(app: AppCtx) {
    this.app = app;
    const bs = [...app.selection].map(id => app.doc.entities.get(id)).filter(Boolean).map(e => entityBounds(app.doc, e!));
    if (bs.length) this.pivot = { x: (Math.min(...bs.map(b => b.min.x)) + Math.max(...bs.map(b => b.max.x))) / 2, y: (Math.min(...bs.map(b => b.min.y)) + Math.max(...bs.map(b => b.max.y))) / 2 };
    app.preview = (ctx, cam) => {
      const p = cam.toScreen(this.pivot); ctx.strokeStyle = '#ffb21e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x + 11, p.y); ctx.moveTo(p.x, p.y - 11); ctx.lineTo(p.x, p.y + 11); ctx.stroke();
    };
    app.notify(app.selection.size ? 'Drag to rotate. Tap to move the pivot.' : 'Select something to rotate first.');
    app.requestDraw();
  }
  deactivate() { this.onDragCancel(); if (this.app) { this.app.preview = null; this.app.notify(''); } }

  onTap(s: V2, _m?: Mods) { this.pivot = this.app.camera.toWorld(s); this.app.requestDraw(); }
  private angleAt(s: V2) { const w = this.app.camera.toWorld(s); return Math.atan2(w.y - this.pivot.y, w.x - this.pivot.x); }

  onDragStart(s: V2, _m?: Mods) { if (!this.app.selection.size) return; this.active = true; this.a0 = this.angleAt(s); this.angle = 0; }
  onDrag(s: V2, m: Mods) {
    if (!this.active) return;
    const a = this.app;
    if (this.temp) { this.temp.undo(a.doc); this.temp = null; a.previewActive = false; }
    let d = this.angleAt(s) - this.a0; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (!m.alt) d = Math.round(d / STEP) * STEP;
    this.angle = d;
    this.temp = transform([...a.selection], mm => rotateAboutZ(mm, this.pivot, d)); this.temp.do(a.doc); a.previewActive = true;
    a.notify(`Rotate ${Math.round((d * 180) / Math.PI)}°`); a.requestDraw(true);
  }
  onDragEnd(s: V2, m: Mods) {
    if (!this.active) return;
    this.onDrag(s, m);
    const a = this.app, d = this.angle;
    if (this.temp) { this.temp.undo(a.doc); this.temp = null; a.previewActive = false; }
    if (d) a.history.exec(transform([...a.selection], mm => rotateAboutZ(mm, this.pivot, d), 'Rotate'));
    this.active = false; a.requestDraw(true);
  }
  onDragCancel() { if (this.temp && this.app) { this.temp.undo(this.app.doc); this.temp = null; this.app.requestDraw(true); } if (this.app) this.app.previewActive = false; this.active = false; }
}
