import type { Unit } from '../domain/spacing';
import { UF, parseSections } from '../domain/spacing';
import { fromUniverseAddress } from '../core/geom/address';

/** "10.133" (universe.address) or "4741" (absolute) → absolute DMX address; null if invalid. */
export function parseUA(s: string): number | null {
  const t = String(s).trim();
  let m = t.match(/^(\d+)\s*[./:]\s*(\d+)$/);
  if (m) { const u = +m[1], a = +m[2]; return u >= 1 && a >= 1 && a <= 512 ? fromUniverseAddress(u, a) : null; }
  m = t.match(/^\d+$/);
  return m && +t >= 1 ? +t : null;
}

/** Length typed in the job unit, or with an explicit "mm"/"m"/"ft" suffix → mm. */
export function parseLengthInput(s: string, unit: Unit): number | null {
  const m = String(s).trim().toLowerCase().match(/^(-?\d*\.?\d+)\s*(mm|m|ft|')?$/);
  if (!m) return null;
  const u: Unit = m[2] === 'mm' ? 'mm' : m[2] === 'm' ? 'm' : m[2] === 'ft' || m[2] === "'" ? 'ft' : unit;
  return +m[1] * UF[u];
}

/** mm → a plain number in the job unit, for input fields. */
export function formatLength(mm: number, unit: Unit): string {
  const v = mm / UF[unit];
  const r = unit === 'mm' ? Math.round(v) : Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) || Math.abs(r) < 1e-9 ? 0 : r);
}

export function parseSectionsInput(s: string, unit: Unit): number[] | null {
  if (!String(s).trim()) return [];
  const r = parseSections(s, { unit }); return r ? r.map(x => Math.round(x * 1000) / 1000) : null;
}
export const formatSections = (secs: number[], unit: Unit): string => secs.map(x => formatLength(x, unit)).join('+');
