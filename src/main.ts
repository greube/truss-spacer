import './ui/theme.css';
import type { AppCtx, Tool } from './tools/tool';
import type { Entity } from './core/model/types';
import { History } from './core/commands/history';
import { GridIndex } from './core/index/grid';
import { newDoc } from './core/model/doc';
import { Camera } from './view/camera';
import { PlanRenderer } from './view/plan';
import { Gestures, wheelAction } from './view/input';
import { SelectTool } from './tools/select';
import { RotateTool } from './tools/rotate';
import { AddTrussTool } from './tools/addTruss';
import { AddFixtureTool } from './tools/addFixture';
import { MeasureTool } from './tools/measure';
import { handleKey, undo, redo, zoomToFit, pruneSelection } from './app/actions';
import { setSettings } from './core/commands/ops';
import { fmt } from './domain/spacing';
import { buildShell } from './ui/shell';
import { clear } from './ui/dom';
import { renderObjectInfo } from './ui/objectInfo';
import { renderLayers } from './ui/layers';
import { renderPositions } from './ui/positions';
import { renderHelp } from './ui/help';
import { label as typeLabel } from './domain/fixtures/db';
import { createJobs } from './ui/jobs';
import { renderReview, renderPicker } from './ui/review';
import type { Doc } from './core/model/types';

const THEME_KEY = 'trussCadTheme';
let theme: 'dark' | 'paper' = 'dark';
try { if (localStorage.getItem(THEME_KEY) === 'paper') theme = 'paper'; } catch { /* storage blocked */ }
document.documentElement.dataset.theme = theme;

const doc = newDoc();
const history = new History(doc);
const index = new GridIndex();
const camera = new Camera();
let hover: string | null = null;

const tools: Record<string, Tool> = { select: new SelectTool(), rotate: new RotateTool(), addTruss: new AddTrussTool(), addFixture: new AddFixtureTool(), measure: new MeasureTool() };
let active: Tool = tools.select;

const shell = buildShell(document.getElementById('app')!, [
  { id: 'select', icon: '↖', label: 'Select' }, { id: 'rotate', icon: '⟲', label: 'Rotate' }, { id: 'addTruss', icon: '▭', label: 'Truss' },
  { id: 'addFixture', icon: '◉', label: 'Fixture' }, { id: 'measure', icon: '⇹', label: 'Measure' },
], { id: 'more', icon: '⋯', label: 'More' }, id => app.setTool(id), () => openMore());

export const hooks = {
  openTypePicker: (ids: string[]) => openPicker(ids),
  afterChange: () => jobs.autosave(),
};

const app: AppCtx = {
  doc, history, camera, index, selection: new Set(), preview: null,
  requestDraw(rebuild) { if (rebuild) index.rebuild(app.doc); scheduleDraw(); },
  setTool(id) {
    const t = tools[id]; if (!t) return;
    active.deactivate(); active = t; t.activate(app); shell.setActiveTool(id); shell.stage.style.cursor = t.cursor; scheduleDraw();
  },
  units: { fmt: (mm: number) => fmt(mm, false, app.doc.settings) },
  visible(e: Entity) {
    const l = app.doc.layers.find(x => x.id === e.layerId), c = e.classId ? app.doc.classes.find(x => x.id === e.classId) : null;
    return (l ? l.visible : true) && (c ? c.visible : true);
  },
  previewActive: false,
  cancelPreview() { active.onDragCancel?.(); },
  notify(msg) { shell.status.msg.textContent = msg; const s = shell.phoneMsg.firstElementChild as HTMLElement; s.textContent = msg; shell.phoneMsg.hidden = !msg; },
};

const renderer = new PlanRenderer(shell.canvas, () => ({ doc: app.doc, camera, index, selection: app.selection, hover, preview: app.preview, theme }));
let frame = 0;
let lastSel = '';
function scheduleDraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0; renderer.draw();
    const sig = [...app.selection].sort().join(',');
    if (sig !== lastSel) { lastSel = sig; renderInfo(); }
    shell.undoBtn.disabled = !history.canUndo; shell.redoBtn.disabled = !history.canRedo;
  });
}

let infoSheet: { refresh(): void; close(): void } | null = null;
function renderInfo() {
  clear(shell.side.info); renderObjectInfo(shell.side.info, app, hooks);
  infoSheet?.refresh();
  const n = app.selection.size;
  shell.selbar.hidden = n === 0;
  if (n === 1) { const e = app.doc.entities.get([...app.selection][0]); shell.selWhat.textContent = e ? describe(e) : ''; }
  else shell.selWhat.textContent = `${n} selected`;
}
function describe(e: Entity): string {
  if (e.kind === 'fixture') { const t = app.doc.types.get(e.typeKey); return `${e.unitNumber != null ? '#' + e.unitNumber + ' · ' : ''}${t ? typeLabel(t) : e.name}`; }
  if (e.kind === 'truss') return `${e.name}${e.state === 'draft' ? ' (draft)' : ''}`;
  return e.name;
}
function renderPanels() {
  renderInfo();
  clear(shell.side.layers); renderLayers(shell.side.layers, app);
  clear(shell.side.positions); renderPositions(shell.side.positions, app);
  shell.unitSel.value = app.doc.settings.unit;
}

history.onChange(() => { index.rebuild(app.doc); pruneSelection(app); lastSel = '\0'; renderPanels(); scheduleDraw(); hooks.afterChange(); });

