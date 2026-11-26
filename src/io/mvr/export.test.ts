import { describe, test, expect } from 'vitest';
import { DOMParser, XMLSerializer, DOMImplementation } from '@xmldom/xmldom';
import { exportMvr } from './export';
import { importMvr } from './import';
import { readZip, writeZip } from '../zip';
import { translate, rotateAboutZ, IDENTITY } from '../../core/geom/matrix';
import type { Doc, Fixture, Truss } from '../../core/model/types';

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'text/xml') as unknown as Document;
const deps = { parseXml, serialize: (d: Document) => new XMLSerializer().serializeToString(d as any) };
void DOMImplementation;
const enc = (s: string) => new TextEncoder().encode(s), dec = (b: Uint8Array) => new TextDecoder().decode(b);
const M = (x: number, y: number, z: number) => `{1,0,0}{0,1,0}{0,0,1}{${x},${y},${z}}`;
const fx = (uuid: string, name: string, m: string, extra = '') => `<Fixture uuid="${uuid}" name="${name}"><Matrix>${m}</Matrix><GDTFSpec>Robe@Spot.gdtf</GDTFSpec><GDTFMode>M1</GDTFMode>${extra}<CustomCommands/></Fixture>`;
const XML = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<GeneralSceneDescription verMajor="1" verMinor="6" provider="Vectorworks">
 <UserData><Data provider="VW" ver="1"><Custom a="1"/></Data></UserData>
 <Scene>
  <AUXData><Class uuid="C1" name="Lighting"/><Position uuid="P1" name="LX &amp; Co 🎭"/></AUXData>
  <Layers>
   <Layer uuid="L1" name="Lights">
    <Matrix>${M(0, 0, 1000)}</Matrix>
    <ChildList>
     <Truss uuid="T1" name="LX1"><Matrix>${M(0, 0, 6000)}</Matrix><Classing>C1</Classing>
      <ChildList>${fx('F1', 'Spot', M(1000, 0, -300), '<FixtureID>1</FixtureID><UnitNumber>1</UnitNumber><Addresses><Address break="0">4741</Address></Addresses>')}</ChildList>
     </Truss>
     ${fx('F2', 'Wash &lt;big&gt; &amp; 🎭', M(2000, 3000, 5000), '<Position>P1</Position><FixtureID>2</FixtureID><UnitNumber>2</UnitNumber><Addresses><Address break="0">1</Address></Addresses>')}
     <GroupObject uuid="G" name="grp"><Matrix>${M(5000, 0, 0)}</Matrix><ChildList>${fx('F3', 'Grouped', M(100, 200, 3000))}</ChildList></GroupObject>
     <SceneObject uuid="S1" name="Stage"><Matrix>${M(0, -5000, 0)}</Matrix><Geometries><Geometry3D fileName="stage.glb"/></Geometries></SceneObject>
    </ChildList>
   </Layer>
  </Layers>
 </Scene>
