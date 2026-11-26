import type { FixtureType } from '../../core/model/types';
import { all, mine, norm, search } from './db';
import type { DbType } from './db';

const compact = (s: string) => norm(s).replace(/ /g, '');
const curated = (t: DbType) => t.src === 's' || t.src === 'l' || t.src === 'm';

/**
 * Matches an imported fixture type to the wattage database.
 * matched: same manufacturer, and the model is the same once spaces and punctuation are ignored,
 *          or is that plus one extra word (e.g. "Classic") when that's unambiguous (one candidate, or all the same wattage).
 * uncertain: there are plausible candidates, but none meets that test (up to 5).
 * unknown: nothing plausible.
 * Custom/Generic/blank manufacturers are matched on the fixture name and are never "matched".
 */
export function matchType(t: FixtureType, fixtureName = ''): { status: 'matched' | 'uncertain' | 'unknown'; candidates: DbType[] } {
  const loose = !t.m || /^(custom|generic)$/i.test(t.m);
  if (loose) {
    const q = fixtureName || t.n.replace(/_/g, ' ');
    let cands = search(q, 5);
    if (!cands.length) { const words = norm(q).split(' ').filter(w => w.length > 2); for (const w of words) { cands = search(w, 5); if (cands.length) break; } }
    return { status: cands.length ? 'uncertain' : 'unknown', candidates: cands };
  }
  const man = compact(t.m), model = compact(t.n), modelWords = norm(t.n).split(' ').length;
  const pool = mine().concat(all()).filter(c => compact(c.m) === man);
  const exact = pool.filter(c => compact(c.n) === model);
  const plusOne = pool.filter(c => { const cn = compact(c.n); return cn !== model && cn.startsWith(model) && norm(c.n).split(' ').length - modelWords <= 1 && model.length >= 3; });
  const rank = (xs: DbType[]) => xs.slice().sort((a, b) => Number(curated(b)) - Number(curated(a)));
  // An extra-word match is only sure when it's unambiguous: one candidate, or all with the same wattage
  const plusOk = plusOne.length > 0 && new Set(plusOne.map(c => c.w)).size === 1;
  const sure = exact.length ? [...rank(exact), ...rank(plusOne)] : plusOk ? rank(plusOne) : [];
  if (sure.length) return { status: 'matched', candidates: sure.slice(0, 5) };
  // plausible: same manufacturer and the model shares a word, or the model contains the query
  const qWords = norm(t.n).split(' ').filter(w => w.length >= 2);
  const close = pool.filter(c => { const cn = compact(c.n); return cn.includes(model) || model.includes(cn) || qWords.some(w => norm(c.n).split(' ').includes(w)); });
  const cands = rank(close).slice(0, 5);
  return { status: cands.length ? 'uncertain' : 'unknown', candidates: cands };
}
