// Milestone 2 acceptance: the spacing tool. Run after `npm run build`:
//   MVR_SAMPLE=/path/to/real.mvr node e2e/m2.mjs [screenshot-dir]
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
  const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.accept());
  await p.route('**/__sample.mvr', r => r.fulfill({ body: sample }));
  await p.goto(base); await p.waitForFunction(() => window.__cad);
  await p.evaluate(async () => { await window.__cad.importBuffer(await (await fetch('/__sample.mvr')).arrayBuffer(), 'Ford_Uncovered_MVR.mvr'); document.querySelectorAll('.sheet').forEach(s => s.remove()); });
  const touch = name === 'phone', P = touch ? '.sheet .content' : '.side .spacing-sec';
  await p.click('[data-tool="spacing"] >> visible=true');

  // pick Expo Flown A by tapping its truss between two fixtures
  const pt = await p.evaluate(() => { const a = window.__cad.app; const t = [...a.doc.entities.values()].find(e => e.name === 'Expo Flown A');
    const fx = [...a.doc.entities.values()].filter(e => e.kind === 'fixture' && e.trussId === t.id).sort((x, y) => x.matrix.o.y - y.matrix.o.y);
    const gx = (fx[3].matrix.o.x + fx[4].matrix.o.x) / 2, gy = (fx[3].matrix.o.y + fx[4].matrix.o.y) / 2;
    a.camera.cx = gx; a.camera.cy = gy; a.camera.scale = 0.05; a.requestDraw();
    const s = a.camera.toScreen({ x: gx, y: gy }), r = document.querySelector('canvas').getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top, id: t.id }; });
  await p.waitForTimeout(100);
  if (touch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(250);
  const rows = () => p.$$eval(`${P} tbody tr`, trs => trs.map(tr => tr.querySelectorAll('td')[1]?.childNodes[0]?.textContent?.trim()));
  const r0 = await rows();
  check('picking Expo Flown A shows 23 marks', r0.length === 23, `${r0.length} rows`);
  check('…marked provisional (draft truss)', (await p.textContent(P)).includes('Provisional'));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m2-${name}-draft.png` });

  // confirm with 8x3 sections
  const secIn = p.locator(`${P} label.row:has-text("Sections") input`);
  await secIn.fill('8x3'); await p.click(`${P} button:has-text("Confirm truss")`); await p.waitForTimeout(200);
  const conf = await p.evaluate(id => { const t = window.__cad.app.doc.entities.get(id); return { state: t.state, len: Math.hypot(t.legs[0].b.x - t.legs[0].a.x, t.legs[0].b.y - t.legs[0].a.y) }; }, pt.id);
  const r1 = await rows(); const first = parseFloat(r1[0]);
  check('confirming with 8x3 makes a 24 m truss', conf.state === 'confirmed' && Math.abs(conf.len - 24000) < 0.5, JSON.stringify(conf));
  check('first mark 0.2–0.3 m from end A, no longer provisional', first >= 0.2 && first <= 0.3 && !(await p.textContent(P)).includes('Provisional'), r1[0]);

  // centre with a 0.5 m offset shifts the marks by 0.5 m
  await p.click(`${P} button:has-text("Centre")`); await p.waitForTimeout(150);
  const c0 = (await rows()).map(x => parseFloat(x.replace('−', '-')));
  await p.locator(`${P} label.row:has-text("Truss off centre") input`).fill('0.5'); await p.locator(`${P} label.row:has-text("Truss off centre") input`).press('Enter'); await p.waitForTimeout(150);
  const c1 = (await rows()).map(x => parseFloat(x.replace('−', '-')));
  check('a 0.5 m centre offset shifts every mark by 0.5 m', c0.length === 23 && c0.every((v, i) => Math.abs(Math.abs(c1[i] - v) - 0.5) < 0.006), `${c0[0]} → ${c1[0]}`);

  // in-section distances
  await p.click(`${P} label.item:has-text("In-section distances")`); await p.waitForTimeout(150);
  check('in-section distances add the column', (await p.textContent(`${P} thead`)).includes('In section'));

  // copy
  await p.click(`${P} button:has-text("Copy list")`); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('copy list text starts with the truss name', clip.startsWith('Expo Flown A'), clip.split('\n').slice(0, 3).join(' / '));

  // re-space with equal gaps, then undo
  const before = await p.evaluate(id => [...window.__cad.app.doc.entities.values()].filter(e => e.trussId === id).map(f => [f.matrix.o.x, f.matrix.o.y].join()).sort().join('|'), pt.id);
  await p.click(`${P} summary:has-text("Re-space evenly")`); await p.click(`${P} button:has-text("Equal gaps")`); await p.waitForTimeout(100);
  await p.click(`${P} button:has-text("Apply re-space")`); await p.waitForTimeout(200);
  const gaps = await p.evaluate(id => { const a = window.__cad.app, t = a.doc.entities.get(id); const ys = [...a.doc.entities.values()].filter(e => e.trussId === id).map(f => f.matrix.o.y).sort((x, y) => x - y); return ys.slice(1).map((y, i) => y - ys[i]); }, pt.id);
  check('equal gaps after re-space', gaps.length === 22 && Math.max(...gaps) - Math.min(...gaps) < 1, `${gaps[0]?.toFixed(1)}…${gaps[21]?.toFixed(1)} mm`);
  await p.evaluate(() => window.__cad.app.history.undo()); await p.waitForTimeout(100);
  const after = await p.evaluate(id => [...window.__cad.app.doc.entities.values()].filter(e => e.trussId === id).map(f => [f.matrix.o.x, f.matrix.o.y].join()).sort().join('|'), pt.id);
  check('undo restores the LD\'s positions exactly', after === before);

  // export image
  await p.click(`${P} button:has-text("Export image")`); await p.waitForSelector('.sheet:has-text("Plot image") img');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.sheet:has-text("Plot image") button:has-text("Save PNG")')]);
  if (SHOTS) await dl.saveAs(`${SHOTS}/m2-${name}-plot.png`);
  check('export image saves a PNG', /\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await p.click('.sheet:has-text("Plot image") .head .btn'); await p.waitForTimeout(100);

  // a truss with no fixtures
  await p.evaluate(() => { const c = window.__cad; const a = c.app; const id = crypto.randomUUID().toUpperCase();
    a.history.exec(c.ops.addEntities([{ id, kind: 'truss', name: 'Empty', layerId: a.doc.layers[0].id, classId: null, positionId: null, legs: [{ a: { x: 0, y: 0, z: 6000 }, b: { x: 6000, y: 0, z: 6000 }, sections: [3000, 3000] }], boxSize: 300, state: 'confirmed', mvrUuid: null }]));
    c.spacingTool.current = id; c.spacingTool.onPick(id); });
  await p.waitForTimeout(200);
  check('a truss with no fixtures says so', (await p.textContent(touch ? '.sheet .content' : '.side')).includes('No fixtures on this truss'));
  check('no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('no console errors', errs.length === 0, errs.join(' | '));

  // plot images at several fixture counts (laptop): labels tilt only as much as needed
  if (!touch && SHOTS) for (const n of [6, 14, 24, 45]) {
    await p.evaluate(n => { const c = window.__cad, a = c.app; const tid = crypto.randomUUID().toUpperCase(), L = a.doc.layers[0].id;
      const fx = Array.from({ length: n }, (_, i) => ({ id: crypto.randomUUID().toUpperCase(), kind: 'fixture', name: '', layerId: L, classId: null, positionId: null, trussId: tid,
        matrix: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, w: { x: 0, y: 0, z: 1 }, o: { x: 250 + i * (7500 / Math.max(1, n - 1)), y: 50000, z: 5700 } }, typeKey: '', unitNumber: i + 1, fixtureId: '', address: null, mvrUuid: null }));
      a.history.exec(c.ops.addEntities([{ id: tid, kind: 'truss', name: `Test ${n}`, layerId: L, classId: null, positionId: null, legs: [{ a: { x: 0, y: 50000, z: 6000 }, b: { x: 8000, y: 50000, z: 6000 }, sections: [3000, 3000, 2000] }], boxSize: 300, state: 'confirmed', mvrUuid: null }, ...fx]));
      c.spacingTool.current = tid; c.spacingTool.onPick(tid); }, n);
    await p.waitForTimeout(150);
    await p.click('.side button:has-text("Export image")'); await p.waitForSelector('.sheet:has-text("Plot image") img');
    const [d2] = await Promise.all([p.waitForEvent('download'), p.click('.sheet:has-text("Plot image") button:has-text("Save PNG")')]);
    await d2.saveAs(`${SHOTS}/m2-plot-${n}.png`); await p.click('.sheet:has-text("Plot image") .head .btn');
  }
  await ctx.close();
}
await b.close(); srv.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll milestone 2 checks passed');
process.exit(failed ? 1 : 0);
