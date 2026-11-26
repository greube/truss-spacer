/** Jobs on this device, in IndexedDB (a job can carry a 10 MB+ original MVR). Nothing here ever throws. */
export interface JobRecord { id: string; name: string; updated: number; doc: unknown; original: Blob | null; sourceName: string }
export interface JobSummary { id: string; name: string; updated: number }

const DB = 'trussCad', STORE = 'jobs';
let dbp: Promise<IDBDatabase | null> | null = null;
export function _resetForTests() { dbp = null; }

function open(): Promise<IDBDatabase | null> {
  if (!dbp) dbp = new Promise(resolve => {
    try {
      const idb: IDBFactory | undefined = (globalThis as any).indexedDB;
      if (!idb) return resolve(null);
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null, map: (r: any) => T, fallback: T): Promise<T> {
  return open().then(db => new Promise<T>(resolve => {
    if (!db) return resolve(fallback);
    try {
      const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      let result: T = fallback;
      if (req) req.onsuccess = () => { result = map(req.result); };
      tx.oncomplete = () => resolve(req ? result : map(undefined));
      tx.onerror = () => resolve(fallback); tx.onabort = () => resolve(fallback);
    } catch { resolve(fallback); }
  }));
}

export const storageOk = (): Promise<boolean> => open().then(db => !!db);
export const saveJob = (r: JobRecord): Promise<boolean> => run('readwrite', s => s.put(r), () => true, false);
export const loadJob = (id: string): Promise<JobRecord | null> => run('readonly', s => s.get(id), r => (r ? (r as JobRecord) : null), null);
export const deleteJob = (id: string): Promise<boolean> => run('readwrite', s => s.delete(id), () => true, false);
export const listJobs = (): Promise<JobSummary[]> => run('readonly', s => s.getAll(), (rs: JobRecord[] = []) =>
  rs.map(r => ({ id: r.id, name: r.name, updated: r.updated })).sort((a, b) => b.updated - a.updated), []);
