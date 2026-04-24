/* ============================================================
   UI — All DOM rendering. No storage or business logic here.
   ============================================================ */
window.UI = (() => {

  /* ---- Placeholder gradient lookup ------------------------ */
  const PLACEHOLDER_EMOJIS = ['🎮','🕹️','🎲','🃏','♟️','🎯'];

  function placeholderStyle(title) {
    const idx = Utils.colorIndex(title);
    return `var(--grad-${idx})`;
  }

  function placeholderEmoji(title) {
    const idx = Utils.colorIndex(title);
    return PLACEHOLDER_EMOJIS[idx] || '🎮';
  }

  /* ============================================================
     CARD BUILDING
     ============================================================ */

  /**
   * Build and return a game-card <article> element.
   * options: { draggable, showArchiveBadge, inManage }
   */
  function createGameCard(game, options = {}) {
    const { draggable = false } = options;

    const card = document.createElement('article');
    card.className = 'game-card';
    card.dataset.id = game.id;
    card.setAttribute('role', 'listitem');
    if (game.archived) card.classList.add('is-archived');

    // -- Drag handle (favorites only) --
    if (draggable) {
      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.title = 'Drag to reorder';
      handle.setAttribute('aria-hidden', 'true');
      card.appendChild(handle);
    }

    // -- Thumbnail --
    const thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    if (game.thumbnail) {
      const img = document.createElement('img');
      img.src    = game.thumbnail;
      img.alt    = game.title;
      img.loading = 'lazy';
      img.onerror = () => {
        // Fall back to placeholder on broken image
        img.remove();
        thumb.appendChild(_makePlaceholder(game));
      };
      thumb.appendChild(img);
    } else {
      thumb.appendChild(_makePlaceholder(game));
    }
    card.appendChild(thumb);

    // -- Body --
    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = game.title;
    body.appendChild(title);

    if (game.description) {
      const desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = game.description;
      body.appendChild(desc);
    }

    if (game.tags && game.tags.length > 0) {
      const tags = document.createElement('div');
      tags.className = 'card-tags';
      game.tags.slice(0, 5).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        tags.appendChild(span);
      });
      body.appendChild(tags);
    }

    card.appendChild(body);

    // -- Footer --
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    // Badges
    const badges = document.createElement('div');
    badges.className = 'card-badges';
    if (game.userAdded) {
      const b = document.createElement('span');
      b.className = 'badge badge-custom';
      b.textContent = 'Custom';
      badges.appendChild(b);
    }
    if (game.archived) {
      const b = document.createElement('span');
      b.className = 'badge badge-archived';
      b.textContent = 'Archived';
      badges.appendChild(b);
    }
    footer.appendChild(badges);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Favorite button
    const favBtn = document.createElement('button');
    favBtn.className = 'card-btn fav-btn' + (game.favorite ? ' is-fav' : '');
    favBtn.dataset.action = 'favorite';
    favBtn.title   = game.favorite ? 'Remove from favorites' : 'Add to favorites';
    favBtn.setAttribute('aria-label', game.favorite ? 'Remove from favorites' : 'Add to favorites');
    favBtn.setAttribute('aria-pressed', String(game.favorite));
    favBtn.textContent = '★';
    if (!game.archived) actions.appendChild(favBtn);

    // Play button
    const playBtn = document.createElement('button');
    playBtn.className   = 'card-btn play-btn';
    playBtn.dataset.action = 'play';
    playBtn.textContent = '▶ Play';
    playBtn.title       = `Play ${game.title}`;
    actions.appendChild(playBtn);

    // Menu button + dropdown
    const menuWrap = document.createElement('div');
    menuWrap.className = 'card-menu';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'card-btn menu-btn';
    menuBtn.dataset.action = 'menu';
    menuBtn.title = 'More options';
    menuBtn.setAttribute('aria-label', 'More options');
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.textContent = '⋮';
    menuWrap.appendChild(menuBtn);

    const dropdown = document.createElement('div');
    dropdown.className = 'card-dropdown';
    dropdown.setAttribute('role', 'menu');

    _addDropdownItem(dropdown, 'edit', 'Edit');
    if (game.archived) {
      _addDropdownItem(dropdown, 'unarchive', 'Restore');
    } else {
      _addDropdownItem(dropdown, 'archive', 'Archive');
    }
    _addDropdownItem(dropdown, 'delete', 'Delete', true);

    menuWrap.appendChild(dropdown);
    actions.appendChild(menuWrap);

    footer.appendChild(actions);
    card.appendChild(footer);

    return card;
  }

  function _makePlaceholder(game) {
    const div = document.createElement('div');
    div.className = 'card-thumb-placeholder';
    div.style.background = placeholderStyle(game.title);
    div.textContent = placeholderEmoji(game.title);
    div.setAttribute('aria-hidden', 'true');
    return div;
  }

  function _addDropdownItem(dropdown, action, label, isDanger = false) {
    const btn = document.createElement('button');
    btn.dataset.action = action;
    btn.textContent    = label;
    btn.setAttribute('role', 'menuitem');
    if (isDanger) btn.classList.add('danger');
    dropdown.appendChild(btn);
  }

  /* ============================================================
     MANAGE LIST ITEM
     ============================================================ */

  function createManageItem(game) {
    const item = document.createElement('div');
    item.className = 'manage-item';
    item.dataset.id = game.id;

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'manage-thumb';
    if (game.thumbnail) {
      const img = document.createElement('img');
      img.src    = game.thumbnail;
      img.alt    = game.title;
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); thumb.appendChild(_makeManagePlaceholder(game)); };
      thumb.appendChild(img);
    } else {
      thumb.appendChild(_makeManagePlaceholder(game));
    }
    item.appendChild(thumb);

    // Info
    const info = document.createElement('div');
    info.className = 'manage-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'manage-title';
    titleEl.textContent = game.title;
    info.appendChild(titleEl);

    const urlEl = document.createElement('div');
    urlEl.className = 'manage-url';
    urlEl.textContent = Utils.truncate(game.url, 60);
    urlEl.title = game.url;
    info.appendChild(urlEl);

    if (game.tags && game.tags.length > 0) {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'manage-tags';
      game.tags.slice(0, 4).forEach(t => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = t;
        tagsEl.appendChild(span);
      });
      info.appendChild(tagsEl);
    }

    item.appendChild(info);

    // Status badges
    const status = document.createElement('div');
    status.className = 'manage-status';
    if (game.userAdded) {
      const b = document.createElement('span');
      b.className = 'badge badge-custom';
      b.textContent = 'Custom';
      status.appendChild(b);
    }
    if (game.favorite) {
      const b = document.createElement('span');
      b.className = 'badge badge-favorite';
      b.textContent = '★ Fav';
      status.appendChild(b);
    }
    if (game.archived) {
      const b = document.createElement('span');
      b.className = 'badge badge-archived';
      b.textContent = 'Archived';
      status.appendChild(b);
    }
    item.appendChild(status);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'manage-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.dataset.action = 'edit';
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);

    const archBtn = document.createElement('button');
    archBtn.className = 'btn btn-ghost btn-sm';
    archBtn.dataset.action = game.archived ? 'unarchive' : 'archive';
    archBtn.textContent = game.archived ? 'Restore' : 'Archive';
    actions.appendChild(archBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm';
    delBtn.style.color = 'var(--color-danger)';
    delBtn.dataset.action = 'delete';
    delBtn.textContent = 'Delete';
    actions.appendChild(delBtn);

    item.appendChild(actions);
    return item;
  }

  function _makeManagePlaceholder(game) {
    const div = document.createElement('div');
    div.className = 'manage-thumb-placeholder';
    div.style.background = placeholderStyle(game.title);
    div.textContent = placeholderEmoji(game.title);
    div.setAttribute('aria-hidden', 'true');
    return div;
  }

  /* ============================================================
     FILTER / SORT
     ============================================================ */

  /* Apply search + tag filter only — preserves incoming order. Used for
     favorites so drag-reorder isn't overwritten by the sort setting. */
  function applyFilters(games) {
    const { searchQuery, activeTagFilter } = AppState;
    let filtered = games;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(g =>
        g.title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q) ||
        (g.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (g.category || '').toLowerCase().includes(q)
      );
    }

    if (activeTagFilter) {
      filtered = filtered.filter(g => (g.tags || []).includes(activeTagFilter));
    }

    return filtered;
  }

  /* Apply search + tag filter + sort. Used for all non-favorites grids. */
  function applyFiltersAndSort(games) {
    const { sortBy } = AppState;
    return [...applyFilters(games)].sort((a, b) => {
      switch (sortBy) {
        case 'title':      return a.title.localeCompare(b.title);
        case 'title-desc': return b.title.localeCompare(a.title);
        case 'recent':     return new Date(b.createdAt) - new Date(a.createdAt);
        case 'updated':    return new Date(b.updatedAt) - new Date(a.updatedAt);
        default:           return 0;
      }
    });
  }

  /* ============================================================
     TAG FILTER BAR
     ============================================================ */

  function renderTagFilterBar() {
    const bar = document.getElementById('tag-filter-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const tags = Catalog.getAllTags();
    if (tags.length === 0) return;

    const label = document.createElement('span');
    label.className = 'tag-filter-label';
    label.textContent = 'Filter:';
    bar.appendChild(label);

    // "All" button
    const all = document.createElement('button');
    all.className = 'tag clickable' + (!AppState.activeTagFilter ? ' active' : '');
    all.textContent = 'All';
    all.dataset.tag = '';
    all.setAttribute('aria-pressed', String(!AppState.activeTagFilter));
    bar.appendChild(all);

    tags.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tag clickable' + (AppState.activeTagFilter === t ? ' active' : '');
      btn.textContent = t;
      btn.dataset.tag = t;
      btn.setAttribute('aria-pressed', String(AppState.activeTagFilter === t));
      bar.appendChild(btn);
    });
  }

  /* ============================================================
     FAVORITES GRID
     ============================================================ */

  function renderFavorites() {
    const grid  = document.getElementById('favorites-grid');
    const empty = document.getElementById('favorites-empty');
    const hint  = document.getElementById('favorites-hint');
    if (!grid) return;

    DragDrop.destroy(grid);
    grid.innerHTML = '';

    const favs = Catalog.getOrderedFavorites();
    const filtered = applyFilters(favs); // preserve drag order — never re-sort favorites

    if (filtered.length === 0) {
      empty?.classList.remove('hidden');
      hint  && (hint.textContent = '');
      return;
    }

    empty?.classList.add('hidden');
    hint  && (hint.textContent = 'Drag cards to reorder');

    filtered.forEach(game => {
      const card = createGameCard(game, { draggable: true });
      grid.appendChild(card);
    });

    DragDrop.init(grid, async (newOrderedIds) => {
      await Catalog.setFavoritesOrder(newOrderedIds);
    });
  }

  /* ============================================================
     HUB VIEW
     ============================================================ */

  function renderHub() {
    // Tag filter bar
    renderTagFilterBar();

    // Favorites
    renderFavorites();

    // Active (non-favorite, non-archived)
    const activeGrid  = document.getElementById('active-grid');
    const activeEmpty = document.getElementById('active-empty');
    const gameCount   = document.getElementById('game-count');
    if (!activeGrid) return;

    activeGrid.innerHTML = '';

    const active   = Catalog.getNonFavoriteActive();
    const filtered = applyFiltersAndSort(active);

    if (gameCount) {
      gameCount.textContent = `${filtered.length} game${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
      activeEmpty?.classList.remove('hidden');
    } else {
      activeEmpty?.classList.add('hidden');
      filtered.forEach(game => {
        activeGrid.appendChild(createGameCard(game));
      });
    }

    // Archived section on hub (if setting enabled)
    renderArchivedHub();
  }

  function renderArchivedHub() {
    const section = document.getElementById('archived-hub-section');
    if (!section) return;

    if (!AppState.settings.showArchived) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    const grid  = section.querySelector('.games-grid');
    const empty = section.querySelector('.empty-state');
    if (!grid) return;

    grid.innerHTML = '';

    const archived  = Catalog.getArchived();
    const filtered  = applyFiltersAndSort(archived);

    if (filtered.length === 0) {
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    filtered.forEach(game => grid.appendChild(createGameCard(game)));
  }

  /* ============================================================
     MANAGE VIEW
     ============================================================ */

  function renderManage() {
    const list  = document.getElementById('manage-list');
    const empty = document.getElementById('manage-empty');
    if (!list) return;
    list.innerHTML = '';

    const filter  = AppState.manageFilter || 'all';
    const search  = (document.getElementById('manage-search')?.value || '').toLowerCase();

    let games = Catalog.getAll();

    if (filter === 'active')     games = games.filter(g => !g.archived);
    if (filter === 'user-added') games = games.filter(g => g.userAdded);
    if (filter === 'archived')   games = games.filter(g => g.archived);

    if (search) {
      games = games.filter(g =>
        g.title.toLowerCase().includes(search) ||
        (g.description || '').toLowerCase().includes(search) ||
        g.url.toLowerCase().includes(search)
      );
    }

    games.sort((a, b) => a.title.localeCompare(b.title));

    if (games.length === 0) {
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    games.forEach(g => list.appendChild(createManageItem(g)));
  }

  /* ============================================================
     ARCHIVED VIEW
     ============================================================ */

  function renderArchived() {
    const grid  = document.getElementById('archived-grid');
    const empty = document.getElementById('archived-empty');
    if (!grid) return;
    grid.innerHTML = '';

    const archived = Catalog.getArchived();
    const filtered = applyFiltersAndSort(archived);

    if (filtered.length === 0) {
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    filtered.forEach(game => grid.appendChild(createGameCard(game)));
  }

  /* ============================================================
     ROUTER — showView / renderCurrentView
     ============================================================ */

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add('active');

    document.querySelectorAll('.nav-btn, .mobile-nav-drawer .nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
      b.setAttribute('aria-current', b.dataset.view === name ? 'page' : 'false');
    });

    AppState.currentView = name;

    if (name === 'hub')      renderHub();
    if (name === 'manage')   renderManage();
    if (name === 'archived') renderArchived();
    if (name === 'settings') Settings.syncSettingsForm();

    // Close mobile nav if open
    document.getElementById('mobile-nav-drawer')?.classList.remove('open');
  }

  function renderCurrentView() {
    const v = AppState.currentView;
    if (v === 'hub')      renderHub();
    if (v === 'manage')   renderManage();
    if (v === 'archived') renderArchived();
  }

  /* ============================================================
     MODALS — overlay + named modal panel
     ============================================================ */

  let _lastFocusedEl = null; // Restore focus on close

  function _openOverlay() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    // Trap focus — next tab cycle lands in first focusable element
    const firstFocus = overlay.querySelector('button, input, select, textarea, [href], [tabindex]');
    firstFocus?.focus();
  }

  function _closeOverlay() {
    // Only close overlay if no modals remain visible
    const visible = document.querySelectorAll('.modal:not(.hidden)');
    if (visible.length === 0) {
      document.getElementById('modal-overlay')?.classList.add('hidden');
      _lastFocusedEl?.focus();
      _lastFocusedEl = null;
    }
  }

  function openModal(name) {
    _lastFocusedEl = document.activeElement;
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(`modal-${name}`)?.classList.remove('hidden');
    _openOverlay();
  }

  function closeModal(name) {
    document.getElementById(`modal-${name}`)?.classList.add('hidden');
    _closeOverlay();
  }

  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('modal-overlay')?.classList.add('hidden');
    _lastFocusedEl?.focus();
    _lastFocusedEl = null;
  }

  /* ---- Confirm modal -------------------------------------- */

  let _confirmCallback = null;

  function openConfirm(title, message, onConfirm, btnType = 'danger') {
    _confirmCallback = onConfirm;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.className = `btn btn-${btnType}`;
    okBtn.textContent = 'Confirm';
    openModal('confirm');
  }

  function _bindConfirmModal() {
    document.getElementById('confirm-ok-btn')?.addEventListener('click', async () => {
      closeModal('confirm');
      if (_confirmCallback) {
        await _confirmCallback();
        _confirmCallback = null;
      }
    });
    document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => {
      closeModal('confirm');
      _confirmCallback = null;
    });
  }

  /* ---- Game form modal ------------------------------------ */

  function openGameForm(existingGame = null) {
    const form   = document.getElementById('game-form');
    const title  = document.getElementById('modal-form-title');
    const saveBtn = document.getElementById('save-game-btn');
    if (!form) return;

    form.reset();
    // Clear errors
    form.querySelectorAll('.field-error').forEach(el => el.textContent = '');

    document.getElementById('form-game-id').value   = existingGame?.id || '';
    document.getElementById('form-title').value     = existingGame?.title || '';
    document.getElementById('form-url').value       = existingGame?.url || '';
    document.getElementById('form-description').value = existingGame?.description || '';
    document.getElementById('form-category').value  = existingGame?.category || '';
    document.getElementById('form-tags').value      = Utils.tagsToString(existingGame?.tags || []);
    document.getElementById('form-thumbnail').value = existingGame?.thumbnail || '';
    document.getElementById('form-favorite').checked = existingGame?.favorite || false;

    title.textContent   = existingGame ? 'Edit Game' : 'Add Game';
    saveBtn.textContent = existingGame ? 'Save Changes' : 'Add Game';

    openModal('game-form');
  }

  function _bindGameFormModal() {
    document.getElementById('save-game-btn')?.addEventListener('click', async () => {
      const id          = document.getElementById('form-game-id').value;
      const title       = document.getElementById('form-title').value;
      const url         = document.getElementById('form-url').value;
      const description = document.getElementById('form-description').value;
      const category    = document.getElementById('form-category').value;
      const tags        = document.getElementById('form-tags').value;
      const thumbnail   = document.getElementById('form-thumbnail').value;
      const favorite    = document.getElementById('form-favorite').checked;

      const data = { title, url, description, category, tags, thumbnail, favorite };
      const { ok, fieldErrors } = Validation.validateGame(data);

      // Clear previous errors
      document.getElementById('form-title-error').textContent = '';
      document.getElementById('form-url-error').textContent   = '';

      if (!ok) {
        if (fieldErrors.title)       document.getElementById('form-title-error').textContent = fieldErrors.title;
        if (fieldErrors.url)         document.getElementById('form-url-error').textContent   = fieldErrors.url;
        if (fieldErrors.thumbnail)   Utils.toast(fieldErrors.thumbnail, 'error');
        return;
      }

      const saveBtn = document.getElementById('save-game-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      let result;
      if (id) {
        result = await Catalog.updateGame(id, data);
      } else {
        result = await Catalog.addGame(data);
      }

      saveBtn.disabled = false;
      saveBtn.textContent = id ? 'Save Changes' : 'Add Game';

      if (!result.ok) {
        if (result.error?.toLowerCase().includes('url') || result.error?.toLowerCase().includes('duplicate')) {
          document.getElementById('form-url-error').textContent = result.error;
        } else {
          Utils.toast(result.error, 'error');
        }
        return;
      }

      closeModal('game-form');
      Utils.toast(id ? 'Game updated.' : 'Game added to library.', 'success');
    });
  }

  /* ---- Import modal --------------------------------------- */

  function openImportModal() {
    const fileInput = document.getElementById('import-file');
    const preview   = document.getElementById('import-preview');
    const errorEl   = document.getElementById('import-error');
    const confirmBtn = document.getElementById('import-confirm-btn');
    if (!fileInput) return;

    fileInput.value = '';
    preview?.classList.add('hidden');
    errorEl?.classList.add('hidden');
    if (confirmBtn) confirmBtn.disabled = true;
    ImportExport.clearPending();

    openModal('import');
  }

  async function _handleImportFileChange(e) {
    const file       = e.target.files[0];
    const preview    = document.getElementById('import-preview');
    const errorEl    = document.getElementById('import-error');
    const confirmBtn = document.getElementById('import-confirm-btn');

    preview?.classList.add('hidden');
    errorEl?.classList.add('hidden');
    if (confirmBtn) confirmBtn.disabled = true;
    ImportExport.clearPending();

    if (!file) return;

    const result = await ImportExport.readAndValidateFile(file);

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
      }
      return;
    }

    ImportExport.setPending(result.result.games);

    if (preview) {
      const w = result.result.warnings;
      preview.innerHTML = `
        <strong>${result.result.games.length}</strong> valid game(s) found in file.
        ${w.length > 0 ? `<br><em>Warnings: ${w.join(' ')}</em>` : ''}
      `;
      preview.classList.remove('hidden');
    }

    if (confirmBtn) confirmBtn.disabled = false;
  }

  function _bindImportModal() {
    document.getElementById('import-file')?.addEventListener('change', _handleImportFileChange);

    document.getElementById('import-confirm-btn')?.addEventListener('click', async () => {
      const games = ImportExport.getPending();
      if (!games) return;

      const modeEl = document.querySelector('input[name="import-mode"]:checked');
      const mode   = modeEl ? modeEl.value : 'merge';

      if (mode === 'replace') {
        // Show confirmation before destructive replace
        closeModal('import');
        openConfirm(
          'Replace Catalog?',
          `This will replace your entire local catalog with ${games.length} imported game(s). ` +
          'A backup will be saved locally first. This cannot be undone without the backup.',
          async () => {
            const { total } = await ImportExport.applyImport(games, 'replace');
            Utils.toast(`Catalog replaced with ${total} game(s).`, 'success');
            ImportExport.clearPending();
          }
        );
      } else {
        const confirmBtn = document.getElementById('import-confirm-btn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Importing…'; }

        const { added, total } = await ImportExport.applyImport(games, 'merge');

        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Import'; }
        closeModal('import');
        Utils.toast(
          `Imported ${added} new game(s) of ${total} (${total - added} duplicate URL${total - added !== 1 ? 's' : ''} skipped).`,
          'success', 5000
        );
        ImportExport.clearPending();
      }
    });
  }

  /* ---- Launch modal (iframe) ------------------------------ */

  function launchGame(game) {
    const mode = AppState.settings.launchMode;

    if (mode === 'newTab') {
      window.open(game.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (mode === 'sameTab') {
      window.location.href = game.url;
      return;
    }

    // Iframe mode
    const titleEl    = document.getElementById('launch-title');
    const extLink    = document.getElementById('launch-external-link');
    const iframeEl   = document.getElementById('game-iframe');
    const loadingEl  = document.getElementById('iframe-loading');
    const blockedEl  = document.getElementById('iframe-blocked');
    const blockedLnk = document.getElementById('iframe-blocked-link');

    if (titleEl)    titleEl.textContent = `Playing: ${game.title}`;
    if (extLink)  { extLink.href = game.url; }
    if (blockedLnk) blockedLnk.href = game.url;
    if (iframeEl)   iframeEl.src = '';
    if (loadingEl)  loadingEl.classList.remove('hidden');
    if (blockedEl)  blockedEl.classList.add('hidden');

    openModal('launch');

    // Load the iframe
    if (iframeEl) {
      iframeEl.onload  = () => loadingEl?.classList.add('hidden');
      iframeEl.onerror = () => {
        loadingEl?.classList.add('hidden');
        blockedEl?.classList.remove('hidden');
      };
      iframeEl.src = game.url;
    }

    // Fallback timeout: if after 8s the iframe hasn't loaded, assume blocked
    setTimeout(() => {
      if (loadingEl && !loadingEl.classList.contains('hidden')) {
        loadingEl.classList.add('hidden');
        blockedEl?.classList.remove('hidden');
      }
    }, 8000);
  }

  /* ============================================================
     CLOSE / MODAL DELEGATE BINDINGS
     ============================================================ */

  function _bindModalCloseButtons() {
    // Close buttons with data-modal attribute
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-modal]');
      if (closeBtn && (closeBtn.classList.contains('modal-close') || closeBtn.classList.contains('btn-ghost'))) {
        closeModal(closeBtn.dataset.modal);
      }
    });

    // Click outside modal content to close (on overlay)
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeAllModals();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  /* ============================================================
     CARD EVENT DELEGATION
     ============================================================ */

  function _bindCardEvents(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.addEventListener('click', async (e) => {
      const card = e.target.closest('.game-card');
      if (!card) return;
      const id = card.dataset.id;

      // Close any open dropdowns first (unless clicking menu itself)
      if (!e.target.closest('.card-menu')) {
        document.querySelectorAll('.card-dropdown.open').forEach(d => d.classList.remove('open'));
      }

      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      e.stopPropagation();

      if (action === 'play') {
        const game = Catalog.getById(id);
        if (game) launchGame(game);
        return;
      }

      if (action === 'favorite') {
        await Catalog.toggleFavorite(id);
        return;
      }

      if (action === 'menu') {
        const dropdown = card.querySelector('.card-dropdown');
        dropdown?.classList.toggle('open');
        return;
      }

      if (action === 'edit') {
        card.querySelector('.card-dropdown')?.classList.remove('open');
        const game = Catalog.getById(id);
        if (game) openGameForm(game);
        return;
      }

      if (action === 'archive' || action === 'unarchive') {
        card.querySelector('.card-dropdown')?.classList.remove('open');
        await Catalog.toggleArchive(id);
        const game = Catalog.getById(id);
        Utils.toast(game?.archived ? 'Game archived.' : 'Game restored.', 'info');
        return;
      }

      if (action === 'delete') {
        card.querySelector('.card-dropdown')?.classList.remove('open');
        const game = Catalog.getById(id);
        openConfirm(
          'Delete Game?',
          `Remove "${game?.title || 'this game'}" from your library? This cannot be undone.`,
          async () => {
            await Catalog.deleteGame(id);
            Utils.toast('Game deleted.', 'info');
          }
        );
        return;
      }
    });
  }

  function _bindManageListEvents() {
    const list = document.getElementById('manage-list');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const item = e.target.closest('.manage-item');
      if (!item) return;
      const id     = item.dataset.id;
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'edit') {
        const game = Catalog.getById(id);
        if (game) openGameForm(game);
        return;
      }

      if (action === 'archive' || action === 'unarchive') {
        await Catalog.toggleArchive(id);
        const game = Catalog.getById(id);
        Utils.toast(game?.archived ? 'Game archived.' : 'Game restored.', 'info');
        return;
      }

      if (action === 'delete') {
        const game = Catalog.getById(id);
        openConfirm(
          'Delete Game?',
          `Remove "${game?.title || 'this game'}"? This cannot be undone.`,
          async () => {
            await Catalog.deleteGame(id);
            Utils.toast('Game deleted.', 'info');
          }
        );
        return;
      }
    });
  }

  /* ============================================================
     GLOBAL CLICK — close dropdowns when clicking away
     ============================================================ */

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-menu')) {
      document.querySelectorAll('.card-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });

  /* ============================================================
     PUBLIC API
     ============================================================ */

  return {
    // Render functions
    renderHub,
    renderFavorites,
    renderManage,
    renderArchived,
    renderCurrentView,

    // View routing
    showView,

    // Modals
    openModal, closeModal, closeAllModals,
    openGameForm,
    openConfirm,
    openImportModal,
    launchGame,

    // Bind all internal events (called once from app.js)
    bindAll() {
      _bindModalCloseButtons();
      _bindConfirmModal();
      _bindGameFormModal();
      _bindImportModal();
      // Delegate card events on all grids
      _bindCardEvents('#favorites-grid');
      _bindCardEvents('#active-grid');
      _bindCardEvents('#archived-hub-section .games-grid');
      _bindCardEvents('#archived-grid');
      _bindManageListEvents();
    },
  };
})();
