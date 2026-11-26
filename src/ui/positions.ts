import type { AppCtx } from '../tools/tool';
import type { Fixture, Truss } from '../core/model/types';
import { h } from './dom';
import { zoomToFit } from '../app/actions';

export function renderPositions(el: HTMLElement, app: AppCtx, after?: () => void): void {
  const d = app.doc;
  const fx = [...d.entities.values()].filter((e): e is Fixture => e.kind === 'fixture');
  const tr = [...d.entities.values()].filter((e): e is Truss => e.kind === 'truss');
  if (!d.positions.length) { el.append(h('div', { class: 'body' }, h('p', { class: 'note', text: 'No hanging positions in this job.' }))); return; }
  el.append(h('div', { class: 'body' }, h('div', { class: 'list' }, ...d.positions.map(p => {
    const mine = fx.filter(f => f.positionId === p.id), trusses = tr.filter(t => t.positionId === p.id);
    const state = trusses.length ? (trusses.some(t => t.state === 'draft') ? 'draft' : 'truss') : 'floor';
    return h('button', { class: 'item', type: 'button', onclick: () => {
      app.selection.clear(); for (const t of trusses) app.selection.add(t.id); for (const f of mine) app.selection.add(f.id);
      zoomToFit(app, [...app.selection]); after?.();
    } },
      h('span', { class: 'tag' + (state === 'draft' ? ' draft' : ''), text: state === 'draft' ? 'Draft' : state === 'truss' ? 'Truss' : 'No truss' }),
      h('b', { text: p.name }), h('small', { text: `${mine.length} fx` }));
  }))));
}
