// Pan performance on a synthetic rig: 500 truss pieces and 2,000 fixtures (spec §3: 60 fps).
// Run after `npm run build`:  node e2e/perf.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

function crc32(b) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(name, data) { // one STORE entry
  const nb = Buffer.from(name), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nb.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + nb.length, 12); end.writeUInt32LE(30 + nb.length + data.length, 16);
  return Buffer.concat([lh, nb, data, cd, nb, end]);
}
function bigRig() {
  // 100 runs of 5 × 3 m truss pieces (500 pieces), 20 fixtures per run (2,000), spread over 300 m × 200 m
  let trusses = '', fixtures = '', id = 0; const uid = () => `00000000-0000-0000-0000-${String(++id).padStart(12, '0')}`;
  for (let r = 0; r < 100; r++) {
    const x0 = (r % 10) * 30000, y0 = Math.floor(r / 10) * 20000, z = 8000;
    for (let k = 0; k < 5; k++) trusses += `<Truss name="Truss ${r}.${k}" uuid="${uid()}"><Matrix>{1,0,0}{0,1,0}{0,0,1}{${x0 + k * 3000},${y0},${z}}</Matrix><Geometries/></Truss>`;
    for (let k = 0; k < 20; k++) fixtures += `<Fixture name="Spot" uuid="${uid()}"><Matrix>{1,0,0}{0,1,0}{0,0,1}{${x0 + 375 + k * 750},${y0},${z - 300}}</Matrix><GDTFSpec>Robe@MegaPointe.gdtf</GDTFSpec><GDTFMode>Mode 1</GDTFMode><Addresses><Address break="0">${1 + (r * 20 + k) * 34}</Address></Addresses><FixtureID>${r * 20 + k + 1}</FixtureID><UnitNumber>${k + 1}</UnitNumber></Fixture>`;
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?><GeneralSceneDescription verMajor="1" verMinor="5"><Scene><AUXData/><Layers><Layer name="Rig" uuid="${uid()}"><ChildList>${trusses}${fixtures}</ChildList></Layer></Layers></Scene></GeneralSceneDescription>`;
  return zipStore('GeneralSceneDescription.xml', Buffer.from(xml));
}

const { srv, base } = await serve(fileURLToPath(new URL('../dist/', import.meta.url)));
const rig = bigRig();
const b = await chromium.launch();
let worst = 0;
for (const [name, vp, throttle] of [['laptop', { width: 1366, height: 800 }, 1], ['phone-class (4× CPU throttle)', { width: 412, height: 860 }, 4]]) {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage();
  await p.route('**/__rig.mvr', r => r.fulfill({ body: rig }));
  await p.goto(base); await p.waitForFunction(() => window.__cad);
  await p.evaluate(async () => { await window.__cad.importBuffer(await (await fetch('/__rig.mvr')).arrayBuffer(), 'big.mvr'); document.querySelectorAll('.sheet').forEach(s => s.remove()); });
  const counts = await p.evaluate(() => { const es = [...window.__cad.app.doc.entities.values()]; return `${es.filter(e => e.kind === 'truss').length} trusses, ${es.filter(e => e.kind === 'fixture').length} fixtures`; });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  for (const zoom of ['whole rig', 'mid (many symbols)', 'close (symbols and labels)']) {
    const r = await p.evaluate(async zoom => {
      const { app, renderer } = window.__cad;
      if (zoom === 'whole rig') app.camera.fit({ min: { x: -1000, y: -1000 }, max: { x: 285000, y: 185000 } }); else if (zoom.startsWith('mid')) { app.camera.cx = 60000; app.camera.cy = 40000; app.camera.scale = 0.02; } else { app.camera.cx = 38000; app.camera.cy = 20000; app.camera.scale = 0.06; }
      const draws = [], frames = []; let last = performance.now();
      const until = performance.now() + 3000;
      await new Promise(res => { const step = now => { frames.push(now - last); last = now; app.camera.panBy(Math.sin(now / 300) * 3, Math.cos(now / 300) * 2); renderer.draw(); draws.push(renderer.stats.ms); if (now < until) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      const p95 = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
      return { draw95: p95(draws), frame95: p95(frames.slice(5)), n: draws.length, drawn: renderer.stats };
    }, zoom);
    worst = Math.max(worst, r.draw95);
    console.log(`${name.padEnd(30)} ${zoom.padEnd(28)} draw p95 ${r.draw95.toFixed(1)} ms, frame p95 ${r.frame95.toFixed(1)} ms over ${r.n} frames (${counts}; drawn ${r.drawn.fixtures} fx, ${r.drawn.symbols} symbols)`);
  }
  await ctx.close();
}
await b.close(); srv.close();
console.log(worst < 16 ? `PASS  every draw p95 under 16 ms (worst ${worst.toFixed(1)} ms)` : `FAIL  worst draw p95 ${worst.toFixed(1)} ms (target 16 ms)`);
process.exit(worst < 16 ? 0 : 1);
