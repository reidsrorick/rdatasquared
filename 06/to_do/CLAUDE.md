# Work Tracker — Project Context

## What this is
A zero-infrastructure, local-first web app for tracking tasks/work items. No server, no database, no build step — open `index.html` directly in a browser. All data lives in `localStorage`. AG Grid Community v31 loaded from CDN.

## How to open
Double-click `work-tracker/index.html`, or host the folder on any static file server (GitHub Pages, Netlify, etc.). No `localhost` required.

## File layout
```
work-tracker/
├── index.html          Standalone entry point — relative paths, works via file:// or any static host
├── static/
│   ├── js/
│   │   ├── utils.js    Pure helpers — date formatting, esc(), getWeekBounds(), nextRecurDate()
│   │   ├── storage.js  localStorage read/write only — no DOM, no fetch
│   │   ├── data.js     All data operations using localStorage (replaces Flask/SQLite entirely)
│   │   ├── grid.js     AG Grid — renderers, column defs, filter logic, cond fmt, column picker
│   │   ├── views.js    Calendar, Week, and Dashboard rendering (HTML string templates)
│   │   ├── ui.js       UI components — toast, modal, detail panel, theme, snooze, notifications
│   │   └── app.js      Shared state, filter/category logic, event wiring, DOMContentLoaded bootstrap
│   └── style.css       All styles — CSS custom properties for theming
└── templates/
    └── index.html      Legacy Flask template — kept for reference, not used
```

### JS module responsibilities
Each file has a single, clear responsibility. Load order matters — each file
depends only on files listed before it:

| File | Responsibility | Depends on |
|------|---------------|------------|
| `utils.js` | Pure helpers (no DOM, no state, no fetch) | — |
| `storage.js` | localStorage read/write only | utils.js |
| `data.js` | All localStorage CRUD — loadRows, saveRow, bulkAction, import, export | utils.js, storage.js |
| `grid.js` | AG Grid setup, cell renderers, filter, cond fmt | utils.js, storage.js |
| `views.js` | Calendar/Week/Dashboard rendering | utils.js, data.js |
| `ui.js` | Toast, modal, detail panel, theme, snooze | utils.js, storage.js, data.js |
| `app.js` | Global state, event wiring, DOMContentLoaded bootstrap | all above |

## Data schema (localStorage)
All items stored in `localStorage` key `wt-rows` as a JSON array. Each item has these fields:

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Auto-incrementing integer seeded from `Math.max(...existing ids) + 1` |
| `item` | string | Task name |
| `category` | string | |
| `date` | string | ISO: YYYY-MM-DD |
| `time` | string | HH:MM |
| `sort` | number | |
| `description` | string | |
| `completed` | boolean | |
| `date_completed` | string | YYYY-MM-DD |
| `last_modified` | string | datetime |
| `created_at` | string | datetime |
| `deleted` | boolean | soft-delete flag |
| `link` | string | URL |
| `recur_rule` | string | `"N:unit"` e.g. `"1:days"`, `"2:weeks"`, `"1:months"`, `"1:weekdays"` |
| `follow_ups` | string | JSON array of `{ ts, note? }` |

## Architecture patterns

### External filter (AG Grid Community)
No Enterprise features. Filters use `isExternalFilterPresent` / `doesExternalFilterPass` callbacks.  
Active filter state: `activePreset` (string), `activeCategoryFilters` (string[]), `activeDateFilter` (string).  
All three are saved to `localStorage` key `wt-filters` via `saveFiltersToStorage()`.

### Exclusive view modes
`showHiddenRows` and `showSnoozed` are mutually exclusive "view only this subset" modes.  
In `doesExternalFilterPass`: if either is true, return early showing only that subset; all other filters are bypassed.

### Sort persistence
Sorts are saved to `localStorage` key `wt-sort` via `onSortChanged`. Default sort on first load: date ASC → time ASC.  
**Important:** never call `applyColumnState({ defaultState: { sort: null } })` when changing filters/presets — sorts must persist independently.

### Add new row safety
`addingNewRow` flag bypasses external filter so an unsaved row (no `id` yet) is always visible.

### Column visibility
`hiddenColumns` object persisted at `wt-hidden-cols`. Applied after grid ready via `applyColumnVisibility()`.

### Multi-select category filter
`activeCategoryFilters` is a `string[]`. Empty array = implicit "show all". The dropdown (`#cat-filter-menu`) is rebuilt by `updateCategoryDropdown()` after each `loadRows()` and after `restoreFiltersFromStorage()`.  
**Important:** "All" checkbox is checked only when `activeCategoryFilters.length === 0` (implicit all). Unchecking "All" transitions to explicit-all (all cats in array) so individual cats can then be deselected. Never re-check "All" when all individual cats happen to be selected — that would break the UX flow.

### Snooze
`snoozedItems = { [id]: "YYYY-MM-DD HH:MM" }` — expiry stored as datetime string.  
`isSnoozeActive(id)` compares stored value against `fmtSnoozeNow()` (current "YYYY-MM-DD HH:MM").  
`loadSnoozedItems()` prunes expired entries on startup.  
Snooze popover shows a `datetime-local` input only — no duration option. Pre-fills to tomorrow at 08:00.  
Bulk snooze sets expiry to next day 23:59.

