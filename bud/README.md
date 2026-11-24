# Budget

A local, no-build web app for tracking shared bills, subscriptions, and expenses people owe you
back. Your data lives in **one Excel workbook, `budget.xlsx`**, in a folder you choose (such as a
OneDrive folder). The app reads it and writes every change straight back, right in the browser.
No server, no database, no upload; your data never leaves your machine. Open the same file in
Excel any time.

Nothing about you is built in. On first run a short **setup** asks your name, whether you share
bills with someone (and how each bill splits), and who pays you back. Everything is editable later
in **Settings**.

- **Dashboard** — this month's shared-bill split, what the other person owes you, recurring monthly cost, what's still owed back to you.
- **Shared bills** (you name it: Apartment, House…) — a table of bills with an automatic split, a monthly summary, biller links. Only appears if you said you share bills.
- **Summary** — the overall picture across everything you track, by year.
- **Subscriptions & Bills** — recurring items, each normalized to a monthly cost, with an Active toggle.
- **Expense Tracker** — everything someone owes you back: things you paid for, with a status and receipts for each, grouped into trips if you like, plus the other person's share of the shared bills each month and the payment request behind it.

## Layout

The app is laid out like the [Residence Tracker](https://www.rdatasquared.com/residence/):

- A translucent **top bar** with the app name, a **save chip** (`Budgeting · Saved 3:42 PM`, pulsing while it saves), the privacy eye, reload, **Copy** (a dated copy of the workbook) and **Switch folder**. On phones the chip, eye and Copy stay; reload and folder move into Settings.
- A **side nav** of colored icon tiles (a row of tabs on narrow screens). The Expense Tracker shows a count of expenses you haven't requested yet. **Settings** sits at the bottom.
- Every page starts with a small label, the title, and a one-line description of what it's for, with that page's buttons on the right. Stat cards carry an icon tile and a colored top edge; everything else sits in rounded floating cards.
- Light or dark follows your system. The app **remembers the tab you were on** and reopens it after a refresh.

**First screen.** Before a folder is connected you get a welcome card: **Open budget folder** (or **Reconnect <folder>** when your browser just needs a one-click OK), or **Start with sample data**.

**Sample data.** *Start with sample data* — or opening `index.html?demo` — loads made-up numbers so you can look around. Nothing is read or written. **Open my folder** leaves it.

**Settings** holds your setup (names, split rules, categories), the Autosave switch, Hide amounts, the connected folder (Switch / Reload) and a download-a-copy button.

## Setup (first run)

Open a folder with no `budget.xlsx` and the setup appears. It asks:

1. **Your name**, used for column headings.
2. **Do you share bills with someone?** If yes: their name, what you call it (Apartment, House, Shared bills…), and your **split rules** (below). If no, the shared-bills tab and everything tied to it stays hidden.
3. **Who pays you back?** Your own categories for expenses you cover and get reimbursed for (friends, an employer, clients…). Start from the suggestions or add your own.

*Skip for now* leaves everything blank. Reopen it any time from **Settings → Names, split rules, categories**,
or the **Edit** button on the shared-bills page. Changing a category or name never rewrites old rows; anything
already on an expense keeps showing.

### Split rules

Out of the box there are **no rules**: every shared bill is split in half. Add a rule for any item that
splits differently. The item is whatever you type when adding a bill (suggestions come from your rules and past bills):

| Rule | Meaning |
|------|---------|
| Split equally | each person pays half |
| I pay all / They pay all | the whole bill is yours / theirs |
| I pay a percentage | e.g. 60 → you pay 60%, they pay 40% |
| Equal, but I pay more or less | half each, then you pay $X more (a minus amount means less) and they pay less |
| I pay a fixed amount | you pay $X each time, they pay the rest |

An optional **Shown as** name replaces the item in the Summary. Amounts are kept at full precision and shown to
2 decimals. A month's **Total** is the sum of the actual bill amounts. (A rule saved with *Round each share up*
in the workbook charges each person `total − INT(total ÷ 2)`, which can add up to a cent more than the bill;
the setup screen doesn't offer it, it exists so older data keeps adding up.)

## Your data: `budget.xlsx`

The workbook is the app's only saved file. Edit its data sheets in Excel if you like (**close it in Excel
first**: Excel locks an open file, and the app will tell you "Couldn't write budget.xlsx" until you do; it retries on its own).

