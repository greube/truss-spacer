/* Power circuits, ported from v2's js/power.js. Pure functions, no DOM.
   Rules agreed with the owner (spec §10):
   - A circuit is always a run of neighbouring fixtures on one run, so fixtures far apart never share one.
   - Each circuit stays at or under the limit (default 80% of 2400 W). A fixture over the limit on its own
     gets its own circuit and a warning.
   - Circuits are balanced: among the allowed splits, the one with the lowest heaviest circuit wins.
   - Socapex: `perSoca` circuits each (6), one or more per run, never shared between runs.
   - fill "spread": use every circuit on the run's Socapex (lighter circuits). "fewest": as few as possible.
   - Optional phase balancing: circuits 1,4 = L1; 2,5 = L2; 3,6 = L3. */

export type Fill = 'spread' | 'fewest';
export interface PowerSettings { circuitW: number; loadPct: number; perSoca: number; fill: Fill; phases: boolean }
export interface Span { from: number; to: number; load: number; over?: boolean }
export interface TrussPlan { groups: Span[]; socas: number; unknown: number[]; overs: number[] }
export interface Circuit { slot: number; label: string; phase: number; from: number; to: number; fixtures: number[]; load: number; over: boolean }
export interface SocaPlan { label: string; circuits: Circuit[] }
export interface PlannedRun { id: string; socas: SocaPlan[]; unknown: number[]; overs: number[]; load: number }
export interface RigPlan {
  limit: number;
  perSoca: number;
  trusses: PlannedRun[];
  total: { load: number; circuits: number; socas: number; phase: [number, number, number]; unknown: number; overs: number };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const socaLabel = (k: number): string => (k < 26 ? LETTERS[k] : LETTERS[Math.floor(k / 26) - 1] + LETTERS[k % 26]);

/** Fewest contiguous groups that respect the limit (greedy is optimal for this). */
export function minGroups(w: number[], limit: number): number {
  let k = 0, load = 0, open = false;
  for (const x of w) {
    if (open && load + x <= limit) load += x;
    else { k++; load = x; open = true; }
    if (load > limit) open = false; // an over-limit fixture sits alone
  }
  return k;
}

/** Splits w (in order) into exactly k contiguous groups: minimises the heaviest group, then the sum of
    squares. Groups over the limit are only allowed as single fixtures. Null when impossible. */
export function splitInto(w: number[], k: number, limit: number): Span[] | null {
  const n = w.length, pre = [0];
  for (const x of w) pre.push(pre[pre.length - 1] + x);
  const load = (a: number, b: number) => pre[b] - pre[a];
  const ok = (a: number, b: number) => b - a === 1 || load(a, b) <= limit + 1e-9;
  type Cell = [number, number, number] | null; // [max, sumsq, previous cut]
  const better = (a: Cell, b: Cell) => !b || a![0] < b[0] - 1e-9 || (Math.abs(a![0] - b[0]) <= 1e-9 && a![1] < b[1] - 1e-9);
  const best: Cell[][] = Array.from({ length: k + 1 }, () => new Array<Cell>(n + 1).fill(null));
  best[0][0] = [0, 0, -1];
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= n - (k - j); i++) {
      let b: Cell = null;
      for (let c = j - 1; c < i; c++) {
        const p = best[j - 1][c];
        if (!p || !ok(c, i)) continue;
        const l = load(c, i);
        const cand: Cell = [Math.max(p[0], l), p[1] + l * l, c];
        if (better(cand, b)) b = cand;
      }
      best[j][i] = b;
    }
  }
  if (!best[k]?.[n]) return null;
  const cuts: [number, number][] = [];
  let i = n;
  for (let j = k; j > 0; j--) { const c = best[j][i]![2]; cuts.unshift([c, i]); i = c; }
  return cuts.map(([a, b]) => ({ from: a, to: b, load: load(a, b) }));
}

