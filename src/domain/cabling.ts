/* DMX daisy-chains (spec §8 milestone 4, §10). Each truss run is chained from its chosen end (A unless
   Truss.dmxFrom says B), one chain per DMX universe. The first cable runs from the truss end to the first
   fixture; drop cables from the deck are out of scope. Jumper = gap + 2 × truss depth + 0.5 m, rounded up
   to stock. Floor positions chain along their line with no truss depth and no feed. */
import type { Doc, Fixture, Id, Truss } from '../core/model/types';
import { toUniverseAddress } from '../core/geom/address';
import { alongRun, runLength } from './runMarks';
import { powerGroups, type PowerGroup } from './powerRig';

export const STOCK = [1000, 2000, 3000, 5000, 10000, 20000, 50000] as const;
const SLACK = 500, TOL = 1; // mm

export interface Cable { fromId: Id | null; toId: Id; gap: number; need: number; len: number; count: number; over: boolean }
export interface Chain { universe: number | null; cables: Cable[] }
export interface CableRun { group: string; name: string; kind: PowerGroup['kind']; from: 'a' | 'b'; chains: Chain[]; flags: string[] }
export interface RigCabling { runs: CableRun[]; pull: Map<number, number>; total: number }

/** The smallest stock length that covers mm; over 50 m, as many 50 m cables as it takes. */
export function stockFor(mm: number): { len: number; count: number } {
  for (const len of STOCK) if (mm <= len + TOL) return { len, count: 1 };
  return { len: 50000, count: Math.ceil((mm - TOL) / 50000) };
}

export function jumper(gap: number, depth: number): { need: number; len: number; count: number } {
  const need = gap + 2 * depth + SLACK;
  return { need, ...stockFor(need) };
}

export function rigCabling(doc: Doc): RigCabling {
  const runs: CableRun[] = [], pull = new Map<number, number>(); let total = 0;
  for (const g of powerGroups(doc)) {
    const fx = g.fixtureIds.map(id => doc.entities.get(id) as Fixture);
    const t = g.kind === 'truss' ? (doc.entities.get(g.id) as Truss) : null;
    const from: 'a' | 'b' = t?.dmxFrom === 'b' ? 'b' : 'a';
    const depth = t ? t.boxSize : 0, L = t ? runLength(t) : 0;
    // position along the run, measured from the chosen end
    const pos = new Map<Id, number>();
    if (t) for (const f of fx) { const s = alongRun(t, { x: f.matrix.o.x, y: f.matrix.o.y }).s; pos.set(f.id, from === 'a' ? s : L - s); }
    const ordered = from === 'b' ? fx.slice().reverse() : fx;
    const flags: string[] = [];
    if (g.kind === 'loose') flags.push('Not on a truss or position: chained nearest first, check the route.');
    const noAddr = fx.filter(f => f.address == null).length;
    if (noAddr) flags.push(`${noAddr} fixture${noAddr === 1 ? ' has' : 's have'} no DMX address (put on the first line).`);
    // one chain per universe, in order of first appearance from the chosen end; unaddressed fixtures join the first
    const uni = (f: Fixture) => (f.address == null ? null : toUniverseAddress(f.address).universe);
    const order: (number | null)[] = [];
    for (const f of ordered) { const u = uni(f); if (u != null && !order.includes(u)) order.push(u); }
    if (!order.length) order.push(null);
    const chains: Chain[] = order.map(u => ({ universe: u, cables: [] }));
    const members = new Map<number | null, Fixture[]>(order.map(u => [u, []]));
    for (const f of ordered) members.get(uni(f) ?? order[0])!.push(f);
    if (order.length > 1) flags.push(`${order.length} DMX lines on this run (universes ${order.join(', ')}).`);
    const dist = (a: Fixture, b: Fixture) => (t ? Math.abs(pos.get(b.id)! - pos.get(a.id)!) : Math.hypot(b.matrix.o.x - a.matrix.o.x, b.matrix.o.y - a.matrix.o.y));
    for (const ch of chains) {
      const list = members.get(ch.universe)!;
      list.forEach((f, i) => {
        if (i === 0 && !t) return; // floor and loose runs: no feed from a truss end
        const gap = i === 0 ? Math.max(0, pos.get(f.id)!) : dist(list[i - 1], f);
        const j = jumper(gap, depth);
        ch.cables.push({ fromId: i === 0 ? null : list[i - 1].id, toId: f.id, gap, ...j, over: j.need > 50000 + TOL });
        pull.set(j.len, (pull.get(j.len) ?? 0) + j.count); total += j.count;
      });
    }
    if (chains.some(c => c.cables.some(x => x.over))) flags.push('A gap is over 50 m: join cables.');
    runs.push({ group: g.id, name: g.name, kind: g.kind, from, chains, flags });
  }
  return { runs, pull, total };
}
