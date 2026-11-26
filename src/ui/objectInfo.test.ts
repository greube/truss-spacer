import { test, expect } from 'vitest';
import { parseUA, parseLengthInput, formatLength, parseSectionsInput, formatSections } from './parse';

test('DMX address input: universe.address or absolute', () => {
  expect(parseUA('10.133')).toBe(4741); expect(parseUA('4741')).toBe(4741); expect(parseUA(' 1.1 ')).toBe(1);
  expect(parseUA('1.513')).toBeNull(); expect(parseUA('0.1')).toBeNull(); expect(parseUA('abc')).toBeNull(); expect(parseUA('')).toBeNull();
});
test('length input in the job unit, with optional suffix', () => {
  expect(parseLengthInput('2.5', 'm')).toBe(2500); expect(parseLengthInput('2500', 'mm')).toBe(2500);
  expect(parseLengthInput('250mm', 'm')).toBe(250); expect(parseLengthInput('1.2 m', 'mm')).toBe(1200);
  expect(parseLengthInput('10', 'ft')).toBeCloseTo(3048); expect(parseLengthInput('-1.5', 'm')).toBe(-1500);
  expect(parseLengthInput('x', 'm')).toBeNull(); expect(parseLengthInput('', 'm')).toBeNull();
});
test('lengths shown in the job unit', () => {
  expect(formatLength(2500, 'm')).toBe('2.5'); expect(formatLength(2500, 'mm')).toBe('2500'); expect(formatLength(-0.0004, 'm')).toBe('0');
});
test('sections as 3+3+2 in the job unit', () => {
  expect(parseSectionsInput('3+3+2', 'm')).toEqual([3000, 3000, 2000]); expect(parseSectionsInput('2x2.5', 'm')).toEqual([2500, 2500]);
  expect(parseSectionsInput('', 'm')).toEqual([]); expect(parseSectionsInput('3+x', 'm')).toBeNull();
  expect(formatSections([3000, 3000, 2000], 'm')).toBe('3+3+2'); expect(formatSections([], 'm')).toBe('');
});
