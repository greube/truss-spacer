import { test, expect } from 'vitest';
import { CablingTool } from './cabling';
import { drawCablingOverlay } from '../view/cablingOverlay';
import { rigCabling } from '../domain/cabling';
import { makeApp } from '../../test/helpers/makeApp';

const mods = { pointerType: 'touch' as const, shift: false, ctrl: false, alt: false };

test('tapping a fixture or truss picks its run; empty space clears', () => {
  const app = makeApp(), t = new CablingTool(); const picked: (string | null)[] = [];
  t.onPick = g => picked.push(g); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 1900, y: 0 }), mods);
  t.onTap!(app.camera.toScreen({ x: 4000, y: 5000 }), mods);
  t.onTap!(app.camera.toScreen({ x: 5400, y: 0 }), mods);
  expect(picked).toEqual(['T', null, 'T']);
});

test('the plan follows the doc after invalidate', () => {
  const app = makeApp(), t = new CablingTool(); t.activate(app);
  expect(t.plan().total).toBe(6);
  app.doc.entities.delete('F5'); t.invalidate();
  expect(t.plan().total).toBe(5);
  t.deactivate(); expect(app.preview).toBeNull();
});

test('the overlay draws chains and lengths without throwing', () => {
  const app = makeApp(); const calls: string[] = [];
  const ctx: any = new Proxy({}, { get: (o: any, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 20 }) : (..._a: any[]) => { calls.push(String(k)); }), set: (o: any, k, v) => { o[k] = v; return true; } });
  drawCablingOverlay(ctx, app.camera, app.doc, rigCabling(app.doc), 'T', () => true, 'dark');
  expect(calls).toContain('lineTo');
  expect(calls).toContain('fillText');
});

test('review fix: chain lines are mitred at corners, not cut across', async () => {
  const { pathAlong } = await import('../view/cablingOverlay');
  const t: any = { legs: [{ a: { x: 0, y: 0, z: 0 }, b: { x: 4000, y: 0, z: 0 }, sections: [] }, { a: { x: 4000, y: 0, z: 0 }, b: { x: 4000, y: 4000, z: 0 }, sections: [] }] };
  const pts = pathAlong(t, 1000, 6000, 200);
  // the corner point sits off both legs by 200 mm: the inside corner at (3800, 200)
  expect(pts.length).toBe(3);
  expect(pts[1].x).toBeCloseTo(3800); expect(pts[1].y).toBeCloseTo(200);
  expect(pts[0].y).toBeCloseTo(200); expect(pts[2].x).toBeCloseTo(3800);
});
test('review fix: start labels for two universes on one truss do not overprint', () => {
  const app = makeApp(); const at: [string, number][] = [];
  (app.doc.entities.get('F1') as any).address = 513; (app.doc.entities.get('F0') as any).address = 1;
  const ctx: any = new Proxy({}, { get: (o: any, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 20 }) : (...a: any[]) => { if (k === 'fillText') at.push([a[0], a[2]]); }), set: (o: any, k, v) => { o[k] = v; return true; } });
  app.camera.scale = 0.02; // zoomed out: the chains are only a couple of pixels apart
  drawCablingOverlay(ctx, app.camera, app.doc, rigCabling(app.doc), 'T', () => true, 'dark');
  const ys = at.filter(([s]) => String(s).startsWith('DMX')).map(([, y]) => y);
  expect(ys.length).toBe(2);
  expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(11);
});
