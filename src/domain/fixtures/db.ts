import data from './data.json';

/** A fixture from the database or "my fixtures". src: s spec sheet, l rated, o Open Fixture Library, m user's own. */
export interface DbType { key: string; m: string; n: string; w: number; src: 's' | 'l' | 'o' | 'm'; url: string }
type Indexed = DbType & { hay: string; hayN: string };

const KEY = 'trussSpacerMyFixtures';
export const SRC_LABEL: Record<string, string> = { s: 'Spec sheet', l: 'Rated', o: 'Open Fixture Library', m: 'My fixture', j: 'This job' };
export const norm = (s: string): string => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const index = (t: DbType): Indexed => ({ ...t, hay: ' ' + norm(t.m + ' ' + t.n) + ' ', hayN: ' ' + norm(t.n) + ' ' });

let db: Indexed[] | null = null;
export function all(): DbType[] {
  if (!db) db = (data.rows as [string, string, string, number, DbType['src'], string][]).map(r => index({ key: r[0], m: r[1], n: r[2], w: r[3], src: r[4], url: r[5] || '' }));
  return db;
}
export const count = (): number => all().length;

export function mine(): DbType[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a.filter((x: any) => x && typeof x.key === 'string' && typeof x.n === 'string' && x.w > 0) : [];
  } catch { return []; }
}
function saveMine(a: DbType[]): boolean { try { localStorage.setItem(KEY, JSON.stringify(a)); return true; } catch { return false; } }
export function addMine(m: string, n: string, w: number): DbType {
  const t: DbType = { key: 'my:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), m: String(m || '').trim().slice(0, 60), n: String(n).trim().slice(0, 80), w: Math.round(+w), src: 'm', url: '' };
  const a = mine(); a.unshift(t); saveMine(a.slice(0, 500)); return t;
}
export function removeMine(key: string): void { saveMine(mine().filter(x => x.key !== key)); }

/** All query words must appear; model-name matches and curated spec sheets rank first. */
export function search(q: string, limit = 40): DbType[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const pool: Indexed[] = mine().map(index).concat(all() as Indexed[]);
  const out: [number, Indexed][] = [];
  for (const t of pool) {
    if (!words.every(w => t.hay.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (t.hayN.includes(' ' + w + ' ')) score += 6; else if (t.hayN.includes(' ' + w)) score += 4; else if (t.hayN.includes(w)) score += 2;
      if (t.hay.startsWith(' ' + w)) score += 1;
    }
    score += t.src === 'm' ? 5 : t.src === 's' || t.src === 'l' ? 3 : 0;
    score -= t.n.length / 40;
    out.push([score, t]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map(x => x[1]);
}

export const label = (t: { m: string; n: string } | null | undefined): string => (t ? (t.m && t.m !== 'Generic' ? t.m + ' ' : '') + t.n : '');
