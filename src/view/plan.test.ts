import { test, expect } from 'vitest';
import { PlanRenderer } from './plan';
import { Camera } from './camera';
import { GridIndex } from '../core/index/grid';
import { newDoc } from '../core/model/doc';
import { IDENTITY, translate } from '../core/geom/matrix';
import type { Doc, Fixture, Truss } from '../core/model/types';

// a canvas whose 2D context accepts every call
function fakeCanvas() {
  const ctx: any = new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t: any, k, v) => { t[k] = v; return true; } });
  return { width: 0, height: 0, clientWidth: 412, clientHeight: 700, style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement;
}
function rig(): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true }, { id: 'H', name: 'Hidden', visible: false });
  d.types.set('t', { key: 't', m: 'Robe', n: 'MegaPointe', w: 670, src: 's', url: '', gdtfSpec: '', mode: '', category: 'spot' });
  d.entities.set('T', { id: 'T', kind: 'truss', name: 'LX1', layerId: 'L', classId: null, positionId: null, legs: [{ a: { x: 0, y: 0, z: 8000 }, b: { x: 8000, y: 0, z: 8000 }, sections: [3000, 3000, 2000] }], boxSize: 300, state: 'draft', mvrUuid: null } as Truss);
  for (let i = 0; i < 6; i++) d.entities.set('F' + i, { id: 'F' + i, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: 'T', matrix: translate(IDENTITY, { x: 500 + i * 1400, y: 0, z: 8000 }), typeKey: 't', unitNumber: i + 1, fixtureId: '', address: 1 + i * 40, mvrUuid: null } as Fixture);
  d.entities.set('X', { id: 'X', kind: 'fixture', name: '', layerId: 'H', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x: 4000, y: 1000, z: 0 }), typeKey: 't', unitNumber: 9, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  d.entities.set('FAR', { id: 'FAR', kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x: 900000, y: 0, z: 0 }), typeKey: 't', unitNumber: 9, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  return d;
}
function setup(scale: number) {
  const doc = rig(), camera = new Camera(), index = new GridIndex(); index.rebuild(doc);
  camera.setViewport(412, 700); camera.cx = 4000; camera.cy = 0; camera.scale = scale;
  const r = new PlanRenderer(fakeCanvas(), () => ({ doc, camera, index, selection: new Set(['F0']), hover: null, preview: null, theme: 'dark' }));
  r.resize(); r.draw(); return r;
}
test('draws visible on-screen objects only', () => {
  const r = setup(0.04);
  expect(r.stats).toMatchObject({ trusses: 1, fixtures: 6, symbols: 6 });
});
test('zoomed far out, fixtures become dots and labels hide', () => {
  const r = setup(0.004);
  expect(r.stats.fixtures).toBe(6); expect(r.stats.symbols).toBe(0); expect(r.stats.labels).toBe(0);
});
test('zoomed in, labels appear', () => { expect(setup(0.1).stats.labels).toBeGreaterThan(0); });
