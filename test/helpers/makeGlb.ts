/** Builds a minimal .glb (JSON chunk only, empty BIN) with one mesh per entry, each with POSITION min/max. */
export function makeGlb(meshes: { min: number[]; max: number[]; translation?: number[]; matrix?: number[] }[]): Uint8Array {
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ mesh: i, ...(m.translation ? { translation: m.translation } : {}), ...(m.matrix ? { matrix: m.matrix } : {}) })),
    meshes: meshes.map((_, i) => ({ primitives: [{ attributes: { POSITION: i } }] })),
    accessors: meshes.map(m => ({ componentType: 5126, count: 2, type: 'VEC3', min: m.min, max: m.max })),
  };
  let text = JSON.stringify(json); while (text.length % 4) text += ' ';
  const jb = new TextEncoder().encode(text);
  const out = new Uint8Array(12 + 8 + jb.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jb, 20);
  return out;
}
