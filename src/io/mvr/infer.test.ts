import { describe, test, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { inferTrusses, inferCommand } from './infer';
import { History } from '../../core/commands/history';
import { newDoc } from '../../core/model/doc';
import { IDENTITY, translate } from '../../core/geom/matrix';
import { projectOnSegment } from '../../core/geom/vec';
import { importMvr } from './import';
import type { Doc, Fixture, Truss } from '../../core/model/types';

function docWith(points: [number, number, number][], pos = 'P1', name = 'LX1'): Doc {
  const d = newDoc(); d.layers.push({ id: 'L', name: 'LX', visible: true }); d.positions.push({ id: pos, name });
  points.forEach(([x, y, z], i) => d.entities.set('F' + i, { id: 'F' + i, kind: 'fixture', name: 'Spot', layerId: 'L', classId: null, positionId: pos, trussId: null,
    matrix: translate(IDENTITY, { x, y, z }), typeKey: 't', unitNumber: i + 1, fixtureId: '', address: null, mvrUuid: null } as Fixture));
  return d;
}
const line = (n: number, f: (i: number) => [number, number, number]) => Array.from({ length: n }, (_, i) => f(i));

describe('inferTrusses', () => {
  test('a straight run becomes one draft truss with 250 mm past the end fixtures', () => {
    const r = inferTrusses(docWith(line(10, i => [i * 1000, 0, 8000])));
    expect(r.trusses).toHaveLength(1);
    const t = r.trusses[0];
    expect(t).toMatchObject({ state: 'draft', name: 'LX1', positionId: 'P1', boxSize: 300 });
    expect(t.legs).toHaveLength(1);
    const xs = [t.legs[0].a.x, t.legs[0].b.x].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-250); expect(xs[1]).toBeCloseTo(9250); expect(t.legs[0].a.z).toBe(8000);
    expect(r.assign.size).toBe(10); expect(r.assign.get('F0')).toBe(t.id);
  });
  test('an L shape is one run with two legs meeting at the corner', () => {
    const pts = [...line(5, i => [i * 1000, 0, 10000] as [number, number, number]), ...line(5, i => [4250, 250 + i * 1000, 10000] as [number, number, number])];
    const r = inferTrusses(docWith(pts));
    expect(r.trusses).toHaveLength(1); expect(r.trusses[0].legs).toHaveLength(2);
    const [l1, l2] = r.trusses[0].legs;
    expect(l1.b.x).toBeCloseTo(l2.a.x, 0); expect(l1.b.y).toBeCloseTo(l2.a.y, 0);
    expect(Math.hypot(l1.b.x - 4250, l1.b.y - 0)).toBeLessThan(300);
  });
  test('two parallel lines far apart become two runs', () => {
    const pts = [...line(5, i => [i * 1000, 0, 8000] as [number, number, number]), ...line(5, i => [i * 1000, 3000, 8000] as [number, number, number])];
    const r = inferTrusses(docWith(pts));
    expect(r.trusses.map(t => t.name).sort()).toEqual(['LX1', 'LX1 (2)']);
  });
  test('legs at different heights stay separate', () => {
    const pts = [...line(5, i => [i * 1000, 0, 8000] as [number, number, number]), ...line(5, i => [4250, 250 + i * 1000, 9000] as [number, number, number])];
    expect(inferTrusses(docWith(pts)).trusses).toHaveLength(2);
  });
  test('floor positions get no truss', () => {
    expect(inferTrusses(docWith(line(6, i => [i * 1000, 0, 0]))).trusses).toHaveLength(0);
  });
  test('positions that already have a real truss are skipped', () => {
    const d = docWith(line(4, i => [i * 1000, 0, 8000]));
    d.entities.set('T', { id: 'T', kind: 'truss', name: 'x', layerId: 'L', classId: null, positionId: 'P1', legs: [{ a: { x: 0, y: 0, z: 8000 }, b: { x: 3000, y: 0, z: 8000 }, sections: [] }], boxSize: 300, state: 'imported', mvrUuid: 'T' } as Truss);
    expect(inferTrusses(d).trusses).toHaveLength(0);
  });
  test('scattered fixtures give a warning instead of a guess', () => {
    const pts: [number, number, number][] = [[0, 0, 8000], [5000, 7000, 8000], [9000, 1000, 8000], [2000, 9000, 8000], [7000, 4000, 8000], [3000, 5000, 8000], [8000, 8000, 8000], [1000, 3000, 8000], [6000, 2000, 8000], [4000, 6500, 8000], [9500, 5500, 8000]];
    const r = inferTrusses(docWith(pts));
    expect(r.trusses).toHaveLength(0); expect(r.warnings[0]).toMatch(/Couldn't work out the truss for LX1/);
  });
  test('the command adds the trusses and attaches fixtures, and undo removes both', () => {
    const d = docWith(line(4, i => [i * 1000, 0, 8000])); const h = new History(d);
    const { command } = inferCommand(d); h.exec(command!);
    expect([...d.entities.values()].filter(e => e.kind === 'truss')).toHaveLength(1);
    expect((d.entities.get('F0') as Fixture).trussId).not.toBeNull();
    h.undo();
    expect([...d.entities.values()].filter(e => e.kind === 'truss')).toHaveLength(0);
    expect((d.entities.get('F0') as Fixture).trussId).toBeNull();
  });
});

const SAMPLE = process.env.MVR_SAMPLE;
test.skipIf(!SAMPLE)('infers sensible trusses for the real Vectorworks rig', async () => {
  const { readFileSync } = await import('node:fs');
  const u = new Uint8Array(readFileSync(SAMPLE!));
  const { doc } = await importMvr(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, { parseXml: s => new DOMParser().parseFromString(s, 'text/xml') as unknown as Document });
  const r = inferTrusses(doc);
  const posName = (id: string | null) => doc.positions.find(p => p.id === id)?.name;
  const report = r.trusses.map(t => `${t.name}: ${t.legs.map(l => Math.round(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y))).join('+')} mm`);
  console.log('INFERRED', JSON.stringify(report), 'WARN', JSON.stringify(r.warnings));
  const efa = r.trusses.filter(t => posName(t.positionId) === 'Expo Flown A');
  expect(efa).toHaveLength(1); expect(efa[0].legs).toHaveLength(1);
  const len = Math.hypot(efa[0].legs[0].b.x - efa[0].legs[0].a.x, efa[0].legs[0].b.y - efa[0].legs[0].a.y);
  expect(len).toBeGreaterThan(23400); expect(len).toBeLessThan(23800);
  for (const floor of ['Entrance', 'Expo Floor', 'Stage LX']) expect(r.trusses.some(t => posName(t.positionId) === floor)).toBe(false);
  for (const [fid, tid] of r.assign) {
    const f = doc.entities.get(fid) as Fixture, t = r.trusses.find(x => x.id === tid)!;
    const d = Math.min(...t.legs.map(l => projectOnSegment({ x: f.matrix.o.x, y: f.matrix.o.y }, l.a, l.b).d));
    expect(d).toBeLessThan(300);
  }
});
