/* MVR export (spec §6, §11). Starts from the original archive and XML DOM, re-parses that into a "base" Doc,
   and edits only the nodes whose entities changed, were deleted or were added. Every other archive member is
   copied byte for byte. Drafts are never exported. With no original, a minimal valid MVR is written. */
import type { Doc, Fixture, Truss, RefObject, Entity, Id } from '../../core/model/types';
import type { Mat } from '../../core/geom/matrix';
import { IDENTITY, parseMvrMatrix, formatMvrMatrix, compose, invert } from '../../core/geom/matrix';
import { newDoc } from '../../core/model/doc';
import { readZip, writeZip } from '../zip';
import { parseScene } from './parse';

export interface ExportDeps { parseXml(s: string): Document; serialize(d: Document): string }

const SKELETON = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<GeneralSceneDescription verMajor="1" verMinor="6" provider="Truss CAD" providerVersion="1"><Scene><AUXData/><Layers/></Scene></GeneralSceneDescription>';
const TRACKED = new Set(['Fixture', 'Truss', 'SceneObject', 'VideoScreen', 'Projector', 'Support']);

const kids = (el: Element, tag?: string): Element[] => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!tag || (n as Element).tagName === tag)) out.push(n as Element);
  return out;
};
const child = (el: Element, tag: string): Element | null => kids(el, tag)[0] ?? null;
const localOf = (el: Element): Mat => { const m = child(el, 'Matrix'); return m ? parseMvrMatrix((m.textContent ?? '').trim()) : IDENTITY; };
const near = (a: Mat, b: Mat) => (['u', 'v', 'w', 'o'] as const).every(k => (['x', 'y', 'z'] as const).every(c => Math.abs(a[k][c] - b[k][c]) < (k === 'o' ? 0.01 : 1e-6)));

