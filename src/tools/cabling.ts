import type { Tool, AppCtx } from './tool';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';
import { HIT_PX } from './tool';
import { rigCabling, type RigCabling } from '../domain/cabling';
import { drawCablingOverlay } from '../view/cablingOverlay';

/** Shows the DMX daisy-chains on the plot; tapping a fixture or truss picks its run. Dragging pans. */
export class CablingTool implements Tool {
  id = 'cabling'; label = 'DMX'; cursor = 'pointer';
  current: string | null = null;
  onPick: ((group: string | null) => void) | null = null;
  private app!: AppCtx; private last: V2 | null = null; private cache: RigCabling | null = null;

  invalidate() { this.cache = null; }
  plan(): RigCabling { return (this.cache ??= rigCabling(this.app.doc)); }

  activate(app: AppCtx) {
    this.app = app; this.cache = null;
    app.preview = (ctx, cam) => drawCablingOverlay(ctx, cam, app.doc, this.plan(), this.current, e => app.visible(e), app.theme ?? 'dark');
    app.notify('DMX runs from each truss end. Tap a truss to see its cables.');
    app.requestDraw();
  }
  deactivate() { if (this.app) { this.app.preview = null; this.app.notify(''); this.cache = null; } }

  private pick(g: string | null) { this.current = g; this.onPick?.(g); this.app.requestDraw(); }

  onTap(s: V2, _m?: Mods) {
    const a = this.app, id = a.index.hit(a.camera.toWorld(s), HIT_PX / a.camera.scale, a.doc, e => a.visible(e));
    const e = id ? a.doc.entities.get(id) : undefined;
    a.selection.clear();
    if (e?.kind === 'truss') { a.selection.add(e.id); this.pick(e.id); return; }
    if (e?.kind === 'fixture') { a.selection.add(e.id); this.pick(this.plan().runs.find(r => r.chains.some(c => c.cables.some(x => x.toId === e.id || x.fromId === e.id)))?.group ?? (e.trussId || null)); return; }
    this.pick(null);
  }
  onDragStart(s: V2) { this.last = s; }
  onDrag(s: V2) { if (!this.last) return; this.app.camera.panBy(s.x - this.last.x, s.y - this.last.y); this.last = s; this.app.requestDraw(); }
  onDragEnd() { this.last = null; }
  onDragCancel() { this.last = null; }
}
