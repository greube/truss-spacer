// Milestone 3 acceptance: the power tool. Run after `npm run build`:
//   MVR_SAMPLE=/path/to/real.mvr node e2e/m3.mjs [screenshot-dir]
// The sample is a client file: read from disk and handed to the browser in memory, never served.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const SAMPLE = process.env.MVR_SAMPLE; if (!SAMPLE) { console.error('Set MVR_SAMPLE to an MVR file.'); process.exit(2); }
const SHOTS = process.argv[2] ?? null;
const sample = readFileSync(SAMPLE);
const { srv, base } = await serve(fileURLToPath(new URL('../dist/', import.meta.url)));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) failed++; };
const watts = s => +s.replace(/[^\d]/g, '');
const b = await chromium.launch();

for (const [name, opts] of [['phone', { viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true }], ['laptop', { viewport: { width: 1366, height: 800 } }]]) {
  console.log(`\n== ${name} ==`);
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.accept());
  await p.route('**/__sample.mvr', r => r.fulfill({ body: sample }));
  await p.goto(base); await p.waitForFunction(() => window.__cad);
  await p.evaluate(async () => { await window.__cad.importBuffer(await (await fetch('/__sample.mvr')).arrayBuffer(), 'Ford_Uncovered_MVR.mvr'); document.querySelectorAll('.sheet').forEach(s => s.remove()); });
  const touch = name === 'phone', P = touch ? '.sheet .content' : '.side .power-sec';

  // before wattages are set: the warning and the Fixture types link
  await p.click('[data-tool="power"] >> visible=true'); await p.waitForTimeout(250);
  const t0 = await p.textContent(P);
  check('unknown wattages are counted as 0 W and flagged', /fixtures? ha(s|ve) no wattage/.test(t0) && (await p.$(`${P} button:has-text("Fixture types")`)) != null);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m3-${name}-unknown.png` });

  // give every type without a wattage 300 W (one undo step each, like the review does)
  const n = await p.evaluate(() => { const { app, ops } = window.__cad; let k = 0;
    for (const t of app.doc.types.values()) if (t.w == null) { app.history.exec(ops.updateType(t.key, { w: 300, src: 'j' })); k++; } return k; });
  await p.waitForTimeout(200);
  const st = await p.evaluate(() => { const { app, powerTool } = window.__cad; const rp = powerTool.plan();
    const fixtures = [...app.doc.entities.values()].filter(e => e.kind === 'fixture');
    const sum = fixtures.reduce((a, f) => a + (app.doc.types.get(f.typeKey)?.w ?? 0), 0);
    const flown = [...app.doc.entities.values()].find(e => e.name === 'Expo Flown A');
    const gi = rp.groups.findIndex(g => g.id === flown.id), pt = rp.plan.trusses[gi], g = rp.groups[gi];
    // every circuit is a run of neighbours along the truss
    const contiguous = pt.socas.every(s => s.circuits.every(c => c.fixtures.every((x, i) => !i || x === c.fixtures[i - 1] + 1)));
    const ownSoca = rp.plan.trusses.every((t, i) => i === gi || t.socas.every(s => s.circuits.every(c => c.fixtures.every(x => !g.fixtureIds.includes(rp.groups[i].fixtureIds[x])))));
    return { fixtures: fixtures.length, sum, total: rp.plan.total.load, unknown: rp.unknown, contiguous, ownSoca, socas: pt.socas.length, groups: rp.groups.length }; });
  check(`set ${n} unknown types to 300 W`, n === 8, String(n));
  const t1 = await p.textContent(P);
  check('total is every fixture\'s watts, with no 0 W warning', st.unknown === 0 && st.total === st.sum && !/no wattage/.test(t1) && t1.includes(st.sum.toLocaleString('en-AU') + ' W'), JSON.stringify(st));
  check('Expo Flown A has its own Socapex, circuits of neighbours only', st.contiguous && st.ownSoca && st.socas >= 1, `${st.socas} Socapex`);
  const colours = await p.evaluate(() => { const { app } = window.__cad; const f = [...app.doc.entities.values()].filter(e => e.kind === 'fixture'); return new Set(f.map(x => app.fixtureColour?.(x))).size; });
  check('fixtures are coloured by circuit on the plot', colours >= 3, `${colours} colours`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m3-${name}-power.png` });

  // settings: phases on, then load 50%
  await p.click(`${P} summary:has-text("Settings")`); await p.waitForTimeout(100);
  await p.click(`${P} label.item:has-text("Balance phases")`); await p.waitForTimeout(250);
  const ph = await p.textContent(`${P} .power-phases`).catch(() => '');
  const phases = [...ph.matchAll(/L\d ([\d,]+) W/g)].map(m => watts(m[1]));
  check('phases on: three phase totals that add up to the total', phases.length === 3 && phases.reduce((a, x) => a + x, 0) === st.sum, ph);
  const circ = () => p.evaluate(() => window.__cad.powerTool.plan().plan.total.circuits);
  const c0 = await circ();
  const load = p.locator(`${P} label.row:has-text("Load limit") input`); await load.fill('50'); await load.press('Enter'); await p.waitForTimeout(250);
  const c1 = await circ();
  check('load limit 50% needs more circuits', c1 > c0, `${c0} → ${c1}`);
  await p.click('button[aria-label="Undo"]'); await p.waitForTimeout(250);
  check('undo restores the previous circuits', (await circ()) === c0, String(await circ()));

  // copy and export
  await p.click(`${P} button:has-text("Copy power")`); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('Copy power gives the power list', clip.startsWith('POWER: ') && clip.includes('Socapex A'), clip.split('\n')[0]);
  await p.click(`${P} button:has-text("Export sheet")`); await p.waitForSelector('.sheet img', { timeout: 5000 });
  const dl = p.waitForEvent('download'); await p.click('.sheet button:has-text("Save PNG")'); const d = await dl;
  check('the power sheet saves as a PNG', /^power-.*\.png$/.test(d.suggestedFilename()), d.suggestedFilename());
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m3-${name}-sheet.png` });
  await p.keyboard.press('Escape');

  const sw = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('no horizontal scroll', sw);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll milestone 3 checks passed');
process.exit(failed ? 1 : 0);
