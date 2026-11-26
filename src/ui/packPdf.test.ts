import { test, expect } from 'vitest';
import { buildPack } from './packPdf';
import { newDoc } from '../core/model/doc';
import type { Doc, Fixture, Truss } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';

const latin1 = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('');
const count = (s: string) => +s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)![1];
const vis = () => true;

function rig(perTruss: number[]): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true });
  d.types.set('t', { key: 't', m: 'Robe', n: 'Spot', w: 400, src: 's', url: '', gdtfSpec: '', mode: '', category: 'spot' });
  let u = 1;
  perTruss.forEach((n, k) => {
    const id = 'T' + k, len = Math.max(4000, n * 500);
    d.entities.set(id, { id, kind: 'truss', name: 'LX' + (k + 1), layerId: 'L', classId: null, positionId: null, legs: [{ a: { x: 0, y: k * 4000, z: 6000 }, b: { x: len, y: k * 4000, z: 6000 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null } as Truss);
    for (let i = 0; i < n; i++) d.entities.set('F' + u, { id: 'F' + u, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: id,
      matrix: translate(IDENTITY, { x: 250 + i * 480, y: k * 4000, z: 5700 }), typeKey: 't', unitNumber: u++, fixtureId: '', address: u, mvrUuid: null } as Fixture);
  });
  return d;
}

test('plot, marks lists, power and DMX, with matching sheet numbers', () => {
  const s = latin1(buildPack(rig([4, 3]), { jobName: 'Ford', source: 'f.mvr', visible: vis }));
  const n = count(s);
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 1; i <= n; i++) expect(s).toContain(`(Sheet ${i} of ${n})`);
  for (const t of ['(LX1)', '(POWER: Ford)', '(DMX CABLES: Ford)']) expect(s).toContain(t);
});

test('a 70-fixture truss list runs over two pages', () => {
  const s = latin1(buildPack(rig([70]), { jobName: 'Big', source: '', visible: vis }));
  const marks = (s.match(/\(Big - Marks: LX1/g) || []).length;
  expect(marks).toBeGreaterThanOrEqual(2);
});

test('an empty job gives the plot page and a page saying no fixtures', () => {
  const s = latin1(buildPack(rig([]), { jobName: 'Empty', source: '', visible: vis }));
  expect(count(s)).toBe(2);
  expect(s).toContain('(No fixtures in this job yet.)');
});

test('review fix: long page headers are trimmed to the page width', () => {
  const d = rig([2]); (d.entities.get('T0') as Truss).name = 'A truss with a really very extraordinarily long name that goes on and on and on';
  const s = latin1(buildPack(d, { jobName: 'An equally long job name for the plenary hall show', source: '', visible: vis }));
  expect(s).toMatch(/\(An equally long job name[^)]* - Marks: [^)]*\x85\) Tj/); // the page header, not the plot's title block
});