/** Plans one run. watts are in physical order, null for a fixture with no wattage. */
export function planTruss(watts: (number | null)[], opt: { limit: number; perSoca?: number; fill?: Fill }): TrussPlan {
  const limit = opt.limit, per = Math.max(1, (opt.perSoca ?? 6) | 0 || 6);
  const w = watts.map((x) => (x == null || !(x > 0) ? 0 : +x));
  const unknown = watts.map((x, i) => (x == null ? i : -1)).filter((i) => i >= 0);
  const n = w.length;
  if (!n) return { groups: [], socas: 0, unknown, overs: [] };
  const kMin = minGroups(w, limit);
  const socas = Math.ceil(kMin / per);
  const k = opt.fill === 'fewest' ? kMin : Math.min(n, socas * per);
  const groups = splitInto(w, k, limit) ?? splitInto(w, kMin, limit)!;
  for (const g of groups) g.over = g.load > limit + 1e-9;
  return { groups, socas, unknown, overs: groups.filter((g) => g.over).map((g) => g.from) };
}

const phaseOf = (s: number) => s % 3;

/** All k-permutations of the free slots. */
function choose(rem: number[], k: number): number[][] {
  if (k === 0) return [[]];
  const res: number[][] = [];
  rem.forEach((x, i) => choose(rem.slice(0, i).concat(rem.slice(i + 1)), k - 1).forEach((r) => res.push([x, ...r])));
  return res;
}

/** Plans the whole rig. runs are in rig order. */
export function planRig(runs: { id: string; watts: (number | null)[] }[], settings: PowerSettings): RigPlan {
  const limit = ((+settings.circuitW || 2400) * (+settings.loadPct || 100)) / 100;
  const per = Math.max(1, Math.min(12, (+settings.perSoca | 0) || 6));
  const phaseLoad: [number, number, number] = [0, 0, 0];
  const total = { load: 0, circuits: 0, socas: 0, phase: phaseLoad, unknown: 0, overs: 0 };
  const out = runs.map((t): PlannedRun => {
    const p = planTruss(t.watts, { limit, perSoca: per, fill: settings.fill });
    const socas: SocaPlan[] = [];
    const nSoca = Math.max(p.socas, Math.ceil(p.groups.length / per));
    for (let s = 0; s < nSoca; s++) {
      const gs = p.groups.slice(s * per, (s + 1) * per);
      let slots = gs.map((_, i) => i);
      if (settings.phases && per <= 6) {
        const free = Array.from({ length: per }, (_, i) => i);
        let best: number[] | null = null, bestKey: number[] | null = null;
        for (const cand of choose(free, gs.length)) {
          const ph = phaseLoad.slice();
          gs.forEach((g, i) => (ph[phaseOf(cand[i])] += g.load));
          const key = [Math.max(...ph), ph.reduce((a, x) => a + x * x, 0), cand.reduce((a, x, i) => a + Math.abs(x - i), 0)];
          if (!bestKey || key[0] < bestKey[0] - 1e-9 || (Math.abs(key[0] - bestKey[0]) <= 1e-9 &&
            (key[1] < bestKey[1] - 1e-9 || (Math.abs(key[1] - bestKey[1]) <= 1e-9 && key[2] < bestKey[2])))) { best = cand; bestKey = key; }
        }
        slots = best!;
      }
      const label = socaLabel(s);
      const circuits: Circuit[] = gs.map((g, i) => ({
        slot: slots[i] + 1, label: label + (slots[i] + 1), phase: phaseOf(slots[i]) + 1, from: g.from, to: g.to,
        fixtures: Array.from({ length: g.to - g.from }, (_, k) => g.from + k), load: g.load, over: !!g.over,
      })).sort((a, b) => a.slot - b.slot);
      for (const c of circuits) phaseLoad[c.phase - 1] += c.load;
      socas.push({ label, circuits });
    }
    const load = p.groups.reduce((a, g) => a + g.load, 0);
    total.load += load; total.circuits += p.groups.length; total.socas += socas.length;
    total.unknown += p.unknown.length; total.overs += p.overs.length;
    return { id: t.id, socas, unknown: p.unknown, overs: p.overs, load };
  });
  return { limit, perSoca: per, trusses: out, total };
}

/** Fixture index → circuit, for one planned run. */
export function circuitMap(pt: PlannedRun): Map<number, Circuit> {
  const m = new Map<number, Circuit>();
  for (const s of pt.socas) for (const c of s.circuits) for (const i of c.fixtures) m.set(i, c);
  return m;
}
