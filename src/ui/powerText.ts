import type { Doc, Fixture, Id } from '../core/model/types';
import type { RigPower } from '../domain/powerRig';

export const W = (w: number): string => Math.round(w).toLocaleString('en-AU') + ' W';
export const PHASE = ['L1', 'L2', 'L3'] as const;

/** 1, 2, 3, 5 → "1–3, 5" (as v2). */
export function numList(nums: number[]): string {
  nums = nums.slice().sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < nums.length;) {
    let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i + 1 ? `${nums[i]}–${nums[j]}` : j === i + 1 ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** Unit numbers of a set of fixtures (or their Fixture IDs when they have none), with any unnumbered ones noted. */
export function fixtureNums(doc: Doc, ids: Id[]): string {
  const fs = ids.map(id => doc.entities.get(id) as Fixture | undefined).filter((f): f is Fixture => !!f);
  const nums: number[] = [], other: string[] = []; let none = 0;
  for (const f of fs) {
    if (f.unitNumber != null) nums.push(f.unitNumber);
    else if (/^\d+$/.test(f.fixtureId)) nums.push(+f.fixtureId);
    else if (f.fixtureId) other.push(f.fixtureId);
    else none++;
  }
  const listed = [nums.length ? numList(nums) : '', ...other].filter(Boolean).join(', ');
  return [listed, none ? (listed ? `+${none} with no number` : '(no number)') : ''].filter(Boolean).join(' ');
}

/** "MegaPointe ×4, Aura ×2" for a set of fixtures. */
export function typeSummary(doc: Doc, ids: Id[]): string {
  const c = new Map<string, number>();
  for (const id of ids) {
    const f = doc.entities.get(id) as Fixture | undefined; if (!f) continue;
    const k = doc.types.get(f.typeKey)?.n || f.name || 'No type';
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return [...c].map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(', ');
}

/** " (2 with no wattage)" for fixtures counted as 0 W, so they don't pass as real loads. */
export function noWattsNote(doc: Doc, ids: Id[]): string {
  const n = ids.filter(id => { const f = doc.entities.get(id) as Fixture | undefined; const w = f ? doc.types.get(f.typeKey)?.w : null; return !(typeof w === 'number' && Number.isFinite(w) && w >= 0); }).length;
  return n ? ` (${n} with no wattage)` : '';
}

/** The rig's power list for texting, in v2's format, one block per power run. */
export function powerText(jobName: string, rp: RigPower, doc: Doc): string {
  const st = doc.settings.power, tot = rp.plan.total, noW = (ids: Id[]) => noWattsNote(doc, ids);
  const lines = [`POWER: ${jobName}`, `Circuits up to ${W(rp.plan.limit)} (${st.loadPct}% of ${W(st.circuitW)}), ${rp.plan.perSoca} per Socapex`];
  rp.plan.trusses.forEach((pt, gi) => {
    const g = rp.groups[gi];
    lines.push('', `${g.name}: ${W(pt.load)}`);
    for (const so of pt.socas) {
      lines.push(`Socapex ${so.label}`);
      for (const c of so.circuits) {
        const ids = c.fixtures.map(i => g.fixtureIds[i]);
        lines.push(`  ${c.label}${st.phases ? ' ' + PHASE[c.phase - 1] : ''}  #${fixtureNums(doc, ids)}  ${typeSummary(doc, ids)}  ${W(c.load)}${noW(ids)}${c.over ? '  OVER LIMIT' : ''}`);
      }
    }
  });
  lines.push('', `Total ${W(tot.load)} (${(tot.load / 240).toFixed(1)} A at 240 V) on ${tot.circuits} circuit${tot.circuits === 1 ? '' : 's'}, ${tot.socas} Socapex`);
  if (st.phases) lines.push(PHASE.map((p, k) => `${p} ${W(tot.phase[k])}`).join(', '));
  if (tot.unknown) lines.push(`${tot.unknown} fixture${tot.unknown === 1 ? '' : 's'} with no wattage, counted as 0 W`);
  return lines.join('\n');
}
