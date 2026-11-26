import { describe, test, expect } from 'vitest';
import { parseMvrMatrix, formatMvrMatrix, yawOf, withYaw, rotateAboutZ, translate, IDENTITY } from './matrix';
import { toUniverseAddress, fromUniverseAddress, formatUA } from './address';
import { fitLine, projectOnSegment, dist } from './vec';

describe('MVR matrices', () => {
  test('parses translation in mm', () => {
    expect(parseMvrMatrix('{1,0,0}{0,-1,0}{0,0,-1}{100751.935698,-31833.060348,0}').o).toEqual({ x: 100751.935698, y: -31833.060348, z: 0 });
  });
  test('round-trips through the MVR text form', () => {
    const m = parseMvrMatrix('{0.158127,-0.987419,0.000000}{0.987419,0.158127,0.000000}{0.000000,0.000000,1.000000}{6020.939200,2838.588955,4978.134459}');
    const back = parseMvrMatrix(formatMvrMatrix(m));
    for (const k of ['u', 'v', 'w', 'o'] as const) for (const a of ['x', 'y', 'z'] as const) expect(back[k][a]).toBeCloseTo(m[k][a], 6);
  });
  test('yaw comes from the rotated X axis', () => {
    expect(yawOf(parseMvrMatrix('{0.158127,-0.987419,0}{0.987419,0.158127,0}{0,0,1}{0,0,0}'))).toBeCloseTo(Math.atan2(-0.987419, 0.158127), 6);
  });
  test('withYaw keeps the translation and Z axis', () => {
    const m = withYaw({ ...IDENTITY, o: { x: 5, y: 6, z: 7 } }, Math.PI / 2);
    expect(yawOf(m)).toBeCloseTo(Math.PI / 2); expect(m.o).toEqual({ x: 5, y: 6, z: 7 }); expect(m.w).toEqual({ x: 0, y: 0, z: 1 });
  });
  test('rotateAboutZ rotates the origin about a pivot', () => {
    const r = rotateAboutZ(IDENTITY, { x: 1000, y: 0 }, Math.PI / 2);
    expect(r.o.x).toBeCloseTo(1000); expect(r.o.y).toBeCloseTo(-1000); expect(yawOf(r)).toBeCloseTo(Math.PI / 2);
  });
  test('translate moves only the origin', () => {
    expect(translate(IDENTITY, { x: 1, y: 2, z: 3 }).o).toEqual({ x: 1, y: 2, z: 3 });
  });
  test('bad text falls back to identity', () => {
    expect(parseMvrMatrix('nonsense')).toEqual(IDENTITY);
  });
});

describe('DMX addresses', () => {
  test('absolute address to universe.address', () => {
    expect(toUniverseAddress(4741)).toEqual({ universe: 10, address: 133 });
    expect(toUniverseAddress(1)).toEqual({ universe: 1, address: 1 });
    expect(toUniverseAddress(512)).toEqual({ universe: 1, address: 512 });
    expect(toUniverseAddress(513)).toEqual({ universe: 2, address: 1 });
  });
  test('back to absolute', () => { expect(fromUniverseAddress(10, 133)).toBe(4741); });
  test('formats as U.A', () => { expect(formatUA(4741)).toBe('10.133'); });
});

describe('vectors', () => {
  test('fits a line through nearly collinear points', () => {
    const f = fitLine([{ x: 0, y: 0 }, { x: 1000, y: 10 }, { x: 2000, y: 0 }]);
    expect(f.maxResidual).toBeLessThan(10); expect(Math.abs(f.dir.x)).toBeCloseTo(1, 3);
  });
  test('projects a point onto a segment', () => {
    expect(projectOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toMatchObject({ t: 0.5, d: 5 });
  });
  test('distance', () => { expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5); });
});
