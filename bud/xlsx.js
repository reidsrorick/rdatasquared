// xlsx.js — zero-dependency, in-place .xlsx patcher.
// Only the cells/parts we touch are rewritten; every other zip entry (pivots, charts,
// data model, styles…) is copied byte-for-byte from the original file.

(() => {
const enc = new TextEncoder(), dec = new TextDecoder();

/* ───────────── zip ───────────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const inflateRaw = b => pipe(b, new DecompressionStream('deflate-raw'));
const deflateRaw = b => pipe(b, new CompressionStream('deflate-raw'));

class Zip {
  constructor(buf) {
    this.buf = new Uint8Array(buf);
    this.dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    this.mods = new Map();
    const dv = this.dv; let i = this.buf.length - 22;
    for (; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) break;
    if (i < 0) throw new Error('That file is not a valid .xlsx (zip) file.');
    const total = dv.getUint16(i + 10, true), cdOff = dv.getUint32(i + 16, true);
    this.cdOff = cdOff; this.entries = [];
    let p = cdOff;
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip directory.');
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const e = {
        method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), nlen,
        off: dv.getUint32(p + 42, true), name: dec.decode(this.buf.subarray(p + 46, p + 46 + nlen)),
        cd: this.buf.slice(p, p + 46 + nlen + xlen + clen),
      };
      this.entries.push(e); p += 46 + nlen + xlen + clen;
    }
    const sorted = [...this.entries].sort((a, b) => a.off - b.off);
    sorted.forEach((e, k) => e.end = k + 1 < sorted.length ? sorted[k + 1].off : cdOff);
    this.byName = new Map(this.entries.map(e => [e.name, e]));
  }
  has(name) { return this.mods.has(name) || this.byName.has(name); }
  async bytes(name) {
    if (this.mods.has(name)) return this.mods.get(name);
    const e = this.byName.get(name); if (!e) throw new Error('Missing part: ' + name);
    const dv = this.dv, lh = e.off, start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
    const data = this.buf.subarray(start, start + e.csize);
    return e.method === 0 ? data : inflateRaw(data);
  }
  async text(name) { return dec.decode(await this.bytes(name)); }
  set(name, text) { this.mods.set(name, enc.encode(text)); }
  async build() {
    const out = [], cds = []; let off = 0;
    const push = b => { out.push(b); off += b.length; };
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const fresh = async (name, data) => {
      const nameB = enc.encode(name), comp = await deflateRaw(data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 8, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 8, true);
      cd.setUint16(12, time, true); cd.setUint16(14, date, true); cd.setUint32(16, crc, true);
      cd.setUint32(20, comp.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nameB.length, true); cd.setUint32(42, off, true);
      const cdBytes = new Uint8Array(46 + nameB.length); cdBytes.set(new Uint8Array(cd.buffer)); cdBytes.set(nameB, 46);
      push(new Uint8Array(lh.buffer)); push(nameB); push(comp); cds.push(cdBytes);
    };
    for (const e of [...this.entries].sort((a, b) => a.off - b.off)) {
      if (this.mods.has(e.name)) { await fresh(e.name, this.mods.get(e.name)); continue; }
      const cd = e.cd.slice(); new DataView(cd.buffer).setUint32(42, off, true);
      cds.push(cd); push(this.buf.subarray(e.off, e.end));
    }
    for (const [name, data] of this.mods) if (!this.byName.has(name)) await fresh(name, data);
    const cdStart = off; let cdLen = 0; for (const c of cds) { push(c); cdLen += c.length; }
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, cds.length, true); eocd.setUint16(10, cds.length, true);
    eocd.setUint32(12, cdLen, true); eocd.setUint32(16, cdStart, true);
    push(new Uint8Array(eocd.buffer));
    const res = new Uint8Array(off); let p = 0; for (const b of out) { res.set(b, p); p += b.length; }
    return res;
  }
}

/* ───────────── xml helpers ───────────── */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const colNum = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const attr = (s, name) => { const m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(s); return m ? m[1] : undefined; };
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const iso2serial = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5) + 25569;
const serial2iso = n => new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);

