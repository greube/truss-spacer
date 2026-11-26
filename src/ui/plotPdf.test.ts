import { test, expect } from 'vitest';
import { pickScale, drawPlotPage } from './plotPdf';
import { Pdf } from '../io/pdf';
import { newDoc } from '../core/model/doc';
import type { Doc, Fixture, Truss } from '../core/model/types';
import { IDENTITY, translate } from '../core/geom/matrix';

const latin1 = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('');

test('picks the largest standard scale that fits, else not to scale', () => {
  expect(pickScale({ w: 20000, h: 10000 }, { w: 340, h: 277 })).toEqual({ denom: 75, fits: true });
  expect(pickScale({ w: 2000, h: 1000 }, { w: 340, h: 277 })).toEqual({ denom: 20, fits: true });
  const big = pickScale({ w: 300000, h: 10000 }, { w: 340, h: 277 });
  expect(big.fits).toBe(false); expect(300000 / big.denom).toBeLessThanOrEqual(340);
});

function rig(): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true }, { id: 'H', name: 'Hidden', visible: false });
  d.types.set('t', { key: 't', m: 'Robe', n: 'MegaPointe', w: 470, src: 's', url: '', gdtfSpec: '', mode: '', category: 'spot' });
  const tr = (id: string, name: string, y: number, state: Truss['state']): Truss => ({ id, kind: 'truss', name, layerId: 'L', classId: null, positionId: null,
    legs: [{ a: { x: 0, y, z: 6000 }, b: { x: 8000, y, z: 6000 }, sections: [] }], boxSize: 300, state, mvrUuid: null });
  d.entities.set('T1', tr('T1', 'LX1', 0, 'confirmed')); d.entities.set('T2', tr('T2', 'LX2', 4000, 'draft'));
  [1, 2, 3, 4, 5, 6].forEach((u, i) => d.entities.set('F' + u, { id: 'F' + u, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: i < 3 ? 'T1' : 'T2',
    matrix: translate(IDENTITY, { x: 1000 + (i % 3) * 3000, y: i < 3 ? 0 : 4000, z: 5700 }), typeKey: 't', unitNumber: 100 + u, fixtureId: '', address: 513 + i, mvrUuid: null } as Fixture));
  d.entities.set('HID', { id: 'HID', kind: 'fixture', name: '', layerId: 'H', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x: 500, y: 2000, z: 0 }), typeKey: 't', unitNumber: 999, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  return d;
}

test('the plot page has the title block, scale, draft label and every visible unit number', () => {
  const d = rig(), pdf = new Pdf();
  const vis = (e: any) => d.layers.find(l => l.id === e.layerId)?.visible !== false;
  drawPlotPage(pdf, d, { jobName: 'Ford & Co', source: 'ford.mvr', sheet: 1, sheets: 3, visible: vis });
  const s = latin1(pdf.bytes());
  for (const t of ['(Ford & Co)', '(Sheet 1 of 3)', '(LX1)', '(DRAFT', '(MegaPointe \xd7 6)']) expect(s).toContain(t);
  expect(s).toMatch(/\(Scale 1:\d+\)/);
  for (const u of [101, 102, 103, 104, 105, 106]) expect(s).toContain(`(${u})`);
  expect(s).toContain('(2.1)'); // U.A address of 513
  expect(s).not.toContain('(999)');
});

test('reference objects far from the rig do not shrink the scale; they are clipped to the frame', () => {
  const d = rig(), pdf = new Pdf();
  d.entities.set('FAR', { id: 'FAR', kind: 'ref', name: 'Point load', layerId: 'L', classId: null, matrix: translate(IDENTITY, { x: -90000, y: 60000, z: 95000 }), bounds: { min: { x: -100, y: -100, z: 0 }, max: { x: 100, y: 100, z: 100 } } });
  drawPlotPage(pdf, d, { jobName: 'J', source: '', sheet: 1, sheets: 1, visible: () => true });
  const s = latin1(pdf.bytes());
  expect(s).toContain('(Scale 1:50)'); // 8 m × 4 m rig plus 2 m all round: 12 m × 8.3 m fits A3 at 1:50
  expect(s).toMatch(/re W n/); // drawing clipped to its frame
});

