// Milestone 5b acceptance: the PDF paperwork pack. Run after `npm run build`:
//   MVR_SAMPLE=/path/to/real.mvr node e2e/m5b.mjs [out-dir-for-a-copy-of-the-pdf]
// The sample is a client file: read from disk and handed to the browser in memory, never served.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const SAMPLE = process.env.MVR_SAMPLE; if (!SAMPLE) { console.error('Set MVR_SAMPLE to an MVR file.'); process.exit(2); }
const OUT = process.argv[2] ?? null;
const sample = readFileSync(SAMPLE);
const { srv, base } = await serve(fileURLToPath(new URL('../dist/', import.meta.url)));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) failed++; };
const b = await chromium.launch();

for (const [name, opts] of [['phone', { viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true }], ['laptop', { viewport: { width: 1366, height: 800 } }]]) {
  console.log(`\n== ${name} ==`);
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.accept());
  await p.route('**/__sample.mvr', r => r.fulfill({ body: sample }));
  await p.goto(base); await p.waitForFunction(() => window.__cad);
  await p.evaluate(async () => { await window.__cad.importBuffer(await (await fetch('/__sample.mvr')).arrayBuffer(), 'Ford_Uncovered_MVR.mvr'); document.querySelectorAll('.sheet').forEach(s => s.remove()); });
  await p.click('.job'); await p.waitForTimeout(200);
  const t0 = Date.now();
  await p.click('.sheet button:has-text("Export PDF pack")'); await p.waitForSelector('.sheet button:has-text("Save file")', { timeout: 15000 });
  const ms = Date.now() - t0;
  const dl = p.waitForEvent('download'); await p.click('.sheet button:has-text("Save file")'); const d = await dl;
  const bytes = readFileSync(await d.path()), s = bytes.toString('latin1');
  check('a PDF named after the job', s.startsWith('%PDF') && /paperwork\.pdf$/.test(d.suggestedFilename()), d.suggestedFilename());
  const n = +(s.match(/\/Count (\d+)/)?.[1] ?? 0);
  check('plot plus marks, power and DMX pages', n >= 4, `${n} pages`);
  check('made quickly', ms < 5000, `${ms} ms`);
  if (OUT && name === 'laptop') writeFileSync(`${OUT}/m5b-pack.pdf`, bytes);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll milestone 5b checks passed');
process.exit(failed ? 1 : 0);
