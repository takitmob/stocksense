'use strict';

const DB_NAME    = 'stocksense';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('analyses')) {
        const s = db.createObjectStore('analyses', { keyPath: 'id', autoIncrement: true });
        s.createIndex('ticker',    'ticker',    { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('marketCache')) {
        db.createObjectStore('marketCache', { keyPath: 'region' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tr    = db.transaction(storeName, mode);
    const store = tr.objectStore(storeName);
    const req   = fn(store);
    if (req) {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    } else {
      tr.oncomplete = () => resolve();
      tr.onerror    = (e) => reject(e.target.error);
    }
  }));
}

// ── ANALYSES ─────────────────────────────────────────
function saveAnalysis(ticker, market, intent, data) {
  return tx('analyses', 'readwrite', store =>
    store.add({ ticker, market, intent, data, createdAt: Date.now() })
  );
}

function getAnalyses(limit = 30) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tr    = db.transaction('analyses', 'readonly');
    const store = tr.objectStore('analyses');
    const idx   = store.index('createdAt');
    const req   = idx.openCursor(null, 'prev');
    const items = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && items.length < limit) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  }));
}

function clearOldAnalyses(daysToKeep = 30) {
  const cutoff = Date.now() - daysToKeep * 86400000;
  return openDB().then(db => new Promise((resolve, reject) => {
    const tr    = db.transaction('analyses', 'readwrite');
    const store = tr.objectStore('analyses');
    const req   = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.createdAt < cutoff) cursor.delete();
        cursor.continue();
      }
    };
    tr.oncomplete = resolve;
    tr.onerror    = (e) => reject(e.target.error);
  }));
}

// ── MARKET CACHE ──────────────────────────────────────
function saveMarketCache(region, data, isOpen) {
  return tx('marketCache', 'readwrite', store =>
    store.put({ region, data, fetchedAt: Date.now(), isOpen: !!isOpen })
  );
}

function getMarketCache(region) {
  return tx('marketCache', 'readonly', store => store.get(region));
}

async function isCacheStale(region, maxAgeMs) {
  const cache = await getMarketCache(region);
  if (!cache) return true;
  return Date.now() - cache.fetchedAt > maxAgeMs;
}

// Export
window.SS_DB = {
  saveAnalysis, getAnalyses, clearOldAnalyses,
  saveMarketCache, getMarketCache, isCacheStale
};
