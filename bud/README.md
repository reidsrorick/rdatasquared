# Budget

A local, no-build web app for tracking your bills, subscriptions, and expenses people owe you
back. Your data lives in **one Excel workbook, `budget.xlsx`**, in a folder you choose (such as a
OneDrive folder). The app reads it and writes every change straight back, right in the browser.
No server, no database, no upload; your data never leaves your machine. Open the same file in
Excel any time.

Nothing about you is built in. On first run a short **setup** asks your name and, if you like,
the people in your life. After that, **you choose who each bill is split with, and how, on the bill itself.**

- **Dashboard** — the latest month you logged, what people owe you from split bills, recurring monthly cost (your share), and what's still owed back to you.
- **Bill Log** — what you actually paid each month. Each entry is split the way its bill is set up, so you see your share and who owes what.
- **Summary** — the overall picture across everything you track, by year.
- **Bills & Subscriptions** — everything that repeats, each normalized to a monthly cost, with a **split** per bill and a **Log** button to record a payment.
- **Expense Tracker** — everything someone owes you back, per person: things you paid for with a status and receipts, grouped into trips if you like, plus each person's share of the bills you logged and the payment request behind it.
- **People** — the people you split bills with or who pay you back.

## Layout

The app is laid out like the [Residence Tracker](https://www.rdatasquared.com/residence/):

- A translucent **top bar** with the app name, a **save chip** (`Budgeting · Saved 3:42 PM`, pulsing while it saves), the privacy eye, reload, **Copy** (a dated copy of the workbook) and **Switch folder**. On phones the chip, eye and Copy stay; reload and folder move into Settings.
- A **side nav** of colored icon tiles (a row of tabs on narrow screens). The Expense Tracker shows a count of expenses you haven't requested yet. **Settings** sits at the bottom.
- Every page starts with a small label, the title, and a one-line description of what it's for, with that page's buttons on the right. Stat cards carry an icon tile and a colored top edge; everything else sits in rounded floating cards.
- Light or dark follows your system. The app **remembers the tab you were on** and reopens it after a refresh.

**First screen.** Before a folder is connected you get a welcome card: **Open budget folder** (or **Reconnect <folder>** when your browser just needs a one-click OK), or **Start with sample data**.

**Sample data.** *Start with sample data* — or opening `index.html?demo` — loads made-up numbers so you can look around. Nothing is read or written. **Open my folder** leaves it.

**Settings** holds your name, the Autosave switch, Hide amounts, the connected folder (Switch / Reload) and a download-a-copy button.

## People and splits

**First run.** Open a folder with no `budget.xlsx` and the setup asks for your name and (optionally) a few
people: a roommate, a friend, an employer, a client. *Skip for now* leaves it blank. Add and edit people any time
on the **People** page (name, plus an optional *kind* such as Roommate or Client). Typing a new name anywhere,
such as "Who pays me back" on an expense, adds that person automatically. Renaming a person updates every
split, expense and request that uses them.

**Splitting a bill.** Open a bill on **Bills & Subscriptions** (or add one) and use **Split with**: tick the
people it is shared with, then choose how:

| Method | Meaning |
|--------|---------|
| Split equally | you and everyone ticked pay the same |
| They pay it all | split equally among the people ticked; your share is $0 |
| By percent | a percentage for each person ticked; you pay what's left |
| Fixed amounts | a dollar amount for each person ticked; you pay what's left |
| Equal, but I pay more or less | equal, then you pay $X more (a minus means less) and the others pay less |
| I pay a fixed amount | you pay $X each time; the others split the rest |

A live preview shows how the bill's amount divides. A bill with nobody ticked is just yours. Different bills can be
split with different people in different ways: rent with your roommate, a streaming plan three ways, a phone
plan not at all.

**A bill's amount is the full bill.** The *Recurring / month* figures count only **your share** of it.

**Logging payments.** Money is owed when you actually pay. On **Bill Log**, add an entry (or press **Log** on a bill's
row to start one with its amount filled in). Each entry takes the split of the bill with the same name, and the
log shows *My share*, *Others owe* and who. Entries for a bill with no split are simply yours.

## Your data: `budget.xlsx`

The workbook is the app's only saved file. Edit its data sheets in Excel if you like (**close it in Excel
first**: Excel locks an open file, and the app will tell you "Couldn't write budget.xlsx" until you do; it retries on its own).

| Sheet | What's in it | Editable? |
|-------|--------------|-----------|
| **Bill Log** | every payment you logged, with your share and others' share calculated | yes (Date, Bill, Total Amount) |
| **Requests** | payment requests (which month, from whom, status, dates) | yes |
| **Subscriptions-Bills** | recurring items, with **Split With**, **Split Method**, **Split Values** | yes |
| **Expense Tracker** | every reimbursable expense: who owes it, status, dates, receipt filenames, group | yes |
| **People** | name and kind | yes |
| **Links** | biller links | yes |
| **Groups** | trip / group names (so an empty group survives) | yes |
| **Settings** | your name, setup flags | yes |
| **Summary**, **Owed Summary**, **Trips**, **About** | reports | **no**, rewritten on every save |

Split With is a list of names from People separated by `;`. Split Values lines up with it (percentages or dollars;
a single amount for the last two methods). Dates and dollar amounts are real Excel dates and currency.

### Moving over from earlier versions

The first time you connect a folder that has **no `budget.xlsx`**, the app creates one from the first of these it finds, and says so:

