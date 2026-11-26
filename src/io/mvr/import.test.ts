import { describe, test, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { importMvr } from './import';
import { makeMvr, zipOf } from '../../../test/helpers/makeMvr';
import type { Fixture, Truss, RefObject } from '../../core/model/types';

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'text/xml') as unknown as Document;
const imp = (b: ArrayBuffer) => importMvr(b, { parseXml });
const enc = (s: string) => new TextEncoder().encode(s);
const fixtures = (d: { entities: Map<string, any> }) => [...d.entities.values()].filter(e => e.kind === 'fixture') as Fixture[];

describe('importMvr', () => {
  test('maps a fixture and its type', async () => {
    const { doc } = await imp(await makeMvr({ positions: [{ uuid: 'P1', name: 'LX1' }],
      fixtures: [{ uuid: 'A', name: 'Ayrton Mistral', spec: 'Ayrton@Mistral.gdtf', matrix: '{1,0,0}{0,1,0}{0,0,1}{1000,2000,8000}', address: 4741, position: 'P1', fid: '101', unit: 3 }] }));
    const f = fixtures(doc)[0];
    expect(f).toMatchObject({ kind: 'fixture', mvrUuid: 'A', id: 'A', typeKey: 'Ayrton@Mistral', address: 4741, positionId: 'P1', fixtureId: '101', unitNumber: 3 });
    expect(f.matrix.o).toEqual({ x: 1000, y: 2000, z: 8000 });
    expect(doc.types.get('Ayrton@Mistral')).toMatchObject({ m: 'Ayrton', n: 'Mistral', w: null, gdtfSpec: 'Ayrton@Mistral.gdtf', mode: 'Mode 1' });
    expect(doc.positions).toEqual([{ id: 'P1', name: 'LX1' }]);
  });
  test('fixtures inside a GroupObject take the group transform', async () => {
    const { doc } = await imp(await makeMvr({ layers: [{ uuid: 'L', name: 'LX', groups: [{ matrix: '{1,0,0}{0,1,0}{0,0,1}{5000,0,0}', fixtures: [{ uuid: 'G1', matrix: '{1,0,0}{0,1,0}{0,0,1}{100,200,3000}' }] }] }] }));
    expect(fixtures(doc)[0].matrix.o).toEqual({ x: 5100, y: 200, z: 3000 });
  });
  test('missing matrix and addresses fall back, with a warning', async () => {
    const { doc, warnings } = await imp(await makeMvr({ fixtures: [{ uuid: 'X', matrix: null, address: null, spec: 'Odd@Thing' }] }));
    const f = fixtures(doc)[0];
    expect(f.matrix.o).toEqual({ x: 0, y: 0, z: 0 }); expect(f.address).toBeNull(); expect(f.typeKey).toBe('Odd@Thing');
    expect(warnings.join(' ')).toMatch(/1 object had no position/);
  });
  test('the break 0 address wins when there are several', async () => {
    const { doc } = await imp(await makeMvr({ fixtures: [{ uuid: 'M', address: [700, 33], addressBreaks: [1, 0] }] }));
    expect(fixtures(doc)[0].address).toBe(33);
  });
  test('a fixture with no GDTF gets a type keyed by name', async () => {
    const { doc } = await imp(await makeMvr({ fixtures: [{ uuid: 'N', name: 'House light', spec: '' }] }));
    expect(fixtures(doc)[0].typeKey).toBe('name:House light');
  });
  test('trusses and reference objects get their size from the 3D models', async () => {
    const { doc } = await imp(await makeMvr({
      symdefs: [{ uuid: 'SD', name: 'Box 3m', glbs: ['t.glb'] }, { uuid: 'TW', name: 'Tower', glbs: ['tw.glb'] }],
      glbs: { 't.glb': { min: [0, -0.15, -0.15], max: [3, 0.15, 0.15] }, 'tw.glb': { min: [-0.15, 0, -0.15], max: [0.15, 3, 0.15] }, 'stage.glb': { min: [0, 0, -2], max: [4, 0.4, 0] } },
      layers: [{ uuid: 'L', name: 'Rig', trusses: [{ uuid: 'T1', name: 'Box', matrix: '{1,0,0}{0,1,0}{0,0,1}{1000,0,6000}', symdef: 'SD' }, { uuid: 'T2', name: 'Tower', matrix: '{1,0,0}{0,1,0}{0,0,1}{0,5000,0}', symdef: 'TW' }],
        refs: [{ uuid: 'R1', name: 'Stage', matrix: '{1,0,0}{0,1,0}{0,0,1}{0,0,0}', glb: 'stage.glb' }] }],
    }));
    const t1 = doc.entities.get('T1') as Truss, t2 = doc.entities.get('T2') as Truss, r = doc.entities.get('R1') as RefObject;
    expect(t1).toMatchObject({ state: 'imported', boxSize: 300, mvrUuid: 'T1' });
    expect(t1.legs[0].a).toEqual({ x: 1000, y: 0, z: 6000 }); expect(t1.legs[0].b).toEqual({ x: 4000, y: 0, z: 6000 });
    expect(t2.legs[0].a).toEqual({ x: 0, y: 5000, z: 0 }); expect(t2.legs[0].b).toEqual({ x: 0, y: 5000, z: 3000 });
    expect(r.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 4000, y: 2000, z: 400 } });
  });
  test('unknown elements are tolerated', async () => {
    const { doc } = await imp(await makeMvr({ fixtures: [{ uuid: 'A' }], extraXml: '<Weird><Stuff a="1"/></Weird>' }));
    expect(fixtures(doc)).toHaveLength(1);
  });
  test('layers and classes', async () => {
    const { doc } = await imp(await makeMvr({ classes: [{ uuid: 'C', name: 'Lighting' }], layers: [{ uuid: 'L1', name: 'Empty' }, { uuid: 'L2', name: 'LX', fixtures: [{ uuid: 'A', classing: 'C' }] }] }));
    expect(doc.layers.map(l => l.name)).toEqual(['Empty', 'LX']); expect(doc.classes[0]).toEqual({ id: 'C', name: 'Lighting', visible: true });
    expect(fixtures(doc)[0]).toMatchObject({ layerId: 'L2', classId: 'C' });
  });
  test('keeps the original bytes and XML', async () => {
    const buf = await makeMvr({ fixtures: [{ uuid: 'A' }] });
    const r = await imp(buf);
    expect(r.original.byteLength).toBe(buf.byteLength); expect(r.xml).toContain('<GeneralSceneDescription');
  });
  test('a zip without a scene is refused', async () => {
    await expect(imp(await zipOf({ 'readme.txt': 'x' }))).rejects.toThrow('no GeneralSceneDescription.xml');
  });
  test('a PDF is refused', async () => {
    await expect(imp(enc('%PDF-1.7 not a zip').buffer as ArrayBuffer)).rejects.toThrow("isn't a zip archive");
  });
  test('broken XML is refused', async () => {
    await expect(imp(await zipOf({ 'GeneralSceneDescription.xml': '<GeneralSceneDescription><Scene>' }))).rejects.toThrow("couldn't be read");
  });
});

const SAMPLE = process.env.MVR_SAMPLE;
test.skipIf(!SAMPLE)('imports the real Vectorworks MVR', async () => {
  const { readFileSync } = await import('node:fs');
  const u = new Uint8Array(readFileSync(SAMPLE!));
  const t0 = performance.now();
  const { doc } = await imp(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer);
  expect(performance.now() - t0).toBeLessThan(2000);
  const fx = fixtures(doc);
  expect(fx).toHaveLength(188); expect(doc.layers).toHaveLength(25); expect(doc.positions).toHaveLength(9); expect(doc.classes).toHaveLength(11);
  expect([...doc.entities.values()].filter(e => e.kind === 'truss' && e.state === 'imported')).toHaveLength(8);
  expect(fx.find(f => f.fixtureId === '923')!.address).toBe(4741);
});
