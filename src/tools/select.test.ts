import { test, expect } from 'vitest';
import { SelectTool } from './select';
import { deleteSelection, duplicateSelection, nudge, handleKey } from '../app/actions';
import { makeApp } from '../../test/helpers/makeApp';
import type { Fixture, Truss } from '../core/model/types';

const mods = { pointerType: 'mouse' as const, shift: false, ctrl: false, alt: false };
test('tap selects, shift-tap adds, tap on nothing clears', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 500, y: 0 }), mods); expect([...app.selection]).toEqual(['F0']);
  t.onTap!(app.camera.toScreen({ x: 1900, y: 0 }), { ...mods, shift: true }); expect([...app.selection].sort()).toEqual(['F0', 'F1']);
  t.onTap!(app.camera.toScreen({ x: 4000, y: 5000 }), mods); expect(app.selection.size).toBe(0);
});
test('dragging a truss moves it live, then commits one undoable step', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app);
  const s = app.camera.toScreen({ x: 5400, y: 0 }); // on the truss, between fixtures F3 and F4
  t.onDragStart!(s, mods);
  t.onDrag!({ x: s.x + 1000 * app.camera.scale, y: s.y }, mods);
  expect((app.doc.entities.get('T') as Truss).legs[0].a.x).toBeCloseTo(1000, 0); // live preview
  t.onDragEnd!({ x: s.x + 1000 * app.camera.scale, y: s.y }, mods);
  expect(app.historyLength()).toBe(1);
  expect((app.doc.entities.get('F0') as Fixture).matrix.o.x).toBeCloseTo(1500, 0);
  app.history.undo();
  expect((app.doc.entities.get('T') as Truss).legs[0].a.x).toBe(0); expect((app.doc.entities.get('F0') as Fixture).matrix.o.x).toBe(500);
});
test('a cancelled drag leaves everything where it was', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app);
  const s = app.camera.toScreen({ x: 5400, y: 0 }); t.onDragStart!(s, mods); t.onDrag!({ x: s.x + 50, y: s.y }, mods); t.onDragCancel!();
  expect((app.doc.entities.get('T') as Truss).legs[0].a.x).toBe(0); expect(app.historyLength()).toBe(0);
});
test('mouse box select left-to-right takes what is fully inside', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app);
  const a = app.camera.toScreen({ x: 0, y: 1000 }), b = app.camera.toScreen({ x: 3700, y: -1000 });
  t.onDragStart!(a, mods); t.onDrag!(b, mods); t.onDragEnd!(b, mods);
  expect([...app.selection].sort()).toEqual(['F0', 'F1', 'F2']);
});
test('touch drag on empty space pans', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app); const cx = app.camera.cx;
  const a = app.camera.toScreen({ x: 4000, y: 5000 }); t.onDragStart!(a, { ...mods, pointerType: 'touch' }); t.onDrag!({ x: a.x + 100, y: a.y }, { ...mods, pointerType: 'touch' });
  expect(app.camera.cx).toBeLessThan(cx); expect(app.historyLength()).toBe(0);
});
test('delete, duplicate and nudge are undoable', () => {
  const app = makeApp(); app.selection.add('F0');
  deleteSelection(app); expect(app.doc.entities.has('F0')).toBe(false); app.history.undo(); expect(app.doc.entities.has('F0')).toBe(true);
  app.selection.clear(); app.selection.add('F0'); duplicateSelection(app);
  const copies = [...app.selection]; expect(copies).toHaveLength(1); expect(copies[0]).not.toBe('F0');
  expect((app.doc.entities.get(copies[0]) as Fixture).matrix.o.x).toBe(1500);
  nudge(app, 1, 0); expect((app.doc.entities.get(copies[0]) as Fixture).matrix.o.x).toBe(1600);
});
test('keyboard shortcuts', () => {
  const app = makeApp(); app.selection.add('F0');
  expect(handleKey(app, { key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(true); expect(app.doc.entities.has('F0')).toBe(false);
  handleKey(app, { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }); expect(app.doc.entities.has('F0')).toBe(true);
  handleKey(app, { key: 'z', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }); expect(app.doc.entities.has('F0')).toBe(false);
  expect(handleKey(app, { key: 'q', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(false);
});
test('dragging a fixture snaps it onto another fixture centre', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app);
  const s = app.camera.toScreen({ x: 500, y: 0 }); t.onDragStart!(s, mods);
  const near = app.camera.toScreen({ x: 1900 + 40, y: 30 }); t.onDrag!(near, mods); t.onDragEnd!(near, mods);
  expect((app.doc.entities.get('F0') as Fixture).matrix.o.x).toBeCloseTo(1900, 6);
});
