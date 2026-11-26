import type { Doc, Fixture, Truss, RefObject, FixtureType, Id } from '../../core/model/types';
import type { Mat } from '../../core/geom/matrix';
import type { V3 } from '../../core/geom/vec';
import { IDENTITY, parseMvrMatrix, compose } from '../../core/geom/matrix';
export { compose };
import { newDoc } from '../../core/model/doc';
import { glbBounds } from './glb';

type Box = { min: V3; max: V3 };
const kids = (el: Element, tag?: string): Element[] => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!tag || (n as Element).tagName === tag)) out.push(n as Element);
  return out;
};
const child = (el: Element, tag: string): Element | null => kids(el, tag)[0] ?? null;
const text = (el: Element, tag: string): string => (child(el, tag)?.textContent ?? '').trim();

function boxThrough(m: Mat, b: Box): Box {
  const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const p = { x: m.o.x + m.u.x * x + m.v.x * y + m.w.x * z, y: m.o.y + m.u.y * x + m.v.y * y + m.w.y * z, z: m.o.z + m.u.z * x + m.v.z * y + m.w.z * z };
    for (const k of ['x', 'y', 'z'] as const) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return { min: lo, max: hi };
}
const union = (a: Box | null, b: Box | null): Box | null => !a ? b : !b ? a : {
  min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
  max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) } };
const r = (n: number) => Math.round(n * 1e6) / 1e6;
const tidy = (b: Box): Box => ({ min: { x: r(b.min.x), y: r(b.min.y), z: r(b.min.z) }, max: { x: r(b.max.x), y: r(b.max.y), z: r(b.max.z) } });

