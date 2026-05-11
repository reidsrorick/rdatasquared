const Storage = {
  KEY: 'quick-links-hub',

  get() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  },

  set(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Storage write failed:', e);
    }
  },

  defaults() {
    const now = new Date().toISOString();
    return {
      version: '1.0',
      settings: {
        defaultOpenInNewTab: true,
        theme: 'system',
        exportConfigured: false,
        gridColumns: 0,
      },
      categories: [
        { id: 'c1', name: 'Work',      color: '#3b82f6' },
        { id: 'c2', name: 'Personal',  color: '#10b981' },
        { id: 'c3', name: 'Tools',     color: '#f59e0b' },
        { id: 'c4', name: 'Reference', color: '#8b5cf6' },
      ],
      links: [
        { id: 'l1', title: 'Gmail',   url: 'https://mail.google.com', description: 'Email inbox',              notes: '', category: 'Work',     tags: ['email', 'google'], favorite: true,  openInNewTab: true, parentId: '', createdAt: now, updatedAt: now, lastUsed: '' },
        { id: 'l2', title: 'GitHub',  url: 'https://github.com',      description: 'Code repositories',       notes: '', category: 'Work',     tags: ['dev', 'code'],     favorite: true,  openInNewTab: true, parentId: '', createdAt: now, updatedAt: now, lastUsed: '' },
        { id: 'l3', title: 'Figma',   url: 'https://figma.com',       description: 'Design & prototyping',    notes: '', category: 'Tools',    tags: ['design'],          favorite: false, openInNewTab: true, parentId: '', createdAt: now, updatedAt: now, lastUsed: '' },
        { id: 'l4', title: 'YouTube', url: 'https://youtube.com',     description: 'Video platform',          notes: '', category: 'Personal', tags: ['video', 'media'],  favorite: false, openInNewTab: true, parentId: '', createdAt: now, updatedAt: now, lastUsed: '' },
      ],
    };
  },

  // ── IndexedDB for persisting FileSystem handles ───────────────────
  _idb: null,

  _openIDB() {
    if (this._idb) return Promise.resolve(this._idb);
    return new Promise((res, rej) => {
      const req = indexedDB.open('qlh-fs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => { this._idb = req.result; res(this._idb); };
      req.onerror  = () => rej(req.error);
    });
  },

  async _putHandle(key, handle) {
    const db = await this._openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, key);
      tx.oncomplete = res;
      tx.onerror    = () => rej(tx.error);
    });
  },

  async _getHandle(key) {
    const db = await this._openIDB();
    return new Promise((res, rej) => {
      const tx  = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => rej(req.error);
    });
  },

  async _deleteHandle(key) {
    const db = await this._openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(key);
      tx.oncomplete = res;
      tx.onerror    = () => rej(tx.error);
    });
  },

  // ── Export ────────────────────────────────────────────────────────
  async exportJSON() {
    const data     = this.get() || this.defaults();
    const json     = JSON.stringify(data, null, 2);
    const filename = 'quick-links-hub.json';

    if (window.showSaveFilePicker) {
      try {
        let fileHandle = null;
        try { fileHandle = await this._getHandle('exportFile'); } catch (_) {}

        if (fileHandle) {
          let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted') perm = await fileHandle.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') fileHandle = null;
        }

        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
          });
          await this._putHandle('exportFile', fileHandle);
          const d = this.get();
          if (d) { d.settings.exportConfigured = true; this.set(d); }
        }

        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
        console.warn('File System Access API error, falling back:', e);
      }
    }

    // Fallback for browsers without File System Access API
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  },

  async clearExportHandle() {
    try { await this._deleteHandle('exportFile'); } catch (_) {}
    const d = this.get();
    if (d) { d.settings.exportConfigured = false; this.set(d); }
  },

  importJSON(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data.links) || !Array.isArray(data.categories) || !data.settings) {
            reject(new Error('Invalid backup format — expected links, categories, and settings arrays.'));
            return;
          }
          Storage.set(data);
          resolve(data);
        } catch (err) {
          reject(new Error('Could not parse file: ' + err.message));
        }
      };
      reader.onerror = function () { reject(new Error('Failed to read file.')); };
      reader.readAsText(file);
    });
  },
};
