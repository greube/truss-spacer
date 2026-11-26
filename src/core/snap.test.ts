import { test, expect } from 'vitest';
import { snap } from './snap';
import { GridIndex } from './index/grid';
import { newDoc } from './model/doc';
import { IDENTITY, translate } from './geom/matrix';
import type { Doc, Truss, Fixture } from './model/types';

function rig(): { doc: Doc; index: GridIndex } {
  const doc = newDoc();
  doc.entities.set('T', { id: 'T', kind: 'truss', name: '', layerId: 'L', classId: null, positionId: null, legs: [{ a: { x: 0, y: 0, z: 0 }, b: { x: 8000, y: 0, z: 0 }, sections: [3000, 3000, 2000] }], boxSize: 300, state: 'confirmed', mvrUuid: null } as Truss);
  doc.entities.set('F', { id: 'F', kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x: 5000, y: 2000, z: 0 }), typeKey: '', unitNumber: null, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  const index = new GridIndex(); index.rebuild(doc); return { doc, index };
}
const ctx = (r: ReturnType<typeof rig>, extra = {}) => ({ doc: r.doc, index: r.index, tolWorld: 100, grid: 500, exclude: new Set<string>(), ...extra });

test('snaps to a truss end', () => { expect(snap({ x: 8020, y: 10 }, ctx(rig()))).toMatchObject({ kind: 'end', p: { x: 8000, y: 0 } }); });
test('snaps to a section join', () => { expect(snap({ x: 2980, y: 30 }, ctx(rig()))).toMatchObject({ kind: 'join', p: { x: 3000, y: 0 } }); });
test('snaps to a fixture centre', () => { expect(snap({ x: 5040, y: 1970 }, ctx(rig()))).toMatchObject({ kind: 'fixture', p: { x: 5000, y: 2000 } }); });
test('snaps to a leg midpoint', () => { expect(snap({ x: 4030, y: -20 }, ctx(rig()))).toMatchObject({ kind: 'mid', p: { x: 4000, y: 0 } }); });
test('falls back to the grid', () => { expect(snap({ x: 12340, y: 7770 }, ctx(rig()))).toMatchObject({ kind: 'grid', p: { x: 12500, y: 8000 } }); });
test('skips excluded entities', () => { expect(snap({ x: 8020, y: 10 }, ctx(rig(), { exclude: new Set(['T']) })).kind).toBe('grid'); });
test('angle snap from a start point', () => {
  const s = snap({ x: 21000, y: 30 }, ctx(rig(), { from: { x: 20000, y: 0 } }));
  expect(s.kind).toBe('angle'); expect(s.p.y).toBeCloseTo(0, 6); expect(s.label).toBe('0°');
});
test('no grid and nothing near means no snap', () => { expect(snap({ x: 12340, y: 7770 }, ctx(rig(), { grid: 0 }))).toMatchObject({ kind: 'none', p: { x: 12340, y: 7770 } }); });
