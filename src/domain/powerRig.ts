/* The rig as power runs: each truss (fixtures in order along it), then each hanging position's
   fixtures that aren't on a truss (in order along their best-fit line), then everything else. */
import type { Doc, Fixture, Id, Truss } from '../core/model/types';
import { fitLine } from '../core/geom/vec';
import { alongRun } from './runMarks';
import { planRig, type RigPlan } from './power';

export interface PowerGroup { id: string; name: string; kind: 'truss' | 'position' | 'loose'; fixtureIds: Id[] }
export interface FixturePower { group: string; soca: string; label: string; phase: number; load: number; over: boolean; watts: number | null }
export interface RigPower { plan: RigPlan; groups: PowerGroup[]; byFixture: Map<Id, FixturePower>; unknown: number }

const xy = (f: Fixture) => ({ x: f.matrix.o.x, y: f.matrix.o.y });
/** Fixtures further apart than this (not on a truss), and well beyond the row's usual spacing, start a new run:
    the two sides of a room aren't one row. */
const SPLIT = 5000;

/** A best-fit direction pointing left to right (or bottom to top for a line running up the plan). */
function readingDir(fs: Fixture[]) {
  const { origin, dir } = fitLine(fs.map(xy));
  const d = dir.x < -1e-9 || (Math.abs(dir.x) <= 1e-9 && dir.y < 0) ? { x: -dir.x, y: -dir.y } : dir;
  return (f: Fixture) => (f.matrix.o.x - origin.x) * d.x + (f.matrix.o.y - origin.y) * d.y;
}

/** Orders fixtures that aren't on a truss as a walk from one end to its nearest neighbour each time, then cuts
    the walk wherever the next fixture is more than SPLIT away. Each part reads left to right. */
export function floorRuns(fs: Fixture[]): Fixture[][] {
  if (fs.length < 2) return fs.length ? [fs.slice()] : [];
  const along = readingDir(fs);
  const left = fs.slice().sort((a, b) => along(a) - along(b) || a.matrix.o.y - b.matrix.o.y || a.matrix.o.x - b.matrix.o.x);
  const path = [left[0]], rest = new Set(left.slice(1));
  while (rest.size) {
    const cur = path[path.length - 1]; let best: Fixture | null = null, bd = Infinity;
    for (const f of rest) { const d = Math.hypot(f.matrix.o.x - cur.matrix.o.x, f.matrix.o.y - cur.matrix.o.y); if (d < bd - 1e-9) { bd = d; best = f; } }
    path.push(best!); rest.delete(best!);
  }
  // cut only at a gap that is both long and well beyond the row's usual spacing, so an evenly spaced row stays whole
  const gaps = path.slice(1).map((b, i) => Math.hypot(b.matrix.o.x - path[i].matrix.o.x, b.matrix.o.y - path[i].matrix.o.y));
  const med = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const parts: Fixture[][] = [[path[0]]];
  for (let i = 1; i < path.length; i++) {
    const g = gaps[i - 1];
    if (g > SPLIT && g > 3 * med) parts.push([]);
    parts[parts.length - 1].push(path[i]);
  }
  return parts.map(p => { if (p.length < 2) return p; const al = readingDir(p); return al(p[0]) > al(p[p.length - 1]) ? p.reverse() : p; });
}

export function powerGroups(doc: Doc): PowerGroup[] {
  const trusses: Truss[] = [], onTruss = new Map<Id, Fixture[]>(), onPos = new Map<Id, Fixture[]>(), loose: Fixture[] = [];
  for (const e of doc.entities.values()) if (e.kind === 'truss') { trusses.push(e); onTruss.set(e.id, []); }
  const posIds = new Set(doc.positions.map((p) => p.id));
  for (const e of doc.entities.values()) {
    if (e.kind !== 'fixture') continue;
    if (e.trussId && onTruss.has(e.trussId)) onTruss.get(e.trussId)!.push(e);
    else if (e.positionId && posIds.has(e.positionId)) { if (!onPos.has(e.positionId)) onPos.set(e.positionId, []); onPos.get(e.positionId)!.push(e); }
    else loose.push(e);
  }
  const out: PowerGroup[] = [];
  for (const t of trusses) {
    const fs = onTruss.get(t.id)!;
    if (!fs.length) continue;
    const s = new Map(fs.map((f) => [f.id, alongRun(t, xy(f)).s]));
    fs.sort((a, b) => s.get(a.id)! - s.get(b.id)!);
    out.push({ id: t.id, name: t.name || 'Truss', kind: 'truss', fixtureIds: fs.map((f) => f.id) });
  }
  for (const p of doc.positions) {
    const fs = onPos.get(p.id);
    if (!fs?.length) continue;
    const parts = floorRuns(fs), base = p.name || 'Position';
    parts.forEach((part, k) => out.push({ id: 'pos:' + p.id + (parts.length > 1 ? ':' + (k + 1) : ''), name: parts.length > 1 ? `${base} ${k + 1}` : base, kind: 'position', fixtureIds: part.map(f => f.id) }));
  }
  if (loose.length) {
    const parts = floorRuns(loose);
    parts.forEach((part, k) => out.push({ id: 'loose' + (parts.length > 1 ? ':' + (k + 1) : ''), name: parts.length > 1 ? `Unassigned ${k + 1}` : 'Unassigned', kind: 'loose', fixtureIds: part.map(f => f.id) }));
  }
  return out;
}

/** Plans the rig's power from the current plot, types and settings. */
export function rigPower(doc: Doc): RigPower {
  const groups = powerGroups(doc);
  const wattsOf = (id: Id): number | null => {
    const f = doc.entities.get(id) as Fixture;
    const w = doc.types.get(f.typeKey)?.w;
    return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : null;
  };
  const runs = groups.map((g) => ({ id: g.id, watts: g.fixtureIds.map(wattsOf) }));
  const plan = planRig(runs, doc.settings.power);
  const byFixture = new Map<Id, FixturePower>();
  plan.trusses.forEach((pt, gi) => {
    const g = groups[gi];
    for (const s of pt.socas) for (const c of s.circuits) for (const i of c.fixtures) {
      byFixture.set(g.fixtureIds[i], { group: g.id, soca: s.label, label: c.label, phase: c.phase, load: c.load, over: c.over, watts: runs[gi].watts[i] });
    }
  });
  return { plan, groups, byFixture, unknown: plan.total.unknown };
}
