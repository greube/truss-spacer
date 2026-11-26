import { test, expect } from 'vitest';
import { Camera } from './camera';

test('fit then round trip stays precise about 100 m from the origin', () => {
  const c = new Camera(); c.setViewport(412, 700); c.fit({ min: { x: 90000, y: -40000 }, max: { x: 130000, y: 45000 } });
  const s = c.toScreen({ x: 110000, y: 0 }); const w = c.toWorld(s);
  expect(w.x).toBeCloseTo(110000, 3); expect(w.y).toBeCloseTo(0, 3);
  expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(412);
});
test('screen y points down, world y points up', () => {
  const c = new Camera(); c.setViewport(100, 100); c.cx = 0; c.cy = 0; c.scale = 1;
  expect(c.toScreen({ x: 0, y: 10 }).y).toBe(40);
});
test('zooming keeps the point under the finger still', () => {
  const c = new Camera(); c.setViewport(412, 700); c.fit({ min: { x: 0, y: 0 }, max: { x: 20000, y: 10000 } });
  const under = c.toWorld({ x: 100, y: 100 }); c.zoomAt({ x: 100, y: 100 }, 2);
  const s = c.toScreen(under); expect(s.x).toBeCloseTo(100, 6); expect(s.y).toBeCloseTo(100, 6);
});
test('zoom is clamped', () => {
  const c = new Camera(); c.setViewport(100, 100); c.scale = 1; c.zoomAt({ x: 50, y: 50 }, 1000); expect(c.scale).toBe(2);
  c.zoomAt({ x: 50, y: 50 }, 1e-9); expect(c.scale).toBe(0.0005);
});
test('panning by pixels', () => {
  const c = new Camera(); c.setViewport(100, 100); c.cx = 0; c.cy = 0; c.scale = 0.5; c.panBy(10, 10);
  expect(c.cx).toBe(-20); expect(c.cy).toBe(20);
});
test('visible world bounds', () => {
  const c = new Camera(); c.setViewport(200, 100); c.cx = 0; c.cy = 0; c.scale = 1;
  expect(c.viewBounds()).toEqual({ min: { x: -100, y: -50 }, max: { x: 100, y: 50 } });
});
