/* Car Tracker
 * The Excel file is the only storage. The app reads the sheets "Cars" and
 * "Maintenance" on open and writes the whole workbook back to the same file
 * after every change.
 */
(() => {
  'use strict';

  const CARS_SHEET = 'Cars';
  const MAINT_SHEET = 'Maintenance';
  const CURRENCY = '$';
  const OWNERSHIP = ['Cash', 'Finance', 'Lease'];
  const NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles';   // free US government VIN / model data, no key needed
  const COMMON_MAKES = ['Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Mazda', 'Mercedes-Benz', 'Mercury', 'Mini', 'Mitsubishi', 'Nissan', 'Pontiac', 'Polestar', 'Porsche', 'Ram', 'Rivian', 'Saab', 'Saturn', 'Scion', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'];
  const COMMON_COLORS = ['Black', 'White', 'Pearl White', 'Silver', 'Gray', 'Charcoal', 'Blue', 'Dark Blue', 'Red', 'Maroon', 'Green', 'Dark Green', 'Brown', 'Beige', 'Tan', 'Gold', 'Orange', 'Yellow', 'Purple'];
  const DISPOSED = ['Sold', 'Traded In', 'Donated', 'Gifted', 'Scrapped', 'Lease Returned'];
  const STATUSES = ['For Sale', ...DISPOSED];   // blank = still owned

  // ---- Field definitions: this is also the column order in the spreadsheet ----
  const SECTIONS = [
    { title: 'Identity', fields: [
      { key: 'nickname',   label: 'Nickname',         type: 'text' },
      { key: 'plate',      label: 'Licence Plate',    type: 'text', upper: true },
      { key: 'plateState', label: 'State / Province', type: 'text', upper: true },
      { key: 'vin',        label: 'VIN',              type: 'text', upper: true, maxlength: 17 },
    ]},
    { title: 'Vehicle', fields: [
      { key: 'year',  label: 'Year',  type: 'number', min: 1900, max: 2100 },
      { key: 'make',  label: 'Make',  type: 'text', list: 'dl_make' },
      { key: 'model', label: 'Model', type: 'text', list: 'dl_model' },
      { key: 'trim',  label: 'Trim',  type: 'text', list: 'dl_trim' },
      { key: 'color', label: 'Color', type: 'text', list: 'dl_color' },
      { key: 'miles', label: 'Miles (odometer)', type: 'number', min: 0, fmt: 'int' },
    ]},
    // `only` = field is shown just for those ownership types (values are kept when hidden)
    { title: 'Purchase & payment', summary: 'pay', fields: [
      { key: 'ownership',      label: 'Ownership Type',          type: 'select', options: OWNERSHIP },
      { key: 'purchaseDate',   label: 'Purchase / Start Date',   type: 'date' },
      { key: 'purchasePrice',  label: 'Purchase Price',          type: 'number', min: 0, step: 'any', fmt: 'money' },
      { key: 'downPayment',    label: 'Down Payment / Due at Signing', type: 'number', min: 0, step: 'any', fmt: 'money', only: ['Finance', 'Lease'] },
      { key: 'monthlyPayment', label: 'Monthly Payment',         type: 'number', min: 0, step: 'any', fmt: 'money', only: ['Finance', 'Lease'] },
      { key: 'lender',         label: 'Lender / Leasing Company', type: 'text', only: ['Finance', 'Lease'] },
      { key: 'accountNo',      label: 'Loan / Lease Account #',  type: 'text', only: ['Finance', 'Lease'] },
      { key: 'loanAmount',     label: 'Amount Financed',         type: 'number', min: 0, step: 'any', fmt: 'money', only: ['Finance'] },
      { key: 'apr',            label: 'APR (%)',                 type: 'number', min: 0, step: 'any', fmt: 'dec', only: ['Finance'] },
      { key: 'termMonths',     label: 'Term (months)',           type: 'number', min: 1, step: 1, fmt: 'int0', only: ['Finance', 'Lease'] },
      { key: 'firstPayment',   label: 'First Payment Date',      type: 'date', only: ['Finance', 'Lease'] },
      { key: 'leaseEnd',       label: 'Lease End Date',          type: 'date', only: ['Lease'] },
      { key: 'milesPerYear',   label: 'Miles Allowed per Year',  type: 'number', min: 0, fmt: 'int', only: ['Lease'] },
      { key: 'overageFee',     label: 'Overage Fee per Mile',    type: 'number', min: 0, step: 'any', fmt: 'money', only: ['Lease'] },
      { key: 'residual',       label: 'Residual / Buyout Price', type: 'number', min: 0, step: 'any', fmt: 'money', only: ['Lease'] },
      { key: 'moneyFactor',    label: 'Money Factor',            type: 'number', min: 0, step: 'any', only: ['Lease'] },
    ]},
    { title: 'Status & disposal', summary: 'status', fields: [
      { key: 'status',         label: 'Status',                  type: 'select', options: STATUSES, blankLabel: 'Active (I own it)' },
      { key: 'askingPrice',    label: 'Asking Price',            type: 'number', min: 0, step: 'any', fmt: 'money', by: 'status', only: ['For Sale'] },
      { key: 'disposalDate',   label: 'Date Sold / Disposed',    type: 'date', by: 'status', only: DISPOSED },
      { key: 'salePrice',      label: 'Sale / Trade-in Value',   type: 'number', min: 0, step: 'any', fmt: 'money', by: 'status', only: DISPOSED },
      { key: 'buyer',          label: 'Sold / Traded To',        type: 'text', by: 'status', only: DISPOSED },
      { key: 'disposalMiles',  label: 'Odometer at Disposal',    type: 'number', min: 0, fmt: 'int', by: 'status', only: DISPOSED },
    ]},
    { title: 'Paperwork & insurance', fields: [
      { key: 'regExpiry',     label: 'Registration Expires', type: 'date' },
      { key: 'insurer',       label: 'Insurance Provider',   type: 'text' },
      { key: 'policyNo',      label: 'Policy #',             type: 'text' },
    ]},
    { title: 'Reminders & specs', fields: [
      { key: 'nextServiceMiles', label: 'Next Service At (miles)', type: 'number', min: 0, fmt: 'int' },
      { key: 'tireSize',         label: 'Tire Size',               type: 'text' },
    ]},
    { title: 'Notes', fields: [
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ]},
  ];
  const FIELDS = SECTIONS.flatMap(s => s.fields);
  const LABEL_TO_KEY = Object.fromEntries(FIELDS.map(f => [f.label, f.key]));

  // Maintenance line items (sheet "Maintenance"; first column is "Vehicle")
  const MAINT_FIELDS = [
    { key: 'date',    label: 'Date',        type: 'date' },
    { key: 'miles',   label: 'Miles',       type: 'number' },
    { key: 'service', label: 'Service',     type: 'text' },
    { key: 'cost',    label: 'Cost',        type: 'number' },
    { key: 'shop',    label: 'Shop / Who',  type: 'text' },
    { key: 'notes',   label: 'Notes',       type: 'text' },
  ];

  // ---- State ----
  let cars = [];            // [{ ...fieldValues, log: [maintenanceItems], __extra }]
  let orphans = [];         // maintenance rows whose Vehicle matches no car (kept as-is)
  let extraHeaders = [];    // columns in "Cars" this app doesn't know about
  let workbook = null;      // kept so other sheets in the file survive a save
  let fileHandle = null;
  let fileName = '';
  let selected = -1;
  let activeTab = 'details';
  let saveTimer = null;
  let saving = Promise.resolve();
  const hasFSA = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const el = {
    status: $('fileStatus'), chip: $('statusChip'), banner: $('banner'), toast: $('toast'),
    btnOpen: $('btnOpen'), btnNew: $('btnNew'), btnReload: $('btnReload'), btnReconnect: $('btnReconnect'),
    btnImport: $('btnImport'), btnDownload: $('btnDownload'), fileInput: $('fileInput'),
    btnAdd: $('btnAdd'), list: $('carList'), welcome: $('welcome'), carView: $('carView'),
    header: $('carHeader'), stats: $('stats'), tabDetails: $('tabDetails'), tabMaint: $('tabMaint'),
    maintCount: $('maintCount'),
  };
  const show = (node, on) => node.classList.toggle('hidden', !on);

  // ---- Small helpers ----
  function setStatus(text, kind = '') {
    el.status.textContent = text;
    el.chip.className = 'status-chip ' + kind;
  }
  function showBanner(text, isError = false) {
    el.banner.textContent = text;
    el.banner.className = 'banner' + (isError ? ' error' : '');
  }
  const hideBanner = () => { el.banner.className = 'banner hidden'; };
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2600);
  }

  const has = v => v !== '' && v != null;
  const ymm = c => [c.year, c.make, c.model].filter(has).join(' ');
  const carTitle = c => c.nickname || ymm(c) || 'New vehicle';
  const carSub = c => {
    const bits = [];
    if (c.nickname && ymm(c)) bits.push(ymm(c));
    if (c.plate) bits.push(c.plate);
    if (c.status) bits.push(c.status);
    return bits.join(' · ');
  };
  const fmtNum = n => Number(n).toLocaleString();
  const fmtMoney = n => CURRENCY + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function daysUntil(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((parseISO(iso) - t) / 86400000);
  }

  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const validISO = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function addMonths(d, k) {
    const t = new Date(d.getFullYear(), d.getMonth() + k, 1);
    const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(d.getDate(), dim));
    return t;
  }
  function durationText(aISO, bISO) {
    if (!validISO(aISO) || !validISO(bISO)) return '';
    const a = parseISO(aISO), b = parseISO(bISO);
    const total = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
    if (total < 0) return '';
    const y = Math.floor(total / 12), m = total % 12;
    return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(' ') || 'under 1 mo';
  }
  const isDisposed = c => DISPOSED.includes(c.status);
  const signedMoney = n => (n < 0 ? '−' : '+') + fmtMoney(Math.abs(n));

  // Loan / lease maths (estimates from the numbers entered)
  function paymentsMade(firstISO, n) {
    if (!validISO(firstISO) || !has(n) || n < 1) return null;
    const first = parseISO(firstISO), t = new Date(); t.setHours(0, 0, 0, 0);
    let k = 0;
    while (k < n && addMonths(first, k) <= t) k++;
    return k;
  }
  function loanInfo(c) {
    const n = has(c.termMonths) && c.termMonths > 0 ? c.termMonths : null;
    const P = has(c.loanAmount) ? c.loanAmount : null;
    const r = (has(c.apr) ? c.apr : 0) / 1200;
    const isFin = c.ownership === 'Finance';
    let calcM = null;
    if (isFin && P != null && n) calcM = r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
    const M = has(c.monthlyPayment) ? c.monthlyPayment : calcM;
    const k = n ? paymentsMade(c.firstPayment, n) : null;
    let balance = null;
    if (isFin && P != null && M != null && k != null) {
      balance = k >= n ? 0 : Math.max(0, r ? P * Math.pow(1 + r, k) - M * (Math.pow(1 + r, k) - 1) / r : P - M * k);
    }
    return {
      n, P, M, calcM, k, balance,
      remaining: k != null ? n - k : null,
      payoff: n && validISO(c.firstPayment) ? addMonths(parseISO(c.firstPayment), n - 1) : null,
      interest: isFin && P != null && M != null && n ? Math.max(0, M * n - P) : null,
    };
  }

  const blankItem = () => Object.fromEntries(MAINT_FIELDS.map(f => [f.key, '']));
  const blankCar = () => ({ ...Object.fromEntries(FIELDS.map(f => [f.key, ''])), log: [], __extra: {} });

  // Vehicle label used in the Maintenance sheet to link rows to cars (made unique)
  function vehicleLabels() {
    const base = cars.map(carTitle);
    return base.map((t, i) => {
      if (base.filter(x => x === t).length === 1) return t;
      const c = cars[i];
      return `${t} (${c.plate || '#' + (i + 1)})`;
    });
  }

  // ---- Sheet <-> data ----
  function normalize(field, value) {
    if (value === '' || value == null) return '';
    if (field.type === 'number') {
      const n = typeof value === 'number' ? value : Number(String(value).replace(/[, $]/g, ''));
      return Number.isFinite(n) ? n : '';
    }
    if (field.type === 'date') {
      if (typeof value === 'number') {   // Excel serial date
        return new Date(Math.floor(value - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      }
      const s = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);            // e.g. "3/14/2025" typed as text in Excel
      return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return String(value);
  }

  function readCars(wb) {
    const name = wb.SheetNames.includes(CARS_SHEET) ? CARS_SHEET : wb.SheetNames.find(n => n !== MAINT_SHEET);
    const ws = name && wb.Sheets[name];
    if (!ws) return { rows: [], extras: [] };
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    const extras = [];
    const rows = raw.map(r => {
      const car = blankCar();
      for (const [header, value] of Object.entries(r)) {
        const key = LABEL_TO_KEY[header.trim()];
        if (key) {
          car[key] = normalize(FIELDS.find(f => f.key === key), value);
        } else if (header.trim() && !header.startsWith('__EMPTY')) {
          car.__extra[header] = value;
          if (!extras.includes(header)) extras.push(header);
        }
      }
      return car;
    }).filter(c => FIELDS.some(f => c[f.key] !== '') || Object.values(c.__extra).some(v => v !== ''));
    return { rows, extras };
  }

  function readMaintenance(wb) {
    orphans = [];
    const ws = wb.Sheets[MAINT_SHEET];
    if (!ws) return;
    const labels = vehicleLabels();
    for (const r of XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })) {
      const vehicle = String(r['Vehicle'] ?? '').trim();
      const item = blankItem();
      for (const f of MAINT_FIELDS) item[f.key] = normalize(f, r[f.label]);
      if (!MAINT_FIELDS.some(f => item[f.key] !== '')) continue;   // blank row
      const idx = labels.indexOf(vehicle);
      if (idx >= 0) cars[idx].log.push(item);
      else orphans.push({ vehicle, item });
    }
  }

  function loadWorkbookData(buf) {
    workbook = XLSX.read(buf, { type: 'array' });
    const { rows, extras } = readCars(workbook);
    cars = rows;
    extraHeaders = extras;
    readMaintenance(workbook);
    selected = cars.length ? 0 : -1;
    if (orphans.length) {
      showBanner(`${orphans.length} row(s) on the Maintenance sheet name a vehicle that isn't on the Cars sheet. They're kept in the file but not shown here.`);
    }
  }

  function applyFormat(ws, col, fmt, nRows) {
    for (let r = 1; r <= nRows; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
      if (cell && cell.t === 'n') cell.z = fmt;
    }
  }
  const autoWidths = (headers, rows) => headers.map((h, i) => ({
    wch: Math.min(Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)) + 2, 50),
  }));

  function buildWorkbook() {
    // Cars sheet
    const headers = [...FIELDS.map(f => f.label), ...extraHeaders];
    const rows = cars.map(c => [
      ...FIELDS.map(f => c[f.key]),
      ...extraHeaders.map(h => (h in c.__extra ? c.__extra[h] : '')),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = autoWidths(headers, rows);
    const FMT = { int: '#,##0', int0: '0', dec: '0.00##', money: CURRENCY + '#,##0.00' };
    FIELDS.forEach((f, i) => { if (f.fmt) applyFormat(ws, i, FMT[f.fmt], rows.length); });

    // Maintenance sheet: one row per line item, grouped by vehicle, oldest first
    const labels = vehicleLabels();
    const mHeaders = ['Vehicle', ...MAINT_FIELDS.map(f => f.label)];
    const mRows = [];
    cars.forEach((c, i) => {
      const sorted = c.log.map((it, n) => ({ it, n })).sort((a, b) => (a.it.date || '9999').localeCompare(b.it.date || '9999') || a.n - b.n);
      for (const { it } of sorted) mRows.push([labels[i], ...MAINT_FIELDS.map(f => it[f.key])]);
    });
    for (const o of orphans) mRows.push([o.vehicle, ...MAINT_FIELDS.map(f => o.item[f.key])]);
    const mws = XLSX.utils.aoa_to_sheet([mHeaders, ...mRows]);
    mws['!cols'] = autoWidths(mHeaders, mRows);
    applyFormat(mws, 2, '#,##0', mRows.length);
    applyFormat(mws, 4, CURRENCY + '#,##0.00', mRows.length);

    const wb = workbook || XLSX.utils.book_new();
    for (const [name, sheet] of [[CARS_SHEET, ws], [MAINT_SHEET, mws]]) {
      if (wb.Sheets[name]) wb.Sheets[name] = sheet;
      else XLSX.utils.book_append_sheet(wb, sheet, name);
    }
    workbook = wb;
    return wb;
  }

  // ---- File access (File System Access API) ----
  const FILE_TYPES = [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];

  // Remember the chosen file across visits (handles can be stored in IndexedDB)
  const idb = {
    open: () => new Promise((res, rej) => {
      const r = indexedDB.open('car-tracker', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }),
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };

  async function readFromHandle() {
    const file = await fileHandle.getFile();
    loadWorkbookData(await file.arrayBuffer());
    fileName = file.name;
  }

  async function connect(handle, { isNew = false } = {}) {
    fileHandle = handle;
    fileName = handle.name;
    // Remembering the file is optional; never let it block or break connecting.
    try { await Promise.race([idb.set('handle', handle), new Promise(r => setTimeout(r, 1500))]); } catch { /* ignore */ }
    if (isNew) {
      workbook = null; cars = []; orphans = []; extraHeaders = []; selected = -1;
      await writeNow();
    } else {
      await readFromHandle();
    }
    enterConnectedState();
  }

  async function ensurePermission(handle, request) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return request && (await handle.requestPermission(opts)) === 'granted';
  }

  function enterConnectedState() {
    if (!orphans.length) hideBanner();
    show(el.btnReconnect, false);
    show(el.btnReload, !!fileHandle);
    show(el.btnOpen, true); show(el.btnNew, true);
    el.btnAdd.disabled = false;
    setStatus(`${fileName} · saved`, 'ok');
    render();
  }

  async function openExisting() {
    try {
      const [h] = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
      if (!(await ensurePermission(h, true))) { showBanner('Permission to edit the file was not granted.', true); return; }
      await connect(h);
    } catch (e) { if (e.name !== 'AbortError') fail(e); }
  }

  async function createNew() {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: 'My Car.xlsx', types: FILE_TYPES });
      await connect(h, { isNew: true });
    } catch (e) { if (e.name !== 'AbortError') fail(e); }
  }

  async function reload() {
    if (!fileHandle) return;
    clearTimeout(saveTimer);
    try {
      await readFromHandle();
      enterConnectedState();
      toast('Reloaded from file');
    } catch (e) { fail(e); }
  }

  async function restoreSession() {
    if (!hasFSA) return;
    let h;
    try { h = await Promise.race([idb.get('handle'), new Promise(r => setTimeout(r, 1500))]); } catch { return; }
    if (!h) return;
    fileHandle = h;
    fileName = h.name;
    try {
      if (await ensurePermission(h, false)) {
        await readFromHandle();
        enterConnectedState();
      } else {
        setStatus(`${h.name} · click Reconnect`, 'busy');
        show(el.btnReconnect, true);
      }
    } catch (e) {
      fileHandle = null;
      setStatus('No spreadsheet connected');
    }
  }

  async function reconnect() {
    try {
      if (!(await ensurePermission(fileHandle, true))) { showBanner('Permission to edit the file was not granted.', true); return; }
      await readFromHandle();
      enterConnectedState();
    } catch (e) { fail(e); }
  }

  // ---- Saving ----
  function scheduleSave() {
    if (!fileHandle) return;     // fallback mode: changes live in memory until Download
    setStatus(`${fileName} · saving…`, 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; saving = saving.then(writeNow); }, 500);
  }

  async function writeNow() {
    const wb = buildWorkbook();
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    if (!fileHandle) return;
    try {
      const w = await fileHandle.createWritable();
      await w.write(data);
      await w.close();
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setStatus(`${fileName} · saved ${t}`, 'ok');
      if (!orphans.length) hideBanner();
    } catch (e) {
      setStatus(`${fileName} · NOT saved`, 'err');
      if (e.name === 'NoModificationAllowedError' || /lock|being used|modif/i.test(e.message)) {
        showBanner('Could not save: the file is probably open in Excel. Close it there, then change something here again to retry.', true);
      } else {
        showBanner('Could not save: ' + e.message, true);
      }
    }
  }

  function fail(e) {
    console.error(e);
    showBanner('Something went wrong: ' + (e.message || e), true);
  }

  // ---- Fallback for browsers without file access ----
  function setupFallback() {
    show(el.btnOpen, false);
    show(el.btnNew, false);
    show(el.btnImport, true);
    show(el.btnDownload, true);
    el.btnAdd.disabled = false;
    showBanner("This browser can't edit a file in place. Use Chrome or Edge for automatic saving — or Import your .xlsx, make changes, and use Download .xlsx to save them back.");
    setStatus('Working in memory (not saved)', 'busy');
    render();
  }

  // ---- Rendering ----
  function render() {
    renderList();
    renderCarView();
  }

  function renderList() {
    el.list.innerHTML = '';
    if (!cars.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (fileHandle || !hasFSA) ? 'No vehicles yet — click Add.' : 'Open a spreadsheet to begin.';
      el.list.appendChild(li);
      return;
    }
    cars.forEach((c, i) => {
      const li = document.createElement('li');
      if (i === selected) li.classList.add('active');
      li.innerHTML = '<div class="avatar">🚘</div><div class="car-text"><div class="car-name"></div><div class="car-sub"></div></div>';
      li.querySelector('.car-name').textContent = carTitle(c);
      li.querySelector('.car-sub').textContent = carSub(c);
      li.classList.toggle('gone', isDisposed(c));
      li.addEventListener('click', () => { selected = i; render(); });
      el.list.appendChild(li);
    });
  }

  function renderCarView() {
    const car = cars[selected];
    show(el.welcome, !car);
    show(el.carView, !!car);
    if (!car) return;
    renderSummary(car);
    for (const t of document.querySelectorAll('.tab')) {
      t.classList.toggle('active', t.dataset.tab === activeTab);
    }
    show(el.tabDetails, activeTab === 'details');
    show(el.tabMaint, activeTab === 'maint');
    if (activeTab === 'details') renderDetails(car); else renderMaintenance(car);
  }

  // Header + stat cards + sidebar entry: no inputs in here, so safe to rebuild while typing
  function renderSummary(car) {
    // Header
    const sub = [car.year, car.make, car.model, car.trim].filter(has).join(' ');
    const left = document.createElement('div');
    const titleRow = document.createElement('div'); titleRow.className = 'title-row';
    const h = document.createElement('h2'); h.textContent = carTitle(car);
    titleRow.appendChild(h);
    if (car.status) {
      const pill = document.createElement('span');
      pill.className = 'status-pill ' + (isDisposed(car) ? 'gone' : 'sale');
      pill.textContent = car.status.toUpperCase() + (isDisposed(car) && car.disposalDate ? ' · ' + car.disposalDate : '');
      titleRow.appendChild(pill);
    }
    left.appendChild(titleRow);
    const subtitle = [car.nickname ? sub : '', car.color].filter(Boolean).join(' · ');
    if (subtitle) { const s = document.createElement('div'); s.className = 'subtitle'; s.textContent = subtitle; left.appendChild(s); }
    if (car.vin) { const v = document.createElement('div'); v.className = 'vin'; v.innerHTML = '<b>VIN</b>'; v.append(car.vin); left.appendChild(v); }
    el.header.replaceChildren(left);
    if (car.plate) {
      const p = document.createElement('div'); p.className = 'plate';
      if (car.plateState) { const st = document.createElement('div'); st.className = 'plate-state'; st.textContent = car.plateState; p.appendChild(st); }
      const n = document.createElement('div'); n.className = 'plate-num'; n.textContent = car.plate; p.appendChild(n);
      el.header.appendChild(p);
    }

    // Stats
    const stats = [];
    stats.push({ label: 'Odometer', value: has(car.miles) ? fmtNum(car.miles) + ' mi' : '—', sub: has(car.miles) ? '' : 'Not set', tone: has(car.miles) ? '' : 'idle' });

    const maintTotal = car.log.reduce((s, it) => s + (Number(it.cost) || 0), 0);
    const lastMaint = car.log.filter(it => it.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    const maintStat = {
      label: 'Maintenance spend', value: fmtMoney(maintTotal),
      sub: car.log.length ? `${car.log.length} record${car.log.length === 1 ? '' : 's'}${lastMaint ? ' · last ' + lastMaint.date : ''}` : 'No records yet',
      tone: car.log.length ? '' : 'idle',
    };

    if (isDisposed(car)) {
      // Gone: show how it ended rather than reminders
      const gain = has(car.salePrice) && has(car.purchasePrice) && car.ownership !== 'Lease' ? car.salePrice - car.purchasePrice : null;
      stats.push({ label: 'Status', value: car.status, sub: car.disposalDate ? car.disposalDate : 'No date entered', tone: 'idle' });
      stats.push({
        label: car.status === 'Sold' ? 'Sold for' : 'Value received', value: has(car.salePrice) ? fmtMoney(car.salePrice) : '—',
        sub: gain == null ? (has(car.salePrice) ? '' : 'No amount entered') : `${signedMoney(gain)} vs purchase price`,
        tone: gain == null ? 'idle' : gain >= 0 ? 'ok' : 'bad',
      });
      stats.push(maintStat);
      renderStatCards(stats, car);
      return;
    }
    if (car.status === 'For Sale') {
      const diff = has(car.askingPrice) && has(car.purchasePrice) ? car.askingPrice - car.purchasePrice : null;
      stats.push({
        label: 'For sale', value: has(car.askingPrice) ? fmtMoney(car.askingPrice) : 'No price yet',
        sub: diff == null ? 'Asking price' : `${signedMoney(diff)} vs purchase price`, tone: 'warn',
      });
    }

    if (has(car.nextServiceMiles) && has(car.miles)) {
      const diff = car.nextServiceMiles - car.miles;
      stats.push(diff < 0
        ? { label: 'Next service', value: fmtNum(car.nextServiceMiles) + ' mi', sub: `Overdue by ${fmtNum(-diff)} mi`, tone: 'bad' }
        : { label: 'Next service', value: fmtNum(car.nextServiceMiles) + ' mi', sub: diff <= 500 ? `Due soon · ${fmtNum(diff)} mi left` : `${fmtNum(diff)} mi to go`, tone: diff <= 500 ? 'warn' : 'ok' });
    } else {
      stats.push({ label: 'Next service', value: '—', sub: 'Set “Next Service At” in Details', tone: 'idle' });
    }

    const d = daysUntil(car.regExpiry);
    if (d == null) stats.push({ label: 'Registration', value: '—', sub: 'No expiry date', tone: 'idle' });
    else if (d < 0) stats.push({ label: 'Registration', value: car.regExpiry, sub: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, tone: 'bad' });
    else stats.push({ label: 'Registration', value: car.regExpiry, sub: d === 0 ? 'Expires today' : `Expires in ${d} day${d === 1 ? '' : 's'}`, tone: d <= 30 ? 'warn' : 'ok' });

    stats.push(paymentStat(car));
    stats.push(maintStat);
    renderStatCards(stats, car);
  }

  function paymentStat(car) {
    if (!car.ownership) return { label: 'Payment', value: '—', sub: 'Set ownership type in Details', tone: 'idle' };
    if (car.ownership === 'Cash') {
      return { label: 'Payment', value: has(car.purchasePrice) ? fmtMoney(car.purchasePrice) : 'Paid cash', sub: 'Cash · no monthly payment', tone: '' };
    }
    const L = loanInfo(car);
    const value = L.M != null ? fmtMoney(L.M) + '/mo' : '—';
    if (car.ownership === 'Lease') {
      const end = validISO(car.leaseEnd) ? car.leaseEnd : (L.payoff ? isoLocal(L.payoff) : '');
      const d = end ? daysUntil(end) : null;
      if (d == null) return { label: 'Lease payment', value, sub: L.k != null ? `${L.k} of ${L.n} paid` : 'Add lease end date', tone: '' };
      return d < 0
        ? { label: 'Lease payment', value, sub: `Lease ended ${end}`, tone: 'bad' }
        : { label: 'Lease payment', value, sub: `Ends in ${d} day${d === 1 ? '' : 's'}`, tone: d <= 60 ? 'warn' : '' };
    }
    const bits = [];
    if (L.k != null) bits.push(`${L.k} of ${L.n} paid`);
    if (has(car.apr)) bits.push(`${car.apr}% APR`);
    return { label: 'Loan payment', value, sub: bits.join(' · ') || 'Add APR, term & first payment', tone: L.k != null && L.k >= L.n ? 'ok' : '' };
  }

  function renderStatCards(stats, car) {
    el.stats.replaceChildren(...stats.map(s => {
      const n = document.createElement('div');
      n.className = 'stat ' + (s.tone || '');
      n.innerHTML = '<div class="label"></div><div class="value"></div><div class="sub"></div>';
      n.querySelector('.label').textContent = s.label;
      n.querySelector('.value').textContent = s.value;
      n.querySelector('.sub').textContent = s.sub;
      return n;
    }));

    el.maintCount.textContent = car.log.length || '';

    // Sidebar entry
    const li = el.list.children[selected];
    if (li && li.querySelector('.car-name')) {
      li.querySelector('.car-name').textContent = carTitle(car);
      li.querySelector('.car-sub').textContent = carSub(car);
      li.classList.toggle('gone', isDisposed(car));
    }
    updateSummaries(car);
  }

  // Read-only calculation panels inside the Details tab (only exist while that tab is shown)
  function paymentRows(car) {
    const rows = [];
    if (car.ownership === 'Cash') {
      if (has(car.purchasePrice)) rows.push(['Paid in full', fmtMoney(car.purchasePrice) + (car.purchaseDate ? ' on ' + car.purchaseDate : '')]);
      return rows;
    }
    if (car.ownership !== 'Finance' && car.ownership !== 'Lease') return rows;
    const L = loanInfo(car);
    if (L.M != null) rows.push(['Monthly payment', fmtMoney(L.M) + (!has(car.monthlyPayment) ? ' (calculated)' : '')]);
    if (L.k != null) {
      rows.push(['Payments made', `${L.k} of ${L.n}`]);
      rows.push(['Payments remaining', String(L.remaining)]);
      if (L.M != null && car.ownership === 'Lease') rows.push(['Remaining cost', fmtMoney(L.M * L.remaining)]);
    }
    if (car.ownership === 'Finance') {
      if (L.balance != null) rows.push(['Est. balance remaining', fmtMoney(L.balance)]);
      if (L.payoff) rows.push(['Final payment', isoLocal(L.payoff)]);
      if (L.interest != null) rows.push(['Est. total interest', fmtMoney(L.interest)]);
      if (has(car.monthlyPayment) && L.calcM != null && Math.abs(L.calcM - car.monthlyPayment) > 1) {
        rows.push(['Payment from APR & term', fmtMoney(L.calcM)]);
      }
    } else {
      if (L.M != null && L.n) rows.push(['Total lease cost', fmtMoney((Number(car.downPayment) || 0) + L.M * L.n)]);
      if (has(car.milesPerYear) && L.n) rows.push(['Miles allowed (full term)', fmtNum(Math.round(car.milesPerYear * L.n / 12))]);
      if (has(car.residual)) rows.push(['Buyout price', fmtMoney(car.residual)]);
    }
    return rows;
  }

  function statusRows(car) {
    const rows = [];
    if (car.status === 'For Sale') {
      if (has(car.askingPrice)) rows.push(['Asking price', fmtMoney(car.askingPrice)]);
      if (has(car.askingPrice) && has(car.purchasePrice)) rows.push(['Vs. purchase price', signedMoney(car.askingPrice - car.purchasePrice)]);
    } else if (isDisposed(car)) {
      const held = durationText(car.purchaseDate, car.disposalDate);
      if (held) rows.push(['Owned for', held]);
      if (has(car.salePrice)) rows.push(['Value received', fmtMoney(car.salePrice)]);
      const lease = car.ownership === 'Lease';
      if (has(car.salePrice) && has(car.purchasePrice) && !lease) rows.push(['Gain / loss vs purchase', signedMoney(car.salePrice - car.purchasePrice)]);
      const maint = car.log.reduce((s, it) => s + (Number(it.cost) || 0), 0);
      if (car.log.length) rows.push(['Maintenance spent', fmtMoney(maint)]);
      if (has(car.purchasePrice) && has(car.salePrice) && !lease) {
        rows.push(['Net cost (price + maintenance − sale)', fmtMoney(car.purchasePrice + maint - car.salePrice)]);
      }
      if (car.ownership === 'Finance') {
        const L = loanInfo(car);
        if (L.balance != null && L.balance > 0) rows.push(['Est. loan balance (confirm it was paid off)',fmtMoney(L.balance)]);
      }
    }
    return rows;
  }

  function updateSummaries(car) {
    for (const [id, fn, note] of [['pay', paymentRows, 'Estimates from the numbers above — your lender’s statement is the real figure.'], ['status', statusRows, '']]) {
      const box = document.getElementById('sum_' + id);
      if (!box) continue;
      const rows = fn(car);
      box.classList.toggle('hidden', !rows.length);
      box.replaceChildren(...rows.map(([k, v]) => {
        const d = document.createElement('div'); d.className = 'kv';
        const a = document.createElement('span'); a.textContent = k;
        const b = document.createElement('b'); b.textContent = v;
        d.append(a, b); return d;
      }));
      if (rows.length && note && car.ownership !== 'Cash') { const n = document.createElement('div'); n.className = 'kv-note'; n.textContent = note; box.appendChild(n); }
    }
  }

  function applyVisibility(car) {
    for (const w of el.tabDetails.querySelectorAll('[data-only]')) {
      w.classList.toggle('hidden', !w.dataset.only.split('|').includes(car[w.dataset.by]));
    }
  }

  // ---- Details tab ----
  function renderDetails(car) {
    el.tabDetails.innerHTML = '';
    for (const section of SECTIONS) {
      const fs = document.createElement('fieldset');
      const lg = document.createElement('legend');
      lg.textContent = section.title;
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const f of section.fields) grid.appendChild(buildField(f, car));
      fs.append(lg, grid);
      if (section.summary) {
        const box = document.createElement('div');
        box.id = 'sum_' + section.summary;
        box.className = 'kv-grid hidden';
        fs.appendChild(box);
      }
      el.tabDetails.appendChild(fs);
    }
    applyVisibility(car);
    updateSummaries(car);
    refreshLists(car);
    const dz = document.createElement('div');
    dz.className = 'danger-zone';
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn danger small'; del.textContent = 'Delete vehicle';
    del.addEventListener('click', deleteCar);
    dz.appendChild(del);
    el.tabDetails.appendChild(dz);
  }

  function buildField(f, car) {
    const wrap = document.createElement('div');
    wrap.className = 'field' + (f.wide ? ' wide' : '');
    const label = document.createElement('label');
    label.textContent = f.label;
    label.htmlFor = 'f_' + f.key;
    if (f.only) { wrap.dataset.by = f.by || 'ownership'; wrap.dataset.only = f.only.join('|'); }
    const isSelect = f.type === 'select';
    const input = document.createElement(isSelect ? 'select' : f.type === 'textarea' ? 'textarea' : 'input');
    input.id = 'f_' + f.key;
    if (!isSelect) input.autocomplete = 'off';
    if (isSelect) {
      const opts = [['', f.blankLabel || '— Select —'], ...f.options.map(o => [o, o])];
      if (has(car[f.key]) && !f.options.includes(car[f.key])) opts.push([car[f.key], car[f.key]]);  // value typed in Excel
      for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; input.appendChild(o); }
    } else if (f.type !== 'textarea') input.type = f.type;
    if (f.min != null) input.min = f.min;
    if (f.max != null) input.max = f.max;
    if (f.step) input.step = f.step;
    if (f.maxlength) input.maxLength = f.maxlength;
    if (f.list) input.setAttribute('list', f.list);
    input.value = car[f.key];
    const hint = document.createElement('div');
    hint.className = 'hint';

    input.addEventListener(isSelect ? 'change' : 'input', () => {
      let v = input.value;
      if (f.upper) { const pos = input.selectionStart; v = v.toUpperCase(); input.value = v; try { input.setSelectionRange(pos, pos); } catch {} }
      if (f.type === 'number') v = v === '' ? '' : Number(v);
      car[f.key] = v;
      if (f.key === 'vin') {
        hint.textContent = vinHint(v);
        if (isCompleteVin(v)) decodeVin(car, { overwrite: false });   // auto-fill blanks once the VIN is complete
      }
      if (f.key === 'make' || f.key === 'year') scheduleModelLoad(car);
      if (isSelect) applyVisibility(car);
      renderSummary(car);
      scheduleSave();
    });

    if (f.key === 'vin') {
      vinHintEl = hint;
      hint.textContent = vinHint(car.vin);
      const row = document.createElement('div');
      row.className = 'vin-row';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn small'; btn.textContent = 'Look up make/model';
      btn.title = 'Fills in year, make, model and trim from the VIN (sends the VIN to the free NHTSA vehicle database)';
      btn.addEventListener('click', () => {
        if (!isCompleteVin(car.vin)) { hint.textContent = 'Enter the full 17-character VIN first'; return; }
        decodeVin(car, { overwrite: true });
      });
      row.append(hint, btn);
      wrap.append(label, input, row);
    } else {
      wrap.append(label, input);
    }
    return wrap;
  }

  // ---- Auto-fill: VIN decode + suggestion lists (NHTSA vPIC) ----
  let vinHintEl = null;
  let modelTimer = null;
  const modelCache = new Map();
  const isCompleteVin = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(v || '');

  async function fetchJSON(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function setVinHint(text) { if (vinHintEl && vinHintEl.isConnected) vinHintEl.textContent = text; }

  function cleanMake(name) {
    const n = String(name || '').trim();
    const known = COMMON_MAKES.find(k => k.toLowerCase() === n.toLowerCase());
    if (known) return known;
    return n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : n;
  }

  async function decodeVin(car, { overwrite }) {
    const vin = car.vin;
    setVinHint('Looking up VIN…');
    try {
      const data = await fetchJSON(`${NHTSA}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
      if (car.vin !== vin) return;                       // VIN changed while waiting
      const r = data.Results && data.Results[0];
      if (!r || !r.Make) { setVinHint('No match found for this VIN'); return; }
      const found = {
        year: Number(r.ModelYear) || '',
        make: cleanMake(r.Make),
        model: String(r.Model || '').trim(),
        trim: String(r.Trim || r.Series || '').trim(),
      };
      const filled = [];
      for (const [k, v] of Object.entries(found)) {
        if (v === '' || (!overwrite && has(car[k]))) continue;
        car[k] = v;
        filled.push(k);
        const input = document.getElementById('f_' + k);
        if (input && car === cars[selected]) input.value = v;
      }
      renderSummary(car);
      refreshLists(car, found.trim);
      if (filled.length) scheduleSave();
      setVinHint(filled.length ? `Filled in ${filled.join(', ')} from VIN` : 'Year, make, model and trim already filled in');
    } catch (e) {
      if (car.vin === vin) setVinHint("Couldn't reach the VIN lookup (offline?) — you can still type it in");
    }
  }

  function fillList(id, values) {
    const dl = document.getElementById(id);
    if (!dl) return;
    const uniq = [...new Set(values.filter(has).map(String))].sort((a, b) => a.localeCompare(b));
    dl.replaceChildren(...uniq.map(v => { const o = document.createElement('option'); o.value = v; return o; }));
  }

  // Suggestions = common values + whatever is already in your sheet (+ API models for the chosen make/year)
  function refreshLists(car, extraTrim) {
    const used = k => cars.map(c => c[k]);
    fillList('dl_make', [...COMMON_MAKES, ...used('make')]);
    fillList('dl_color', [...COMMON_COLORS, ...used('color')]);
    const sameModel = cars.filter(c => c.make === car.make && c.model === car.model);
    fillList('dl_trim', [...sameModel.map(c => c.trim), extraTrim]);
    scheduleModelLoad(car, 0);
  }

  function scheduleModelLoad(car, delay = 400) {
    clearTimeout(modelTimer);
    modelTimer = setTimeout(() => loadModels(car), delay);
  }

  async function loadModels(car) {
    const make = String(car.make || '').trim();
    const local = cars.filter(c => c.make === car.make).map(c => c.model);
    if (!make) { fillList('dl_model', local); return; }
    const year = has(car.year) && car.year >= 1900 ? car.year : '';
    const key = make.toLowerCase() + '|' + year;
    if (!modelCache.has(key)) {
      try {
        const url = year
          ? `${NHTSA}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
          : `${NHTSA}/GetModelsForMake/${encodeURIComponent(make)}?format=json`;
        const data = await fetchJSON(url);
        modelCache.set(key, (data.Results || []).map(r => r.Model_Name));
      } catch { fillList('dl_model', local); return; }          // offline: fall back to models already in the sheet
    }
    // Ignore the answer if the user has since changed make/year
    if (String(car.make || '').trim().toLowerCase() + '|' + (has(car.year) && car.year >= 1900 ? car.year : '') !== key) return;
    fillList('dl_model', [...modelCache.get(key), ...local]);
  }

  function vinHint(v) {
    if (!v) return '';
    if (v.length !== 17) return `${v.length}/17 characters`;
    if (/[IOQ]/.test(v)) return 'VINs never contain I, O or Q';
    return '';
  }

  // ---- Maintenance tab ----
  function renderMaintenance(car, focusItem) {
    const root = el.tabMaint;
    root.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'maint-toolbar';
    bar.innerHTML = '<div><h3>Maintenance log</h3><div class="muted">Every line is a row on the “Maintenance” sheet of your spreadsheet.</div></div>';
    const add = document.createElement('button');
    add.className = 'btn primary'; add.textContent = '+ Add service';
    add.addEventListener('click', () => {
      const item = blankItem();
      item.date = todayISO();
      if (has(car.miles)) item.miles = car.miles;
      car.log.push(item);
      renderSummary(car);
      renderMaintenance(car, item);
      scheduleSave();
    });
    bar.appendChild(add);
    root.appendChild(bar);

    if (!car.log.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="big">🔧</div><div>No maintenance recorded yet.<br>Click <b>Add service</b> to log an oil change, new tires, repairs…</div>';
      root.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'log';
    table.innerHTML = `<thead><tr>
      <th class="c-date">Date</th><th class="c-miles">Miles</th><th class="c-service">Service</th>
      <th class="c-cost">Cost (${CURRENCY})</th><th class="c-shop">Shop / Who</th><th class="c-notes">Notes</th><th class="c-del"></th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    const totalCell = document.createElement('td');
    totalCell.className = 'total';
    const updateTotal = () => { totalCell.textContent = fmtMoney(car.log.reduce((s, it) => s + (Number(it.cost) || 0), 0)); };

    // Newest first; items without a date float to the top so they're easy to finish
    const order = car.log.map((it, n) => ({ it, n })).sort((a, b) => (b.it.date || '9999').localeCompare(a.it.date || '9999') || b.n - a.n);
    for (const { it } of order) tbody.appendChild(buildLogRow(car, it, updateTotal));
    table.appendChild(tbody);

    const tfoot = document.createElement('tfoot');
    const fr = document.createElement('tr');
    fr.innerHTML = '<td colspan="3">Total</td>';
    fr.appendChild(totalCell);
    fr.insertAdjacentHTML('beforeend', '<td colspan="3"></td>');
    tfoot.appendChild(fr);
    table.appendChild(tfoot);
    updateTotal();

    wrap.appendChild(table);
    root.appendChild(wrap);

    if (focusItem) {
      const row = tbody.querySelector(`tr[data-id="${car.log.indexOf(focusItem)}"]`);
      const svc = row && row.querySelector('.c-service input');
      if (svc) svc.focus();
    }
  }

  function buildLogRow(car, item, updateTotal) {
    const tr = document.createElement('tr');
    tr.dataset.id = car.log.indexOf(item);
    for (const f of MAINT_FIELDS) {
      const td = document.createElement('td');
      td.className = 'c-' + f.key;
      const input = document.createElement('input');
      input.type = f.type;
      input.autocomplete = 'off';
      input.value = item[f.key];
      input.setAttribute('aria-label', f.label);
      if (f.key === 'service') input.setAttribute('list', 'serviceTypes');
      if (f.key === 'cost') { input.step = '0.01'; input.min = '0'; input.placeholder = '0.00'; }
      if (f.key === 'miles') input.min = '0';
      input.addEventListener('input', () => {
        item[f.key] = f.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value;
        updateTotal();
        renderSummary(car);
        scheduleSave();
      });
      input.addEventListener('change', () => {
        if (f.key === 'date') renderMaintenance(car);              // re-sort
        if (f.key === 'miles' && has(item.miles) && (!has(car.miles) || item.miles > car.miles)) {
          car.miles = item.miles;                                    // odometer follows the latest reading
          renderSummary(car);
          scheduleSave();
          toast(`Odometer updated to ${fmtNum(item.miles)} mi`);
        }
      });
      td.appendChild(input);
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.className = 'c-del';
    const del = document.createElement('button');
    del.className = 'del'; del.type = 'button'; del.title = 'Delete this line'; del.textContent = '✕';
    del.addEventListener('click', () => {
      car.log.splice(car.log.indexOf(item), 1);
      renderSummary(car);
      renderMaintenance(car);
      scheduleSave();
    });
    td.appendChild(del);
    tr.appendChild(td);
    return tr;
  }

  // ---- Actions ----
  function addCar() {
    cars.push(blankCar());
    selected = cars.length - 1;
    activeTab = 'details';
    render();
    scheduleSave();
    const first = $('f_nickname'); if (first) first.focus();
  }

  function deleteCar() {
    const car = cars[selected];
    if (!car) return;
    const n = car.log.length;
    if (!confirm(`Delete "${carTitle(car)}"${n ? ` and its ${n} maintenance record${n === 1 ? '' : 's'}` : ''} from the spreadsheet? This can't be undone.`)) return;
    cars.splice(selected, 1);
    selected = cars.length ? Math.min(selected, cars.length - 1) : -1;
    render();
    scheduleSave();
  }

  function downloadXlsx() {
    XLSX.writeFile(buildWorkbook(), fileName || 'My Car.xlsx');
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadWorkbookData(reader.result);
        fileName = file.name;
        setStatus(`${fileName} · loaded (Download to save)`, 'busy');
        render();
      } catch (e) { fail(e); }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---- Wire up ----
  el.btnOpen.addEventListener('click', openExisting);
  el.btnNew.addEventListener('click', createNew);
  el.btnReload.addEventListener('click', reload);
  el.btnReconnect.addEventListener('click', reconnect);
  el.btnAdd.addEventListener('click', addCar);
  el.btnImport.addEventListener('click', () => el.fileInput.click());
  el.btnDownload.addEventListener('click', downloadXlsx);
  el.fileInput.addEventListener('change', () => { if (el.fileInput.files[0]) importFile(el.fileInput.files[0]); el.fileInput.value = ''; });
  for (const t of document.querySelectorAll('.tab')) {
    t.addEventListener('click', () => { activeTab = t.dataset.tab; renderCarView(); });
  }
  window.addEventListener('beforeunload', e => {
    if (saveTimer && fileHandle) { e.preventDefault(); e.returnValue = ''; }
  });

  render();
  if (hasFSA) restoreSession(); else setupFallback();
})();
