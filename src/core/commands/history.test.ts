import { describe, test, expect } from 'vitest';
import { History } from './history';
import { addEntities, removeEntities, setProps, transform, duplicate, setVisibility, setFixtureType } from './ops';
import { newDoc, docToJSON, docFromJSON, newId, docBounds } from '../model/doc';
import type { Doc, Fixture, Truss, FixtureType } from '../model/types';
import { IDENTITY, translate, rotateAboutZ } from '../geom/matrix';

function rig(): { doc: Doc; truss: Truss; fx: Fixture[] } {
  const doc = newDoc();
  doc.layers.push({ id: 'L1', name: 'LX', visible: true });
  doc.classes.push({ id: 'C1', name: 'Lighting', visible: true });
  const truss: Truss = { id: 'T1', kind: 'truss', name: 'LX1', layerId: 'L1', classId: null, positionId: null,
    legs: [{ a: { x: 0, y: 0, z: 8000 }, b: { x: 8000, y: 0, z: 8000 }, sections: [3000, 3000, 2000] }], boxSize: 300, state: 'confirmed', mvrUuid: null };
  const fx: Fixture[] = [0, 1].map(i => ({ id: 'F' + i, kind: 'fixture', name: 'Spot', layerId: 'L1', classId: 'C1', positionId: null, trussId: 'T1',
    matrix: translate(IDENTITY, { x: 1000 + i * 2000, y: 0, z: 8000 }), typeKey: 'Robe@MegaPointe', unitNumber: i + 1, fixtureId: String(i + 1), address: 1 + i * 40, mvrUuid: null }));
  doc.entities.set(truss.id, truss); fx.forEach(f => doc.entities.set(f.id, f));
  return { doc, truss, fx };
}
const snap = (d: Doc) => JSON.stringify(docToJSON(d));
const type: FixtureType = { key: 'Ayrton@Mistral', m: 'Ayrton', n: 'Mistral', w: 550, src: 's', url: '', gdtfSpec: 'Ayrton@Mistral.gdtf', mode: '', category: 'spot' };

const ops: [string, (d: Doc) => import('./history').Command][] = [
  ['addEntities', d => addEntities([{ ...(d.entities.get('F0') as Fixture), id: 'NEW' }])],
  ['removeEntities (truss)', () => removeEntities(['T1'])],
  ['removeEntities (fixture)', () => removeEntities(['F1'])],
  ['setProps', () => setProps('F0', { name: 'Wash', unitNumber: 9 })],
  ['transform (truss + fixtures)', () => transform(['T1'], m => translate(m, { x: 500, y: 250, z: 0 }))],
  ['transform (rotate)', () => transform(['F0', 'F1'], m => rotateAboutZ(m, { x: 0, y: 0 }, 0.3))],
  ['duplicate', () => duplicate(['T1'], { x: 1000, y: 1000 })],
  ['setVisibility', () => setVisibility('layer', 'L1', false)],
  ['setFixtureType', () => setFixtureType(['F0', 'F1'], type.key, type)],
];

describe('commands undo exactly', () => {
  test.each(ops)('%s', (_n, make) => {
    const { doc } = rig(); const h = new History(doc);
    const before = snap(doc); h.exec(make(doc)); const after = snap(doc);
    expect(after).not.toBe(before);
    h.undo(); expect(snap(doc)).toBe(before);
    h.redo(); expect(snap(doc)).toBe(after);
  });
});

describe('behaviour', () => {
  test('moving a truss moves its fixtures by the same amount', () => {
    const { doc } = rig(); new History(doc).exec(transform(['T1'], m => translate(m, { x: 500, y: 250, z: 0 })));
    const t = doc.entities.get('T1') as Truss, f = doc.entities.get('F0') as Fixture;
    expect(t.legs[0].a).toEqual({ x: 500, y: 250, z: 8000 }); expect(f.matrix.o).toEqual({ x: 1500, y: 250, z: 8000 });
  });
  test('deleting a truss frees its fixtures, and undo re-attaches them', () => {
    const { doc } = rig(); const h = new History(doc);
    h.exec(removeEntities(['T1'])); expect((doc.entities.get('F0') as Fixture).trussId).toBeNull();
    h.undo(); expect((doc.entities.get('F0') as Fixture).trussId).toBe('T1');
  });
  test('duplicating a truss duplicates its fixtures onto the copy', () => {
    const { doc } = rig(); new History(doc).exec(duplicate(['T1'], { x: 1000, y: 1000 }));
    const trusses = [...doc.entities.values()].filter(e => e.kind === 'truss') as Truss[];
    const copy = trusses.find(t => t.id !== 'T1')!;
    const onCopy = [...doc.entities.values()].filter(e => e.kind === 'fixture' && e.trussId === copy.id) as Fixture[];
    expect(onCopy).toHaveLength(2); expect(copy.mvrUuid).toBeNull(); expect(onCopy[0].matrix.o.x).toBe(2000);
  });
  test('grouped commands undo as one step', () => {
    const { doc } = rig(); const h = new History(doc); const before = snap(doc);
    h.begin('two'); h.exec(setProps('F0', { name: 'A' })); h.exec(setProps('F1', { name: 'B' })); h.end();
    h.undo(); expect(snap(doc)).toBe(before); expect(h.canUndo).toBe(false);
  });
  test('a new command clears redo', () => {
    const { doc } = rig(); const h = new History(doc);
    h.exec(setProps('F0', { name: 'A' })); h.undo(); expect(h.canRedo).toBe(true);
    h.exec(setProps('F0', { name: 'B' })); expect(h.canRedo).toBe(false);
  });
  test('change listeners hear about exec, undo and redo', () => {
    const { doc } = rig(); const h = new History(doc); let n = 0; h.onChange(() => n++);
    h.exec(setProps('F0', { name: 'A' })); h.undo(); h.redo(); expect(n).toBe(3);
  });
  test('loading drops malformed entities instead of throwing', () => {
    expect(docFromJSON({ entities: [{ kind: 'fixture' }, null, 7], junk: 1 }).entities.size).toBe(0);
    expect(docFromJSON('garbage').entities.size).toBe(0);
  });
  test('JSON round trip keeps everything', () => {
    const { doc } = rig(); doc.types.set(type.key, type);
    expect(JSON.parse(snap(docFromJSON(JSON.parse(snap(doc)))))).toEqual(JSON.parse(snap(doc)));
  });
  test('ids are uppercase uuids', () => { expect(newId()).toMatch(/^[0-9A-F-]{36}$/); });
  test('bounds cover trusses and fixtures', () => {
    const { doc } = rig(); const b = docBounds(doc)!;
    expect(b.min.x).toBeLessThanOrEqual(0); expect(b.max.x).toBeGreaterThanOrEqual(8000);
  });
});
