/* ============================================================
   IMPORT / EXPORT

   Export: builds the fully resolved catalog (defaults + local
   overrides merged) and downloads it as a JSON file.

   Import: reads a user-supplied JSON file, validates it, then
   either merges with or replaces the current local catalog.

   The exported file is intended to be usable as a new default
   games.json on GitHub Pages (drop it in data/ and commit).
   ============================================================ */
window.ImportExport = (() => {

  /* ---- Export --------------------------------------------- */

  /** Build the export payload as a plain JS object. */
  function buildExportData() {
    const games = Catalog.getAll();
    return {
      schemaVersion: '1.0.0',
      exportedAt:    Utils.isoNow(),
      games,
    };
  }

  /** Trigger a browser download of the catalog as JSON. */
  function exportCatalog() {
    const data     = buildExportData();
    const json     = JSON.stringify(data, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const stamp    = new Date().toISOString().slice(0, 10);
    a.href         = url;
    a.download     = `game-hub-catalog-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Utils.toast('Catalog exported successfully.', 'success');
  }

  /* ---- Import --------------------------------------------- */

  let _pendingImportData = null; // Validated import data, held until user confirms

  /**
   * Read a File object, parse JSON, validate structure.
   * Returns { ok, result (validation result), raw (parsed JSON) }
   */
  function readAndValidateFile(file) {
    return new Promise((resolve) => {
      if (!file || !file.name.endsWith('.json')) {
        resolve({ ok: false, error: 'Please select a .json file.' });
        return;
      }

      const reader = new FileReader();
      reader.onload  = (e) => {
        let parsed;
        try {
          parsed = JSON.parse(e.target.result);
        } catch {
          resolve({ ok: false, error: 'Invalid JSON — could not parse the file.' });
          return;
        }

        const result = Validation.validateImport(parsed);
        if (!result.ok) {
          resolve({ ok: false, error: result.errors.join(' '), warnings: result.warnings });
          return;
        }

        resolve({ ok: true, result, raw: parsed });
      };
      reader.onerror = () => resolve({ ok: false, error: 'Failed to read file.' });
      reader.readAsText(file);
    });
  }

  /**
   * Process the import after the user has confirmed mode and clicked Import.
   * mode: 'merge' | 'replace'
   * Returns { added, total }  (added is only meaningful for merge mode).
   */
  async function applyImport(validatedGames, mode) {
    if (mode === 'replace') {
      // Safety backup: save current state to settings before overwriting
      const backup = buildExportData();
      await Storage.setSetting('_lastBackup', backup);

      await Catalog.replaceAll(validatedGames);
      return { total: validatedGames.length };
    } else {
      // Merge — skip duplicates by URL
      const added = await Catalog.mergeAll(validatedGames);
      return { added, total: validatedGames.length };
    }
  }

  /** Retrieve the last automatic backup (created before a Replace import). */
  async function getLastBackup() {
    return Storage.getSetting('_lastBackup', null);
  }

  /** Expose pending data so the modal can store it between steps. */
  function setPending(data) { _pendingImportData = data; }
  function getPending()     { return _pendingImportData; }
  function clearPending()   { _pendingImportData = null; }

  return {
    buildExportData,
    exportCatalog,
    readAndValidateFile,
    applyImport,
    getLastBackup,
    setPending, getPending, clearPending,
  };
})();
