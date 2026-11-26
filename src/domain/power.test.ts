import { describe, expect, it } from 'vitest';
import { circuitMap, minGroups, planRig, planTruss, socaLabel, splitInto, type Span } from './power';

const spans = (gs: Span[]) => gs.map((g) => [g.from, g.to]);

/** Every contiguous split of 0..n into k groups, for brute-force checks. */
function* splits(n: number, k: number, start = 0): Generator<[number, number][]> {
  if (k === 1) { yield [[start, n]]; return; }
  for (let c = start + 1; c <= n - k + 1; c++) for (const rest of splits(n, k - 1, c)) yield [[start, c], ...rest];
}
const lcg = (seed: number) => () => (seed = (seed * 48271) % 2147483647) / 2147483647;

describe('power circuits (ported from v2)', () => {
  it('fewest: minimum circuits under the limit', () => {
    const p = planTruss([500, 500, 500, 500, 500, 500], { limit: 1920, fill: 'fewest', perSoca: 6 });
    expect(spans(p.groups)).toEqual([[0, 3], [3, 6]]);
    expect(p.groups.map((g) => g.load)).toEqual([1500, 1500]);
  });

  it('spread: uses all 6 circuits of the Socapex', () => {
    const p = planTruss(new Array(8).fill(500), { limit: 1920, fill: 'spread', perSoca: 6 });
    expect(p.groups.length).toBe(6);
    expect(p.socas).toBe(1);
    expect(p.groups.every((g) => g.load <= 1000)).toBe(true);
    expect(planTruss([300, 300, 300], { limit: 1920, fill: 'spread' }).groups.length).toBe(3);
  });

  it('a big truss gets a second Socapex', () => {
    const w = new Array(14).fill(700);
    const p = planTruss(w, { limit: 1920, fill: 'fewest', perSoca: 6 });
    expect(p.groups.length).toBe(7);
    expect(p.socas).toBe(2);
    const r = planRig([{ id: 'a', watts: w }], { circuitW: 2400, loadPct: 80, perSoca: 6, fill: 'spread', phases: false });
    expect(r.trusses[0].socas.map((s) => s.circuits.length)).toEqual([6, 6]);
    expect(r.trusses[0].socas[1].circuits[0].label).toBe('B1');
  });

  it('groups are always neighbours and never over the limit', () => {
    const rnd = lcg(3);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rnd() * 30);
      const w = Array.from({ length: n }, () => Math.round(50 + rnd() * 1200));
      for (const fill of ['spread', 'fewest'] as const) {
        const p = planTruss(w, { limit: 1920, fill, perSoca: 6 });
        let next = 0;
        for (const g of p.groups) {
          expect(g.from).toBe(next);
          expect(g.to).toBeGreaterThan(g.from);
          next = g.to;
          expect(g.load <= 1920 || g.to - g.from === 1).toBe(true);
        }
        expect(next).toBe(n);
      }
    }
  });

  it('balanced: matches brute force for the heaviest circuit', () => {
    const rnd = lcg(11);
    for (let t = 0; t < 120; t++) {
      const n = 2 + Math.floor(rnd() * 9);
      const w = Array.from({ length: n }, () => Math.round(100 + rnd() * 900));
      const k = minGroups(w, 1920);
      let bestMax = Infinity;
      for (const s of splits(n, k)) {
        const loads = s.map(([a, b]) => w.slice(a, b).reduce((x, y) => x + y, 0));
        if (s.every(([a, b], i) => loads[i] <= 1920 || b - a === 1)) bestMax = Math.min(bestMax, Math.max(...loads));
      }
      expect(Math.max(...splitInto(w, k, 1920)!.map((g) => g.load))).toBe(bestMax);
    }
  });

  it('a fixture over the limit gets its own circuit and a warning', () => {
    const p = planTruss([400, 3000, 400], { limit: 1920, fill: 'fewest' });
    expect(spans(p.groups)).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(p.overs).toEqual([1]);
  });

  it('fixtures with no type count as 0 W and are listed', () => {
    const p = planTruss([500, null, 500], { limit: 1920, fill: 'fewest' });
    expect(p.unknown).toEqual([1]);
    expect(p.groups.length).toBe(1);
  });

  it('an empty truss and an all-unknown truss plan without NaN', () => {
    expect(planTruss([], { limit: 1920 }).groups).toEqual([]);
    const r = planRig([{ id: 'a', watts: [null, null] }, { id: 'b', watts: [] }], { circuitW: 2400, loadPct: 80, perSoca: 6, fill: 'spread', phases: true });
    expect(r.total.load).toBe(0);
    expect(r.total.unknown).toBe(2);
    expect(r.total.phase.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('phase balancing evens L1/L2/L3 across the rig', () => {
    const base = { circuitW: 2400, loadPct: 80, perSoca: 6, fill: 'fewest' as const };
    const off = planRig([{ id: 'a', watts: [1800, 1800, 1800] }, { id: 'b', watts: [1800, 1800, 1800] }], { ...base, phases: false });
    expect(off.total.phase).toEqual([3600, 3600, 3600]);
    const uneven = ['a', 'b', 'c'].map((id) => ({ id, watts: [1800, 1800] }));
    expect(planRig(uneven, { ...base, phases: false }).total.phase).toEqual([5400, 5400, 0]);
    const bal = planRig(uneven, { ...base, phases: true });
    expect(bal.total.phase).toEqual([3600, 3600, 3600]);
    expect(bal.total.load).toBe(10800);
  });

  it('circuitMap maps fixture index to its circuit', () => {
    const r = planRig([{ id: 'a', watts: [500, 500, 500] }], { circuitW: 2400, loadPct: 80, perSoca: 6, fill: 'fewest', phases: false });
    const m = circuitMap(r.trusses[0]);
    expect([0, 1, 2].map((i) => m.get(i)!.label)).toEqual(['A1', 'A1', 'A1']);
  });

  it('Socapex labels', () => {
    expect([socaLabel(0), socaLabel(25), socaLabel(26)]).toEqual(['A', 'Z', 'AA']);
  });
});