1. an older **`budget.json`**
2. your original **`Apartment Breakdown.xlsx`** and **`Expenses.xlsx`**

Those older files are only ever **read, never written or deleted**. An existing `budget.xlsx` made before the People
list (with its one partner, per-item split rules and categories) is converted the same way, once, and every number
stays the same:

- the partner becomes a person, and each rule becomes a **split on a bill of that name** (items with no rule were split
  in half, so they get an equal split);
- logged items take the rule's display name (e.g. `uelec` becomes `Electric`);
- a bill that gets a split now holds the **full amount last paid** (it used to be your portion);
- each person who owed you on an expense becomes a person, with their old category as their *kind*;
- payment requests are marked as being from the partner.

## Download a copy

The **Copy** button (top bar, or Settings → Download a copy) saves a dated copy of the whole workbook,
`Budget Export YYYY-MM-DD.xlsx`, to your Downloads folder. The live `budget.xlsx` stays where it is.

## Adding entries

Each data tab has a blue **+ Add** (one row via a form) and a **Bulk add** button. Bulk add
opens an Excel-style grid where you can type multiple rows or **paste straight from Excel** —
copy a block of cells, click the first box, and Ctrl+V. Dates accept `11/15/2026` or
`2026-11-15`; the bill, name and group boxes suggest what you've used before; computed splits
are filled in automatically. Edit a row with ✎, delete with ✕.

Tables are laid out to fit without a sideways scrollbar. Long text wraps, and details such as a subscription's
description, start date and comments, or who owes an expense, sit as small lines under the
name instead of taking their own columns (they're all still stored and editable in the form). Bulk-adding
expenses leaves out *Status* and its two dates — new expenses start *Pending* and the dates are filled in when
you change the status.

**On phones** (screens under about 720px wide) each table row becomes a small card: the name as its title, then
each value with its label ("Amount  $134.00"), with the row's buttons at the bottom. The bulk-add grid does the
same on screens under about 980px, with one card per row to fill in.

## Summary tab

Pick a **calendar year** (or **All time**) at the top; the year picker remembers your choice and
defaults to the newest year with data. Four cards and three panels:

- **Your share of bills** — what the bills you logged cost you that year, your monthly average, and what others owe. (Only once you've logged something.)
- **Recurring / month** — what your active subscriptions and bills cost now, per month and per year.
  This is a *current* figure, so it doesn't change with the year you pick.
- **Fronted for others** and **Still owed to you** — what you paid for other people (expenses you bought that
  year, plus the other person's share of the shared bills), how much has come back, and the percentage recovered.
- **Where the bill money goes** — each bill with its total, your share, others' share, and its percentage of everything logged.
- **Recurring costs** — every active item as a monthly and yearly cost, biggest first.
- **Fronted for others** — by person: fronted, paid back, still owed, recovered.

The month-by-month table is on the Dashboard and the Bill Log, so it isn't repeated here.
Recurring costs count only your share of a split bill.

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

- **Who pays me back** — a person from People (a friend, your employer, a client). Type a new name and they're added.
- **Status** — *Pending* (you paid, haven't asked yet) → *Submitted* (expense report / invoice sent, or payment requested) → *Paid*. Change it right from the dropdown on the row; the **Submitted on** / **Paid on** dates are filled in for you.

The top of the page shows how much is **still owed**, how much you haven't requested yet, how much is awaiting payment, and how much has been paid back — plus a breakdown by person. Use the filter chips to look at just one person or status (the default view is everything still owed).

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

## Split bills in the Expense Tracker

When you log a payment of a bill that is split, each person pays you back their share. So each **month** and
**person** appears in the Expense Tracker as one line, e.g. *Shared bills — November 2026, Sam's share of 5 bills, $485.00*,
counted in the totals, the "Who owes me" table, and the dashboard's **Owed back to me** card.

Nothing is entered twice. The line is **calculated** from your Bill Log and takes its **status from that month's payment request
for that person**, which you manage right on the line:

| Status | When |
|--------|------|
| **Pending** | no request for that month yet, or the request is still a Draft |
| **Submitted** | the request has a *Request Sent* date, or its status is *Awaiting Transfer* |
| **Paid** | the request has a *Payment Received* date, or its status is *Paid* / *Complete* |

The buttons on these lines update that request for you:

- **Request…** — opens the payment-request form pre-filled for that month and person (title, month, who, status Draft).
- **Mark paid** — they paid: stamps today as *Payment Received* and sets the status to Paid.
- **Settled** — the month was already taken care of and has no request; records a Complete request so it stops showing as owed.
- **✎** — edit the request: its status, the *sent* / *paid* dates, and the *account transferred* date (shown on the line as "in bank 11/14").
- **✕** — remove the request. That month goes back to *no request yet*, which is how you undo a **Settled** you clicked by mistake.

**One-time catch-up.** The first time data loads, every month before your first tracked request (with no request of
its own) is marked **settled**, assuming you were paid before you started tracking. Each shows up as an ordinary
*Complete* request (description "Marked settled (before tracking started)"); use **✕** on any you disagree with. This
runs once and is remembered in the workbook (a `migration:` row on the Settings sheet).

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
    model.js        people, per-bill splits, summaries, formatting, table schemas
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
`persist: true` to also include them in the export, like the bill-log splits). The Item dropdown
comes from your bills and past entries (free text).
