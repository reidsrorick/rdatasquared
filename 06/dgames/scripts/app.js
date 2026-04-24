/* ============================================================
   APP — Entry point. Initializes all modules, binds top-level
   event listeners, and boots the app.
   ============================================================ */

/* ---------- Global state ----------------------------------- */
window.AppState = {
  catalog:         [],    // Resolved merged catalog
  settings:        {},    // Active settings
  favoritesOrder:  [],    // Ordered array of favorite game IDs
  currentView:     'hub', // Active view name
  searchQuery:     '',    // Current search string
  activeTagFilter: null,  // Active tag filter (null = all)
  sortBy:          'title', // Current sort key
  manageFilter:    'all', // Manage view filter tab
};

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  // Show a minimal loading state
  document.body.classList.add('app-loading');

  try {
    // 1. Open IndexedDB
    await Storage.init();

    // 2. Load settings + apply theme before any rendering
    await Settings.load();

    // 3. Fetch defaults + merge with local data → AppState.catalog
    await Catalog.load();

    // 4. Wire all UI event delegates
    UI.bindAll();
    bindTopLevelEvents();

    // 5. Render the initial view
    UI.showView('hub');

  } catch (err) {
    console.error('[App] Initialization failed:', err);
    Utils.toast('App failed to start. Please refresh and try again.', 'error', 0);
  } finally {
    document.body.classList.remove('app-loading');
  }
}

/* ============================================================
   TOP-LEVEL EVENT BINDINGS
   ============================================================ */
function bindTopLevelEvents() {

  /* ---- Navigation ----------------------------------------- */

  // Desktop nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => UI.showView(btn.dataset.view));
  });

  // Mobile hamburger
  const hamburger = document.getElementById('hamburger-btn');
  const drawer    = document.getElementById('mobile-nav-drawer');
  hamburger?.addEventListener('click', () => {
    drawer?.classList.toggle('open');
  });

  // Mobile nav buttons
  drawer?.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      UI.showView(btn.dataset.view);
      drawer.classList.remove('open');
    });
  });

  /* ---- Theme toggle --------------------------------------- */
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    Settings.toggleTheme();
  });

  /* ---- Hub controls --------------------------------------- */

  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    const debouncedSearch = Utils.debounce((q) => {
      AppState.searchQuery = q.trim();
      UI.renderHub();
    }, 220);
    searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    searchInput.addEventListener('search', (e) => {
      // 'search' fires when user clears via ×
      AppState.searchQuery = e.target.value.trim();
      UI.renderHub();
    });
  }

  // Sort
  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    AppState.sortBy = e.target.value;
    UI.renderHub();
  });

  // Tag filter bar (event delegation)
  document.getElementById('tag-filter-bar')?.addEventListener('click', (e) => {
    const tagBtn = e.target.closest('[data-tag]');
    if (!tagBtn) return;
    AppState.activeTagFilter = tagBtn.dataset.tag || null;
    UI.renderHub();
  });

  // Hub "Add Game" button
  document.getElementById('add-game-btn')?.addEventListener('click', () => {
    UI.openGameForm();
  });

  /* ---- Manage view --------------------------------------- */

  // Manage add button
  document.getElementById('manage-add-btn')?.addEventListener('click', () => {
    UI.openGameForm();
  });

  // Manage import/export buttons
  document.getElementById('manage-import-btn')?.addEventListener('click', () => {
    UI.openImportModal();
  });
  document.getElementById('manage-export-btn')?.addEventListener('click', () => {
    ImportExport.exportCatalog();
  });

  // Manage search
  const manageSearch = document.getElementById('manage-search');
  if (manageSearch) {
    const debouncedManage = Utils.debounce(() => UI.renderManage(), 220);
    manageSearch.addEventListener('input', debouncedManage);
  }

  // Manage filter tabs
  document.querySelector('.filter-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    AppState.manageFilter = tab.dataset.filter;
    UI.renderManage();
  });

  /* ---- Settings view ------------------------------------- */
  Settings.bindSettingsView();

  /* ---- Keyboard accessibility: close mobile drawer on Escape */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('mobile-nav-drawer')?.classList.remove('open');
    }
  });
}

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', init);
