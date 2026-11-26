// Milestone 5a acceptance: MVR export round trip. Run after `npm run build`:
//   MVR_SAMPLE=/path/to/real.mvr node e2e/m5.mjs
// The sample is a client file: read from disk and handed to the browser in memory, never served.
// The exported file is only read back in memory; it is never written to disk.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const SAMPLE = process.env.MVR_SAMPLE; if (!SAMPLE) { console.error('Set MVR_SAMPLE to an MVR file.'); process.exit(2); }
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
  // move fixture #923 1 m in x, and rename it, as undoable edits
  const moved = await p.evaluate(() => { const { app, ops } = window.__cad;
    const f = [...app.doc.entities.values()].find(e => e.kind === 'fixture' && e.fixtureId === '923');
    app.history.exec(ops.transform([f.id], m => ({ ...m, o: { ...m.o, x: m.o.x + 1000 } })));
    app.history.exec(ops.setProps(f.id, { name: 'Moved & renamed' }));
    const g = app.doc.entities.get(f.id); return { id: f.id, x: g.matrix.o.x, y: g.matrix.o.y }; }).catch(e => ({ err: String(e) }));
  check('moved a fixture', !moved.err, moved.err ?? '');
  await p.click('.job'); await p.waitForTimeout(200);
  await p.click('.sheet button:has-text("Export MVR")'); await p.waitForSelector('.sheet button:has-text("Save file")', { timeout: 15000 });
  const notes = await p.$$eval('.sheet .note.warn', ns => ns.map(n => n.textContent));
  check('export lists the draft trusses it leaves out', notes.some(n => /draft truss/.test(n)), notes.join(' | '));
  const dl = p.waitForEvent('download'); await p.click('.sheet button:has-text("Save file")'); const d = await dl;
  check('saves as an .mvr named after the job', /\.mvr$/.test(d.suggestedFilename()), d.suggestedFilename());
  const bytes = readFileSync(await d.path()); // Playwright's temp copy, deleted with the context
  const back = await p.evaluate(async ({ b64, id }) => {
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const before = window.__cad.app.doc;
    const nb = [...before.entities.values()].filter(e => e.kind === 'fixture').length;
    await window.__cad.importBuffer(buf, 'Exported.mvr');
    const doc = window.__cad.app.doc, f = doc.entities.get(id);
    return { n: [...doc.entities.values()].filter(e => e.kind === 'fixture').length, nb, x: f?.matrix.o.x, y: f?.matrix.o.y, name: f?.name };
  }, { b64: bytes.toString('base64'), id: moved.id });
  check('re-import has every fixture', back.n === back.nb && back.n === 188, `${back.n} / ${back.nb}`);
  check('the moved fixture is at its new place with its new name', Math.abs(back.x - moved.x) < 0.5 && Math.abs(back.y - moved.y) < 0.5 && back.name === 'Moved & renamed', JSON.stringify(back));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await b.close(); srv.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll milestone 5a checks passed');
process.exit(failed ? 1 : 0);
