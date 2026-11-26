import type { V3 } from '../../core/geom/vec';

type M4 = number[]; // column-major 4x4, as glTF stores it
const I4: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n: any): M4 {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const r = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw), 0,
    2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw), 0,
    2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy), 0, tx, ty, tz, 1];
  for (let i = 0; i < 3; i++) { r[i] *= sx; r[4 + i] *= sy; r[8 + i] *= sz; }
  return r;
}

/**
 * Bounding box of a .glb in MVR space (Z up, mm), from the POSITION accessors' min/max and the node
 * transforms; the mesh data itself is never read. Returns null for anything unreadable.
 */
export function glbBounds(buf: Uint8Array): { min: V3; max: V3 } | null {
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (buf.length < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(16, true) !== 0x4e4f534a) return null;
    const len = dv.getUint32(12, true);
    const j = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len)));
    const nodes: any[] = j.nodes ?? [], meshes: any[] = j.meshes ?? [], acc: any[] = j.accessors ?? [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const visit = (ni: number, parent: M4, depth: number) => {
      const n = nodes[ni]; if (!n || depth > 64) return;
      const m = mul(parent, trs(n));
      if (n.mesh != null) for (const p of meshes[n.mesh]?.primitives ?? []) {
        const a = acc[p.attributes?.POSITION];
        if (!a || !Array.isArray(a.min) || !Array.isArray(a.max)) continue;
        for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
          const w = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
          for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
        }
      }
      for (const c of n.children ?? []) visit(c, m, depth + 1);
    };
    const roots: number[] = j.scenes?.[j.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
    for (const r of roots) visit(r, I4, 0);
    if (!Number.isFinite(lo[0])) return null;
    // glTF (x, y up, z) metres -> MVR (x, -z, y) millimetres
    const k = 1000, z0 = (v: number) => (Object.is(v, -0) ? 0 : v);
    return { min: { x: z0(lo[0] * k), y: z0(-hi[2] * k), z: z0(lo[1] * k) }, max: { x: z0(hi[0] * k), y: z0(-lo[2] * k), z: z0(hi[1] * k) } };
  } catch { return null; }
}
