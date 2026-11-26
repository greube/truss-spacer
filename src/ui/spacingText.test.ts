import { test, expect } from 'vitest';
import { spacingText } from './spacingText';
import { DEFAULT_SPACING } from '../core/model/types';
import type { MarkRow } from '../domain/runMarks';

const row = (k: number, mark: number, o: Partial<MarkRow> = {}): MarkRow => ({ id: 'F' + k, unit: null, s: mark, mark, sec: 1, off: mark, near: false, gap: k ? 1500 : null, offLine: null, uneven: false, ...o });
const rows = [0, 1, 2, 3, 4, 5].map(k => row(k, 250 + k * 1500, { sec: k < 2 ? 1 : k < 4 ? 2 : 3, near: k === 2 }));
const S = { unit: 'm' as const, round: 5 };

test('same shape as v1 copy text', () => {
  expect(spacingText({ name: 'LX1', sections: [3000, 3000, 2000], length: 8000, rows, st: DEFAULT_SPACING, S, showSec: false, provisional: false })).toBe(
    'LX1\nTruss 3+3+2 = 8.000 m, 6 fixtures, gap 1.500 m\nMarks from end A:\n1. 0.250 m\n2. 1.750 m\n3. 3.250 m NEAR JOIN\n4. 4.750 m\n5. 6.250 m\n6. 7.750 m');
});
test('in-section distances, offsets, unit numbers and flags', () => {
  const t = spacingText({ name: 'LX1', sections: [3000, 3000, 2000], length: 8000, rows: [row(0, -250, { unit: 7, sec: 1, off: 250, offLine: 420 }), row(1, 1250, { unit: 8, uneven: true, gap: 1250 })],
    st: { ...DEFAULT_SPACING, offset: 500, offsetSide: 'before' }, S, showSec: true, provisional: false });
  expect(t).toContain('Marks from end A (end A is 0.500 m before your 0):');
  expect(t).toContain('7. −0.250 m  (sec 1 +0.250 m) OFF LINE 0.420 m');
  expect(t).toContain('8. 1.250 m  (sec 1 +1.250 m) UNEVEN GAP');
  expect(t).toContain('gaps vary');
});
test('centre with an offset, and provisional drafts', () => {
  const t = spacingText({ name: 'Expo Flown A', sections: [], length: 23673, rows, st: { ...DEFAULT_SPACING, ref: 'centre', offset: 500, offsetSide: 'after' }, S, showSec: false, provisional: true });
  expect(t.split('\n')[0]).toBe('PROVISIONAL: confirm the truss first');
  expect(t).toContain('Marks from the centre (truss 0.500 m towards B), − towards A, + towards B:');
  expect(t).toContain('1. +0.250 m');
});
test('a run whose sections disagree with the drawing says so (review fix)', async () => {
  const { mismatchNote } = await import('./spacingText');
  const legs = [{ a: { x: 0, y: 0, z: 0 }, b: { x: 3700, y: 0, z: 0 }, sections: [3000, 1000] }, { a: { x: 3700, y: 0, z: 0 }, b: { x: 3700, y: 3000, z: 0 }, sections: [3000] }];
  const note = mismatchNote({ legs } as any, S);
  expect(note).toBe('Check the truss: leg 1 sections add up to 4.000 m but it is drawn 3.700 m. Marks use the drawing.');
  expect(mismatchNote({ legs: [legs[1]] } as any, S)).toBe('');
  const one = mismatchNote({ legs: [legs[0]] } as any, S);
  expect(one).toBe('Check the truss: its sections add up to 4.000 m but it is drawn 3.700 m. Marks use the drawing.');
  const t = spacingText({ name: 'LX1', sections: [3000, 1000, 3000], length: 6700, rows: [], st: DEFAULT_SPACING, S, showSec: false, provisional: false, mismatch: note });
  expect(t.split('\n')[0]).toBe(note);
});
