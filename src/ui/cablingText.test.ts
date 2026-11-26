import { test, expect } from 'vitest';
import { cablingText, metres } from './cablingText';
import { rigCabling } from '../domain/cabling';
import { newDoc } from '../core/model/doc';
import type { Doc, Fixture, Truss } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';

function rig(): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true });
  const tr = (id: string, y: number, o: Partial<Truss> = {}): Truss => ({ id, kind: 'truss', name: id, layerId: 'L', classId: null, positionId: null,
    legs: [{ a: { x: 0, y, z: 6000 }, b: { x: 10000, y, z: 6000 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null, ...o });
  d.entities.set('LX1', tr('LX1', 0)); d.entities.set('LX2', tr('LX2', 4000, { dmxFrom: 'b' }));
  const fx = (id: string, x: number, y: number, t: string, unit: number, address: number) => d.entities.set(id, { id, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: t,
    matrix: translate(IDENTITY, { x, y, z: 5700 }), typeKey: 't', unitNumber: unit, fixtureId: '', address, mvrUuid: null } as Fixture);
  fx('A', 1000, 0, 'LX1', 1, 1); fx('B', 3000, 0, 'LX1', 2, 20); fx('C', 9000, 4000, 'LX2', 3, 513);
  return d;
}

test('metres', () => { expect(metres(3000)).toBe('3 m'); expect(metres(500)).toBe('0.5 m'); });

test('exact cable list for a two-truss rig', () => {
  const d = rig();
  expect(cablingText('Ford', rigCabling(d), d)).toBe([
    'DMX CABLES: Ford',
    '3 cables, 11 m in all',
    '  3 m × 2',
    '  5 m × 1',
    '',
    'LX1, from end A: 3 m × 1, 5 m × 1',
    '  Universe 1: end→#1 3 m, #1→#2 5 m',
    '',
    'LX2, from end B: 3 m × 1',
    '  Universe 2: end→#3 3 m',
  ].join('\n'));
});