export async function exportMvr(doc: Doc, original: Uint8Array | null, deps: ExportDeps): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const warnings: string[] = [];
  let files: Map<string, Uint8Array>, entry = 'GeneralSceneDescription.xml', dom: Document;
  if (original) {
    files = await readZip(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength) as ArrayBuffer);
    entry = [...files.keys()].find(k => k.toLowerCase() === 'generalscenedescription.xml') ?? entry;
    dom = deps.parseXml(new TextDecoder().decode(files.get(entry)!));
  } else { files = new Map(); dom = deps.parseXml(SKELETON); }
  const base = original ? parseScene(dom, files).doc : newDoc();
  const root = dom.documentElement;
  const el = (tag: string, attrs: Record<string, string> = {}, text?: string) => {
    const e = dom.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.appendChild(dom.createTextNode(text)); return e;
  };
  const setText = (parent: Element, tag: string, value: string | null) => {
    let c = child(parent, tag);
    if (value == null || value === '') { if (c) parent.removeChild(c); return; }
    if (!c) { c = el(tag); parent.appendChild(c); }
    while (c.firstChild) c.removeChild(c.firstChild);
    c.appendChild(dom.createTextNode(value));
  };
  const setMatrix = (node: Element, local: Mat) => {
    let m = child(node, 'Matrix');
    if (!m) { m = el('Matrix'); node.insertBefore(m, node.firstChild); }
    while (m.firstChild) m.removeChild(m.firstChild);
    m.appendChild(dom.createTextNode(formatMvrMatrix(local)));
  };
  const typeSpec = (key: string) => { const t = doc.types.get(key); return { spec: key.startsWith('name:') ? '' : t?.gdtfSpec || key + '.gdtf', mode: t?.mode ?? '' }; };
  const missingGdtf = new Set<string>();
  const writeFixtureProps = (node: Element, f: Fixture, b: Fixture | null) => {
    if (!b || f.name !== b.name) node.setAttribute('name', f.name);
    if (!b || f.typeKey !== b.typeKey) {
      const { spec, mode } = typeSpec(f.typeKey); setText(node, 'GDTFSpec', spec); setText(node, 'GDTFMode', mode);
      if (spec && original && ![...files.keys()].some(k => k.toLowerCase() === spec.toLowerCase())) missingGdtf.add(doc.types.get(f.typeKey)?.n || f.typeKey);
    }
    if (!b || f.classId !== b.classId) setText(node, 'Classing', f.classId);
    if (!b || f.positionId !== b.positionId) setText(node, 'Position', f.positionId);
    if (!b || f.fixtureId !== b.fixtureId) setText(node, 'FixtureID', f.fixtureId || (b ? '' : '0'));
    if (!b || f.unitNumber !== b.unitNumber) setText(node, 'UnitNumber', f.unitNumber != null ? String(f.unitNumber) : (b ? null : '0'));
    if (!b || f.address !== b.address) {
      let as = child(node, 'Addresses');
      const list = as ? kids(as, 'Address') : [];
      const pick = list.find(a => (a.getAttribute('break') ?? '0') === '0') ?? list[0];
      if (f.address == null) { if (pick && as) as.removeChild(pick); }
      else if (pick) { while (pick.firstChild) pick.removeChild(pick.firstChild); pick.appendChild(dom.createTextNode(String(f.address))); }
      else { if (!as) { as = el('Addresses'); node.appendChild(as); } as.appendChild(el('Address', { break: '0' }, String(f.address))); }
    }
  };
  // the move and turn that takes an imported truss's original leg onto its current one
  const trussDelta = (t: Truss, b: Truss): Mat | null => {
    const l0 = b.legs[0], l1 = t.legs[0];
    if (!l0 || !l1) return null;
    if (t.legs.length !== 1) warnings.push(`Truss ${t.name} now has corners; its MVR model stays a single piece.`);
    const len = (l: typeof l0) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y, l.b.z - l.a.z);
    if (Math.abs(len(l1) - len(l0)) > 1) warnings.push(`Truss ${t.name} was resized; its MVR model keeps the original length.`);
    const y0 = Math.atan2(l0.b.y - l0.a.y, l0.b.x - l0.a.x), y1 = Math.atan2(l1.b.y - l1.a.y, l1.b.x - l1.a.x);
    const d = Math.abs(l0.b.x - l0.a.x) + Math.abs(l0.b.y - l0.a.y) < 1e-6 ? 0 : y1 - y0, c = Math.cos(d), s = Math.sin(d);
    const ra = { x: c * l0.a.x - s * l0.a.y, y: s * l0.a.x + c * l0.a.y };
    return { u: { x: c, y: s, z: 0 }, v: { x: -s, y: c, z: 0 }, w: { x: 0, y: 0, z: 1 }, o: { x: l1.a.x - ra.x, y: l1.a.y - ra.y, z: l1.a.z - l0.a.z } };
  };
  const legsEqual = (a: Truss, b: Truss) => JSON.stringify(a.legs.map(l => [l.a, l.b])) === JSON.stringify(b.legs.map(l => [l.a, l.b]));

  // Walk the original tree with the original and the new frame of each parent, editing as we go.
  const walk = (list: Element, origFrame: Mat, newFrame: Mat) => {
    for (const node of kids(list)) {
      const local = localOf(node), origWorld = compose(origFrame, local);
      if (node.tagName === 'GroupObject') {
        const gw = compose(newFrame, local), cl = child(node, 'ChildList');
        if (cl) walk(cl, origWorld, gw);
        continue;
      }
      if (!TRACKED.has(node.tagName)) continue;
      const id = node.getAttribute('uuid') ?? '', b = base.entities.get(id), e = doc.entities.get(id);
      if (!b) continue;
      const cl = child(node, 'ChildList');
      if (!e || e.kind !== b.kind) {
        // deleted: anything still alive inside moves up to this list, staying where it is
        if (cl) {
          walk(cl, origWorld, origWorld);
          for (const k of kids(cl)) {
            if (TRACKED.has(k.tagName) && !doc.entities.has(k.getAttribute('uuid') ?? '')) continue;
            setMatrix(k, compose(invert(newFrame), compose(origWorld, localOf(k))));
            list.insertBefore(k, node);
          }
        }
        list.removeChild(node);
        continue;
      }
      let world: Mat;
      if (e.kind === 'truss') { const d = legsEqual(e, b as Truss) ? null : trussDelta(e, b as Truss); world = d ? compose(d, origWorld) : origWorld; }
      else world = (e as Fixture | RefObject).matrix;
      const newLocal = compose(invert(newFrame), world);
      if (!near(newLocal, local)) setMatrix(node, newLocal); // untouched when it didn't move relative to its parent
      if (e.kind === 'fixture') writeFixtureProps(node, e, b as Fixture);
      else if (e.name !== b.name) node.setAttribute('name', e.name);
      if (cl) walk(cl, origWorld, world);
    }
  };
  const scene = child(root, 'Scene') ?? root.appendChild(el('Scene'));
  let layersEl = child(scene, 'Layers'); if (!layersEl) { layersEl = el('Layers'); scene.appendChild(layersEl); }
  for (const l of kids(layersEl, 'Layer')) { const lm = localOf(l), cl = child(l, 'ChildList'); if (cl) walk(cl, lm, lm); }

  // New entities go into their layer (made if the file doesn't have it).
  const layerList = (layerId: Id): { list: Element; frame: Mat } => {
    let l = kids(layersEl!, 'Layer').find(x => x.getAttribute('uuid') === layerId);
    if (!l) { l = el('Layer', { uuid: layerId, name: doc.layers.find(x => x.id === layerId)?.name ?? 'Truss CAD' }); layersEl!.appendChild(l); }
    let cl = child(l, 'ChildList'); if (!cl) { cl = el('ChildList'); l.appendChild(cl); }
    return { list: cl, frame: localOf(l) };
  };
  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)).toUpperCase();
  let modelless = 0;
  for (const e of doc.entities.values() as Iterable<Entity>) {
    if (base.entities.has(e.id)) continue;
    if (e.kind === 'fixture') {
      const { list, frame } = layerList(e.layerId);
      const node = el('Fixture', { uuid: e.mvrUuid ?? e.id, name: e.name });
      setMatrix(node, compose(invert(frame), e.matrix));
      writeFixtureProps(node, e, null);
      list.appendChild(node);
    } else if (e.kind === 'truss' && e.state !== 'draft') {
      const { list, frame } = layerList(e.layerId);
      e.legs.forEach((l, i) => {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, dz = l.b.z - l.a.z, L = Math.hypot(dx, dy, dz) || 1;
        const u = { x: dx / L, y: dy / L, z: dz / L }, w0 = { x: 0, y: 0, z: 1 };
        const v = { x: w0.y * u.z - w0.z * u.y, y: w0.z * u.x - w0.x * u.z, z: w0.x * u.y - w0.y * u.x }, vl = Math.hypot(v.x, v.y, v.z) || 1;
        const vn = { x: v.x / vl, y: v.y / vl, z: v.z / vl }, w = { x: u.y * vn.z - u.z * vn.y, y: u.z * vn.x - u.x * vn.z, z: u.x * vn.y - u.y * vn.x };
        const node = el('Truss', { uuid: i === 0 ? (e.mvrUuid ?? e.id) : uuid(), name: e.legs.length > 1 ? `${e.name} leg ${i + 1}` : e.name });
        setMatrix(node, compose(invert(frame), { u, v: vn, w, o: { ...l.a } }));
        if (e.classId) node.appendChild(el('Classing', {}, e.classId));
        if (e.positionId) node.appendChild(el('Position', {}, e.positionId));
        list.appendChild(node);
      });
      modelless++;
    }
  }
  // positions and classes the doc knows that the file doesn't
  let aux = child(scene, 'AUXData'); if (!aux) { aux = el('AUXData'); scene.insertBefore(aux, scene.firstChild); }
  const auxIds = new Set(kids(aux).map(x => x.getAttribute('uuid')));
  for (const c of doc.classes) if (!auxIds.has(c.id)) aux.appendChild(el('Class', { uuid: c.id, name: c.name }));
  for (const p of doc.positions) if (!auxIds.has(p.id)) aux.appendChild(el('Position', { uuid: p.id, name: p.name }));

  if (modelless) warnings.push(modelless === 1 ? '1 truss has no 3D model in the MVR (it was drawn or confirmed here).' : `${modelless} trusses have no 3D model in the MVR (they were drawn or confirmed here).`);
  if (missingGdtf.size) warnings.push(`No GDTF file in this MVR for ${[...missingGdtf].join(', ')}; consoles may ask for ${missingGdtf.size === 1 ? 'it' : 'them'}.`);
  let xml = deps.serialize(dom);
  if (!/^\s*<\?xml/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' + xml;
  files.set(entry, new TextEncoder().encode(xml));
  return { bytes: await writeZip(files, { deflate: true }), warnings };
}
