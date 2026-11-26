import type { TrussSpacing } from '../core/model/types';
import type { MarkRow } from '../domain/runMarks';
import type { FmtSettings } from '../domain/spacing';
import { fmt } from '../domain/spacing';
import { markLabel } from '../domain/runMarks';
import { formatSections } from './parse';

export interface SpacingTextIn { name: string; sections: number[]; length: number; rows: MarkRow[]; st: TrussSpacing; S: FmtSettings; showSec: boolean; provisional: boolean }

/** Plain-text marks list for texting to crew, in v1's format (name, truss line, "Marks from …:", one line per fixture). */
export function spacingText(x: SpacingTextIn): string {
  const f = (mm: number, signed = false) => fmt(mm, signed, x.S);
  const n = x.rows.length;
  const gaps = x.rows.map(r => r.gap).filter((g): g is number => g != null).sort((a, b) => a - b);
  const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  const gapTxt = med == null ? '—' : x.rows.some(r => r.uneven) ? `gaps vary (mostly ${f(med)})` : f(med);
  const truss = x.sections.length ? `Truss ${formatSections(x.sections, x.S.unit)} = ${f(x.length)}` : `Truss ${f(x.length)}`;
  const off = x.st.offset ? f(x.st.offset) : '';
  const from = x.st.ref === 'a' ? `end A${off ? ` (end A is ${off} ${x.st.offsetSide === 'before' ? 'before' : 'past'} your 0)` : ''}`
    : x.st.ref === 'b' ? 'end B'
    : `the centre${off ? ` (truss ${off} towards ${x.st.offsetSide === 'after' ? 'B' : 'A'})` : ''}, − towards A, + towards B`;
  const lines = x.rows.map((r, k) => `${r.unit ?? k + 1}. ${markLabel(r.mark, x.st, x.S)}${x.showSec ? `  (sec ${r.sec} +${f(r.off)})` : ''}`
    + `${r.near ? ' NEAR JOIN' : ''}${r.offLine != null ? ` OFF LINE ${f(r.offLine)}` : ''}${r.uneven ? ' UNEVEN GAP' : ''}`);
  return [x.provisional ? 'PROVISIONAL: confirm the truss first' : null, x.name, `${truss}, ${n} fixture${n === 1 ? '' : 's'}, gap ${gapTxt}`, `Marks from ${from}:`, ...lines]
    .filter((l): l is string => l != null).join('\n');
}
