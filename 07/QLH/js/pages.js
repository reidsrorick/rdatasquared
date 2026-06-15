var Pages = {

  // ── NAV ──────────────────────────────────────────────────────────
  nav(page) {
    var e = UI.esc;
    var links = [
      { href: '#/',         label: 'Dashboard', key: 'home' },
      { href: '#/manage',   label: 'Manage',    key: 'manage' },
      { href: '#/bulk-add', label: 'Bulk Add',  key: 'bulk-add' },
      { href: '#/settings', label: 'Settings',  key: 'settings' },
    ];
    return '<a class="nav-brand" href="#/">⚡ Quick Links Hub</a>' +
      '<div class="nav-links">' +
      links.map(function (l) {
        return '<a class="nav-link' + (page === l.key ? ' active' : '') + '" href="' + l.href + '">' + l.label + '</a>';
      }).join('') +
      '</div>';
  },

  // ── LINK CARD ────────────────────────────────────────────────────
  linkCard(link, categories, kids, parentTitle) {
    kids = kids || 0;
    var e      = UI.esc;
    var fav    = link.iconUrl || UI.faviconUrl(link.url);
    var color  = UI.catColor(link.category, categories);
    var target = link.openInNewTab ? '_blank' : '_self';
    var rel    = link.openInNewTab ? 'noopener noreferrer' : '';

    return '<div class="link-card" data-id="' + e(link.id) + '" draggable="true">' +
      '<span class="drag-handle" title="Drag to reorder">⠿</span>' +
      (parentTitle ? '<div class="link-card-parent">↳ nested in <a class="link-parent-ref" href="#/link/' + e(link.parentId) + '">' + e(parentTitle) + '</a></div>' : '') +
      '<div class="link-card-top">' +
        (fav ? '<img class="link-favicon" src="' + e(fav) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
        '<div class="link-title-wrap">' +
          '<a class="link-title" href="' + e(link.url) + '" target="' + target + '" rel="' + rel + '" data-action="open-link" data-id="' + e(link.id) + '">' + e(link.title) + '</a>' +
          '<span class="link-url">' + e(link.url) + '</span>' +
        '</div>' +
      '</div>' +
      (link.description ? '<p class="link-desc">' + e(link.description) + '</p>' : '') +
      (link.tags.length ? '<div class="link-tags">' + link.tags.map(function (t) { return '<span class="tag">' + e(t) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="link-card-footer">' +
        '<div class="link-card-meta">' +
          (link.category
            ? '<span class="link-cat-label"><span class="cat-dot" style="background:' + color + '"></span>' + e(link.category) + '</span>'
            : '') +
          (kids > 0
            ? '<button class="btn btn-secondary btn-sm" data-action="view-nested" data-id="' + e(link.id) + '">📁 ' + kids + ' nested</button>'
            : '') +
        '</div>' +
        '<div class="link-card-actions">' +
          '<button class="action-btn' + (link.favorite ? ' fav-on' : '') + '" data-action="toggle-favorite" data-id="' + e(link.id) + '" title="' + (link.favorite ? 'Unfavorite' : 'Favorite') + '">' + (link.favorite ? '★' : '☆') + '</button>' +
          '<a class="btn btn-primary btn-sm" href="' + e(link.url) + '" target="' + target + '" rel="' + rel + '" data-action="open-link" data-id="' + e(link.id) + '">Open ↗</a>' +
          '<button class="action-btn" data-action="edit-link" data-id="' + e(link.id) + '" title="Edit">✏️</button>' +
          '<button class="action-btn danger" data-action="delete-link" data-id="' + e(link.id) + '" title="Delete">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  // ── HOME ─────────────────────────────────────────────────────────
  home(state) {
    var e          = UI.esc;
    var links      = state.links;
    var categories = state.categories;
    var q          = state.searchQuery    || '';
    var view       = state.activeView    || 'all';
    var selCat     = state.selectedCategory || 'all';
    var selTag     = state.selectedTag   || '';
    var cols       = (Data.getSettings().gridColumns) | 0;
    var gridStyle  = cols > 0 ? ' style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))"' : '';

    // child counts
    var kids = {};
    links.forEach(function (l) {
      if (l.parentId) kids[l.parentId] = (kids[l.parentId] || 0) + 1;
    });

    // parent title lookup for nested link indicators
    var linkTitles = {};
    links.forEach(function (l) { linkTitles[l.id] = l.title; });

    // When any filter is active, include nested links so they can surface on their own
    var hasActiveFilter = q || (selCat && selCat !== 'all') || selTag;
    var filtered = hasActiveFilter
      ? links.slice()
      : links.filter(function (l) { return !l.parentId; });

    // search
    if (q) {
      var ql = q.toLowerCase();
      filtered = filtered.filter(function (l) {
        return l.title.toLowerCase().includes(ql) ||
          (l.description || '').toLowerCase().includes(ql) ||
          l.url.toLowerCase().includes(ql) ||
          l.tags.some(function (t) { return t.toLowerCase().includes(ql); }) ||
          (l.category || '').toLowerCase().includes(ql);
      });
    }

    // view filter
    if (view === 'favorites') {
      filtered = filtered.filter(function (l) { return l.favorite; });
    } else if (view === 'recent') {
      filtered = filtered
        .filter(function (l) { return l.lastUsed; })
        .sort(function (a, b) { return new Date(b.lastUsed) - new Date(a.lastUsed); })
        .slice(0, 12);
    }

    // category filter
    if (selCat && selCat !== 'all') {
      filtered = filtered.filter(function (l) { return l.category === selCat; });
    }

    // tag filter
    if (selTag) {
      filtered = filtered.filter(function (l) { return l.tags.indexOf(selTag) !== -1; });
    }

    // all unique tags
    var allTags = [];
    var tagSeen = {};
    links.forEach(function (l) {
      l.tags.forEach(function (t) { if (!tagSeen[t]) { tagSeen[t] = true; allTags.push(t); } });
    });
    allTags.sort();

    // group by category when showing "all" with no other filters
    var grouped   = null;
    var showGroup = view === 'all' && !q && selCat === 'all' && !selTag;
    if (showGroup) {
      grouped = {};
      filtered.forEach(function (l) {
        var key = l.category || 'Uncategorized';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(l);
      });
    }

    var self = this;

    // ── content ──
    var content = '';
    if (filtered.length === 0) {
      content = '<div class="empty-state">' +
        '<div class="empty-icon">🔗</div>' +
        '<h3>No links found</h3>' +
        '<p>' + (q || selCat !== 'all' || selTag ? 'Try adjusting your search or filters.' : 'Add your first link to get started.') + '</p>' +
        (!q ? '<button class="btn btn-primary" data-action="add-link">+ Add Link</button>' : '') +
        '</div>';
    } else if (showGroup) {
      var catOrder = categories.map(function (c) { return c.name; });
      var groups   = Object.keys(grouped).sort(function (a, b) {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        var ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      var favItems = filtered.filter(function (l) { return l.favorite; });
      var favSection = favItems.length > 0
        ? '<div class="section-group">' +
            '<div class="section-header" data-action="toggle-section">' +
              '<button class="section-toggle" data-action="toggle-section" tabindex="-1" aria-label="Toggle section">▾</button>' +
              '<span class="section-title">★ Favorites</span>' +
              '<span class="count-badge">' + favItems.length + '</span>' +
            '</div>' +
            '<div class="links-grid"' + gridStyle + '>' + favItems.map(function (l) { return self.linkCard(l, categories, kids[l.id] || 0); }).join('') + '</div>' +
          '</div>'
        : '';
      content = favSection + groups.map(function (cat) {
        var items = grouped[cat];
        return '<div class="section-group">' +
          '<div class="section-header" data-action="toggle-section">' +
            '<button class="section-toggle" data-action="toggle-section" tabindex="-1" aria-label="Toggle section">▾</button>' +
            '<span class="section-title">' + e(cat) + '</span>' +
            '<span class="count-badge">' + items.length + '</span>' +
          '</div>' +
          '<div class="links-grid"' + gridStyle + '>' + items.map(function (l) { return self.linkCard(l, categories, kids[l.id] || 0); }).join('') + '</div>' +
          '</div>';
      }).join('');
    } else {
      content = '<div class="links-grid"' + gridStyle + '>' +
        filtered.map(function (l) { return self.linkCard(l, categories, kids[l.id] || 0, l.parentId ? linkTitles[l.parentId] : null); }).join('') +
        '</div>';
    }

    // ── category badges ──
    var catBadges = categories.map(function (c) {
      var active = selCat === c.name;
      return '<button class="cat-badge" data-action="set-category" data-value="' + e(c.name) + '" style="' +
        (active ? 'background:' + c.color + ';color:#fff;border-color:' + c.color + ';' : 'border-color:' + c.color + ';color:' + c.color + ';') + '">' +
        '<span class="cat-dot" style="background:' + c.color + '"></span>' + e(c.name) +
        '</button>';
    }).join('');

    // ── tag badges (show up to 8 when no tag selected) ──
    var tagBadges = '';
    if (allTags.length > 0) {
      if (selTag) {
        tagBadges = '<button class="cat-badge" data-action="set-tag" data-value="" style="background:var(--primary);color:#fff;border-color:var(--primary);">× ' + e(selTag) + '</button>';
      } else {
        tagBadges = allTags.slice(0, 8).map(function (t) {
          return '<button class="cat-badge" data-action="set-tag" data-value="' + e(t) + '">' + e(t) + '</button>';
        }).join('');
      }
    }

    var exportConfigured = Data.getSettings().exportConfigured;
    return '<div class="page-header">' +
        '<div><h1 class="page-title">Quick Links Hub</h1><p class="page-subtitle">Your personal link management dashboard</p></div>' +
        '<div style="display:flex;gap:.5rem;align-items:center;">' +
          '<button class="btn btn-secondary" data-action="export-json" title="' + (exportConfigured ? 'Save backup to configured location' : 'Export backup') + '">⬇ ' + (exportConfigured ? 'Save Backup' : 'Export') + '</button>' +
          '<button class="btn btn-primary" data-action="add-link">+ Add Link</button>' +
        '</div>' +
      '</div>' +

      '<div class="search-wrap">' +
        '<span class="search-icon">🔍</span>' +
        '<input class="search-input" id="search-input" type="search" placeholder="Search links by title, URL, tag, or category…" value="' + e(q) + '" data-action="search">' +
      '</div>' +

      '<div class="filter-tabs">' +
        '<button class="filter-tab' + (view === 'all'       ? ' active' : '') + '" data-action="set-view" data-value="all">All Links</button>' +
        '<button class="filter-tab' + (view === 'favorites' ? ' active' : '') + '" data-action="set-view" data-value="favorites">★ Favorites</button>' +
        '<button class="filter-tab' + (view === 'recent'    ? ' active' : '') + '" data-action="set-view" data-value="recent">🕐 Recent</button>' +
      '</div>' +

      (categories.length > 0
        ? '<div class="cat-filters">' +
            '<button class="cat-badge" data-action="set-category" data-value="all" style="' + (selCat === 'all' ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : '') + '">All</button>' +
            catBadges +
          '</div>'
        : '') +

      (allTags.length > 0
        ? '<div class="cat-filters" style="margin-top:-.25rem;">' + tagBadges + '</div>'
        : '') +

      content;
  },

  // ── MANAGE ───────────────────────────────────────────────────────
  manage(state) {
    var e          = UI.esc;
    var links      = state.links;
    var categories = state.categories;
    var q          = state.searchQuery || '';

    var kids = {};
    links.forEach(function (l) {
      if (l.parentId) kids[l.parentId] = (kids[l.parentId] || 0) + 1;
    });

    var filtered = links.slice().sort(function (a, b) {
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return  1;
      return a.title.localeCompare(b.title);
    });

    if (q) {
      var ql = q.toLowerCase();
      filtered = filtered.filter(function (l) {
        return l.title.toLowerCase().includes(ql) ||
          l.url.toLowerCase().includes(ql) ||
          (l.category || '').toLowerCase().includes(ql);
      });
    }

    // Categories grid
    var catCards = categories.map(function (c) {
      var cnt = links.filter(function (l) { return l.category === c.name; }).length;
      return '<div class="cat-card">' +
        '<div class="cat-card-left">' +
          '<span class="cat-color-dot" style="background:' + c.color + '"></span>' +
          '<div><div class="cat-name-text">' + e(c.name) + '</div><div class="cat-link-count">' + cnt + ' link' + (cnt !== 1 ? 's' : '') + '</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:.2rem;">' +
          '<button class="action-btn" data-action="edit-category" data-id="' + e(c.id) + '" title="Edit">✏️</button>' +
          '<button class="action-btn danger" data-action="delete-category" data-id="' + e(c.id) + '" title="Delete">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Table rows
    var rows = filtered.map(function (l) {
      var parent = l.parentId ? links.find(function (p) { return p.id === l.parentId; }) : null;
      var color  = UI.catColor(l.category, categories);
      return '<tr>' +
        '<td class="td-link">' +
          (parent ? '<span style="color:var(--text-subtle);font-size:.75rem;">↳ ' + e(parent.title) + '<br></span>' : '') +
          '<a href="' + e(l.url) + '" target="_blank" rel="noopener noreferrer" data-action="open-link" data-id="' + e(l.id) + '">' + e(l.title) + '</a>' +
        '</td>' +
        '<td class="td-url"><a href="' + e(l.url) + '" target="_blank" rel="noopener noreferrer">' + e(l.url) + '</a></td>' +
        '<td>' + (l.category ? '<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.8rem;"><span style="width:8px;height:8px;border-radius:50%;background:' + color + ';display:inline-block;"></span>' + e(l.category) + '</span>' : '<span style="color:var(--text-subtle)">—</span>') + '</td>' +
        '<td><div style="display:flex;flex-wrap:wrap;gap:.2rem;">' + l.tags.map(function (t) { return '<span class="tag">' + e(t) + '</span>'; }).join('') + '</div></td>' +
        '<td>' + (kids[l.id] ? '<button class="btn btn-secondary btn-sm" data-action="view-nested" data-id="' + e(l.id) + '">' + kids[l.id] + ' →</button>' : '—') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="action-btn' + (l.favorite ? ' fav-on' : '') + '" data-action="toggle-favorite" data-id="' + e(l.id) + '" title="Favorite">' + (l.favorite ? '★' : '☆') + '</button>' +
          '<button class="action-btn" data-action="edit-link" data-id="' + e(l.id) + '" title="Edit">✏️</button>' +
          '<button class="action-btn danger" data-action="delete-link" data-id="' + e(l.id) + '" title="Delete">🗑</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="page-header">' +
        '<div><h1 class="page-title plain">Link Management</h1><p class="page-subtitle">Manage, edit, and organize all your links</p></div>' +
        '<button class="btn btn-primary" data-action="add-link">+ Add Link</button>' +
      '</div>' +

      '<h2 class="section-title" style="margin-bottom:.75rem;">Categories</h2>' +
      '<div class="cats-grid">' +
        catCards +
        '<button class="cat-card cat-card-add" data-action="add-category">+ Add Category</button>' +
      '</div>' +

      '<hr class="divider">' +

      '<div class="page-header" style="margin-bottom:.75rem;">' +
        '<h2 class="section-title">All Links <span class="count-badge">' + links.length + '</span></h2>' +
      '</div>' +

      '<div class="search-wrap">' +
        '<span class="search-icon">🔍</span>' +
        '<input class="search-input" id="search-input" type="search" placeholder="Filter links…" value="' + UI.esc(q) + '" data-action="search">' +
      '</div>' +

      (filtered.length === 0
        ? '<div class="empty-state"><div class="empty-icon">📭</div><h3>No links found</h3><p>Try a different search term.</p></div>'
        : '<div class="table-wrap"><table>' +
            '<thead><tr>' +
              '<th>Title</th><th>URL</th><th>Category</th><th>Tags</th><th>Nested</th><th>Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table></div>');
  },

  // ── SETTINGS ─────────────────────────────────────────────────────
  settings() {
    var s = Data.getSettings();
    return '<div class="page-header">' +
        '<div><h1 class="page-title plain">Settings</h1><p class="page-subtitle">Manage your preferences and data</p></div>' +
      '</div>' +

      '<div class="settings-section"><h3>Appearance</h3>' +
        '<div class="setting-row">' +
          '<div><div class="setting-label">Theme</div><div class="setting-desc">Light, dark, or follow system preference</div></div>' +
          '<div class="theme-options">' +
            '<button class="theme-opt' + (s.theme === 'light'  ? ' active' : '') + '" data-action="set-theme" data-value="light">☀️ Light</button>' +
            '<button class="theme-opt' + (s.theme === 'dark'   ? ' active' : '') + '" data-action="set-theme" data-value="dark">🌙 Dark</button>' +
            '<button class="theme-opt' + (s.theme === 'system' ? ' active' : '') + '" data-action="set-theme" data-value="system">💻 System</button>' +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div><div class="setting-label">Grid Columns</div><div class="setting-desc">Number of link cards per row (Auto adjusts to screen width)</div></div>' +
          '<div class="theme-options">' +
            [['0','Auto'],['2','2'],['3','3'],['4','4'],['5','5'],['6','6']].map(function(o) {
              var cols = s.gridColumns || 0;
              return '<button class="theme-opt' + (cols === parseInt(o[0]) ? ' active' : '') + '" data-action="set-columns" data-value="' + o[0] + '">' + o[1] + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="settings-section"><h3>Link Behavior</h3>' +
        '<div class="setting-row">' +
          '<div><div class="setting-label">Open links in new tab by default</div><div class="setting-desc">New links will default to opening in a new browser tab</div></div>' +
          '<label class="toggle"><input type="checkbox" data-action="toggle-new-tab"' + (s.defaultOpenInNewTab ? ' checked' : '') + '><span class="toggle-track"></span></label>' +
        '</div>' +
      '</div>' +

      '<div class="settings-section"><h3>Data</h3>' +
        '<div class="setting-row">' +
          '<div>' +
            '<div class="setting-label">Export Backup</div>' +
            '<div class="setting-desc">Saves as <code>quick-links-hub.json</code></div>' +
            (s.exportConfigured
              ? '<div class="setting-desc export-status configured">✓ Location saved — exports overwrite the same file</div>'
              : '<div class="setting-desc export-status">No saved location — browser will prompt each time</div>') +
          '</div>' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">' +
            '<button class="btn btn-secondary" data-action="export-json">⬇ Export</button>' +
            (s.exportConfigured ? '<button class="btn btn-ghost btn-sm" data-action="clear-export-location">Change Location</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div><div class="setting-label">Import Backup</div><div class="setting-desc">Restore data from a previously exported JSON backup file</div></div>' +
          '<button class="btn btn-secondary" data-action="import-json">⬆ Import JSON</button>' +
        '</div>' +
        '<div class="setting-row">' +
          '<div><div class="setting-label">Clear All Data</div><div class="setting-desc">Permanently delete all links and categories and reset to defaults</div></div>' +
          '<button class="btn btn-danger" data-action="clear-data">🗑 Clear All</button>' +
        '</div>' +
      '</div>' +

      '<div class="settings-section"><h3>About</h3>' +
        '<div class="setting-row">' +
          '<div>' +
            '<div class="setting-label">Quick Links Hub v1.0</div>' +
            '<div class="setting-desc">A personal bookmark manager. Data is stored in your browser\'s localStorage. Export a backup regularly to prevent data loss. Works offline and can be hosted on GitHub Pages.</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  // ── LINK DETAIL ──────────────────────────────────────────────────
  linkDetail(id) {
    var e          = UI.esc;
    var link       = Data.getLink(id);
    var categories = Data.getCategories();
    var children   = Data.getChildren(id);
    var self       = this;

    if (!link) {
      return '<div class="empty-state"><div class="empty-icon">🔍</div><h3>Link not found</h3><p>This link may have been deleted.</p><a class="btn btn-primary" href="#/">← Back to Dashboard</a></div>';
    }

    var target = link.openInNewTab ? '_blank' : '_self';
    var rel    = link.openInNewTab ? 'noopener noreferrer' : '';
    var color  = UI.catColor(link.category, categories);

    return '<div style="margin-bottom:1rem;"><a class="btn btn-ghost btn-sm" href="#/">← Back</a></div>' +

      '<div class="parent-card">' +
        '<div class="parent-card-top">' +
          '<div>' +
            '<div class="parent-title">' + e(link.title) + '</div>' +
            '<a href="' + e(link.url) + '" target="' + target + '" rel="' + rel + '" class="link-url" style="font-size:.875rem;">' + e(link.url) + '</a>' +
            (link.description ? '<p style="margin-top:.5rem;color:var(--text-muted);font-size:.9rem;">' + e(link.description) + '</p>' : '') +
            (link.notes ? '<p style="margin-top:.5rem;color:var(--text-muted);font-size:.85rem;font-style:italic;">' + e(link.notes) + '</p>' : '') +
            (link.tags.length ? '<div class="link-tags" style="margin-top:.75rem;">' + link.tags.map(function (t) { return '<span class="tag">' + e(t) + '</span>'; }).join('') + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">' +
            '<a class="btn btn-primary" href="' + e(link.url) + '" target="' + target + '" rel="' + rel + '" data-action="open-link" data-id="' + e(link.id) + '">Open ↗</a>' +
            '<button class="btn btn-secondary" data-action="edit-link" data-id="' + e(link.id) + '">✏️ Edit</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="page-header">' +
        '<h2 class="section-title">Nested Links <span class="count-badge">' + children.length + '</span></h2>' +
        '<button class="btn btn-primary" data-action="add-nested-link" data-parent-id="' + e(id) + '">+ Add Nested</button>' +
      '</div>' +

      (children.length === 0
        ? '<div class="empty-state" style="padding:2rem;"><p>No nested links yet.</p><button class="btn btn-primary mt-xs" data-action="add-nested-link" data-parent-id="' + e(id) + '">+ Add Nested Link</button></div>'
        : '<div class="links-grid">' + children.map(function (c) { return self.linkCard(c, categories, 0); }).join('') + '</div>');
  },

  // ── LINK MODAL ───────────────────────────────────────────────────
  linkModal(link, categories, links, settings, parentId) {
    parentId      = parentId || '';
    var e         = UI.esc;
    var isEdit    = !!link;
    var f         = link || { title: '', url: '', description: '', notes: '', category: '', tags: [], favorite: false, openInNewTab: settings.defaultOpenInNewTab, parentId: parentId };
    var parents   = links.filter(function (l) { return !l.parentId && l.id !== (link && link.id); });

    var tagChips = (f.tags || []).map(function (t) {
      return '<span class="tag-chip" data-tag="' + e(t) + '">' + e(t) +
        '<button type="button" class="tag-chip-rm" data-action="remove-tag">×</button></span>';
    }).join('');

    var catOptions = categories.map(function (c) {
      return '<option value="' + e(c.name) + '"' + (f.category === c.name ? ' selected' : '') + '>' + e(c.name) + '</option>';
    }).join('');

    var parentOptions = parents.map(function (l) {
      return '<option value="' + e(l.id) + '"' + (f.parentId === l.id ? ' selected' : '') + '>' + e(l.title) + '</option>';
    }).join('');

    return '<div class="modal">' +
      '<div class="modal-header"><span class="modal-title">' + (isEdit ? 'Edit Link' : 'Add Link') + '</span><button class="modal-close" data-action="close-modal">×</button></div>' +
      '<form class="modal-body" id="link-form" data-action="submit-link" data-id="' + e(link ? link.id : '') + '">' +
        '<div class="form-group"><label class="form-label">Title <span class="form-required">*</span></label>' +
          '<input class="form-input" name="title" value="' + e(f.title) + '" placeholder="My Link" required></div>' +
        '<div class="form-group"><label class="form-label">URL <span class="form-required">*</span></label>' +
          '<input class="form-input" name="url" type="url" value="' + e(f.url) + '" placeholder="https://example.com" required></div>' +
        '<div class="form-group"><label class="form-label">Custom Icon URL <span style="font-weight:400;color:var(--text-muted);">(optional — overrides auto favicon)</span></label>' +
          '<input class="form-input" name="iconUrl" type="url" value="' + e(f.iconUrl || '') + '" placeholder="https://example.com/icon.png"></div>' +
        '<div class="form-group"><label class="form-label">Description</label>' +
          '<input class="form-input" name="description" value="' + e(f.description) + '" placeholder="Short description"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label>' +
          '<textarea class="form-textarea" name="notes" placeholder="Private notes…">' + e(f.notes) + '</textarea></div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="margin:0"><label class="form-label">Category</label>' +
            '<select class="form-select" name="category"><option value="">None</option>' + catOptions + '</select></div>' +
          '<div class="form-group" style="margin:0"><label class="form-label">Parent Link</label>' +
            '<select class="form-select" name="parentId"><option value="">Top level</option>' + parentOptions + '</select></div>' +
        '</div>' +
        '<div class="form-group" style="margin-top:1rem"><label class="form-label">Tags <span style="font-weight:400;color:var(--text-muted);">(press Enter to add)</span></label>' +
          '<div class="tag-input-wrap" id="tag-input-wrap">' + tagChips +
            '<input class="tag-text-input" id="tag-text-input" placeholder="Add a tag…" autocomplete="off">' +
          '</div></div>' +
        '<div class="form-toggles">' +
          '<label class="form-toggle-item"><label class="toggle" style="margin:0"><input type="checkbox" name="openInNewTab"' + (f.openInNewTab ? ' checked' : '') + '><span class="toggle-track"></span></label>Open in new tab</label>' +
          '<label class="form-toggle-item"><label class="toggle" style="margin:0"><input type="checkbox" name="favorite"' + (f.favorite ? ' checked' : '') + '><span class="toggle-track"></span></label>Favorite ★</label>' +
        '</div>' +
      '</form>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" form="link-form" type="submit">' + (isEdit ? 'Save Changes' : 'Add Link') + '</button>' +
      '</div></div>';
  },

  // ── CATEGORY MODAL ───────────────────────────────────────────────
  categoryModal(cat) {
    var e      = UI.esc;
    var isEdit = !!cat;
    var COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
    var cur    = (cat && cat.color) || COLORS[0];

    var swatches = COLORS.map(function (c) {
      return '<button type="button" class="color-swatch' + (c === cur ? ' active' : '') + '" style="background:' + c + '" data-action="select-color" data-color="' + c + '" title="' + c + '"></button>';
    }).join('');

    return '<div class="modal modal-sm">' +
      '<div class="modal-header"><span class="modal-title">' + (isEdit ? 'Edit Category' : 'Add Category') + '</span><button class="modal-close" data-action="close-modal">×</button></div>' +
      '<form class="modal-body" id="category-form" data-action="submit-category" data-id="' + e(cat ? cat.id : '') + '">' +
        '<div class="form-group"><label class="form-label">Name <span class="form-required">*</span></label>' +
          '<input class="form-input" name="name" value="' + e(cat ? cat.name : '') + '" placeholder="Category name" required></div>' +
        '<div class="form-group"><label class="form-label">Color</label>' +
          '<input type="hidden" name="color" id="cat-color-val" value="' + e(cur) + '">' +
          '<div class="color-options">' + swatches + '</div></div>' +
      '</form>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" form="category-form" type="submit">' + (isEdit ? 'Save' : 'Add Category') + '</button>' +
      '</div></div>';
  },

  // ── BULK ADD ─────────────────────────────────────────────────────
  bulkAdd(state) {
    var e          = UI.esc;
    var categories = state.categories || [];
    var drafts     = state.bulkDrafts  || [];
    var urlText    = state.bulkUrlText || '';

    var catOptions = categories.map(function (c) {
      return '<option value="' + e(c.name) + '">' + e(c.name) + '</option>';
    }).join('');

    var draftCards = '';
    if (drafts.length > 0) {
      draftCards = '<div class="bulk-grid">' +
        drafts.map(function (d, i) {
          return '<div class="bulk-card" data-index="' + i + '">' +
            '<div class="bulk-card-header">' +
              '<span class="bulk-card-num">#' + (i + 1) + '</span>' +
              '<button type="button" class="bulk-card-remove" data-action="bulk-remove" data-index="' + i + '" title="Remove">×</button>' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">URL <span class="form-required">*</span></label>' +
              '<input class="form-input" data-field="url" value="' + e(d.url) + '" placeholder="https://example.com">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">Title <span class="form-required">*</span></label>' +
              '<input class="form-input" data-field="title" value="' + e(d.title) + '" placeholder="Link title">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label">Category</label>' +
              '<select class="form-select" data-field="category"><option value="">None</option>' + catOptions + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:0">' +
              '<label class="form-label">Tags <span style="font-weight:400;color:var(--text-muted);">(comma-separated)</span></label>' +
              '<input class="form-input" data-field="tags" value="' + e((d.tags || []).join(', ')) + '" placeholder="tag1, tag2">' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    return '<div class="page-header">' +
        '<div><h1 class="page-title plain">Bulk Add Links</h1><p class="page-subtitle">Add multiple links at once</p></div>' +
        (drafts.length > 0
          ? '<button class="btn btn-primary" data-action="bulk-save">Add ' + drafts.length + ' Link' + (drafts.length !== 1 ? 's' : '') + '</button>'
          : '') +
      '</div>' +

      '<div class="settings-section">' +
        '<h3>Paste URLs</h3>' +
        '<p style="color:var(--text-muted);font-size:.875rem;margin-bottom:.75rem;">Enter one URL per line. Titles are auto-filled from the URL — edit them in the grid below.</p>' +
        '<textarea class="form-textarea" id="bulk-url-input" rows="5" placeholder="https://github.com&#10;https://example.com&#10;https://docs.google.com">' + e(urlText) + '</textarea>' +
        '<div style="margin-top:.75rem;display:flex;gap:.75rem;align-items:center;">' +
          '<button class="btn btn-primary" data-action="bulk-parse">Parse URLs →</button>' +
          (drafts.length > 0 ? '<span style="font-size:.875rem;color:var(--text-muted);">' + drafts.length + ' card' + (drafts.length !== 1 ? 's' : '') + ' ready to save</span>' : '') +
        '</div>' +
      '</div>' +

      (drafts.length > 0
        ? '<hr class="divider">' +
          '<div class="section-header"><span class="section-title">Review &amp; Edit</span><span class="count-badge">' + drafts.length + '</span></div>' +
          draftCards +
          '<div style="margin-top:1.5rem;display:flex;gap:.75rem;justify-content:flex-end;">' +
            '<a class="btn btn-secondary" href="#/manage">Cancel</a>' +
            '<button class="btn btn-primary" data-action="bulk-save">Add ' + drafts.length + ' Link' + (drafts.length !== 1 ? 's' : '') + '</button>' +
          '</div>'
        : '<div style="margin-top:1rem;"><a class="btn btn-ghost btn-sm" href="#/">← Back to Dashboard</a></div>');
  },

  // ── CONFIRM MODAL ────────────────────────────────────────────────
  confirmModal(msg, label, danger) {
    return '<div class="modal modal-sm">' +
      '<div class="modal-header"><span class="modal-title">Confirm</span><button class="modal-close" data-action="close-modal">×</button></div>' +
      '<div class="modal-body"><p style="color:var(--text-muted);font-size:.9rem;">' + UI.esc(msg) + '</p></div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" data-action="close-modal">Cancel</button>' +
        '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-action">' + UI.esc(label || 'Confirm') + '</button>' +
      '</div></div>';
  },
};
