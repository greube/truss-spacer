import { describe, test, expect, beforeEach } from 'vitest';
import { search, mine, addMine, removeMine, label, count } from './db';
import { matchType } from './match';
import { categorise } from './category';
import type { FixtureType } from '../../core/model/types';

const t = (m: string, n: string, extra: Partial<FixtureType> = {}): FixtureType => ({ key: `${m}@${n}`, m, n, w: null, src: null, url: '', gdtfSpec: '', mode: '', category: 'generic', ...extra });
const mem: Record<string, string> = {};
beforeEach(() => {
  for (const k in mem) delete mem[k];
  (globalThis as any).localStorage = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = v; } };
});

describe('database', () => {
  test('has the curated and OFL fixtures', () => { expect(count()).toBe(780); });
  test('search ranks model matches first', () => { expect(label(search('megapointe')[0])).toBe('Robe MegaPointe'); });
  test('my fixtures are searchable and removable', () => {
    const f = addMine('Generic', 'Mole 2-lite', 1300);
    expect(search('mole')[0].key).toBe(f.key); expect(mine()).toHaveLength(1);
    removeMine(f.key); expect(mine()).toHaveLength(0);
  });
  test('broken storage gives an empty list', () => {
    (globalThis as any).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(mine()).toEqual([]);
  });
});

describe('matching imported types', () => {
  test('exact manufacturer and model', () => { const r = matchType(t('Ayrton', 'Mistral')); expect(r.status).toBe('matched'); expect(r.candidates[0].w).toBe(550); });
  test('another curated one', () => { expect(matchType(t('Ayrton', 'Eurus')).candidates[0].w).toBe(900); });
  test('punctuation differences still match (A.leda vs Aleda)', () => {
    const r = matchType(t('Clay Paky', 'Aleda B-EYE K10'));
    expect(r.status).toBe('matched'); expect(r.candidates[0].n).toMatch(/B-EYE K10/);
  });
  test('prefers a curated spec-sheet figure', () => { expect(matchType(t('Clay Paky', 'Sharpy')).candidates[0]).toMatchObject({ w: 350, src: 's' }); });
  test('an unknown fixture is unknown', () => { expect(matchType(t('Silver Star', 'Pluto 2000')).status).toBe('unknown'); });
  test('a Custom type with no close name match is unknown, not a loose guess', () => {
    expect(matchType(t('Custom', 'Light_Instr_ShowPro_CYC_RGBW'), 'ShowPro CYC RGBW')).toMatchObject({ status: 'unknown', candidates: [] });
  });
  test('Custom types match on the fixture name, and are never sure', () => {
    expect(matchType(t('Custom', 'Light_Instr_ShowPro_CYC_RGBW'), 'ShowPro CYC RGBW').status).not.toBe('matched');
  });
  test('an extra-word match with one wattage is sure (BMFL: Spot, Blade, WashBeam all 2000 W)', () => {
    const r = matchType(t('Robe', 'BMFL')); expect(r.status).toBe('matched'); expect(r.candidates.every(c => c.w === 2000)).toBe(true);
  });
  test('an ambiguous model is "uncertain" with candidates (Rogue R2: Spot 301 W, Wash 324 W)', () => {
    const r = matchType(t('Chauvet Professional', 'Rogue R2'));
    expect(r.status).toBe('uncertain'); expect(r.candidates.length).toBeGreaterThan(0); expect(r.candidates.length).toBeLessThanOrEqual(5);
  });
});

describe('symbol categories', () => {
  test.each([
    ['Elation', 'SIXBAR 1000', 'strip'], ['MDG', 'theFAN', 'effect'], ['Clay Paky', 'Sharpy', 'beam'], ['Martin', 'Atomic 3000', 'strobe'],
    ['ETC', 'Source Four LED', 'profile'], ['Robe', 'BMFL Spot', 'spot'], ['Martin', 'MAC Aura XB', 'wash'], ['ShowPro', 'Fusion Par Q VII', 'par'],
    ['MDG', 'ATMe', 'effect'], ['Clay Paky', 'Aleda B-EYE K10', 'wash'], ['Ayrton', 'Mistral', 'generic'],
  ])('%s %s -> %s', (m, n, c) => { expect(categorise(m, n)).toBe(c); });
});
