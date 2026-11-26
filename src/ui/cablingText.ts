import type { Doc } from '../core/model/types';
import type { RigCabling, Chain } from '../domain/cabling';
import { fixtureNums } from './powerText';

export const metres = (mm: number): string => `${+(mm / 1000).toFixed(1)} m`;

const tally = (counts: Map<number, number>) => [...counts].sort((a, b) => a[0] - b[0]).map(([len, n]) => `${metres(len)} × ${n}`);
const chainCounts = (chains: Chain[]) => { const m = new Map<number, number>(); for (const c of chains) for (const x of c.cables) m.set(x.len, (m.get(x.len) ?? 0) + x.count); return m; };

/** The DMX pull list for texting: totals by stock length, then each run's cables in order from its start end. */
export function cablingText(jobName: string, rc: RigCabling, doc: Doc): string {
  const metresAll = [...rc.pull].reduce((a, [len, n]) => a + len * n, 0);
  const lines = [`DMX CABLES: ${jobName}`, `${rc.total} cable${rc.total === 1 ? '' : 's'}, ${metres(metresAll)} in all`, ...tally(rc.pull).map(x => '  ' + x)];
  const label = (id: string | null) => (id ? '#' + fixtureNums(doc, [id]) : 'end');
  for (const r of rc.runs) {
    const head = r.kind === 'truss' ? `${r.name}, from end ${r.from.toUpperCase()}` : r.name;
    lines.push('', `${head}: ${tally(chainCounts(r.chains)).join(', ')}`);
    for (const c of r.chains) {
      if (!c.cables.length) continue;
      lines.push(`  ${c.universe != null ? `Universe ${c.universe}` : 'No universe'}: ${c.cables.map(x => `${label(x.fromId)}→${label(x.toId)} ${x.count > 1 ? `${x.count} × ` : ''}${metres(x.len)}`).join(', ')}`);
    }
    for (const f of r.flags) lines.push(`  ! ${f}`);
  }
  return lines.join('\n');
}
