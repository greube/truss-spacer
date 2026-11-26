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
