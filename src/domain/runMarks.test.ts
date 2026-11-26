import { describe, test, expect } from 'vitest';
import { runLength, runSections, alongRun, pointAt, runMarks } from './runMarks';
import { parseSections } from './spacing';
import { DEFAULT_SPACING } from '../core/model/types';
import type { Truss, Fixture, TrussSpacing } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';
import golden from './v1-golden.json';

const truss = (legs: [number, number, number, number, number[]][]): Truss => ({ id: 'T', kind: 'truss', name: 'LX1', layerId: 'L', classId: null, positionId: null,
  legs: legs.map(([ax, ay, bx, by, sections]) => ({ a: { x: ax, y: ay, z: 6000 }, b: { x: bx, y: by, z: 6000 }, sections })), boxSize: 300, state: 'confirmed', mvrUuid: null });
const fx = (pts: [number, number][]): Fixture[] => pts.map(([x, y], i) => ({ id: 'F' + i, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: 'T',
  matrix: translate(IDENTITY, { x, y, z: 5700 }), typeKey: '', unitNumber: i + 1, fixtureId: '', address: null, mvrUuid: null }));
const st = (o: Partial<TrussSpacing> = {}): TrussSpacing => ({ ...DEFAULT_SPACING, ...o });
const close = (a: number, b: number) => Math.abs(a - b) < 1e-5; // the recorded v1 values are rounded to 6 decimals

describe('run geometry', () => {
  const L = truss([[0, 0, 4000, 0, [2000, 2000]], [4000, 0, 4000, 3000, []]]);
  test('length and sections (an empty leg is one section)', () => { expect(runLength(L)).toBe(7000); expect(runSections(L)).toEqual([2000, 2000, 3000]); });
  test('along the run, through the corner', () => {
    expect(alongRun(L, { x: 4000, y: 1000 })).toMatchObject({ s: 1000 + 4000, leg: 1 });
    expect(alongRun(L, { x: 1000, y: 150 }).lateral).toBeCloseTo(150);
    expect(alongRun(L, { x: -500, y: 0 }).s).toBeCloseTo(-500); // past end A keeps its signed distance
  });
  test('point at a distance', () => { const p = pointAt(L, 5000); expect(p.p.x).toBeCloseTo(4000); expect(p.p.y).toBeCloseTo(1000); expect(p.yaw).toBeCloseTo(Math.PI / 2); });
});

describe('matches v1 for straight trusses', () => {
  const cases = (golden as any[]).filter(c => c.out.r && c.out.r.rows.length).slice(0, 60);
  test(`${cases.length} recorded v1 cases`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    for (const { S, out } of cases) {
      const secs = parseSections(S.sections, S)!, L = secs.reduce((a: number, b: number) => a + b, 0);
      const t = truss([[0, 0, L, 0, secs]]);
      const sorted = out.r.rows.slice().sort((a: any, b: any) => a.p - b.p);
      const rows = runMarks(t, fx(sorted.map((r: any) => [r.p, 0])), st({ ref: S.ref === 'left' ? 'a' : S.ref === 'right' ? 'b' : 'centre', joinWarn: +S.joinWarn || 0 }), { round: S.round });
      const where = JSON.stringify(S);
      expect(rows.length, where).toBe(out.r.rows.length);
      out.r.rows.forEach((g: any, k: number) => {
        const r = rows[k];
        expect(close(r.mark, g.mark), `${where} mark ${k}`).toBe(true); expect(r.near, `${where} near ${k}`).toBe(g.near);
        // a fixture exactly on a join can fall either side once the recorded position is rounded: skip section checks there
        let acc = 0; const onJoin = secs.some((x: number) => { acc += x; return Math.abs(acc - g.p) < 0.01; });
        if (!onJoin) { expect(r.sec, `${where} sec ${k}`).toBe(g.sec); expect(close(r.off, g.off), `${where} off ${k}`).toBe(true); }
        expect(g.gap === null ? r.gap === null : close(r.gap!, g.gap), `${where} gap ${k}`).toBe(true);
      });
    }
  });
});

