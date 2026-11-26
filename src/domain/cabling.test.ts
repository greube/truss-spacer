import { describe, test, expect } from 'vitest';
import { stockFor, jumper, rigCabling } from './cabling';
import { newDoc } from '../core/model/doc';
import type { Doc, Fixture, Truss } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';

const truss = (id: string, legs: [number, number, number, number][], o: Partial<Truss> = {}): Truss => ({ id, kind: 'truss', name: id, layerId: 'L', classId: null, positionId: null,
  legs: legs.map(([ax, ay, bx, by]) => ({ a: { x: ax, y: ay, z: 6000 }, b: { x: bx, y: by, z: 6000 }, sections: [] })), boxSize: 300, state: 'confirmed', mvrUuid: null, ...o });
let n = 0;
const fix = (x: number, y: number, o: Partial<Fixture> = {}): Fixture => ({ id: 'F' + n++, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: null,
  matrix: translate(IDENTITY, { x, y, z: 5700 }), typeKey: 't', unitNumber: null, fixtureId: '', address: 1, mvrUuid: null, ...o });
function doc(...es: (Truss | Fixture)[]): Doc { const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true }); es.forEach(e => d.entities.set(e.id, e)); return d; }
const lens = (d: Doc, i = 0, c = 0) => rigCabling(d).runs[i].chains[c].cables.map(x => [Math.round(x.gap), x.len]);

describe('stock lengths', () => {
  test('rounds up to the next stock length, exactly-on stays put', () => {
    expect(stockFor(2999)).toEqual({ len: 3000, count: 1 });
    expect(stockFor(3000)).toEqual({ len: 3000, count: 1 });
    expect(stockFor(3000.0000001)).toEqual({ len: 3000, count: 1 });
    expect(stockFor(3002)).toEqual({ len: 5000, count: 1 });
    expect(stockFor(400)).toEqual({ len: 1000, count: 1 });
    expect(stockFor(120000)).toEqual({ len: 50000, count: 3 });
  });
  test('jumper = gap + 2 × truss depth + 0.5 m', () => {
    expect(jumper(1200, 300)).toEqual({ need: 2300, len: 3000, count: 1 });
    expect(jumper(2000, 0)).toEqual({ need: 2500, len: 3000, count: 1 });
  });
});

describe('daisy-chains', () => {
  test('from end A: a feed from the end, then a jumper between each pair', () => {
    const d = doc(truss('T', [[0, 0, 10000, 0]]), ...[1000, 3000, 4000, 9000].map(x => fix(x, 0, { trussId: 'T' })));
    expect(lens(d)).toEqual([[1000, 3000], [2000, 5000], [1000, 3000], [5000, 10000]]);
    expect(rigCabling(d).runs[0].chains[0].cables[0].fromId).toBeNull();
  });
  test('from end B the chain runs the other way', () => {
    const d = doc(truss('T', [[0, 0, 10000, 0]], { dmxFrom: 'b' } as Partial<Truss>), ...[1000, 3000, 4000, 9000].map(x => fix(x, 0, { trussId: 'T' })));
    expect(lens(d)).toEqual([[1000, 3000], [5000, 10000], [1000, 3000], [2000, 5000]]);
    expect(rigCabling(d).runs[0].from).toBe('b');
  });
  test('round a corner the gap is along the truss', () => {
    const d = doc(truss('T', [[0, 0, 4000, 0], [4000, 0, 4000, 4000]]), fix(3000, 0, { trussId: 'T' }), fix(4000, 1000, { trussId: 'T' }));
    expect(lens(d)[1]).toEqual([2000, 5000]); // the straight line (1414) would give 3 m
  });
  test('two universes on one truss: two chains from the same end; the pull list counts both', () => {
    const d = doc(truss('T', [[0, 0, 10000, 0]]), fix(1000, 0, { trussId: 'T', address: 1 }), fix(2000, 0, { trussId: 'T', address: 513 }), fix(3000, 0, { trussId: 'T', address: 20 }));
    const rc = rigCabling(d);
    expect(rc.runs[0].chains.map(c => [c.universe, c.cables.map(x => Math.round(x.gap))])).toEqual([[1, [1000, 2000]], [2, [2000]]]);
    expect([rc.pull.get(3000), rc.pull.get(5000)]).toEqual([1, 2]);
    expect(rc.total).toBe(3);
  });
  test('floor positions have no truss depth and no feed from a truss end; unassigned fixtures are flagged', () => {
    const d = doc(fix(0, 0, { positionId: 'P' }), fix(1500, 0, { positionId: 'P' }), fix(0, 9000), fix(5000, 9000));
    d.positions.push({ id: 'P', name: 'Floor' });
    const rc = rigCabling(d);
    expect(rc.runs[0].chains[0].cables.map(c => c.need)).toEqual([2000]);
    expect(rc.runs[1].flags.join(' ')).toMatch(/check the route/i);
  });
  test('one fixture gets just the feed; an empty truss has no run; no address is flagged', () => {
    const d = doc(truss('T', [[0, 0, 10000, 0]]), truss('E', [[0, 5000, 10000, 5000]]), fix(1000, 0, { trussId: 'T', address: null }));
    const rc = rigCabling(d);
    expect(rc.runs.length).toBe(1);
    expect(rc.runs[0].chains[0].cables.length).toBe(1);
    expect(rc.runs[0].flags.join(' ')).toMatch(/no DMX address/);
  });
  test('a gap over 50 m is flagged and counted in 50 m cables', () => {
    const d = doc(fix(0, 0), fix(120000, 0));
    const c = rigCabling(d).runs[0].chains[0].cables[0];
    expect(c).toMatchObject({ len: 50000, count: 3, over: true });
  });
});