test('a few rig objects stranded far away (e.g. placed at 0,0) are left off and noted, not shrinking the plot', () => {
  const d = rig(), pdf = new Pdf();
  for (const e of d.entities.values()) if (e.kind === 'fixture') e.matrix = translate(e.matrix, { x: 100000, y: 0, z: 0 });
  for (const e of d.entities.values()) if (e.kind === 'truss') e.legs = e.legs.map(l => ({ ...l, a: { ...l.a, x: l.a.x + 100000 }, b: { ...l.b, x: l.b.x + 100000 } }));
  for (let i = 0; i < 20; i++) d.entities.set('X' + i, { id: 'X' + i, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x: 100500 + i * 350, y: 2000, z: 0 }), typeKey: 't', unitNumber: null, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  d.entities.set('LOST', { id: 'LOST', kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: null, matrix: IDENTITY, typeKey: 't', unitNumber: 4242, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  drawPlotPage(pdf, d, { jobName: 'J', source: '', sheet: 1, sheets: 1, visible: () => true });
  const s = latin1(pdf.bytes());
  expect(s).toContain('(Scale 1:50)');
  expect(s).toContain('(1 object far from the rig is off this plot.)');
});

test('review fix: a front-of-house truss far downstage stays on the plot', () => {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true });
  d.types.set('t', { key: 't', m: 'M', n: 'Spot', w: 400, src: 's', url: '', gdtfSpec: '', mode: '', category: 'spot' });
  const tr = (id: string, y: number): Truss => ({ id, kind: 'truss', name: id, layerId: 'L', classId: null, positionId: null, legs: [{ a: { x: 0, y, z: 6000 }, b: { x: 16000, y, z: 6000 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null });
  let u = 0;
  for (const [id, y, n] of [['A', 0, 32], ['B', 3000, 32], ['C', 6000, 32], ['FOH', -16000, 4]] as const) {
    d.entities.set(id, tr(id, y));
    for (let i = 0; i < n; i++) d.entities.set('F' + u, { id: 'F' + u++, kind: 'fixture', name: '', layerId: 'L', classId: null, positionId: null, trussId: id, matrix: translate(IDENTITY, { x: 250 + i * (15500 / n), y, z: 5700 }), typeKey: 't', unitNumber: u, fixtureId: '', address: null, mvrUuid: null } as Fixture);
  }
  const pdf = new Pdf(); drawPlotPage(pdf, d, { jobName: 'J', source: '', sheet: 1, sheets: 1, visible: () => true });
  const s = latin1(pdf.bytes());
  expect(s).not.toMatch(/off this plot/);
  expect(s).toContain('(FOH)');
  expect(s).toContain('(Scale 1:100)');
});

test('review fix: every title block string fits the strip, keeping fixture counts', () => {
  const d = rig();
  d.types.set('t', { ...d.types.get('t')!, n: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW' });
  (d.entities.get('T2') as Truss).state = 'draft';
  const pdf = new Pdf(), seen: { x: number; s: string; size: number; font: any }[] = [];
  const orig = pdf.text.bind(pdf);
  (pdf as any).text = (x: number, y: number, s: string, size: number, o: any = {}) => { seen.push({ x, s, size, font: o.font ?? 'H' }); return orig(x, y, s, size, o); };
  drawPlotPage(pdf, d, { jobName: 'A very long job name for a plenary session in the big hall 2026 final final', source: 'Show_2026_Plenary_MVR_export_v3_FINAL_really_final.mvr', sheet: 1, sheets: 1, visible: () => true });
  const tx = 420 - 10 - 60;
  const title = seen.filter(t => t.x >= tx - 0.01);
  expect(title.length).toBeGreaterThan(5);
  for (const t of title) expect(t.x + pdf.textWidth(t.s, t.size, t.font), t.s).toBeLessThanOrEqual(420 - 10 + 0.01);
  expect(title.some(t => /…\s×\s7$/.test(t.s) || /× 7$/.test(t.s))).toBe(true);
  expect(title.map(t => t.s).join(' ')).toMatch(/confirm before\s+marking out\./);
});
