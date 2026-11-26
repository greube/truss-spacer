import type { Doc, Entity, Bounds, Fixture, Truss, RefObject, FixtureType, Layer, MvrClass, HangingPosition, Category, TrussSpacing } from './types';
import { DEFAULT_SPACING, DEFAULT_POWER } from './types';
import type { PowerSettings } from './types';
import type { Mat } from '../geom/matrix';
import { IDENTITY } from '../geom/matrix';

export const newId = (): string => crypto.randomUUID().toUpperCase();

export function newDoc(): Doc {
  return { entities: new Map(), layers: [], classes: [], positions: [], types: new Map(),
    settings: { unit: 'm', round: 5, labels: { unit: true, fid: false, addr: true }, power: { ...DEFAULT_POWER } } };
}

/** Plain JSON for saving. Entities and types are sorted so equal docs give equal JSON. */
export function docToJSON(d: Doc): unknown {
  return {
    v: 1,
    entities: [...d.entities.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    layers: d.layers, classes: d.classes, positions: d.positions,
    types: [...d.types.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    settings: d.settings,
  };
}

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown): x is string => typeof x === 'string';
const v3 = (p: any) => isObj(p) && num(p.x) && num(p.y) && num(p.z);
const mat = (m: any): m is Mat => isObj(m) && v3(m.u) && v3(m.v) && v3(m.w) && v3(m.o);
const CATS: Category[] = ['spot', 'wash', 'beam', 'profile', 'par', 'strip', 'strobe', 'effect', 'generic'];

function cleanSpacing(s: any): TrussSpacing {
  const d = DEFAULT_SPACING, pos = (v: any, dv: number) => (num(v) && v >= 0 ? v : dv);
  return {
    ref: ['a', 'centre', 'b'].includes(s.ref) ? s.ref : d.ref, offset: pos(s.offset, d.offset), offsetSide: s.offsetSide === 'before' ? 'before' : 'after',
    joinWarn: pos(s.joinWarn, d.joinWarn), mode: ['edge', 'equal', 'cells', 'fixed'].includes(s.mode) ? s.mode : d.mode,
    inset: pos(s.inset, d.inset), insetB: pos(s.insetB, d.insetB), diffEnds: !!s.diffEnds, gap: num(s.gap) && s.gap > 0 ? s.gap : d.gap,
  };
}

function cleanEntity(e: any): Entity | null {
  if (!isObj(e) || !str(e.id) || !str(e.layerId)) return null;
  const base = { id: e.id, name: str(e.name) ? e.name : '', layerId: e.layerId, classId: str(e.classId) ? e.classId : null };
  if (e.kind === 'fixture') {
    if (!mat(e.matrix)) return null;
    const f: Fixture = { ...base, kind: 'fixture', positionId: str(e.positionId) ? e.positionId : null, trussId: str(e.trussId) ? e.trussId : null,
      matrix: e.matrix, typeKey: str(e.typeKey) ? e.typeKey : '', unitNumber: num(e.unitNumber) ? e.unitNumber : null,
      fixtureId: str(e.fixtureId) ? e.fixtureId : '', address: num(e.address) ? e.address : null, mvrUuid: str(e.mvrUuid) ? e.mvrUuid : null };
    return f;
  }
  if (e.kind === 'truss') {
    if (!Array.isArray(e.legs) || !e.legs.length || !e.legs.every((l: any) => isObj(l) && v3(l.a) && v3(l.b))) return null;
    const t: Truss = { ...base, kind: 'truss', positionId: str(e.positionId) ? e.positionId : null,
      legs: e.legs.map((l: any) => ({ a: l.a, b: l.b, sections: Array.isArray(l.sections) ? l.sections.filter(num) : [] })),
      boxSize: num(e.boxSize) ? e.boxSize : 300, state: ['draft', 'confirmed', 'imported'].includes(e.state) ? e.state : 'draft',
      mvrUuid: str(e.mvrUuid) ? e.mvrUuid : null };
    if (isObj(e.spacing)) t.spacing = cleanSpacing(e.spacing);
    if (e.dmxFrom === 'a' || e.dmxFrom === 'b') t.dmxFrom = e.dmxFrom;
    return t;
  }
  if (e.kind === 'ref') {
    if (!mat(e.matrix)) return null;
    const r: RefObject = { ...base, kind: 'ref', matrix: e.matrix,
      bounds: isObj(e.bounds) && v3(e.bounds.min) && v3(e.bounds.max) ? (e.bounds as RefObject["bounds"]) : null };
    return r;
  }
  return null;
}

/** Loads saved JSON, dropping anything malformed rather than throwing. */
function cleanPower(p: unknown): PowerSettings {
  const d = DEFAULT_POWER;
  if (!isObj(p)) return { ...d };
  const inRange = (v: unknown, lo: number, hi: number, dv: number) => (num(v) && v >= lo && v <= hi ? v : dv);
  return {
    circuitW: inRange(p.circuitW, 100, 100000, d.circuitW),
    loadPct: inRange(p.loadPct, 10, 100, d.loadPct),
    perSoca: Math.round(inRange(p.perSoca, 1, 12, d.perSoca)),
    fill: p.fill === 'fewest' || p.fill === 'spread' ? p.fill : d.fill,
    phases: p.phases === true,
  };
}

export function docFromJSON(j: unknown): Doc {
  const d = newDoc();
  if (!isObj(j)) return d;
  const named = (x: any) => isObj(x) && str(x.id) && str(x.name);
  if (Array.isArray(j.layers)) d.layers = j.layers.filter(named).map((l: any): Layer => ({ id: l.id, name: l.name, visible: l.visible !== false }));
  if (Array.isArray(j.classes)) d.classes = j.classes.filter(named).map((c: any): MvrClass => ({ id: c.id, name: c.name, visible: c.visible !== false }));
  if (Array.isArray(j.positions)) d.positions = j.positions.filter(named).map((p: any): HangingPosition => ({ id: p.id, name: p.name }));
  if (Array.isArray(j.types)) for (const t of j.types) {
    if (!isObj(t) || !str(t.key) || !str(t.n)) continue;
    const ft: FixtureType = { key: t.key, m: str(t.m) ? t.m : '', n: t.n, w: num(t.w) ? t.w : null,
      src: ['s', 'l', 'o', 'm', 'j'].includes(t.src) ? t.src : null, url: str(t.url) ? t.url : '',
      gdtfSpec: str(t.gdtfSpec) ? t.gdtfSpec : '', mode: str(t.mode) ? t.mode : '', category: CATS.includes(t.category) ? t.category : 'generic' };
    d.types.set(ft.key, ft);
  }
  if (Array.isArray(j.entities)) for (const e of j.entities) { const c = cleanEntity(e); if (c) d.entities.set(c.id, c); }
  if (isObj(j.settings)) {
    const s = j.settings;
    if (['m', 'mm', 'ft'].includes(s.unit)) d.settings.unit = s.unit;
    if (num(s.round)) d.settings.round = s.round;
    if (isObj(s.labels)) d.settings.labels = { unit: s.labels.unit !== false, fid: !!s.labels.fid, addr: s.labels.addr !== false };
    d.settings.power = cleanPower(s.power);
  }
  return d;
}

const FIXTURE_HALF = 300;

/** Plan bounds of one entity in world mm. */
export function entityBounds(_d: Doc, e: Entity): Bounds {
  if (e.kind === 'truss') {
    const xs = e.legs.flatMap(l => [l.a.x, l.b.x]), ys = e.legs.flatMap(l => [l.a.y, l.b.y]), h = e.boxSize / 2;
    return { min: { x: Math.min(...xs) - h, y: Math.min(...ys) - h }, max: { x: Math.max(...xs) + h, y: Math.max(...ys) + h } };
  }
  if (e.kind === 'fixture') {
    const o = e.matrix.o;
    return { min: { x: o.x - FIXTURE_HALF, y: o.y - FIXTURE_HALF }, max: { x: o.x + FIXTURE_HALF, y: o.y + FIXTURE_HALF } };
  }
  const m = e.matrix, b = e.bounds;
  if (!b) return { min: { x: m.o.x, y: m.o.y }, max: { x: m.o.x, y: m.o.y } };
  const xs: number[] = [], ys: number[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    xs.push(m.o.x + m.u.x * x + m.v.x * y + m.w.x * z); ys.push(m.o.y + m.u.y * x + m.v.y * y + m.w.y * z);
  }
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** Bounds of trusses and fixtures (reference objects only if there's nothing else). */
export function docBounds(d: Doc): Bounds | null {
  let b: Bounds | null = null;
  const grow = (e: Entity) => {
    const eb = entityBounds(d, e);
    b = b ? { min: { x: Math.min(b.min.x, eb.min.x), y: Math.min(b.min.y, eb.min.y) }, max: { x: Math.max(b.max.x, eb.max.x), y: Math.max(b.max.y, eb.max.y) } } : eb;
  };
  for (const e of d.entities.values()) if (e.kind !== 'ref') grow(e);
  if (!b) for (const e of d.entities.values()) grow(e);
  return b;
}

export { IDENTITY };
