import { test, expect } from 'vitest';
import { glbBounds } from './glb';
import { makeGlb } from '../../../test/helpers/makeGlb';
import { readZip } from '../zip';

test('one mesh: glTF Y-up metres become MVR Z-up millimetres', () => {
  expect(glbBounds(makeGlb([{ min: [0, 0, 0], max: [1, 2, 3] }]))).toEqual({ min: { x: 0, y: -3000, z: 0 }, max: { x: 1000, y: 0, z: 2000 } });
});
test('node translation is applied', () => {
  expect(glbBounds(makeGlb([{ min: [0, 0, 0], max: [1, 1, 1], translation: [2, 0, 0] }]))!.max.x).toBe(3000);
});
test('node matrix is applied (column-major)', () => {
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5, 0, 1]; // translate y +5 (glTF up) -> MVR z +5000
  expect(glbBounds(makeGlb([{ min: [0, 0, 0], max: [1, 1, 1], matrix: m }]))!.max.z).toBe(6000);
});
test('several meshes are unioned', () => {
  const b = glbBounds(makeGlb([{ min: [0, 0, 0], max: [1, 1, 1] }, { min: [4, 0, 0], max: [5, 1, 1] }]))!;
  expect(b.min.x).toBe(0); expect(b.max.x).toBe(5000);
});
test('garbage gives null', () => { expect(glbBounds(new Uint8Array([1, 2, 3]))).toBeNull(); });

const SAMPLE = process.env.MVR_SAMPLE;
test.skipIf(!SAMPLE)('reads nearly every glb in the real MVR', async () => {
  const { readFileSync } = await import('node:fs');
  const u = new Uint8Array(readFileSync(SAMPLE!));
  const files = await readZip(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer);
  const glbs = [...files].filter(([n]) => n.endsWith('.glb'));
  expect(glbs.length).toBe(145);
  expect(glbs.filter(([, b]) => glbBounds(b)).length).toBeGreaterThanOrEqual(140);
});
