import { test, expect } from 'vitest';
import { powerText, numList, typeSummary } from './powerText';
import { rigPower } from '../domain/powerRig';
import { newDoc } from '../core/model/doc';
import type { Doc, Fixture, FixtureType, Truss } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';

const type = (key: string, n: string, w: number | null): FixtureType => ({ key, m: 'M', n, w, src: 's', url: '', gdtfSpec: '', mode: '', category: 'spot' });
const truss = (id: string, name: string, y: number): Truss => ({ id, kind: 'truss', name, layerId: 'L', classId: null, positionId: null,
  legs: [{ a: { x: 0, y, z: 6000 }, b: { x: 12000, y, z: 6000 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null });
function rig(): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true });
  for (const t of [type('mp', 'MegaPointe', 470), type('aura', 'Aura', 300), type('q', 'Mystery', null)]) d.types.set(t.key, t);
  d.entities.set('T1', truss('T1', 'LX1', 0)); d.entities.set('T2', truss('T2', 'LX2', 4000));
  let u = 1;
  const add = (tid: string, y: number, key: string, x: number) => { const id = 'F' + u; d.entities.set(id, { id, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: tid,
    matrix: translate(IDENTITY, { x, y, z: 5700 }), typeKey: key, unitNumber: u++, fixtureId: '', address: null, mvrUuid: null } as Fixture); };
  for (let i = 0; i < 4; i++) add('T1', 0, 'mp', 1000 + i * 2000);
  add('T2', 4000, 'aura', 1000); add('T2', 4000, 'aura', 3000); add('T2', 4000, 'q', 5000);
  d.settings.power.fill = 'fewest';
  return d;
}

test('numbers collapse into ranges like v2', () => {
  expect(numList([5, 1, 2, 3, 7, 8])).toBe('1–3, 5, 7, 8');
});
test('type summary counts each type', () => {
  const d = rig();
  expect(typeSummary(d, ['F1', 'F2', 'F7'])).toBe('MegaPointe ×2, Mystery');
});
test('exact power list for a two-truss rig', () => {
  const d = rig();
  expect(powerText('Ford', rigPower(d), d)).toBe([
    'POWER: Ford',
    'Circuits up to 1,920 W (80% of 2,400 W), 6 per Socapex',
    '',
    'LX1: 1,880 W',
    'Socapex A',
    '  A1  #1–4  MegaPointe ×4  1,880 W',
    '',
    'LX2: 600 W',
    'Socapex A',
    '  A1  #5–7  Aura ×2, Mystery  600 W (1 with no wattage)',
    '',
    'Total 2,480 W (10.3 A at 240 V) on 2 circuits, 2 Socapex',
    '1 fixture with no wattage, counted as 0 W',
  ].join('\n'));
});
test('phases, an over-limit circuit and unnumbered fixtures', () => {
  const d = rig(); d.settings.power.phases = true;
  d.types.set('mp', type('mp', 'MegaPointe', 2600));
  (d.entities.get('F2') as Fixture).unitNumber = null;
  const t = powerText('Ford', rigPower(d), d);
  expect(t).toContain('  A1 L1  #1  MegaPointe  2,600 W  OVER LIMIT');
  expect(t).toMatch(/#\(no number\)  MegaPointe  2,600 W  OVER LIMIT/);
  expect(t).toMatch(/^L1 [\d,]+ W, L2 [\d,]+ W, L3 [\d,]+ W$/m);
});
test('without unit numbers, Fixture IDs are listed (Vectorworks files often have only those)', async () => {
  const { fixtureNums } = await import('./powerText');
  const d = rig();
  for (const [id, fid] of [['F1', '923'], ['F2', '924'], ['F3', '925'], ['F4', 'A7']] as const) { const f = d.entities.get(id) as Fixture; f.unitNumber = null; f.fixtureId = fid; }
  expect(fixtureNums(d, ['F1', 'F2', 'F3'])).toBe('923–925');
  expect(fixtureNums(d, ['F3', 'F4'])).toBe('925, A7');
});
test('review fix: a circuit with no-wattage fixtures says so instead of passing as 0 W', () => {
  const d = rig();
  expect(powerText('Ford', rigPower(d), d)).toContain('  A1  #5–7  Aura ×2, Mystery  600 W (1 with no wattage)');
});
