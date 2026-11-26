import type { Doc, Fixture, Truss, Leg, Id } from '../../core/model/types';
import type { V2 } from '../../core/geom/vec';
import type { Command } from '../../core/commands/history';
import { fitLine, dot, sub, dist } from '../../core/geom/vec';
import { newId } from '../../core/model/doc';
import { addEntities } from '../../core/commands/ops';

export interface InferOpts { minHeight: number; maxResidual: number; joinGap: number; maxHeightStep: number; endOverhang: number; boxSize: number; maxLegs: number; maxGap: number }
/** maxGap: when a position has to be split into legs, no leg may have a gap between fixtures longer than this. */
export const INFER_DEFAULTS: InferOpts = { minHeight: 1500, maxResidual: 300, joinGap: 1000, maxHeightStep: 400, endOverhang: 250, boxSize: 300, maxLegs: 4, maxGap: 4000 };

type LegFit = { a: V2; b: V2; z: number; ids: Id[] };

function legFrom(fx: Fixture[], overhang: number): LegFit {
  const pts = fx.map(f => ({ x: f.matrix.o.x, y: f.matrix.o.y }));
  const { origin, dir } = fitLine(pts);
  const ts = pts.map(p => dot(sub(p, origin), dir));
  const t0 = Math.min(...ts) - overhang, t1 = Math.max(...ts) + overhang;
  return { a: { x: origin.x + dir.x * t0, y: origin.y + dir.y * t0 }, b: { x: origin.x + dir.x * t1, y: origin.y + dir.y * t1 }, z: Math.max(...fx.map(f => f.matrix.o.z)), ids: fx.map(f => f.id) };
}
const perp = (p: V2, a: V2, d: V2) => Math.abs((p.x - a.x) * -d.y + (p.y - a.y) * d.x);

/** Splits points into straight legs: one least-squares line if it fits, otherwise repeated best-line (RANSAC over all pairs). */
function splitLegs(fx: Fixture[], o: InferOpts): Fixture[][] | null {
  const P = (f: Fixture) => ({ x: f.matrix.o.x, y: f.matrix.o.y });
  if (fx.length < 2 || fitLine(fx.map(P)).maxResidual <= o.maxResidual) return [fx];
  const legs: Fixture[][] = [];
  let rest = fx.slice();
  while (rest.length && legs.length < o.maxLegs) {
    if (rest.length === 1 || fitLine(rest.map(P)).maxResidual <= o.maxResidual) { legs.push(rest); rest = []; break; }
    let best: Fixture[] = [];
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      const a = P(rest[i]), b = P(rest[j]), L = dist(a, b); if (L < 1) continue;
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      const inl = rest.filter(f => perp(P(f), a, d) <= o.maxResidual);
      if (inl.length > best.length) best = inl;
    }
    if (best.length < 2) break;
    legs.push(best);
    rest = rest.filter(f => !best.includes(f));
  }
  if (rest.length) return null;
  // Split legs must look like truss: at least 3 fixtures, no long empty stretches
  for (const l of legs) {
    if (l.length < 3) return null;
    const { origin, dir } = fitLine(l.map(P));
    const ts = l.map(f => dot(sub(P(f), origin), dir)).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > o.maxGap) return null;
  }
  return legs;
}

function lineIntersect(a1: V2, a2: V2, b1: V2, b2: V2): V2 | null {
  const d1 = sub(a2, a1), d2 = sub(b2, b1), den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2.y - (b1.y - a1.y) * d2.x) / den;
  return { x: a1.x + d1.x * t, y: a1.y + d1.y * t };
}

