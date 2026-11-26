export type V2 = { x: number; y: number };
export type V3 = { x: number; y: number; z: number };

export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y;
export const len = (a: V2): number => Math.hypot(a.x, a.y);
export const dist = (a: V2, b: V2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: V2): V2 => { const l = len(a); return l ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 }; };

/** Closest point on segment ab to p: t in 0..1 along the segment, and the distance d. */
export function projectOnSegment(p: V2, a: V2, b: V2): { t: number; point: V2; d: number } {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  const point = add(a, scale(ab, t));
  return { t, point, d: dist(p, point) };
}

/** Least-squares line (principal axis) through points, and the largest perpendicular distance from it. */
export function fitLine(points: V2[]): { origin: V2; dir: V2; maxResidual: number } {
  const n = points.length || 1;
  const origin = { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) { const dx = p.x - origin.x, dy = p.y - origin.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  let maxResidual = 0;
  for (const p of points) maxResidual = Math.max(maxResidual, Math.abs((p.x - origin.x) * -dir.y + (p.y - origin.y) * dir.x));
  return { origin, dir, maxResidual };
}