function parseSst(xml) {
  const out = [], re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g; let m;
  while ((m = re.exec(xml))) {
    let s = ''; const body = (m[1] || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    body.replace(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g, (_, t) => { s += unesc(t || ''); });
    out.push(s);
  }
  return out;
}

// move range end rows: A2:J117 -> A2:J118 ; A118:J1048576 (start = old+1) -> A119:...
function fixRanges(text, oldLast, newLast) {
  return text.replace(/(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/g, (m, a, r1, b, r2) => {
    r1 = +r1; r2 = +r2;
    if (r2 === oldLast) r2 = newLast;
    else if (r1 === oldLast + 1) r1 = newLast + 1;
    else return m;
    return `${a}${r1}:${b}${r2}`;
  });
}

/* ───────────── sheet (string-level, preserves untouched rows exactly) ───────────── */
class Sheet {
  constructor(xml, sst) {
    this.sst = sst; this.dirty = false;
    const self = /<sheetData\s*\/>/.exec(xml); let body = '';
    if (self) { this.head = xml.slice(0, self.index); this.tail = xml.slice(self.index + self[0].length); }
    else {
      const a = xml.indexOf('<sheetData'), open = xml.indexOf('>', a) + 1, close = xml.indexOf('</sheetData>');
      this.head = xml.slice(0, a); body = xml.slice(open, close); this.tail = xml.slice(close + 12);
    }
    this.rows = [];
    const re = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let m;
    while ((m = re.exec(body))) {
      const a = m[1], row = { r: +attr(a, 'r'), attrs: a.replace(/\s+r="\d+"/, '').replace(/\s+spans="[^"]*"/, ''), raw: m[0], cells: [], dirty: false };
      if (m[2]) {
        const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c;
        while ((c = cre.exec(m[2]))) { const ref = /^([A-Z]+)\d+$/.exec(attr(c[1], 'r')); row.cells.push({ col: ref[1], raw: c[0] }); }
      }
      this.rows.push(row);
    }
  }
  row(r, create) {
    let row = this.rows.find(x => x.r === r);
    if (!row && create) {
      row = { r, attrs: '', raw: '', cells: [], dirty: true };
      const i = this.rows.findIndex(x => x.r > r); if (i < 0) this.rows.push(row); else this.rows.splice(i, 0, row);
    }
    return row;
  }
  cellRaw(r, col) { const row = this.row(r); const c = row && row.cells.find(x => x.col === col); return c && c.raw; }
  value(r, col) {
    const raw = this.cellRaw(r, col); if (!raw) return null;
    const open = /^<c\b([^>]*?)\/?>/.exec(raw)[1], t = attr(open, 't');
    if (t === 'inlineStr') { let s = ''; raw.replace(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g, (_, x) => { s += unesc(x || ''); }); return s; }
    const v = /<v>([\s\S]*?)<\/v>/.exec(raw); if (!v) return null;
    if (t === 's') return this.sst[+v[1]];
    if (t === 'str') return unesc(v[1]);
    if (t === 'b') return v[1] === '1';
    if (t === 'e') return null;
    const n = parseFloat(v[1]); return isNaN(n) ? null : n;
  }
  styleOf(r, col) { const raw = this.cellRaw(r, col); return raw ? attr(/^<c\b([^>]*?)\/?>/.exec(raw)[1], 's') : undefined; }
  _put(r, col, raw) {
    const row = this.row(r, true), n = colNum(col), c = row.cells.find(x => x.col === col);
    if (c) c.raw = raw; else { const i = row.cells.findIndex(x => colNum(x.col) > n); const cell = { col, raw }; if (i < 0) row.cells.push(cell); else row.cells.splice(i, 0, cell); }
    row.dirty = true; this.dirty = true;
  }
  setCell(r, col, v, s) {
    if (s === undefined) s = this.styleOf(r, col);
    const sA = s != null && s !== '' ? ` s="${s}"` : '', ref = `${col}${r}`;
    let raw;
    if (v === null || v === undefined || v === '') raw = `<c r="${ref}"${sA}/>`;
    else if (typeof v === 'number') raw = `<c r="${ref}"${sA}><v>${v}</v></c>`;
    else raw = `<c r="${ref}"${sA} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    this._put(r, col, raw);
  }
  setRaw(r, col, raw) { this._put(r, col, raw); }
  _renumber(row, to) {
    row.r = to; row.dirty = true; this.dirty = true;
    for (const c of row.cells) c.raw = c.raw.replace(/^(<c\b[^>]*?\s)r="[A-Z]+\d+"/, `$1r="${c.col}${to}"`);
  }
  removeRow(r) {
    const i = this.rows.findIndex(x => x.r === r); if (i < 0) return;
    this.rows.splice(i, 1);
    for (const row of this.rows) if (row.r > r) this._renumber(row, row.r - 1);
    this.dirty = true;
  }
  headers(maxCol) {
    const m = new Map(), row = this.row(1); if (!row) return m;
    for (const c of row.cells) { if (colNum(c.col) > maxCol) continue; const v = this.value(1, c.col); if (v != null && !m.has(String(v).trim())) m.set(String(v).trim(), c.col); }
    return m;
  }
  fix(oldLast, newLast) { this.head = fixRanges(this.head, oldLast, newLast); this.tail = fixRanges(this.tail, oldLast, newLast); this.dirty = true; }
  toXml() {
    const body = this.rows.map(row => {
      if (!row.dirty) return row.raw;
      const inner = row.cells.map(c => c.raw).join('');
      return inner ? `<row r="${row.r}"${row.attrs}>${inner}</row>` : `<row r="${row.r}"${row.attrs}/>`;
    }).join('');
    return `${this.head}<sheetData>${body}</sheetData>${this.tail}`;
  }
}

/* ───────────── workbook: read everything out / write transactions back in ───────────── */
// field key → [header, style, kind]
const TXN = { date: ['Date', 2, 'date'], desc: ['Description', 12], cat: ['Category', 5], amt: ['Amount', 3, 'num'], from: ['From Account', 1], to: ['To Account', 1], notes: ['Notes', 1], work: ['Work Expense', 1], rec: ['Recurring?', 1] };
const REC = { name: ['Name'], category: ['Category'], amount: ['Amount', 'num'], frequency: ['Frequency'], nextDue: ['Next Due', 'date'], paidFrom: ['Paid From'], autopay: ['Autopay?'], notes: ['Notes'], cancelled: ['Cancelled Date', 'date'] };

class Workbook {
  static async load(file) { const wb = new Workbook(new Zip(await file.arrayBuffer())); await wb.init(); return wb; }
  constructor(zip) { this.zip = zip; this.texts = new Map(); this.sheets = {}; }
  async text(p) { return this.texts.has(p) ? this.texts.get(p) : this.zip.text(p); }
  setText(p, t) { this.texts.set(p, t); }
  async init() {
    this.sst = parseSst(await this.zip.text('xl/sharedStrings.xml'));
    this.wbXml = await this.zip.text('xl/workbook.xml');
    const rels = await this.zip.text('xl/_rels/workbook.xml.rels'), rel = {};
    rels.replace(/<Relationship\b([^>]*?)\/>/g, (_, a) => { rel[attr(a, 'Id')] = attr(a, 'Target'); });
    this.paths = {};
    this.wbXml.replace(/<sheet\b([^>]*?)\/>/g, (_, a) => { const t = rel[attr(a, 'r:id')]; this.paths[unesc(attr(a, 'name'))] = t.startsWith('/') ? t.slice(1) : 'xl/' + t; });
    for (const n of ['Transactions', 'Lists']) if (!this.paths[n]) throw new Error(`This workbook has no "${n}" sheet — is it the right file?`);
    await this._loadSheet('Transactions'); await this._loadSheet('Lists', false);
    if (this.paths.Recurring) await this._loadSheet('Recurring').catch(() => { delete this.sheets.Recurring; });
  }
  async _loadSheet(name, withTable = true) {
    const path = this.paths[name], sh = new Sheet(await this.zip.text(path), this.sst); sh.path = path; this.sheets[name] = sh;
    if (!withTable) return;
    const rx = await this.zip.text(path.replace('worksheets/', 'worksheets/_rels/') + '.rels');
    const m = /<Relationship\b[^>]*Type="[^"]*\/table"[^>]*Target="([^"]+)"/.exec(rx) || /<Relationship\b[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/table"/.exec(rx);
    if (!m) throw new Error(`Sheet "${name}" has no table.`);
    const tp = 'xl/' + m[1].replace(/^\.\.\//, ''), ref = /<table\b[^>]*?\sref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(await this.text(tp));
    sh.tbl = { path: tp, c1: colNum(ref[1]), r1: +ref[2], c2: colNum(ref[3]), r2: +ref[4] }; sh.tbl.hdr = sh.headers(sh.tbl.c2);
  }

  /* ----- workbook → plain data (dates become 'YYYY-MM-DD') ----- */
  readAll() {
    const T = this.sheets.Transactions, th = T.tbl.hdr, transactions = [];
    for (let r = T.tbl.r1 + 1; r <= T.tbl.r2; r++) {
      const id = th.has('ID') ? T.value(r, th.get('ID')) : null; if (id == null) continue;
      const t = { id }; for (const k in TXN) { const v = T.value(r, th.get(TXN[k][0])); t[k] = TXN[k][2] === 'date' ? (v == null ? '' : serial2iso(v)) : (v ?? (k === 'amt' ? null : '')); } transactions.push(t);
    }
    const R = this.sheets.Recurring, recurring = [];
    if (R) {
      const rh = R.tbl.hdr, idc = rh.get('Rec ID');
      for (let r = R.tbl.r1 + 1; r <= R.tbl.r2; r++) {
        const id = idc ? R.value(r, idc) : null; if (id == null) continue; const o = { id };
        for (const k in REC) { const [h, kind] = REC[k], c = rh.get(h), v = c ? R.value(r, c) : null; o[k] = kind === 'date' ? (v == null ? '' : serial2iso(v)) : kind === 'num' ? (v ?? null) : (v ?? ''); }
        recurring.push(o);
      }
    }
    const L = this.sheets.Lists, lh = L.headers(26), list = n => { const c = lh.get(n), out = []; if (c) for (let r = 2; r <= 200; r++) { const v = L.value(r, c); if (v != null && v !== '') out.push(String(v)); } return out; };
    return { transactions, recurring, lists: { accounts: list('From Account'), work: list('Work Expense'), categories: list('Category') } };
  }

  /* ----- plain data → workbook: rewrite the whole Transactions table (everything else untouched) ----- */
  async replaceTransactions(list) {
    if (!list.length) throw new Error('There are no transactions to export.');
    const S = this.sheets.Transactions, h = S.tbl.hdr, old = S.tbl.r2, first = S.tbl.r1 + 1, newLast = S.tbl.r1 + list.length;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)); // newest first, like the sheet's sort
    for (const row of S.rows) if (/\shidden=/.test(row.attrs)) { row.attrs = row.attrs.replace(/\s+hidden="[^"]*"/, ''); row.dirty = true; S.dirty = true; } // the old colour filter hid rows
    sorted.forEach((t, i) => {
      const r = first + i; S.setCell(r, h.get('ID'), t.id, 1);
      for (const k in TXN) {
        const [hd, style, kind] = TXN[k], col = h.get(hd); if (!col) throw new Error(`Column "${hd}" is missing in Transactions.`);
        let v = t[k]; if (kind === 'date') v = v ? iso2serial(v) : null; else if (kind === 'num') v = v === null || v === '' || v === undefined ? null : Number(v);
        S.setCell(r, col, v === '' ? null : v, style);
      }
    });
    for (let r = old; r > newLast; r--) S.removeRow(r);
    if (old !== newLast) { S.fix(old, newLast); this.setText(S.tbl.path, fixRanges(await this.text(S.tbl.path), old, newLast)); S.tbl.r2 = newLast; }
    this.setText(S.tbl.path, (await this.text(S.tbl.path)).replace(/<filterColumn\b[\s\S]*?<\/filterColumn>/g, '')); // drop the stale colour filter
  }

  async toBytes() {
    for (const [p, t] of this.texts) this.zip.set(p, t);
    for (const n in this.sheets) if (this.sheets[n].dirty) this.zip.set(this.sheets[n].path, this.sheets[n].toXml());
    this.zip.set('xl/workbook.xml', /fullCalcOnLoad/.test(this.wbXml) ? this.wbXml : this.wbXml.replace(/<calcPr\b([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>')); // Excel recalculates on open
    return this.zip.build();
  }
}
window.XLSX = { Workbook, iso2serial, serial2iso };
})();
