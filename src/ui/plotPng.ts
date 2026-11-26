/* Plot image of one truss run, adapted from v1's buildPng (main). A run with corners is drawn unrolled (corners are joins). */
import type { TrussSpacing } from '../core/model/types';
import type { MarkRow } from '../domain/runMarks';
import type { FmtSettings } from '../domain/spacing';
import { fmt, rnd, ROUNDS } from '../domain/spacing';
import { markLabel } from '../domain/runMarks';
import { formatSections } from './parse';

export interface RunPlot {
  name: string; jobName: string; sections: number[]; corners: number[]; length: number; zero: number;
  rows: MarkRow[]; st: TrussSpacing; S: FmtSettings; showSec: boolean; provisional: boolean;
}

export async function buildRunPng(r: RunPlot): Promise<Blob | null> {
  try { await Promise.all(["400 30px Barlow", "500 30px Barlow", "600 30px Barlow", "700 30px 'Barlow Condensed'", "500 30px 'JetBrains Mono'", "700 30px 'JetBrains Mono'"].map(f => document.fonts.load(f))); await document.fonts.ready; } catch { /* fonts optional */ }
  const C = { bg: '#ffffff', ink: '#16181c', muted: '#666d78', line: '#d8d6cf', band: '#f4f3ef', accent: '#c97f00', warn: '#d13b1c', truss: '#3a3f48' };
  const FD = "'Barlow Condensed','Arial Narrow',sans-serif", FB = 'Barlow,Arial,sans-serif', FM = "'JetBrains Mono',monospace";
  const f = (mm: number) => fmt(mm, false, r.S), mk = (row: MarkRow) => markLabel(row.mark, r.st, r.S);
  const n = r.rows.length, rowH = 58, tableTop = 960, W = 2400, P = 150, H = tableTop + 70 + n * rowH + 110;
  const RL = r.length || 1, refName = r.st.ref === 'a' ? 'end A' : r.st.ref === 'b' ? 'end B' : 'centre';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const X = (p: number) => P + (p * (W - 2 * P)) / RL;
  const T = (s: string, x: number, y: number, font: string, col: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'alphabetic') => { c.font = font; c.fillStyle = col; c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y); };
  const L = (x1: number, y1: number, x2: number, y2: number, col: string, w = 2, dash?: number[]) => { c.beginPath(); c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.setLineDash([]); };
  const fit = (s: string, font: string, max: number) => { c.font = font; if (c.measureText(s).width <= max) return s; while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  c.fillStyle = C.bg; c.fillRect(0, 0, W, H);

  // Header: truss name, job and date; provisional stamp for drafts
  const title = fit(r.name.toUpperCase(), `700 76px ${FD}`, 1300); T(title, P, 110, `700 76px ${FD}`, C.ink);
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  c.font = `700 76px ${FD}`; const tw = c.measureText(title).width;
  c.font = `500 32px ${FB}`; const room = W - 2 * P - tw - 80 - c.measureText('   ·   ' + date).width;
  T((room > 60 ? fit(r.jobName, `500 32px ${FB}`, room) + '   ·   ' : '') + date, W - P, 110, `500 32px ${FB}`, C.muted, 'right');
  const gaps = r.rows.map(x => x.gap).filter((g): g is number => g != null).sort((a, b) => a - b);
  const gap = gaps.length ? (r.rows.some(x => x.uneven) ? `Gaps vary (mostly ${f(gaps[Math.floor(gaps.length / 2)])})` : `Gap ${f(gaps[Math.floor(gaps.length / 2)])}`) : 'Gap —';
  T(`${r.sections.length ? `Truss ${formatSections(r.sections, r.S.unit)} = ` : 'Truss '}${f(RL)}   ·   ${n} fixture${n === 1 ? '' : 's'}   ·   ${gap}`, P, 165, `500 34px ${FB}`, C.ink);
  const off = r.st.offset ? f(r.st.offset) : '';
  T(`Marks measured from ${refName}${r.st.ref === 'centre' ? (off ? `, truss ${off} towards ${r.st.offsetSide === 'after' ? 'B' : 'A'} (− towards A, + towards B)` : ' (− towards A, + towards B)') : r.st.ref === 'a' && off ? ` (end A is ${off} ${r.st.offsetSide === 'before' ? 'before' : 'past'} your 0)` : ''}${r.corners.length ? `   ·   ${r.corners.length} corner${r.corners.length > 1 ? 's' : ''}, shown unrolled` : ''}`, P, 212, `400 30px ${FB}`, C.muted);
  if (r.provisional) {
    c.save(); c.translate(W - P - 300, 190); c.rotate(-0.06); c.strokeStyle = C.warn; c.lineWidth = 5; c.strokeRect(-230, -44, 460, 70);
    T('PROVISIONAL', 0, -8, `700 52px ${FD}`, C.warn, 'center', 'middle'); c.restore();
  }

  // Truss with sections, joins and corners
  const y1 = 300, y2 = 360; let acc = 0;
  const secs = r.sections.length ? r.sections : [RL];
  secs.forEach((s, k) => {
    const x0 = X(acc), x1 = X(Math.min(RL, acc + s)), cnt = Math.max(1, Math.round((x1 - x0) / 40)), w = (x1 - x0) / cnt;
    for (let i = 0; i < cnt; i++) L(x0 + i * w, i % 2 ? y1 : y2, x0 + (i + 1) * w, i % 2 ? y2 : y1, C.truss, 2.5);
    const lab = `S${r.st.ref === 'b' ? secs.length - k : k + 1}  ${f(s)}`; c.font = `500 26px ${FM}`;
    if (x1 - x0 > 40) T(c.measureText(lab).width < x1 - x0 - 20 ? lab : f(s), (x0 + x1) / 2, y1 - 22, `500 26px ${FM}`, C.muted, 'center');
    acc += s;
  });
  L(X(0), y1, X(RL), y1, C.truss, 7); L(X(0), y2, X(RL), y2, C.truss, 7);
  const joins: number[] = []; acc = 0; secs.forEach((s, i) => { if (i) joins.push(acc); acc += s; });
  c.fillStyle = C.truss; [0, ...joins, RL].forEach(j => c.fillRect(X(j) - 6, y1 - 10, 12, y2 - y1 + 20));
  for (const cn of r.corners) { L(X(cn), y1 - 34, X(cn), y2 + 6, C.accent, 3, [6, 5]); T('CORNER', X(cn), y1 - 40, `600 20px ${FB}`, C.accent, 'center'); }
  T('A', X(0), y2 + 40, `700 30px ${FD}`, C.accent, 'center'); T('B', X(RL), y2 + 40, `700 30px ${FD}`, C.accent, 'center');

  // Fixtures, numbered as in the table
  const num = new Map(r.rows.map((row, k) => [row.id, row.unit ?? k + 1]));
  const sorted = r.rows.slice().sort((a, b) => a.s - b.s), small = n > 30;
  sorted.forEach(row => {
    const x = X(row.s), col = row.near || row.offLine != null ? C.warn : C.ink;
    L(x, y2, x, y2 + 20, col, 4);
    c.beginPath(); c.moveTo(x - 14, y2 + 20); c.lineTo(x + 14, y2 + 20); c.lineTo(x + 8, y2 + 58); c.lineTo(x - 8, y2 + 58); c.closePath(); c.fillStyle = col; c.fill();
    const rad = small ? 15 : 22; c.beginPath(); c.arc(x, y2 + 95, rad, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = col; c.stroke();
    T(String(num.get(row.id)), x, y2 + 96, `600 ${small ? 18 : 24}px ${FM}`, col, 'center', 'middle');
  });

  // Chain dimensions (gaps, end gaps included)
  const yc = 550, pts = [0, ...sorted.map(x => x.s), RL];
  L(X(0), yc, X(RL), yc, C.ink, 2);
  pts.forEach(p => { const x = X(p); L(x, yc - 14, x, yc + 14, C.ink, 2); L(x - 9, yc + 9, x + 9, yc - 9, C.ink, 3); });
  c.font = `500 26px ${FM}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = X(pts[i]), b = X(pts[i + 1]), seg = pts[i + 1] - pts[i]; if (seg < 0.5) continue;
    const s = f(rnd(seg, r.S)); if (c.measureText(s).width + 14 < b - a) T(s, (a + b) / 2, yc - 16, `500 26px ${FM}`, C.ink, 'center');
  }
  T('GAPS', P - 20, yc, `600 22px ${FB}`, C.muted, 'right', 'middle');

  // 0 and the marks from it
  const yr = 620, zOff = r.zero < -0.5 ? -1 : r.zero > RL + 0.5 ? 1 : 0, rx = X(Math.max(0, Math.min(RL, r.zero)));
  c.beginPath(); c.moveTo(rx, yr - 30); c.lineTo(rx - 14, yr - 4); c.lineTo(rx + 14, yr - 4); c.closePath(); c.fillStyle = C.accent; c.fill();
  if (zOff) T(zOff < 0 ? `◀ 0 is ${f(-r.zero)} past this end` : `0 is ${f(r.zero - RL)} past this end ▶`, zOff < 0 ? rx + 22 : rx - 22, yr - 14, `700 26px ${FM}`, C.accent, zOff < 0 ? 'left' : 'right', 'middle');
  else { const toRight = r.st.ref === 'b' || rx > W - P - 60; T('0', toRight ? rx - 22 : rx + 22, yr - 14, `700 30px ${FM}`, C.accent, toRight ? 'right' : 'left', 'middle'); L(rx, y2 + 4, rx, yr - 34, C.accent, 2, [8, 8]); }
  const fs = small ? 24 : 30, mf = `${r.provisional ? 'italic ' : ''}600 ${fs}px ${FM}`, fs2 = Math.round(fs * 0.78), sf = `500 ${fs2}px ${FM}`;
  const secTxt = (row: MarkRow) => `S${row.sec} +${f(row.off)}`;
  c.font = mf; let labW = Math.max(0, ...sorted.map(row => c.measureText(mk(row)).width));
  if (r.showSec) { c.font = sf; labW = Math.max(labW, ...sorted.map(row => c.measureText(secTxt(row)).width)); }
  const pad = 34, blockH = r.showSec ? fs + fs2 + 8 : fs;
  let minSp = Infinity; for (let i = 1; i < sorted.length; i++) minSp = Math.min(minSp, X(sorted[i].s) - X(sorted[i - 1].s));
  let ang = 0;
  if (labW + pad > minSp) { const need = (blockH + pad * 0.6) / minSp; ang = need >= 1 ? Math.PI / 2 : Math.max(Math.asin(need), Math.PI / 6); }
  const ext = (labW * Math.cos(ang)) / 2, vh = (labW * Math.sin(ang) + blockH * Math.cos(ang)) / 2, cyM = yr + 18 + vh;
  if (sorted.length && X(sorted[0].s) - ext > P - 10) T('MARKS', P - 20, yr + 40, `600 22px ${FB}`, C.muted, 'right', 'middle');
  sorted.forEach(row => {
    const x = X(row.s); L(x, yc + 16, x, yr + 4, C.line, 2, [6, 6]);
    c.save(); c.translate(x, cyM); c.rotate(-ang);
    const o = r.showSec ? -(blockH - fs) / 2 : 0;
    T(mk(row), 0, o, mf, row.near ? C.warn : r.provisional ? C.muted : C.ink, 'center', 'middle');
    if (r.showSec) T(secTxt(row), 0, o + fs / 2 + 8 + fs2 / 2, sf, C.muted, 'center', 'middle');
    c.restore();
  });

  // Overall
  const yo = 880; L(X(0), yo, X(RL), yo, C.ink, 2);
  ([[X(0), 1], [X(RL), -1]] as [number, number][]).forEach(([x, d]) => { c.beginPath(); c.moveTo(x, yo); c.lineTo(x + d * 24, yo - 10); c.lineTo(x + d * 24, yo + 10); c.closePath(); c.fillStyle = C.ink; c.fill(); L(x, yo - 24, x, yo + 24, C.ink, 2); });
  const ov = `${f(RL)} overall`; c.font = `600 30px ${FM}`; const ow = c.measureText(ov).width + 30;
  c.fillStyle = C.bg; c.fillRect(W / 2 - ow / 2, yo - 22, ow, 44); T(ov, W / 2, yo, `600 30px ${FM}`, C.ink, 'center', 'middle');

  // Table, in measuring order
  const cols: ([number, string, CanvasTextAlign] | null)[] = r.showSec
    ? [[P, '#', 'left'], [P + 330, `FROM ${refName.toUpperCase()}`, 'right'], [P + 560, 'SECTION', 'right'], [P + 900, 'IN SECTION', 'right'], [P + 1240, 'GAP', 'right'], [P + 1300, '', 'left']]
    : [[P, '#', 'left'], [P + 330, `FROM ${refName.toUpperCase()}`, 'right'], null, null, [P + 640, 'GAP', 'right'], [P + 700, '', 'left']];
  const th = tableTop + 30;
  cols.forEach(col => col && T(col[1], col[0], th, `600 24px ${FB}`, C.muted, col[2]));
  L(P, th + 18, W - P, th + 18, C.line, 2);
  r.rows.forEach((row, k) => {
    const y = th + 18 + k * rowH; if (k % 2) { c.fillStyle = C.band; c.fillRect(P, y, W - 2 * P, rowH); }
    const cy = y + rowH / 2 + 2, fnt = `500 30px ${FM}`;
    T(String(num.get(row.id)), cols[0]![0] + 8, cy, `600 30px ${FM}`, C.ink, 'left', 'middle');
    T(mk(row), cols[1]![0], cy, `700 32px ${FM}`, row.near ? C.warn : C.ink, 'right', 'middle');
    if (r.showSec) { T(String(row.sec), cols[2]![0], cy, fnt, C.ink, 'right', 'middle'); T(f(row.off), cols[3]![0], cy, fnt, C.ink, 'right', 'middle'); }
    T(row.gap != null ? f(rnd(row.gap, r.S)) : '—', cols[4]![0], cy, fnt, C.ink, 'right', 'middle');
    const flags = [row.near ? 'NEAR SECTION JOIN' : '', row.offLine != null ? `OFF LINE ${f(row.offLine)}` : '', row.uneven ? 'UNEVEN GAP' : ''].filter(Boolean).join('  ·  ');
    if (flags) T(flags, cols[5]![0], cy, `600 24px ${FB}`, C.warn, 'left', 'middle');
  });
  const rounding = (r.S.unit === 'ft' ? ROUNDS.ft : ROUNDS.metric).find(x => x[0] === r.S.round)?.[1] ?? `${r.S.round} mm`;
  T(`Rounded to ${r.S.round ? rounding : 'exact values'}.${r.showSec ? `  "In section" is measured from the ${r.st.ref === 'b' ? 'B' : 'A'} end of each section; sections numbered from ${r.st.ref === 'b' ? 'B' : 'A'}.` : ''}${r.provisional ? '  PROVISIONAL: the truss ends were estimated; confirm the truss before marking out.' : ''}`, P, th + 18 + n * rowH + 60, `400 26px ${FB}`, C.muted);
  return await new Promise(res => cv.toBlob(res, 'image/png'));
}
