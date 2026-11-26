import { test, expect } from 'vitest';
import { powerSheetHeight } from './powerPng';
import { planRig } from '../domain/power';
import { DEFAULT_POWER } from '../core/model/types';

test('the sheet is tall enough for every run, Socapex and circuit, plus the phase line', () => {
  const one = planRig([{ id: 'a', watts: [500, 500] }], { ...DEFAULT_POWER, fill: 'fewest' });
  const two = planRig([{ id: 'a', watts: [500, 500] }, { id: 'b', watts: new Array(14).fill(700) }], { ...DEFAULT_POWER, fill: 'fewest' });
  const h1 = powerSheetHeight(one, false), h2 = powerSheetHeight(two, false);
  // a second run adds a header, two Socapex labels and seven circuit rows
  expect(h2 - h1).toBe(96 + 2 * 48 + 7 * 60 + 40);
  expect(powerSheetHeight(one, true) - h1).toBe(60);
});
