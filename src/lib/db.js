// Small IndexedDB wrapper. Every record is stored on its own, so the
// sales history can grow to years of data without slowing the till.
const DB_NAME = 'welfare-canteen-pos';
const DB_VERSION = 1;
export const STORES = ['products', 'categories', 'members', 'users', 'sales', 'stockMoves', 'held', 'payments', 'settings'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        Promise.resolve(fn(os)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export function getAll(store) {
  return tx(store, 'readonly', (os) => new Promise((res) => {
    const r = os.getAll();
    r.onsuccess = () => res(r.result || []);
  }));
}

export function put(store, value) {
  return tx(store, 'readwrite', (os) => { os.put(value); });
}

export function putMany(store, values) {
  return tx(store, 'readwrite', (os) => { values.forEach((v) => os.put(v)); });
}

export function remove(store, id) {
  return tx(store, 'readwrite', (os) => { os.delete(id); });
}

export function clearStore(store) {
  return tx(store, 'readwrite', (os) => { os.clear(); });
}

// Writes several stores in one transaction so a sale, its stock
// movements and the product stock levels are saved together or not at all.
export function writeAtomic(ops) {
  const stores = [...new Set(ops.map((o) => o.store))];
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(stores, 'readwrite');
        ops.forEach((o) => {
          const os = t.objectStore(o.store);
          if (o.type === 'put') os.put(o.value);
          else if (o.type === 'delete') os.delete(o.id);
        });
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}
