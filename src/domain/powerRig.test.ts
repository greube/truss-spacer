import { describe, test, expect } from 'vitest';
import { powerGroups, rigPower } from './powerRig';
import { newDoc } from '../core/model/doc';
import type { Doc, Fixture, Truss, FixtureType } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';

const type = (key: string, w: number | null): FixtureType => ({ key, m: 'M', n: key, w, src: w == null ? null : 's', url: '', gdtfSpec: '', mode: '', category: 'spot' });
const truss = (id: string, name: string, y = 0, len = 12000): Truss => ({ id, kind: 'truss', name, layerId: 'L', classId: null, positionId: null,
  legs: [{ a: { x: 0, y, z: 6000 }, b: { x: len, y, z: 6000 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null });
let n = 0;
const fix = (x: number, y: number, typeKey: string, o: Partial<Fixture> = {}): Fixture => ({ id: 'F' + n++, kind: 'fixture', name: '', layerId: 'L', classId: null,
  positionId: null, trussId: null, matrix: translate(IDENTITY, { x, y, z: 5700 }), typeKey, unitNumber: n, fixtureId: '', address: null, mvrUuid: null, ...o });
function doc(): Doc {
  const d = newDoc();
  d.layers.push({ id: 'L', name: 'LX', visible: true });
  for (const t of [type('spot', 500), type('big', 2600), type('wash', 1225), type('mystery', null)]) d.types.set(t.key, t);
  return d;
}
const put = (d: Doc, ...es: (Fixture | Truss)[]) => es.forEach((e) => d.entities.set(e.id, e));

describe('power groups', () => {
  test('fixtures on a truss are in order along the run, whatever the doc order', () => {
    const d = doc(); const t = truss('T1', 'Flown A');
    const [a, b, c] = [fix(9000, 0, 'spot', { trussId: 'T1' }), fix(1000, 0, 'spot', { trussId: 'T1' }), fix(5000, 0, 'spot', { trussId: 'T1' })];
    put(d, t, a, b, c);
    expect(powerGroups(d)).toEqual([{ id: 'T1', name: 'Flown A', kind: 'truss', fixtureIds: [b.id, c.id, a.id] }]);
  });

  test('floor fixtures with a position form a group along their line; others are Unassigned', () => {
    const d = doc(); d.positions.push({ id: 'P1', name: 'Floor cyc' });
    const fl = [fix(3000, 2000, 'spot', { positionId: 'P1' }), fix(1000, 1000, 'spot', { positionId: 'P1' }), fix(2000, 1500, 'spot', { positionId: 'P1' })];
    const lo = [fix(500, 9000, 'spot'), fix(100, 9000, 'spot')];
    const t = truss('T1', 'Flown A');
    put(d, ...fl, ...lo, t, fix(100, 0, 'spot', { trussId: 'T1' }));
    const g = powerGroups(d);
    expect(g.map((x) => [x.kind, x.name])).toEqual([['truss', 'Flown A'], ['position', 'Floor cyc'], ['loose', 'Unassigned']]);
    const ends = [g[1].fixtureIds[0], g[1].fixtureIds[2]].sort();
    expect(g[1].fixtureIds[1]).toBe(fl[2].id); // the middle one stays in the middle
    expect(ends).toEqual([fl[0].id, fl[1].id].sort());
    expect(g[2].fixtureIds).toEqual([lo[1].id, lo[0].id]);
  });

  test('a fixture whose truss is gone falls back to its position or Unassigned; empty trusses are left out', () => {
    const d = doc(); const f = fix(0, 0, 'spot', { trussId: 'GONE' });
    put(d, f, truss('T2', 'Empty'));
    expect(powerGroups(d)).toEqual([{ id: 'loose', name: 'Unassigned', kind: 'loose', fixtureIds: [f.id] }]);
  });
});

describe('rig power', () => {
  test('an over-limit fixture is alone on its circuit and flagged', () => {
    const d = doc(); const fx = [fix(1000, 0, 'spot', { trussId: 'T1' }), fix(2000, 0, 'big', { trussId: 'T1' }), fix(3000, 0, 'spot', { trussId: 'T1' })];
    put(d, truss('T1', 'A'), ...fx);
    d.settings.power.fill = 'fewest';
    const r = rigPower(d);
    const big = r.byFixture.get(fx[1].id)!;
    expect(big.over).toBe(true);
    expect(r.byFixture.get(fx[0].id)!.label).not.toBe(big.label);
    expect(r.byFixture.get(fx[2].id)!.label).not.toBe(big.label);
    expect(r.plan.total.overs).toBe(1);
  });

  test('fixtures with no wattage count as 0 W and are counted', () => {
    const d = doc(); put(d, truss('T1', 'A'), fix(1000, 0, 'spot', { trussId: 'T1' }), fix(2000, 0, 'mystery', { trussId: 'T1' }), fix(3000, 0, 'nosuchtype', { trussId: 'T1' }));
    const r = rigPower(d);
    expect(r.unknown).toBe(2);
    expect(r.plan.total.load).toBe(500);
    expect(Number.isNaN(r.plan.total.load)).toBe(false);
  });

  test('14 × 1225 W on one truss gets Socapex A, B and C, not shared with the next truss', () => {
    const d = doc(); const t = truss('T1', 'Big', 0, 30000);
    const fx = Array.from({ length: 14 }, (_, i) => fix(1000 + i * 2000, 0, 'wash', { trussId: 'T1' }));
    const other = fix(1000, 5000, 'spot', { trussId: 'T2' });
    put(d, t, ...fx, truss('T2', 'Small', 5000), other);
    const r = rigPower(d);
    expect(r.plan.trusses[0].socas.map((s) => s.label)).toEqual(['A', 'B', 'C']);
    expect(new Set(fx.map((f) => r.byFixture.get(f.id)!.soca))).toEqual(new Set(['A', 'B', 'C']));
    expect(r.byFixture.get(other.id)).toMatchObject({ group: 'T2', soca: 'A' });
  });

  test('moving a fixture past its neighbour changes the circuits', () => {
    const d = doc(); d.settings.power.fill = 'fewest';
    const fx = [0, 1, 2, 3, 4, 5].map((i) => fix(1000 + i * 1000, 0, i < 3 ? 'spot' : 'wash', { trussId: 'T1' }));
    put(d, truss('T1', 'A'), ...fx);
    const before = rigPower(d).byFixture.get(fx[0].id)!.label;
    expect(rigPower(d).byFixture.get(fx[1].id)!.label).toBe(before);
    fx[0].matrix = translate(IDENTITY, { x: 11000, y: 0, z: 5700 }); // now at the far end, among the washes
    const r = rigPower(d);
    expect(r.byFixture.get(fx[0].id)!.label).not.toBe(r.byFixture.get(fx[1].id)!.label);
  });
});

describe('positions spread across the room (two side columns in one position)', () => {
  test('split where fixtures are far apart, each part in order along itself', () => {
    const d = doc(); d.positions.push({ id: 'P', name: 'Sides' });
    const left = [0, 1500, 3000, 4500].map(y => fix(0, y, 'spot', { positionId: 'P' }));
    const right = [0, 1500, 3000, 4500].map(y => fix(20000, y, 'spot', { positionId: 'P' }));
    put(d, ...[left[2], right[0], left[0], right[3], left[1], right[1], left[3], right[2]]);
    const g = powerGroups(d);
    expect(g.map(x => x.name)).toEqual(['Sides 1', 'Sides 2']);
    const ids = (fs: Fixture[]) => fs.map(f => f.id);
    expect([g[0].fixtureIds, g[1].fixtureIds]).toEqual([ids(left), ids(right)]);
  });
  test('a single tidy row stays one group under its own name', () => {
    const d = doc(); d.positions.push({ id: 'P', name: 'Floor' });
    put(d, ...[0, 1000, 2000].map(x => fix(x, 0, 'spot', { positionId: 'P' })));
    expect(powerGroups(d).map(x => x.name)).toEqual(['Floor']);
  });
});

test('review fix: an evenly spaced row 6 m apart stays one run', () => {
  const d = doc(); d.positions.push({ id: 'P', name: 'Uplights' });
  put(d, ...[0, 6000, 12000, 18000, 24000].map(x => fix(x, 0, 'spot', { positionId: 'P' })));
  expect(powerGroups(d).map(g => [g.name, g.fixtureIds.length])).toEqual([['Uplights', 5]]);
});
