import type { Category } from '../../core/model/types';

// First match wins, in this order
const RULES: [RegExp, Category][] = [
  [/strobe|atomic|blinder/, 'strobe'],
  [/beam|sharpy/, 'beam'],
  [/profile|source ?four|ellipsoidal|leko/, 'profile'],
  [/spot/, 'spot'],
  [/wash|aura|b ?eye|par.*wash/, 'wash'],
  [/\bpar\b|par\d/, 'par'],
  [/bar|batten|strip|tube|line|cyc/, 'strip'],
  [/fog|haze|fan|atme|smoke/, 'effect'],
];

/** Plan symbol family from the manufacturer and model name. */
export function categorise(m: string, n: string): Category {
  const s = (m + ' ' + n).toLowerCase().replace(/[-_.]/g, ' ');
  for (const [re, c] of RULES) if (re.test(s)) return c;
  return 'generic';
}
