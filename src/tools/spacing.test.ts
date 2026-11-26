import { test, expect } from 'vitest';
import { SpacingTool } from './spacing';
import { drawSpacingOverlay } from '../view/spacingOverlay';
import { markLabel } from '../domain/runMarks';
import { DEFAULT_SPACING } from '../core/model/types';
import { makeApp } from '../../test/helpers/makeApp';
import type { Truss } from '../core/model/types';

const mods = { pointerType: 'touch' as const, shift: false, ctrl: false, alt: false };
test('tapping a truss picks it; tapping one of its fixtures picks the truss and selects the fixture; empty space clears', () => {
  const app = makeApp(); const t = new SpacingTool(); const picked: (string | null)[] = []; t.onPick = id => picked.push(id); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 5400, y: 0 }), mods); expect(t.current).toBe('T');
  t.onTap!(app.camera.toScreen({ x: 1900, y: 0 }), mods); expect(t.current).toBe('T'); expect([...app.selection]).toEqual(['F1']);
  t.onTap!(app.camera.toScreen({ x: 4000, y: 5000 }), mods); expect(t.current).toBeNull();
  expect(picked).toEqual(['T', 'T', null]);
});
test('mark labels: centre marks get a plus on the right, like v1', () => {
  const S = { unit: 'm' as const, round: 5 };
  expect(markLabel(1250, { ...DEFAULT_SPACING, ref: 'centre' }, S)).toBe('+1.250 m');
  expect(markLabel(-1250, { ...DEFAULT_SPACING, ref: 'centre' }, S)).toBe('−1.250 m');
  expect(markLabel(1250, DEFAULT_SPACING, S)).toBe('1.250 m');
});
test('the overlay draws without throwing, for confirmed and draft trusses', () => {
  const app = makeApp(); const calls: string[] = [];
  const ctx: any = new Proxy({}, { get: (o: any, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 30 }) : (..._a: any[]) => { calls.push(String(k)); }), set: (o: any, k, v) => { o[k] = v; return true; } });
  const t = app.doc.entities.get('T') as Truss;
  for (const state of ['confirmed', 'draft'] as const) drawSpacingOverlay(ctx, app.camera, app.doc, { ...t, state }, { ...DEFAULT_SPACING, ref: 'centre' }, { unit: 'm', round: 5 });
  expect(calls).toContain('fillText');
});
test('in Paper mode the overlay uses dark ink, not the dark theme\'s light ink (review fix)', () => {
  const app = makeApp(); const fills: string[] = [];
  const ctx: any = new Proxy({}, { get: (o: any, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 30 }) : (..._a: any[]) => { if (k === 'fillText') fills.push(o.fillStyle); }), set: (o: any, k, v) => { o[k] = v; return true; } });
  app.camera.fit({ min: { x: -500, y: -1000 }, max: { x: 8500, y: 1000 } });
  drawSpacingOverlay(ctx, app.camera, app.doc, app.doc.entities.get('T') as Truss, { ...DEFAULT_SPACING, joinWarn: 0 }, { unit: 'm', round: 5 }, 'paper');
  expect(fills).not.toContain('#e9e6df');
  expect(fills).toContain('#16181c');
});
