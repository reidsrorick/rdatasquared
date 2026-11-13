# Budget

A local, no-build web app for your shared apartment costs, subscriptions, and reimbursable
expenses. Everything lives in **one file — `budget.json`** — in your OneDrive budget folder, read
and written right in the browser. No server, no database, no upload; your data never leaves your
machine. When you need Excel, the **Excel** button exports everything to a workbook.

- **Dashboard** — this month's apartment split, what Luke owes you, recurring monthly cost, what's still owed back to you.
- **Apartment** — the Data Entry table with automatic Reid/Luke splits, a monthly summary, biller-portal links.
- **Summary** — the overall picture across everything you track, by year: where the apartment money goes, what you spend on recurring costs, and how much you've fronted for others versus gotten back.
- **Subscriptions & Bills** — recurring items, each normalized to a monthly cost, with an Active toggle.
- **Expense Tracker** — everything someone owes you back: things you paid for (friends/family, work, a client) with a status and receipts for each, plus Luke's share of the apartment each month and the Venmo request behind it.

The left **sidebar** collapses to an icon rail (click **Collapse**; remembered between visits), and on phones it becomes a slide-in drawer (the ☰ button). The app also **remembers the tab you were on** and reopens it after a refresh instead of resetting to Dashboard.

## Your data: `budget.json`

All five tables plus the biller links are stored in a single readable JSON file, one row per line:

```json
{
  "app": "budget",
  "version": 1,
  "savedAt": "2026-11-13T20:44:53.000Z",
  "migrations": { "settledBeforeFirstRequest": true },
  "apartment": [
    {"Date":"2026-11-01","Item":"Rent","Total Amount":1957}
  ],
  "requests": [ … ],
  "subscriptions": [ … ],
  "expenses": [ … ],
  "links": [ … ]
}
```

Dates are plain `YYYY-MM-DD`. The apartment splits (50/50, Reid, Luke) aren't stored — they're
calculated from the total, so they can never drift out of sync. It's an ordinary text file, so it
syncs through OneDrive, diffs cleanly, and is easy to back up.

### Moving over from the spreadsheets

The first time you connect a folder that has **no `budget.json`**, the app imports your existing
`Apartment Breakdown.xlsx` and `Expenses.xlsx` into a new `budget.json` and tells you so. After
that, `budget.json` is the source of truth.

