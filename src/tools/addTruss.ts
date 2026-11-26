import type { Tool, AppCtx } from './tool';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';
import type { Truss } from '../core/model/types';
import { HIT_PX, SNAP_PX } from './tool';
import { snap } from '../core/snap';
import { addEntities, layerForNew } from '../core/commands/ops';
import { newId } from '../core/model/doc';

export const DEFAULT_TRIM = 6000;

/** Greedy pieces from stock, largest first; any remainder takes the smallest piece that covers it. */
export function suggestSections(length: number, stock = [3000, 2000, 1000, 500]): number[] {
  const s = stock.slice().sort((a, b) => b - a), out: number[] = [];
  let rest = Math.round(length);
  for (const p of s) while (rest >= p) { out.push(p); rest -= p; }
  if (rest > 0) out.push(s.slice().reverse().find(p => p >= rest) ?? s[0]);
  return out;
}

/** Tap to place points; tap the last point again, press Enter or Done to finish; Escape cancels. */
export class AddTrussTool implements Tool {
  id = 'addTruss'; label = 'Add truss'; cursor = 'crosshair';
  private app!: AppCtx; private pts: V2[] = []; private hover: V2 | null = null; private snapLabel = '';

  activate(app: AppCtx) { this.app = app; this.pts = []; app.preview = (ctx, cam) => this.drawPreview(ctx, cam); app.notify('Tap where the truss starts.'); }
  deactivate() { this.pts = []; if (this.app) { this.app.preview = null; this.app.notify(''); } }

  private snapped(s: V2): V2 {
    const a = this.app;
    const r = snap(a.camera.toWorld(s), { doc: a.doc, index: a.index, tolWorld: SNAP_PX / a.camera.scale, grid: 0, exclude: new Set(), from: this.pts[this.pts.length - 1] });
    this.snapLabel = r.label; return r.p;
  }

  onTap(s: V2, _m?: Mods) {
    const a = this.app, p = this.snapped(s), last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) * a.camera.scale <= HIT_PX) { this.finish(); return; }
    this.pts.push(p);
    a.notify(this.pts.length === 1 ? 'Tap the other end (or a corner).' : `Length so far ${a.units.fmt(this.length())}. Tap the last point again or press Done.`);
    a.requestDraw();
  }
  onHover(s: V2, _m?: Mods) { if (this.pts.length) { this.hover = this.snapped(s); this.app.requestDraw(); } }
  onDrag(s: V2, m: Mods) { this.onHover(s); void m; }
  onKey(e: { key: string }) {
    if (e.key === 'Enter') { this.finish(); return true; }
    if (e.key === 'Escape') { this.pts = []; this.hover = null; this.app.notify('Cancelled.'); this.app.requestDraw(); return true; }
    if (e.key === 'Backspace') { this.pts.pop(); this.app.requestDraw(); return true; }
    return false;
  }

  private length() { let L = 0; for (let i = 1; i < this.pts.length; i++) L += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y); return L; }

  /** Commits the truss (needs at least two points). */
  finish() {
    const a = this.app;
    if (this.pts.length < 2) { this.pts = []; a.requestDraw(); return; }
    a.history.begin('Add truss');
    const layerId = layerForNew(a.history);
    const legs = this.pts.slice(1).map((b, i) => {
      const p = this.pts[i]; const L = Math.hypot(b.x - p.x, b.y - p.y);
      return { a: { x: p.x, y: p.y, z: DEFAULT_TRIM }, b: { x: b.x, y: b.y, z: DEFAULT_TRIM }, sections: suggestSections(L) };
    }).filter(l => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) > 1);
    const n = [...a.doc.entities.values()].filter(e => e.kind === 'truss').length + 1;
    const t: Truss = { id: newId(), kind: 'truss', name: `Truss ${n}`, layerId, classId: null, positionId: null, legs, boxSize: 300, state: 'confirmed', mvrUuid: null };
    if (legs.length) a.history.exec(addEntities([t]));
    a.history.end();
    this.pts = []; this.hover = null;
    a.selection.clear(); if (legs.length) a.selection.add(t.id);
    a.notify(legs.length ? `Added ${t.name}.` : ''); a.requestDraw(true);
  }

  private drawPreview(ctx: CanvasRenderingContext2D, cam: { toScreen(p: V2): V2 }) {
    if (!this.pts.length) return;
    const pts = this.hover ? [...this.pts, this.hover] : this.pts;
    ctx.strokeStyle = '#ffb21e'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
    pts.forEach((p, i) => { const s = cam.toScreen(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffb21e';
    for (const p of this.pts) { const s = cam.toScreen(p); ctx.fillRect(s.x - 4, s.y - 4, 8, 8); }
    if (this.hover && this.snapLabel) { const s = cam.toScreen(this.hover); ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(this.snapLabel, s.x + 10, s.y - 10); }
  }
}
