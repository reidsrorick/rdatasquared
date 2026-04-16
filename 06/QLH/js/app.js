var App = {
  state: {
    page:             'home',
    linkId:           null,
    searchQuery:      '',
    activeView:       'all',
    selectedCategory: 'all',
    selectedTag:      '',
    bulkDrafts:       [],
    bulkUrlText:      '',
  },

  _pendingConfirm: null,

  // ── INIT ─────────────────────────────────────────────────────────
  init: function () {
    Data.load();
    UI.applyTheme(Data.getSettings().theme);

    window.addEventListener('hashchange', function () { App.route(); });

    document.addEventListener('click',   function (e) { App.handleClick(e);   });
    document.addEventListener('change',  function (e) { App.handleChange(e);  });
    document.addEventListener('submit',  function (e) { App.handleSubmit(e);  });
    document.addEventListener('input',   function (e) { App.handleInput(e);   });
    document.addEventListener('keydown', function (e) { App.handleKeydown(e); });

    document.getElementById('import-file-input').addEventListener('change', function (e) { App.handleImportFile(e); });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (Data.getSettings().theme === 'system') UI.applyTheme('system');
      });
    }

    this.route();
  },

  // ── ROUTER ───────────────────────────────────────────────────────
  route: function () {
    var hash = window.location.hash || '#/';

    if (hash.indexOf('#/link/') === 0) {
      this.state.page   = 'link-detail';
      this.state.linkId = hash.slice(7);
    } else if (hash === '#/manage') {
      this.state.page = 'manage';
    } else if (hash === '#/settings') {
      this.state.page = 'settings';
    } else if (hash === '#/bulk-add') {
      this.state.page = 'bulk-add';
    } else {
      this.state.page = 'home';
    }

    this.state.searchQuery = '';
    this.render();
  },

  // ── RENDER ───────────────────────────────────────────────────────
  render: function () {
    var nav   = document.getElementById('app-nav');
    var main  = document.getElementById('app-main');
    var wasSearchFocused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.action === 'search';

    nav.innerHTML = Pages.nav(this.state.page);

    var links      = Data.getLinks();
    var categories = Data.getCategories();

    switch (this.state.page) {
      case 'home':
        main.innerHTML = Pages.home(Object.assign({ links: links, categories: categories }, this.state));
        break;
      case 'manage':
        main.innerHTML = Pages.manage(Object.assign({ links: links, categories: categories }, this.state));
        break;
      case 'settings':
        main.innerHTML = Pages.settings();
        break;
      case 'link-detail':
        main.innerHTML = Pages.linkDetail(this.state.linkId);
        break;
      case 'bulk-add':
        main.innerHTML = Pages.bulkAdd(Object.assign({ links: links, categories: categories }, this.state));
        break;
    }

    if (wasSearchFocused) {
      var si = document.getElementById('search-input');
      if (si) si.focus();
    }

    window.scrollTo(0, 0);
  },

  // ── CLICK HANDLER ────────────────────────────────────────────────
  handleClick: function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.dataset.action;
    var id     = btn.dataset.id;
    var value  = btn.dataset.value;

    switch (action) {

      case 'open-link':
        if (id) Data.recordUsage(id);
        // Let the href/anchor do its thing
        break;

      case 'toggle-favorite':
        e.preventDefault();
        Data.toggleFavorite(id);
        this.render();
        break;

      case 'add-link':
        e.preventDefault();
        this.openLinkModal(null, '');
        break;

      case 'add-nested-link':
        e.preventDefault();
        this.openLinkModal(null, btn.dataset.parentId || '');
        break;

      case 'edit-link':
        e.preventDefault();
        this.openLinkModal(Data.getLink(id), '');
        break;

      case 'delete-link': {
        e.preventDefault();
        var link = Data.getLink(id);
        if (!link) break;
        var kids = Data.childCount(id);
        var msg  = kids > 0
          ? 'Delete "' + link.title + '" and its ' + kids + ' nested link' + (kids > 1 ? 's' : '') + '? This cannot be undone.'
          : 'Delete "' + link.title + '"? This cannot be undone.';
        this.openConfirm(msg, 'Delete', true, function () {
          Data.deleteLink(id);
          UI.toast('Link deleted.', 'success');
          App.render();
        });
        break;
      }

      case 'view-nested':
        e.preventDefault();
        window.location.hash = '#/link/' + id;
        break;

      case 'add-category':
        e.preventDefault();
        this.openCategoryModal(null);
        break;

      case 'edit-category': {
        e.preventDefault();
        var cats = Data.getCategories();
        var cat  = cats.find(function (c) { return c.id === id; });
        this.openCategoryModal(cat || null);
        break;
      }

      case 'delete-category': {
        e.preventDefault();
        var allCats = Data.getCategories();
        var delCat  = allCats.find(function (c) { return c.id === id; });
        if (!delCat) break;
        var cnt  = Data.getLinks().filter(function (l) { return l.category === delCat.name; }).length;
        var catMsg = cnt > 0
          ? 'Delete category "' + delCat.name + '"? It will be removed from ' + cnt + ' link' + (cnt > 1 ? 's' : '') + '.'
          : 'Delete category "' + delCat.name + '"?';
        this.openConfirm(catMsg, 'Delete', true, function () {
          Data.deleteCategory(id);
          UI.toast('Category deleted.', 'success');
          App.render();
        });
        break;
      }

      case 'set-view':
        e.preventDefault();
        this.state.activeView       = value;
        this.state.selectedCategory = 'all';
        this.state.selectedTag      = '';
        this.render();
        break;

      case 'set-category':
        e.preventDefault();
        this.state.selectedCategory = value;
        this.render();
        break;

      case 'set-tag':
        e.preventDefault();
        this.state.selectedTag = value;
        this.render();
        break;

      case 'set-theme':
        e.preventDefault();
        Data.updateSettings({ theme: value });
        UI.applyTheme(value);
        this.render();
        break;

      case 'export-json':
        e.preventDefault();
        Storage.exportJSON().then(function (saved) {
          if (saved) { UI.toast('Backup saved!', 'success'); App.render(); }
        }).catch(function (err) {
          UI.toast('Export failed: ' + err.message, 'error');
        });
        break;

      case 'clear-export-location':
        e.preventDefault();
        Storage.clearExportHandle().then(function () {
          App.render();
          UI.toast('Export location cleared.', 'success');
        });
        break;

      case 'import-json':
        e.preventDefault();
        document.getElementById('import-file-input').click();
        break;

      case 'clear-data':
        e.preventDefault();
        this.openConfirm('Clear ALL data and reset to defaults? Export a backup first — this cannot be undone.', 'Clear All', true, function () {
          Data.clearAll();
          UI.toast('Data cleared. Defaults restored.', 'success');
          App.render();
        });
        break;

      case 'bulk-parse': {
        e.preventDefault();
        var ta   = document.getElementById('bulk-url-input');
        var text = ta ? ta.value : '';
        this.state.bulkUrlText = text;
        var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
        this.state.bulkDrafts = lines.map(function (url) {
          return { url: url, title: App._titleFromUrl(url), category: '', tags: [] };
        });
        this.render();
        break;
      }

      case 'bulk-remove': {
        e.preventDefault();
        // Sync current DOM edits back to state so other card edits are preserved
        var allCards = document.querySelectorAll('.bulk-card');
        var synced   = [];
        allCards.forEach(function (card) {
          var urlEl   = card.querySelector('[data-field="url"]');
          var titleEl = card.querySelector('[data-field="title"]');
          var catEl   = card.querySelector('[data-field="category"]');
          var tagsEl  = card.querySelector('[data-field="tags"]');
          synced.push({
            url:      urlEl   ? urlEl.value.trim()   : '',
            title:    titleEl ? titleEl.value.trim()  : '',
            category: catEl   ? catEl.value.trim()    : '',
            tags:     tagsEl  ? tagsEl.value.trim().split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [],
          });
        });
        synced.splice(parseInt(btn.dataset.index), 1);
        this.state.bulkDrafts = synced;
        this.render();
        break;
      }

      case 'bulk-save':
        e.preventDefault();
        this.bulkSave();
        break;

      case 'close-modal':
        e.preventDefault();
        UI.hideModal();
        this._pendingConfirm = null;
        break;

      case 'confirm-action':
        e.preventDefault();
        UI.hideModal();
        if (this._pendingConfirm) {
          var fn = this._pendingConfirm;
          this._pendingConfirm = null;
          fn();
        }
        break;

      case 'remove-tag': {
        e.preventDefault();
        var chip = btn.closest('.tag-chip');
        if (chip) chip.remove();
        break;
      }

      case 'select-color': {
        e.preventDefault();
        var colorInput = document.getElementById('cat-color-val');
        if (colorInput) colorInput.value = btn.dataset.color;
        document.querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('active'); });
        btn.classList.add('active');
        break;
      }
    }
  },

  // ── CHANGE HANDLER (checkboxes) ──────────────────────────────────
  handleChange: function (e) {
    var el = e.target;
    if (el.dataset.action === 'toggle-new-tab') {
      Data.updateSettings({ defaultOpenInNewTab: el.checked });
      UI.toast('Setting saved.', 'success');
    }
  },

  // ── INPUT HANDLER (search) ───────────────────────────────────────
  handleInput: function (e) {
    var el = e.target;
    if (el.dataset.action === 'search') {
      var val   = el.value;
      var start = el.selectionStart;
      var end   = el.selectionEnd;
      this.state.searchQuery = val;
      this.render();
      var newEl = document.getElementById('search-input');
      if (newEl) {
        newEl.focus();
        newEl.setSelectionRange(start, end);
      }
    }
  },

  // ── KEYDOWN ──────────────────────────────────────────────────────
  handleKeydown: function (e) {
    if (e.target.id === 'tag-text-input' && e.key === 'Enter') {
      e.preventDefault();
      this.addTagFromInput();
    }
    if (e.key === 'Escape') {
      UI.hideModal();
      this._pendingConfirm = null;
    }
  },

  // ── FORM SUBMIT ──────────────────────────────────────────────────
  handleSubmit: function (e) {
    var form   = e.target;
    var action = form.dataset.action;
    if (action === 'submit-link')     { e.preventDefault(); this.submitLink(form);     }
    if (action === 'submit-category') { e.preventDefault(); this.submitCategory(form); }
  },

  submitLink: function (form) {
    var fd  = new FormData(form);
    var id  = form.dataset.id;

    // Collect tags from chips
    var tags = [];
    form.querySelectorAll('.tag-chip').forEach(function (c) {
      if (c.dataset.tag) tags.push(c.dataset.tag);
    });
    // Include any unsaved text in the tag input
    var tagInput = document.getElementById('tag-text-input');
    if (tagInput && tagInput.value.trim()) {
      var extra = tagInput.value.trim();
      if (tags.indexOf(extra) === -1) tags.push(extra);
    }

    var attrs = {
      title:        (fd.get('title')       || '').trim(),
      url:          (fd.get('url')         || '').trim(),
      description:  (fd.get('description') || '').trim(),
      notes:        (fd.get('notes')       || '').trim(),
      category:     fd.get('category')     || '',
      parentId:     fd.get('parentId')     || '',
      tags:         tags,
      favorite:     !!fd.get('favorite'),
      openInNewTab: !!fd.get('openInNewTab'),
    };

    if (!attrs.title || !attrs.url) { UI.toast('Title and URL are required.', 'error'); return; }

    if (id) {
      Data.updateLink(id, attrs);
      UI.toast('Link updated!', 'success');
    } else {
      Data.addLink(attrs);
      UI.toast('Link added!', 'success');
    }

    UI.hideModal();
    this.render();
  },

  submitCategory: function (form) {
    var fd    = new FormData(form);
    var id    = form.dataset.id;
    var name  = (fd.get('name') || '').trim();
    var color = fd.get('color') || '#6366f1';

    if (!name) { UI.toast('Category name is required.', 'error'); return; }

    // Check for duplicate name
    var existing = Data.getCategories().filter(function (c) { return c.id !== id; });
    if (existing.some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })) {
      UI.toast('A category with that name already exists.', 'error'); return;
    }

    if (id) {
      Data.updateCategory(id, { name: name, color: color });
      UI.toast('Category updated!', 'success');
    } else {
      Data.addCategory({ name: name, color: color });
      UI.toast('Category added!', 'success');
    }

    UI.hideModal();
    this.render();
  },

  // ── TAG INPUT ────────────────────────────────────────────────────
  addTagFromInput: function () {
    var input = document.getElementById('tag-text-input');
    var wrap  = document.getElementById('tag-input-wrap');
    if (!input || !wrap) return;
    var tag = input.value.trim();
    if (!tag) return;

    // Prevent duplicates
    var existing = [];
    wrap.querySelectorAll('.tag-chip').forEach(function (c) { if (c.dataset.tag) existing.push(c.dataset.tag); });
    if (existing.indexOf(tag) !== -1) { input.value = ''; return; }

    var chip      = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.tag = tag;
    chip.innerHTML = UI.esc(tag) + '<button type="button" class="tag-chip-rm" data-action="remove-tag">×</button>';
    wrap.insertBefore(chip, input);
    input.value = '';
  },

  // ── BULK ADD ─────────────────────────────────────────────────────
  bulkSave: function () {
    var cards = document.querySelectorAll('.bulk-card');
    var links = [];
    var firstError = null;

    cards.forEach(function (card, i) {
      var url      = (card.querySelector('[data-field="url"]').value    || '').trim();
      var title    = (card.querySelector('[data-field="title"]').value  || '').trim();
      var category = (card.querySelector('[data-field="category"]').value || '').trim();
      var tagsRaw  = (card.querySelector('[data-field="tags"]').value   || '').trim();
      var tags     = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];

      if (!url || !title) {
        if (!firstError) firstError = 'Card #' + (i + 1) + ': Title and URL are required.';
        return;
      }
      links.push({ url: url, title: title, category: category, tags: tags });
    });

    if (firstError) { UI.toast(firstError, 'error'); return; }
    if (links.length === 0) { UI.toast('No links to add.', 'error'); return; }

    Data.addLinks(links);
    App.state.bulkDrafts  = [];
    App.state.bulkUrlText = '';
    UI.toast('Added ' + links.length + ' link' + (links.length !== 1 ? 's' : '') + '!', 'success');
    window.location.hash = '#/manage';
  },

  _titleFromUrl: function (url) {
    try {
      var u     = new URL(url);
      var host  = u.hostname.replace(/^www\./, '');
      var parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        var last = decodeURIComponent(parts[parts.length - 1])
          .replace(/\.\w+$/, '')
          .replace(/[-_]/g, ' ');
        if (last.length > 2) return host + ' — ' + last;
      }
      return host;
    } catch (x) {
      return url;
    }
  },

  // ── MODALS ───────────────────────────────────────────────────────
  openLinkModal: function (link, parentId) {
    var html = Pages.linkModal(link, Data.getCategories(), Data.getLinks(), Data.getSettings(), parentId || '');
    UI.showModal(html);
    // Focus title input
    setTimeout(function () {
      var ti = document.querySelector('#link-form input[name="title"]');
      if (ti) ti.focus();
    }, 50);
  },

  openCategoryModal: function (cat) {
    UI.showModal(Pages.categoryModal(cat));
    setTimeout(function () {
      var ni = document.querySelector('#category-form input[name="name"]');
      if (ni) ni.focus();
    }, 50);
  },

  openConfirm: function (msg, label, danger, onConfirm) {
    this._pendingConfirm = onConfirm;
    UI.showModal(Pages.confirmModal(msg, label, danger));
  },

  // ── IMPORT FILE ──────────────────────────────────────────────────
  handleImportFile: function (e) {
    var file = e.target.files[0];
    if (!file) return;
    Storage.importJSON(file).then(function () {
      Data.reload();
      UI.toast('Backup imported successfully!', 'success');
      App.render();
    }).catch(function (err) {
      UI.toast('Import failed: ' + err.message, 'error');
    });
    e.target.value = '';
  },
};

document.addEventListener('DOMContentLoaded', function () { App.init(); });
