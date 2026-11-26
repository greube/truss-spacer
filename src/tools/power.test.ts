import { test, expect } from 'vitest';
import { PowerTool } from './power';
import { powerColours, CIRCUIT_COLOURS, OVER_COLOUR, drawPowerOverlay } from '../view/powerOverlay';
import { rigPower } from '../domain/powerRig';
import { makeApp } from '../../test/helpers/makeApp';
import { setSettings, updateType } from '../core/commands/ops';
import type { Fixture } from '../core/model/types';

const mods = { pointerType: 'touch' as const, shift: false, ctrl: false, alt: false };
const withType = (w: number) => { const app = makeApp(); app.doc.types.set('t', { key: 't', m: 'M', n: 'Spot', w, src: 's', url: '', gdtfSpec: '', mode: '', category: 'spot' }); return app; };

test('same circuit, same colour; neighbouring circuits differ', () => {
  const app = withType(700); app.doc.settings.power.fill = 'fewest'; // 2 per circuit: F0F1 | F2F3 | F4F5
  const rp = rigPower(app.doc), c = powerColours(rp);
  expect(c.get('F0')).toBe(c.get('F1'));
  expect(c.get('F1')).not.toBe(c.get('F2'));
  expect(c.get('F3')).not.toBe(c.get('F4'));
  expect(CIRCUIT_COLOURS).toContain(c.get('F0'));
});

test('a fixture over the limit gets the warn colour', () => {
  const app = withType(500); app.doc.types.set('big', { key: 'big', m: 'M', n: 'Molefay', w: 2600, src: 's', url: '', gdtfSpec: '', mode: '', category: 'wash' });
  (app.doc.entities.get('F2') as Fixture).typeKey = 'big';
  expect(powerColours(rigPower(app.doc)).get('F2')).toBe(OVER_COLOUR);
});

test('tapping a fixture or truss picks its group; empty space clears', () => {
  const app = withType(500), t = new PowerTool(); const picked: (string | null)[] = [];
  t.onPick = (g) => picked.push(g); t.activate(app);
  t.onTap!(app.camera.toScreen({ x: 1900, y: 0 }), mods);
  t.onTap!(app.camera.toScreen({ x: 4000, y: 5000 }), mods);
  t.onTap!(app.camera.toScreen({ x: 5400, y: 0 }), mods);
  expect(picked).toEqual(['T', null, 'T']);
  expect(t.current).toBe('T');
});

test('the tool colours fixtures while active and follows setting and wattage changes', () => {
  const app = withType(700), t = new PowerTool(); t.activate(app);
  app.doc.settings.power.fill = 'fewest'; t.invalidate();
  expect(app.fixtureColour!(app.doc.entities.get('F0') as Fixture)).toBe(app.fixtureColour!(app.doc.entities.get('F1') as Fixture));
  app.history.exec(setSettings({ power: { ...app.doc.settings.power, loadPct: 25 } })); t.invalidate(); // 600 W limit: each fixture alone, over
  expect(app.fixtureColour!(app.doc.entities.get('F0') as Fixture)).toBe(OVER_COLOUR);
  app.history.exec(updateType('t', { w: 100 })); t.invalidate();
  expect(app.fixtureColour!(app.doc.entities.get('F0') as Fixture)).not.toBe(OVER_COLOUR);
  t.deactivate();
  expect(app.fixtureColour).toBeNull();
});

test('the overlay draws circuit labels without throwing', () => {
  const app = withType(500); const calls: string[] = [];
  const ctx: any = new Proxy({}, { get: (o: any, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 20 }) : (..._a: any[]) => { calls.push(String(k)); }), set: (o: any, k, v) => { o[k] = v; return true; } });
  drawPowerOverlay(ctx, app.camera, app.doc, rigPower(app.doc), () => true, 'dark');
  expect(calls).toContain('fillText');
});
