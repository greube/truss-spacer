import { h } from './dom';

/** Small form controls shared by the tool panels. */
export const seg = (opts: [string, string][], value: string, on: (v: string) => void) =>
  h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...opts.map(([v, label]) => h('button', { class: 'ib', type: 'button', 'aria-pressed': String(v === value), style: { flex: '1 1 0', minWidth: '0' }, onclick: () => on(v) }, label)));
export const field = (label: string, input: HTMLElement) => h('label', { class: 'row' }, h('span', { text: label }), input);
export const inputBox = (value: string, onCommit: (v: string) => boolean | void, mode = 'decimal') => {
  const el = h('input', { type: 'text', value, inputmode: mode, autocomplete: 'off', enterkeyhint: 'done' });
  el.addEventListener('change', () => { if (onCommit(el.value.trim()) === false) el.value = value; });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  return el;
};

