import type { Doc, Id } from './model/types';
import type { V2 } from './geom/vec';
import type { GridIndex } from './index/grid';
import { dist } from './geom/vec';

export type SnapKind = 'end' | 'node' | 'join' | 'fixture' | 'mid' | 'grid' | 'angle' | 'none';
export interface SnapResult { p: V2; kind: SnapKind; label: string }
export interface SnapCtx { doc: Doc; index: GridIndex; tolWorld: number; grid: number; exclude: Set<Id>; from?: V2 }

const LABEL: Record<SnapKind, string> = { end: 'Truss end', node: 'Corner', join: 'Section join', fixture: 'Fixture', mid: 'Midpoint', grid: 'Grid', angle: '', none: '' };
const PRIORITY: SnapKind[] = ['end', 'join', 'fixture', 'mid'];
const ANGLE_STEP = Math.PI / 12, ANGLE_TOL = (3 * Math.PI) / 180;

/** CAD snapping: truss ends and corners, section joins, fixture centres, leg midpoints, then angle (from a start point), then grid. */
export function snap(p: V2, c: SnapCtx): SnapResult {
  const found: Record<string, { p: V2; d: number } | undefined> = {};
  const offer = (kind: SnapKind, q: V2) => { const d = dist(p, q); if (d <= c.tolWorld && (!found[kind] || d < found[kind]!.d)) found[kind] = { p: q, d }; };
  const t = c.tolWorld;
  for (const id of c.index.query({ min: { x: p.x - t, y: p.y - t }, max: { x: p.x + t, y: p.y + t } })) {
    if (c.exclude.has(id)) continue;
    const e = c.doc.entities.get(id); if (!e) continue;
    if (e.kind === 'fixture') offer('fixture', { x: e.matrix.o.x, y: e.matrix.o.y });
    else if (e.kind === 'truss') for (const l of e.legs) {
      offer('end', { x: l.a.x, y: l.a.y }); offer('end', { x: l.b.x, y: l.b.y });
      offer('mid', { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 });
      const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
      let acc = 0;
      for (const s of l.sections.slice(0, -1)) { acc += s; if (L > 0 && acc < L) offer('join', { x: l.a.x + ((l.b.x - l.a.x) * acc) / L, y: l.a.y + ((l.b.y - l.a.y) * acc) / L }); }
    }
  }
  for (const k of PRIORITY) if (found[k]) return { p: found[k]!.p, kind: k, label: LABEL[k] };
  if (c.from) {
    const dx = p.x - c.from.x, dy = p.y - c.from.y, r = Math.hypot(dx, dy);
    if (r > 0) {
      const ang = Math.atan2(dy, dx), snapped = Math.round(ang / ANGLE_STEP) * ANGLE_STEP;
      if (Math.abs(ang - snapped) <= ANGLE_TOL) {
        const deg = ((Math.round((snapped * 180) / Math.PI) % 360) + 360) % 360;
        return { p: { x: c.from.x + Math.cos(snapped) * r, y: c.from.y + Math.sin(snapped) * r }, kind: 'angle', label: `${deg}°` };
      }
    }
  }
  if (c.grid > 0) return { p: { x: Math.round(p.x / c.grid) * c.grid, y: Math.round(p.y / c.grid) * c.grid }, kind: 'grid', label: LABEL.grid };
  return { p, kind: 'none', label: '' };
}
