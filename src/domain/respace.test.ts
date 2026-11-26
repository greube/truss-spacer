import { test, expect } from 'vitest';
import { respaceCommand } from './respace';
import { History } from '../core/commands/history';
import { newDoc, docToJSON } from '../core/model/doc';
import { DEFAULT_SPACING } from '../core/model/types';
import { IDENTITY, translate, yawOf } from '../core/geom/matrix';
import type { Doc, Truss, Fixture, TrussSpacing } from '../core/model/types';

function rig(legs: [number, number, number, number, number[]][], pts: [number, number][]): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true });
  d.entities.set('T', { id: 'T', kind: 'truss', name: 'LX1', layerId: 'L', classId: null, positionId: null, legs: legs.map(([ax, ay, bx, by, sections]) => ({ a: { x: ax, y: ay, z: 6000 }, b: { x: bx, y: by, z: 6000 }, sections })), boxSize: 300, state: 'confirmed', mvrUuid: null } as Truss);
  pts.forEach(([x, y], i) => d.entities.set('F' + i, { id: 'F' + i, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: 'T', matrix: translate(IDENTITY, { x, y, z: 5700 }), typeKey: '', unitNumber: i + 1, fixtureId: '', address: null, mvrUuid: null } as Fixture));
  return d;
}
const st = (o: Partial<TrussSpacing> = {}): TrussSpacing => ({ ...DEFAULT_SPACING, ...o });
const xs = (d: Doc) => [...d.entities.values()].filter((e): e is Fixture => e.kind === 'fixture').sort((a, b) => a.id < b.id ? -1 : 1).map(f => Math.round(f.matrix.o.x * 1000) / 1000);

test('edge mode on 3+3+2 puts 6 fixtures at 0.25 … 7.75 m, keeping their order and height', () => {
  const d = rig([[0, 0, 8000, 0, [3000, 3000, 2000]]], [[400, 0], [1200, 0], [3300, 0], [5000, 0], [6000, 0], [7600, 0]]);
  const { command } = respaceCommand(d, 'T', st({ mode: 'edge', inset: 250 })); new History(d).exec(command!);
  expect(xs(d)).toEqual([250, 1750, 3250, 4750, 6250, 7750]);
  expect((d.entities.get('F0') as Fixture).matrix.o.z).toBe(5700);
});
test('equal gaps through a corner, turning to follow the leg', () => {
  const d = rig([[0, 0, 4000, 0, [2000, 2000]], [4000, 0, 4000, 3000, [3000]]], [[500, 0], [3000, 0], [4000, 2000]]);
  const { command } = respaceCommand(d, 'T', st({ mode: 'equal' })); new History(d).exec(command!);
  const f2 = d.entities.get('F2') as Fixture;
  expect(f2.matrix.o.x).toBeCloseTo(4000); expect(f2.matrix.o.y).toBeCloseTo(1250); expect(yawOf(f2.matrix)).toBeCloseTo(Math.PI / 2);
  expect((d.entities.get('F1') as Fixture).matrix.o.x).toBeCloseTo(3500);
});
test('one fixture is centred', () => {
  const d = rig([[0, 0, 8000, 0, []]], [[900, 0]]);
  new History(d).exec(respaceCommand(d, 'T', st()).command!); expect(xs(d)).toEqual([4000]);
});
test('undo restores every fixture exactly, in one step', () => {
  const d = rig([[0, 0, 8000, 0, [3000, 3000, 2000]]], [[400, 0], [1200, 0], [3300, 0]]); const before = JSON.stringify(docToJSON(d)); const h = new History(d);
  h.exec(respaceCommand(d, 'T', st({ mode: 'cells' })).command!); expect(JSON.stringify(docToJSON(d))).not.toBe(before);
  h.undo(); expect(JSON.stringify(docToJSON(d))).toBe(before); expect(h.canUndo).toBe(false);
});
test('fixtures well off the truss line are left alone unless included', () => {
  const d = rig([[0, 0, 8000, 0, []]], [[400, 0], [5000, 0], [6000, 900]]);
  new History(d).exec(respaceCommand(d, 'T', st({ mode: 'equal' })).command!);
  expect((d.entities.get('F2') as Fixture).matrix.o.y).toBe(900); expect(xs(d).slice(0, 2)).toEqual([2666.667, 5333.333]);
  const d2 = rig([[0, 0, 8000, 0, []]], [[400, 0], [5000, 0], [6000, 900]]);
  new History(d2).exec(respaceCommand(d2, 'T', st({ mode: 'equal' }), { includeOffLine: true }).command!);
  expect((d2.entities.get('F2') as Fixture).matrix.o.y).toBeCloseTo(0);
});
test('warnings: no fixtures, and too many at a fixed gap', () => {
  expect(respaceCommand(rig([[0, 0, 8000, 0, []]], []), 'T', st())).toEqual({ command: null, warning: 'No fixtures on this truss.' });
  const r = respaceCommand(rig([[0, 0, 8000, 0, []]], [[1, 0], [2, 0], [3, 0], [4, 0]]), 'T', st({ mode: 'fixed', gap: 3000 }));
  expect(r.command).not.toBeNull(); expect(r.warning).toMatch(/longer than the truss/);
});
