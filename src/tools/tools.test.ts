import { test, expect } from 'vitest';
import { RotateTool } from './rotate';
import { AddTrussTool, suggestSections } from './addTruss';
import { AddFixtureTool } from './addFixture';
import { MeasureTool } from './measure';
import { makeApp } from '../../test/helpers/makeApp';
import type { Fixture, Truss } from '../core/model/types';

const mods = { pointerType: 'mouse' as const, shift: false, ctrl: false, alt: false };
const trussCount = (app: ReturnType<typeof makeApp>) => [...app.doc.entities.values()].filter(e => e.kind === 'truss').length;

test('suggested sections from stock lengths', () => {
  expect(suggestSections(8000)).toEqual([3000, 3000, 2000]);
  expect(suggestSections(7250)).toEqual([3000, 3000, 1000, 500]);
  expect(suggestSections(0)).toEqual([]);
});

test('add truss: three taps then Enter makes one truss with two legs, in one undo step', () => {
  const app = makeApp(); const t = new AddTrussTool(); t.activate(app);
  for (const p of [{ x: 0, y: 6000 }, { x: 6000, y: 6000 }, { x: 6000, y: 10000 }]) t.onTap!(app.camera.toScreen(p), mods);
  expect(t.onKey!({ key: 'Enter' })).toBe(true);
  expect(trussCount(app)).toBe(2);
  const added = [...app.doc.entities.values()].find(e => e.kind === 'truss' && e.id !== 'T') as Truss;
  expect(added.legs).toHaveLength(2); expect(added.state).toBe('confirmed'); expect(added.boxSize).toBe(300);
  expect(added.legs[0].sections).toEqual([3000, 3000]); expect(added.legs[0].a.z).toBe(6000);
  expect(app.historyLength()).toBe(1);
  app.history.undo(); expect(trussCount(app)).toBe(1);
});
test('add truss: tapping the last point again finishes; Escape cancels', () => {
  const app = makeApp(); const t = new AddTrussTool(); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 0, y: 6000 }), mods); t.onTap!(app.camera.toScreen({ x: 4000, y: 6000 }), mods); t.onTap!(app.camera.toScreen({ x: 4000, y: 6000 }), mods);
  expect(trussCount(app)).toBe(2);
  t.onTap!(app.camera.toScreen({ x: 0, y: 9000 }), mods); t.onKey!({ key: 'Escape' }); t.onKey!({ key: 'Enter' });
  expect(trussCount(app)).toBe(2);
});
test('add fixture onto a truss: on the leg, facing along it, next unit number', () => {
  const app = makeApp(); const t = new AddFixtureTool(); t.activate(app); t.currentType = 't';
  t.onTap!(app.camera.toScreen({ x: 7600, y: 150 }), mods);
  const added = [...app.doc.entities.values()].find(e => e.kind === 'fixture' && !/^F\d$/.test(e.id)) as Fixture;
  expect(added.trussId).toBe('T'); expect(added.matrix.o.y).toBeCloseTo(0); expect(added.matrix.o.x).toBeCloseTo(7600); expect(added.matrix.o.z).toBe(8000);
  expect(added.unitNumber).toBe(7); expect(added.typeKey).toBe('t');
});
test('add fixture in open space is free-standing', () => {
  const app = makeApp(); const t = new AddFixtureTool(); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 3000, y: 5000 }), mods);
  const added = [...app.doc.entities.values()].find(e => e.kind === 'fixture' && !/^F\d$/.test(e.id)) as Fixture;
  expect(added.trussId).toBeNull();
});
test('add to an empty job creates a layer too, undone together', () => {
  const app = makeApp(); app.doc.layers.length = 0; const t = new AddFixtureTool(); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 3000, y: 5000 }), mods);
  expect(app.doc.layers.map(l => l.name)).toEqual(['Plot']);
  app.history.undo(); expect(app.doc.layers).toHaveLength(0);
});
test('rotate 90° about the pivot, then undo', () => {
  const app = makeApp(); app.selection.add('F0'); app.selection.add('F1');
  const t = new RotateTool(); t.activate(app); t.pivot = { x: 0, y: 0 };
  t.onDragStart!(app.camera.toScreen({ x: 1000, y: 0 }), mods); t.onDrag!(app.camera.toScreen({ x: 0, y: 1000 }), mods); t.onDragEnd!(app.camera.toScreen({ x: 0, y: 1000 }), mods);
  const f = app.doc.entities.get('F0') as Fixture;
  expect(f.matrix.o.x).toBeCloseTo(0, 6); expect(f.matrix.o.y).toBeCloseTo(500, 6);
  app.history.undo(); expect((app.doc.entities.get('F0') as Fixture).matrix.o.x).toBe(500);
});
test('rotate snaps to 15°', () => {
  const app = makeApp(); app.selection.add('F0'); const t = new RotateTool(); t.activate(app); t.pivot = { x: 0, y: 0 };
  const deg = 47 * Math.PI / 180;
  t.onDragStart!(app.camera.toScreen({ x: 1000, y: 0 }), mods); t.onDragEnd!(app.camera.toScreen({ x: 1000 * Math.cos(deg), y: 1000 * Math.sin(deg) }), mods);
  const f = app.doc.entities.get('F0') as Fixture;
  expect(Math.atan2(f.matrix.o.y, f.matrix.o.x) * 180 / Math.PI).toBeCloseTo(45, 6);
});
test('measure never changes the document', () => {
  const app = makeApp(); const t = new MeasureTool(); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 0, y: 0 }), mods); t.onTap!(app.camera.toScreen({ x: 3000, y: 4000 }), mods);
  expect(t.result?.distance).toBeCloseTo(5000, 0); expect(app.historyLength()).toBe(0);
});
