import type { V2, V3 } from './vec';

/** MVR transform: u, v, w are the object's rotated X, Y, Z axes; o is its position in mm (right-handed, Z up). */
export type Mat = { u: V3; v: V3; w: V3; o: V3 };

export const IDENTITY: Mat = Object.freeze({ u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, w: { x: 0, y: 0, z: 1 }, o: { x: 0, y: 0, z: 0 } }) as Mat;
const clone = (m: Mat): Mat => ({ u: { ...m.u }, v: { ...m.v }, w: { ...m.w }, o: { ...m.o } });

/** Parses "{ux,uy,uz}{vx,vy,vz}{wx,wy,wz}{ox,oy,oz}". Anything unreadable gives the identity. */
export function parseMvrMatrix(s: string): Mat {
  const groups = String(s ?? '').match(/\{[^}]*\}/g);
  if (!groups || groups.length !== 4) return clone(IDENTITY);
  const vs = groups.map(g => g.slice(1, -1).split(',').map(Number));
  if (vs.some(v => v.length !== 3 || v.some(x => !Number.isFinite(x)))) return clone(IDENTITY);
  const [u, v, w, o] = vs.map(([x, y, z]) => ({ x, y, z }));
  return { u, v, w, o };
}

export function formatMvrMatrix(m: Mat): string {
  const f = (a: V3) => `{${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}}`;
  return f(m.u) + f(m.v) + f(m.w) + f(m.o);
}

/** Plan rotation in radians. */
export const yawOf = (m: Mat): number => Math.atan2(m.u.y, m.u.x);

const rotZ = (a: V3, c: number, s: number): V3 => ({ x: a.x * c - a.y * s, y: a.x * s + a.y * c, z: a.z });

/** Rotates the axes about Z so the plan rotation becomes yaw; keeps tilt and position. */
export function withYaw(m: Mat, yaw: number): Mat {
  const d = yaw - yawOf(m), c = Math.cos(d), s = Math.sin(d);
  return { u: rotZ(m.u, c, s), v: rotZ(m.v, c, s), w: rotZ(m.w, c, s), o: { ...m.o } };
}

export const translate = (m: Mat, d: V3): Mat => ({ ...clone(m), o: { x: m.o.x + d.x, y: m.o.y + d.y, z: m.o.z + d.z } });

/** Rotates the object (axes and position) about a vertical axis through pivot. */
export function rotateAboutZ(m: Mat, pivot: V2, angle: number): Mat {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = m.o.x - pivot.x, dy = m.o.y - pivot.y;
  return { u: rotZ(m.u, c, s), v: rotZ(m.v, c, s), w: rotZ(m.w, c, s), o: { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c, z: m.o.z } };
}

/** a then b: the transform of something placed at b inside a frame placed at a. */
export function compose(a: Mat, b: Mat): Mat {
  const ap = (v: V3): V3 => ({ x: a.u.x * v.x + a.v.x * v.y + a.w.x * v.z, y: a.u.y * v.x + a.v.y * v.y + a.w.y * v.z, z: a.u.z * v.x + a.v.z * v.y + a.w.z * v.z });
  const o = ap(b.o);
  return { u: ap(b.u), v: ap(b.v), w: ap(b.w), o: { x: o.x + a.o.x, y: o.y + a.o.y, z: o.z + a.o.z } };
}
/** The inverse of an MVR matrix (a general 3×3 plus offset), so compose(invert(m), m) is the identity. */
export function invert(m: Mat): Mat {
  const { u, v, w, o } = m;
  // columns u, v, w; inverse rows are cross products over the determinant
  const c1 = { x: v.y * w.z - v.z * w.y, y: v.z * w.x - v.x * w.z, z: v.x * w.y - v.y * w.x };
  const c2 = { x: w.y * u.z - w.z * u.y, y: w.z * u.x - w.x * u.z, z: w.x * u.y - w.y * u.x };
  const c3 = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const det = u.x * c1.x + u.y * c1.y + u.z * c1.z || 1;
  const r1 = { x: c1.x / det, y: c1.y / det, z: c1.z / det }, r2 = { x: c2.x / det, y: c2.y / det, z: c2.z / det }, r3 = { x: c3.x / det, y: c3.y / det, z: c3.z / det };
  const nu = { x: r1.x, y: r2.x, z: r3.x }, nv = { x: r1.y, y: r2.y, z: r3.y }, nw = { x: r1.z, y: r2.z, z: r3.z };
  const no = { x: -(r1.x * o.x + r1.y * o.y + r1.z * o.z), y: -(r2.x * o.x + r2.y * o.y + r2.z * o.z), z: -(r3.x * o.x + r3.y * o.y + r3.z * o.z) };
  return { u: nu, v: nv, w: nw, o: no };
}
