# Residence Tracker

Track rent/mortgage, utilities, wifi and other costs for apartments or houses, split each bill between people, and see who owes whom. **An Excel workbook (.xlsx) is the only data store**: the app reads it on open and writes every change straight back to the same file.

## Run it

Use **Chrome or Edge** (they can write to a file you pick; Firefox/Safari can only open + download).

- Double-click `index.html`, **or**
- serve the folder: `python -m http.server 8765` then open <http://localhost:8765>

Then **Create new workbook** (or **Open workbook…** for an existing one). The browser remembers the file; next time you may be asked once to "Reconnect".

## Using it

| Screen | What it does |
|---|---|
| Dashboard | Month totals, what still needs paying, who owes whom, category + 12-month charts |
| Bills | Every bill for the chosen month. **Pay** records the actual amount, who paid and when |
| Expenses | Recurring/one-time costs (Monthly, Quarterly, Yearly, One-time) and how each is split |
| Balances | Net position per person, suggested settle-up, history of settlements. **Click a person** for the line-item breakdown: every bill they paid or share, each settlement, a running balance, and what they owe (or are owed by) each other person |
| People / Residences | Who is in the group; each home, its tenure (Renting/Mortgage/Owned) and residents |

**Log a payment:** every row on the Expenses screen has a **Log payment** button. Pick who paid, the amount, and which month it covers; the form shows who owes whom (e.g. you pay the full rent → your roommate owes you their share) and Balances update immediately. You can also record payments from the Bills screen.

**Expense list:** the Expenses screen has *Your expense list* (new workbooks start with just Rent, Water, Electric and Wi-Fi; add, edit or remove items freely — stored in the `ExpenseTypes` sheet). In **Add expense** pick one under *Start from* to pre-fill it, or leave it as **Ad hoc** and type your own (tick *Save to my expense list* to keep it). Every expense is labelled **Fixed** (same every month) or **Variable** (changes; the amount is an estimate until you record the real bill).

**Splitting** is per expense, and amounts are cent-exact:
- *Equal*, *By percent*, or *By shares* (weights, e.g. 2:1).
- *Fixed $ amounts* — type what a person pays exactly; anyone left blank splits the rest. Rent $1,957 with you at $1,053.50 → the other person pays $903.50. If the rent changes, your amount stays put.
- *Equal, but some pay $ more / less* — start from an equal split and enter the extra (+) or reduction (−), e.g. +75 → you pay $75 more than half ($1,053.50) and the other person $75 less ($903.50). If the rent changes, you still pay $75 over half.
**Balances** = what each person paid out − their share of every bill marked Paid, adjusted by recorded settlements. Use the residence picker (top bar) to scope everything to one home.

## The workbook

Sheets: `People`, `Residences`, `Residents`, `Expenses`, `Splits`, `Payments`, `Settlements`, `Settings` (+ an `Info` sheet).

- You can edit it in Excel too. In the `*ID` columns you may type a **name** instead of an ID; it is resolved on load. Rows with no ID get one.
- Columns named `Residence`, `Person`, `Expense`, `PaidBy`, `From`, `To` are read-only helpers for humans and are rewritten on save.
- `Residences` stores the address as `AddressLine1`, `AddressLine2`, `City`, `State`, `PostalCode`, `Country`. A workbook with the older single `Address` column still opens; its text moves into `AddressLine1` on the next save.
- `Payments.Period` is `YYYY-MM`. Status `Paid` counts toward balances; `Billed` means the amount is known but not yet paid.
- **Excel locks open files.** Close the workbook in Excel before using the app (a red "Save failed" chip means the write was blocked; close Excel and click it to retry). Changes saved in Excel while the app is open are picked up within a few seconds.

## Files

```
index.html          page shell
css/styles.css      styling (light/dark)
js/store.js         workbook <-> data, file linking (File System Access API)
js/calc.js          schedules, splits, balances (pure logic)
js/app.js           UI
vendor/xlsx.full.min.js   SheetJS 0.18.5 (bundled; works offline)
```

`index.html?demo` loads sample data in memory without touching any file.
