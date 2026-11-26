/* Marks along a truss run (a polyline of legs, measured along the truss centre line through its corners).
   For a straight truss this gives exactly v1's marks (runMarks.test.ts checks it against recorded v1 cases). */
import type { Truss, Fixture, TrussSpacing } from '../core/model/types';
import type { V2, V3 } from '../core/geom/vec';
import { rnd, fmt } from './spacing';
import type { FmtSettings } from './spacing';

export interface MarkRow { id: string; unit: number | null; s: number; mark: number; sec: number; off: number; near: boolean; gap: number | null; offLine: number | null; uneven: boolean }

const OFF_LINE = 300, UNEVEN = 25; // mm
const legLen = (l: Truss['legs'][number]) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

export const runLength = (t: Truss): number => t.legs.reduce((s, l) => s + legLen(l), 0);

/** Each leg's sections in order; a leg with none counts as one section of its own length. */
export const runSections = (t: Truss): number[] => t.legs.flatMap(l => (l.sections.length ? l.sections : [legLen(l)]));

/** Where p is along the run: distance from end A (signed beyond the ends), sideways distance, and which leg. */
export function alongRun(t: Truss, p: V2): { s: number; lateral: number; leg: number } {
  let best = { s: 0, lateral: Infinity, leg: 0 }, start = 0;
  t.legs.forEach((l, i) => {
    const L = legLen(l), dx = (l.b.x - l.a.x) / (L || 1), dy = (l.b.y - l.a.y) / (L || 1);
    let u = (p.x - l.a.x) * dx + (p.y - l.a.y) * dy; // along this leg, unclamped
    const first = i === 0, last = i === t.legs.length - 1;
    const uc = Math.max(first ? -Infinity : 0, Math.min(last ? Infinity : L, u));
    const lateral = Math.hypot(p.x - (l.a.x + dx * uc), p.y - (l.a.y + dy * uc));
    if (lateral < best.lateral - 1e-9) best = { s: start + uc, lateral, leg: i };
    start += L; void u;
  });
  return best;
}

/** The point and heading at distance s from end A (extending past the ends along the end legs). */
export function pointAt(t: Truss, s: number): { p: V3; yaw: number } {
  let start = 0;
  for (let i = 0; i < t.legs.length; i++) {
    const l = t.legs[i], L = legLen(l);
    if (s <= start + L || i === t.legs.length - 1) {
      const k = L ? (s - start) / L : 0;
      return { p: { x: l.a.x + (l.b.x - l.a.x) * k, y: l.a.y + (l.b.y - l.a.y) * k, z: l.a.z + (l.b.z - l.a.z) * k }, yaw: Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) };
    }
    start += L;
  }
  return { p: { ...t.legs[0].a }, yaw: 0 };
}

/**
 * Tape marks for fixtures on a run, ordered from the chosen reference (A→B, B→A, or A→B for centre).
 * Positions come from the drawing; sections give section numbers, in-section distances and joins (leg corners are joins too).
 * 0 is end A (moved by the offset), the centre (moved by the offset) or end B, as in v1.
 */
export function runMarks(t: Truss, fixtures: Fixture[], st: TrussSpacing, fmt: { round: number }): MarkRow[] {
  if (!fixtures.length) return [];
  const L = runLength(t), secs = runSections(t), R = { round: fmt.round };
  const joins: number[] = []; let acc = 0;
  secs.forEach((s, i) => { if (i) joins.push(acc); acc += s; });
  let c = 0; t.legs.slice(0, -1).forEach(l => { c += legLen(l); if (!joins.some(j => Math.abs(j - c) < 1)) joins.push(c); });
  const shift = st.offsetSide === 'after' ? st.offset : -st.offset; // how far the truss sits beyond the user's 0
  const zero = st.ref === 'a' ? -shift : st.ref === 'centre' ? L / 2 - shift : L;
  const fromB = st.ref === 'b';
  const placed = fixtures.map(f => ({ f, ...alongRun(t, { x: f.matrix.o.x, y: f.matrix.o.y }) })).sort((a, b) => a.s - b.s);
  const rows: MarkRow[] = placed.map(({ f, s, lateral }) => {
    let si = 0, a = 0; while (si < secs.length - 1 && s >= a + secs[si]) { a += secs[si]; si++; }
    const d = fromB ? L - s : s - zero;
    return { id: f.id, unit: f.unitNumber, s, mark: rnd(d, R), sec: fromB ? secs.length - si : si + 1, off: rnd(fromB ? a + secs[si] - s : s - a, R),
      near: joins.some(j => Math.abs(j - s) < (st.joinWarn || 0)), gap: null, offLine: lateral > OFF_LINE ? lateral : null, uneven: false };
  });
  if (fromB) rows.reverse();
  rows.forEach((r, k) => { r.gap = k ? Math.abs(r.s - rows[k - 1].s) : null; });
  const gaps = rows.map(r => r.gap).filter((g): g is number => g != null).sort((a, b) => a - b);
  if (gaps.length >= 2) {
    const med = gaps[Math.floor(gaps.length / 2)];
    rows.forEach(r => { r.uneven = r.gap != null && Math.abs(r.gap - med) > UNEVEN; });
  }
  return rows;
}

/** A mark as shown in lists, copied text and on the plot: centre marks get an explicit + on the right (as v1). */
export function markLabel(mark: number, st: TrussSpacing, S: FmtSettings): string {
  return (st.ref === 'centre' && mark > 0 ? '+' : '') + fmt(mark, true, S);
}

/** Where 0 is along the run (distance from end A), for the plot. */
export function zeroAlong(t: Truss, st: TrussSpacing): number {
  const L = runLength(t), shift = st.offsetSide === 'after' ? st.offset : -st.offset;
  return st.ref === 'a' ? -shift : st.ref === 'centre' ? L / 2 - shift : L;
}