describe('marks on a run', () => {
  const L = truss([[0, 0, 4000, 0, [2000, 2000]], [4000, 0, 4000, 3000, [3000]]]);
  const F = fx([[1000, 0], [3950, 0], [4000, 1000], [4000, 2500]]); // 3950 is 50 mm from the corner join
  test('from end A, through a corner', () => {
    const r = runMarks(L, F, st(), { round: 5 });
    expect(r.map(x => x.mark)).toEqual([1000, 3950, 5000, 6500]); expect(r.map(x => x.sec)).toEqual([1, 2, 3, 3]);
    expect(r.map(x => x.off)).toEqual([1000, 1950, 1000, 2500]); expect(r.map(x => x.near)).toEqual([false, true, false, false]);
  });
  test('from end B, counting sections from B', () => {
    const r = runMarks(L, F, st({ ref: 'b' }), { round: 5 });
    expect(r.map(x => x.mark)).toEqual([500, 2000, 3050, 6000]); expect(r.map(x => x.sec)).toEqual([1, 1, 2, 3]); expect(r[0].off).toBe(500);
  });
  test('a fixture off the line is flagged', () => {
    const r = runMarks(L, fx([[1000, 0], [2000, 420]]), st(), { round: 5 });
    expect(r[0].offLine).toBeNull(); expect(r[1].offLine).toBeCloseTo(420);
  });
  test('uneven gaps are flagged', () => {
    const r = runMarks(truss([[0, 0, 8000, 0, []]]), fx([[250, 0], [1750, 0], [3250, 0], [4500, 0], [6250, 0], [7750, 0]]), st(), { round: 5 });
    expect(r.map(x => x.uneven)).toEqual([false, false, false, true, true, false]);
  });
  test('sections that disagree with the drawing still give marks', () => {
    const r = runMarks(truss([[0, 0, 8550, 0, [3000, 3000, 2000]]]), fx([[250, 0], [8300, 0]]), st({ ref: 'b' }), { round: 5 });
    expect(r[0].mark).toBe(250); expect(r[1].mark).toBe(8300);
  });
  test('offsets match v1 on main (3+3+2, 0.25 m end gaps, 6 fixtures)', () => {
    const t = truss([[0, 0, 8000, 0, [3000, 3000, 2000]]]), F6 = fx([0, 1, 2, 3, 4, 5].map(i => [250 + i * 1500, 0] as [number, number]));
    expect(runMarks(t, F6, st({ ref: 'a', offset: 500, offsetSide: 'before' }), { round: 5 })[0].mark).toBe(-250);
    expect(runMarks(t, F6, st({ ref: 'a', offset: 500, offsetSide: 'after' }), { round: 5 })[0].mark).toBe(750);
    expect(runMarks(t, F6, st({ ref: 'centre', offset: 500, offsetSide: 'before' }), { round: 5 })[0].mark).toBe(-4250);
    expect(runMarks(t, F6, st({ ref: 'centre', offset: 500, offsetSide: 'after' }), { round: 5 })[0].mark).toBe(-3250);
  });
  test('no fixtures, no rows', () => { expect(runMarks(L, [], st(), { round: 5 })).toEqual([]); });
});

describe('sections that do not add up to their leg (review fix)', () => {
  // leg 1 drawn 3700 with sections 3000+1000; leg 2 drawn 3000 with one 3000 section
  const M = truss([[0, 0, 3700, 0, [3000, 1000]], [3700, 0, 3700, 3000, [3000]]]);
  test('each leg starts its own sections, so past the corner is section 3', () => {
    const rows = runMarks(M, fx([[3700, 100], [3700, 1500], [3200, 0]]), st(), { round: 5 });
    const [r0, r1, r2] = rows; // sorted along the run: (3200,0), (3700,100), (3700,1500)
    expect([r0.sec, r0.off]).toEqual([2, 200]);
    expect([r1.sec, r1.off]).toEqual([3, 100]);
    expect([r2.sec, r2.off]).toEqual([3, 1500]);
  });
  test('from end B the same fixtures count back from B', () => {
    const rows = runMarks(M, fx([[3700, 100], [3700, 1500], [3200, 0]]), st({ ref: 'b' }), { round: 5 });
    // reversed: (3700,1500) then (3700,100) then (3200,0)
    expect(rows.map(r => [r.sec, r.off])).toEqual([[1, 1500], [1, 2900], [2, 500]]);
  });
  test('legMismatch lists legs whose sections disagree with the drawing', async () => {
    const { legMismatch } = await import('./runMarks');
    expect(legMismatch(M)).toEqual([{ leg: 0, sections: 4000, drawn: 3700 }]);
    expect(legMismatch(truss([[0, 0, 8000, 0, [3000, 3000, 2000]]]))).toEqual([]);
    expect(legMismatch(truss([[0, 0, 8000, 0, []]]))).toEqual([]);
  });
});
