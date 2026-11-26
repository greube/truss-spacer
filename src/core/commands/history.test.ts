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

describe('per-truss spacing settings', () => {
  test('round trip through saving, and bad values fall back to defaults', async () => {
    const { DEFAULT_SPACING } = await import('../model/types');
    const { doc, truss } = rig();
    (doc.entities.get(truss.id) as Truss).spacing = { ...DEFAULT_SPACING, ref: 'centre', offset: 500, offsetSide: 'before', mode: 'fixed', gap: 1500 };
    const back = docFromJSON(JSON.parse(JSON.stringify(docToJSON(doc))));
    expect((back.entities.get(truss.id) as Truss).spacing).toEqual({ ...DEFAULT_SPACING, ref: 'centre', offset: 500, offsetSide: 'before', mode: 'fixed', gap: 1500 });
    const junk = JSON.parse(JSON.stringify(docToJSON(doc))); junk.entities.find((e: any) => e.id === truss.id).spacing = { ref: 'sideways', offset: 'x', gap: -5 };
    const s = (docFromJSON(junk).entities.get(truss.id) as Truss).spacing!;
    expect(s.ref).toBe('a'); expect(s.offset).toBe(0); expect(s.gap).toBe(DEFAULT_SPACING.gap);
  });
  test('trusses without settings stay without (defaults apply when used)', () => {
    const { doc, truss } = rig();
    expect((docFromJSON(JSON.parse(JSON.stringify(docToJSON(doc)))).entities.get(truss.id) as Truss).spacing).toBeUndefined();
  });
});

describe('power settings', () => {
  test('new jobs get the owner defaults', async () => {
    const { DEFAULT_POWER } = await import('../model/types');
    expect(newDoc().settings.power).toEqual(DEFAULT_POWER);
    expect(DEFAULT_POWER).toEqual({ circuitW: 2400, loadPct: 80, perSoca: 6, fill: 'spread', phases: false });
  });
  test('round trip, and bad or out-of-range values fall back to defaults', async () => {
    const { DEFAULT_POWER } = await import('../model/types');
    const { doc } = rig();
    doc.settings.power = { circuitW: 2000, loadPct: 100, perSoca: 4, fill: 'fewest', phases: true };
    expect(docFromJSON(JSON.parse(JSON.stringify(docToJSON(doc)))).settings.power).toEqual(doc.settings.power);
    const junk = JSON.parse(JSON.stringify(docToJSON(doc)));
    junk.settings.power = { circuitW: 5, loadPct: 500, perSoca: 'x', fill: 'most', phases: 'yes' };
    expect(docFromJSON(junk).settings.power).toEqual(DEFAULT_POWER);
    delete junk.settings.power;
    expect(docFromJSON(junk).settings.power).toEqual(DEFAULT_POWER);
  });
  test('changing power settings is undoable', async () => {
    const { setSettings } = await import('./ops');
    const { doc } = rig(); const h = new History(doc);
    h.exec(setSettings({ power: { ...doc.settings.power, loadPct: 50 } }));
    expect(doc.settings.power.loadPct).toBe(50);
    h.undo();
    expect(doc.settings.power.loadPct).toBe(80);
  });
});
