import type { AppCtx } from '../tools/tool';
import type { Fixture, FixtureType } from '../core/model/types';
import type { DbType } from '../domain/fixtures/db';
import { h, clear } from './dom';
import { matchType } from '../domain/fixtures/match';
import { search, mine, addMine, label, SRC_LABEL } from '../domain/fixtures/db';
import { categorise } from '../domain/fixtures/category';
import { updateType, setFixtureType } from '../core/commands/ops';

const usage = (app: AppCtx) => {
  const m = new Map<string, Fixture[]>();
  for (const e of app.doc.entities.values()) if (e.kind === 'fixture') { if (!m.has(e.typeKey)) m.set(e.typeKey, []); m.get(e.typeKey)!.push(e); }
  return m;
};
const fromDb = (t: DbType): FixtureType => ({ key: t.key, m: t.m, n: t.n, w: t.w, src: t.src, url: t.url, gdtfSpec: '', mode: '', category: categorise(t.m, t.n) });
const wattsLine = (t: { w: number | null; src: string | null }) => (t.w != null ? `${t.w} W · ${SRC_LABEL[t.src ?? ''] ?? ''}` : 'No wattage');

/** One type in the review: what we know, and how to fix it. */
function typeCard(app: AppCtx, t: FixtureType, fx: Fixture[], refresh: () => void, openPicker: (ids: string[]) => void): HTMLElement {
  const r = t.w == null ? matchType(t, fx[0]?.name ?? '') : null;
  const status = t.w != null ? 'ok' : r!.candidates.length ? 'check' : 'unknown';
  const head = h('div', { class: 'item', style: { gridTemplateColumns: 'auto minmax(0,1fr) auto' } },
    h('span', { class: 'tag' + (status === 'ok' ? '' : ' draft'), text: status === 'ok' ? 'OK' : status === 'check' ? 'Check' : 'Unknown' }),
    h('b', { text: label(t) || t.key }), h('small', { text: `${fx.length} fx` }));
  const body = h('div', { class: 'list', style: { padding: '0 8px 10px 8px' } });
  if (status === 'ok') {
    body.append(h('p', { class: 'note', text: wattsLine(t) }), h('button', { class: 'btn', type: 'button', text: 'Change…', onclick: () => openPicker(fx.map(f => f.id)) }));
  } else {
    if (r!.candidates.length) body.append(h('p', { class: 'note', text: 'Is it one of these?' }),
      ...r!.candidates.map(c => h('button', { class: 'btn', type: 'button', style: { textAlign: 'left' }, onclick: () => { app.history.exec(updateType(t.key, { w: c.w, src: c.src, url: c.url, category: t.category !== 'generic' ? t.category : categorise(c.m, c.n) })); refresh(); } },
        `${label(c)} · ${c.w} W`)));
    const w = h('input', { type: 'number', inputmode: 'numeric', min: '1', placeholder: 'Max watts', style: { minHeight: '42px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', width: '100%' } });
    body.append(h('p', { class: 'note', text: status === 'check' ? 'None of these? Enter the maximum watts from the spec sheet, or search.' : 'Not in the database. Enter the maximum watts from the spec sheet, or search.' }),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px' } }, w,
        h('button', { class: 'btn primary', type: 'button', text: 'Set', onclick: () => { const v = Math.round(+w.value); if (!(v > 0 && v < 100000)) { w.focus(); return; } app.history.exec(updateType(t.key, { w: v, src: 'j' })); refresh(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Search', onclick: () => openPicker(fx.map(f => f.id)) })));
  }
  return h('div', { style: { borderBottom: '1px solid var(--line)' } }, head, body);
}

/** Every fixture type in the job, the ones needing attention first. */
export function renderReview(el: HTMLElement, app: AppCtx, openPicker: (ids: string[]) => void): void {
  const refresh = () => { clear(el); renderReview(el, app, openPicker); };
  const u = usage(app);
  const types = [...u.keys()].map(k => app.doc.types.get(k)).filter((t): t is FixtureType => !!t);
  const need = types.filter(t => t.w == null), ok = types.filter(t => t.w != null);
  const nFx = (ts: FixtureType[]) => ts.reduce((s, t) => s + (u.get(t.key)?.length ?? 0), 0);
  el.append(h('div', { class: 'body' }, h('p', { class: need.length ? 'note warn' : 'note', text: need.length
    ? `${need.length} type${need.length > 1 ? 's' : ''} (${nFx(need)} fixtures) need a wattage. Power can't be worked out for those until they have one.`
    : `All ${types.length} types have a wattage.` }),
  h('p', { class: 'note', text: 'Wattages come from manufacturer spec sheets where we have them. Check anything you have entered yourself.' })));
  for (const t of [...need, ...ok].sort((a, b) => Number(a.w != null) - Number(b.w != null) || (u.get(b.key)!.length - u.get(a.key)!.length))) el.append(typeCard(app, t, u.get(t.key)!, refresh, openPicker));
}

/** Choose a type from the database / my fixtures / add your own, for some fixtures or for their whole type. */
export function renderPicker(el: HTMLElement, app: AppCtx, ids: string[], done: () => void): void {
  const fx = ids.map(id => app.doc.entities.get(id)).filter((e): e is Fixture => !!e && e.kind === 'fixture');
  if (!fx.length) { el.append(h('div', { class: 'body' }, h('p', { class: 'note', text: 'No fixtures selected.' }))); return; }
  const keys = new Set(fx.map(f => f.typeKey)), oneType = keys.size === 1 ? app.doc.types.get([...keys][0]) : undefined;
  const allOfType = oneType ? [...app.doc.entities.values()].filter(e => e.kind === 'fixture' && e.typeKey === oneType.key).length : 0;
  let scope: 'type' | 'these' = oneType && oneType.w == null ? 'type' : 'these';
  const scopeBox = h('div', { class: 'list' });
  const drawScope = () => {
    clear(scopeBox);
    if (!oneType) { scopeBox.append(h('p', { class: 'note', text: `Changes the type of the ${fx.length} selected fixtures.` })); return; }
    for (const [v, text] of [['type', `Every “${label(oneType)}” in the job (${allOfType}): set its wattage`], ['these', `Just the ${fx.length} selected: change to a different fixture`]] as const)
      scopeBox.append(h('label', { class: 'item' }, h('input', { type: 'radio', name: 'scope', checked: scope === v, onchange: () => { scope = v; } }), h('b', { text, style: { whiteSpace: 'normal' } }), h('span')));
  };
  drawScope();
  const apply = (t: DbType) => {
    if (scope === 'type' && oneType) app.history.exec(updateType(oneType.key, { w: t.w, src: t.src, url: t.url }));
    else app.history.exec(setFixtureType(fx.map(f => f.id), t.key, fromDb(t)));
    done();
  };
  const results = h('div', { class: 'list' });
  const q = h('input', { type: 'search', placeholder: 'Search, e.g. MegaPointe, Aura, PAR64', autocomplete: 'off', enterkeyhint: 'search',
    style: { minHeight: '46px', width: '100%', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', fontSize: '17px' } });
  const item = (t: DbType) => h('button', { class: 'item', type: 'button', onclick: () => apply(t) }, h('span', { class: 'tag', text: t.src === 'm' ? 'Mine' : t.src === 'o' ? 'OFL' : 'Spec' }), h('b', { text: label(t) }), h('small', { text: `${t.w} W` }));
  const draw = () => {
    clear(results);
    const term = q.value.trim();
    const list = term ? search(term, 40) : mine().slice(0, 20);
    if (!term) results.append(h('p', { class: 'note', text: list.length ? 'My fixtures' : 'Type to search 780 fixtures by model or manufacturer.' }));
    if (term && !list.length) results.append(h('p', { class: 'note', text: `Nothing found for “${term}”. Try just the model name, or add it below.` }));
    results.append(...list.map(item));
  };
  q.addEventListener('input', draw);
  const m = h('input', { type: 'text', placeholder: 'Manufacturer' }), n = h('input', { type: 'text', placeholder: 'Model' }), w = h('input', { type: 'number', inputmode: 'numeric', placeholder: 'Max watts' });
  for (const x of [m, n, w]) Object.assign(x.style, { minHeight: '42px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', width: '100%' });
  const add = h('details', {}, h('summary', { class: 'note', text: 'Not listed? Add your own', style: { cursor: 'pointer', padding: '6px 0' } }),
    h('div', { style: { display: 'grid', gap: '6px' } }, m, n, w, h('button', { class: 'btn primary', type: 'button', text: 'Add and use', onclick: () => {
      const watts = Math.round(+w.value); if (!n.value.trim() || !(watts > 0 && watts < 100000)) { n.focus(); return; }
      apply(addMine(m.value, n.value, watts));
    } }), h('p', { class: 'note', text: 'Saved on this device for future jobs. Use the maximum power from the spec sheet.' })));
  el.append(h('div', { class: 'body' }, scopeBox, q, results, add));
  draw(); setTimeout(() => q.focus(), 50);
}
