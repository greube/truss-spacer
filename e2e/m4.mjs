// Milestone 4 acceptance: the DMX cabling tool. Run after `npm run build`:
//   MVR_SAMPLE=/path/to/real.mvr node e2e/m4.mjs [screenshot-dir]
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
const b = await chromium.launch();

for (const [name, opts] of [['phone', { viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true }], ['laptop', { viewport: { width: 1366, height: 800 } }]]) {
  console.log(`\n== ${name} ==`);
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.accept());
  await p.route('**/__sample.mvr', r => r.fulfill({ body: sample }));
  await p.goto(base); await p.waitForFunction(() => window.__cad);
  await p.evaluate(async () => { await window.__cad.importBuffer(await (await fetch('/__sample.mvr')).arrayBuffer(), 'Ford_Uncovered_MVR.mvr'); document.querySelectorAll('.sheet').forEach(s => s.remove()); });
  const touch = name === 'phone', P = touch ? '.sheet .content' : '.side .cabling-sec';

  await p.click('[data-tool="cabling"] >> visible=true'); await p.waitForTimeout(250);
  if (touch) { // the sheet opens on a pick: pick nothing yet by tapping empty space far off the rig
    const r = await p.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left + 10, y: c.top + 10 }; });
    await p.touchscreen.tap(r.x, r.y); await p.waitForTimeout(250);
  }
  const exp = await p.evaluate(() => { const { app } = window.__cad; const rc = window.__cad.cablingTool.plan();
    const fixtures = [...app.doc.entities.values()].filter(e => e.kind === 'fixture');
    const onTruss = rc.runs.filter(r => r.kind === 'truss').reduce((a, r) => a + r.chains.reduce((x, c) => x + c.cables.length, 0), 0);
    const trussFx = fixtures.filter(f => f.trussId && app.doc.entities.get(f.trussId)).length;
    return { total: rc.total, onTruss, trussFx, runs: rc.runs.length }; });
  const head = await p.textContent(`${P} .cable-total`).catch(() => '');
  check('the panel shows the pull list total', head.startsWith(`${exp.total} cable`), `${head} / ${JSON.stringify(exp)}`);
  check('every fixture on a truss gets exactly one cable in', exp.onTruss === exp.trussFx && exp.trussFx > 0, `${exp.onTruss} cables for ${exp.trussFx} fixtures`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m4-${name}-all.png` });

  // pick Expo Flown A from the run list
  await p.click(`${P} button.cable-pick:has-text("Expo Flown A")`); await p.waitForTimeout(250);
  const rows = await p.$$eval(`${P} .cable-row`, r => r.length);
  check('Expo Flown A lists its chain', rows === 23, `${rows} cables`);
  const first = () => p.textContent(`${P} .cable-row`);
  const a = await first();
  await p.click(`${P} .cable-run button:has-text("End B")`); await p.waitForTimeout(250);
  const bTxt = await first();
  check('start from B changes the first cable', a !== bTxt && bTxt.includes('End B'), `${a.trim()} | ${bTxt.trim()}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m4-${name}-run.png` });
  await p.click('button[aria-label="Undo"]'); await p.waitForTimeout(250);
  check('undo goes back to end A', (await first()) === a);

  await p.click(`${P} button:has-text("Copy cables")`); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('Copy cables gives the pull list', clip.startsWith('DMX CABLES: ') && clip.includes('Expo Flown A, from end A'), clip.split('\n').slice(0, 2).join(' / '));

  check('no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll milestone 4 checks passed');
process.exit(failed ? 1 : 0);
