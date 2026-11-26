import { test, expect } from 'vitest';
import { Pdf } from './pdf';

const latin1 = (b: Uint8Array) => Array.from(b, c => String.fromCharCode(c)).join('');

test('a valid file: header, trailer, page count and exact xref offsets', () => {
  const p = new Pdf(); p.page(420, 297); p.line(10, 10, 100, 10); p.page(210, 297); p.text(20, 20, 'Hi', 10);
  const s = latin1(p.bytes());
  expect(s.startsWith('%PDF-1.4')).toBe(true);
  expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  expect(s).toMatch(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count 2/);
  const xref = +s.match(/startxref\s+(\d+)/)![1];
  expect(s.slice(xref, xref + 4)).toBe('xref');
  const rows = s.slice(xref).split('\n').slice(3).filter(l => /^\d{10} 00000 n/.test(l));
  rows.forEach((r, i) => { const off = +r.slice(0, 10); expect(s.slice(off, off + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)); });
  expect(rows.length).toBeGreaterThan(4);
});

test('text is escaped and mapped to WinAnsi; anything else becomes ?', () => {
  const p = new Pdf(); p.page(100, 100); p.text(10, 10, 'A (b) \\ – × 🎭 é', 10);
  const s = latin1(p.bytes());
  expect(s).toContain('(A \\(b\\) \\\\ \x96 \xd7 ? \xe9) Tj');
});

test('right-aligned text ends at x; widths follow Helvetica', () => {
  const p = new Pdf();
  expect(p.textWidth('M', 10, 'H')).toBeCloseTo((833 / 1000) * 10 * 25.4 / 72, 4);
  expect(p.textWidth('MM', 10, 'C')).toBeCloseTo(2 * 0.6 * 10 * 25.4 / 72, 4);
  p.page(100, 100); p.text(50, 10, 'MM', 10, { align: 'right' });
  const s = latin1(p.bytes());
  const x = +s.match(/BT \/F1 10 Tf 1 0 0 1 ([\d.]+) /)![1];
  const w = p.textWidth('MM', 10, 'H') * 72 / 25.4;
  expect(x + w).toBeCloseTo(50 * 72 / 25.4, 1);
});
