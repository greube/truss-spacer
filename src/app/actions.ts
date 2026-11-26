import type { AppCtx } from '../tools/tool';
import { removeEntities, duplicate, transform } from '../core/commands/ops';
import { translate } from '../core/geom/matrix';
import { docBounds } from '../core/model/doc';
import type { Id } from '../core/model/types';

export function deleteSelection(app: AppCtx): void {
  if (!app.selection.size) return;
  app.history.exec(removeEntities([...app.selection])); app.selection.clear(); app.requestDraw();
}

/** Copies the selection 1 m up and right, and selects the copies. */
export function duplicateSelection(app: AppCtx): void {
  if (!app.selection.size) return;
  const before = new Set(app.doc.entities.keys());
  const picked = new Set(app.selection);
  app.history.exec(duplicate([...picked], { x: 1000, y: 1000 }));
  // select the copies of what was picked (not the fixtures that came along on a copied truss)
  const fresh = [...app.doc.entities.values()].filter(e => !before.has(e.id));
  const pickedTruss = [...picked].some(id => app.doc.entities.get(id)?.kind === 'truss');
  app.selection.clear();
  for (const e of fresh) if (!(pickedTruss && e.kind === 'fixture' && e.trussId && fresh.some(t => t.id === e.trussId))) app.selection.add(e.id);
  app.requestDraw();
}

/** Moves the selection by a step: 100 mm, or 10 mm with Alt. */
export function nudge(app: AppCtx, dx: number, dy: number, fine = false): void {
  if (!app.selection.size) return;
  const k = fine ? 10 : 100;
  app.history.exec(transform([...app.selection], m => translate(m, { x: dx * k, y: dy * k, z: 0 }), 'Nudge'));
  app.requestDraw();
}

export function undo(app: AppCtx): void { app.history.undo(); pruneSelection(app); app.requestDraw(); }
export function redo(app: AppCtx): void { app.history.redo(); pruneSelection(app); app.requestDraw(); }
/** Drops deleted and hidden objects from the selection, so nothing invisible gets moved or deleted. */
export function pruneSelection(app: AppCtx): void { for (const id of [...app.selection]) { const e = app.doc.entities.get(id); if (!e || !app.visible(e)) app.selection.delete(id); } }

export function zoomToFit(app: AppCtx, ids?: Id[]): void {
  const d = app.doc;
  let b = docBounds(d);
  if (ids?.length) {
    const sub = { ...d, entities: new Map([...d.entities].filter(([id]) => ids.includes(id))) };
    b = docBounds(sub) ?? b;
  }
  if (b) app.camera.fit(b);
  app.requestDraw();
}

export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
/** Standard CAD shortcuts. Returns true when the key was used. */
export function handleKey(app: AppCtx, e: KeyLike): boolean {
  // mid-drag, shortcuts would edit underneath the live preview: only Escape (cancel) works
  if (app.previewActive) { if (e.key === 'Escape') { app.cancelPreview?.(); app.requestDraw(true); } return true; }
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.shiftKey ? redo(app) : undo(app); return true; }
  if (mod && k === 'y') { redo(app); return true; }
  if (mod && k === 'd') { duplicateSelection(app); return true; }
  if (mod && k === 'a') { app.selection.clear(); for (const e2 of app.doc.entities.values()) if (e2.kind !== 'ref' && app.visible(e2)) app.selection.add(e2.id); app.requestDraw(); return true; }
  if (mod) return false;
  if (k === 'delete' || k === 'backspace') { deleteSelection(app); return true; }
  if (k === 'escape') { app.selection.clear(); app.setTool('select'); app.requestDraw(); return true; }
  if (k === 'f') { zoomToFit(app, app.selection.size ? [...app.selection] : undefined); return true; }
  const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] };
  if (arrows[k] && app.selection.size) { nudge(app, arrows[k][0], arrows[k][1], e.altKey); return true; }
  return false;
}
