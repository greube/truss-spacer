import type { Tool, AppCtx } from './tool';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';
import type { Fixture } from '../core/model/types';
import { HIT_PX } from './tool';
import { rigPower, type RigPower } from '../domain/powerRig';
import { drawPowerOverlay, powerColours } from '../view/powerOverlay';

const HINT = 'Fixtures are coloured by circuit. Tap one to see its run.';

/** Shows the rig's circuits on the plot; tapping a fixture or truss picks its power run. Dragging pans. */
export class PowerTool implements Tool {
  id = 'power'; label = 'Power'; cursor = 'pointer';
  /** The picked power group (a truss id, 'pos:<id>[:n]' or 'loose[:n]'). */
  current: string | null = null;
  onPick: ((group: string | null) => void) | null = null;
  private app!: AppCtx; private last: V2 | null = null;
  private cache: { rp: RigPower; colours: Map<string, string> } | null = null;

  /** Call when the doc changes (main does this on every History change and job switch). */
  invalidate() { this.cache = null; }
  /** The current plan, computed once per doc change. */
  plan(): RigPower {
    if (!this.cache) { const rp = rigPower(this.app.doc); this.cache = { rp, colours: powerColours(rp) }; }
    return this.cache.rp;
  }

  activate(app: AppCtx) {
    this.app = app; this.cache = null;
    app.fixtureColour = (f: Fixture) => { this.plan(); return this.cache!.colours.get(f.id) ?? null; };
    app.preview = (ctx, cam) => { const rp = this.plan(); drawPowerOverlay(ctx, cam, app.doc, rp, (e) => app.visible(e), app.theme ?? 'dark', this.cache!.colours); };
    app.notify(HINT);
    app.requestDraw();
  }
  deactivate() { if (this.app) { this.app.preview = null; this.app.fixtureColour = null; this.app.notify(''); this.cache = null; } }

  private pick(g: string | null) { this.current = g; this.onPick?.(g); this.app.requestDraw(); }

  onTap(s: V2, _m?: Mods) {
    const a = this.app, id = a.index.hit(a.camera.toWorld(s), HIT_PX / a.camera.scale, a.doc, (e) => a.visible(e));
    const e = id ? a.doc.entities.get(id) : undefined;
    a.selection.clear();
    if (e?.kind === 'truss') { a.selection.add(e.id); this.pick(e.id); return; }
    if (e?.kind === 'fixture') { a.selection.add(e.id); this.pick(this.plan().byFixture.get(e.id)?.group ?? null); return; }
    this.pick(null);
  }
  onDragStart(s: V2) { this.last = s; }
  onDrag(s: V2) { if (!this.last) return; this.app.camera.panBy(s.x - this.last.x, s.y - this.last.y); this.last = s; this.app.requestDraw(); }
  onDragEnd() { this.last = null; }
  onDragCancel() { this.last = null; }
}
