import { h, clear } from './dom';

export interface ToolButton { id: string; icon: string; label: string; /** Laptop palette only; on a phone it lives in More. */ lapOnly?: boolean }
export interface Shell {
  root: HTMLElement; stage: HTMLElement; canvas: HTMLCanvasElement;
  jobBtn: HTMLButtonElement; jobName: HTMLElement; undoBtn: HTMLButtonElement; redoBtn: HTMLButtonElement;
  unitSel: HTMLSelectElement; themeBtn: HTMLButtonElement; fitBtn: HTMLButtonElement;
  side: { info: HTMLElement; layers: HTMLElement; positions: HTMLElement; spacing: HTMLElement; spacingSec: HTMLElement; power: HTMLElement; powerSec: HTMLElement };
  status: { xy: HTMLElement; msg: HTMLElement };
  phoneMsg: HTMLElement; selbar: HTMLElement; selWhat: HTMLElement; selInfo: HTMLButtonElement;
  setActiveTool(id: string): void;
  openSheet(title: string, render: (el: HTMLElement) => void, onClose?: () => void): { refresh(): void; close(): void };
  toast(msg: string, warn?: boolean): void;
  isPhone(): boolean;
}

/** Builds the CAD layout: top bar, tool palette (laptop) or tool bar (phone), canvas, side panels, status line. */
export function buildShell(root: HTMLElement, tools: ToolButton[], phoneExtra: ToolButton, onTool: (id: string) => void, onMore: () => void): Shell {
  clear(root);
  const canvas = h('canvas', { 'aria-label': 'Plot. Pinch or scroll to zoom, drag to pan or move.' });
  const stage = h('div', { class: 'stage' }, canvas);
  const phoneMsg = h('div', { class: 'phone-msg', hidden: true }, h('span'));
  stage.append(phoneMsg);
  const jobName = h('b', { text: 'New job' });
  const jobBtn = h('button', { class: 'job', type: 'button', 'aria-haspopup': 'dialog' }, h('small', { text: 'Job' }), jobName, h('small', { text: '▾' }));
  const undoBtn = h('button', { class: 'ib', type: 'button', title: 'Undo (Ctrl Z)', 'aria-label': 'Undo', text: '↶' });
  const redoBtn = h('button', { class: 'ib', type: 'button', title: 'Redo (Ctrl Shift Z)', 'aria-label': 'Redo', text: '↷' });
  const fitBtn = h('button', { class: 'ib lap', type: 'button', title: 'Zoom to fit (F)', 'aria-label': 'Zoom to fit', text: '⤢' });
  const unitSel = h('select', { class: 'ib', 'aria-label': 'Units', title: 'Units' }, h('option', { value: 'm', text: 'm' }), h('option', { value: 'mm', text: 'mm' }), h('option', { value: 'ft', text: 'ft' }));
  const themeBtn = h('button', { class: 'ib lap', type: 'button', title: 'Paper mode (light, for daylight)', 'aria-label': 'Paper mode', text: 'Paper' });
  const top = h('header', { class: 'top' }, h('div', { class: 'brand' }, 'Truss ', h('span', { text: 'CAD' })), jobBtn, undoBtn, redoBtn, fitBtn, unitSel, themeBtn);

  const btn = (t: ToolButton, cls = 'ib') => h('button', { class: cls, type: 'button', 'data-tool': t.id, 'aria-pressed': 'false', title: t.label, onclick: () => (t.id === 'more' ? onMore() : onTool(t.id)) }, h('i', { text: t.icon }), t.label);
  const palette = h('nav', { class: 'palette', 'aria-label': 'Tools' }, ...tools.map(t => btn(t)));
  const toolbar = h('nav', { class: 'tools', 'aria-label': 'Tools' }, ...tools.filter(t => !t.lapOnly).map(t => btn(t)), btn(phoneExtra));
  const section = (title: string) => { const body = h('div'); return { el: h('section', { class: 'sec' }, h('h3', { text: title }), body), body }; };
  const info = section('Object info'), layers = section('Layers & classes'), positions = section('Hanging positions'), spacing = section('Spacing'), power = section('Power');
  spacing.el.hidden = true; spacing.el.classList.add('spacing-sec');
  power.el.hidden = true; power.el.classList.add('power-sec');
  const side = h('aside', { class: 'side' }, spacing.el, power.el, info.el, positions.el, layers.el);
  const xy = h('span', { text: '' }), msg = h('span', { class: 'msg', text: '' });
  const status = h('footer', { class: 'status' }, xy, msg);
  const selWhat = h('span', { class: 'what', text: '' });
  const selInfo = h('button', { class: 'btn', type: 'button', text: 'Details' });
  const selbar = h('div', { class: 'selbar', hidden: true }, selWhat, selInfo);
  root.append(top, palette, stage, side, status, selbar, toolbar);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const shell: Shell = {
    root, stage, canvas, jobBtn, jobName, undoBtn, redoBtn, unitSel, themeBtn, fitBtn,
    side: { info: info.body, layers: layers.body, positions: positions.body, spacing: spacing.body, spacingSec: spacing.el, power: power.body, powerSec: power.el },
    status: { xy, msg }, phoneMsg, selbar, selWhat, selInfo,
    setActiveTool(id) { root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-tool') === id))); },
    openSheet(title, render, onClose) {
      const content = h('div', { class: 'content' });
      const close = () => { sheet.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
      const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: (e: Event) => { if (e.target === sheet) close(); } },
        h('div', { class: 'box' }, h('div', { class: 'head' }, h('h2', { text: title }), h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close })), content));
      document.body.append(sheet); document.addEventListener('keydown', esc);
      const refresh = () => { clear(content); render(content); };
      refresh();
      return { refresh, close };
    },
    toast(text, warn = false) {
      document.querySelectorAll('.toast').forEach(t => t.remove());
      const t = h('div', { class: 'toast' + (warn ? ' warn' : ''), role: 'status', text });
      document.body.append(t); if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), warn ? 6000 : 3000);
    },
    isPhone() { return window.matchMedia('(max-width: 899px)').matches; },
  };
  return shell;
}
