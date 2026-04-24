/* ============================================================
   VALIDATION — Validate imported JSON and individual game objects.
   ============================================================ */
window.Validation = (() => {

  const REQUIRED_GAME_FIELDS = ['id', 'title', 'url'];
  const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'];

  /** Validate a full import payload. Returns { ok, errors[], warnings[], games }. */
  function validateImport(data) {
    const errors   = [];
    const warnings = [];

    // Must be an object
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push('File must contain a JSON object at the root level.');
      return { ok: false, errors, warnings };
    }

    // Schema version — warn but don't fail on unknown versions
    if (!data.schemaVersion) {
      warnings.push('No schemaVersion field found. Proceeding with best-effort import.');
    } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(data.schemaVersion)) {
      warnings.push(`Unknown schema version "${data.schemaVersion}". Proceeding — fields may differ.`);
    }

    // games array
    if (!data.games) {
      errors.push('Missing required field: games (array).');
      return { ok: false, errors, warnings };
    }
    if (!Array.isArray(data.games)) {
      errors.push('"games" must be an array.');
      return { ok: false, errors, warnings };
    }
    if (data.games.length === 0) {
      errors.push('The "games" array is empty — nothing to import.');
      return { ok: false, errors, warnings };
    }

    // Validate each game entry
    const validGames   = [];
    const skippedCount = { noId: 0, noTitle: 0, noUrl: 0, badUrl: 0 };

    data.games.forEach((g, i) => {
      if (typeof g !== 'object' || g === null) {
        skippedCount.noId++;
        return;
      }

      const gameErrors = [];
      if (!g.id)    { gameErrors.push('missing id'); skippedCount.noId++; }
      if (!g.title) { gameErrors.push('missing title'); skippedCount.noTitle++; }
      if (!g.url)   { gameErrors.push('missing url'); skippedCount.noUrl++; }
      else if (!Utils.isValidUrl(g.url)) {
        gameErrors.push('invalid url');
        skippedCount.badUrl++;
      }

      if (gameErrors.length > 0) {
        warnings.push(`Game at index ${i} skipped: ${gameErrors.join(', ')}.`);
        return;
      }

      validGames.push(g);
    });

    if (validGames.length === 0) {
      errors.push('No valid game entries found after validation.');
      return { ok: false, errors, warnings };
    }

    return { ok: true, errors, warnings, games: validGames };
  }

  /**
   * Validate a single game object from the add/edit form.
   * Returns { ok, fieldErrors: { fieldName: message } }.
   */
  function validateGame(data) {
    const fieldErrors = {};

    if (!data.title || data.title.trim() === '') {
      fieldErrors.title = 'Title is required.';
    } else if (data.title.trim().length > 120) {
      fieldErrors.title = 'Title must be 120 characters or fewer.';
    }

    if (!data.url || data.url.trim() === '') {
      fieldErrors.url = 'URL is required.';
    } else if (!Utils.isValidUrl(data.url.trim())) {
      fieldErrors.url = 'Please enter a valid https:// URL.';
    }

    if (data.description && data.description.length > 600) {
      fieldErrors.description = 'Description must be 600 characters or fewer.';
    }

    if (data.thumbnail && data.thumbnail.trim() !== '' && !Utils.isValidUrl(data.thumbnail.trim())) {
      fieldErrors.thumbnail = 'Thumbnail must be a valid https:// URL or left empty.';
    }

    return {
      ok: Object.keys(fieldErrors).length === 0,
      fieldErrors,
    };
  }

  return { validateImport, validateGame };
})();
