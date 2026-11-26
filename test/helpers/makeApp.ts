import { History } from '../../src/core/commands/history';
import { GridIndex } from '../../src/core/index/grid';
import { Camera } from '../../src/view/camera';
import { newDoc } from '../../src/core/model/doc';
import { IDENTITY, translate } from '../../src/core/geom/matrix';
import type { AppCtx } from '../../src/tools/tool';
import type { Doc, Fixture, Truss } from '../../src/core/model/types';

/** A small rig (8 m truss T with fixtures F0..F5) wired into an AppCtx, for tool tests. */
export function makeApp(): AppCtx & { historyLength(): number } {
  const doc: Doc = newDoc(); doc.layers.push({ id: 'L', name: 'LX', visible: true });
  doc.entities.set('T', { id: 'T', kind: 'truss', name: 'LX1', layerId: 'L', classId: null, positionId: null, legs: [{ a: { x: 0, y: 0, z: 8000 }, b: { x: 8000, y: 0, z: 8000 }, sections: [3000, 3000, 2000] }], boxSize: 300, state: 'confirmed', mvrUuid: null } as Truss);
  for (let i = 0; i < 6; i++) doc.entities.set('F' + i, { id: 'F' + i, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: 'T', matrix: translate(IDENTITY, { x: 500 + i * 1400, y: 0, z: 8000 }), typeKey: 't', unitNumber: i + 1, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  const history = new History(doc), index = new GridIndex(), camera = new Camera();
  index.rebuild(doc); camera.setViewport(1000, 800); camera.fit({ min: { x: -1000, y: -3000 }, max: { x: 9000, y: 3000 } });
  let steps = 0; history.onChange(() => { index.rebuild(app.doc); });
  const app: AppCtx & { historyLength(): number } = {
    doc, history, camera, index, selection: new Set(), preview: null,
    requestDraw: (rebuild?: boolean) => { if (rebuild) index.rebuild(app.doc); },
    setTool: () => {}, units: { fmt: (mm: number) => (mm / 1000).toFixed(3) + ' m' },
    visible: () => true, notify: () => {}, previewActive: false,
    historyLength: () => { let n = 0; while (history.canUndo) { history.undo(); n++; } for (let i = 0; i < n; i++) history.redo(); return n; },
  };
  void steps;
  return app;
}
