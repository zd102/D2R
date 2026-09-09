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
