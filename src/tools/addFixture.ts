import type { Tool, AppCtx } from './tool';
import type { Mods } from '../view/input';
import type { V2 } from '../core/geom/vec';
import type { Fixture, Truss } from '../core/model/types';
import { SNAP_PX } from './tool';
import { snap } from '../core/snap';
import { addEntities, layerForNew } from '../core/commands/ops';
import { newId } from '../core/model/doc';
import { IDENTITY, translate, withYaw } from '../core/geom/matrix';
import { projectOnSegment } from '../core/geom/vec';

const ON_TRUSS = 300; // mm

/** Tap to place a fixture of the current type. Near a truss it goes on the truss, facing along it. */
export class AddFixtureTool implements Tool {
  id = 'addFixture'; label = 'Add fixture'; cursor = 'crosshair';
  /** Type key for new fixtures (set from the type picker); defaults to the most used type in the job. */
  currentType = '';
  private app!: AppCtx;

  activate(app: AppCtx) {
    this.app = app;
    if (!this.currentType || !app.doc.types.has(this.currentType)) {
      const counts = new Map<string, number>();
      for (const e of app.doc.entities.values()) if (e.kind === 'fixture') counts.set(e.typeKey, (counts.get(e.typeKey) ?? 0) + 1);
      this.currentType = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    }
    const t = app.doc.types.get(this.currentType);
    app.notify(`Tap to add ${t ? t.n : 'a fixture'}. Near a truss it goes on the truss.`);
  }
  deactivate() { this.app?.notify(''); }

  onTap(s: V2, _m?: Mods) {
    const a = this.app, w = a.camera.toWorld(s);
    let best: { t: Truss; p: V2; yaw: number; z: number; d: number } | null = null;
    for (const id of a.index.query({ min: { x: w.x - ON_TRUSS, y: w.y - ON_TRUSS }, max: { x: w.x + ON_TRUSS, y: w.y + ON_TRUSS } })) {
      const e = a.doc.entities.get(id); if (!e || e.kind !== 'truss' || !a.visible(e)) continue;
      for (const l of e.legs) {
        const pr = projectOnSegment(w, l.a, l.b);
        if (pr.d <= ON_TRUSS && (!best || pr.d < best.d)) best = { t: e, p: pr.point, yaw: Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x), z: l.a.z + (l.b.z - l.a.z) * pr.t, d: pr.d };
      }
    }
    a.history.begin('Add fixture');
    const layerId = layerForNew(a.history, best?.t.layerId);
    let matrix = IDENTITY, trussId: string | null = null, unit: number | null = null, positionId: string | null = null;
    if (best) {
      matrix = withYaw(translate(IDENTITY, { x: best.p.x, y: best.p.y, z: best.z }), best.yaw);
      trussId = best.t.id; positionId = best.t.positionId;
      const units = [...a.doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture' && e.trussId === trussId).map(f => f.unitNumber ?? 0);
      unit = (units.length ? Math.max(...units) : 0) + 1;
    } else {
      const sn = snap(w, { doc: a.doc, index: a.index, tolWorld: SNAP_PX / a.camera.scale, grid: 0, exclude: new Set() });
      matrix = translate(IDENTITY, { x: sn.p.x, y: sn.p.y, z: 0 });
    }
    const t = a.doc.types.get(this.currentType);
    const f: Fixture = { id: newId(), kind: 'fixture', name: t ? (t.m ? t.m + ' ' : '') + t.n : 'Fixture', layerId, classId: null, positionId, trussId,
      matrix, typeKey: this.currentType, unitNumber: unit, fixtureId: '', address: null, mvrUuid: null };
    a.history.exec(addEntities([f]));
    a.history.end();
    a.selection.clear(); a.selection.add(f.id); a.requestDraw(true);
  }
}
