// VIM — offline persistence (IndexedDB). Drafts, outbox and sent forms use one
// record per form (keyed by its instance id) so saves are granular and media
// Blobs survive in drafts/outbox; auth and lang live in the 'state' store.
// Sent records keep only text (answers incl. media filenames), no Blobs.

const VIM_DB = 'vim';
const DB_VERSION   = 3;
const STORE_STATE  = 'state';    // singletons: auth, lang
const STORE_DRAFTS = 'drafts';   // one record per draft  (keyPath 'id')
const STORE_OUTBOX = 'outbox';   // one record per queued submission (keyPath 'id')
const STORE_SENT   = 'sent';     // one record per sent form, text only (keyPath 'id')

function _vimOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIM_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE))  db.createObjectStore(STORE_STATE);
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_SENT))   db.createObjectStore(STORE_SENT,   { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** newId() — Stable id for a form, reused as record key and OpenRosa instanceID. */
function newId() {
  const uuid = (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  return 'uuid:' + uuid;
}

// Run fn(store) in a transaction; resolve with the request result (best-effort).
function _tx(storeName, mode, fn) {
  if (!('indexedDB' in window)) return Promise.resolve();
  return _vimOpenDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror    = () => reject(tx.error);
  })).catch(() => {});
}

/** saveDraftRecord(rec) / removeDraftRecord(id) — Persist or drop one draft. */
function saveDraftRecord(rec)   { return _tx(STORE_DRAFTS, 'readwrite', s => s.put(rec)); }
function removeDraftRecord(id)  { return _tx(STORE_DRAFTS, 'readwrite', s => s.delete(id)); }

/** saveOutboxRecord(rec) / removeOutboxRecord(id) — Persist or drop one queued form. */
function saveOutboxRecord(rec)  { return _tx(STORE_OUTBOX, 'readwrite', s => s.put(rec)); }
function removeOutboxRecord(id) { return _tx(STORE_OUTBOX, 'readwrite', s => s.delete(id)); }

/** saveSentRecord(rec) — Persist one sent form (text only, no Blobs). */
function saveSentRecord(rec)    { return _tx(STORE_SENT, 'readwrite', s => s.put(rec)); }

// Put a singleton value under `key` in the 'state' store.
function _saveState(key, value) { return _tx(STORE_STATE, 'readwrite', s => s.put(value, key)); }

/** saveAuth() — Persist the tester login state (provisional). */
function saveAuth()  { return _saveState('auth', { loggedIn, testerName }); }

/** saveLang() — Persist the chosen language (to skip the language screen next time). */
function saveLang()  { return _saveState('lang', { currentLangIdx, langChosen }); }

/** loadState() — Load persisted records/singletons into the global variables. */
function loadState() {
  if (!('indexedDB' in window)) return Promise.resolve();
  return _vimOpenDB().then(db => new Promise(resolve => {
    const tx    = db.transaction([STORE_STATE, STORE_DRAFTS, STORE_OUTBOX, STORE_SENT], 'readonly');
    const state = tx.objectStore(STORE_STATE);
    const get   = key   => new Promise(r => { const q = state.get(key);                 q.onsuccess = () => r(q.result);      q.onerror = () => r(undefined); });
    const all   = store => new Promise(r => { const q = tx.objectStore(store).getAll();  q.onsuccess = () => r(q.result || []); q.onerror = () => r([]); });
    Promise.all([all(STORE_DRAFTS), all(STORE_OUTBOX), all(STORE_SENT), get('auth'), get('lang'), get('drafts'), get('outbox'), get('sentForms')])
      .then(([d, o, sent, a, l, legacyDrafts, legacyOutbox, legacySent]) => {
        drafts    = d;
        outbox    = o;
        sentForms = sent;
        if (a && typeof a === 'object') { loggedIn = !!a.loggedIn; testerName = a.testerName || ''; }
        if (l && typeof l === 'object' && typeof l.currentLangIdx === 'number') {
          currentLangIdx = l.currentLangIdx;
          langChosen     = !!l.langChosen;
        }
        // Migrate older layouts (whole arrays under single keys) to per-record stores, once.
        _migrateLegacy(legacyDrafts, legacyOutbox, legacySent);
        resolve();
      });
  })).catch(() => {});
}

// One-time migration from older layouts (drafts/outbox/sentForms arrays in 'state').
function _migrateLegacy(legacyDrafts, legacyOutbox, legacySent) {
  if (!sentForms.length && Array.isArray(legacySent) && legacySent.length) {
    sentForms = legacySent.map(r => (r.id ? r : Object.assign({ id: newId() }, r)));
    sentForms.forEach(saveSentRecord);
    _tx(STORE_STATE, 'readwrite', s => s.delete('sentForms'));
  }
  if (!drafts.length && Array.isArray(legacyDrafts) && legacyDrafts.length) {
    drafts = legacyDrafts.map(r => (r.id ? r : Object.assign({ id: newId() }, r)));
    drafts.forEach(saveDraftRecord);
    _tx(STORE_STATE, 'readwrite', s => s.delete('drafts'));
  }
  if (!outbox.length && Array.isArray(legacyOutbox) && legacyOutbox.length) {
    outbox = legacyOutbox.map(r => (r.id ? r : Object.assign({ id: newId() }, r)));
    outbox.forEach(saveOutboxRecord);
    _tx(STORE_STATE, 'readwrite', s => s.delete('outbox'));
  }
}

/**
 * persistStorage() — Ask the browser to keep our data (not evict it under
 * storage pressure / after inactivity). Best-effort: returns true if granted
 * or already persisted, false otherwise. Idempotent.
 */
function persistStorage() {
  if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
  return navigator.storage.persisted()
    .then(already => already ? true : navigator.storage.persist())
    .catch(() => false);
}

/** storageEstimate() — { usage, quota, pct } or null if unsupported. */
function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
  return navigator.storage.estimate()
    .then(({ usage = 0, quota = 0 }) => quota > 0 ? { usage, quota, pct: usage / quota } : null)
    .catch(() => null);
}

/**
 * updateStorageWarning() — Show the home warning when storage is nearly full
 * (>= 90% used), so the tester knows to send forms before running out of space.
 */
function updateStorageWarning() {
  const el = document.getElementById('storage-warn');
  if (!el) return Promise.resolve();
  return storageEstimate().then(est => {
    const low = !!(est && est.pct >= 0.9);
    el.style.display = low ? '' : 'none';
    if (low) el.textContent = tr().storageLow;
  });
}
