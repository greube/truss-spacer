import type { Tool, AppCtx } from './tool';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';
import type { Truss } from '../core/model/types';
import { DEFAULT_SPACING } from '../core/model/types';
import { HIT_PX } from './tool';
import { drawSpacingOverlay } from '../view/spacingOverlay';

/** Pick a truss run (tap it or one of its fixtures) to see its marks; dragging pans. The panel does the rest. */
export class SpacingTool implements Tool {
  id = 'spacing'; label = 'Spacing'; cursor = 'pointer';
  current: string | null = null;
  /** Told whenever the chosen truss changes (main opens or refreshes the Spacing panel). */
  onPick: ((id: string | null) => void) | null = null;
  private app!: AppCtx; private last: V2 | null = null;

  activate(app: AppCtx) {
    this.app = app;
    if (this.current && !app.doc.entities.has(this.current)) this.current = null;
    app.preview = (ctx, cam) => {
      const t = this.current ? (app.doc.entities.get(this.current) as Truss | undefined) : undefined;
      if (t) drawSpacingOverlay(ctx, cam, app.doc, t, t.spacing ?? DEFAULT_SPACING, app.doc.settings);
    };
    app.notify(this.current ? '' : 'Tap a truss to see its tape marks.');
    app.requestDraw();
  }
  deactivate() { if (this.app) { this.app.preview = null; this.app.notify(''); } }

  private pick(id: string | null) { this.current = id; this.app.notify(id ? '' : 'Tap a truss to see its tape marks.'); this.onPick?.(id); this.app.requestDraw(); }

  onTap(s: V2, _m?: Mods) {
    const a = this.app, id = a.index.hit(a.camera.toWorld(s), HIT_PX / a.camera.scale, a.doc, e => a.visible(e));
    const e = id ? a.doc.entities.get(id) : undefined;
    a.selection.clear();
    if (e?.kind === 'truss') { a.selection.add(e.id); this.pick(e.id); }
    else if (e?.kind === 'fixture' && e.trussId) { a.selection.add(e.id); this.pick(e.trussId); }
    else this.pick(null);
  }
  onDragStart(s: V2) { this.last = s; }
  onDrag(s: V2) { if (!this.last) return; this.app.camera.panBy(s.x - this.last.x, s.y - this.last.y); this.last = s; this.app.requestDraw(); }
  onDragEnd() { this.last = null; }
  onDragCancel() { this.last = null; }
}