/** Maps an MVR scene into a Doc. Unknown elements are ignored here (they stay in the kept XML). */
export function parseScene(dom: Document, files: Map<string, Uint8Array>): { doc: Doc; warnings: string[] } {
  const doc = newDoc(), warnings: string[] = [];
  const root = dom.documentElement;
  const scene = child(root, 'Scene');
  if (!scene) return { doc, warnings: ['The file has no scene.'] };
  const aux = child(scene, 'AUXData');
  const symdefs = new Map<string, Element>();
  if (aux) for (const el of kids(aux)) {
    const id = el.getAttribute('uuid') ?? '', name = el.getAttribute('name') ?? '';
    if (el.tagName === 'Class' && id) doc.classes.push({ id, name, visible: true });
    else if (el.tagName === 'Position' && id) doc.positions.push({ id, name });
    else if (el.tagName === 'Symdef' && id) symdefs.set(id, el);
  }

  const glbCache = new Map<string, Box | null>();
  const fileBox = (name: string): Box | null => {
    if (!glbCache.has(name)) { const b = files.get(name); glbCache.set(name, b && name.toLowerCase().endsWith('.glb') ? glbBounds(b) : null); }
    return glbCache.get(name)!;
  };
  // Bounds of a list of geometry nodes (Geometry3D, Symbol -> Symdef), in the parent's frame
  const geomBox = (els: Element[], depth = 0): Box | null => {
    let box: Box | null = null;
    for (const g of els) {
      const m = child(g, 'Matrix') ? parseMvrMatrix(text(g, 'Matrix')) : IDENTITY;
      let b: Box | null = null;
      if (g.tagName === 'Geometry3D') b = fileBox(g.getAttribute('fileName') ?? '');
      else if (g.tagName === 'Symbol' && depth < 8) {
        const sd = symdefs.get(g.getAttribute('symdef') ?? '');
        const cl = sd && child(sd, 'ChildList');
        if (cl) b = geomBox(kids(cl), depth + 1);
      }
      if (b) box = union(box, boxThrough(m, b));
    }
    return box;
  };
  const objBox = (el: Element) => { const g = child(el, 'Geometries'); return g ? geomBox(kids(g)) : null; };

  let noMatrix = 0;
  const typeOf = (el: Element): string => {
    const spec = text(el, 'GDTFSpec');
    const key = spec ? spec.replace(/\.gdtf$/i, '') : 'name:' + (el.getAttribute('name') ?? '');
    if (!doc.types.has(key)) {
      const at = key.startsWith('name:') ? -1 : key.indexOf('@');
      let m = at > 0 ? key.slice(0, at) : '', n = at > 0 ? key.slice(at + 1) : key.replace(/^name:/, '');
      // "Custom@Light_Instr_..." is a Vectorworks-made profile: the fixture's own name reads better
      if (/^custom$/i.test(m)) { m = ''; n = (el.getAttribute('name') ?? '').trim() || n.replace(/_/g, ' '); }
      const t: FixtureType = { key, m, n, w: null, src: null, url: '',
        gdtfSpec: spec, mode: text(el, 'GDTFMode'), category: 'generic' };
      doc.types.set(key, t);
    }
    return key;
  };
  const address = (el: Element): number | null => {
    const as = child(el, 'Addresses'); if (!as) return null;
    const list = kids(as, 'Address');
    const pick = list.find(a => (a.getAttribute('break') ?? '0') === '0') ?? list[0];
    const n = pick ? parseInt(pick.textContent ?? '', 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  let sizeless = 0;
  const walk = (list: Element, layerId: Id, frame: Mat, parentTruss: Id | null = null) => {
    for (const el of kids(list)) {
      const id = el.getAttribute('uuid') ?? '', name = el.getAttribute('name') ?? '';
      const hasM = !!child(el, 'Matrix');
      const local = hasM ? parseMvrMatrix(text(el, 'Matrix')) : IDENTITY;
      const m = compose(frame, local);
      const classId = text(el, 'Classing') || null;
      if (el.tagName === 'GroupObject') { const cl = child(el, 'ChildList'); if (cl) walk(cl, layerId, m, parentTruss); continue; }
      if (!id) continue;
      // objects can carry children of their own (e.g. fixtures hung on a truss)
      const kidsList = child(el, 'ChildList');
      if (el.tagName === 'Fixture') {
        if (!hasM) noMatrix++;
        const unit = parseInt(text(el, 'UnitNumber'), 10);
        const f: Fixture = { id, kind: 'fixture', name, layerId, classId, positionId: text(el, 'Position') || null, trussId: null, matrix: m,
          typeKey: typeOf(el), unitNumber: Number.isFinite(unit) && unit > 0 ? unit : null, fixtureId: text(el, 'FixtureID'), address: address(el), mvrUuid: id };
        if (parentTruss) f.trussId = parentTruss;
        doc.entities.set(id, f);
        if (kidsList) walk(kidsList, layerId, m, parentTruss);
      } else if (el.tagName === 'Truss') {
        if (!hasM) noMatrix++;
        const found = objBox(el); if (!found) sizeless++;
        const b = found ?? { min: { x: 0, y: -150, z: -150 }, max: { x: 3000, y: 150, z: 150 } };
        const ex = b.max.x - b.min.x, ey = b.max.y - b.min.y, ez = b.max.z - b.min.z;
        const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
        const tower = ez > ex && ez > ey;
        const pt = (p: V3) => compose(m, { ...IDENTITY, o: p }).o;
        const [a, bb] = tower ? [pt({ x: cx, y: cy, z: b.min.z }), pt({ x: cx, y: cy, z: b.max.z })] : [pt({ x: b.min.x, y: cy, z: cz }), pt({ x: b.max.x, y: cy, z: cz })];
        const t: Truss = { id, kind: 'truss', name, layerId, classId, positionId: text(el, 'Position') || null,
          legs: [{ a: tidyV(a), b: tidyV(bb), sections: [Math.round(tower ? ez : ex)] }], boxSize: Math.round(tower ? Math.min(ex, ey) : Math.min(ey, ez)) || 300,
          state: 'imported', mvrUuid: id };
        doc.entities.set(id, t);
        if (kidsList) walk(kidsList, layerId, m, id);
      } else if (['SceneObject', 'VideoScreen', 'Projector', 'Support'].includes(el.tagName)) {
        if (!hasM) noMatrix++;
        const b = objBox(el);
        const ro: RefObject = { id, kind: 'ref', name: name || el.tagName, layerId, classId, matrix: m, bounds: b ? tidy(b) : null };
        doc.entities.set(id, ro);
        if (kidsList) walk(kidsList, layerId, m, parentTruss);
      }
    }
  };
  const layers = child(scene, 'Layers');
  if (layers) for (const l of kids(layers, 'Layer')) {
    const id = l.getAttribute('uuid') ?? `layer-${doc.layers.length}`;
    doc.layers.push({ id, name: l.getAttribute('name') ?? 'Layer', visible: true });
    const lm = child(l, 'Matrix') ? parseMvrMatrix(text(l, 'Matrix')) : IDENTITY;
    const cl = child(l, 'ChildList'); if (cl) walk(cl, id, lm);
  }
  if (sizeless) warnings.push(sizeless === 1 ? "1 truss had no readable size, so it's shown 3 m long. Check its length." : `${sizeless} trusses had no readable size, so they're shown 3 m long. Check their lengths.`);
  if (noMatrix) warnings.push(noMatrix === 1 ? '1 object had no position and was placed at 0,0.' : `${noMatrix} objects had no position and were placed at 0,0.`);
  return { doc, warnings };
}
const tidyV = (p: V3): V3 => ({ x: r(p.x), y: r(p.y), z: r(p.z) });
