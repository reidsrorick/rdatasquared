/* excel.js — Excel in and out. Exposed on window.BB.excel
   - importFiles: one-time read of the old Apartment Breakdown.xlsx / Expenses.xlsx
   - exportWorkbook / downloadExport: build a fresh .xlsx from the app's data
   The app's own storage is budget.json (see store.js); Excel is never written in place. */
(function () {
  "use strict";
  const model = window.BB.model;
  const schemas = model.schemas;

  // ---------------- import (legacy workbooks → rows) ----------------
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
  // recalculated, never imported)
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

  // files: { apartment?: File, expenses?: File } — either may be missing
  async function importFiles(files) {
    const wbs = {};
    for (const key of ["apartment", "expenses"]) {
      if (files[key]) wbs[key] = XLSX.read(await files[key].arrayBuffer(), { cellDates: true });
    }
    const rowsBySchema = { apartment: [], requests: [], subscriptions: [], thirdparty: [] };
    for (const [name, schema] of Object.entries(schemas)) {
      const wb = wbs[schema.file];
      if (!wb) continue;
      rowsBySchema[name] = parseSheet(wb.Sheets[schema.sheet])
        .map((r) => cleanRow(name, r))
        .filter((r) => Object.keys(r).length);
    }
    let links = [];
    if (wbs.apartment) {
      links = parseSheet(wbs.apartment.Sheets["Links"]).map((l) => {
        const o = {};
        for (const [k, v] of Object.entries(l)) if (v != null && v !== "") o[k] = String(v);
        return o;
      });
    }
    return { rowsBySchema, links };
  }

  // ---------------- export (rows → .xlsx) ----------------
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
    const header = [...schema.columns.map((c) => c.key), ...persist.map((c) => c.key)];
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
    const aoa = [["Month", "Reid", "Luke", "Total"]];
    sum.months.forEach((m) => aoa.push([m.label, m.reid, m.luke, m.total]));
    aoa.push(["Year total", sum.year.reid, sum.year.luke, sum.year.total]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    formatSheet(ws, ["text", "money", "money", "money"]);
    ws["!cols"] = widths(aoa[0], aoa);
    return ws;
  }

  // `lines` = Luke's apartment share by month (derived), counted under Friends/Family
  function owedSheet(rows, lines) {
    const sum = model.expenseSummary(rows, lines);
    const aoa = [["Who pays me back", "Pending", "Submitted", "Paid", "Still owed"]];
    model.EXPENSE_CATEGORIES.forEach((c) => {
      const b = sum.byCat[c];
      aoa.push([c, b.Pending, b.Submitted, b.Paid, b.outstanding]);
    });
    const t = sum.total;
    aoa.push(["Total", t.Pending, t.Submitted, t.Paid, t.outstanding]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    formatSheet(ws, ["text", "money", "money", "money", "money"]);

    // second table: Luke's apartment share, one row per month (it's inside Friends/Family above)
    if (lines && lines.length) {
      const start = aoa.length + 1; // leave a blank row
      const head = ["Apartment — Luke's share", "Amount", "Status", "Request sent", "Payment received"];
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

  function linksSheet(links) {
    const keys = [];
    links.forEach((l) => Object.keys(l).forEach((k) => keys.includes(k) || keys.push(k)));
    const header = keys.length ? keys : ["Place", "Link", "Purpose"];
    const aoa = [header, ...links.map((l) => header.map((k) => (l[k] == null ? null : l[k])))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths(header, aoa);
    return ws;
  }

  // S = { rows: {apartment, requests, subscriptions, thirdparty}, links }
  function exportWorkbook(S) {
    const wb = XLSX.utils.book_new();
    const add = (name, ws) => XLSX.utils.book_append_sheet(wb, ws, name);
    add("Data Entry", buildSheet(schemas.apartment, S.rows.apartment || []));
    add("Summary", summarySheet(S.rows.apartment || []));
    add("Requests", buildSheet(schemas.requests, S.rows.requests || []));
    add("Subscriptions-Bills", buildSheet(schemas.subscriptions, S.rows.subscriptions || []));
    add("Expense Tracker", buildSheet(schemas.thirdparty, S.rows.thirdparty || []));
    add("Owed Summary", owedSheet(S.rows.thirdparty || [], model.apartmentOwedLines(S.rows.apartment || [], S.rows.requests || [])));
    add("Links", linksSheet(S.links || []));
    return wb;
  }

  function exportName() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `Budget Export ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
  }

  function downloadExport(S) {
    const wb = exportWorkbook(S);
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array", cellDates: true });
    const name = exportName();
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  }

  window.BB.excel = { importFiles, exportWorkbook, downloadExport, exportName };
})();
