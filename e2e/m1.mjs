// Milestone 1 acceptance (spec §8). Run after `npm run build`:
//   MVR_SAMPLE=/path/to/real.mvr node e2e/m1.mjs [screenshot-dir]
// The sample is a client file: it's read from disk and handed to the browser in memory, never served.
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

async function open(opts, init) {
  const ctx = await b.newContext({ deviceScaleFactor: 1, ...opts }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.accept());
  if (init) await p.addInitScript(init);
  await p.route('**/__sample.mvr', r => r.fulfill({ body: sample }));
  await p.goto(base); await p.waitForFunction(() => window.__cad);
  return { ctx, p, errs };
}
const importSample = p => p.evaluate(async () => {
  const t0 = performance.now(); const buf = await (await fetch('/__sample.mvr')).arrayBuffer();
  const r = await window.__cad.importBuffer(buf, 'Ford_Uncovered_MVR.mvr');
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  document.querySelectorAll('.sheet').forEach(s => s.remove());
  return { ms: performance.now() - t0, r };
});
const screenOf = (p, x, y) => p.evaluate(([x, y]) => { const a = window.__cad.app, s = a.camera.toScreen({ x, y }), r = document.querySelector('canvas').getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; }, [x, y]);
const doc = p => p.evaluate(() => { const d = window.__cad.app.doc, es = [...d.entities.values()]; return { fixtures: es.filter(e => e.kind === 'fixture').length, trusses: es.filter(e => e.kind === 'truss').length, drafts: es.filter(e => e.kind === 'truss' && e.state === 'draft').length, positions: d.positions.length }; });
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const [name, opts] of [['phone', { viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true }], ['laptop', { viewport: { width: 1366, height: 800 } }]]) {
  console.log(`\n== ${name} ==`);
  const { ctx, p, errs } = await open(opts);
  const touch = name === 'phone';
  const tap = async pt => (touch ? p.touchscreen.tap(pt.x, pt.y) : p.mouse.click(pt.x, pt.y));
  const { ms } = await importSample(p);
  const d0 = await doc(p);
  check('opens the sample in under 5 s', ms < 5000, `${Math.round(ms)} ms`);
  check('188 fixtures and 9 hanging positions', d0.fixtures === 188 && d0.positions === 9, JSON.stringify(d0));
  check('draft trusses on the flown positions', d0.drafts === 6, `${d0.drafts} drafts`);
  if (!touch) check('positions panel lists 9', (await p.$$eval('.side .sec:has(h3:text("Hanging positions")) .item', x => x.length)) === 9);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m1-${name}-plan.png` });

  // zoom and pan
  const s0 = await p.evaluate(() => window.__cad.app.camera.scale);
  if (touch) {
    const cdp = await ctx.newCDPSession(p); const r = await p.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; });
    const pts = d => [{ x: r.x - d, y: r.y, id: 1 }, { x: r.x + d, y: r.y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
    for (let d = 40; d <= 120; d += 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else { await p.mouse.move(683, 400); await p.mouse.wheel(0, -600); }
  await p.waitForTimeout(100);
  const s1 = await p.evaluate(() => window.__cad.app.camera.scale);
  check(touch ? 'pinch zooms in' : 'wheel zooms in', s1 > s0 * 1.5, `${s0.toFixed(4)} → ${s1.toFixed(4)}`);
  await p.evaluate(() => { const a = window.__cad.app; a.selection.clear(); window.__cad.renderer.draw(); });

  // tap fixture 923 -> Object Info shows 10.133
  const f923 = await p.evaluate(() => { const f = [...window.__cad.app.doc.entities.values()].find(e => e.fixtureId === '923'); return { x: f.matrix.o.x, y: f.matrix.o.y }; });
  await p.evaluate(([x, y]) => { const a = window.__cad.app; a.camera.cx = x; a.camera.cy = y; a.camera.scale = 0.05; a.requestDraw(); }, [f923.x, f923.y]);
  await p.waitForTimeout(80);
  await tap(await screenOf(p, f923.x, f923.y)); await p.waitForTimeout(150);
  if (touch) { await p.click('.selbar .btn'); await p.waitForTimeout(150); }
  const addr = await p.evaluate(() => [...document.querySelectorAll('.row')].find(r => r.textContent.startsWith('Address'))?.querySelector('input')?.value);
  check('tapping fixture 923 shows its address 10.133', addr === '10.133', String(addr));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/m1-${name}-info.png` });
  // edit X in Object Info
  const xInput = await p.evaluateHandle(() => [...document.querySelectorAll(document.querySelector('.sheet') ? '.sheet .row' : '.side .row')].find(r => r.textContent.startsWith('X (')).querySelector('input'));
  await xInput.fill('100.000'); await xInput.press('Enter'); await p.waitForTimeout(150);
  const newX = await p.evaluate(() => [...window.__cad.app.doc.entities.values()].find(e => e.fixtureId === '923').matrix.o.x);
  check('editing X in Object Info moves the fixture', Math.abs(newX - 100000) < 0.01, String(newX));
  await p.evaluate(() => { document.querySelectorAll('.sheet').forEach(s => s.remove()); });

  // drag a draft truss: it and its fixtures move; undo restores
  const tr = await p.evaluate(() => { const a = window.__cad.app; const t = [...a.doc.entities.values()].find(e => e.kind === 'truss' && e.name === 'Expo Flown A'); const l = t.legs[0];
    const fx = [...a.doc.entities.values()].filter(e => e.kind === 'fixture' && e.trussId === t.id).map(f => f.matrix.o.x).sort((x, y) => x - y);
    // a point on the truss between two fixtures
    const ys = [...a.doc.entities.values()].filter(e => e.kind === 'fixture' && e.trussId === t.id).map(f => f.matrix.o.y).sort((x, y) => x - y);
    const gy = (ys[3] + ys[4]) / 2; const gx = l.a.x + (l.b.x - l.a.x) * ((gy - l.a.y) / (l.b.y - l.a.y));
    a.camera.cx = gx; a.camera.cy = gy; a.camera.scale = 0.06; a.selection.clear(); a.requestDraw();
    return { id: t.id, gx, gy, ax: l.a.x, f0: fx[0] }; });
  await p.waitForTimeout(80);
  const g = await screenOf(p, tr.gx, tr.gy);
  if (touch) { // a real one-finger drag
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x, y: g.y, id: 1 }] });
    for (let dx = 10; dx <= 60; dx += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + dx, y: g.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else { await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x + 30, g.y, { steps: 3 }); await p.mouse.move(g.x + 60, g.y, { steps: 3 }); await p.mouse.up(); }
  await p.waitForTimeout(150);
  const moved = await p.evaluate(id => { const a = window.__cad.app, t = a.doc.entities.get(id); const fx = [...a.doc.entities.values()].filter(e => e.kind === 'fixture' && e.trussId === id).map(f => f.matrix.o.x).sort((x, y) => x - y); return { ax: t.legs[0].a.x, f0: fx[0] }; }, tr.id);
  const dTruss = moved.ax - tr.ax, dFx = moved.f0 - tr.f0;
  check('dragging a draft truss moves it with its fixtures', dTruss > 500 && Math.abs(dTruss - dFx) < 1, `truss +${Math.round(dTruss)} mm, fixture +${Math.round(dFx)} mm`);
  await p.evaluate(() => window.__cad.app.history.undo());
  const back = await p.evaluate(id => window.__cad.app.doc.entities.get(id).legs[0].a.x, tr.id);
  check('undo puts it back', Math.abs(back - tr.ax) < 0.001);

  // duplicate, delete, undo (keyboard on laptop, actions on phone)
  const n0 = await p.evaluate(() => window.__cad.app.doc.entities.size);
  await p.evaluate(id => { const a = window.__cad.app; a.selection.clear(); a.selection.add(id); a.requestDraw(); }, tr.id);
  if (touch) await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true }))); else await p.keyboard.press('Control+d');
  const n1 = await p.evaluate(() => window.__cad.app.doc.entities.size);
  if (touch) await p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))); else await p.keyboard.press('Delete');
  const n2 = await p.evaluate(() => window.__cad.app.doc.entities.size);
  await p.evaluate(() => { const h = window.__cad.app.history; h.undo(); h.undo(); });
  const n3 = await p.evaluate(() => window.__cad.app.doc.entities.size);
  check('duplicate, delete and undo', n1 > n0 && n2 < n1 && n3 === n0, `${n0} → ${n1} → ${n2} → ${n3}`);

  // add a truss with 3 taps (+ finish)
  const t0n = (await doc(p)).trusses;
  await p.click('[data-tool="addTruss"] >> visible=true');
  const c = await p.evaluate(() => ({ x: window.__cad.app.camera.cx, y: window.__cad.app.camera.cy }));
  for (const [dx, dy] of [[-3000, -2000], [3000, -2000], [3000, 2000]]) await tap(await screenOf(p, c.x + dx, c.y + dy));
  await tap(await screenOf(p, c.x + 3000, c.y + 2000));
  await p.click('[data-tool="select"] >> visible=true');
  const t1n = (await doc(p)).trusses;
  check('adding a truss with taps', t1n === t0n + 1, `${t0n} → ${t1n}`);

  // rotate the screen (phone): selection and centre survive
  if (touch) {
    await p.evaluate(() => { const a = window.__cad.app; const f = [...a.doc.entities.values()].find(e => e.kind === 'fixture'); a.selection.clear(); a.selection.add(f.id); a.requestDraw(); });
    const before = await p.evaluate(() => { const a = window.__cad.app; return { cx: a.camera.cx, cy: a.camera.cy, scale: a.camera.scale, sel: [...a.selection] }; });
    await p.setViewportSize({ width: 860, height: 412 }); await p.waitForTimeout(400);
    const after = await p.evaluate(() => { const a = window.__cad.app; return { cx: a.camera.cx, cy: a.camera.cy, scale: a.camera.scale, sel: [...a.selection], w: a.camera.w }; });
    check('rotating the phone keeps the view and the selection', Math.abs(after.cx - before.cx) < 0.01 && Math.abs(after.cy - before.cy) < 0.01 && after.scale === before.scale && after.sel.join() === before.sel.join() && after.w > 800, JSON.stringify({ w: after.w }));
    await p.setViewportSize({ width: 412, height: 860 }); await p.waitForTimeout(300);
  }

  // hide a layer, then close, go offline and reopen: job, edits and visibility kept
  await p.evaluate(() => { const a = window.__cad.app; const l = a.doc.layers.find(x => x.name === 'Drape'); a.history.exec({ label: 'x', do: d => { d.layers.find(x => x.id === l.id).visible = false; }, undo: d => { d.layers.find(x => x.id === l.id).visible = true; } }); });
  await p.waitForTimeout(900); // autosave
  await p.evaluate(() => navigator.serviceWorker.ready);
  const snap = await p.evaluate(() => ({ n: window.__cad.app.doc.entities.size, x: [...window.__cad.app.doc.entities.values()].find(e => e.fixtureId === '923').matrix.o.x }));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForFunction(() => window.__cad); await p.waitForTimeout(700);
  const re = await p.evaluate(() => ({ name: document.querySelector('.job b').textContent, n: window.__cad.app.doc.entities.size, x: [...window.__cad.app.doc.entities.values()].find(e => e.fixtureId === '923')?.matrix.o.x, drape: window.__cad.app.doc.layers.find(x => x.name === 'Drape')?.visible }));
  check('offline reopen keeps the job, edits and hidden layers', re.name === 'Ford_Uncovered_MVR' && re.n === snap.n && Math.abs(re.x - snap.x) < 0.01 && re.drape === false, JSON.stringify(re));
  await ctx.setOffline(false);

  // the wrong kind of file
  const bad = await p.evaluate(async () => { const n = window.__cad.app.doc.entities.size; await window.__cad.jobs.importFile(new Blob(['%PDF-1.7 plot']), 'plot.pdf'); return { same: window.__cad.app.doc.entities.size === n, toast: document.querySelector('.toast')?.textContent }; });
  check('a PDF gets an error and the job stays open', bad.same && /zip|MVR/.test(bad.toast ?? ''), bad.toast);

  if (SHOTS && !touch) {
    await p.evaluate(() => { const a = window.__cad.app; a.selection.clear(); document.querySelector('[aria-label="Paper mode"]').click(); });
    await p.evaluate(() => window.__cad.app.camera.fit({ min: { x: 90000, y: -40000 }, max: { x: 130000, y: 46000 } })); await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOTS}/m1-${name}-paper.png` });
    await p.evaluate(() => document.querySelector('[aria-label="Paper mode"]').click());
    await p.click('.job'); await p.waitForTimeout(200); await p.click('.sheet button:has-text("Fixture types")'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOTS}/m1-${name}-review.png` });
  }
  check('no horizontal scroll', await noHScroll(p));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// storage blocked: warning shows and editing still works
{
  console.log('\n== storage blocked ==');
  const { ctx, p, errs } = await open({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true }, () => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
  await p.waitForTimeout(400);
  check('warns that the device isn\'t saving', /isn't saving/.test((await p.textContent('.toast').catch(() => '')) ?? ''));
  await importSample(p);
  const ok = await p.evaluate(() => { const a = window.__cad.app, f = [...a.doc.entities.values()].find(e => e.kind === 'fixture'); a.selection.clear(); a.selection.add(f.id); const n = a.doc.entities.size;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); const after = a.doc.entities.size; a.history.undo(); return n - after === 1 && a.doc.entities.size === n; });
  check('editing still works without storage', ok);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await b.close(); srv.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll milestone 1 checks passed');
process.exit(failed ? 1 : 0);
