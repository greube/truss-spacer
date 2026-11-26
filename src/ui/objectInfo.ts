import type { AppCtx } from '../tools/tool';
import type { Entity, Fixture, Truss, Leg } from '../core/model/types';
import type { Unit } from '../domain/spacing';
import { h } from './dom';
import { setProps, transform } from '../core/commands/ops';
import { translate, withYaw, yawOf } from '../core/geom/matrix';
import { formatUA } from '../core/geom/address';
import { parseUA, parseLengthInput, formatLength, parseSectionsInput, formatSections } from './parse';
import { suggestSections } from '../tools/addTruss';
import { label as typeLabel, SRC_LABEL } from '../domain/fixtures/db';

export interface InfoHooks { openTypePicker(ids: string[]): void }

const legLen = (l: Leg) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10;

function field(labelText: string, input: HTMLElement): HTMLElement { return h('label', { class: 'row' }, h('span', { text: labelText }), input); }
function ro(labelText: string, value: string): HTMLElement { return h('div', { class: 'row' }, h('span', { text: labelText }), h('div', { class: 'ro', text: value })); }
/** Text input that calls commit(value) on change/Enter; commit returns false to reject (field resets). */
function input(value: string, commit: (v: string) => boolean | void, opts: { mode?: string; cls?: string; placeholder?: string } = {}): HTMLInputElement {
  const el = h('input', { type: 'text', value, inputmode: opts.mode ?? 'decimal', autocomplete: 'off', class: opts.cls ?? '', placeholder: opts.placeholder ?? '', enterkeyhint: 'done' });
  const go = () => { if (el.value === value) return; if (commit(el.value.trim()) === false) { el.value = value; el.animate?.([{ outline: '2px solid #ff6b4a' }, { outline: 'none' }], 600); } };
  el.addEventListener('change', go);
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } });
  return el;
}

