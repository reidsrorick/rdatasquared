/* ============================================================
   CATALOG — Loads defaults, applies local overrides, exposes
   CRUD operations that persist to IndexedDB then refresh state.

   Merge rules:
     1. Fetch games.json (defaults).
     2. Load userGames from IndexedDB.
     3. For each default: skip if marked _deleted, else apply
        any user override (full replacement of that entry).
     4. Append user-added games (userAdded: true) that aren't deleted.
     5. Dedup by normalized URL (first entry wins).

   AppState.catalog always reflects the merged result.
   ============================================================ */
window.Catalog = (() => {

  /** Raw default catalog as fetched from games.json. */
  let _defaults = [];

  /* ---------- internal helpers ------------------------------ */

  /**
   * Core merge: combine defaults + userGames records → resolved array.
   * Duplicate URLs are removed (first occurrence wins).
   */
  function _merge(defaults, userGames) {
    const userMap  = new Map(userGames.map(g => [g.id, g]));
    const result   = [];
    const urlsSeen = new Set();

    // Step 1: process defaults
    for (const def of defaults) {
      const override = userMap.get(def.id);
      if (override?._deleted) continue;             // explicitly deleted

      // Apply user override fields on top of default (override wins for all fields)
      const game = override ? { ...def, ...override } : { ...def };
      delete game._deleted; // clean up internal flag if present

      const norm = Utils.normalizeUrl(game.url);
      if (!urlsSeen.has(norm)) {
        urlsSeen.add(norm);
        result.push(game);
      }
    }

    // Step 2: append user-added games
    for (const ug of userGames) {
      if (!ug.userAdded || ug._deleted) continue;
      const norm = Utils.normalizeUrl(ug.url);
      if (!urlsSeen.has(norm)) {
        urlsSeen.add(norm);
        result.push({ ...ug });
      }
    }

    return result;
  }

  /** Re-merge and update AppState.catalog, then re-render current view. */
  async function _refresh() {
    const userGames      = await Storage.getAllUserGames();
    AppState.catalog     = _merge(_defaults, userGames);
    UI.renderCurrentView();
  }

  /* ---------- public API ------------------------------------ */
  return {

    /* ---- Bootstrap ---- */

    /**
     * Fetch the default JSON and perform initial merge.
     * Must be awaited before the app renders.
     */
    async load() {
      try {
        const res  = await fetch('./data/games.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        _defaults  = Array.isArray(json.games) ? json.games : [];
      } catch (err) {
        // fetch() fails when opened via file:// — fall back to the inline JS bundle
        if (window.GAME_HUB_DEFAULTS && Array.isArray(window.GAME_HUB_DEFAULTS.games)) {
          _defaults = window.GAME_HUB_DEFAULTS.games;
        } else {
          console.error('[Catalog] Failed to load defaults:', err);
          Utils.toast('Could not load default catalog. Using empty library.', 'warning', 5000);
          _defaults = [];
        }
      }

      const userGames  = await Storage.getAllUserGames();
      AppState.catalog = _merge(_defaults, userGames);
    },

    /** Expose defaults array (read-only copy) for export/import use. */
    getDefaults() {
      return Utils.clone(_defaults);
    },

    /** Return a deep clone of the full resolved catalog. */
    getAll() {
      return Utils.clone(AppState.catalog);
    },

    /** Find a game in the resolved catalog by ID. Returns undefined if not found. */
    getById(id) {
      const g = AppState.catalog.find(g => g.id === id);
      return g ? Utils.clone(g) : undefined;
    },

    /** True if the id belongs to the default catalog (not user-added). */
    isDefault(id) {
      return _defaults.some(d => d.id === id);
    },

    /* ---- Checks ---- */

    /**
     * Return the first game whose normalized URL matches, excluding optional excludeId.
     * Used for duplicate detection before add/edit.
     */
    findByUrl(url, excludeId = null) {
      const norm = Utils.normalizeUrl(url);
      return AppState.catalog.find(g =>
        g.id !== excludeId && Utils.normalizeUrl(g.url) === norm
      );
    },

    /* ---- Add / Edit ---- */

    /**
     * Add a brand-new user game.
     * Returns { ok, error } — error is set if URL is a duplicate.
     */
    async addGame(data) {
      const dup = this.findByUrl(data.url);
      if (dup) return { ok: false, error: `Duplicate URL — "${dup.title}" already uses that URL.` };

      const now  = Utils.isoNow();
      const game = {
        id:          Utils.generateId(),
        title:       data.title.trim(),
        description: (data.description || '').trim(),
        url:         data.url.trim(),
        tags:        Utils.parseTags(data.tags),
        thumbnail:   (data.thumbnail || '').trim(),
        category:    (data.category  || '').trim(),
        favorite:    !!data.favorite,
        archived:    false,
        userAdded:   true,
        createdAt:   now,
        updatedAt:   now,
      };

      await Storage.saveUserGame(game);

      // Handle favorite ordering
      if (game.favorite) {
        const order = await Storage.getSetting('favoritesOrder', []);
        order.push(game.id);
        await Storage.setSetting('favoritesOrder', order);
        AppState.favoritesOrder = order;
      }

      await _refresh();
      return { ok: true, game };
    },

    /**
     * Update an existing game (default override or user-added edit).
     * Returns { ok, error }.
     */
    async updateGame(id, data) {
      const existing = this.getById(id);
      if (!existing) return { ok: false, error: 'Game not found.' };

      const dupUrl = this.findByUrl(data.url, id);
      if (dupUrl) return { ok: false, error: `Duplicate URL — "${dupUrl.title}" already uses that URL.` };

      const wasFav = existing.favorite;
      const isFav  = !!data.favorite;

      const updated = {
        ...existing,
        title:       data.title.trim(),
        description: (data.description || '').trim(),
        url:         data.url.trim(),
        tags:        Utils.parseTags(data.tags),
        thumbnail:   (data.thumbnail || '').trim(),
        category:    (data.category  || '').trim(),
        favorite:    isFav,
        updatedAt:   Utils.isoNow(),
      };

      await Storage.saveUserGame(updated);

      // Sync favorites order
      let order = await Storage.getSetting('favoritesOrder', []);
      if (isFav && !wasFav) {
        order.push(id);
      } else if (!isFav && wasFav) {
        order = order.filter(oid => oid !== id);
      }
      await Storage.setSetting('favoritesOrder', order);
      AppState.favoritesOrder = order;

      await _refresh();
      return { ok: true };
    },

    /* ---- Archive / Restore ---- */

    /** Toggle archived status (no confirmation needed). */
    async toggleArchive(id) {
      const game = this.getById(id);
      if (!game) return;

      const updated = { ...game, archived: !game.archived, updatedAt: Utils.isoNow() };

      // If archiving a favorited game, remove from favorites
      if (updated.archived && updated.favorite) {
        updated.favorite = false;
        let order = await Storage.getSetting('favoritesOrder', []);
        order = order.filter(oid => oid !== id);
        await Storage.setSetting('favoritesOrder', order);
        AppState.favoritesOrder = order;
      }

      await Storage.saveUserGame(updated);
      await _refresh();
    },

    /* ---- Delete ---- */

    /**
     * Permanently delete a game.
     * Default games get a _deleted marker; user-added games are fully removed.
     */
    async deleteGame(id) {
      if (this.isDefault(id)) {
        await Storage.markDeleted(id);
      } else {
        await Storage.removeUserGame(id);
      }

      // Remove from favorites order if present
      let order = await Storage.getSetting('favoritesOrder', []);
      order = order.filter(oid => oid !== id);
      await Storage.setSetting('favoritesOrder', order);
      AppState.favoritesOrder = order;

      await _refresh();
    },

    /* ---- Favorites ---- */

    /** Toggle the favorite flag and sync the favorites order. */
    async toggleFavorite(id) {
      const game = this.getById(id);
      if (!game || game.archived) return;

      const isFav = !game.favorite;
      const updated = { ...game, favorite: isFav, updatedAt: Utils.isoNow() };
      await Storage.saveUserGame(updated);

      let order = await Storage.getSetting('favoritesOrder', []);
      if (isFav) {
        if (!order.includes(id)) order.push(id);
      } else {
        order = order.filter(oid => oid !== id);
      }
      await Storage.setSetting('favoritesOrder', order);
      AppState.favoritesOrder = order;

      await _refresh();
    },

    /** Persist a new favorites order (called by drag-drop). */
    async setFavoritesOrder(order) {
      await Storage.setSetting('favoritesOrder', order);
      AppState.favoritesOrder = order;
      // Re-render without full merge (catalog content unchanged)
      UI.renderFavorites();
    },

    /* ---- Filtered views ---- */

    /** Active (non-archived) games, favorites excluded — for the "All Games" grid. */
    getNonFavoriteActive() {
      return AppState.catalog.filter(g => !g.archived && !g.favorite);
    },

    /** Favorited active games sorted by favoritesOrder. */
    getOrderedFavorites() {
      const favs  = AppState.catalog.filter(g => g.favorite && !g.archived);
      const order = AppState.favoritesOrder;
      return favs.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        // Items not in the order list go to the end
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
      });
    },

    /** All archived games. */
    getArchived() {
      return AppState.catalog.filter(g => g.archived);
    },

    /** Collect all unique tags from the full catalog. */
    getAllTags() {
      const tags = new Set();
      AppState.catalog.forEach(g => (g.tags || []).forEach(t => tags.add(t)));
      return [...tags].sort();
    },

    /* ---- Bulk operations (for import) ---- */

    /**
     * Replace all local user data with an array of resolved games.
     * Used by the "Replace" import mode.
     * Builds userGames records by diffing against current defaults.
     */
    async replaceAll(games) {
      await Storage.clearAllUserGames();

      // Re-index defaults for quick lookup
      const defMap = new Map(_defaults.map(d => [d.id, d]));

      for (const g of games) {
        const def = defMap.get(g.id);
        if (def) {
          // It's a default game — store as override if different
          await Storage.saveUserGame(g);
        } else {
          // Not in defaults — store as user-added
          await Storage.saveUserGame({ ...g, userAdded: true });
        }
      }

      // Restore favorites order
      const favIds = games.filter(g => g.favorite).map(g => g.id);
      await Storage.setSetting('favoritesOrder', favIds);
      AppState.favoritesOrder = favIds;

      await _refresh();
    },

    /**
     * Merge an array of incoming games into the current catalog.
     * First-URL-wins: duplicates by normalized URL are skipped.
     */
    async mergeAll(incomingGames) {
      const urlsSeen = new Set(
        AppState.catalog.map(g => Utils.normalizeUrl(g.url))
      );

      let added = 0;
      for (const g of incomingGames) {
        const norm = Utils.normalizeUrl(g.url);
        if (urlsSeen.has(norm)) continue;
        urlsSeen.add(norm);

        // If ID collides with an existing game (different URL somehow), regenerate
        const existing = AppState.catalog.find(x => x.id === g.id);
        const id = existing ? Utils.generateId() : g.id;
        const now = Utils.isoNow();

        const record = {
          ...g,
          id,
          userAdded: true,
          createdAt: g.createdAt || now,
          updatedAt: now,
        };
        delete record._deleted;

        await Storage.saveUserGame(record);
        added++;
      }

      // Bring in any favorites from the import that aren't already ordered
      let order = await Storage.getSetting('favoritesOrder', []);
      for (const g of incomingGames) {
        if (g.favorite && !order.includes(g.id)) order.push(g.id);
      }
      await Storage.setSetting('favoritesOrder', order);
      AppState.favoritesOrder = order;

      await _refresh();
      return added;
    },
  };
})();
