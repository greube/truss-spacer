import { test, expect } from 'vitest';
import { enrichTypes } from './enrich';
import { newDoc } from '../../core/model/doc';
import { History } from '../../core/commands/history';
import { updateType } from '../../core/commands/ops';
import type { FixtureType } from '../../core/model/types';

const t = (m: string, n: string): FixtureType => ({ key: `${m}@${n}`, m, n, w: null, src: null, url: '', gdtfSpec: `${m}@${n}.gdtf`, mode: '', category: 'generic' });
test('matched types get wattage and source; everything gets a symbol category', () => {
  const d = newDoc(); for (const x of [t('Ayrton', 'Mistral'), t('Silver Star', 'Pluto 2000'), t('Elation', 'SIXBAR 1000')]) d.types.set(x.key, x);
  const s = enrichTypes(d);
  expect(d.types.get('Ayrton@Mistral')).toMatchObject({ w: 550, src: 's' });
  expect(d.types.get('Ayrton@Mistral')!.url).toMatch(/^https:/);
  expect(d.types.get('Silver Star@Pluto 2000')!.w).toBeNull();
  expect(d.types.get('Elation@SIXBAR 1000')!.category).toBe('strip');
  expect(s).toMatchObject({ matched: 2, unknown: 1 });
});
test('updating a type is undoable', () => {
  const d = newDoc(); d.types.set('a@b', t('a', 'b')); const h = new History(d);
  h.exec(updateType('a@b', { w: 700, src: 'm' })); expect(d.types.get('a@b')!.w).toBe(700);
  h.undo(); expect(d.types.get('a@b')!.w).toBeNull();
});
