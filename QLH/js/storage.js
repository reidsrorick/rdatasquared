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

  exportJSON() {
    const data = this.get() || this.defaults();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'quick-links-hub-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