### Recurring tasks
`recur_rule` format: `"N:unit"` where unit is `days`, `weekdays`, `weeks`, or `months`.  
`nextRecurDate(fromDateStr, rule)` computes next date.  
`spawnRecurringOccurrence(sourceRow)` is called both from `saveDetailPanel` (when completing via Save) and from `onCellValueChanged` (when toggling the done checkbox directly in the grid).

### Conditional formatting
`condFmtRules[]` stored in `wt-cond-fmt` localStorage. Each rule: `{ condition, bgColor, textColor }`.  
`evalCondFmt(row)` → `{ background, color }` fed to AG Grid `getRowStyle`.  
Conditions: `past_due`, `due_today`, `due_tomorrow`, `this_week`, `completed`, `no_date`.

### Follow-up log
`follow_ups` DB column: JSON array of `{ ts, note? }` where `ts` is `"YYYY-MM-DD HH:MM:SS"`.  
Rendered as editable entries — `datetime-local` input for ts, `textarea` for note.  
Textarea rows sized by newline count (`inp.rows = newlines + 1`) — do NOT use `scrollHeight` for initial sizing as the panel may not be painted yet.

### Detail panel / textarea auto-resize
Description textarea: waits for CSS `width` transition to end via `transitionend { once: true }` before measuring `scrollHeight`.  
Follow-up note textareas: use row-count method (`inp.rows`) to avoid layout-dependency issues.

### Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save detail panel (works from inside inputs) |
| `Ctrl+Z` | Undo cell edit (grid only, not in inputs) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo cell edit |
| `Escape` | Close modals / dropdowns / detail panel |

### Calendar drag-and-drop
`calDropHandler(event, cellEl)` — reads `cellEl.dataset.date`, updates `row.date`, calls `saveRow()` then re-renders.

### Week view drag-and-drop
`weekDropHandler(event, colEl)` — reads `colEl.dataset.date`, same pattern.  
Week mode (`wt-week-mode` localStorage): `"work"` = Mon–Fri, `"full"` = Sun–Sat.

### Duplicate task
`duplicateRow(sourceRow)` — copies all fields, appends `" (copy)"` to item name, clears `follow_ups`, marks not completed. Available via right-click context menu and detail panel footer button.

### Bulk actions (selection bar)
Appears when rows are selected. Actions: Mark Complete, Mark Incomplete, Hide, Unhide, Snooze, Move to Today, Delete.  
`bulkMoveToToday()` — sets `date = today` on all selected rows and saves each.

### Week / Calendar search
`weekSearch` and `calSearch` state vars filter rendered items by name or category.  
Wired to `#week-search` and `#cal-search` inputs in their respective toolbars. Re-renders on `input` event.

### Navigate to row
`navigateToRow(id)` — closes modals, switches to grid view, clears all filters, scrolls to row, flashes it, opens detail panel. Used from dashboard week breakdown and anywhere a row ID link appears.

## Key localStorage keys
| Key | Contents |
|-----|----------|
| `wt-theme` | `"dark"` or `"light"` |
| `wt-filters` | `{ preset, categories[], date, quick }` |
| `wt-sort` | `[{ colId, sort, sortIndex }]` |
| `wt-hidden-cols` | `{ colId: true }` for hidden columns |
| `wt-wraptext` | `"1"` or `"0"` |
| `wt-week-mode` | `"work"` or `"full"` |
| `wt-cal-mode` | `"work"` or `"full"` — calendar view mode |
| `wt-cal-hide-done` | `"1"` — hide completed in cal/week views |
| `wt-hidden-rows` | JSON array of row IDs hidden via context menu |
| `wt-snoozed` | `{ [id]: "YYYY-MM-DD HH:MM" }` snooze expiry datetimes |
| `wt-notif-off` | JSON array of row IDs with notifications disabled |
| `wt-notif-times` | `{ [id]: "HH:MM" }` per-item notification time (default `"09:00"`) |
| `wt-cond-fmt` | JSON array of conditional formatting rules |
| `wt-export-settings` | `{ format, filename, folderName }` — default export config |

### IndexedDB
`wt-fs` (version 1) — object store `handles` — key `"export-dir"` stores a `FileSystemDirectoryHandle` for the default export folder. Handles cannot be serialized to JSON so they live in IndexedDB instead of localStorage.

## Things to avoid
- Do **not** add any `fetch()` calls or server-side dependencies — this is a zero-infrastructure static app; all data lives in `localStorage`.
- Do **not** use AG Grid Enterprise APIs (`agSetColumnFilter`, `ServerSideRowModel`, etc.) — only Community v31 is loaded.
- Do **not** clear column sorts when changing presets or filters.
- Do **not** call `applyTransaction` with rows that already have stale data — always mutate in-place then call `applyTransaction({ update: [row] })`.
- Do **not** use `scrollHeight` for textarea sizing before the element is guaranteed to be painted — use row-count method instead.
- Do **not** add a "Duration" tab back to the snooze popover — snooze is datetime-only ("Until…").
- Do **not** set "All Categories" checkbox as checked when `activeCategoryFilters` has explicit entries — it should only be checked in the implicit show-all state (`length === 0`).
