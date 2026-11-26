import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Gestures } from './input';

function harness() {
  const el = new EventTarget() as any; el.getBoundingClientRect = () => ({ left: 0, top: 0 }); el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
  const log: string[] = [];
  const h = { tap: () => log.push('tap'), longpress: () => log.push('longpress'), dragstart: () => log.push('dragstart'), drag: () => log.push('drag'),
    dragend: () => log.push('dragend'), dragcancel: () => log.push('dragcancel'), pinch: (_c: any, s: number) => log.push('pinch:' + s.toFixed(2)),
    wheel: () => log.push('wheel'), twoFingerTap: () => log.push('twoFingerTap'), hover: () => log.push('hover'), pan: () => { if (log[log.length - 1] !== 'pan') log.push('pan'); } };
  new Gestures(el, h);
  const ev = (type: string, id: number, x: number, y: number, pointerType = 'touch', extra: any = {}) => {
    const e: any = new Event(type); Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, ...extra });
    el.dispatchEvent(e);
  };
  return { log, ev };
}
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());

describe('gestures', () => {
  test('a wobbly tap is a tap, not a drag', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100); ev('pointermove', 1, 104, 103); vi.advanceTimersByTime(150); ev('pointerup', 1, 104, 103);
    expect(log).toEqual(['tap']);
  });
  test('moving past the threshold starts a drag', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100); ev('pointermove', 1, 120, 100); ev('pointermove', 1, 140, 100); ev('pointerup', 1, 140, 100);
    expect(log).toEqual(['dragstart', 'drag', 'drag', 'dragend']);
  });
  test('a mouse drags after 3 px', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100, 'mouse'); ev('pointermove', 1, 104, 100, 'mouse'); ev('pointerup', 1, 104, 100, 'mouse');
    expect(log).toEqual(['dragstart', 'drag', 'dragend']);
  });
  test('a second finger turns a drag into a pinch, cancelling the drag', () => {
    const { log, ev } = harness();
    ev('pointerdown', 1, 100, 100); ev('pointermove', 1, 120, 100);
    ev('pointerdown', 2, 200, 100); ev('pointermove', 2, 260, 100);
    ev('pointerup', 2, 260, 100); ev('pointermove', 1, 130, 100); ev('pointerup', 1, 130, 100);
    expect(log.slice(0, 3)).toEqual(['dragstart', 'drag', 'dragcancel']);
    expect(log).toContain('pinch:1.75'); // fingers 80 px apart, then 140 px
    expect(log.filter(x => x === 'dragend' || x === 'tap')).toEqual([]);
  });
  test('holding still is a long press', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100); vi.advanceTimersByTime(600); ev('pointerup', 1, 100, 100);
    expect(log).toEqual(['longpress']);
  });
  test('a quick two-finger tap', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100); ev('pointerdown', 2, 200, 100); vi.advanceTimersByTime(100); ev('pointerup', 1, 100, 100); ev('pointerup', 2, 200, 100);
    expect(log).toEqual(['twoFingerTap']);
  });
  test('a mouse held still then dragged is a drag, not a long press', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100, 'mouse'); vi.advanceTimersByTime(700); ev('pointermove', 1, 120, 100, 'mouse'); ev('pointerup', 1, 120, 100, 'mouse');
    expect(log).toEqual(['dragstart', 'drag', 'dragend']);
  });
  test('a middle-button drag pans instead of selecting', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100, 'mouse', { button: 1, buttons: 4 }); ev('pointermove', 1, 130, 110, 'mouse', { buttons: 4 }); ev('pointerup', 1, 130, 110, 'mouse', { button: 1 });
    expect(log).toEqual(['pan']);
  });
  test('a brief second finger during a drag is not an undo tap', () => {
    const { log, ev } = harness(); ev('pointerdown', 1, 100, 100); ev('pointermove', 1, 220, 100);
    ev('pointerdown', 2, 300, 100); vi.advanceTimersByTime(80); ev('pointerup', 2, 300, 100); ev('pointerup', 1, 220, 100);
    expect(log).not.toContain('twoFingerTap');
  });
  test('mouse movement without a button is hover', () => {
    const { log, ev } = harness(); ev('pointermove', 1, 10, 10, 'mouse', { buttons: 0 }); expect(log).toEqual(['hover']);
  });
});