// Gestures on the plan go to the active tool; pinch and wheel always zoom
new Gestures(shell.canvas, {
  tap: (p, m) => active.onTap?.(p, m),
  longpress: (p, m) => {
    if (active.onLongPress) { active.onLongPress(p, m); return; }
    if (active.id !== 'select') { active.onTap?.(p, m); return; } // drawing tools: a held tap still places
    tools.select.onTap?.(p, m); if (app.selection.size && shell.isPhone()) openInfoSheet();
  },
  dragstart: (p, m) => active.onDragStart?.(p, m),
  drag: (p, m) => active.onDrag?.(p, m),
  dragend: (p, m) => active.onDragEnd?.(p, m),
  dragcancel: () => active.onDragCancel?.(),
  pinch: (c, s, dx, dy) => { camera.panBy(dx, dy); camera.zoomAt(c, s); scheduleDraw(); },
  wheel: (p, e) => { const a = wheelAction(e); if (a.kind === 'zoom') camera.zoomAt(p, a.factor); else camera.panBy(a.dx, a.dy); scheduleDraw(); },
  pan: (dx, dy) => { camera.panBy(dx, dy); scheduleDraw(); },
  twoFingerTap: () => { undo(app); shell.toast('Undone.'); },
  hover: (p, m) => {
    const w = camera.toWorld(p); shell.status.xy.textContent = `X ${app.units.fmt(w.x)}  Y ${app.units.fmt(w.y)}`;
    active.onHover?.(p, m);
    const id = active.id === 'select' ? index.hit(w, 12 / camera.scale, app.doc, e => app.visible(e)) : null;
    if (id !== hover) { hover = id; scheduleDraw(); }
  },
});

document.addEventListener('keydown', e => {
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (document.querySelector('.sheet')) return;
  if (active.onKey?.(e)) { e.preventDefault(); return; }
  if (e.key === '?') { openHelp(); e.preventDefault(); return; }
  if (handleKey(app, e)) e.preventDefault();
});

shell.undoBtn.onclick = () => undo(app);
shell.redoBtn.onclick = () => redo(app);
shell.fitBtn.onclick = () => zoomToFit(app);
shell.unitSel.onchange = () => history.exec(setSettings({ unit: shell.unitSel.value as 'm' | 'mm' | 'ft' }));
shell.themeBtn.onclick = () => {
  theme = theme === 'dark' ? 'paper' : 'dark'; document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* fine */ }
  shell.themeBtn.setAttribute('aria-pressed', String(theme === 'paper')); scheduleDraw();
};
shell.themeBtn.setAttribute('aria-pressed', String(theme === 'paper'));
shell.selInfo.onclick = () => openInfoSheet();

function openInfoSheet() { infoSheet = shell.openSheet('Details', el => renderObjectInfo(el, app, hooks), () => { infoSheet = null; }); }
function openHelp() { shell.openSheet('Help', el => renderHelp(el)); }
function openMore() {
  const s = shell.openSheet('More', el => {
    const b = (text: string, fn: () => void) => { const x = document.createElement('button'); x.className = 'btn'; x.type = 'button'; x.textContent = text; x.onclick = () => { s.close(); fn(); }; return x; };
    const box = document.createElement('div'); box.className = 'body';
    box.append(b('Hanging positions', () => shell.openSheet('Hanging positions', el2 => renderPositions(el2, app))),
      b('Layers & classes', () => shell.openSheet('Layers & classes', el2 => renderLayers(el2, app))),
      b('Zoom to fit', () => zoomToFit(app)), b(theme === 'paper' ? 'Dark mode' : 'Paper mode (daylight)', () => shell.themeBtn.click()), b('Help', openHelp));
    el.append(box);
  });
}

// Keep the view (centre and scale) when the screen size or orientation changes
function resize() { renderer.resize(); renderer.draw(); }
new ResizeObserver(resize).observe(shell.stage);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

/** Shows a document (a newly opened or imported job): fresh undo history, zoomed to fit. */
function setDoc(d: Doc, name: string) {
  active.onDragCancel?.();
  app.doc = d; history.reset(d); app.selection.clear(); index.rebuild(d);
  shell.jobName.textContent = name; lastSel = '\0';
  renderPanels(); renderer.resize(); zoomToFit(app);
}
let reviewSheet: { refresh(): void; close(): void } | null = null;
function openReview() { reviewSheet = shell.openSheet('Fixture types', el => renderReview(el, app, openPicker), () => { reviewSheet = null; }); }
function openPicker(ids: string[]) {
  const s = shell.openSheet('Choose fixture type', el => renderPicker(el, app, ids, () => { s.close(); reviewSheet?.refresh(); }));
}
const jobs = createJobs({ app, shell, setDoc, openReview });
shell.jobBtn.onclick = () => jobs.openSheet();

app.setTool('select');
renderPanels(); resize();
void jobs.startup();
// save straight away when the app is hidden or closed (the autosave waits 500 ms)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { app.cancelPreview?.(); void jobs.saveNow(); } });
window.addEventListener('pagehide', () => { app.cancelPreview?.(); void jobs.saveNow(); });

// Offline: only over http(s). A new version reloads once when it takes over, and is checked for when the app comes back on screen.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const hadSW = !!navigator.serviceWorker.controller; let reloaded = false;
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}); });
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (!hadSW || reloaded) return; reloaded = true;
    app.cancelPreview?.(); await jobs.saveNow(); location.reload();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {}); });
}
// For automated tests and debugging
(window as any).__cad = { app, jobs, renderer, shell, importBuffer: (buf: ArrayBuffer, name = 'Imported rig.mvr') => jobs.importFile(new Blob([buf]), name) };
