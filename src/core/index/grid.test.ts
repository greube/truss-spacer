import { test, expect } from 'vitest';
import { GridIndex } from './grid';
import { newDoc, entityBounds } from '../model/doc';
import { IDENTITY, translate } from '../geom/matrix';
import type { Doc, Fixture, Truss, Bounds } from '../model/types';

const fx = (id: string, x: number, y: number, extra: Partial<Fixture> = {}): Fixture => ({ id, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x, y, z: 0 }), typeKey: '', unitNumber: null, fixtureId: '', address: null, mvrUuid: null, ...extra });
const truss = (id: string, ax: number, ay: number, bx: number, by: number): Truss => ({ id, kind: 'truss', name: '', layerId: 'L', classId: null, positionId: null, legs: [{ a: { x: ax, y: ay, z: 0 }, b: { x: bx, y: by, z: 0 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null });
const hits = (a: Bounds, b: Bounds) => a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;

test('query matches a brute-force search over 2,000 fixtures', () => {
  const d: Doc = newDoc(); let s = 1; const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 2000; i++) { const f = fx('F' + i, 90000 + r() * 40000, -40000 + r() * 80000); d.entities.set(f.id, f); }
  const g = new GridIndex(); g.rebuild(d);
  const q: Bounds = { min: { x: 100000, y: -10000 }, max: { x: 110000, y: 5000 } };
  const brute = [...d.entities.values()].filter(e => hits(entityBounds(d, e), q)).map(e => e.id).sort();
  expect(g.query(q).sort()).toEqual(brute);
});
test('hit prefers a fixture lying on a truss', () => {
  const d = newDoc(); d.entities.set('T', truss('T', 0, 0, 8000, 0)); d.entities.set('F', fx('F', 4000, 0));
  const g = new GridIndex(); g.rebuild(d);
  expect(g.hit({ x: 4050, y: 20 }, 50, d)).toBe('F');
  expect(g.hit({ x: 6000, y: 50 }, 50, d)).toBe('T');
  expect(g.hit({ x: 6000, y: 3000 }, 50, d)).toBeNull();
});
test('hidden layers are not hit', () => {
  const d = newDoc(); d.entities.set('F', fx('F', 0, 0)); const g = new GridIndex(); g.rebuild(d);
  expect(g.hit({ x: 0, y: 0 }, 50, d, () => false)).toBeNull();
});
test('update moves an entry and null removes it', () => {
  const d = newDoc(); d.entities.set('F', fx('F', 0, 0)); const g = new GridIndex(); g.rebuild(d);
  g.update('F', { min: { x: 50000, y: 50000 }, max: { x: 50600, y: 50600 } });
  expect(g.query({ min: { x: -1000, y: -1000 }, max: { x: 1000, y: 1000 } })).toEqual([]);
  expect(g.query({ min: { x: 50000, y: 50000 }, max: { x: 51000, y: 51000 } })).toEqual(['F']);
  g.update('F', null); expect(g.query({ min: { x: 50000, y: 50000 }, max: { x: 51000, y: 51000 } })).toEqual([]);
});
test('huge objects are still found', () => {
  const d = newDoc(); const g = new GridIndex(); g.rebuild(d);
  g.update('ROOM', { min: { x: -500000, y: -500000 }, max: { x: 500000, y: 500000 } });
  expect(g.query({ min: { x: 10, y: 10 }, max: { x: 20, y: 20 } })).toEqual(['ROOM']);
});