</GeneralSceneDescription>`;
const GDTF = new Uint8Array([80, 75, 1, 2, 3, 250, 0, 7]), GLB = new Uint8Array([9, 9, 9, 1]);
async function mvr(): Promise<Uint8Array> { return writeZip(new Map([['GeneralSceneDescription.xml', enc(XML)], ['Robe@Spot.gdtf', GDTF], ['stage.glb', GLB]])); }
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
async function load() { const orig = await mvr(); const r = await importMvr(ab(orig), { parseXml }); return { orig, doc: r.doc }; }
async function out(doc: Doc, orig: Uint8Array | null) { const r = await exportMvr(doc, orig, deps); const files = await readZip(ab(r.bytes)); return { ...r, files, xml: dec(files.get('GeneralSceneDescription.xml')!) }; }
const reimport = async (b: Uint8Array) => (await importMvr(ab(b), { parseXml })).doc;
const matrixOf = (xml: string, uuid: string) => xml.match(new RegExp(`uuid="${uuid}"[^>]*>\\s*<Matrix>([^<]*)</Matrix>`))![1];
const pos = (d: Doc, id: string) => { const o = (d.entities.get(id) as Fixture).matrix.o; return [o.x, o.y, o.z].map(v => Math.round(v * 1000) / 1000); };

describe('MVR export', () => {
  test('no changes: same doc back, other members byte for byte, XML intact', async () => {
    const { orig, doc } = await load();
    const r = await out(doc, orig);
    expect(r.files.get('Robe@Spot.gdtf')).toEqual(GDTF);
    expect(r.files.get('stage.glb')).toEqual(GLB);
    const norm = (s: string) => deps.serialize(parseXml(s)).replace(/\s+/g, ' ');
    expect(norm(r.xml)).toBe(norm(XML));
    const back = await reimport(r.bytes);
    expect([...back.entities.keys()].sort()).toEqual([...doc.entities.keys()].sort());
    expect(r.warnings).toEqual([]);
  });
  test('moving one fixture changes only its matrix', async () => {
    const { orig, doc } = await load();
    const f2 = doc.entities.get('F2') as Fixture; f2.matrix = translate(f2.matrix, { x: 500, y: 0, z: 0 });
    const r = await out(doc, orig);
    expect(matrixOf(r.xml, 'F2')).not.toBe(matrixOf(XML, 'F2'));
    for (const id of ['T1', 'F1', 'G', 'F3', 'S1']) expect(matrixOf(r.xml, id)).toBe(matrixOf(XML, id));
    expect(pos(await reimport(r.bytes), 'F2')).toEqual([2500, 3000, 6000]);
  });
  test('a truss moved with its fixture: the truss matrix changes, the fixture\'s local matrix does not', async () => {
    const { orig, doc } = await load();
    const t = doc.entities.get('T1') as Truss, f1 = doc.entities.get('F1') as Fixture;
    const turn = (p: { x: number; y: number; z: number }) => { const m = rotateAboutZ(translate(IDENTITY, p), { x: 0, y: 0 }, Math.PI / 2); return { ...m.o }; };
    t.legs = t.legs.map(l => ({ ...l, a: turn(l.a), b: turn(l.b) }));
    f1.matrix = rotateAboutZ(f1.matrix, { x: 0, y: 0 }, Math.PI / 2);
    const r = await out(doc, orig);
    expect(matrixOf(r.xml, 'T1')).not.toBe(matrixOf(XML, 'T1'));
    expect(matrixOf(r.xml, 'F1')).toBe(matrixOf(XML, 'F1'));
    const back = await reimport(r.bytes);
    expect(pos(back, 'F1')).toEqual(pos(doc, 'F1'));
  });
  test('a deleted truss keeps its fixtures where they were', async () => {
    const { orig, doc } = await load();
    const before = pos(doc, 'F1'); doc.entities.delete('T1');
    const r = await out(doc, orig);
    expect(r.xml).not.toContain('uuid="T1"');
    const back = await reimport(r.bytes);
    expect(pos(back, 'F1')).toEqual(before);
  });
  test('names with &, <, emoji and addresses above universe 1 survive', async () => {
    const { orig, doc } = await load();
    const f2 = doc.entities.get('F2') as Fixture; f2.name = 'Wash <2> & "co" 🎭'; f2.unitNumber = 7; f2.address = 4742; f2.fixtureId = '202';
    const back = await reimport((await out(doc, orig)).bytes);
    expect(back.entities.get('F2')).toMatchObject({ name: 'Wash <2> & "co" 🎭', unitNumber: 7, address: 4742, fixtureId: '202' });
    expect((back.entities.get('F1') as Fixture).address).toBe(4741);
    expect(back.positions[0].name).toBe('LX & Co 🎭');
  });
  test('a new fixture lands in its layer at the same place, with its address', async () => {
    const { orig, doc } = await load();
    doc.entities.set('NEW1', { id: 'NEW1', kind: 'fixture', name: 'Added', layerId: 'L1', classId: null, positionId: null, trussId: null, matrix: translate(IDENTITY, { x: 7000, y: 1000, z: 4000 }),
      typeKey: 'Robe@Spot', unitNumber: 9, fixtureId: '9', address: 600, mvrUuid: null });
    const back = await reimport((await out(doc, orig)).bytes);
    expect(back.entities.get('NEW1')).toMatchObject({ kind: 'fixture', unitNumber: 9, address: 600, typeKey: 'Robe@Spot', layerId: 'L1' });
    expect(pos(back, 'NEW1')).toEqual([7000, 1000, 4000]);
  });
  test('drafts are never exported; a confirmed truss with corners becomes one truss per leg', async () => {
    const { orig, doc } = await load();
    const tr = (id: string, state: Truss['state'], legs: [number, number, number, number][]): Truss => ({ id, kind: 'truss', name: id, layerId: 'L1', classId: null, positionId: null,
      legs: legs.map(([ax, ay, bx, by]) => ({ a: { x: ax, y: ay, z: 7000 }, b: { x: bx, y: by, z: 7000 }, sections: [] })), boxSize: 300, state, mvrUuid: null });
    doc.entities.set('D1', tr('D1', 'draft', [[0, 9000, 6000, 9000]]));
    doc.entities.set('C2', tr('C2', 'confirmed', [[0, 12000, 4000, 12000], [4000, 12000, 4000, 15000]]));
    const r = await out(doc, orig);
    expect(r.xml).not.toContain('name="D1"');
    expect((r.xml.match(/<Truss /g) || []).length).toBe(3); // T1 + two legs
    expect(r.warnings.join(' ')).toMatch(/no 3D model/);
  });
  test('no original: a valid MVR that re-imports with the same fixtures', async () => {
    const { doc } = await load();
    const r = await out(doc, null);
    const back = await reimport(r.bytes);
    const ids = (d: Doc) => [...d.entities.values()].filter(e => e.kind === 'fixture').map(e => e.id).sort();
    expect(ids(back)).toEqual(ids(doc));
    for (const id of ids(doc)) expect(pos(back, id)).toEqual(pos(doc, id));
  });
});

const SAMPLE = process.env.MVR_SAMPLE;
test.skipIf(!SAMPLE)('the real Vectorworks MVR round-trips: unchanged members identical, same scene back', async () => {
  const { readFileSync } = await import('node:fs');
  const orig = new Uint8Array(readFileSync(SAMPLE!));
  const doc = (await importMvr(ab(orig), { parseXml })).doc;
  const r = await out(doc, orig);
  const before = await readZip(ab(orig));
  for (const [k, v] of before) if (!/generalscenedescription\.xml/i.test(k)) expect(r.files.get(k), k).toEqual(v);
  const norm = (s: string) => deps.serialize(parseXml(s)).replace(/\s+/g, ' ');
  expect(norm(r.xml)).toBe(norm(new TextDecoder().decode([...before].find(([k]) => /generalscenedescription\.xml/i.test(k))![1])));
  const back = await reimport(r.bytes);
  expect(back.entities.size).toBe(doc.entities.size);
}, 30000);

describe('MVR export review fixes', () => {
  test('Swap A/B on an imported truss changes nothing in the export', async () => {
    const { orig, doc } = await load();
    const t = doc.entities.get('T1') as Truss;
    t.legs = t.legs.slice().reverse().map(l => ({ a: { ...l.b }, b: { ...l.a }, sections: l.sections.slice().reverse() }));
    const r = await out(doc, orig);
    expect(matrixOf(r.xml, 'T1')).toBe(matrixOf(XML, 'T1'));
    expect(matrixOf(r.xml, 'F1')).toBe(matrixOf(XML, 'F1'));
  });
  test('type changes keep GDTFSpec and GDTFMode, with a share-style name for database and name-only types', async () => {
    const { orig, doc } = await load();
    doc.types.set('ofl:robe/megapointe', { key: 'ofl:robe/megapointe', m: 'Robe', n: 'MegaPointe', w: 470, src: 'o', url: '', gdtfSpec: '', mode: '', category: 'spot' });
    doc.types.set('name:Par', { key: 'name:Par', m: '', n: 'Par', w: 300, src: 'j', url: '', gdtfSpec: '', mode: '', category: 'par' });
    (doc.entities.get('F2') as Fixture).typeKey = 'ofl:robe/megapointe';
    (doc.entities.get('F3') as Fixture).typeKey = 'name:Par';
    const r = await out(doc, orig);
    const node = (id: string) => r.xml.match(new RegExp(`<Fixture uuid="${id}"[\\s\\S]*?</Fixture>`))![0];
    expect(node('F2')).toContain('<GDTFSpec>Robe@MegaPointe.gdtf</GDTFSpec>');
    expect(node('F2')).toMatch(/<GDTFMode\s*\/>|<GDTFMode><\/GDTFMode>/);
    expect(node('F3')).toContain('<GDTFSpec>Par.gdtf</GDTFSpec>');
    expect(r.warnings.join(' ')).toMatch(/No GDTF file/);
  });
  test('a new fixture with no Fixture ID keeps an empty FixtureID, and re-imports with none', async () => {
    const { orig, doc } = await load();
    doc.entities.set('NEW2', { id: 'NEW2', kind: 'fixture', name: 'N', layerId: 'L1', classId: null, positionId: null, trussId: null, matrix: IDENTITY, typeKey: 'Robe@Spot', unitNumber: null, fixtureId: '', address: null, mvrUuid: null });
    const r = await out(doc, orig);
    expect(r.xml).toMatch(/uuid="NEW2"[\s\S]*?<FixtureID\s*\/>|uuid="NEW2"[\s\S]*?<FixtureID><\/FixtureID>/);
    expect((await reimport(r.bytes)).entities.get('NEW2')).toMatchObject({ fixtureId: '', unitNumber: null });
  });
  test('new truss legs get the same uuids on every export, and a Geometries element', async () => {
    const { orig, doc } = await load();
    doc.entities.set('C3', { id: 'C3', kind: 'truss', name: 'C3', layerId: 'L1', classId: null, positionId: null, legs: [
      { a: { x: 0, y: 9000, z: 7000 }, b: { x: 4000, y: 9000, z: 7000 }, sections: [] }, { a: { x: 4000, y: 9000, z: 7000 }, b: { x: 4000, y: 12000, z: 7000 }, sections: [] }], boxSize: 300, state: 'confirmed', mvrUuid: null } as Truss);
    const ids = (x: string) => [...x.matchAll(/<Truss uuid="([^"]+)" name="C3/g)].map(m => m[1]);
    const a = ids((await out(doc, orig)).xml), b = ids((await out(doc, orig)).xml);
    expect(a.length).toBe(2); expect(a).toEqual(b);
    expect(a[1]).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
    expect((await out(doc, orig)).xml).toMatch(/name="C3 leg 2"[\s\S]*?<Geometries\s*\/>/);
  });
});
