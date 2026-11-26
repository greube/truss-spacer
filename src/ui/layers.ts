import type { AppCtx } from '../tools/tool';
import { h } from './dom';
import { setVisibility } from '../core/commands/ops';

export function renderLayers(el: HTMLElement, app: AppCtx): void {
  const d = app.doc;
  const counts = new Map<string, number>();
  for (const e of d.entities.values()) { counts.set(e.layerId, (counts.get(e.layerId) ?? 0) + 1); if (e.classId) counts.set('c:' + e.classId, (counts.get('c:' + e.classId) ?? 0) + 1); }
  const list = (kind: 'layer' | 'class', items: { id: string; name: string; visible: boolean }[], key: (id: string) => string) =>
    h('div', { class: 'list' }, ...items.map(it => h('label', { class: 'item' },
      h('input', { type: 'checkbox', checked: it.visible, onchange: (ev: Event) => app.history.exec(setVisibility(kind, it.id, (ev.target as HTMLInputElement).checked)) }),
      h('b', { text: it.name || '(unnamed)' }), h('small', { text: String(counts.get(key(it.id)) ?? 0) }))));
  el.append(h('div', { class: 'body' },
    d.layers.length ? list('layer', d.layers, id => id) : h('p', { class: 'note', text: 'No layers yet.' }),
    d.classes.length ? h('p', { class: 'note', text: 'Classes' }) : null,
    d.classes.length ? list('class', d.classes, id => 'c:' + id) : null));
}
