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
