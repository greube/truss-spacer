import type { Command } from './history';
import type { Doc, Entity, Id, Fixture, Truss, FixtureType } from '../model/types';
import type { Mat } from '../geom/matrix';
import type { V2 } from '../geom/vec';
import { IDENTITY, translate } from '../geom/matrix';
import { newId } from '../model/doc';

const clone = <T>(x: T): T => structuredClone(x);

/**
 * A command over entities: compute() returns the new state of each touched id (null = removed).
 * The before and after states are captured on the first do, so undo and redo are exact.
 */
function entityCommand(label: string, compute: (d: Doc) => Map<Id, Entity | null>): Command {
  let before: Map<Id, Entity | null> | null = null, after: Map<Id, Entity | null> | null = null;
  const apply = (d: Doc, states: Map<Id, Entity | null>) => {
    for (const [id, e] of states) { if (e) d.entities.set(id, clone(e)); else d.entities.delete(id); }
  };
  return {
    label,
    do(d) {
      if (!after) {
        const next = compute(d);
        before = new Map([...next.keys()].map(id => [id, d.entities.has(id) ? clone(d.entities.get(id)!) : null]));
        after = new Map([...next].map(([id, e]) => [id, e ? clone(e) : null]));
      }
      apply(d, after);
    },
    undo(d) { if (before) apply(d, before); },
  };
}

export const addEntities = (es: Entity[]): Command =>
  entityCommand(es.length === 1 ? `Add ${es[0].kind}` : `Add ${es.length} objects`, () => new Map(es.map(e => [e.id, e])));

/** Removing a truss leaves its fixtures where they are, no longer attached. */
export const removeEntities = (ids: Id[]): Command => entityCommand(`Delete ${ids.length > 1 ? ids.length + ' objects' : ''}`.trim(), d => {
  const out = new Map<Id, Entity | null>(ids.map(id => [id, null]));
  const gone = new Set(ids);
  for (const e of d.entities.values()) if (e.kind === 'fixture' && e.trussId && gone.has(e.trussId) && !gone.has(e.id)) out.set(e.id, { ...e, trussId: null });
  return out;
});

export const setProps = (id: Id, patch: Partial<Entity>): Command => entityCommand('Change', d => {
  const e = d.entities.get(id);
  return new Map(e ? [[id, { ...e, ...patch, id, kind: e.kind } as Entity]] : []);
});

const movePoint = (f: (m: Mat) => Mat, p: { x: number; y: number; z: number }) => f(translate(IDENTITY, p)).o;

/** Applies f to each entity's matrix (truss leg points for trusses). Fixtures on a moved truss move with it. */
export const transform = (ids: Id[], f: (m: Mat) => Mat, label = 'Move'): Command => entityCommand(label, d => {
  const out = new Map<Id, Entity | null>();
  const want = new Set(ids);
  for (const e of d.entities.values()) if (e.kind === 'fixture' && e.trussId && want.has(e.trussId)) want.add(e.id);
  for (const id of want) {
    const e = d.entities.get(id); if (!e) continue;
    if (e.kind === 'truss') out.set(id, { ...e, legs: e.legs.map(l => ({ ...l, a: movePoint(f, l.a), b: movePoint(f, l.b) })) });
    else out.set(id, { ...e, matrix: f(e.matrix) });
  }
  return out;
});

/** Copies entities with new ids, offset in plan. Fixtures on a copied truss go onto the copy. */
export const duplicate = (ids: Id[], offset: V2): Command => entityCommand('Duplicate', d => {
  const out = new Map<Id, Entity | null>();
  const idMap = new Map<Id, Id>();
  const want = new Set(ids);
  for (const e of d.entities.values()) if (e.kind === 'fixture' && e.trussId && want.has(e.trussId)) want.add(e.id);
  for (const id of want) idMap.set(id, newId());
  const shift = (m: Mat) => translate(m, { x: offset.x, y: offset.y, z: 0 });
  for (const id of want) {
    const e = d.entities.get(id); if (!e) continue;
    const nid = idMap.get(id)!;
    if (e.kind === 'truss') out.set(nid, { ...clone(e), id: nid, mvrUuid: null, legs: e.legs.map(l => ({ ...l, a: movePoint(shift, l.a), b: movePoint(shift, l.b) })) });
    else if (e.kind === 'fixture') out.set(nid, { ...clone(e), id: nid, mvrUuid: null, matrix: shift(e.matrix), trussId: e.trussId && idMap.has(e.trussId) ? idMap.get(e.trussId)! : e.trussId });
    else out.set(nid, { ...clone(e), id: nid, matrix: shift(e.matrix) });
  }
  return out;
});

export function setVisibility(kind: 'layer' | 'class', id: Id, visible: boolean): Command {
  let old: boolean | null = null;
  const list = (d: Doc) => (kind === 'layer' ? d.layers : d.classes);
  return {
    label: visible ? 'Show' : 'Hide',
    do(d) { const x = list(d).find(l => l.id === id); if (!x) return; if (old === null) old = x.visible; x.visible = visible; },
    undo(d) { const x = list(d).find(l => l.id === id); if (x && old !== null) x.visible = old; },
  };
}

/** Sets the type of fixtures, adding or replacing the type's entry in the job if given. */
export function setFixtureType(ids: Id[], typeKey: string, type?: FixtureType): Command {
  const inner = entityCommand('Set fixture type', d => new Map(ids.flatMap(id => {
    const e = d.entities.get(id); return e && e.kind === 'fixture' ? [[id, { ...e, typeKey } as Fixture]] : [];
  })));
  let prevType: FixtureType | null | undefined;
  return {
    label: 'Set fixture type',
    do(d) {
      if (type) { if (prevType === undefined) prevType = d.types.has(type.key) ? clone(d.types.get(type.key)!) : null; d.types.set(type.key, clone(type)); }
      inner.do(d);
    },
    undo(d) {
      inner.undo(d);
      if (type && prevType !== undefined) { if (prevType) d.types.set(type.key, prevType); else d.types.delete(type.key); }
    },
  };
}

export type { Truss };

/** Adds a layer (used when drawing into a job that has none). */
export function addLayer(layer: { id: Id; name: string; visible: boolean }): Command {
  return {
    label: 'Add layer',
    do(d) { if (!d.layers.some(l => l.id === layer.id)) d.layers.push({ ...layer }); },
    undo(d) { const i = d.layers.findIndex(l => l.id === layer.id); if (i >= 0) d.layers.splice(i, 1); },
  };
}

/** The layer new objects go on: the given one if it exists, else the first, else a new "Plot" layer (added through History). */
export function layerForNew(history: { exec(c: Command): void; doc: Doc }, preferred?: Id | null): Id {
  const d = history.doc;
  if (preferred && d.layers.some(l => l.id === preferred)) return preferred;
  if (d.layers.length) return d.layers[0].id;
  const id = newId(); history.exec(addLayer({ id, name: 'Plot', visible: true })); return id;
}
