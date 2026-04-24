/* ============================================================
   SETTINGS — Load, save, and apply app settings.
   ============================================================ */
window.Settings = (() => {

  const DEFAULTS = {
    theme:        'dark',
    launchMode:   'newTab',
    showArchived: false,
  };

  /* ---------- Load ----------------------------------------- */

  /** Load all settings from IndexedDB and apply them. */
  async function load() {
    const stored = await Storage.getAllSettings();

    AppState.settings = {
      theme:        stored.theme        ?? DEFAULTS.theme,
      launchMode:   stored.launchMode   ?? DEFAULTS.launchMode,
      showArchived: stored.showArchived ?? DEFAULTS.showArchived,
    };

    AppState.favoritesOrder = stored.favoritesOrder ?? [];

    apply();
  }

  /* ---------- Apply ---------------------------------------- */

  /** Apply current settings to the DOM without re-reading storage. */
  function apply() {
    const { theme, showArchived } = AppState.settings;

    // Theme
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
    updateThemeToggleIcon();

    // Archived section on hub — controlled by showArchived setting
    syncArchivedSectionVisibility();

    // Sync settings view form elements if they're in the DOM
    syncSettingsForm();
  }

  function updateThemeToggleIcon() {
    const btn  = document.getElementById('theme-toggle-btn');
    const icon = btn?.querySelector('.theme-icon');
    if (!icon) return;
    icon.textContent = AppState.settings.theme === 'dark' ? '☀️' : '🌙';
    btn.title = AppState.settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function syncArchivedSectionVisibility() {
    const section = document.getElementById('archived-hub-section');
    if (!section) return;
    if (AppState.settings.showArchived) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  }

  /** Keep the Settings view form in sync with AppState. */
  function syncSettingsForm() {
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = AppState.settings.theme;

    const showArchived = document.getElementById('show-archived-toggle');
    if (showArchived) showArchived.checked = AppState.settings.showArchived;

    const launchRadios = document.querySelectorAll('input[name="launch-mode"]');
    launchRadios.forEach(r => {
      r.checked = r.value === AppState.settings.launchMode;
    });
  }

  /* ---------- Save ----------------------------------------- */

  async function set(key, value) {
    AppState.settings[key] = value;
    await Storage.setSetting(key, value);
    apply();
  }

  /* ---------- Theme toggle ---------------------------------- */

  async function toggleTheme() {
    const next = AppState.settings.theme === 'dark' ? 'light' : 'dark';
    await set('theme', next);
  }

  /* ---------- Reset ---------------------------------------- */

  /** Wipe all local data and reload the page. */
  async function resetToDefault() {
    await Storage.clearAll();
    Utils.toast('Reset complete — reloading…', 'info', 1500);
    setTimeout(() => window.location.reload(), 1600);
  }

  /* ---------- Settings view event bindings ----------------- */

  function bindSettingsView() {
    // Theme select
    document.getElementById('theme-select')?.addEventListener('change', (e) => {
      set('theme', e.target.value);
    });

    // Show archived toggle
    document.getElementById('show-archived-toggle')?.addEventListener('change', (e) => {
      set('showArchived', e.target.checked);
      UI.renderHub(); // re-render hub so archived section appears/disappears
    });

    // Launch mode radios
    document.querySelectorAll('input[name="launch-mode"]').forEach(r => {
      r.addEventListener('change', (e) => {
        if (e.target.checked) set('launchMode', e.target.value);
      });
    });

    // Export button (settings page)
    document.getElementById('settings-export-btn')?.addEventListener('click', () => {
      ImportExport.exportCatalog();
    });

    // Import button (settings page)
    document.getElementById('settings-import-btn')?.addEventListener('click', () => {
      UI.openImportModal();
    });

    // Reset button
    document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
      UI.openConfirm(
        'Reset to Default Catalog?',
        'This will permanently remove all your local changes, added games, and customizations. ' +
        'The app will reload with the original shipped catalog. This cannot be undone.',
        async () => {
          await resetToDefault();
        },
        'danger'
      );
    });
  }

  return {
    DEFAULTS,
    load,
    apply,
    set,
    toggleTheme,
    resetToDefault,
    bindSettingsView,
    syncSettingsForm,
  };
})();
