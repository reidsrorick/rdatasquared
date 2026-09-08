/* ============================================================================
 * backup.js — JSON backup / restore for the static build.
 *
 * Loaded after app.js. Wires the two "JSON Backup" buttons in Settings ->
 * Data Management. Kept separate so app.js stays a byte-for-byte copy of the
 * desktop version and is easy to re-sync.
 * ==========================================================================*/
(function () {
    'use strict';

    function backupPayload() {
        return {
            version: (typeof DATA_VERSION !== 'undefined') ? DATA_VERSION : '2',
            exportedAt: new Date().toISOString(),
            timesheets: state.timesheets,
            dailyNotes: state.dailyNotes,
            pto: state.pto,
            settings: state.settings
        };
    }

    function exportBackup() {
        const stamp = new Date().toISOString().split('T')[0];
        window.api.exportJSON(backupPayload(), `timesheet-backup-${stamp}.json`);
        showToast('JSON backup downloaded', 'success');
    }

    function restoreBackup(file) {
        const reader = new FileReader();
        reader.onload = e => {
            let data;
            try {
                data = JSON.parse(e.target.result);
            } catch (err) {
                showToast('That file is not valid JSON', 'error');
                return;
            }
            if (!data || typeof data !== 'object' || typeof data.timesheets !== 'object') {
                showToast('This JSON file is not a timesheet backup', 'error');
                return;
            }

            const weeks = Object.keys(data.timesheets).length;
            showConfirm(
                'Restore JSON Backup',
                `This replaces ALL data in this browser with the backup file ` +
                `(${weeks} week${weeks === 1 ? '' : 's'} of entries). This cannot be undone. Continue?`,
                () => {
                    state.timesheets = data.timesheets || {};
                    state.dailyNotes = data.dailyNotes || {};
                    state.pto = data.pto || structuredClone(DEFAULT_PTO);
                    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

                    // Re-run the same migrations init() applies to loaded data.
                    if (state.settings.projects && state.settings.projects.length &&
                        typeof state.settings.projects[0] === 'string') {
                        state.settings.projects = state.settings.projects.map(name => ({ name, billable: true }));
                    }

                    state.currentWeekStart = getWeekKey(new Date());
                    state.miniCalDate = new Date();
                    saveState();
                    applySettings();
                    showView('timesheets');
                    showToast('Backup restored successfully', 'success');
                }
            );
        };
        reader.readAsText(file);
    }

    function wire() {
        const exportBtn = document.getElementById('settings-json-export');
        const importBtn = document.getElementById('settings-json-import');
        const fileInput = document.getElementById('json-file-input');
        if (!exportBtn || !importBtn || !fileInput) return;

        exportBtn.addEventListener('click', exportBackup);
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) restoreBackup(fileInput.files[0]);
            fileInput.value = '';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})();
