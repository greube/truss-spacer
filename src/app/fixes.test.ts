// Tests for the final-review fix pass (milestone 1)
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { makeApp } from '../../test/helpers/makeApp';
import { SelectTool } from '../tools/select';
import { handleKey, pruneSelection } from './actions';
import { wheelAction } from '../view/input';
import { createJobs } from '../ui/jobs';
import { loadJob, _resetForTests } from '../store/jobs';
import { setVisibility } from '../core/commands/ops';
import type { Fixture, Truss } from '../core/model/types';

const mods = { pointerType: 'touch' as const, shift: false, ctrl: false, alt: false };
const key = (k: string, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });

test('a live drag preview is flagged while applied, and cleared after end or cancel', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app);
  const s = app.camera.toScreen({ x: 500, y: 0 });
  t.onDragStart!(s, mods); t.onDrag!({ x: s.x + 40, y: s.y }, mods);
  expect(app.previewActive).toBe(true);
  t.onDragCancel!(); expect(app.previewActive).toBe(false);
  t.onDragStart!(s, mods); t.onDrag!({ x: s.x + 40, y: s.y }, mods); t.onDragEnd!({ x: s.x + 40, y: s.y }, mods);
  expect(app.previewActive).toBe(false);
});

test('shortcuts are ignored while a drag preview is applied (Escape cancels it)', () => {
  const app = makeApp(); const t = new SelectTool(); t.activate(app); (app as any).cancelPreview = () => t.onDragCancel!();
  const s = app.camera.toScreen({ x: 5400, y: 0 });
  t.onDragStart!(s, mods); t.onDrag!({ x: s.x + 40, y: s.y }, mods);
  expect(handleKey(app, key('Delete'))).toBe(true);
  expect(app.doc.entities.has('T')).toBe(true);
  handleKey(app, key('Escape'));
  expect(app.previewActive).toBe(false); expect((app.doc.entities.get('T') as Truss).legs[0].a.x).toBe(0);
});

test('hidden objects drop out of the selection', () => {
  const app = makeApp(); app.selection.add('F0');
  app.visible = e => app.doc.layers.find(l => l.id === e.layerId)!.visible;
  app.history.exec(setVisibility('layer', 'L', false)); pruneSelection(app);
  expect(app.selection.size).toBe(0);
});

test('wheel: Ctrl (trackpad pinch) and mouse notches zoom; trackpad scrolling pans', () => {
  expect(wheelAction({ deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false }).kind).toBe('zoom');
  expect(wheelAction({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false }).kind).toBe('zoom');
  expect(wheelAction({ deltaX: 0, deltaY: -4.5, deltaMode: 0, ctrlKey: true }).kind).toBe('zoom');
  expect(wheelAction({ deltaX: 12, deltaY: 3, deltaMode: 0, ctrlKey: false })).toEqual({ kind: 'pan', dx: -12, dy: -3 });
  expect(wheelAction({ deltaX: 0, deltaY: 7.5, deltaMode: 0, ctrlKey: false })).toEqual({ kind: 'pan', dx: -0, dy: -7.5 });
});

describe_jobs();
function describe_jobs() {
  beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); _resetForTests(); });
  test('autosave never stores a drag preview; it waits until the drag is over', async () => {
    const app = makeApp(); const t = new SelectTool(); t.activate(app);
    const jobs = createJobs({ app, shell: { toast() {}, jobName: { textContent: '' } } as any, setDoc() {}, openReview() {} });
    const s = app.camera.toScreen({ x: 500, y: 0 });
    t.onDragStart!(s, mods); t.onDrag!({ x: s.x + 80, y: s.y }, mods); // F0 previewed far right
    await jobs.saveNow();
    t.onDragCancel!();
    await jobs.saveNow();
    const rec = await loadJob(jobs.current.id);
    const f0 = (rec!.doc as any).entities.find((e: Fixture) => e.id === 'F0');
    expect(f0.matrix.o.x).toBe(500);
  });
}
