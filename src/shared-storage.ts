// IndexedDB serializes read/write transactions across tabs. localStorage is a
// compatibility mirror; it must not decide ownership during a shared transfer.
export const SHARED_STORAGE_KEY = 'eclipse-ii-shared-stash-v1';
const DATABASE = 'eclipse-ii-local-shared-v1';
let database: Promise<IDBDatabase> | undefined;
let cached: string | null | undefined;
let failure: unknown;
let active: { transaction: IDBTransaction; raw: string | null; next?: string } | undefined;
const channel = typeof BroadcastChannel !== 'undefined' && typeof window !== 'undefined' ? new BroadcastChannel(DATABASE) : undefined;
function openDatabase() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('shared');
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
  });
}
export async function refreshSharedStorage() {
  try {
    const db = await openDatabase();
    const value = await new Promise<string | undefined>((resolve, reject) => {
      const transaction = db.transaction('shared', 'readonly'), request = transaction.objectStore('shared').get('state');
      transaction.oncomplete = () => resolve(request.result); transaction.onabort = () => reject(transaction.error);
    });
    cached = value ?? localStorage.getItem(SHARED_STORAGE_KEY); failure = undefined;
  } catch (error) { failure = error; }
}
channel?.addEventListener('message', () => window.dispatchEvent(new StorageEvent('storage', { key: SHARED_STORAGE_KEY })));
export function sharedRaw(storage: Pick<Storage, 'getItem'>) {
  if (typeof window === 'undefined' || storage !== window.localStorage) return storage.getItem(SHARED_STORAGE_KEY);
  if (failure) throw new Error('本地共享数据暂时无法读取，请刷新后重试');
  return active ? active.raw : cached === undefined ? storage.getItem(SHARED_STORAGE_KEY) : cached;
}
export function commitSharedRaw(storage: Pick<Storage, 'setItem'>, raw: string) {
  if (typeof window === 'undefined' || storage !== window.localStorage) { storage.setItem(SHARED_STORAGE_KEY, raw); return; }
  if (!active) throw new Error('共享存取必须在数据库事务内执行');
  active.transaction.objectStore('shared').put(raw, 'state'); active.next = raw;
}
export async function sharedTransaction<T>(operation: () => T): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('shared', 'readwrite'), request = transaction.objectStore('shared').get('state');
    let result: T, next: string | undefined, caught: unknown;
    request.onsuccess = () => {
      active = { transaction, raw: request.result ?? localStorage.getItem(SHARED_STORAGE_KEY) };
      try { result = operation(); next = active.next; }
      catch (error) { caught = error; transaction.abort(); }
      finally { active = undefined; }
    };
    transaction.onabort = () => reject(caught ?? transaction.error ?? new Error('共享存取未能保存，请重试'));
    transaction.onerror = () => { /* onabort reports the failure once. */ };
    transaction.oncomplete = () => {
      if (next !== undefined) {
        cached = next; failure = undefined;
        try { localStorage.setItem(SHARED_STORAGE_KEY, next); } catch { /* The database commit is already durable. */ }
        channel?.postMessage('updated');
      }
      resolve(result);
    };
  });
}

type MigrationJournal = { id: string; before: Record<string, string>; writes: Record<string, string> };
// The shared state, source backups and a replay journal commit together. A quota
// failure while updating localStorage leaves the journal intact for the next entry.
export async function commitOriginMigration(
  target: import('./local-migration.ts').OriginSnapshot,
  sources: import('./local-migration.ts').OriginSnapshot[],
  plan: ReturnType<typeof import('./local-migration.ts').planOriginMerge>,
) {
  const db = await openDatabase(), id = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
  const next = JSON.stringify(plan.shared);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('shared', 'readwrite'), store = tx.objectStore('shared');
    const pending = store.get('migration-pending'), state = store.get('state'); let caught: unknown;
    state.onsuccess = () => {
      try {
        if (pending.result) throw new Error('上次迁移尚未完成，请刷新后重试。');
        const current = state.result ?? localStorage.getItem(SHARED_STORAGE_KEY);
        if (current !== target.shared) throw new Error('共享仓库刚刚发生变化，请关闭其他游戏页面后重试。');
        const entries = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('eclipse-ii-')).map(key => [key, localStorage.getItem(key)!]));
        if (Object.keys(entries).length !== Object.keys(target.entries).length || Object.entries(entries).some(([key, value]) => target.entries[key] !== value)) throw new Error('角色刚刚发生变化，请关闭其他游戏页面后重试。');
        store.put({ target, sources, report: plan.report }, 'migration-backup:' + id);
        store.put({ id, before: target.entries, writes: plan.writes } satisfies MigrationJournal, 'migration-pending');
        store.put(next, 'state');
      } catch (error) { caught = error; tx.abort(); }
    };
    tx.oncomplete = () => { cached = next; failure = undefined; channel?.postMessage('updated'); resolve(); };
    tx.onabort = () => reject(caught ?? tx.error ?? new Error('迁移未能写入，原数据已保留。'));
  });
  await finishOriginMigration();
}

export async function finishOriginMigration() {
  const db = await openDatabase();
  const journal = await new Promise<MigrationJournal | undefined>((resolve, reject) => {
    const tx = db.transaction('shared', 'readonly'), request = tx.objectStore('shared').get('migration-pending');
    tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
  });
  if (!journal) return;
  // Check all keys before resuming a partially written journal.
  for (const [key, value] of Object.entries(journal.writes)) {
    const current = localStorage.getItem(key);
    if (current !== (journal.before[key] ?? null) && current !== value) throw new Error('迁移期间其他页面修改了角色，迁移备份已保留，请先关闭其他游戏页面。');
  }
  for (const [key, value] of Object.entries(journal.writes)) localStorage.setItem(key, value);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('shared', 'readwrite'), store = tx.objectStore('shared'), request = store.get('migration-pending');
    request.onsuccess = () => { if (request.result?.id === journal.id) store.delete('migration-pending'); };
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  });
  await refreshSharedStorage();
  const raw = sharedRaw(localStorage); if (raw !== null) { try { localStorage.setItem(SHARED_STORAGE_KEY, raw); } catch { /* IndexedDB remains authoritative. */ } }
}
