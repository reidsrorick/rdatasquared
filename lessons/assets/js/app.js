/* ============================================================
   How QR Codes Work — walkthrough UI
   Vanilla JS. Drives the chapters, controls, and live visuals
   off the from-scratch encoder in qrcode.js.
   ============================================================ */
(function () {
  'use strict';

  var QR = window.QRCode;

  /* Region colours — keep in sync with :root in styles.css */
  var REGION_COLORS = {
    finder: '#ff5d8f',
    separator: '#e0a63a',
    timing: '#16c79a',
    alignment: '#3ab7f0',
    format: '#c65bd3',
    version: '#fb7118',
    dark: '#2b2740',
    data: '#4b4766',
  };
  var REGION_INFO = {
    finder: ['Finder patterns', 'Three big squares. A scanner finds these first to locate and orient the code.'],
    separator: ['Separators', 'One-module white border around each finder so it stands out from the data.'],
    timing: ['Timing patterns', 'Alternating line between finders. Tells the scanner the size of one module.'],
    alignment: ['Alignment patterns', 'Smaller squares that help the scanner correct for perspective and warping.'],
    format: ['Format information', 'Encodes the error-correction level and which mask was used. Stored twice for safety.'],
    version: ['Version information', 'On version 7 and up, an 18-bit block that states the exact version.'],
    data: ['Data & error correction', 'Everything else: your message plus the Reed–Solomon recovery bytes, woven through a mask.'],
  };

  /* QR modules always render dark-on-white — the frame is white in both themes
     so codes stay scannable regardless of the page theme. */
  var THEME = {
    fg: '#1b1830',
    dim: '#c9c4d6',
  };

  /* ---------------- tiny DOM helper ---------------- */
  function el(tag, props) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(n, arguments[i]);
    return n;
  }
  function append(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null || kid === false) continue;
      if (Array.isArray(kid)) { append.apply(null, [parent].concat(kid)); continue; }
      parent.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
  }
  function frag() {
    var f = document.createDocumentFragment();
    for (var i = 0; i < arguments.length; i++) append(f, arguments[i]);
    return f;
  }

  function hexA(hex, a) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ---------------- shared state ---------------- */
  var store = (function () {
    var listeners = [];
    var state = { text: read('qrwt.text', 'https://github.com'), ecl: read('qrwt.ecl', 'M') };
    function read(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
    function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    return {
      get: function () { return state; },
      set: function (patch) {
        Object.assign(state, patch);
        if (patch.text != null) write('qrwt.text', state.text);
        if (patch.ecl != null) write('qrwt.ecl', state.ecl);
        listeners.forEach(function (fn) { fn(state); });
      },
      subscribe: function (fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
      },
    };
  })();

  /* Encode helper with friendly error handling */
  function tryEncode(text, opts) {
    try { return { ok: true, res: QR.encode(text, opts) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  /* ---------------- matrix renderer ---------------- */
  function drawMatrix(canvas, res, opts) {
    opts = opts || {};
    var scale = opts.scale || 10;
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var size = res.size;
    var modules = opts.modules || res.modules;
    var region = res.regionMap;
    var dim = (size + quiet * 2) * scale;
    canvas.width = dim;
    canvas.height = dim;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.bg || '#ffffff';
    ctx.fillRect(0, 0, dim, dim);

    var revealSet = null;
    if (typeof opts.reveal === 'number' && res.trace) {
      revealSet = {};
      var cells = res.trace.dataCells;
      for (var r = 0; r < opts.reveal && r < cells.length; r++) revealSet[cells[r].y * size + cells[r].x] = 1;
    }
    var hi = opts.highlight || null; // object map of region->true

    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var rg = region ? region[y][x] : null;
        var dark = modules[y][x];
        var px = (x + quiet) * scale, py = (y + quiet) * scale;

        if (opts.mode === 'region') {
          if (dark) { ctx.fillStyle = (rg && REGION_COLORS[rg]) || REGION_COLORS.data; ctx.fillRect(px, py, scale, scale); }
          else if (rg && rg !== 'data') { ctx.fillStyle = hexA(REGION_COLORS[rg], 0.14); ctx.fillRect(px, py, scale, scale); }
          continue;
        }

        if (opts.mode === 'highlight') {
          var on = hi && rg && hi[rg];
          if (on) {
            ctx.fillStyle = dark ? REGION_COLORS[rg] : hexA(REGION_COLORS[rg], 0.16);
            ctx.fillRect(px, py, scale, scale);
          } else if (dark) {
            ctx.fillStyle = THEME.dim;
            ctx.fillRect(px, py, scale, scale);
          }
          continue;
        }

        if (revealSet && rg === 'data' && !revealSet[y * size + x]) {
          ctx.fillStyle = hexA('#6c3bf5', 0.08);
          ctx.fillRect(px, py, scale, scale);
          continue;
        }
        if (opts.mode === 'reveal' && revealSet && rg === 'data') {
          ctx.fillStyle = dark ? '#6c3bf5' : hexA('#6c3bf5', 0.14);
          ctx.fillRect(px, py, scale, scale);
          continue;
        }

        if (dark) { ctx.fillStyle = opts.fg || THEME.fg; ctx.fillRect(px, py, scale, scale); }
      }
    }

    if (opts.grid && scale >= 5) {
      ctx.strokeStyle = hexA('#000000', 0.07);
      ctx.lineWidth = 1;
      for (var i = 0; i <= size; i++) {
        var p = (i + quiet) * scale + 0.5;
        ctx.beginPath(); ctx.moveTo(quiet * scale, p); ctx.lineTo((size + quiet) * scale, p); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p, quiet * scale); ctx.lineTo(p, (size + quiet) * scale); ctx.stroke();
      }
    }
  }

  /* ---------------- reusable control bar ---------------- */
  var PRESETS = [
    { label: 'HELLO WORLD', value: 'HELLO WORLD' },
    { label: 'a URL', value: 'https://github.com' },
    { label: 'digits', value: '8675309' },
    { label: 'Wi-Fi login', value: 'WIFI:S:CoffeeShop;T:WPA;P:latte123;;' },
  ];

  function controlBar(cleanups, opts) {
    opts = opts || {};
    var s = store.get();
    var input = el('input', { type: 'text', value: s.text, 'aria-label': 'Message to encode', spellcheck: 'false' });

    var debounce;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { store.set({ text: input.value }); }, 150);
    });
    cleanups.push(function () { clearTimeout(debounce); });

    var presetRow = el('div', { class: 'field' },
      el('label', { text: 'Try one' }),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '.4rem' } },
        PRESETS.map(function (p) {
          return el('button', {
            class: 'btn btn-ghost', style: { fontSize: '.8rem', padding: '.35rem .7rem' },
            onclick: function () { input.value = p.value; store.set({ text: p.value }); },
          }, p.label);
        })
      )
    );

    var children = [
      el('div', { class: 'field' },
        el('label', { text: 'Message' }),
        input
      ),
    ];

    if (opts.ecl) {
      var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Error-correction level' });
      QR.ECL_ORDER.forEach(function (lvl) {
        seg.appendChild(el('button', {
          type: 'button',
          'aria-pressed': String(lvl === s.ecl),
          onclick: function () {
            store.set({ ecl: lvl });
            Array.prototype.forEach.call(seg.children, function (b, i) {
              b.setAttribute('aria-pressed', String(QR.ECL_ORDER[i] === lvl));
            });
          },
        }, lvl));
      });
      children.push(el('div', { class: 'field' }, el('label', { text: 'Error correction' }), seg));
    }

    children.push(presetRow);

    var bar = el('div', { class: 'control-bar' });
    children.forEach(function (c) { bar.appendChild(c); });

    var unsub = store.subscribe(function (st) {
      if (document.activeElement !== input) input.value = st.text;
      if (opts.ecl) {
        var segEl = bar.querySelector('.seg');
        if (segEl) Array.prototype.forEach.call(segEl.children, function (b, i) {
          b.setAttribute('aria-pressed', String(QR.ECL_ORDER[i] === st.ecl));
        });
      }
    });
    cleanups.push(unsub);
    return bar;
  }

  function liveSection(cleanups, render) {
    var out = el('div');
    function update() {
      var s = store.get();
      out.innerHTML = '';
      append(out, render(s));
    }
    update();
    cleanups.push(store.subscribe(update));
    return out;
  }

  function stat(label, value, sub) {
    return el('div', { class: 'stat' },
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value' }, String(value), sub ? el('small', { text: ' ' + sub }) : null)
    );
  }

  function errorCard(msg) {
    return el('div', { class: 'callout warn' }, el('strong', { text: 'Cannot encode that yet. ' }), msg);
  }

  function cwChips(arr, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'cw-grid' });
    var limit = opts.limit || arr.length;
    arr.slice(0, limit).forEach(function (v, i) {
      var cls = 'cw' + (opts.kind ? ' ' + opts.kind : '');
      if (opts.padFrom != null && i >= opts.padFrom) cls += ' pad';
      wrap.appendChild(el('span', { class: cls, title: '0x' + v.toString(16).padStart(2, '0') + '  ·  ' + QR.toBitStr(v, 8) }, String(v)));
    });
    if (arr.length > limit) wrap.appendChild(el('span', { class: 'cw', style: { border: 'none' } }, '… +' + (arr.length - limit) + ' more'));
    return wrap;
  }

  /* ============================================================
     CHAPTERS
     ============================================================ */
  var chapters = [];

  /* ---- 0. Intro ---- */
  chapters.push({
    id: 'intro', tab: 'Intro', title: 'Meet the QR code',
    build: function (root, cleanups) {
      var enc = tryEncode(location.href.length < 300 ? location.href : 'https://github.com', { ecl: 'M' });
      var canvas = el('canvas');
      if (enc.ok) drawMatrix(canvas, enc.res, { scale: 6, quiet: 4 });

      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Interactive walkthrough' }),
        el('h2', { text: 'Meet the QR code' }),
        el('p', { class: 'lede', text: 'A QR code is a little grid of black and white squares that stores text — a link, a payment request, the password to a Wi-Fi network. This walkthrough builds one from scratch, one decision at a time, and the encoder running it is written from scratch in plain JavaScript.' }),

        el('div', { class: 'qr-stage' },
          el('div', { class: 'qr-frame' }, canvas),
          el('div', {},
            el('h3', { style: { marginTop: 0 }, text: 'Scan to open this on your phone' }),
            el('p', { text: 'That code encodes the address of this page. Every square in it was placed by the same code you are about to walk through.' }),
            el('div', { class: 'btn-row' },
              el('button', { class: 'btn btn-primary', onclick: function () { go(1); } }, 'Start the walkthrough →')
            )
          )
        ),

        el('h3', { text: 'A 60-second history' }),
        el('p', { text: 'QR ("Quick Response") codes were invented in 1994 by Masahiro Hara at Denso Wave, a Toyota-group company, to track car parts on the assembly line. Ordinary barcodes hold about 20 characters in one dimension; Hara wanted something that packed far more data and could be read fast from any angle. The three big squares in the corners — the finder patterns — were the key idea: they let a scanner lock onto the code in any rotation.' }),

        el('h3', { text: 'What can they hold?' }),
        el('div', { class: 'grid-2' },
          stat('Digits', '7,089', 'max'),
          stat('Letters & digits', '4,296', 'max'),
          stat('Bytes', '2,953', 'max'),
          stat('Grid sizes', '21 → 177', 'modules wide')
        ),
        el('div', { class: 'callout tip' }, el('strong', { text: 'Error correction is the superpower. ' }), 'A QR code carries redundant data using Reed–Solomon coding, so it still scans when up to ~30% of it is dirty, torn, or covered by a logo. We build that in ', el('a', { href: '#ecc', onclick: linkGo }, 'Step 4'), '.'),

        el('h3', { text: 'How the walkthrough is organised' }),
        el('ol', {},
          el('li', {}, el('strong', { text: 'Anatomy' }), ' — the fixed patterns every code has.'),
          el('li', {}, el('strong', { text: 'Steps 1–6' }), ' — the encoding pipeline: read the data, pick a size, pack the bits, add error correction, draw the grid, apply a mask.'),
          el('li', {}, el('strong', { text: 'Make your own' }), ' — a full generator you can download from.')
        ),
        el('p', { text: 'Change the message or error-correction level anywhere and every later step updates to match.' })
      ));
    },
  });

  /* ---- 1. Anatomy ---- */
  chapters.push({
    id: 'anatomy', tab: 'Anatomy', title: 'Anatomy of a QR code',
    build: function (root, cleanups) {
      var enc = tryEncode('https://github.com/topics/qr-code', { ecl: 'Q' });
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Orientation' }),
        el('h2', { text: 'Anatomy of a QR code' }),
        el('p', { class: 'lede', text: 'Before any of your data goes in, the grid is seeded with fixed "function patterns". They are always in the same places so a scanner knows where to look. Toggle each one to see where it lives.' })
      ));

      if (!enc.ok) { append(root, errorCard(enc.error)); return; }
      var res = enc.res;

      var active = {};
      var canvas = el('canvas');
      function redraw() {
        var any = Object.keys(active).some(function (k) { return active[k]; });
        drawMatrix(canvas, res, any ? { scale: 9, quiet: 4, mode: 'highlight', highlight: active } : { scale: 9, quiet: 4 });
      }
      redraw();

      var legend = el('ul', { class: 'legend' });
      ['finder', 'separator', 'timing', 'alignment', 'format', 'version', 'data'].forEach(function (key) {
        if (key === 'version' && res.version < 7) return;
        var info = REGION_INFO[key];
        var btn = el('button', {
          type: 'button', 'aria-pressed': 'false',
          onclick: function () {
            active[key] = !active[key];
            btn.setAttribute('aria-pressed', String(!!active[key]));
            redraw();
          },
        },
          el('span', { class: 'swatch swatch-' + key }),
          el('span', {}, el('strong', { text: info[0] }), el('span', { class: 'legend-desc', text: info[1] }))
        );
        legend.appendChild(btn);
      });

      append(root, frag(
        el('div', { class: 'qr-stage' },
          el('div', { class: 'qr-frame big' }, canvas),
          el('div', { style: { flex: '1', minWidth: '240px' } }, legend)
        ),
        el('div', { class: 'callout note' }, 'This example is ', el('span', { class: 'pill', text: 'version ' + res.version }), ' — a ', String(res.size) + '×' + String(res.size), ' grid. Bigger versions add more alignment patterns and, from version 7, a version-information block near two of the finders.'),
        el('h3', { text: 'The quiet zone' }),
        el('p', { text: 'The blank margin around the code is not decoration — the spec requires at least four modules of white space on every side. Without it, scanners struggle to tell where the code ends and the world begins.' }),
        el('h3', { text: 'Everything else is data' }),
        el('p', {}, 'The grey area in the toggle above — usually most of the code — holds your encoded message interleaved with Reed–Solomon error-correction bytes, then scrambled by a ', el('a', { href: '#mask', onclick: linkGo }, 'mask pattern'), ' to keep the light/dark balance even.')
      ));
    },
  });

  /* ---- 2. Mode ---- */
  chapters.push({
    id: 'mode', tab: 'Step 1 · Data', title: 'Step 1 — Reading your data',
    build: function (root, cleanups) {
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Step 1 of 6' }),
        el('h2', { text: 'Reading your data' }),
        el('p', { class: 'lede', text: 'The first job is to figure out what kind of characters you are encoding. QR codes have specialised "modes" that pack common data far more tightly than raw bytes.' }),
        controlBar(cleanups, {})
      ));

      append(root, liveSection(cleanups, function (s) {
        var a = QR.analyze(s.text);
        var enc = tryEncode(s.text, { ecl: s.ecl });

        var chipMap = el('div', { class: 'char-map' });
        a.perChar.slice(0, 120).forEach(function (c) {
          chipMap.appendChild(el('span', { class: 'char-chip ' + c.mode, title: c.mode + ' · U+' + c.code.toString(16).toUpperCase() },
            el('span', { class: 'cc-mode', text: c.mode.slice(0, 4) }),
            el('span', { class: 'cc-char', text: c.ch === ' ' ? '␣' : c.ch })
          ));
        });

        return frag(
          el('div', { class: 'grid-2' },
            stat('Chosen mode', a.modeLabel),
            stat('Characters', a.chars),
            stat('UTF-8 bytes', a.byteLength),
            stat('Rough cost', a.bitsPerUnit)
          ),
          el('div', { class: 'card' },
            el('h3', { style: { marginTop: 0 }, text: 'Your message, character by character' }),
            chipMap,
            el('p', { style: { marginBottom: 0, fontSize: '.9rem', color: 'var(--ink-soft)' } },
              'The encoder picks the single mode that covers every character. One character outside a mode’s alphabet forces the whole message up to the next mode.')
          ),
          el('h3', { text: 'The four data modes' }),
          el('div', { class: 'tbl-scroll' }, el('table', { class: 'data-tbl' },
            el('thead', {}, el('tr', {}, ['Mode', 'Indicator', 'Alphabet', 'Bits per character'].map(function (h) { return el('th', { text: h }); }))),
            el('tbody', {},
              modeRow('Numeric', '0001', '0–9', '3⅓ bits (10 bits per 3 digits)', a.mode === 'numeric'),
              modeRow('Alphanumeric', '0010', '0–9 A–Z space $ % * + - . / :', '5½ bits (11 bits per 2 chars)', a.mode === 'alphanumeric'),
              modeRow('Byte', '0100', 'any byte — UTF-8 here', '8 bits', a.mode === 'byte'),
              modeRow('Kanji', '1000', 'Shift-JIS double-byte chars', '13 bits', false)
            )
          )),
          el('p', { style: { fontSize: '.9rem', color: 'var(--ink-soft)' } }, 'This walkthrough implements numeric, alphanumeric and byte. Kanji mode exists for Japanese text but is rarely used elsewhere.'),
          enc.ok
            ? el('div', { class: 'callout tip' }, 'So far: ', el('span', { class: 'pill', text: a.modeLabel }), ' mode. Next we work out how big the grid has to be. ',
              el('button', { class: 'btn btn-ghost', style: { marginLeft: '.4rem' }, onclick: function () { go(3); } }, 'Step 2 →'))
            : errorCard(enc.error)
        );

        function modeRow(name, ind, alpha, bits, activeRow) {
          return el('tr', { class: activeRow ? 'is-active' : '' },
            el('td', {}, el('strong', { text: name })),
            el('td', {}, el('code', { text: ind })),
            el('td', { text: alpha }),
            el('td', { text: bits })
          );
        }
      }));
    },
  });

  /* ---- 3. Version & ECC ---- */
  chapters.push({
    id: 'version', tab: 'Step 2 · Size', title: 'Step 2 — Version & error correction',
    build: function (root, cleanups) {
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Step 2 of 6' }),
        el('h2', { text: 'Version & error correction' }),
        el('p', { class: 'lede', text: 'A QR code comes in 40 sizes, called versions. Version 1 is 21×21 modules; each step adds 4 modules per side up to version 40 at 177×177. You also choose how much of the code is spent on error correction.' }),
        controlBar(cleanups, { ecl: true })
      ));

      append(root, liveSection(cleanups, function (s) {
        var enc = tryEncode(s.text, { ecl: s.ecl });
        if (!enc.ok) return errorCard(enc.error);
        var t = enc.res.trace;
        var caps = QR.capacityFor(s.text, t.mode);

        var rows = QR.ECL_ORDER.map(function (lvl) {
          var c = caps[lvl];
          var info = QR.ECL[lvl];
          if (c.error) {
            return el('tr', {}, el('td', {}, el('strong', { text: 'Level ' + lvl })), el('td', { colspan: '4', text: c.error }));
          }
          var pct = Math.round(c.usedBits / c.capacityBits * 100);
          var bar = el('div', { style: { background: 'var(--line)', borderRadius: '999px', height: '8px', overflow: 'hidden', marginTop: '.25rem' } },
            el('span', { style: { display: 'block', height: '100%', width: pct + '%', background: 'linear-gradient(90deg,var(--violet),var(--pink))' } }));
          return el('tr', { class: lvl === t.ecl ? 'is-active' : '' },
            el('td', {}, el('strong', { text: 'Level ' + lvl }), ' ', el('span', { style: { color: 'var(--ink-soft)', fontSize: '.85em' }, text: 'recovers ' + info.recover })),
            el('td', {}, el('span', { class: 'pill', text: 'v' + c.version })),
            el('td', { text: c.dataCodewords + ' cw' }),
            el('td', {}, Math.ceil(c.usedBits / 8) + ' / ' + (c.capacityBits / 8) + ' bytes', bar)
          );
        });

        return frag(
          el('div', { class: 'grid-2' },
            stat('Version chosen', t.version, '(' + t.size + '×' + t.size + ')'),
            stat('Error-correction level', t.ecl, t.boosted ? '(raised from ' + t.eclRequested + ')' : ''),
            stat('Total modules', t.moduleCount.toLocaleString()),
            stat('Data capacity', (t.dataCapacityBits / 8) + ' bytes')
          ),
          t.boosted ? el('div', { class: 'callout tip' }, 'Your message left spare room, so the encoder quietly upgraded the error-correction level from ', el('code', { text: t.eclRequested }), ' to ', el('code', { text: t.ecl }), ' for free — same grid size, more resilience.') : null,
          el('h3', { text: 'How the version is chosen' }),
          el('p', {}, 'The encoder starts at version 1 and walks up until the message — plus its mode indicator, character count, and the error-correction overhead for the chosen level — fits. Higher error-correction levels leave less room for data, so they can push you to a larger version:'),
          el('div', { class: 'tbl-scroll' }, el('table', { class: 'data-tbl' },
            el('thead', {}, el('tr', {}, ['Level', 'Smallest version', 'Data codewords', 'Your message'].map(function (h) { return el('th', { text: h }); }))),
            el('tbody', {}, rows)
          )),
          el('div', { class: 'callout note' }, el('strong', { text: 'Codeword = 8 bits. ' }), 'Everything from here on is measured in codewords (bytes). Your data area holds ', el('span', { class: 'pill', text: t.dataCapacityBits / 8 + ' data codewords' }), ', of which ', String(Math.ceil((4 + t.charCountBitLen + t.payloadBitLen) / 8)), ' carry the message and the rest are padding.'),
          el('div', { class: 'btn-row' }, el('button', { class: 'btn btn-primary', onclick: function () { go(4); } }, 'Step 3 — pack the bits →'))
        );
      }));
    },
  });

  /* ---- 4. Bits ---- */
  chapters.push({
    id: 'bits', tab: 'Step 3 · Bits', title: 'Step 3 — Encoding the bits',
    build: function (root, cleanups) {
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Step 3 of 6' }),
        el('h2', { text: 'Encoding the bits' }),
        el('p', { class: 'lede', text: 'Now the message becomes one long bit string, assembled from labelled pieces, then sliced into 8-bit codewords.' }),
        controlBar(cleanups, { ecl: true })
      ));

      append(root, liveSection(cleanups, function (s) {
        var enc = tryEncode(s.text, { ecl: s.ecl });
        if (!enc.ok) return errorCard(enc.error);
        var t = enc.res.trace;

        var term = repeat('0', t.terminatorLen);
        var bitpad = repeat('0', t.bitPadLen);
        var padbits = t.padBytes.map(function (b) { return QR.toBitStr(b, 8); }).join('');

        var stream = el('div', { class: 'bitstream' },
          seg('mode', t.modeIndicatorBits, 'Mode indicator'),
          ' ',
          seg('count', t.charCountBits, 'Character count (' + t.charCountBitLen + ' bits): ' + t.charCount),
          ' ',
          seg('payload', wrapBits(t.payloadBits), 'Encoded payload (' + t.payloadBitLen + ' bits)'),
          term ? frag(' ', seg('term', term, 'Terminator')) : null,
          bitpad ? frag(' ', seg('term', bitpad, 'Pad to a byte boundary')) : null,
          padbits ? frag(' ', seg('pad', padbits, 'Pad bytes 11101100 / 00010001, repeated to fill capacity')) : null
        );

        return frag(
          el('div', { class: 'bitlegend' },
            lg('var(--pink)', 'Mode indicator — 4 bits'),
            lg('var(--sky)', 'Character count'),
            lg('var(--teal)', 'Payload'),
            lg('var(--amber)', 'Terminator + alignment'),
            lg('var(--violet)', 'Pad bytes')
          ),
          stream,
          el('div', { class: 'grid-2' },
            stat('Message bits', 4 + t.charCountBitLen + t.payloadBitLen),
            stat('After padding', t.dataCapacityBits),
            stat('Data codewords', t.totalDataCodewords),
            stat('Pad codewords', t.padBytes.length)
          ),
          el('h3', { text: 'The pieces' }),
          el('ol', {},
            el('li', {}, el('strong', { text: 'Mode indicator (4 bits): ' }), el('code', { text: t.modeIndicatorBits }), ' — ', t.modeLabel, ' mode.'),
            el('li', {}, el('strong', { text: 'Character count: ' }), 'the number of characters (', String(t.charCount), '), in a field whose width depends on the mode and version — ', String(t.charCountBitLen), ' bits here.'),
            el('li', {}, el('strong', { text: 'Payload: ' }), payloadExplain(t.mode)),
            el('li', {}, el('strong', { text: 'Terminator: ' }), 'up to four 0 bits marking the end of real data.'),
            el('li', {}, el('strong', { text: 'Padding: ' }), 'zero bits to reach a byte boundary, then the bytes ', el('code', { text: '11101100' }), ' and ', el('code', { text: '00010001' }), ' alternating until the data capacity is full.')
          ),
          el('h3', { text: 'Sliced into codewords' }),
          el('p', { text: 'The bit string is cut into 8-bit codewords. These go to the error-correction stage next.' }),
          cwChips(t.dataCodewords, { kind: 'data', padFrom: t.totalDataCodewords - t.padBytes.length, limit: 90 }),
          el('div', { class: 'btn-row' }, el('button', { class: 'btn btn-primary', onclick: function () { go(5); } }, 'Step 4 — error correction →'))
        );

        function seg(cls, txt, title) { return el('span', { class: 'bitgroup ' + cls, title: title }, txt); }
        function lg(color, label) { return el('span', {}, el('i', { style: { background: color } }), label); }
      }));
    },
  });

  /* ---- 5. Reed-Solomon ---- */
  chapters.push({
    id: 'ecc', tab: 'Step 4 · ECC', title: 'Step 4 — Reed–Solomon error correction',
    build: function (root, cleanups) {
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Step 4 of 6' }),
        el('h2', { text: 'Reed–Solomon error correction' }),
        el('p', { class: 'lede', text: 'This is what lets a scuffed or partly-covered QR code still scan. The encoder computes extra "check" codewords from your data; a scanner uses them to detect and repair errors.' }),
        controlBar(cleanups, { ecl: true })
      ));

      append(root, frag(
        el('h3', { text: 'The idea' }),
        el('p', {}, 'Treat the data codewords as coefficients of a polynomial. Divide that polynomial by a fixed "generator" polynomial using arithmetic in the ', el('span', { title: 'Galois Field of 256 elements' }, 'finite field GF(256)'), ' — the same byte-sized math used in AES and RAID. The remainder is the set of error-correction codewords. Because of how the generator is built, any single corrupted codeword changes the remainder in a recognisable way, so the decoder can solve for what the original must have been.'),
        el('p', {}, 'Level ', el('strong', { text: 'L' }), ' spends ~7% of the code on this; level ', el('strong', { text: 'H' }), ' spends ~30%. More check codewords → more damage survived.')
      ));

      append(root, liveSection(cleanups, function (s) {
        var enc = tryEncode(s.text, { ecl: s.ecl });
        if (!enc.ok) return errorCard(enc.error);
        var t = enc.res.trace;

        var blocksEls = t.blocks.map(function (b, i) {
          return el('div', { class: 'block-row' },
            el('div', { class: 'block-label', text: 'Block ' + (i + 1) + ' — ' + b.data.length + ' data + ' + b.ecc.length + ' ECC codewords' }),
            el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
              b.data.map(function (v) { return el('span', { class: 'cw data', title: '0x' + v.toString(16).padStart(2, '0') }, String(v)); }),
              b.ecc.map(function (v) { return el('span', { class: 'cw ecc', title: 'ECC · 0x' + v.toString(16).padStart(2, '0') }, String(v)); })
            )
          );
        });

        return frag(
          el('div', { class: 'grid-2' },
            stat('Blocks', t.numBlocks),
            stat('ECC per block', t.blockEccLen, 'codewords'),
            stat('Total ECC', t.blockEccLen * t.numBlocks, 'codewords'),
            stat('Final sequence', t.totalCodewords, 'codewords')
          ),
          el('div', { class: 'bitlegend' },
            el('span', {}, el('i', { style: { background: 'color-mix(in srgb,var(--teal) 55%,var(--line))' } }), 'data codeword'),
            el('span', {}, el('i', { style: { background: 'color-mix(in srgb,var(--pink) 55%,var(--line))' } }), 'ECC codeword')
          ),
          el('h3', { text: t.numBlocks > 1 ? 'Split into ' + t.numBlocks + ' blocks' : 'One block' }),
          el('p', { text: t.numBlocks > 1
            ? 'Larger codes split the data into several blocks and give each its own ECC. This caps how much math the decoder does and spreads a burst of damage across blocks so no single block is overwhelmed.'
            : 'This code is small enough to use a single block. Larger versions and higher ECC levels use several.' }),
          blocksEls,
          el('h3', { text: 'Interleaving' }),
          el('p', { text: t.numBlocks > 1
            ? 'The blocks are then interleaved: first codeword of every block, then second of every block, and so on — ECC codewords after all the data. A scratch that wipes out a run of the final sequence then only nicks a few codewords from each block instead of destroying one block entirely.'
            : 'With one block there is nothing to interleave — the data codewords are simply followed by the ECC codewords.' }),
          cwChips(t.interleaved, { limit: 120 }),
          el('div', { class: 'callout note' }, 'This final sequence of ', el('span', { class: 'pill', text: t.totalCodewords + ' codewords' }), ' = ', String(t.totalCodewords * 8), ' bits is what actually gets painted into the grid.'),
          el('div', { class: 'btn-row' }, el('button', { class: 'btn btn-primary', onclick: function () { go(6); } }, 'Step 5 — build the grid →'))
        );
      }));
    },
  });

  /* ---- 6. Matrix ---- */
  chapters.push({
    id: 'matrix', tab: 'Step 5 · Grid', title: 'Step 5 — Building the matrix',
    build: function (root, cleanups) {
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Step 5 of 6' }),
        el('h2', { text: 'Building the matrix' }),
        el('p', { class: 'lede', text: 'The function patterns go in first. Then the codeword bits are threaded through every remaining cell in a zig-zag, bottom-right to top-left.' }),
        controlBar(cleanups, { ecl: true })
      ));

      append(root, liveSection(cleanups, function (s) {
        var enc = tryEncode(s.text, { ecl: s.ecl });
        if (!enc.ok) return errorCard(enc.error);
        var res = enc.res, t = res.trace;
        var total = t.dataCells.length;

        var canvas = el('canvas');
        var slider = el('input', { type: 'range', min: '0', max: String(total), value: String(total) });
        var playBtn = el('button', { class: 'btn' }, '▶ Animate placement');
        var readout = el('span', { style: { fontFamily: 'var(--mono)', fontSize: '.85rem', color: 'var(--ink-soft)' } });

        var timer = null;
        function render() {
          var n = parseInt(slider.value, 10);
          drawMatrix(canvas, res, { scale: 8, quiet: 3, mode: 'reveal', reveal: n, grid: true });
          readout.textContent = n + ' / ' + total + ' data bits placed';
        }
        function stop() { if (timer) { clearInterval(timer); timer = null; playBtn.textContent = '▶ Animate placement'; } }
        playBtn.addEventListener('click', function () {
          if (timer) { stop(); return; }
          if (parseInt(slider.value, 10) >= total) slider.value = '0';
          playBtn.textContent = '❚❚ Pause';
          var stepN = Math.max(1, Math.ceil(total / 125));
          timer = setInterval(function () {
            var v = Math.min(total, parseInt(slider.value, 10) + stepN);
            slider.value = String(v);
            render();
            if (v >= total) stop();
          }, 40);
        });
        slider.addEventListener('input', function () { stop(); render(); });
        cleanups.push(stop);
        render();

        return frag(
          el('h3', { text: 'Function patterns first' }),
          el('div', { class: 'qr-stage' },
            el('div', { class: 'qr-frame' }, staticRegionCanvas(res)),
            el('div', { style: { flex: '1', minWidth: '220px' } },
              el('ul', { class: 'legend' },
                ['finder', 'separator', 'timing', 'alignment', 'format'].concat(res.version >= 7 ? ['version'] : []).map(function (k) {
                  return el('li', {}, el('button', { type: 'button', 'aria-pressed': 'true', style: { cursor: 'default' } },
                    el('span', { class: 'swatch swatch-' + k }),
                    el('span', {}, el('strong', { text: REGION_INFO[k][0] }))));
                })
              ),
              el('p', { style: { fontSize: '.88rem', color: 'var(--ink-soft)' } }, 'These cells — plus the reserved format strip — are placed before any data and are skipped during data placement.')
            )
          ),
          el('h3', { text: 'Then the data zig-zag' }),
          el('p', {}, 'Working in vertical pairs of columns from the right edge, the encoder moves up one 2-wide column, then down the next, laying two bits per row. It steps over every function-pattern cell and skips column 6 entirely (that column is the vertical timing pattern).'),
          el('div', { class: 'qr-frame', style: { display: 'inline-block' } }, canvas),
          el('div', { class: 'btn-row', style: { alignItems: 'center' } }, playBtn, readout),
          el('div', { style: { marginTop: '.6rem' } }, slider),
          el('div', { class: 'callout tip' }, 'The very last bits can land in an awkward remainder region near the top-left. Any leftover cells that the bitstream does not reach stay light. Next: the mask that makes this readable. ',
            el('button', { class: 'btn btn-ghost', onclick: function () { go(7); } }, 'Step 6 →'))
        );

        function staticRegionCanvas(r) {
          var c = el('canvas');
          drawMatrix(c, r, { scale: 8, quiet: 3, mode: 'region' });
          return c;
        }
      }));
    },
  });

  /* ---- 7. Masking ---- */
  chapters.push({
    id: 'mask', tab: 'Step 6 · Mask', title: 'Step 6 — Masking',
    build: function (root, cleanups) {
      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Step 6 of 6' }),
        el('h2', { text: 'Masking' }),
        el('p', { class: 'lede', text: 'A raw data grid often has big blank patches or stripes that confuse scanners — or worse, accidental shapes that look like finder patterns. So the encoder XORs the data area with a regular pattern, tries all eight, and keeps whichever scores best.' }),
        controlBar(cleanups, { ecl: true })
      ));

      append(root, liveSection(cleanups, function (s) {
        var enc = tryEncode(s.text, { ecl: s.ecl, allMasks: true });
        if (!enc.ok) return errorCard(enc.error);
        var res = enc.res, t = res.trace;

        var grid = el('div', { class: 'mask-grid' });
        t.maskMatrices.forEach(function (mods, m) {
          var c = el('canvas');
          drawMatrix(c, res, { scale: 3, quiet: 2, modules: mods });
          var cell = el('div', { class: 'mask-cell' + (m === t.chosenMask ? ' winner' : '') },
            c,
            el('div', { class: 'mask-meta' },
              'Mask ' + m + ' · ', el('span', { class: 'mask-score', text: 'penalty ' + t.maskScores[m] }),
              m === t.chosenMask ? el('div', { text: '★ chosen (lowest)' }) : null
            )
          );
          grid.appendChild(cell);
        });

        return frag(
          grid,
          el('div', { class: 'grid-2' },
            stat('Masks evaluated', 8),
            stat('Winning mask', t.chosenMask),
            stat('Winning penalty', t.maskScores[t.chosenMask]),
            stat('Recorded in', 'format info')
          ),
          el('h3', { text: 'The eight mask patterns' }),
          el('p', { text: 'A cell is flipped when its (row, column) satisfies the mask condition. Function patterns are never masked.' }),
          el('div', { class: 'tbl-scroll' }, el('table', { class: 'data-tbl' },
            el('thead', {}, el('tr', {}, ['Mask', 'Flip when…'].map(function (h) { return el('th', { text: h }); }))),
            el('tbody', {}, [
              '(row + column) mod 2 = 0',
              'row mod 2 = 0',
              'column mod 3 = 0',
              '(row + column) mod 3 = 0',
              '(⌊row/2⌋ + ⌊column/3⌋) mod 2 = 0',
              '(row·column) mod 2 + (row·column) mod 3 = 0',
              '((row·column) mod 2 + (row·column) mod 3) mod 2 = 0',
              '((row + column) mod 2 + (row·column) mod 3) mod 2 = 0',
            ].map(function (cond, i) {
              return el('tr', { class: i === t.chosenMask ? 'is-active' : '' }, el('td', { text: String(i) }), el('td', {}, el('code', { text: cond })));
            }))
          )),
          el('h3', { text: 'The penalty score' }),
          el('p', { text: 'Each masked grid is scored on four rules; lowest total wins:' }),
          el('ol', {},
            el('li', {}, el('strong', { text: 'Runs: ' }), 'five+ same-colour modules in a row or column (worse the longer they run).'),
            el('li', {}, el('strong', { text: 'Blocks: ' }), 'any 2×2 area of one colour.'),
            el('li', {}, el('strong', { text: 'False finders: ' }), 'the 1:1:3:1:1 finder ratio appearing in the data — heavily penalised.'),
            el('li', {}, el('strong', { text: 'Balance: ' }), 'straying far from a 50/50 dark/light split.')
          ),
          el('div', { class: 'callout note' }, 'The chosen mask number is written into the ', el('span', { class: 'pill', text: 'format information' }), ' (with its own BCH error-correction bits) so the scanner knows to XOR the same pattern back out.'),
          el('div', { class: 'btn-row' }, el('button', { class: 'btn btn-primary', onclick: function () { go(8); } }, 'Make your own →'))
        );
      }));
    },
  });

  /* ---- 8. Generator ---- */
  chapters.push({
    id: 'make', tab: 'Make your own', title: 'Make your own',
    build: function (root, cleanups) {
      var textInput = el('input', { type: 'text', value: store.get().text, spellcheck: 'false', 'aria-label': 'Message' });
      var eclSeg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Error correction' });
      var curEcl = store.get().ecl;
      QR.ECL_ORDER.forEach(function (lvl) {
        eclSeg.appendChild(el('button', {
          type: 'button', 'aria-pressed': String(lvl === curEcl),
          onclick: function () { curEcl = lvl; syncSeg(); update(); store.set({ ecl: lvl }); },
        }, lvl));
      });
      function syncSeg() { Array.prototype.forEach.call(eclSeg.children, function (b, i) { b.setAttribute('aria-pressed', String(QR.ECL_ORDER[i] === curEcl)); }); }

      var scaleInput = el('input', { type: 'range', min: '4', max: '16', value: '9' });
      var canvas = el('canvas');
      var summary = el('div', { class: 'grid-2' });
      var dlRow = el('div', { class: 'btn-row' });
      var current = null;

      var debounce;
      textInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { store.set({ text: textInput.value }); update(); }, 150);
      });
      scaleInput.addEventListener('input', paint);
      cleanups.push(function () { clearTimeout(debounce); });
      cleanups.push(store.subscribe(function (s) {
        if (document.activeElement !== textInput) textInput.value = s.text;
        curEcl = s.ecl; syncSeg();
      }));

      function update() {
        var enc = tryEncode(textInput.value || '', { ecl: curEcl });
        summary.innerHTML = '';
        dlRow.innerHTML = '';
        if (!enc.ok) {
          current = null;
          canvas.width = canvas.height = 0;
          append(summary, errorCard(enc.error));
          return;
        }
        current = enc.res;
        var t = current.trace;
        append(summary,
          stat('Version', t.version, '(' + t.size + '×' + t.size + ')'),
          stat('Mode', t.modeLabel),
          stat('Error correction', t.ecl, t.boosted ? '(auto-raised)' : ''),
          stat('Mask', t.chosenMask)
        );
        append(dlRow,
          el('button', { class: 'btn btn-primary', onclick: downloadPNG }, '⬇ PNG'),
          el('button', { class: 'btn', onclick: downloadSVG }, '⬇ SVG'),
          el('button', { class: 'btn btn-ghost', onclick: copyText }, '⧉ Copy message')
        );
        paint();
      }
      function paint() {
        if (!current) return;
        drawMatrix(canvas, current, { scale: parseInt(scaleInput.value, 10), quiet: 4 });
      }
      function downloadPNG() {
        if (!current) return;
        var tmp = el('canvas');
        drawMatrix(tmp, current, { scale: 12, quiet: 4 });
        tmp.toBlob(function (blob) { saveBlob(blob, filename('png')); }, 'image/png');
      }
      function downloadSVG() {
        if (!current) return;
        var svg = QR.toSVG(current.modules, { quiet: 4 });
        saveBlob(new Blob([svg], { type: 'image/svg+xml' }), filename('svg'));
      }
      function copyText() {
        try { navigator.clipboard.writeText(textInput.value); } catch (e) {}
      }
      function filename(ext) {
        var base = (textInput.value || 'qrcode').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'qrcode';
        return base + '.' + ext;
      }
      function saveBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var a = el('a', { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }

      append(root, frag(
        el('p', { class: 'chapter-kicker', text: 'Putting it together' }),
        el('h2', { text: 'Make your own' }),
        el('p', { class: 'lede', text: 'Every square below was placed by the pipeline you just walked through — mode detection, version sizing, bit packing, Reed–Solomon ECC, matrix layout, and automatic mask selection. No QR library involved.' }),
        el('div', { class: 'control-bar' },
          el('div', { class: 'field' }, el('label', { text: 'Message' }), textInput),
          el('div', { class: 'field' }, el('label', { text: 'Error correction' }), eclSeg),
          el('div', { class: 'field' }, el('label', { text: 'Pixel size' }), scaleInput)
        ),
        el('div', { class: 'qr-stage' },
          el('div', { class: 'qr-frame big' }, canvas),
          el('div', { style: { flex: '1', minWidth: '240px' } }, summary, dlRow)
        ),
        el('div', { class: 'callout tip' }, el('strong', { text: 'Test it. ' }), 'Point your phone camera at the code on screen. Try raising the error-correction level, then cover a corner with your thumb — it should still resolve.'),
        el('h3', { text: 'Hosting this on GitHub Pages' }),
        el('ol', {},
          el('li', {}, 'Create a repository and add these files (', el('code', { text: 'index.html' }), ', ', el('code', { text: 'assets/' }), ', ', el('code', { text: 'README.md' }), ', ', el('code', { text: '.nojekyll' }), ').'),
          el('li', {}, 'Push to GitHub, then open ', el('strong', { text: 'Settings → Pages' }), ' and set the source to your default branch, ', el('code', { text: '/ (root)' }), '.'),
          el('li', {}, 'Your walkthrough goes live at ', el('code', { text: 'https://<you>.github.io/<repo>/' }), ' within a minute.')
        ),
        el('p', {}, 'The ', el('code', { text: '.nojekyll' }), ' file tells GitHub Pages to serve the folder as-is. Everything runs client-side, so there is nothing to build and no server to maintain.')
      ));

      update();
    },
  });

  /* ============================================================
     ROUTER
     ============================================================ */
  var idx = 0;
  var cleanups = [];
  var contentEl = document.getElementById('chapter-content');
  var tabsEl = document.getElementById('chapter-tabs');
  var prevBtn = document.getElementById('nav-prev');
  var nextBtn = document.getElementById('nav-next');
  var fillEl = document.getElementById('progress-fill');
  var progText = document.getElementById('progress-text');
  var footerHint = document.getElementById('footer-hint');

  chapters.forEach(function (ch, i) {
    var btn = el('button', {
      type: 'button',
      onclick: function () { go(i); },
    }, el('span', { class: 'tab-num', text: String(i + 1) }), document.createTextNode(ch.tab));
    tabsEl.appendChild(btn);
  });

  function runCleanups() {
    cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
    cleanups = [];
  }

  function render() {
    runCleanups();
    var ch = chapters[idx];
    contentEl.innerHTML = '';
    ch.build(contentEl, cleanups);

    Array.prototype.forEach.call(tabsEl.children, function (b, i) {
      b.setAttribute('aria-current', String(i === idx));
    });
    var pct = (idx + 1) / chapters.length * 100;
    fillEl.style.width = pct + '%';
    progText.textContent = 'Chapter ' + (idx + 1) + ' / ' + chapters.length;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === chapters.length - 1;
    nextBtn.textContent = idx === chapters.length - 1 ? 'Done ✓' : 'Next → ' + chapters[idx + 1].tab;
    prevBtn.textContent = idx === 0 ? '← Previous' : '← ' + chapters[idx - 1].tab;
    footerHint.textContent = ch.title;

    if (location.hash.slice(1) !== ch.id) {
      history.replaceState(null, '', '#' + ch.id);
    }
    document.getElementById('chapter-body').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(i) {
    idx = Math.max(0, Math.min(chapters.length - 1, i));
    render();
  }
  window.go = go;

  function linkGo(ev) {
    var id = (ev.currentTarget.getAttribute('href') || '').slice(1);
    var found = chapters.findIndex(function (c) { return c.id === id; });
    if (found >= 0) { ev.preventDefault(); go(found); }
  }
  window.linkGo = linkGo;

  prevBtn.addEventListener('click', function () { go(idx - 1); });
  nextBtn.addEventListener('click', function () { go(idx + 1); });
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === 'ArrowLeft') go(idx - 1);
  });
  window.addEventListener('hashchange', function () {
    var id = location.hash.slice(1);
    var found = chapters.findIndex(function (c) { return c.id === id; });
    if (found >= 0 && found !== idx) go(found);
  });

  /* source link → best guess at the repo URL */
  (function () {
    var link = document.getElementById('source-link');
    var host = location.hostname;
    var url = 'https://github.com';
    var m = host.match(/^([^.]+)\.github\.io$/);
    if (m) {
      var seg = location.pathname.split('/').filter(Boolean)[0];
      url = 'https://github.com/' + m[1] + (seg ? '/' + seg : '');
    }
    if (link) link.href = url;
  })();

  /* boot */
  var startId = location.hash.slice(1);
  var startIdx = chapters.findIndex(function (c) { return c.id === startId; });
  idx = startIdx >= 0 ? startIdx : 0;
  render();

  /* ---------------- small helpers used above ---------------- */
  function repeat(ch, n) { return n > 0 ? new Array(n + 1).join(ch) : ''; }
  function wrapBits(str) { return str; }
  function payloadExplain(mode) {
    if (mode === 'numeric') return 'digits are grouped in threes; each group of 3 becomes 10 bits (2 digits → 7 bits, 1 digit → 4).';
    if (mode === 'alphanumeric') return 'characters are taken in pairs; each pair is value₁ × 45 + value₂, written as 11 bits (a lone final character → 6 bits).';
    return 'each byte of the UTF-8 encoding is written out as 8 bits, unchanged.';
  }
})();
