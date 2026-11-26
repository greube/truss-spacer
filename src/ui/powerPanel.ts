import type { AppCtx } from '../tools/tool';
import type { PowerSettings } from '../core/model/types';
import type { RigPower } from '../domain/powerRig';
import { h } from './dom';
import { seg, field, inputBox } from './controls';
import { setSettings } from '../core/commands/ops';
import { powerColours } from '../view/powerOverlay';
import { powerText, fixtureNums, typeSummary, W, PHASE } from './powerText';

export interface PowerHooks {
  toast(msg: string, warn?: boolean): void;
  openReview(): void;
  exportSheet(): void;
  jobName(): string;
}

/** The Power tool's panel: rig totals and warnings, circuits per run, power settings, copy and export. */
export function renderPowerPanel(el: HTMLElement, app: AppCtx, rp: RigPower, current: string | null, hooks: PowerHooks): void {
  const doc = app.doc, st = doc.settings.power, tot = rp.plan.total, limit = rp.plan.limit;
  const setP = (patch: Partial<PowerSettings>) => app.history.exec({ ...setSettings({ power: { ...st, ...patch } }), label: 'Power settings' });
  const body = h('div', { class: 'body power-panel' }); el.append(body);
  if (!rp.groups.length) { body.append(h('p', { class: 'note', text: 'No fixtures in this job yet.' })); return; }

  // totals
  body.append(h('div', { class: 'power-totals', style: { display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap' } },
    h('b', { text: W(tot.load), style: { font: '600 26px var(--f-display)' } }),
    h('span', { class: 'note', text: `${(tot.load / 240).toFixed(1)} A at 240 V · ${tot.circuits} circuit${tot.circuits === 1 ? '' : 's'} · ${tot.socas} Socapex` })));
  if (st.phases) body.append(h('p', { class: 'note power-phases', text: PHASE.map((p, k) => `${p} ${W(tot.phase[k])}`).join(' · ') }));

  // warnings
  if (tot.overs) body.append(h('p', { class: 'note warn', text: `${tot.overs} fixture${tot.overs === 1 ? ' is' : 's are'} over the ${W(limit)} circuit limit on ${tot.overs === 1 ? 'its' : 'their'} own. ${tot.overs === 1 ? 'It has' : 'Each has'} a circuit to ${tot.overs === 1 ? 'itself' : 'themselves'}: check the rating or run ${tot.overs === 1 ? 'it' : 'them'} separately.` }));
  if (rp.unknown) body.append(h('div', { class: 'power-unknown', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
    h('p', { class: 'note warn', style: { flex: '1 1 180px' }, text: `${rp.unknown} fixture${rp.unknown === 1 ? ' has' : 's have'} no wattage and ${rp.unknown === 1 ? 'counts' : 'count'} as 0 W.` }),
    h('button', { class: 'btn', type: 'button', text: 'Fixture types', onclick: () => hooks.openReview() })));

  // copy and export
  body.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    h('button', { class: 'btn', type: 'button', text: 'Copy power', onclick: async (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      try { await navigator.clipboard.writeText(powerText(hooks.jobName(), rp, doc)); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
      setTimeout(() => { b.textContent = 'Copy power'; }, 1600);
    } }),
    h('button', { class: 'btn primary', type: 'button', text: 'Export sheet', onclick: () => hooks.exportSheet() })));

  // settings
  const det = h('details', { class: 'power-settings', style: { borderTop: '1px solid var(--line)', paddingTop: '8px' } },
    h('summary', { text: `Settings: ${W(limit)} per circuit, ${rp.plan.perSoca} per Socapex`, style: { cursor: 'pointer', font: '600 13px var(--f-body)', color: 'var(--muted)', padding: '6px 0' } }),
    h('div', { style: { display: 'grid', gap: '8px' } },
      field('Circuit (W)', inputBox(String(st.circuitW), v => { const n = Math.round(+v); if (!(n >= 100 && n <= 100000)) return false; setP({ circuitW: n }); }, 'numeric')),
      field('Load limit (%)', inputBox(String(st.loadPct), v => { const n = +v; if (!(n >= 10 && n <= 100)) return false; setP({ loadPct: n }); }, 'numeric')),
      field('Per Socapex', inputBox(String(st.perSoca), v => { const n = Math.round(+v); if (!(n >= 1 && n <= 12)) return false; setP({ perSoca: n }); }, 'numeric')),
      seg([['spread', 'Use every circuit'], ['fewest', 'Fewest circuits']], st.fill, v => setP({ fill: v as PowerSettings['fill'] })),
      h('label', { class: 'item' }, h('input', { type: 'checkbox', checked: st.phases, onchange: (e: Event) => setP({ phases: (e.target as HTMLInputElement).checked }) }), h('b', { text: 'Balance phases (1·4 L1, 2·5 L2, 3·6 L3)' }), h('span'))));
  (det as HTMLDetailsElement).open = !!(el as any).__settingsOpen;
  det.addEventListener('toggle', () => { (el as any).__settingsOpen = (det as HTMLDetailsElement).open; });
  body.append(det);

  // runs
  const colours = powerColours(rp);
  rp.plan.trusses.forEach((pt, gi) => {
    const g = rp.groups[gi], picked = g.id === current;
    const card = h('section', { class: 'power-run', 'data-group': g.id, style: { border: `1px solid ${picked ? 'var(--accent)' : 'var(--line)'}`, borderRadius: '8px', padding: '8px 10px', display: 'grid', gap: '6px' } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } },
        h('b', { text: g.name, style: { font: '600 17px var(--f-display)', textTransform: 'uppercase' } }),
        g.kind !== 'truss' ? h('span', { class: 'tag', text: g.kind === 'position' ? 'Not on a truss' : 'No position' }) : null,
        h('span', { class: 'note', style: { marginLeft: 'auto' }, text: `${W(pt.load)} · ${g.fixtureIds.length} fixture${g.fixtureIds.length === 1 ? '' : 's'}` })));
    for (const so of pt.socas) {
      card.append(h('div', { class: 'note', text: `Socapex ${so.label}`, style: { font: '600 12px var(--f-body)', letterSpacing: '.08em', textTransform: 'uppercase' } }));
      for (const c of so.circuits) {
        const ids = c.fixtures.map(i => g.fixtureIds[i]), pct = limit ? Math.round((c.load / limit) * 100) : 0;
        card.append(h('div', { class: 'power-circuit', style: { display: 'grid', gridTemplateColumns: '14px 56px minmax(0,1fr) auto', gap: '8px', alignItems: 'center', minHeight: '40px' } },
          h('i', { style: { width: '12px', height: '12px', borderRadius: '50%', background: colours.get(ids[0]) ?? 'var(--muted)' } }),
          h('b', { text: `${c.label}${st.phases ? ' ' + PHASE[c.phase - 1] : ''}`, style: { font: '600 15px var(--f-num)' } }),
          h('span', { style: { minWidth: '0' } },
            h('span', { text: `#${fixtureNums(doc, ids)}`, style: { display: 'block', font: '500 13px var(--f-num)' } }),
            h('span', { class: 'note', text: typeSummary(doc, ids), style: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
            h('span', { style: { display: 'block', height: '4px', borderRadius: '2px', background: 'var(--line)', marginTop: '3px' } },
              h('span', { style: { display: 'block', height: '4px', borderRadius: '2px', width: Math.min(100, pct) + '%', background: c.over ? 'var(--warn)' : 'var(--ok)' } }))),
          h('span', { style: { textAlign: 'right', font: '500 13px var(--f-num)', color: c.over ? 'var(--warn)' : '' } }, W(c.load), h('span', { class: 'note', text: c.over ? 'Over limit' : `${pct}%`, style: { display: 'block', color: c.over ? 'var(--warn)' : '' } }))));
      }
    }
    body.append(card);
  });
  if (current) {
    const card = [...body.querySelectorAll<HTMLElement>('.power-run')].find(x => x.dataset.group === current);
    requestAnimationFrame(() => card?.scrollIntoView?.({ block: 'nearest' }));
  }
}
