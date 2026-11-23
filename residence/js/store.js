/*
 * store.js — Excel data layer.
 *
 * The .xlsx workbook is the single source of truth. This file knows how to:
 *   - turn a workbook into an in-memory "db" object (parseWorkbook)
 *   - turn the db back into a workbook (serializeWorkbook)
 *   - link to a real file on disk through the File System Access API (FileLink)
 *
 * Plain script (no ES modules) so the app also works when opened from file://.
 * Also loadable from Node for tests (global XLSX must be set first).
 */
(function (root) {
  'use strict';
  const RT = (root.RT = root.RT || {});
  const XL = () => root.XLSX;

  /* ---------------------------------------------------------------- schema */

  // t: str | num | money | bool | date | period.  info: read-only helper column for humans.
  // ref: this column holds an id of another collection (falls back to matching by name).
  const SHEETS = [
    {
      name: 'People', key: 'people',
      cols: [
        { h: 'ID', k: 'id', w: 11 },
        { h: 'Name', k: 'name', w: 22 },
        { h: 'Email', k: 'email', w: 28 },
        { h: 'Color', k: 'color', w: 10 },
        { h: 'Active', k: 'active', t: 'bool', w: 8 },
      ],
    },
    {
      name: 'Residences', key: 'residences',
      cols: [
        { h: 'ID', k: 'id', w: 11 },
        { h: 'Name', k: 'name', w: 26 },
        { h: 'Type', k: 'type', w: 12 },       // Apartment, House, Condo, ...
        { h: 'Tenure', k: 'tenure', w: 12 },   // Renting, Mortgage, Owned
        { h: 'AddressLine1', k: 'address1', w: 30 },
        { h: 'AddressLine2', k: 'address2', w: 16 },
        { h: 'City', k: 'city', w: 18 },
        { h: 'State', k: 'state', w: 8 },        // state / province / region
        { h: 'PostalCode', k: 'postalCode', w: 12 },
        { h: 'Country', k: 'country', w: 14 },
        { h: 'Address', k: 'address', legacy: true }, // old single-cell address: read once, never written
        { h: 'StartDate', k: 'startDate', t: 'date', w: 12 },
        { h: 'EndDate', k: 'endDate', t: 'date', w: 12 },
        { h: 'Notes', k: 'notes', w: 36 },
      ],
    },
    {
      name: 'Residents', key: 'residents',
      cols: [
        { h: 'ResidenceID', k: 'residenceId', ref: 'residences', w: 13 },
        { h: 'Residence', info: 'residenceId', w: 24 },
        { h: 'PersonID', k: 'personId', ref: 'people', w: 11 },
        { h: 'Person', info: 'personId', w: 20 },
      ],
    },
    {
      name: 'ExpenseTypes', key: 'expenseTypes', // your pick-list of common expenses
      cols: [
        { h: 'ID', k: 'id', w: 11 },
        { h: 'Name', k: 'name', w: 28 },
        { h: 'Category', k: 'category', w: 16 },
        { h: 'AmountType', k: 'variable', t: 'amounttype', w: 12 }, // Fixed | Variable
        { h: 'Frequency', k: 'frequency', w: 12 },
        { h: 'TypicalAmount', k: 'amount', t: 'money', w: 14 },
      ],
    },
    {
      name: 'Expenses', key: 'expenses',
      cols: [
        { h: 'ID', k: 'id', w: 11 },
        { h: 'ResidenceID', k: 'residenceId', ref: 'residences', w: 13 },
        { h: 'Residence', info: 'residenceId', w: 22 },
        { h: 'Name', k: 'name', w: 24 },
        { h: 'Category', k: 'category', w: 16 },
        { h: 'Amount', k: 'amount', t: 'money', w: 12 },
        { h: 'Frequency', k: 'frequency', w: 12 },  // Monthly | Quarterly | Yearly | One-time
        { h: 'DueDay', k: 'dueDay', t: 'num', w: 8 },
        { h: 'StartDate', k: 'startDate', t: 'date', w: 12 },
        { h: 'EndDate', k: 'endDate', t: 'date', w: 12 },
        { h: 'PaidByID', k: 'paidById', ref: 'people', w: 11 },
        { h: 'PaidBy', info: 'paidById', w: 18 },
        { h: 'SplitMethod', k: 'splitMethod', w: 12 }, // Equal | Percent | Shares
        { h: 'AmountType', k: 'variable', t: 'amounttype', w: 12 }, // Fixed = same every month | Variable = changes
        { h: 'Variable', k: 'variableLegacy', t: 'bool', dflt: false, legacy: true }, // older workbooks
        { h: 'Active', k: 'active', t: 'bool', w: 8 },
        { h: 'Notes', k: 'notes', w: 32 },
      ],
    },
    {
      name: 'Splits', key: 'splits',
      cols: [
        { h: 'ExpenseID', k: 'expenseId', ref: 'expenses', w: 11 },
        { h: 'Expense', info: 'expenseId', w: 24 },
        { h: 'PersonID', k: 'personId', ref: 'people', w: 11 },
        { h: 'Person', info: 'personId', w: 20 },
        { h: 'Value', k: 'value', t: 'num', w: 10 }, // percent or share weight (ignored for Equal)
      ],
    },
    {
      name: 'Payments', key: 'payments',
      cols: [
        { h: 'ID', k: 'id', w: 11 },
        { h: 'ExpenseID', k: 'expenseId', ref: 'expenses', w: 11 },
        { h: 'Expense', info: 'expenseId', w: 24 },
        { h: 'Period', k: 'period', t: 'period', w: 9 }, // YYYY-MM the bill belongs to
        { h: 'Amount', k: 'amount', t: 'money', w: 12 },
        { h: 'Status', k: 'status', w: 9 },              // Paid | Billed
        { h: 'PaidByID', k: 'paidById', ref: 'people', w: 11 },
        { h: 'PaidBy', info: 'paidById', w: 18 },
        { h: 'PaidDate', k: 'paidDate', t: 'date', w: 12 },
        { h: 'Note', k: 'note', w: 32 },
      ],
    },
    {
      name: 'Settlements', key: 'settlements',
      cols: [
        { h: 'ID', k: 'id', w: 11 },
        { h: 'Date', k: 'date', t: 'date', w: 12 },
        { h: 'ResidenceID', k: 'residenceId', ref: 'residences', w: 13 },
        { h: 'Residence', info: 'residenceId', w: 22 },
        { h: 'FromID', k: 'fromId', ref: 'people', w: 11 },
        { h: 'From', info: 'fromId', w: 18 },
        { h: 'ToID', k: 'toId', ref: 'people', w: 11 },
        { h: 'To', info: 'toId', w: 18 },
        { h: 'Amount', k: 'amount', t: 'money', w: 12 },
        { h: 'Note', k: 'note', w: 32 },
      ],
    },
  ];

  const INFO_LINES = [
    ['Residence Tracker workbook'],
    [''],
    ['This workbook is the database for the Residence Tracker web app. You can also edit it directly in Excel.'],
    ['Close the file in Excel before saving from the app (Excel locks open files), and vice-versa.'],
    [''],
    ['Sheets'],
    ['People', 'Everyone who shares expenses.'],
    ['Residences', 'Apartments / houses. Tenure: Renting, Mortgage or Owned.'],
    ['Residents', 'Which people live at which residence (and so default into its splits).'],
    ['ExpenseTypes', 'Your pick-list of common expenses (pre-fills the Add expense form). Ad hoc expenses do not need to be on it.'],
    ['Expenses', 'Recurring (or one-time) costs: rent, mortgage, water, wifi... Frequency: Monthly, Quarterly, Yearly, One-time. AmountType: Fixed (same every month) or Variable (changes).'],
    ['Splits', 'Who shares each expense. Value depends on SplitMethod: Percent = percent, Shares = weight, Fixed = exact $ that person pays (blank/0 = splits the rest), Offset = $ more (+) or less (-) than an equal share. Ignored for Equal.'],
    ['Payments', 'Actual bills for a month (Period = YYYY-MM). Status Paid counts toward balances; Billed = amount known, not yet paid.'],
    ['Settlements', 'Money one person paid another to settle up.'],
    ['Ledger', 'READ-ONLY report, rewritten on every save. One row per person per paid bill or settlement: their share, the effect on their balance (paid minus share; settlements +sent / -received) and a running balance across all residences. Edit Payments / Settlements instead.'],
    ['Balances', 'READ-ONLY report, rewritten on every save. Net position per person for all residences and for each residence (positive = is owed, negative = owes).'],
    ['Settings', 'Currency etc.'],
    [''],
    ['Tips'],
    ['IDs link rows together. In Excel you may type a name instead of an ID in the *ID columns; the app resolves it on load.'],
    ['Columns whose header is just a name (Residence, Person, Expense, PaidBy, From, To) are informational and refreshed on every save.'],
  ];

  /* --------------------------------------------------------------- helpers */

  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

  function uid(prefix, existing) {
    let id;
    do {
      id = prefix + '_' + Math.random().toString(36).slice(2, 8);
    } while (existing && existing.has(id));
    if (existing) existing.add(id);
    return id;
  }

  function toISODate(v) {
    if (isBlank(v)) return '';
    if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (typeof v === 'number') {
      const p = XL().SSF.parse_date_code(v);
      return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : '';
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US m/d/yyyy
    if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
    const d = new Date(s);
    return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toPeriod(v) {
    if (isBlank(v)) return '';
    if (typeof v === 'string') {
      const m = v.trim().match(/^(\d{4})-(\d{1,2})$/);
      if (m) return `${m[1]}-${pad(m[2])}`;
    }
    const iso = toISODate(v);
    return iso ? iso.slice(0, 7) : '';
  }

  function isoToSerial(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (isBlank(v)) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function toBool(v, dflt) {
    if (isBlank(v)) return dflt;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return /^(y|yes|true|1|x)$/i.test(String(v).trim());
  }

  function emptyDb() {
    const db = { settings: { currency: 'USD' } };
    SHEETS.forEach((s) => (db[s.key] = []));
    return db;
  }

  /* ----------------------------------------------------------------- parse */

  function findSheet(wb, name) {
    const hit = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
    return hit ? wb.Sheets[hit] : null;
  }

  function parseWorkbook(buf) {
    const XLSX = XL();
    const wb = XLSX.read(buf, { type: 'array' });
    const db = emptyDb();
    let repaired = false;

    // 1) raw read
    SHEETS.forEach((def) => {
      const ws = findSheet(wb, def.name);
      if (!ws) return;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      if (!rows.length) return;
      const headIdx = {};
      rows[0].forEach((h, i) => (headIdx[String(h).trim().toLowerCase()] = i));
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.every(isBlank)) continue;
        const obj = { _info: {} };
        def.cols.forEach((c) => {
          const raw = row[headIdx[c.h.toLowerCase()]];
          if (c.info) {
            if (!isBlank(raw)) obj._info[c.info] = String(raw).trim();
            return;
          }
          switch (c.t) {
            case 'num': case 'money': obj[c.k] = toNum(raw); break;
            case 'bool': obj[c.k] = toBool(raw, c.dflt === undefined ? true : c.dflt); break;
            case 'amounttype': obj[c.k] = /^var/i.test(String(raw)); break;
            case 'date': obj[c.k] = toISODate(raw); break;
            case 'period': obj[c.k] = toPeriod(raw); break;
            default: obj[c.k] = isBlank(raw) ? '' : String(raw).trim();
          }
        });
        db[def.key].push(obj);
      }
    });

    // 2) settings
    const sws = findSheet(wb, 'Settings');
    if (sws) {
      XLSX.utils.sheet_to_json(sws, { header: 1, raw: true, defval: '' }).slice(1).forEach(([k, v]) => {
        if (!isBlank(k) && !isBlank(v)) db.settings[String(k).trim().toLowerCase()] = String(v).trim();
      });
    }
    db.settings.currency = (db.settings.currency || 'USD').toUpperCase();

    // 3) ids for rows that lack one (e.g. rows typed by hand in Excel)
    if (!findSheet(wb, 'ExpenseTypes')) { db.expenseTypes = defaultTypes(); repaired = true; } // older workbook: seed the pick-list
    ['people', 'residences', 'expenseTypes', 'expenses', 'payments', 'settlements'].forEach((key) => {
      const taken = new Set(db[key].map((r) => r.id).filter(Boolean));
      const prefix = { people: 'p', residences: 'r', expenseTypes: 't', expenses: 'e', payments: 'pay', settlements: 's' }[key];
      db[key].forEach((r) => {
        if (!r.id) { r.id = uid(prefix, taken); repaired = true; }
      });
    });

    // 4) resolve references (id, else the informational name column, else a name typed in the id column)
    const nameKey = { people: 'name', residences: 'name', expenses: 'name' };
    const lookup = (coll, val) => {
      if (isBlank(val)) return '';
      const list = db[coll];
      let hit = list.find((x) => x.id === val);
      if (!hit) {
        const nk = nameKey[coll];
        hit = list.find((x) => String(x[nk]).toLowerCase() === String(val).toLowerCase());
      }
      return hit ? hit.id : '';
    };
    SHEETS.forEach((def) => {
      def.cols.filter((c) => c.ref).forEach((c) => {
        db[def.key].forEach((row) => {
          const before = row[c.k];
          let id = lookup(c.ref, before);
          if (!id && row._info[c.k]) id = lookup(c.ref, row._info[c.k]);
          if (id !== before) repaired = true;
          row[c.k] = id;
        });
      });
    });
    SHEETS.forEach((def) => db[def.key].forEach((r) => delete r._info));

    // 5) drop orphan rows and normalise defaults
    db.residents = db.residents.filter((r) => r.residenceId && r.personId);
    db.splits = db.splits.filter((r) => r.expenseId && r.personId);
    db.payments = db.payments.filter((p) => p.expenseId && p.period);
    db.settlements = db.settlements.filter((s) => s.fromId && s.toId && s.amount);
    db.people.forEach((p, i) => { if (!p.color) p.color = RT.PALETTE ? RT.PALETTE[i % RT.PALETTE.length] : '#4f7cff'; });
    db.residences.forEach((r) => {
      r.type = r.type || 'Apartment'; r.tenure = r.tenure || 'Renting';
      if (r.address && !r.address1) { r.address1 = r.address; repaired = true; } // migrate old single-line address
      delete r.address;
    });
    db.expenseTypes = db.expenseTypes.filter((t) => t.name);
    // Clean-up: an earlier version seeded a longer default list. Drop those untouched extras
    // (amount still 0) and make sure the four real defaults are there. Anything you added or edited stays.
    const oldExtras = new Set(['mortgage', 'property tax', 'hoa fees', 'home / renters insurance', "home / renter's insurance", 'parking', 'electricity', 'gas', 'water & sewer', 'trash & recycling', 'wi-fi / internet', 'streaming & subscriptions', 'groceries', 'maintenance & repairs']);
    const before = db.expenseTypes.length;
    db.expenseTypes = db.expenseTypes.filter((t) => !(oldExtras.has(t.name.toLowerCase()) && !t.amount));
    if (db.expenseTypes.length !== before) {
      const have = new Set(db.expenseTypes.map((t) => t.name.toLowerCase()));
      const taken = new Set(db.expenseTypes.map((t) => t.id));
      defaultTypes().filter((t) => !have.has(t.name.toLowerCase())).forEach((t) => { t.id = uid('t', taken); db.expenseTypes.push(t); });
      repaired = true;
    }
    db.expenseTypes.forEach((t) => { t.frequency = normChoice(t.frequency, ['Monthly', 'Quarterly', 'Yearly', 'One-time'], 'Monthly'); });
    db.expenses.forEach((e) => {
      if (e.variableLegacy) e.variable = true;
      delete e.variableLegacy;
      e.frequency = normChoice(e.frequency, ['Monthly', 'Quarterly', 'Yearly', 'One-time'], 'Monthly');
      e.splitMethod = normChoice(e.splitMethod, ['Equal', 'Percent', 'Shares', 'Fixed', 'Offset'], 'Equal');
    });
    db.payments.forEach((p) => { p.status = normChoice(p.status, ['Paid', 'Billed'], 'Paid'); });

    db._repaired = repaired;
    return db;
  }

  function normChoice(v, list, dflt) {
    const hit = list.find((x) => x.toLowerCase() === String(v || '').toLowerCase().replace(/\s+/g, '-').replace('onetime', 'one-time'));
    return hit || dflt;
  }

  /* ------------------------------------------------------------- serialize */

  /* Read-only report sheets, rewritten on every save and ignored on load. */
  function derivedSheets(db) {
    const C = RT.calc;
    if (!C) return [];
    const pName = (id) => (db.people.find((p) => p.id === id) || {}).name || '';
    const rName = (id) => (db.residences.find((r) => r.id === id) || {}).name || '';
    const people = [...db.people].sort((a, b) => a.name.localeCompare(b.name));

    const ledgerCols = [
      { h: 'Person', w: 20 }, { h: 'Date', t: 'date', w: 12 }, { h: 'Residence', w: 24 }, { h: 'Period', w: 9 },
      { h: 'LineItem', w: 34 }, { h: 'Type', w: 11 }, { h: 'BillTotal', t: 'money', w: 12 }, { h: 'PaidBy', w: 18 },
      { h: 'PersonShare', t: 'money', w: 13 }, { h: 'Effect', t: 'signed', w: 12 }, { h: 'RunningBalance', t: 'signed', w: 15 }, { h: 'Note', w: 30 },
    ];
    const ledgerRows = [];
    people.forEach((p) => {
      C.ledger(db, p.id, 'all').entries.forEach((en) => {
        if (en.kind === 'bill') {
          ledgerRows.push([p.name, en.date, rName(en.expense.residenceId), en.period, en.expense.name, 'Bill', en.total, pName(en.payerId), en.share, en.delta, en.running, en.payment.note || '']);
        } else {
          const s = en.settlement;
          ledgerRows.push([p.name, en.date, rName(s.residenceId) || 'All', '', `Settlement: ${pName(s.fromId)} to ${pName(s.toId)}`, 'Settlement', en.total, pName(s.fromId), '', en.delta, en.running, s.note || '']);
        }
      });
    });

    const balCols = [
      { h: 'Residence', w: 26 }, { h: 'Person', w: 20 }, { h: 'PaidOut', t: 'money', w: 12 }, { h: 'TheirShare', t: 'money', w: 12 },
      { h: 'SettledSent', t: 'money', w: 13 }, { h: 'SettledReceived', t: 'money', w: 15 }, { h: 'Net', t: 'signed', w: 12 }, { h: 'Status', w: 10 },
    ];
    const balRows = [];
    [['All residences', 'all'], ...db.residences.map((r) => [r.name, r.id])].forEach(([label, scope]) => {
      C.balances(db, scope)
        .filter((r) => r.paid || r.owed || r.sent || r.received)
        .sort((a, b) => pName(a.personId).localeCompare(pName(b.personId)))
        .forEach((r) => balRows.push([label, pName(r.personId), r.paid, r.owed, r.sent, r.received, r.net, r.net > 0.004 ? 'is owed' : r.net < -0.004 ? 'owes' : 'settled']));
    });

    return [{ name: 'Ledger', cols: ledgerCols, rows: ledgerRows }, { name: 'Balances', cols: balCols, rows: balRows }];
  }

  function buildSheet(cols, rows) {
    const XLSX = XL();
    const ws = {};
    cols.forEach((c, ci) => { ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { t: 's', v: c.h }; });
    rows.forEach((row, ri) => row.forEach((v, ci) => {
      if (v === '' || v === undefined || v === null) return;
      const c = cols[ci], addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      if (c.t === 'date') { const n = isoToSerial(v); if (n !== null) ws[addr] = { t: 'n', v: n, z: 'yyyy-mm-dd' }; }
      else if (c.t === 'money') ws[addr] = { t: 'n', v: Math.round(v * 100) / 100, z: '#,##0.00' };
      else if (c.t === 'signed') ws[addr] = { t: 'n', v: Math.round(v * 100) / 100, z: '#,##0.00;[Red]-#,##0.00' };
      else ws[addr] = { t: 's', v: String(v) };
    }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 0), c: cols.length - 1 } });
    ws['!cols'] = cols.map((c) => ({ wch: c.w || 12 }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    return ws;
  }

  function serializeWorkbook(db) {
    const XLSX = XL();
    const wb = XLSX.utils.book_new();

    // Info
    const infoWs = XLSX.utils.aoa_to_sheet(INFO_LINES);
    infoWs['!cols'] = [{ wch: 18 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, infoWs, 'Info');

    const nameOf = {
      people: (id) => (db.people.find((x) => x.id === id) || {}).name || '',
      residences: (id) => (db.residences.find((x) => x.id === id) || {}).name || '',
      expenses: (id) => (db.expenses.find((x) => x.id === id) || {}).name || '',
    };

    SHEETS.forEach((rawDef) => {
      const def = Object.assign({}, rawDef, { cols: rawDef.cols.filter((c) => !c.legacy) });
      const ws = {};
      const refOf = {};
      def.cols.forEach((c) => { if (c.ref) refOf[c.k] = c.ref; });

      def.cols.forEach((c, ci) => {
        ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { t: 's', v: c.h };
      });
      db[def.key].forEach((row, ri) => {
        def.cols.forEach((c, ci) => {
          const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
          if (c.info) {
            const name = nameOf[refOf[c.info]](row[c.info]);
            if (name) ws[addr] = { t: 's', v: name };
            return;
          }
          const v = row[c.k];
          if (v === undefined || v === null || v === '') return;
          switch (c.t) {
            case 'date': {
              const serial = isoToSerial(v);
              if (serial !== null) ws[addr] = { t: 'n', v: serial, z: 'yyyy-mm-dd' };
              break;
            }
            case 'money': ws[addr] = { t: 'n', v: Math.round(v * 100) / 100, z: '#,##0.00' }; break;
            case 'num': ws[addr] = { t: 'n', v: Number(v) }; break;
            case 'bool': ws[addr] = { t: 's', v: v ? 'Yes' : 'No' }; break;
            case 'amounttype': ws[addr] = { t: 's', v: v ? 'Variable' : 'Fixed' }; break;
            default: ws[addr] = { t: 's', v: String(v) };
          }
        });
      });
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(db[def.key].length, 0), c: def.cols.length - 1 } });
      ws['!cols'] = def.cols.map((c) => ({ wch: c.w || 12 }));
      ws['!autofilter'] = { ref: ws['!ref'] };
      XLSX.utils.book_append_sheet(wb, ws, def.name);
    });

    derivedSheets(db).forEach((d) => XLSX.utils.book_append_sheet(wb, buildSheet(d.cols, d.rows), d.name));

    const settingsWs = XLSX.utils.aoa_to_sheet([
      ['Key', 'Value'],
      ['Currency', db.settings.currency || 'USD'],
      ['SchemaVersion', '1'],
    ]);
    settingsWs['!cols'] = [{ wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, settingsWs, 'Settings');

    return XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  }

  /* ----------------------------------------------------- expense pick-list */

  // [name, category, variable?, frequency]
  const DEFAULT_TYPES = [
    ['Rent', 'Rent', false, 'Monthly'],
    ['Water', 'Utilities', true, 'Monthly'],
    ['Electric', 'Utilities', true, 'Monthly'],
    ['Wi-Fi', 'Internet', false, 'Monthly'],
  ];
  function defaultTypes() {
    const ids = new Set();
    return DEFAULT_TYPES.map(([name, category, variable, frequency]) => ({ id: uid('t', ids), name, category, variable, frequency, amount: 0 }));
  }
  function newDb() { const db = emptyDb(); db.expenseTypes = defaultTypes(); return db; }

  /* ----------------------------------------------------------- sample data */

  RT.PALETTE = ['#4f7cff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

  function sampleDb() {
    const C = RT.calc;
    const db = newDb();
    const ids = new Set();
    const mk = (p) => uid(p, ids);
    const today = C.todayISO();
    const thisPeriod = today.slice(0, 7);

    const [alex, jordan, sam, riley] = ['Alex Rivera', 'Jordan Lee', 'Sam Patel', 'Riley Chen'].map((name, i) => ({
      id: mk('p'), name, email: '', color: RT.PALETTE[i], active: true,
    }));
    db.people.push(alex, jordan, sam, riley);

    const apt = { id: mk('r'), name: 'Maple Street Apartment', type: 'Apartment', tenure: 'Renting', address1: '214 Maple St', address2: 'Unit 3B', city: 'Portland', state: 'OR', postalCode: '97205', country: 'USA', startDate: C.addMonthsISO(today, -14).slice(0, 8) + '01', endDate: '', notes: 'Lease renews each August.' };
    const house = { id: mk('r'), name: 'Lakeview House', type: 'House', tenure: 'Mortgage', address1: '88 Lakeview Dr', address2: '', city: 'Lake Oswego', state: 'OR', postalCode: '97034', country: 'USA', startDate: C.addMonthsISO(today, -26).slice(0, 8) + '01', endDate: '', notes: '30-year fixed.' };
    db.residences.push(apt, house);
    [alex, sam, riley].forEach((p) => db.residents.push({ residenceId: apt.id, personId: p.id }));
    [alex, jordan].forEach((p) => db.residents.push({ residenceId: house.id, personId: p.id }));

    const addExp = (res, name, category, amount, frequency, dueDay, paidBy, splitMethod, splitVals, extra = {}) => {
      const e = Object.assign({
        id: mk('e'), residenceId: res.id, name, category, amount, frequency, dueDay,
        startDate: res.startDate, endDate: '', paidById: paidBy.id, splitMethod, variable: false, active: true, notes: '',
      }, extra);
      db.expenses.push(e);
      splitVals.forEach(([p, v]) => db.splits.push({ expenseId: e.id, personId: p.id, value: v }));
      return e;
    };
    addExp(apt, 'Rent', 'Rent', 2400, 'Monthly', 1, alex, 'Percent', [[alex, 40], [sam, 30], [riley, 30]]);
    addExp(apt, 'Electric', 'Utilities', 95, 'Monthly', 15, sam, 'Equal', [[alex, 1], [sam, 1], [riley, 1]], { variable: true });
    addExp(apt, 'Water', 'Utilities', 48, 'Monthly', 20, riley, 'Equal', [[alex, 1], [sam, 1], [riley, 1]], { variable: true });
    addExp(apt, 'Wi-Fi', 'Internet', 70, 'Monthly', 10, alex, 'Equal', [[alex, 1], [sam, 1], [riley, 1]]);
    addExp(apt, 'Streaming bundle', 'Subscriptions', 22, 'Monthly', 5, sam, 'Equal', [[alex, 1], [sam, 1]]);
    addExp(apt, "Renter's insurance", 'Insurance', 216, 'Yearly', 1, alex, 'Equal', [[alex, 1], [sam, 1], [riley, 1]], { startDate: C.addMonthsISO(today, -3).slice(0, 8) + '01' });
    addExp(house, 'Mortgage', 'Mortgage', 1850, 'Monthly', 1, alex, 'Percent', [[alex, 60], [jordan, 40]]);
    addExp(house, 'Property tax', 'Taxes', 1200, 'Quarterly', 15, jordan, 'Percent', [[alex, 60], [jordan, 40]]);
    addExp(house, 'Trash & recycling', 'Utilities', 45, 'Monthly', 12, jordan, 'Equal', [[alex, 1], [jordan, 1]]);

    // Record the last few months as already paid (due dates in the past only)
    for (let back = 3; back >= 0; back--) {
      const period = C.addMonths(thisPeriod, -back);
      db.expenses.forEach((e, i) => {
        if (!C.isScheduled(e, period)) return;
        const due = C.dueDateFor(e, period);
        if (due >= today) return;
        const jitter = e.variable ? 1 + (((back * 7 + i * 13) % 11) - 5) / 50 : 1;
        db.payments.push({
          id: mk('pay'), expenseId: e.id, period, amount: Math.round(e.amount * jitter * 100) / 100,
          status: 'Paid', paidById: e.paidById, paidDate: due, note: '',
        });
      });
    }
    return db;
  }

  /* ---------------------------------------------------------- file linking */

  const XLSX_TYPES = [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];

  function idb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('residence-tracker', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function kvGet(key) {
    const d = await idb();
    return new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function kvSet(key, val) {
    const d = await idb();
    return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }
  async function kvDel(key) {
    const d = await idb();
    return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }

  const FileLink = {
    handle: null,
    name: '',
    lastModified: 0,

    supported() { return typeof window !== 'undefined' && 'showOpenFilePicker' in window; },
    get linked() { return !!this.handle; },

    async _perm(h, ask) {
      const opts = { mode: 'readwrite' };
      if ((await h.queryPermission(opts)) === 'granted') return true;
      return ask && (await h.requestPermission(opts)) === 'granted';
    },

    /** Pick an existing .xlsx and link to it. */
    async pickOpen() {
      const [h] = await window.showOpenFilePicker({ types: XLSX_TYPES, multiple: false });
      if (!(await this._perm(h, true))) throw new Error('Read/write permission was not granted for that file.');
      await this._adopt(h);
    },

    /** Pick a location for a brand-new workbook and link to it. */
    async pickCreate(suggestedName = 'Residence Tracker.xlsx') {
      const h = await window.showSaveFilePicker({ suggestedName, types: XLSX_TYPES });
      await this._adopt(h);
    },

    async _adopt(h) {
      this.handle = h;
      this.name = h.name;
      await kvSet('handle', h).catch(() => {});
    },

    /** On startup: find the previously linked file. Returns 'ready' | 'needs-permission' | 'none'. */
    async restore() {
      if (!this.supported()) return 'none';
      let h;
      try { h = await kvGet('handle'); } catch (e) { return 'none'; }
      if (!h) return 'none';
      this.handle = h;
      this.name = h.name;
      try {
        return (await this._perm(h, false)) ? 'ready' : 'needs-permission';
      } catch (e) { return 'none'; }
    },

    async reconnect() {
      if (!(await this._perm(this.handle, true))) throw new Error('Permission was not granted.');
    },

    async forget() {
      this.handle = null; this.name = ''; this.lastModified = 0;
      await kvDel('handle').catch(() => {});
    },

    async read() {
      const file = await this.handle.getFile();
      this.lastModified = file.lastModified;
      const buf = await file.arrayBuffer();
      if (!buf.byteLength) return null; // brand-new empty file
      return parseWorkbook(buf);
    },

    async write(db) {
      const data = serializeWorkbook(db);
      const w = await this.handle.createWritable();
      await w.write(data);
      await w.close();
      this.lastModified = (await this.handle.getFile()).lastModified;
    },

    async changedOnDisk() {
      if (!this.handle) return false;
      const f = await this.handle.getFile();
      return f.lastModified !== this.lastModified;
    },
  };

  RT.store = { SHEETS, emptyDb, parseWorkbook, serializeWorkbook, sampleDb, newDb, defaultTypes, uid, toISODate, toPeriod, isoToSerial };
  RT.FileLink = FileLink;
})(typeof window !== 'undefined' ? window : globalThis);
