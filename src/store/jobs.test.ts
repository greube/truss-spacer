import { test, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { saveJob, loadJob, listJobs, deleteJob, storageOk, _resetForTests } from './jobs';

beforeEach(() => { (globalThis as any).indexedDB = new IDBFactory(); _resetForTests(); });
const rec = (id: string, updated: number, extra = {}) => ({ id, name: 'Job ' + id, updated, doc: { v: 1, entities: [] }, original: null, sourceName: '', ...extra });

test('save, list and load round trip, including the original MVR bytes', async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 9, 9]);
  expect(await saveJob(rec('A', 1, { original: new Blob([bytes]), sourceName: 'Ford.mvr' }))).toBe(true);
  expect(await listJobs()).toEqual([{ id: 'A', name: 'Job A', updated: 1 }]);
  const j = await loadJob('A');
  expect(j!.sourceName).toBe('Ford.mvr');
  expect(new Uint8Array(await j!.original!.arrayBuffer())).toEqual(bytes);
});
test('newest first, and delete removes', async () => {
  await saveJob(rec('A', 1)); await saveJob(rec('B', 5)); await saveJob(rec('C', 3));
  expect((await listJobs()).map(j => j.id)).toEqual(['B', 'C', 'A']);
  await deleteJob('C'); expect((await listJobs()).map(j => j.id)).toEqual(['B', 'A']);
  expect(await loadJob('C')).toBeNull();
});
test('with no IndexedDB nothing throws', async () => {
  (globalThis as any).indexedDB = undefined; _resetForTests();
  expect(await storageOk()).toBe(false); expect(await saveJob(rec('A', 1))).toBe(false);
  expect(await listJobs()).toEqual([]); expect(await loadJob('A')).toBeNull(); expect(await deleteJob('A')).toBe(false);
});
test('storage works normally', async () => { expect(await storageOk()).toBe(true); });
