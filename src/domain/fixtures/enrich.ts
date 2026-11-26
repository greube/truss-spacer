import type { Doc } from '../../core/model/types';
import { matchType } from './match';
import { categorise } from './category';

/**
 * Fills in a freshly imported job's types: wattage and source for confident database matches,
 * and a plan symbol category for every type. Uncertain and unknown types are left for the review.
 * Mutates the new doc directly (it's part of creating it, before any undo history exists).
 */
export function enrichTypes(doc: Doc): { matched: number; uncertain: number; unknown: number } {
  const names = new Map<string, string>();
  for (const e of doc.entities.values()) if (e.kind === 'fixture' && !names.has(e.typeKey)) names.set(e.typeKey, e.name);
  const out = { matched: 0, uncertain: 0, unknown: 0 };
  for (const t of doc.types.values()) {
    const r = matchType(t, names.get(t.key) ?? '');
    const best = r.candidates[0];
    t.category = categorise(t.m, t.n) !== 'generic' ? categorise(t.m, t.n) : best ? categorise(best.m, best.n) : 'generic';
    if (t.w != null) continue;
    if (r.status === 'matched' && best) { t.w = best.w; t.src = best.src; t.url = best.url; out.matched++; }
    else out[r.status]++;
  }
  return out;
}