export function renderObjectInfo(el: HTMLElement, app: AppCtx, hooks: InfoHooks): void {
  const d = app.doc, unit = d.settings.unit as Unit;
  const sel = [...app.selection].map(id => d.entities.get(id)).filter((e): e is Entity => !!e);
  const body = h('div', { class: 'body' });
  el.append(body);
  if (!sel.length) { body.append(h('p', { class: 'note', text: 'Nothing selected. Tap a fixture or truss to see and edit its details.' })); return; }
  const L = (mm: number) => formatLength(mm, unit), U = unit === 'mm' ? 'mm' : unit === 'ft' ? 'ft' : 'm';
  const lenInput = (mm: number, commit: (v: number) => void) => input(L(mm), v => { const n = parseLengthInput(v, unit); if (n == null) return false; commit(n); });

  if (sel.length > 1) {
    const fx = sel.filter((e): e is Fixture => e.kind === 'fixture'), tr = sel.filter(e => e.kind === 'truss');
    body.append(h('p', { class: 'note', text: `${sel.length} selected: ${fx.length} fixture${fx.length === 1 ? '' : 's'}, ${tr.length} truss${tr.length === 1 ? '' : 'es'}.` }));
    if (fx.length) {
      const keys = new Set(fx.map(f => f.typeKey));
      body.append(field('Type', h('button', { class: 'btn', type: 'button', text: keys.size === 1 ? typeLabel(d.types.get([...keys][0])) || 'Choose…' : 'Mixed — choose…', onclick: () => hooks.openTypePicker(fx.map(f => f.id)) })));
      const yaws = new Set(fx.map(f => deg(yawOf(f.matrix))));
      body.append(field('Rotation °', input(yaws.size === 1 ? String([...yaws][0]) : '', v => {
        const a = parseFloat(v); if (!Number.isFinite(a)) return false;
        app.history.begin('Rotate'); for (const f of fx) app.history.exec(setProps(f.id, { matrix: withYaw(f.matrix, (a * Math.PI) / 180) })); app.history.end();
      }, { placeholder: 'mixed' })));
    }
    return;
  }

  const e = sel[0];
  body.append(field('Name', input(e.name, v => { app.history.exec(setProps(e.id, { name: v })); }, { mode: 'text', cls: 'name' })));
  const layer = d.layers.find(l => l.id === e.layerId)?.name ?? '—';

  if (e.kind === 'fixture') {
    const t = d.types.get(e.typeKey);
    const tb = h('button', { class: 'btn', type: 'button', onclick: () => hooks.openTypePicker([e.id]) }, t ? typeLabel(t) : 'Choose type…');
    body.append(field('Type', tb));
    body.append(h('p', { class: t?.w == null ? 'note warn' : 'note', text: t?.w != null ? `${t.w} W · ${SRC_LABEL[t.src ?? ''] ?? ''}` : 'No wattage yet: choose the type from the database or enter its watts.' }));
    const o = e.matrix.o;
    const moveTo = (p: { x?: number; y?: number; z?: number }) => app.history.exec(setProps(e.id, { matrix: translate(e.matrix, { x: (p.x ?? o.x) - o.x, y: (p.y ?? o.y) - o.y, z: (p.z ?? o.z) - o.z }) }));
    body.append(field(`X (${U})`, lenInput(o.x, x => moveTo({ x }))), field(`Y (${U})`, lenInput(o.y, y => moveTo({ y }))), field(`Height (${U})`, lenInput(o.z, z => moveTo({ z }))));
    body.append(field('Rotation °', input(String(deg(yawOf(e.matrix))), v => { const a = parseFloat(v); if (!Number.isFinite(a)) return false; app.history.exec(setProps(e.id, { matrix: withYaw(e.matrix, (a * Math.PI) / 180) })); })));
    body.append(field('Unit number', input(e.unitNumber == null ? '' : String(e.unitNumber), v => { if (v === '') { app.history.exec(setProps(e.id, { unitNumber: null })); return; } const n = parseInt(v, 10); if (!(n >= 0)) return false; app.history.exec(setProps(e.id, { unitNumber: n })); }, { mode: 'numeric' })));
    body.append(field('Fixture ID', input(e.fixtureId, v => { app.history.exec(setProps(e.id, { fixtureId: v })); }, { mode: 'text' })));
    body.append(field('Address', input(e.address == null ? '' : formatUA(e.address), v => { if (v === '') { app.history.exec(setProps(e.id, { address: null })); return; } const a = parseUA(v); if (a == null) return false; app.history.exec(setProps(e.id, { address: a })); }, { placeholder: 'U.A, e.g. 10.133' })));
    const pos = h('select', { onchange: (ev: Event) => { const v = (ev.target as HTMLSelectElement).value; app.history.exec(setProps(e.id, { positionId: v || null })); } },
      h('option', { value: '', text: '— none —' }), ...d.positions.map(p => h('option', { value: p.id, text: p.name, selected: p.id === e.positionId })));
    body.append(field('Position', pos));
    const tr = e.trussId ? (d.entities.get(e.trussId) as Truss | undefined) : undefined;
    body.append(ro('On truss', tr ? tr.name : '—'), ro('Layer', layer));
    return;
  }

  if (e.kind === 'truss') {
    body.append(h('div', { class: 'row' }, h('span', { text: 'State' }), h('div', {}, h('span', { class: 'tag' + (e.state === 'draft' ? ' draft' : ''), text: e.state === 'draft' ? 'Draft' : e.state === 'imported' ? 'From MVR' : 'Confirmed' }))));
    if (e.state === 'draft') {
      body.append(h('p', { class: 'note', text: 'Worked out from where the fixtures hang. Check the length and sections, then confirm. Marks from a draft truss are only provisional.' }));
      body.append(h('button', { class: 'btn primary', type: 'button', text: 'Confirm truss', onclick: () => app.history.exec(setProps(e.id, { state: 'confirmed', legs: e.legs.map(l => ({ ...l, sections: l.sections.length ? l.sections : suggestSections(legLen(l)) })) })) }));
    }
    const sizes = [290, 300, 400, 520];
    body.append(field('Box size', h('select', { onchange: (ev: Event) => app.history.exec(setProps(e.id, { boxSize: +(ev.target as HTMLSelectElement).value })) },
      ...Array.from(new Set([...sizes, e.boxSize])).sort((a, b) => a - b).map(s => h('option', { value: String(s), text: `${s} mm`, selected: s === e.boxSize })))));
    const total = e.legs.reduce((s, l) => s + legLen(l), 0);
    body.append(ro('Length', `${L(total)} ${U}${e.legs.length > 1 ? ` (${e.legs.length} legs)` : ''}`));
    const a0 = e.legs[0].a;
    const shift = (p: { x?: number; y?: number }) => app.history.exec(transform([e.id], m => translate(m, { x: (p.x ?? a0.x) - a0.x, y: (p.y ?? a0.y) - a0.y, z: 0 })));
    body.append(field(`Start X (${U})`, lenInput(a0.x, x => shift({ x }))), field(`Start Y (${U})`, lenInput(a0.y, y => shift({ y }))));
    body.append(field(`Trim (${U})`, lenInput(a0.z, z => app.history.exec(setProps(e.id, { legs: e.legs.map(l => ({ ...l, a: { ...l.a, z }, b: { ...l.b, z } })) })))));
    e.legs.forEach((l, i) => {
      const secTotal = l.sections.reduce((s, x) => s + x, 0);
      body.append(field(e.legs.length > 1 ? `Leg ${i + 1} sections` : 'Sections', input(formatSections(l.sections, unit), v => {
        const secs = parseSectionsInput(v, unit); if (secs == null) return false;
        app.history.exec(setProps(e.id, { legs: e.legs.map((x, k) => (k === i ? { ...x, sections: secs } : x)) }));
      }, { placeholder: unit === 'm' ? 'e.g. 3+3+2' : '', mode: 'text' })));
      if (l.sections.length && Math.abs(secTotal - legLen(l)) > 5) body.append(h('p', { class: 'note warn', text: `Sections add up to ${L(secTotal)} ${U}; this leg is ${L(legLen(l))} ${U} on the plot.` }));
    });
    const n = [...d.entities.values()].filter(x => x.kind === 'fixture' && x.trussId === e.id).length;
    body.append(ro('Fixtures', String(n)), ro('Position', d.positions.find(p => p.id === e.positionId)?.name ?? '—'), ro('Layer', layer));
    return;
  }

  body.append(ro('Kind', 'Reference object (from the MVR)'), ro('Layer', layer));
}