- **Your `.xlsx` files are only ever read — never written.** They're left exactly as they were
  (including the pasted screenshots in the *Screenshots* sheet, which the app can't carry over).
  They're just no longer updated; use the **Excel** button when you want a current workbook.
- If a folder has neither `budget.json` nor spreadsheets, the app asks before starting a new,
  empty budget there.

## Export to Excel

the **Excel** button in the top bar builds a fresh workbook from what's on screen and downloads it as
`Budget Export YYYY-MM-DD.xlsx` (check your Downloads folder). It contains:

| Sheet | What's in it |
|-------|--------------|
| **Data Entry** | every apartment entry, with the 50/50, Reid and Luke columns calculated |
| **Summary** | monthly Reid / Luke / Total, and the year total |
| **Requests** | Venmo requests |
| **Subscriptions-Bills** | recurring items |
| **Expense Tracker** | every reimbursable expense, including status, dates and receipt filenames |
| **Owed Summary** | pending / submitted / paid / still owed, by who pays you back (including Luke's apartment share), plus Luke's share month by month |
| **Links** | biller portals |

Dates and dollar amounts are real Excel dates and currency, so they sort and sum normally. The
export is a one-way snapshot — editing the workbook doesn't change `budget.json`.

## Adding entries

Each data tab has a blue **+ Add** (one row via a form) and a **Bulk add** button. Bulk add
opens an Excel-style grid where you can type multiple rows or **paste straight from Excel** —
copy a block of cells, click the first box, and Ctrl+V. Dates accept `11/15/2026` or
`2026-11-15`; the item column matches your allowed items (case-insensitive); computed splits
are filled in automatically. Edit a row with ✎, delete with ✕.

Tables are laid out to fit without a sideways scrollbar. Long text wraps, and details such as a subscription's
description, start date and comments, or an expense's category and who owes it, sit as small lines under the
name instead of taking their own columns (they're all still stored and editable in the form). Bulk-adding
expenses leaves out *Status* and its two dates — new expenses start *Pending* and the dates are filled in when
you change the status.

**On phones** (screens under about 720px wide) each table row becomes a small card: the name as its title, then
each value with its label ("Amount  $134.00"), with the row's buttons at the bottom. The bulk-add grid does the
same on screens under about 980px, with one card per row to fill in.

## How the split works (mirrors your sheet's formulas)

| Item | Reid | Luke |
|------|------|------|
| **Rent** | half + $75 | half − $75 |
| **Renter's Insurance** | full amount | $0 |
| **Internet** | total − INT(total ÷ 2) | same |
| everything else (uelec, uwater, ugarb) | half | half |

Values are kept at full precision and displayed to 2 decimals — identical to the workbook. A
month's **Total** is the sum of the actual bill amounts, like your workbook's Summary sheet. It can
differ from Reid + Luke by a few cents, because the Internet rule above charges each person
`total − INT(total ÷ 2)`, which adds up to slightly more than the bill.

## Summary tab

Pick a **calendar year** (or **All time**) at the top; the year picker remembers your choice and
defaults to the newest year with data. Four cards and three panels:

- **Apartment — your share** — what the apartment cost you that year, your monthly average, and Luke's share.
- **Recurring / month** — what your active subscriptions and bills cost now, per month and per year.
  This is a *current* figure, so it doesn't change with the year you pick.
- **Fronted for others** and **Still owed to you** — what you paid for other people (expenses you bought that
  year, plus Luke's apartment share), how much has come back, and the percentage recovered.
- **Where the apartment money goes** — each kind of bill (rent, electric, water, …) with its total, your share,
  Luke's share, and its percentage of all apartment bills.
- **Recurring costs** — every active item as a monthly and yearly cost, biggest first.
- **Fronted for others** — by who pays you back (Friends/Family, Work, Client): fronted, paid back, still owed, recovered.

The month-by-month apartment table is on the Dashboard and Apartment tabs, so it isn't repeated here.
One caution: your rent, internet and renter's insurance show up in **both** the apartment numbers and the
recurring list (they're in your Subscriptions & Bills sheet too) — don't add those two together.

## Privacy mode (hide amounts)

The **eye button** in the top bar masks every dollar figure as `$•••••` so you can show the screen to someone else without revealing numbers — click it again to reveal. Only amounts are hidden; labels, item names, dates and categories stay visible. The choice is remembered between visits (per device/browser).

## Running it locally

The File System Access API (used to read/write your files in place) needs the page served
over `http://localhost` or `https://` — opening `index.html` as a `file://` won't work.

From the **`app`** folder:

```bash
python -m http.server 8777
```

Then open <http://localhost:8777> in **Chrome or Edge** (Firefox/Safari don't support
in-place file writing — see Fallback below).

1. Click **Open budget folder** and pick your OneDrive `07) Budgeting` folder.
2. Grant read/write when prompted.
3. Edit anything — with **Autosave** on (the default) it writes itself; otherwise click
   **Save budget.json** in the bar at the bottom.

OneDrive then syncs `budget.json` up to the cloud like any other change.

## Autosave

The **Autosave** switch in the header (on by default) writes your changes to `budget.json`
automatically about 1.2 seconds after you stop editing. The bottom bar shows
`Saving…` then `✓ Saved 3:42 PM`. Your preference is remembered between visits.

- Autosave needs a connected folder (Chrome/Edge). In the download-only fallback it stays
  off so it can't spam your downloads — use the manual **Save** button there.
- If a save ever fails (e.g. the folder permission was revoked), autosave switches itself
  off and tells you, so it never loops.

## Multi-device safety (conflict detection)

Because `budget.json` lives in OneDrive and syncs across devices, the app guards against
overwriting newer changes. It records the file's modified-time when it loads, and:

- **Returning to the tab** (or every ~20s) it checks whether the file changed on disk — from
  another device. If you have **no unsaved changes**, it quietly **pulls the newer version**. If
  you **do** have unsaved changes, it raises a conflict banner.
- **Before any save** (manual or autosave) it re-checks. If the file changed underneath you,
  the save is blocked and a red banner appears: **Reload latest** (take the disk version) or
  **Keep my version** (overwrite the disk). Autosave pauses until you choose.
- If `budget.json` can't be read (invalid JSON, or OneDrive is mid-sync), the app keeps the data
  you have, says so, and tries again — it never overwrites a file it couldn't read.

So switching between your laptop and another device won't clobber whichever you edited last —
the stale browser pulls the update instead.

## Status banners

A banner appears below the top bar when something needs attention:

- **Autosave is off** — you turned it off; changes stay in the browser until you Save. (Turn it back on, or Save now.)
- **Download mode** — the browser can't write in place (fallback); saving downloads a copy.
- **Conflict** (red) — `budget.json` changed elsewhere; choose which version wins.

## Backups

The first save of an editing session writes a timestamped copy of the previous `budget.json` into a
**`backups/`** subfolder (`budget 2026-11-13T20-44-53.json`), then at most one backup per 10 minutes
(so autosave doesn't flood it); the last 20 are kept. To roll back, copy a backup over `budget.json`.

## Fallback (browsers without File System Access)

If your browser can't write files directly, **Open budget file** lets you pick `budget.json` (or your
two old `.xlsx` files, to import them). **Save** downloads an updated `budget.json` that you put
back in your folder yourself.

## Install as an app (PWA)

The app is a Progressive Web App: served over `http://localhost` or `https://` it can be
installed. In Chrome/Edge, click the install icon in the address bar (or menu → *Install
Budget*); on iPhone Safari, Share → *Add to Home Screen*. It then opens in its own window
with its own icon, and the app shell is cached by a service worker (`sw.js`) so it loads
offline — your data is already local, so the whole thing works with no connection.

To install: it must be served from `http://localhost` or `https://` — opening `index.html`
straight from disk (`file://`) can't be installed.

**Shipping an update:** bump `CACHE` in `sw.js` *and* the `?v=` number on the `<link>`/`<script>`
tags in `index.html`. The worker fetches from the network first (falling back to its cache only when
offline), and the versioned URLs make sure an old cached file can never be paired with a new page.

## Expense Tracker

For anything you paid for that someone else should pay back. Each expense has:

- **Who pays me back** — *Friends/Family*, *Work (internal)* (your employer's expense report), or *Client*.
- **Owed by** — the person or client's name.
- **Status** — *Pending* (you paid, haven't asked yet) → *Submitted* (expense report / invoice sent, or Venmo requested) → *Paid*. Change it right from the dropdown on the row; the **Submitted on** / **Paid on** dates are filled in for you.

The top of the page shows how much is **still owed**, how much you haven't requested yet, how much is awaiting payment, and how much has been paid back — plus a breakdown by who pays. Use the filter chips to look at just one category or status (the default view is everything still owed).

**Receipts attach to the expense.** Choose files right in the **Add expense** / **Edit** form (a *Receipts* picker at the bottom), or click the **paperclip** on a row to open its receipts: drop files in or click *Add receipt(s)*. (Bulk add can't take files — attach those afterward with the paperclip.) Receipts need your budget folder connected in Chrome/Edge. Files are saved to a `Receipts/` subfolder of your budget folder as `YYYY-MM-DD_what_filename`, dated by the purchase date, with `-2`, `-3` added if a name repeats. The filenames are stored on the expense (the `Receipt` field), so they travel with it. **✕** unlinks a receipt from the expense but never deletes the file.

## Apartment in the Expense Tracker (Luke's share)

You front the whole apartment bill and Luke pays his share by Venmo request, so that's an expense
someone owes you too. Each **month of apartment bills** appears in the Expense Tracker as one line —
*Apartment — November 2026, owed by Luke, $980.27* — filed under Friends/Family and counted in the
totals, the "Who owes me" table, and the dashboard's **Owed back to me** card.

Nothing is entered twice. The line is **calculated** from your Apartment entries (Luke's share of that
month's bills, using the split rules) and takes its **status from that month's Venmo request**, which
you manage right on the line:

| Status | When |
|--------|------|
| **Pending** | no request for that month yet, or the request is still a Draft |
| **Submitted** | the request has a *Request Sent* date, or its status is *Awaiting Transfer* |
| **Paid** | the request has a *Payment Received* date, or its status is *Paid* / *Complete* |

The buttons on these lines update that request for you:

- **Request…** — opens the Venmo request form pre-filled for that month (title, month, Luke's share, status Draft).
- **Mark paid** — Luke paid: stamps today as *Payment Received* and sets the status to Paid.
- **Settled** — the month was already taken care of and has no request; records a Complete request so it stops showing as owed.
- **✎** — edit the request: its status, the *sent* / *paid* dates, and the *account transferred* date for moving the money from Venmo to your bank (shown on the line as "in bank 11/14").
- **✕** — remove the request. That month goes back to *no request yet*, which is how you undo a **Settled** you clicked by mistake.

The receipts for the bills themselves still go on the Apartment entries.

**One-time catch-up.** The first time this version loads your data, every month of bills *before your first
tracked request* (with no request of its own) is marked **settled** — it assumes you were paid before you
started tracking. Each shows up as an ordinary *Complete* request titled e.g. "September 2026 Bills"
(description "Marked settled (before tracking started)"); use **✕** on any you disagree with and that month
goes back to Pending. This runs once and is remembered in `budget.json` (`migrations`), so it never re-creates
a record you deleted.

## Hosting on GitHub

This `app/` folder is self-contained (code only — no data). Make **`app/`** the repository root
and enable GitHub Pages; your `budget.json` and spreadsheets stay in OneDrive and are never
committed. The hosted page still reads/writes your local OneDrive folder through the folder
picker, exactly like the local version.

## Files

```
app/
  index.html        markup + script order
  styles.css        theme (light/dark), layout
  sw.js             service worker (offline app shell)
  js/
    model.js        split logic, summaries, formatting, table schemas
    excel.js        Excel import (one-time migration) and export
    store.js        budget.json in your folder: load/save, backups, change detection, receipt files
    ui.js           rendering, tables, modal form
    app.js          state + actions + bootstrap
  lib/
    xlsx.full.min.js  SheetJS (vendored, works offline)
```

## Adding a new item type or column

Edit the `schemas` object in `js/model.js`. Each table lists its stored `columns` (saved to
`budget.json` and included in the Excel export) and optional `computed` columns (derived; set
`persist: true` to also include them in the export, like the apartment splits). The Item dropdown
comes from `APARTMENT_ITEMS`.
