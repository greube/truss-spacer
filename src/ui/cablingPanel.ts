import type { AppCtx } from '../tools/tool';
import type { RigCabling, CableRun } from '../domain/cabling';
import { h } from './dom';
import { seg } from './controls';
import { setProps } from '../core/commands/ops';
import { fmt } from '../domain/spacing';
import { cablingText, metres } from './cablingText';
import { fixtureNums } from './powerText';

export interface CablingHooks { toast(msg: string, warn?: boolean): void; pick(group: string | null): void; jobName(): string }

const tally = (r: CableRun) => {
  const m = new Map<number, number>(); for (const c of r.chains) for (const x of c.cables) m.set(x.len, (m.get(x.len) ?? 0) + x.count);
  return [...m].sort((a, b) => a[0] - b[0]).map(([len, n]) => `${metres(len)} × ${n}`).join(', ');
};

/** The DMX tool's panel: the rig's pull list, Copy cables, and the picked run's chain with its start end. */
export function renderCablingPanel(el: HTMLElement, app: AppCtx, rc: RigCabling, current: string | null, hooks: CablingHooks): void {
  const doc = app.doc, f = (mm: number) => fmt(mm, false, doc.settings);
  const body = h('div', { class: 'body cabling-panel' }); el.append(body);
  if (!rc.runs.length) { body.append(h('p', { class: 'note', text: 'No fixtures in this job yet.' })); return; }
  const all = [...rc.pull].reduce((a, [len, n]) => a + len * n, 0);
  body.append(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap' } },
    h('b', { class: 'cable-total', text: `${rc.total} cable${rc.total === 1 ? '' : 's'}`, style: { font: '600 26px var(--f-display)' } }),
    h('span', { class: 'note', text: `${metres(all)} of DMX in all` })));
  body.append(h('div', { class: 'pull-list', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
    ...[...rc.pull].sort((a, b) => a[0] - b[0]).map(([len, n]) => h('span', { class: 'tag', style: { font: '600 14px var(--f-num)', padding: '4px 8px', color: 'var(--fg)' }, text: `${metres(len)} × ${n}` }))));
  body.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    h('button', { class: 'btn', type: 'button', text: 'Copy cables', onclick: async (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      try { await navigator.clipboard.writeText(cablingText(hooks.jobName(), rc, doc)); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
      setTimeout(() => { b.textContent = 'Copy cables'; }, 1600);
    } })));
  body.append(h('p', { class: 'note', text: 'Each jumper is the gap + 2 × truss depth + 0.5 m, rounded up to 1, 2, 3, 5, 10, 20 or 50 m. Drops from the deck aren’t included.' }));

  const r = current ? rc.runs.find(x => x.group === current) : undefined;
  if (r) {
    const t = r.kind === 'truss' ? doc.entities.get(r.group) : undefined;
    const card = h('section', { class: 'cable-run', style: { border: '1px solid var(--accent)', borderRadius: '8px', padding: '8px 10px', display: 'grid', gap: '6px' } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } },
        h('b', { text: r.name, style: { font: '600 17px var(--f-display)', textTransform: 'uppercase' } }),
        h('span', { class: 'note', style: { marginLeft: 'auto' }, text: tally(r) })));
    if (t) card.append(h('span', { class: 'note', text: 'Start from' }),
      seg([['a', 'End A'], ['b', 'End B']], r.from, v => app.history.exec({ ...setProps(t.id, { dmxFrom: v as 'a' | 'b' }), label: 'DMX start' })));
    for (const fl of r.flags) card.append(h('p', { class: 'note warn', text: fl }));
    for (const ch of r.chains) {
      if (r.chains.length > 1 || ch.universe != null) card.append(h('div', { class: 'note', text: ch.universe != null ? `Universe ${ch.universe}` : 'No universe', style: { font: '600 12px var(--f-body)', letterSpacing: '.08em', textTransform: 'uppercase' } }));
      ch.cables.forEach((c, k) => card.append(h('div', { class: 'cable-row', style: { display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: '8px', alignItems: 'center', minHeight: '36px', borderBottom: '1px solid var(--line)' } },
        h('span', { class: 'note', text: String(k + 1) }),
        h('span', { text: `${c.fromId ? '#' + fixtureNums(doc, [c.fromId]) : `End ${r.from.toUpperCase()}`} → #${fixtureNums(doc, [c.toId])}`, style: { font: '500 14px var(--f-num)' } },
          h('span', { class: 'note', text: `gap ${f(c.gap)}`, style: { display: 'block' } })),
        h('b', { text: `${c.count > 1 ? c.count + ' × ' : ''}${metres(c.len)}`, style: { font: '600 16px var(--f-num)', color: c.over ? 'var(--warn)' : '' } }))));
    }
    card.append(h('button', { class: 'btn', type: 'button', text: 'All runs', onclick: () => hooks.pick(null) }));
    body.append(card);
  } else {
    body.append(h('p', { class: 'note', text: 'Tap a truss, or a run below, to see its cables.' }));
    for (const x of rc.runs) body.append(h('button', { class: 'item cable-pick', type: 'button', onclick: () => hooks.pick(x.group) },
      h('span', { text: x.flags.length ? '!' : '', style: { color: 'var(--warn)', width: '10px' } }), h('b', { text: x.name }), h('small', { text: tally(x) })));
  }
}
