/* ============================================================
   STORAGE — IndexedDB wrapper (promise-based).

   Object stores:
     userGames  keyed by game id
       • Full game objects for user-added entries (userAdded: true)
       • Full game objects for overriding default entries
       • Delete markers for default entries: { id, _deleted: true }
     settings   keyed by setting key, value: { key, value }
   ============================================================ */
window.Storage = (() => {
  const DB_NAME    = 'gameHubDB';
  const DB_VERSION = 1;
  const STORE_GAMES    = 'userGames';
  const STORE_SETTINGS = 'settings';

  let db = null;

  /* ---------- open / upgrade -------------------------------- */

  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(STORE_GAMES)) {
          idb.createObjectStore(STORE_GAMES, { keyPath: 'id' });
        }
        if (!idb.objectStoreNames.contains(STORE_SETTINGS)) {
          idb.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror   = (e) => reject(e.target.error);
      req.onblocked = ()  => reject(new Error('IndexedDB blocked — please close other tabs.'));
    });
  }

  /* ---------- generic helpers ------------------------------- */

  function tx(storeName, mode = 'readonly') {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /* ---------- public API ------------------------------------ */
  return {

    /** Must be called once before any other method. */
    async init() {
      await open();
    },

    /* ---- User Games ---- */

    /** Return all records from userGames (overrides + user-added + delete markers). */
    async getAllUserGames() {
      return wrap(tx(STORE_GAMES).getAll());
    },

    /** Save (put) a game record — creates or replaces by id. */
    async saveUserGame(game) {
      return wrap(tx(STORE_GAMES, 'readwrite').put(game));
    },

    /**
     * Mark a default game as deleted.
     * Stores { id, _deleted: true } so the merge layer can skip it.
     */
    async markDeleted(id) {
      return wrap(tx(STORE_GAMES, 'readwrite').put({ id, _deleted: true }));
    },

    /** Remove a user-added game record entirely (used for user-added deletions). */
    async removeUserGame(id) {
      return wrap(tx(STORE_GAMES, 'readwrite').delete(id));
    },

    /** Delete everything in the userGames store (full reset). */
    async clearAllUserGames() {
      return wrap(tx(STORE_GAMES, 'readwrite').clear());
    },

    /* ---- Settings ---- */

    /** Get a single setting value, or defaultValue if not set. */
    async getSetting(key, defaultValue = null) {
      const row = await wrap(tx(STORE_SETTINGS).get(key));
      return row !== undefined ? row.value : defaultValue;
    },

    /** Persist a single setting. */
    async setSetting(key, value) {
      return wrap(tx(STORE_SETTINGS, 'readwrite').put({ key, value }));
    },

    /** Return all settings as a plain { key: value } map. */
    async getAllSettings() {
      const rows = await wrap(tx(STORE_SETTINGS).getAll());
      const map = {};
      rows.forEach(r => { map[r.key] = r.value; });
      return map;
    },

    /** Delete everything in the settings store. */
    async clearAllSettings() {
      return wrap(tx(STORE_SETTINGS, 'readwrite').clear());
    },

    /* ---- Full reset ---- */

    /** Wipe all local data (user games + settings). */
    async clearAll() {
      await this.clearAllUserGames();
      await this.clearAllSettings();
    },
  };
})();
