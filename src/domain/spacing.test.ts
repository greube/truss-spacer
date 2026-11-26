// Checks the TypeScript port against output recorded from v1 (main, commit 39fcb92) in Chromium.
import { test, expect } from 'vitest';
import * as SP from './spacing';
import golden from './v1-golden.json';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
test(`matches v1 for ${(golden as any[]).length} recorded settings`, () => {
  (golden as any[]).forEach(({ S, out }, k) => {
    const where = `case ${k}: ${JSON.stringify(S)}`;
    const r = SP.compute(S);
    if ('err' in r) { expect(out.err, where).toBe(r.err); expect(out.r, where).toBeNull(); return; }
    expect(out.err, where).toBe(r.warn || null);
    expect(close(out.r.L, r.L), where).toBe(true);
    expect(out.r.rows.length, where).toBe(r.rows.length);
    r.rows.forEach((row, i) => {
      const g = out.r.rows[i];
      for (const key of ['i', 'sec', 'near'] as const) expect(g[key], `${where} row ${i} ${key}`).toBe(row[key]);
      for (const key of ['p', 'mark', 'off'] as const) expect(close(g[key], row[key]), `${where} row ${i} ${key}`).toBe(true);
      expect(g.gap === null ? row.gap === null : close(g.gap, row.gap!), `${where} row ${i} gap`).toBe(true);
      const cells = out.marks[i];
      expect(cells[0]).toBe(String(i + 1));
      expect(cells[1], `${where} row ${i} mark text`).toBe(SP.markTxt(row, S) + (row.near ? 'Near a join' : ''));
      expect(cells[cells.length - 1], `${where} row ${i} gap text`).toBe(row.gap != null ? SP.fmt(row.gap, false, S) : '—');
    });
    expect(out.sum[0], where).toBe(SP.fmt(r.L, false, S));
  });
});
test('feet and inches formatting', () => {
  const S = { unit: 'ft' as const, round: 3.175 };
  expect(SP.fmt(304.8, false, S)).toBe('1′ 0″');
  expect(SP.fmt(304.8 + 25.4 * 1.5, false, S)).toBe('1′ 1 1/2″');
  expect(SP.fmt(-12.7, true, S)).toBe('−0′ 0 1/2″');
});
