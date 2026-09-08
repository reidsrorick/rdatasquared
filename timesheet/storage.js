/* ============================================================================
 * storage.js — browser storage layer for the static (GitHub Pages) build.
 *
 * Replaces the Electron `preload.js` bridge. Exposes the same `window.api`
 * surface the app expects, backed by localStorage instead of files on disk.
 *
 *   window.api.loadData()              -> Promise<data | null>
 *   window.api.saveData(obj)           -> Promise<{ ok, error? }>
 *   window.api.resetData()             -> Promise<{ ok, error? }>
 *   window.api.getSidebarCollapsed()   -> boolean (sync)
 *   window.api.setSidebarCollapsed(b)  -> Promise<{ ok }>
 *   window.api.exportXlsx(bytes, name) -> Promise<{ ok }>   (browser download)
 *
 * Plus two helpers used by the JSON backup buttons:
 *   window.api.exportJSON(obj, name)   -> triggers a .json download
 *   window.api.downloadBlob(blob, name)
 * ==========================================================================*/
(function () {
    'use strict';

    const DATA_KEY = 'timesheet_tracker_data_v2';
    const UI_KEY   = 'timesheet_tracker_ui';

    function readUi() {
        try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    window.api = {
        /* ---- Data persistence ---- */
        async loadData() {
            // 1. Prefer whatever is already saved in this browser.
            try {
                const raw = localStorage.getItem(DATA_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) {
                console.warn('loadData: bad localStorage payload', e);
            }
            // 2. First run in this browser — try to seed from a bundled data.json
            //    (present when you commit one alongside the app). Fails silently
            //    when the file is absent or the page is opened via file://.
            try {
                const res = await fetch('./data.json', { cache: 'no-store' });
                if (res.ok) {
                    const seed = await res.json();
                    if (seed && typeof seed === 'object') return seed;
                }
            } catch (e) {
                /* no seed file — start fresh */
            }
            return null;
        },

        async saveData(obj) {
            try {
                localStorage.setItem(DATA_KEY, JSON.stringify(obj));
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        },

        async resetData() {
            try {
                localStorage.removeItem(DATA_KEY);
                localStorage.removeItem(UI_KEY);
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        },

        /* ---- Small UI state ---- */
        getSidebarCollapsed() {
            return readUi().sidebarCollapsed === true;
        },

        async setSidebarCollapsed(collapsed) {
            try {
                const s = readUi();
                s.sidebarCollapsed = !!collapsed;
                localStorage.setItem(UI_KEY, JSON.stringify(s));
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        },

        /* ---- Excel export (browser download) ---- */
        async exportXlsx(bytes, defaultName) {
            try {
                const blob = new Blob([bytes], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
                downloadBlob(blob, defaultName || 'timesheet.xlsx');
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        },

        /* ---- JSON backup helpers ---- */
        exportJSON(obj, defaultName) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            downloadBlob(blob, defaultName || 'timesheet-backup.json');
        },
        downloadBlob
    };
})();
