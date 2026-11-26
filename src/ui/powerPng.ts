/* The power sheet image (adapted from v2's buildPowerPng): white, print-friendly, one block per power run. */
import type { Doc } from '../core/model/types';
import type { RigPlan } from '../domain/power';
import type { RigPower } from '../domain/powerRig';
import { W, PHASE, fixtureNums, typeSummary } from './powerText';

const ROW = 60, HEAD = 96, SOCA = 48;

/** Canvas height for a plan: header, optional phase line, each run's header, Socapex labels and circuit rows, footnote. */
export function powerSheetHeight(plan: RigPlan, phases: boolean): number {
  let H = 330 + (phases ? 60 : 0);
  for (const pt of plan.trusses) H += HEAD + pt.socas.length * SOCA + pt.socas.reduce((a, so) => a + so.circuits.length, 0) * ROW + 40;
  return H + 90;
}

export async function buildPowerPng(rp: RigPower, doc: Doc, jobName: string): Promise<Blob | null> {
  if (!rp.groups.length) return null;
  try { await Promise.all(['400 30px Barlow', '500 30px Barlow', '600 30px Barlow', "700 30px 'Barlow Condensed'", "500 30px 'JetBrains Mono'", "700 30px 'JetBrains Mono'"].map(f => document.fonts.load(f))); } catch { /* fallback fonts */ }
  const C = { bg: '#ffffff', ink: '#16181c', muted: '#666d78', line: '#d8d6cf', band: '#f4f3ef', accent: '#c97f00', warn: '#d13b1c', ok: '#1f8a4f' };
  const FD = "'Barlow Condensed','Arial Narrow',sans-serif", FB = 'Barlow,Arial,sans-serif', FM = "'JetBrains Mono',monospace";
  const st = doc.settings.power, plan = rp.plan, tot = plan.total, Wd = 2400, P = 120;
  const H = powerSheetHeight(plan, st.phases);
  const cv = document.createElement('canvas'); cv.width = Wd; cv.height = H;
  const c = cv.getContext('2d'); if (!c) return null;
  const T = (s: string, x: number, y: number, font: string, col: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'alphabetic') => { c.font = font; c.fillStyle = col; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y); };
  const fit = (s: string, font: string, max: number) => { c.font = font; if (c.measureText(s).width <= max) return s; while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  c.fillStyle = C.bg; c.fillRect(0, 0, Wd, H);
  T('POWER', P, 110, `700 76px ${FD}`, C.ink);
  c.font = `700 76px ${FD}`; const tw = c.measureText('POWER').width;
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  T(fit(jobName, `600 44px ${FB}`, Wd - 2 * P - tw - 420), P + tw + 40, 108, `600 44px ${FB}`, C.ink);
  T(date, Wd - P, 108, `500 32px ${FB}`, C.muted, 'right');
  T(`Total ${W(tot.load)} (${(tot.load / 240).toFixed(1)} A at 240 V)   ·   ${tot.circuits} circuits   ·   ${tot.socas} Socapex`, P, 172, `600 36px ${FB}`, C.ink);
  const notes = [tot.unknown ? `${tot.unknown} fixture${tot.unknown === 1 ? '' : 's'} with no wattage counted as 0 W.` : '', tot.overs ? `${tot.overs} over the limit on ${tot.overs === 1 ? 'its' : 'their'} own.` : ''].filter(Boolean).join('  ');
  T(`Circuits loaded to ${W(plan.limit)} (${st.loadPct}% of ${W(st.circuitW)}), ${plan.perSoca} per Socapex, one Socapex run per truss.${notes ? '  ' + notes : ''}`, P, 222, `400 28px ${FB}`, notes ? C.warn : C.muted);
  let y = 270;
  if (st.phases) { T(PHASE.map((p, k) => `${p}  ${W(tot.phase[k])}`).join('      '), P, y + 10, `600 32px ${FM}`, C.ink); y += 60; }
  const X = { circ: P + 20, phase: P + 230, fx: st.phases ? P + 400 : P + 260, load: Wd - P - 360, bar: Wd - P - 320, pct: Wd - P }, barW = 220;
  plan.trusses.forEach((pt, gi) => {
    const g = rp.groups[gi]; y += 20;
    c.fillStyle = C.ink; c.fillRect(P, y, Wd - 2 * P, HEAD - 24);
    T(fit(g.name.toUpperCase(), `700 46px ${FD}`, 1300), P + 20, y + (HEAD - 24) / 2 + 2, `700 46px ${FD}`, '#ffffff', 'left', 'middle');
    T(`${W(pt.load)}   ·   ${g.fixtureIds.length} fixture${g.fixtureIds.length === 1 ? '' : 's'}`, Wd - P - 20, y + (HEAD - 24) / 2 + 2, `600 30px ${FM}`, '#ffffff', 'right', 'middle');
    y += HEAD - 24 + 4;
    for (const so of pt.socas) {
      T(`SOCAPEX ${so.label}`, P + 20, y + SOCA / 2 + 4, `600 24px ${FB}`, C.muted, 'left', 'middle');
      y += SOCA;
      so.circuits.forEach((cc, k) => {
        if (k % 2) { c.fillStyle = C.band; c.fillRect(P, y, Wd - 2 * P, ROW); }
        const cy = y + ROW / 2 + 2, col = cc.over ? C.warn : C.ink, ids = cc.fixtures.map(i => g.fixtureIds[i]);
        T(cc.label, X.circ, cy, `700 34px ${FM}`, col, 'left', 'middle');
        if (st.phases) T(PHASE[cc.phase - 1], X.phase, cy, `600 30px ${FM}`, col, 'left', 'middle');
        T(fit(`#${fixtureNums(doc, ids)}   ${typeSummary(doc, ids)}`, `500 30px ${FB}`, X.load - X.fx - 260), X.fx, cy, `500 30px ${FB}`, col, 'left', 'middle');
        T(W(cc.load), X.load, cy, `600 30px ${FM}`, col, 'right', 'middle');
        const pct = plan.limit ? cc.load / plan.limit : 0;
        c.fillStyle = C.line; c.fillRect(X.bar, cy - 6, barW, 12);
        c.fillStyle = cc.over ? C.warn : pct > 0.9 ? C.accent : C.ok; c.fillRect(X.bar, cy - 6, barW * Math.min(1, pct), 12);
        T(cc.over ? 'OVER' : `${Math.round(pct * 100)}%`, X.pct, cy, `500 28px ${FM}`, col, 'right', 'middle');
        y += ROW;
      });
    }
    y += 20;
  });
  T('Fixture numbers are unit numbers from the plot (Fixture IDs where there are none). Loads use each fixture type\'s maximum power; check anything entered by hand.', P, H - 50, `400 26px ${FB}`, C.muted);
  return await new Promise(res => cv.toBlob(res, 'image/png'));
}