| Sheet | What's in it | Editable? |
|-------|--------------|-----------|
| **Shared Bills** | every bill, with the split columns calculated | yes (Date, Item, Total Amount) |
| **Requests** | payment requests (which month, status, dates) | yes |
| **Subscriptions-Bills** | recurring items | yes |
| **Expense Tracker** | every reimbursable expense: status, dates, receipt filenames, group | yes |
| **Links** | biller links | yes |
| **Groups** | trip / group names (so an empty group survives) | yes |
| **Split Rules** | your rules | yes |
| **Categories** | your "who pays you back" list | yes |
| **Settings** | names, setup flags | yes |
| **Summary**, **Owed Summary**, **Trips**, **About** | reports | **no**, rewritten on every save |

Dates and dollar amounts are real Excel dates and currency. The split columns are calculated from the
rules, so they can't drift out of sync.

### Moving over from earlier versions

The first time you connect a folder that has **no `budget.xlsx`**, the app creates one from the first of these it finds, and says so:

1. an older **`budget.json`** (this app's previous format). Your numbers are unchanged: the names and split rules that file was built on are carried into the new Settings automatically.
2. your original **`Apartment Breakdown.xlsx`** and **`Expenses.xlsx`**, imported the same way.

Those older files are only ever **read, never written or deleted**; after the move, `budget.xlsx` is the source of truth.
A folder with none of them starts the setup.

## Download a copy

The **Copy** button (top bar, or Settings → Download a copy) saves a dated copy of the whole workbook,
`Budget Export YYYY-MM-DD.xlsx`, to your Downloads folder. The live `budget.xlsx` stays where it is.

## Adding entries

Each data tab has a blue **+ Add** (one row via a form) and a **Bulk add** button. Bulk add
opens an Excel-style grid where you can type multiple rows or **paste straight from Excel** —
copy a block of cells, click the first box, and Ctrl+V. Dates accept `11/15/2026` or
`2026-11-15`; item and category boxes suggest what you've used before; computed splits
are filled in automatically. Edit a row with ✎, delete with ✕.

Tables are laid out to fit without a sideways scrollbar. Long text wraps, and details such as a subscription's
description, start date and comments, or an expense's category and who owes it, sit as small lines under the
name instead of taking their own columns (they're all still stored and editable in the form). Bulk-adding
expenses leaves out *Status* and its two dates — new expenses start *Pending* and the dates are filled in when
you change the status.

**On phones** (screens under about 720px wide) each table row becomes a small card: the name as its title, then
each value with its label ("Amount  $134.00"), with the row's buttons at the bottom. The bulk-add grid does the
same on screens under about 980px, with one card per row to fill in.

## How the split works

See **Split rules** above. The split is calculated per bill from your rules; with no rules everything is 50/50.

## Summary tab

Pick a **calendar year** (or **All time**) at the top; the year picker remembers your choice and
defaults to the newest year with data. Four cards and three panels:

- **Shared bills — your share** — what the shared bills cost you that year, your monthly average, and the other person's share. (Only if you share bills.)
- **Recurring / month** — what your active subscriptions and bills cost now, per month and per year.
  This is a *current* figure, so it doesn't change with the year you pick.
- **Fronted for others** and **Still owed to you** — what you paid for other people (expenses you bought that
  year, plus the other person's share of the shared bills), how much has come back, and the percentage recovered.
- **Where the shared-bill money goes** — each kind of bill with its total, your share, theirs, and its percentage of all shared bills.
- **Recurring costs** — every active item as a monthly and yearly cost, biggest first.
- **Fronted for others** — by who pays you back (your categories): fronted, paid back, still owed, recovered.

The month-by-month table is on the Dashboard and the shared-bills tab, so it isn't repeated here.
One caution: a bill that's in both your shared bills and your Subscriptions & Bills list shows up in both places, so don't add the two together.

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
   **Save now** in the top bar.

OneDrive then syncs `budget.xlsx` up to the cloud like any other change.

## Autosave

The **Autosave** switch in **Settings** (on by default) writes your changes to `budget.xlsx`
automatically about 1.2 seconds after you stop editing. The save chip in the top bar shows
`Saving…` then `Saved 3:42 PM`. Your preference is remembered between visits.

- Autosave needs a connected folder (Chrome/Edge). In the download-only fallback it stays
  off so it can't spam your downloads — use the **Download budget.xlsx** button there.
- If a save ever fails (e.g. the folder permission was revoked), autosave switches itself
  off and tells you, so it never loops.

## Multi-device safety (conflict detection)

Because `budget.xlsx` lives in OneDrive and syncs across devices, the app guards against
overwriting newer changes. It records the file's modified-time when it loads, and:

- **Returning to the tab** (or every ~20s) it checks whether the file changed on disk — from
  another device. If you have **no unsaved changes**, it quietly **pulls the newer version**. If
  you **do** have unsaved changes, it raises a conflict banner.
- **Before any save** (manual or autosave) it re-checks. If the file changed underneath you,
  the save is blocked and a red banner appears: **Reload latest** (take the disk version) or
  **Keep my version** (overwrite the disk). Autosave pauses until you choose.
- If `budget.xlsx` can't be read (invalid JSON, or OneDrive is mid-sync), the app keeps the data
  you have, says so, and tries again — it never overwrites a file it couldn't read.

So switching between your laptop and another device won't clobber whichever you edited last —
the stale browser pulls the update instead.

## Status banners

A banner appears above the page when something needs attention:

- **Sample data** — you're looking at the demo; nothing is saved.
- **Autosave is off** — you turned it off; changes stay in the browser until you Save. (Turn it back on, or Save now.)
- **Download mode** — the browser can't write in place (fallback); saving downloads a copy.
- **Conflict** (red) — `budget.xlsx` changed elsewhere; choose which version wins.

## Backups

The first save of an editing session writes a timestamped copy of the previous `budget.xlsx` into a
**`backups/`** subfolder (`budget 2026-11-13T20-44-53.json`), then at most one backup per 10 minutes
(so autosave doesn't flood it); the last 20 are kept. To roll back, copy a backup over `budget.xlsx`.

## Fallback (browsers without File System Access)

If your browser can't write files directly, **Open budget file** lets you pick `budget.xlsx` (or your
two old `.xlsx` files, to import them). **Save** downloads an updated `budget.xlsx` that you put
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

- **Who pays me back** — one of your own categories (set up in Settings, e.g. friends, your employer, a client). You can also just type a new one on an expense.
- **Owed by** — the person or client's name.
- **Status** — *Pending* (you paid, haven't asked yet) → *Submitted* (expense report / invoice sent, or payment requested) → *Paid*. Change it right from the dropdown on the row; the **Submitted on** / **Paid on** dates are filled in for you.

The top of the page shows how much is **still owed**, how much you haven't requested yet, how much is awaiting payment, and how much has been paid back — plus a breakdown by who pays. Use the filter chips to look at just one category or status (the default view is everything still owed).

**Receipts attach to the expense.** Choose files right in the **Add expense** / **Edit** form (a *Receipts* picker at the bottom), or click the **paperclip** on a row to open its receipts: drop files in or click *Add receipt(s)*. (Bulk add can't take files — attach those afterward with the paperclip.) Receipts need your budget folder connected in Chrome/Edge. Files are saved to a `Receipts/` subfolder of your budget folder as `YYYY-MM-DD_what_filename`, dated by the purchase date, with `-2`, `-3` added if a name repeats. The filenames are stored on the expense (the `Receipt` field), so they travel with it. **✕** unlinks a receipt from the expense but never deletes the file.

## Groups (trips and batches)

Expenses that belong together — a trip, a client engagement, a batch you'll submit as one expense report — can be
put in a **group**. Each group is its own **floating card** in the Expense Tracker: a header with its name, how many
expenses it holds, the **total** and how much is **still owed**, a thin progress line showing how much has been
paid back (it turns calm and grey-named once everything is paid), and its expenses underneath. Click a header to
fold or unfold the card (remembered on this device); anything not in a group sits in a dashed **Not in a group**
card. With no groups, the tracker is one plain card holding the list. While rows are ticked, a **floating bar**
appears at the bottom of the screen.

There are two ways to fill a group:

- **Tick and add.** Tick the box next to any expenses (the box in a group's header ticks everything in it). A bar
  appears — choose **Add to group…** and pick a group, or **＋ New group…** to name a new one and add them in one
  go. **Remove from group** takes them back out.
- **Start a group, then add into it.** Click **New group**, name it, and click **+ Add expense** inside its block —
  the form opens with the group already filled in. (The add/edit form and bulk add also have a **Trip / group**
  box that suggests the groups you already have.)

Each block's **More…** menu has **Mark all submitted** (moves every *Pending* expense forward), **Mark all paid**,
**Rename…** (naming it after another group merges the two) and **Delete group…**. Deleting a group never deletes
its expenses — they just become ungrouped. Group names ignore case and spacing, so "austin trip" joins
"Austin trip". The category and status filters still apply inside groups; a header always shows the group's
full total, and says "(3 shown)" when a filter is hiding some of its expenses.

Groups are saved in `budget.xlsx` (the **Groups** sheet, and each expense's *Group* column), so an empty group
survives until you use it, and the workbook has a **Trips** report sheet.

## Shared bills in the Expense Tracker (their share)

If you said you share bills, you front the whole bill and the other person pays their share by payment
request, so that's an expense they owe you too. Each **month of shared bills** appears in the Expense Tracker as one line —
*Apartment — November 2026, owed by Sam, $485.00* — filed under the category you picked for it in setup and counted in the
totals, the "Who owes me" table, and the dashboard's **Owed back to me** card.

Nothing is entered twice. The line is **calculated** from your shared bills (their share of that
month's bills, using your split rules) and takes its **status from that month's payment request**, which
you manage right on the line:

| Status | When |
|--------|------|
| **Pending** | no request for that month yet, or the request is still a Draft |
| **Submitted** | the request has a *Request Sent* date, or its status is *Awaiting Transfer* |
| **Paid** | the request has a *Payment Received* date, or its status is *Paid* / *Complete* |

The buttons on these lines update that request for you:

- **Request…** — opens the payment-request form pre-filled for that month (title, month, their share, status Draft).
- **Mark paid** — they paid: stamps today as *Payment Received* and sets the status to Paid.
- **Settled** — the month was already taken care of and has no request; records a Complete request so it stops showing as owed.
- **✎** — edit the request: its status, the *sent* / *paid* dates, and the *account transferred* date (shown on the line as "in bank 11/14").
- **✕** — remove the request. That month goes back to *no request yet*, which is how you undo a **Settled** you clicked by mistake.

The receipts for the bills themselves go on the shared-bill entries.

**One-time catch-up.** The first time data loads, every month of bills *before your first
tracked request* (with no request of its own) is marked **settled** — it assumes you were paid before you
started tracking. Each shows up as an ordinary *Complete* request titled e.g. "September 2026 Bills"
(description "Marked settled (before tracking started)"); use **✕** on any you disagree with and that month
goes back to Pending. This runs once and is remembered in the workbook (a `migration:` row on the Settings sheet), so it never re-creates
a record you deleted.

## Hosting on GitHub

This `app/` folder is self-contained (code only — no data). Make **`app/`** the repository root
and enable GitHub Pages; your `budget.xlsx` and spreadsheets stay in OneDrive and are never
committed. The hosted page still reads/writes your local OneDrive folder through the folder
picker, exactly like the local version.

## Files

```
app/
  index.html        markup + script order
  styles.css        theme (light/dark), layout
  sw.js             service worker (offline app shell)
  js/
    model.js        settings, split rules, summaries, formatting, table schemas
    excel.js        reads and writes budget.xlsx (data + settings), older-file import, dated copy
    store.js        budget.xlsx in your folder: load/save, backups, change detection, receipt files
    sample.js       made-up data for "Start with sample data" / ?demo
    ui.js           rendering: welcome, nav, pages, tables, forms, settings
    app.js          state + actions + bootstrap
  lib/
    xlsx.full.min.js  SheetJS (vendored, works offline)
```

## Adding a new item type or column

Edit the `schemas` object in `js/model.js`. Each table lists its stored `columns` (saved to
`budget.xlsx`) and optional `computed` columns (derived; set
`persist: true` to also include them in the export, like the apartment splits). The Item dropdown
comes from your split rules and past bills (free text).
