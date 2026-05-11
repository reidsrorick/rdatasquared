const Data = {
  _d: null,

  load() {
    this._d = Storage.get();
    if (!this._d) {
      this._d = Storage.defaults();
      Storage.set(this._d);
    }
    return this._d;
  },

  get() {
    if (!this._d) this.load();
    return this._d;
  },

  reload() {
    this._d = Storage.get() || Storage.defaults();
    return this._d;
  },

  save() {
    Storage.set(this._d);
  },

  uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },

  // ── Links ──────────────────────────────────────────
  getLinks()    { return this.get().links; },
  getLink(id)   { return this.get().links.find(function (l) { return l.id === id; }); },

  addLink(attrs) {
    const d = this.get();
    const link = {
      id:          this.uid(),
      title:       attrs.title       || '',
      url:         attrs.url         || '',
      iconUrl:     attrs.iconUrl     || '',
      description: attrs.description || '',
      notes:       attrs.notes       || '',
      category:    attrs.category    || '',
      tags:        Array.isArray(attrs.tags) ? attrs.tags : [],
      favorite:    !!attrs.favorite,
      openInNewTab: attrs.openInNewTab !== undefined ? !!attrs.openInNewTab : d.settings.defaultOpenInNewTab,
      parentId:    attrs.parentId    || '',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      lastUsed:    '',
    };
    d.links.push(link);
    this.save();
    return link;
  },

  updateLink(id, attrs) {
    const d   = this.get();
    const idx = d.links.findIndex(function (l) { return l.id === id; });
    if (idx === -1) return null;
    d.links[idx] = Object.assign({}, d.links[idx], attrs, { updatedAt: new Date().toISOString() });
    this.save();
    return d.links[idx];
  },

  deleteLink(id) {
    const d = this.get();
    d.links = d.links.filter(function (l) { return l.id !== id && l.parentId !== id; });
    this.save();
  },

  toggleFavorite(id) {
    const link = this.get().links.find(function (l) { return l.id === id; });
    if (link) {
      link.favorite  = !link.favorite;
      link.updatedAt = new Date().toISOString();
      this.save();
    }
    return link;
  },

  recordUsage(id) {
    const link = this.get().links.find(function (l) { return l.id === id; });
    if (link) { link.lastUsed = new Date().toISOString(); this.save(); }
  },

  getChildren(parentId) {
    return this.get().links.filter(function (l) { return l.parentId === parentId; });
  },

  childCount(id) {
    return this.get().links.filter(function (l) { return l.parentId === id; }).length;
  },

  reorderLink(draggedId, targetId, before) {
    const d    = this.get();
    const from = d.links.findIndex(function (l) { return l.id === draggedId; });
    const to   = d.links.findIndex(function (l) { return l.id === targetId;  });
    if (from === -1 || to === -1 || from === to) return;
    const [item] = d.links.splice(from, 1);
    const dest   = d.links.findIndex(function (l) { return l.id === targetId; });
    d.links.splice(before ? dest : dest + 1, 0, item);
    this.save();
  },

  // ── Categories ─────────────────────────────────────
  getCategories() { return this.get().categories; },

  addCategory(attrs) {
    const cat = { id: this.uid(), name: attrs.name || '', color: attrs.color || '#6366f1' };
    this.get().categories.push(cat);
    this.save();
    return cat;
  },

  updateCategory(id, attrs) {
    const d   = this.get();
    const cat = d.categories.find(function (c) { return c.id === id; });
    if (!cat) return null;
    const oldName = cat.name;
    Object.assign(cat, attrs);
    if (attrs.name && attrs.name !== oldName) {
      d.links.forEach(function (l) { if (l.category === oldName) l.category = attrs.name; });
    }
    this.save();
    return cat;
  },

  deleteCategory(id) {
    const d   = this.get();
    const cat = d.categories.find(function (c) { return c.id === id; });
    if (!cat) return;
    d.links.forEach(function (l) { if (l.category === cat.name) l.category = ''; });
    d.categories = d.categories.filter(function (c) { return c.id !== id; });
    this.save();
  },

  // ── Settings ───────────────────────────────────────
  getSettings()       { return this.get().settings; },

  updateSettings(upd) {
    Object.assign(this.get().settings, upd);
    this.save();
    return this.get().settings;
  },

  addLinks(attrsArray) {
    const d    = this.get();
    const self = this;
    const now  = new Date().toISOString();
    attrsArray.forEach(function (attrs) {
      d.links.push({
        id:           self.uid(),
        title:        attrs.title        || '',
        url:          attrs.url          || '',
        iconUrl:      attrs.iconUrl      || '',
        description:  attrs.description  || '',
        notes:        attrs.notes        || '',
        category:     attrs.category     || '',
        tags:         Array.isArray(attrs.tags) ? attrs.tags : [],
        favorite:     !!attrs.favorite,
        openInNewTab: attrs.openInNewTab !== undefined ? !!attrs.openInNewTab : d.settings.defaultOpenInNewTab,
        parentId:     attrs.parentId     || '',
        createdAt:    now,
        updatedAt:    now,
        lastUsed:     '',
      });
    });
    this.save();
  },

  // ── Backup ─────────────────────────────────────────
  clearAll() {
    this._d = Storage.defaults();
    this.save();
  },
};
