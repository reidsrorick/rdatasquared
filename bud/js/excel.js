/* excel.js — the budget workbook. Exposed on window.BB.excel
   - readWorkbook / writeWorkbook: budget.xlsx IS the app's saved file (data + settings)
   - importFiles: one-time read of the older Apartment Breakdown.xlsx / Expenses.xlsx
   - exportWorkbook / downloadExport: a spare copy to download */
(function () {
  "use strict";
  const model = window.BB.model;
  const schemas = model.schemas;

  // ---------------- reading ----------------
  function parseSheet(ws) {
    if (!ws) return [];
    const aoa = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      cellDates: true,
      defval: null,
      blankrows: false,
    });
    if (!aoa.length) return [];
    const headers = aoa[0].map((h) => (h == null ? "" : String(h).replace(/\s+/g, " ").trim()));
    const rows = [];
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i] || [];
      if (line.every((v) => v == null || v === "")) continue;
      const o = {};
      headers.forEach((h, idx) => {
        if (h) o[h] = line[idx] == null ? null : line[idx];
      });
      rows.push(o);
    }
    return rows;
  }

  // keep only the columns the app models, with clean types (computed split columns are
  // recalculated, never read back)
  function cleanRow(schemaName, raw) {
    const out = {};
    for (const c of schemas[schemaName].columns) {
      const v = raw[c.key];
      if (v == null || v === "") continue;
      if (c.type === "date") {
        const d = model.toDay(v);
        if (d) out[c.key] = d;
      } else if (c.type === "money" || c.type === "number") {
        const n = Number(v);
        if (!isNaN(n)) out[c.key] = n;
      } else if (c.type === "bool") {
        out[c.key] = v === false || /^(false|no|0)$/i.test(String(v)) ? false : !!v;
      } else {
        out[c.key] = String(v);
      }
    }
    return out;
  }

  // a schema's sheet, under its current name or the name older workbooks used
  const sheetFor = (wb, schema) =>
    [schema.sheet, ...(schema.altSheets || [])].map((n) => wb.Sheets[n]).find(Boolean) || null;

  const truthy = (v) => v === true || /^(true|yes|1|y)$/i.test(String(v == null ? "" : v).trim());

  function readLinks(wb) {
    return parseSheet(wb.Sheets["Links"]).map((l) => {
      const o = {};
      for (const [k, v] of Object.entries(l)) if (v != null && v !== "") o[k] = String(v);
      return o;
    });
  }

  // budget.xlsx → everything the app holds. `settings` is null for a workbook that has no
  // Settings sheet (the older two-file workbooks).
  function readWorkbook(buf) {
    let wb;
    try {
      wb = XLSX.read(buf, { cellDates: true });
    } catch (e) {
      throw new Error("budget.xlsx couldn't be read — nothing was changed.");
    }
    const rowsBySchema = {};
    for (const [name, schema] of Object.entries(schemas)) {
      rowsBySchema[name] = parseSheet(sheetFor(wb, schema))
        .map((r) => cleanRow(name, r))
        .filter((r) => Object.keys(r).length);
    }
    const groups = parseSheet(wb.Sheets["Groups"])
      .map((r) => String(r.Group == null ? "" : r.Group).trim())
      .filter(Boolean);

    let settings = null;
    const migrations = {};
    if (wb.Sheets["Settings"]) {
      const kv = {};
      parseSheet(wb.Sheets["Settings"]).forEach((r) => {
        const k = String(r.Setting == null ? "" : r.Setting).trim();
        if (!k) return;
        if (k.startsWith("migration:")) {
          if (truthy(r.Value)) migrations[k.slice(10)] = true;
        } else kv[k] = r.Value;
      });
      const methodId = (txt) => {
        const t = String(txt == null ? "" : txt).trim().toLowerCase();
        const hit = model.RULE_METHODS.find((m) => m.id === t || m.label.toLowerCase() === t);
        return hit ? hit.id : "equal";
      };
      settings = model.normalizeSettings({
        setupDone: truthy(kv.setupDone),
        me: kv.me,
        partner: kv.partner,
        sharedEnabled: truthy(kv.sharedEnabled),
        sharedLabel: kv.sharedLabel,
        sharedCategory: kv.sharedCategory,
        categories: parseSheet(wb.Sheets["Categories"]).map((r) => r.Category),
        rules: parseSheet(wb.Sheets["Split Rules"]).map((r) => ({
          item: r.Item,
          method: methodId(r.Rule),
          value: r["Amount or %"],
          label: r["Shown as"],
          up: truthy(r["Round each share up"]),
        })),
      });
    }
    return { rowsBySchema, links: readLinks(wb), groups, settings, migrations };
  }

  // files: { apartment?: File, expenses?: File } — either may be missing (the older workbooks)
  async function importFiles(files) {
    const wbs = {};
    for (const key of ["apartment", "expenses"]) {
      if (files[key]) wbs[key] = XLSX.read(await files[key].arrayBuffer(), { cellDates: true });
    }
    const rowsBySchema = { apartment: [], requests: [], subscriptions: [], thirdparty: [] };
    for (const [name, schema] of Object.entries(schemas)) {
      const wb = wbs[schema.file];
      if (!wb) continue;
      rowsBySchema[name] = parseSheet(sheetFor(wb, schema))
        .map((r) => cleanRow(name, r))
        .filter((r) => Object.keys(r).length);
    }
    const links = wbs.apartment ? readLinks(wbs.apartment) : [];
    return { rowsBySchema, links };
  }

  // ---------------- writing ----------------
  function toCell(val, type) {
    if (val == null || val === "") return null;
    if (type === "date") return model.toDate(val) || null;
    if (type === "money" || type === "number") {
      const n = Number(val);
      return isNaN(n) ? null : n;
    }
    if (type === "bool") return !!val;
    return String(val);
  }

  const DATE_FMT = "m/d/yyyy";
  const MONEY_FMT = "$#,##0.00";

  // apply number formats by column type, skipping the header row
  function formatSheet(ws, colTypes) {
    if (!ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = 0; c <= range.e.c; c++) {
      const z =
        colTypes[c] === "date" ? DATE_FMT : colTypes[c] === "month" ? "mmm yyyy" : colTypes[c] === "money" ? MONEY_FMT : null;
      if (!z) continue;
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v != null && cell.v !== "") cell.z = z;
      }
    }
  }

  function widths(header, aoa) {
    return header.map((h, i) => {
      let w = String(h).length;
      for (let r = 1; r < Math.min(aoa.length, 60); r++) {
        const v = aoa[r][i];
        const len = v instanceof Date ? 10 : v == null ? 0 : String(v).length;
        if (len > w) w = len;
      }
      return { wch: Math.min(60, Math.max(10, w + 2)) };
    });
  }

  // one worksheet for a table schema (stored columns + persisted computed ones)
  function buildSheet(schema, rows) {
    const persist = (schema.computed || []).filter((c) => c.persist);
    const header = [...schema.columns.map((c) => c.key), ...persist.map((c) => c.label)];
    const aoa = [header];
    for (const r of rows) {
      const line = schema.columns.map((c) => toCell(r[c.key], c.type));
      for (const c of persist) line.push(c.calc(r)); // raw precision; cell format shows 2dp
      aoa.push(line);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    formatSheet(ws, [...schema.columns.map((c) => (c.month ? "month" : c.type)), ...persist.map(() => "money")]);
    ws["!cols"] = widths(header, aoa);
    return ws;
  }

  function summarySheet(rows) {
    const sum = model.summarize(rows);
    const aoa = [["Month", model.meName(), model.partnerName(), "Total"]];
    sum.months.forEach((m) => aoa.push([m.label, m.me, m.other, m.total]));
    aoa.push(["Year total", sum.year.me, sum.year.other, sum.year.total]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    formatSheet(ws, ["text", "money", "money", "money"]);
    ws["!cols"] = widths(aoa[0], aoa);
    return ws;
  }

  // `lines` = the other person's shared-bill months (derived), counted under the shared category
  function owedSheet(rows, lines) {
    const sum = model.expenseSummary(rows, lines);
    const aoa = [["Who pays me back", "Pending", "Submitted", "Paid", "Still owed"]];
    sum.cats.forEach((c) => {
      const b = sum.byCat[c];
      aoa.push([c, b.Pending, b.Submitted, b.Paid, b.outstanding]);
    });
    const t = sum.total;
    aoa.push(["Total", t.Pending, t.Submitted, t.Paid, t.outstanding]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    formatSheet(ws, ["text", "money", "money", "money", "money"]);

    if (lines && lines.length) {
      const start = aoa.length + 1; // leave a blank row
      const head = [`${model.sharedLabel()} — ${model.partnerName()}'s share`, "Amount", "Status", "Request sent", "Payment received"];
      const block = [head, ...lines.map((l) => [l.label, l.amount, l.status, model.toDate(l.sentOn) || null, model.toDate(l.paidOn) || null])];
      XLSX.utils.sheet_add_aoa(ws, block, { origin: { r: start, c: 0 }, cellDates: true });
      block.forEach((row, i) => {
        if (i === 0) return;
        const set = (c, z) => {
          const cell = ws[XLSX.utils.encode_cell({ r: start + i, c })];
          if (cell && cell.v != null) cell.z = z;
        };
        set(1, MONEY_FMT);
        set(3, DATE_FMT);
        set(4, DATE_FMT);
      });
      aoa.push([], ...block); // keeps column-width sizing aware of the second table
    }
    ws["!cols"] = widths(aoa[0], aoa);
    return ws;
  }

  // one row per group: how many expenses, the total, how much came back, what's still owed
  function tripsSheet(rows, saved) {
    const names = model.orderGroups(rows, model.groupNames(rows, saved));
    if (!names.length) return null;
    const aoa = [["Group", "Items", "Total", "Paid back", "Still owed"]];
    names.forEach((g) => {
      const rs = rows.filter((r) => model.inGroup(r, g));
      const t = model.expenseSummary(rs).total;
      aoa.push([g, rs.length, t.Pending + t.Submitted + t.Paid, t.Paid, t.outstanding]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    formatSheet(ws, ["text", "number", "money", "money", "money"]);
    ws["!cols"] = widths(aoa[0], aoa);
    return ws;
  }

  function linksSheet(links) {
    const keys = [];
    links.forEach((l) => Object.keys(l).forEach((k) => keys.includes(k) || keys.push(k)));
    const header = keys.length ? keys : ["Place", "Link", "Purpose"];
    const aoa = [header, ...links.map((l) => header.map((k) => (l[k] == null ? null : l[k])))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths(header, aoa);
    return ws;
  }

  // the settings that make the numbers come out the way they do
  function settingsSheets(S) {
    const cfg = S.settings || model.blankSettings();
    const kv = [
      ["Setting", "Value"],
      ["setupDone", !!cfg.setupDone],
      ["me", cfg.me || ""],
      ["partner", cfg.partner || ""],
      ["sharedEnabled", !!cfg.sharedEnabled],
      ["sharedLabel", cfg.sharedLabel || ""],
      ["sharedCategory", cfg.sharedCategory || ""],
    ];
    Object.keys(S.migrations || {}).forEach((k) => S.migrations[k] && kv.push([`migration:${k}`, true]));
    const settings = XLSX.utils.aoa_to_sheet(kv);
    settings["!cols"] = [{ wch: 30 }, { wch: 30 }];

    const label = (id) => (model.RULE_METHODS.find((m) => m.id === id) || model.RULE_METHODS[0]).label;
    const rules = [["Item", "Rule", "Amount or %", "Shown as", "Round each share up"]].concat(
      cfg.rules.map((r) => [r.item, label(r.method), r.value, r.label || null, r.up ? true : null])
    );
    const rulesWs = XLSX.utils.aoa_to_sheet(rules);
    rulesWs["!cols"] = widths(rules[0], rules);

    const cats = [["Category"], ...cfg.categories.map((c) => [c])];
    const catsWs = XLSX.utils.aoa_to_sheet(cats);
    catsWs["!cols"] = [{ wch: 28 }];

    const grp = [["Group"], ...(S.groups || []).map((g) => [String(g).trim()]).filter((r) => r[0])];
    const grpWs = XLSX.utils.aoa_to_sheet(grp);
    grpWs["!cols"] = [{ wch: 34 }];
    return { settings, rulesWs, catsWs, grpWs };
  }

  function aboutSheet() {
    const lines = [
      ["Budget workbook"],
      ["This file is the saved copy of your budget. The app reads it when you open your folder and writes every change straight back."],
      [""],
      ["You can edit these sheets in Excel (close the file in Excel before using the app):"],
      ["  Shared Bills, Requests, Subscriptions-Bills, Expense Tracker, Links, Groups, Split Rules, Categories, Settings"],
      ["Rewritten on every save, so edits to them are overwritten:"],
      ["  Summary, Owed Summary, Trips, About"],
      [""],
      ["Split Rules: Rule is one of Split equally, I pay all, They pay all, I pay a percentage, Equal but I pay more or less, I pay a fixed amount."],
      ["Anything without a rule is split in half."],
    ];
    const ws = XLSX.utils.aoa_to_sheet(lines);
    ws["!cols"] = [{ wch: 120 }];
    return ws;
  }

  // S = { rows, links, groups, settings, migrations }
  function buildWorkbook(S) {
    const wb = XLSX.utils.book_new();
    const add = (name, ws) => XLSX.utils.book_append_sheet(wb, ws, name);
    const rows = S.rows || {};
    add(schemas.apartment.sheet, buildSheet(schemas.apartment, rows.apartment || []));
    add("Summary", summarySheet(rows.apartment || []));
    add("Requests", buildSheet(schemas.requests, rows.requests || []));
    add("Subscriptions-Bills", buildSheet(schemas.subscriptions, rows.subscriptions || []));
    add(schemas.thirdparty.sheet, buildSheet(schemas.thirdparty, rows.thirdparty || []));
    add("Owed Summary", owedSheet(rows.thirdparty || [], model.apartmentOwedLines(rows.apartment || [], rows.requests || [])));
    const trips = tripsSheet(rows.thirdparty || [], S.groups || []);
    if (trips) add("Trips", trips);
    add("Links", linksSheet(S.links || []));
    const st = settingsSheets(S);
    add("Groups", st.grpWs);
    add("Split Rules", st.rulesWs);
    add("Categories", st.catsWs);
    add("Settings", st.settings);
    add("About", aboutSheet());
    return wb;
  }

  // the bytes of budget.xlsx
  function writeWorkbook(S) {
    return XLSX.write(buildWorkbook(S), { bookType: "xlsx", type: "array", cellDates: true });
  }

  function exportName() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `Budget Export ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
  }

  function saveBlob(bytes, name) {
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // a dated spare copy
  function downloadExport(S) {
    const name = exportName();
    saveBlob(writeWorkbook(S), name);
    return name;
  }

  window.BB.excel = { readWorkbook, writeWorkbook, importFiles, buildWorkbook, downloadExport, exportName, saveBlob };
})();
