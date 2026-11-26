/* The paperwork pack: the scaled plot, then each truss's marks list, the power list and the DMX pull list,
   as text pages built from the same copy-text functions the app uses (so paper matches the screen). */
import type { Doc, Entity, Fixture, Truss } from '../core/model/types';
import { DEFAULT_SPACING } from '../core/model/types';
import { Pdf } from '../io/pdf';
import { drawPlotPage } from './plotPdf';
import { runMarks, runSections, runLength } from '../domain/runMarks';
import { spacingText, mismatchNote } from './spacingText';
import { rigPower } from '../domain/powerRig';
import { powerText } from './powerText';
import { rigCabling } from '../domain/cabling';
import { cablingText } from './cablingText';

const A4 = { w: 210, h: 297 }, M = 15, SIZE = 9, LINE = 4.1, COLS = 92;
const INK: [number, number, number] = [22, 24, 28], MUTED: [number, number, number] = [102, 109, 120];

/** Breaks long lines at spaces (or hard at COLS), keeping a hanging indent for wrapped list lines. */
function wrap(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = raw;
    const indent = ' '.repeat(Math.min(8, (raw.match(/^\s*/)?.[0].length ?? 0) + 4));
    while (line.length > COLS) {
      let cut = line.lastIndexOf(' ', COLS); if (cut <= indent.length) cut = COLS;
      out.push(line.slice(0, cut)); line = indent + line.slice(cut).trimStart();
    }
    out.push(line);
  }
  return out;
}

export function buildPack(doc: Doc, o: { jobName: string; source: string; visible(e: Entity): boolean }): Uint8Array {
  // sections of text, each paginated on its own
  const sections: { title: string; lines: string[] }[] = [];
  const fixtures = [...doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture');
  for (const t of [...doc.entities.values()].filter((e): e is Truss => e.kind === 'truss')) {
    const fx = fixtures.filter(f => f.trussId === t.id);
    if (!fx.length) continue;
    const st = t.spacing ?? DEFAULT_SPACING;
    const rows = runMarks(t, fx, st, doc.settings);
    const txt = spacingText({ name: t.name, sections: runSections(t), length: runLength(t), rows, st, S: doc.settings, showSec: true, provisional: t.state === 'draft', mismatch: mismatchNote(t, doc.settings) });
    sections.push({ title: `Marks: ${t.name}`, lines: wrap(txt) });
  }
  if (fixtures.length) {
    sections.push({ title: 'Power', lines: wrap(powerText(o.jobName, rigPower(doc), doc)) });
    sections.push({ title: 'DMX cables', lines: wrap(cablingText(o.jobName, rigCabling(doc), doc)) });
  } else sections.push({ title: 'Paperwork', lines: ['No fixtures in this job yet.'] });

  const perPage = Math.floor((A4.h - 2 * M - 14) / LINE);
  const pages: { title: string; lines: string[] }[] = [];
  for (const s of sections) for (let i = 0; i < s.lines.length || i === 0; i += perPage) pages.push({ title: s.title, lines: s.lines.slice(i, i + perPage) });
  const total = 1 + pages.length;

  const pdf = new Pdf();
  drawPlotPage(pdf, doc, { jobName: o.jobName, source: o.source, sheet: 1, sheets: total, visible: o.visible });
  pages.forEach((p, k) => {
    pdf.page(A4.w, A4.h);
    pdf.fill(INK).text(M, M, pdf.fit(`${o.jobName || 'Job'} - ${p.title}`, A4.w - 2 * M, 10, 'HB'), 10, { font: 'HB' });
    pdf.stroke(INK).width(0.3).line(M, M + 2.5, A4.w - M, M + 2.5);
    p.lines.forEach((l, i) => pdf.text(M, M + 9 + i * LINE, l, SIZE, { font: 'C' }));
    pdf.fill(MUTED).text(M, A4.h - M + 4, `Truss CAD · ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`, 7);
    pdf.text(A4.w - M, A4.h - M + 4, `Sheet ${k + 2} of ${total}`, 7, { align: 'right' });
  });
  return pdf.bytes();
}