/** Joins legs whose nearest ends meet into chains (runs). Each chain's legs are oriented end-to-start. */
function chain(legs: LegFit[], o: InferOpts): LegFit[][] {
  const used = new Set<number>(), runs: LegFit[][] = [];
  const near = (l: LegFit, m: LegFit) => Math.min(dist(l.a, m.a), dist(l.a, m.b), dist(l.b, m.a), dist(l.b, m.b));
  for (let s = 0; s < legs.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    let run: LegFit[] = [{ ...legs[s] }];
    let grown = true;
    while (grown) {
      grown = false;
      for (let k = 0; k < legs.length; k++) {
        if (used.has(k)) continue;
        const L = { ...legs[k] }, head = run[0], tail = run[run.length - 1];
        const okZ = (m: LegFit) => Math.abs(m.z - L.z) <= o.maxHeightStep;
        if (okZ(tail) && near(tail, L) <= o.joinGap && Math.min(dist(tail.b, L.a), dist(tail.b, L.b)) <= Math.min(dist(tail.a, L.a), dist(tail.a, L.b)) + 1e-6) {
          if (dist(tail.b, L.b) < dist(tail.b, L.a)) [L.a, L.b] = [L.b, L.a];
          run.push(L); used.add(k); grown = true;
        } else if (okZ(head) && near(head, L) <= o.joinGap) {
          if (dist(head.a, L.a) < dist(head.a, L.b)) [L.a, L.b] = [L.b, L.a];
          run.unshift(L); used.add(k); grown = true;
        }
      }
    }
    // the first leg may need flipping so its end meets the second leg
    if (run.length > 1 && Math.min(dist(run[0].a, run[1].a), dist(run[0].a, run[1].b)) < Math.min(dist(run[0].b, run[1].a), dist(run[0].b, run[1].b))) {
      [run[0].a, run[0].b] = [run[0].b, run[0].a];
      if (dist(run[0].b, run[1].b) < dist(run[0].b, run[1].a)) [run[1].a, run[1].b] = [run[1].b, run[1].a];
    }
    // snap corners to where the lines cross, when that's close to both ends
    for (let i = 0; i + 1 < run.length; i++) {
      const p = lineIntersect(run[i].a, run[i].b, run[i + 1].a, run[i + 1].b);
      if (p && dist(p, run[i].b) <= o.joinGap && dist(p, run[i + 1].a) <= o.joinGap) { run[i].b = p; run[i + 1].a = p; }
    }
    runs.push(run);
  }
  return runs;
}

/** Draft trusses for hanging positions that have fixtures in the air but no truss objects. Doesn't change the doc. */
export function inferTrusses(doc: Doc, opts: Partial<InferOpts> = {}): { trusses: Truss[]; assign: Map<Id, Id>; warnings: string[] } {
  const o = { ...INFER_DEFAULTS, ...opts };
  const trusses: Truss[] = [], assign = new Map<Id, Id>(), warnings: string[] = [];
  const hasTruss = new Set([...doc.entities.values()].flatMap(e => (e.kind === 'truss' && e.positionId ? [e.positionId] : [])));
  const groups = new Map<Id, Fixture[]>();
  for (const e of doc.entities.values()) if (e.kind === 'fixture' && e.positionId && !hasTruss.has(e.positionId)) {
    if (!groups.has(e.positionId)) groups.set(e.positionId, []);
    groups.get(e.positionId)!.push(e);
  }
  for (const [pid, fx] of groups) {
    const name = doc.positions.find(p => p.id === pid)?.name ?? 'Truss';
    const zs = fx.map(f => f.matrix.o.z).sort((a, b) => a - b);
    if (zs[Math.floor(zs.length / 2)] < o.minHeight) continue;
    // Fixtures at clearly different heights are never on the same truss
    const bands: Fixture[][] = [];
    for (const f of fx.slice().sort((a, b) => a.matrix.o.z - b.matrix.o.z)) {
      const last = bands[bands.length - 1];
      if (last && f.matrix.o.z - last[last.length - 1].matrix.o.z <= o.maxHeightStep) last.push(f); else bands.push([f]);
    }
    const legFits: LegFit[] = [];
    let failed = false;
    for (const band of bands) {
      if (band[0].matrix.o.z < o.minHeight) continue;
      const split = splitLegs(band, o);
      if (!split) { failed = true; break; }
      legFits.push(...split.map(l => legFrom(l, o.endOverhang)));
    }
    if (failed || !legFits.length) { if (failed) warnings.push(`Couldn't work out the truss for ${name}. Draw it with Add truss.`); continue; }
    const runs = chain(legFits, o);
    runs.forEach((run, i) => {
      const t: Truss = { id: newId(), kind: 'truss', name: i ? `${name} (${i + 1})` : name, layerId: fx[0].layerId, classId: fx[0].classId, positionId: pid,
        legs: run.map((l): Leg => ({ a: { ...l.a, z: l.z }, b: { ...l.b, z: l.z }, sections: [] })), boxSize: o.boxSize, state: 'draft', mvrUuid: null };
      trusses.push(t);
      for (const l of run) for (const id of l.ids) assign.set(id, t.id);
    });
  }
  return { trusses, assign, warnings };
}

/** The inferred trusses as one undoable step: adds them and attaches their fixtures. */
export function inferCommand(doc: Doc, opts: Partial<InferOpts> = {}): { command: Command | null; count: number; warnings: string[] } {
  const r = inferTrusses(doc, opts);
  if (!r.trusses.length) return { command: null, count: 0, warnings: r.warnings };
  const fixtures = [...r.assign].map(([fid, tid]) => ({ ...(doc.entities.get(fid) as Fixture), trussId: tid }));
  const add = addEntities([...r.trusses, ...fixtures]);
  return { command: { ...add, label: 'Draft trusses' }, count: r.trusses.length, warnings: r.warnings };
}
