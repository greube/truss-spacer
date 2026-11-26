import type { Tool, AppCtx } from './tool';
import type { Command } from '../core/commands/history';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';
import type { Id, Bounds } from '../core/model/types';
import { HIT_PX, SNAP_PX } from './tool';
import { transform } from '../core/commands/ops';
import { translate } from '../core/geom/matrix';
import { entityBounds } from '../core/model/doc';
import { snap } from '../core/snap';

type Mode = { kind: 'move'; ref: V2; ids: Id[]; temp: Command | null; delta: V2 } | { kind: 'box'; a: V2; b: V2 } | { kind: 'pan'; last: V2 } | null;

/** Select, box select, and move with snapping. Touch drags on empty space pan the view. */
export class SelectTool implements Tool {
  id = 'select'; label = 'Select'; cursor = 'default';
  private app!: AppCtx; private mode: Mode = null;
  activate(app: AppCtx) { this.app = app; }
  deactivate() { this.onDragCancel(); }

  private hitAt(s: V2) { const a = this.app; return a.index.hit(a.camera.toWorld(s), HIT_PX / a.camera.scale, a.doc, e => a.visible(e)); }

  onTap(s: V2, m: Mods) {
    const id = this.hitAt(s), sel = this.app.selection;
    if (m.shift || m.ctrl) { if (id) sel.has(id) ? sel.delete(id) : sel.add(id); }
    else { sel.clear(); if (id) sel.add(id); }
    this.app.requestDraw();
  }

  onDragStart(s: V2, m: Mods) {
    const a = this.app, id = this.hitAt(s);
    if (id) {
      if (!a.selection.has(id)) { if (!(m.shift || m.ctrl)) a.selection.clear(); a.selection.add(id); }
      const e = a.doc.entities.get(id)!, w = a.camera.toWorld(s);
      // the grabbed point that snaps: a fixture's centre, or the truss end/corner nearest the grab
      let ref: V2 = w;
      if (e.kind === 'fixture') ref = { x: e.matrix.o.x, y: e.matrix.o.y };
      else if (e.kind === 'truss') { const pts = e.legs.flatMap(l => [l.a, l.b]); ref = pts.reduce((b, p) => (Math.hypot(p.x - w.x, p.y - w.y) < Math.hypot(b.x - w.x, b.y - w.y) ? p : b)); ref = { x: ref.x, y: ref.y }; }
      this.mode = { kind: 'move', ref, ids: [...a.selection], temp: null, delta: { x: 0, y: 0 } };
      this.grabOffset = { x: w.x - ref.x, y: w.y - ref.y }; // keep the grabbed spot under the finger
    } else if (m.pointerType === 'mouse') this.mode = { kind: 'box', a: s, b: s };
    else this.mode = { kind: 'pan', last: s };
    a.requestDraw();
  }

  onDrag(s: V2, _m: Mods) {
    const a = this.app, md = this.mode; if (!md) return;
    if (md.kind === 'pan') { a.camera.panBy(s.x - md.last.x, s.y - md.last.y); md.last = s; a.requestDraw(); return; }
    if (md.kind === 'box') {
      md.b = s;
      a.preview = (ctx) => {
        const x = Math.min(md.a.x, md.b.x), y = Math.min(md.a.y, md.b.y), w = Math.abs(md.b.x - md.a.x), h = Math.abs(md.b.y - md.a.y);
        ctx.strokeStyle = '#ffb21e'; ctx.setLineDash(md.b.x < md.a.x ? [5, 4] : []); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.fillStyle = 'rgba(255,178,30,0.08)'; ctx.fillRect(x, y, w, h);
      };
      a.requestDraw(); return;
    }
    // move: snap the grabbed point, then apply the move live (outside History) so everything follows the finger
    const exclude = new Set<Id>(md.ids);
    for (const e of a.doc.entities.values()) if (e.kind === 'fixture' && e.trussId && exclude.has(e.trussId)) exclude.add(e.id);
    if (md.temp) { md.temp.undo(a.doc); md.temp = null; a.index.rebuild(a.doc); }
    const startW = md.ref, raw = a.camera.toWorld(s);
    const grabOffset = this.grabOffset ?? { x: 0, y: 0 };
    const target = { x: raw.x - grabOffset.x, y: raw.y - grabOffset.y };
    const sn = snap(target, { doc: a.doc, index: a.index, tolWorld: SNAP_PX / a.camera.scale, grid: 0, exclude });
    md.delta = { x: sn.p.x - startW.x, y: sn.p.y - startW.y };
    md.temp = transform(md.ids, mm => translate(mm, { x: md.delta.x, y: md.delta.y, z: 0 }));
    md.temp.do(a.doc);
    a.notify(sn.label ? `Snap: ${sn.label}` : `Move ${a.units.fmt(Math.hypot(md.delta.x, md.delta.y))}`);
    a.requestDraw(true);
  }
  private grabOffset: V2 | null = null;

  onDragEnd(s: V2, m: Mods) {
    const a = this.app, md = this.mode;
    if (md?.kind === 'move') {
      if (!md.temp) this.onDrag(s, m);
      const mm = this.mode as Extract<Mode, { kind: 'move' }>;
      if (mm.temp) { mm.temp.undo(a.doc); mm.temp = null; }
      const d = mm.delta;
      if (Math.hypot(d.x, d.y) > 0) a.history.exec(transform(mm.ids, x => translate(x, { x: d.x, y: d.y, z: 0 })));
      else a.index.rebuild(a.doc);
    } else if (md?.kind === 'box') {
      const w1 = a.camera.toWorld(md.a), w2 = a.camera.toWorld(md.b);
      const box: Bounds = { min: { x: Math.min(w1.x, w2.x), y: Math.min(w1.y, w2.y) }, max: { x: Math.max(w1.x, w2.x), y: Math.max(w1.y, w2.y) } };
      const crossing = md.b.x < md.a.x;
      if (!(m.shift || m.ctrl)) a.selection.clear();
      for (const id of a.index.query(box)) {
        const e = a.doc.entities.get(id); if (!e || !a.visible(e) || e.kind === 'ref') continue;
        const b = entityBounds(a.doc, e);
        const inside = b.min.x >= box.min.x && b.max.x <= box.max.x && b.min.y >= box.min.y && b.max.y <= box.max.y;
        if (inside || crossing) a.selection.add(id);
      }
    }
    this.reset(); a.requestDraw(true);
  }

  onDragCancel() {
    const a = this.app, md = this.mode;
    if (md?.kind === 'move' && md.temp) { md.temp.undo(a.doc); a.index.rebuild(a.doc); }
    this.reset(); a?.requestDraw(true);
  }

  private reset() { this.mode = null; this.grabOffset = null; if (this.app) { this.app.preview = null; this.app.notify(''); } }
}
