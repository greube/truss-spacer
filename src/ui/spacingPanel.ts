import type { AppCtx } from '../tools/tool';
import type { Fixture, Truss, TrussSpacing } from '../core/model/types';
import type { Unit } from '../domain/spacing';
import { DEFAULT_SPACING } from '../core/model/types';
import { h, clear } from './dom';
import { seg, field, inputBox } from './controls';
import { setProps } from '../core/commands/ops';
import { fmt } from '../domain/spacing';
import { runMarks, runSections, runLength, markLabel, alongRun } from '../domain/runMarks';
import { respaceCommand, respacePlan, confirmCommand } from '../domain/respace';
import { spacingText, mismatchNote } from './spacingText';
import { parseLengthInput, formatLength, parseSectionsInput, formatSections } from './parse';
import { suggestSections } from '../tools/addTruss';

export interface SpacingState { showSec: boolean; done: Set<string>; sel: string | null; key: string; /** Re-space also moves fixtures well off the truss line. */ incOff?: boolean }
export interface SpacingHooks { toast(msg: string, warn?: boolean): void; exportImage(trussId: string, rows: ReturnType<typeof runMarks>, st: TrussSpacing, showSec: boolean): void }

/** The Spacing tool's panel for one truss run: marks for the LD's positions, settings, and Re-space evenly. */
export function renderSpacingPanel(el: HTMLElement, app: AppCtx, trussId: string, state: SpacingState, hooks: SpacingHooks): void {
  const t = app.doc.entities.get(trussId) as Truss | undefined;
  const body = h('div', { class: 'body' }); el.append(body);
  if (!t || t.kind !== 'truss') { body.append(h('p', { class: 'note', text: 'Tap a truss to see its tape marks.' })); return; }
  const S = app.doc.settings, unit = S.unit as Unit, U = unit === 'mm' ? 'mm' : unit === 'ft' ? 'ft' : 'm';
  const st: TrussSpacing = t.spacing ?? DEFAULT_SPACING;
  const setSt = (patch: Partial<TrussSpacing>) => app.history.exec({ ...setProps(t.id, { spacing: { ...st, ...patch } }), label: 'Spacing' });
  const f = (mm: number) => fmt(mm, false, S);
  const fixtures = [...app.doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture' && e.trussId === t.id);
  const rows = runMarks(t, fixtures, st, S);
  const key = rows.map(r => `${r.id}:${Math.round(r.s)}`).join(',');
  if (key !== state.key) { state.done.clear(); state.key = key; }
  const draft = t.state === 'draft', secs = runSections(t), L = runLength(t);

  // header
  body.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
    h('b', { text: t.name, style: { font: '600 20px var(--f-display)', textTransform: 'uppercase' } }),
    h('span', { class: 'tag' + (draft ? ' draft' : ''), text: draft ? 'Draft' : t.state === 'imported' ? 'From MVR' : 'Confirmed' }),
    h('span', { class: 'note', text: `${f(L)}${t.legs.length > 1 ? ` · ${t.legs.length} legs` : ''} · ${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'}` })));
  const mismatch = mismatchNote(t, S);
  if (mismatch) body.append(h('p', { class: 'note warn', text: mismatch + ' Fix the sections in Object Info (select the truss) or re-confirm it.' }));
  if (draft) {
    const first = fixtures.length ? Math.min(...fixtures.map(x => alongRun(t, { x: x.matrix.o.x, y: x.matrix.o.y }).s)) : 0;
    // a real truss is at least the fixture spread: suggest stock pieces for the length rounded up to a whole metre
    const secIn = inputBox(t.legs.length === 1 ? formatSections(suggestSections(Math.ceil(L / 1000) * 1000), unit) : '', () => {}, 'text');
    const gapIn = inputBox(formatLength(first, unit), () => {});
    body.append(h('div', { class: 'warnbox', style: { display: 'grid', gap: '8px', border: '1px solid var(--accent)', borderRadius: '8px', padding: '10px', color: 'var(--fg)' } },
      h('p', { class: 'note', text: 'Provisional: this truss was worked out from where the fixtures hang, so its ends are a guess. Enter its real sections and how far end A is from the first fixture, then confirm.' }),
      t.legs.length === 1 ? field(`Sections (${U})`, secIn) : h('p', { class: 'note', text: 'This run has corners: confirming keeps its shape and fills in sections. Check each leg in Object Info.' }),
      t.legs.length === 1 ? field(`End A to first (${U})`, gapIn) : null,
      h('button', { class: 'btn primary', type: 'button', text: 'Confirm truss', onclick: () => {
        const secsIn = t.legs.length === 1 ? parseSectionsInput(secIn.value, unit) : null;
        const g = parseLengthInput(gapIn.value, unit);
        if (t.legs.length === 1 && (!secsIn || !secsIn.length || g == null)) { hooks.toast('Enter the sections (e.g. 3+3+2) and the distance from end A to the first fixture.', true); return; }
        app.history.exec(confirmCommand(app.doc, t.id, secsIn, g ?? 0));
      } })));
  }

  // measure from + offset
  body.append(h('span', { class: 'note', text: 'Measure from' }),
    seg([['a', 'End A'], ['centre', 'Centre'], ['b', 'End B']], st.ref, v => setSt({ ref: v as TrussSpacing['ref'] })));
  if (st.ref !== 'b') {
    body.append(field(st.ref === 'centre' ? `Truss off centre (${U})` : `End A off your 0 (${U})`, inputBox(formatLength(st.offset, unit), v => { const n = parseLengthInput(v, unit); if (n == null || n < 0) return false; setSt({ offset: n }); })),
      seg([['before', st.ref === 'centre' ? 'Towards A' : 'Before 0'], ['after', st.ref === 'centre' ? 'Towards B' : 'Past 0']], st.offsetSide, v => setSt({ offsetSide: v as TrussSpacing['offsetSide'] })));
  }
  body.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
    h('label', { class: 'item', style: { width: 'auto', flex: '1' } }, h('input', { type: 'checkbox', checked: state.showSec, onchange: (e: Event) => { state.showSec = (e.target as HTMLInputElement).checked; rerender(); } }), h('b', { text: 'In-section distances' }), h('span')),
    h('button', { class: 'btn', type: 'button', text: 'Swap A/B', onclick: () => app.history.exec({ ...setProps(t.id, { legs: t.legs.slice().reverse().map(l => ({ a: { ...l.b }, b: { ...l.a }, sections: l.sections.slice().reverse() })) }), label: 'Swap ends' }) })));

  // marks table
  if (!rows.length) body.append(h('p', { class: 'note', text: 'No fixtures on this truss.' }));
  else {
    const table = h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
      h('thead', {}, h('tr', {}, ...['#', st.ref === 'a' ? 'From A' : st.ref === 'b' ? 'From B' : 'From centre', state.showSec ? 'In section' : null, 'Gap'].filter(Boolean).map(x =>
        h('th', { text: x as string, style: { textAlign: x === '#' ? 'left' : 'right', font: '600 11px var(--f-body)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px', borderBottom: '1px solid var(--line)' } })))),
      h('tbody', {}, ...rows.map((r, k) => {
        const flags = [r.near ? 'Near a join' : '', r.offLine != null ? `Off the line ${f(r.offLine)}` : '', r.uneven ? 'Uneven gap' : ''].filter(Boolean).join(' · ');
        const done = state.done.has(r.id), sel = state.sel === r.id;
        const tr = h('tr', { style: { cursor: 'pointer', background: sel ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : '', color: done ? 'var(--muted)' : draft ? 'var(--muted)' : '' }, onclick: () => {
          if (state.done.has(r.id)) { state.done.delete(r.id); state.sel = r.id; } else if (state.sel === r.id) state.done.add(r.id); else state.sel = r.id;
          app.selection.clear(); app.selection.add(r.id); app.requestDraw(); rerender();
        } },
          h('td', { style: { padding: '10px 6px', borderBottom: '1px solid var(--line)' } }, h('span', { text: String(r.unit ?? k + 1), style: { display: 'inline-grid', placeItems: 'center', minWidth: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${done ? 'var(--ok)' : 'var(--fg)'}`, background: done ? 'var(--ok)' : '', color: done ? 'var(--bg)' : '', font: '600 13px var(--f-num)' } })),
          h('td', { style: { textAlign: 'right', padding: '10px 6px', borderBottom: '1px solid var(--line)', font: `600 18px var(--f-num)`, fontStyle: draft ? 'italic' : '', textDecoration: done ? 'line-through' : '' } },
            markLabel(r.mark, st, S), flags ? h('span', { text: flags, style: { display: 'block', font: '600 11px var(--f-body)', color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '.04em' } }) : null),
          state.showSec ? h('td', { style: { textAlign: 'right', padding: '10px 6px', borderBottom: '1px solid var(--line)', font: '500 15px var(--f-num)' } }, f(r.off), h('span', { text: `Section ${r.sec}`, style: { display: 'block', font: '12px var(--f-body)', color: 'var(--muted)' } })) : null,
          h('td', { style: { textAlign: 'right', padding: '10px 6px', borderBottom: '1px solid var(--line)', font: '500 15px var(--f-num)' } }, r.gap != null ? f(r.gap) : '—'));
        return tr;
      })));
    body.append(h('p', { class: 'note', text: draft ? 'Provisional marks (dimmed): confirm the truss first.' : 'Tap a row to find it on the plot; tap again to tick it off.' }), h('div', { style: { overflowX: 'auto' } }, table),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn', type: 'button', text: 'Copy list', onclick: async (e: Event) => {
          const txt = spacingText({ name: t.name, sections: secs, length: L, rows, st, S, showSec: state.showSec, provisional: draft, mismatch });
          const b = e.target as HTMLButtonElement;
          try { await navigator.clipboard.writeText(txt); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
          setTimeout(() => { b.textContent = 'Copy list'; }, 1600);
        } }),
        h('button', { class: 'btn primary', type: 'button', text: 'Export image', onclick: () => hooks.exportImage(t.id, rows, st, state.showSec) })));
  }

  // re-space evenly (the backup)
  const preview = h('p', { class: 'note' });
  const inc = !!state.incOff;
  const p0 = respacePlan(app.doc, t.id, st, { includeOffLine: inc });
  const showPlan = () => {
    const p = respacePlan(app.doc, t.id, st, { includeOffLine: inc });
    const stay = p.offLine && !inc ? ` ${p.offLine} off the line stay${p.offLine === 1 ? 's' : ''} put.` : '';
    preview.textContent = p.count ? `${p.count} fixture${p.count > 1 ? 's' : ''}${p.gap != null ? `, gap ${f(p.gap)}` : ''}.${stay}${p.warning ? ' ' + p.warning : ''}` : p.warning;
    preview.className = p.warning ? 'note warn' : 'note';
  };
  showPlan();
  const incBox = p0.offLine ? h('label', { class: 'item' }, h('input', { type: 'checkbox', checked: inc, onchange: (e: Event) => { state.incOff = (e.target as HTMLInputElement).checked; rerender(); } }),
    h('b', { text: `Include ${p0.offLine} off the line` }), h('span')) : null;
  const det = h('details', { style: { borderTop: '1px solid var(--line)', paddingTop: '8px' } },
    h('summary', { text: 'Re-space evenly (moves the fixtures)', style: { cursor: 'pointer', font: '600 13px var(--f-body)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 0' } }),
    h('div', { style: { display: 'grid', gap: '8px' } },
      seg([['edge', 'Set end gaps'], ['equal', 'Equal gaps'], ['cells', 'Centred'], ['fixed', 'Fixed gap']], st.mode, v => setSt({ mode: v as TrussSpacing['mode'] })),
      st.mode === 'edge' ? field(st.diffEnds ? `End A gap (${U})` : `End gaps (${U})`, inputBox(formatLength(st.inset, unit), v => { const n = parseLengthInput(v, unit); if (n == null || n < 0) return false; setSt({ inset: n }); })) : null,
      st.mode === 'edge' && st.diffEnds ? field(`End B gap (${U})`, inputBox(formatLength(st.insetB, unit), v => { const n = parseLengthInput(v, unit); if (n == null || n < 0) return false; setSt({ insetB: n }); })) : null,
      st.mode === 'edge' ? h('label', { class: 'item' }, h('input', { type: 'checkbox', checked: st.diffEnds, onchange: (e: Event) => setSt({ diffEnds: (e.target as HTMLInputElement).checked, insetB: st.inset }) }), h('b', { text: 'Different gap each end' }), h('span')) : null,
      st.mode === 'fixed' ? field(`Gap (${U})`, inputBox(formatLength(st.gap, unit), v => { const n = parseLengthInput(v, unit); if (n == null || n <= 0) return false; setSt({ gap: n }); })) : null,
      incBox, preview,
      h('button', { class: 'btn primary', type: 'button', text: 'Apply re-space', onclick: () => {
        const r = respaceCommand(app.doc, t.id, st, { includeOffLine: inc });
        if (!r.command) { hooks.toast(r.warning || "Couldn't re-space.", true); return; }
        app.history.exec(r.command); hooks.toast(r.warning ? `Re-spaced. ${r.warning}` : 'Re-spaced. Undo puts them back where the LD had them.', !!r.warning);
      } })));
  (det as HTMLDetailsElement).open = !!(el as any).__respaceOpen;
  det.addEventListener('toggle', () => { (el as any).__respaceOpen = (det as HTMLDetailsElement).open; });
  body.append(det);

  function rerender() { const open = (el as any).__respaceOpen; clear(el); (el as any).__respaceOpen = open; renderSpacingPanel(el, app, trussId, state, hooks); }
}
