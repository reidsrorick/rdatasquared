/*
 * qrcode.js — a small, from-scratch QR Code encoder written for teaching.
 *
 * No external libraries. Supports numeric / alphanumeric / byte (UTF-8) modes,
 * versions 1–40, error-correction levels L/M/Q/H, Reed–Solomon ECC over GF(256),
 * block interleaving, all 8 data masks with penalty-based auto-selection, and
 * format / version information with their BCH error-correction bits.
 *
 * The encoder also returns a `trace` object exposing every intermediate value so
 * the walkthrough UI can show the pipeline step by step.
 *
 * The matrix-building approach follows the public-domain reference design by
 * Project Nayuki (https://www.nayuki.io/page/qr-code-generator-library),
 * re-implemented here in a compact, annotated form.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Constant tables
   * ------------------------------------------------------------------ */

  // Characters usable in "alphanumeric" mode, in their assigned order.
  const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  // Error-correction levels. `bits` is the 2-bit code used in the format info.
  // `ordinal` indexes the ECC tables below (0=L, 1=M, 2=Q, 3=H).
  const ECL = {
    L: { name: 'L', bits: 1, ordinal: 0, recover: '~7%' },
    M: { name: 'M', bits: 0, ordinal: 1, recover: '~15%' },
    Q: { name: 'Q', bits: 3, ordinal: 2, recover: '~25%' },
    H: { name: 'H', bits: 2, ordinal: 3, recover: '~30%' },
  };
  const ECL_ORDER = ['L', 'M', 'Q', 'H'];

  // Number of error-correction codewords per block, indexed [ecl][version].
  const ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  // Number of error-correction blocks, indexed [ecl][version].
  const NUM_EC_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  /* ------------------------------------------------------------------ *
   *  Small helpers
   * ------------------------------------------------------------------ */

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function toBitStr(val, len) {
    let s = '';
    for (let i = len - 1; i >= 0; i--) s += ((val >>> i) & 1);
    return s;
  }

  function toUtf8(str) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    return Array.from(unescape(encodeURIComponent(str))).map(function (c) { return c.charCodeAt(0); });
  }

  function detectMode(text) {
    if (/^[0-9]*$/.test(text)) return 'numeric';
    for (const ch of text) { if (ALNUM.indexOf(ch) < 0) return 'byte'; }
    return 'alphanumeric';
  }

  // Total number of data + ECC module positions available in a version's grid,
  // i.e. everything that is NOT a function pattern.
  function getNumRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36; // version information blocks
    }
    return result;
  }

  function getNumDataCodewords(ver, eclOrdinal) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[eclOrdinal][ver] * NUM_EC_BLOCKS[eclOrdinal][ver];
  }

  function numCharCountBits(mode, ver) {
    const idx = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
    return { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] }[mode][idx];
  }

  function modeIndicator(mode) {
    return { numeric: 1, alphanumeric: 2, byte: 4 }[mode];
  }

  function countDataBits(mode, text, bytes) {
    if (mode === 'numeric') {
      const n = text.length;
      return 10 * Math.floor(n / 3) + [0, 4, 7][n % 3];
    }
    if (mode === 'alphanumeric') {
      const n = text.length;
      return 11 * Math.floor(n / 2) + (n % 2) * 6;
    }
    return bytes.length * 8;
  }

  function charCount(mode, text, bytes) {
    return mode === 'byte' ? bytes.length : text.length;
  }

  /* ------------------------------------------------------------------ *
   *  Reed–Solomon error correction over GF(256), primitive poly 0x11D
   * ------------------------------------------------------------------ */

  function rsMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  // Coefficients of the divisor polynomial (x - a^0)(x - a^1)...(x - a^(deg-1)).
  function rsComputeDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }

  // Polynomial remainder of `data` divided by `divisor` — these are the ECC bytes.
  function rsComputeRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < divisor.length; i++) result[i] ^= rsMultiply(divisor[i], factor);
    }
    return result;
  }

  // Split data codewords into blocks, append ECC to each, then interleave.
  function addEccAndInterleave(data, ver, eclOrdinal, out) {
    const numBlocks = NUM_EC_BLOCKS[eclOrdinal][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[eclOrdinal][ver];
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks = [];
    const rsDiv = rsComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = rsComputeRemainder(dat, rsDiv);
      blocks.push({ data: dat.slice(), ecc: ecc.slice() });
    }

    const result = [];
    const maxDataLen = shortBlockLen - blockEccLen + 1;
    for (let i = 0; i < maxDataLen; i++) {
      for (let j = 0; j < numBlocks; j++) {
        if (i < blocks[j].data.length) result.push(blocks[j].data[i]);
      }
    }
    for (let i = 0; i < blockEccLen; i++) {
      for (let j = 0; j < numBlocks; j++) result.push(blocks[j].ecc[i]);
    }

    if (out) {
      out.blocks = blocks;
      out.numShortBlocks = numShortBlocks;
      out.shortBlockLen = shortBlockLen;
      out.blockEccLen = blockEccLen;
      out.numBlocks = numBlocks;
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   *  Alignment pattern positions
   * ------------------------------------------------------------------ */

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const num = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
    const pos = [6];
    for (let p = ver * 4 + 10; pos.length < num; p -= step) pos.splice(1, 0, p);
    return pos;
  }

  /* ------------------------------------------------------------------ *
   *  Matrix construction
   * ------------------------------------------------------------------ */

  function buildMatrix(version, eclObj, allCodewords, opts) {
    opts = opts || {};
    const forcedMask = (opts.mask == null || opts.mask < 0) ? -1 : opts.mask;
    const collectAllMasks = !!opts.allMasks;

    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, function () { return new Array(size).fill(false); });
    const isFunction = Array.from({ length: size }, function () { return new Array(size).fill(false); });
    const regionMap = Array.from({ length: size }, function () { return new Array(size).fill(null); });

    function setFn(x, y, dark, tag) {
      modules[y][x] = dark;
      isFunction[y][x] = true;
      if (tag) regionMap[y][x] = tag;
    }

    // --- Timing patterns (drawn first; corners get overwritten by finders) ---
    for (let i = 0; i < size; i++) {
      setFn(6, i, i % 2 === 0, 'timing');
      setFn(i, 6, i % 2 === 0, 'timing');
    }

    // --- Three finder patterns + their separators ---
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      const cx = c[0], cy = c[1];
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || x >= size || y < 0 || y >= size) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(x, y, d !== 2 && d !== 4, d <= 3 ? 'finder' : 'separator');
        }
      }
    });

    // --- Alignment patterns (skip the three that collide with finders) ---
    const alignPos = alignmentPositions(version);
    for (let i = 0; i < alignPos.length; i++) {
      for (let j = 0; j < alignPos.length; j++) {
        const corner = (i === 0 && j === 0) ||
          (i === 0 && j === alignPos.length - 1) ||
          (i === alignPos.length - 1 && j === 0);
        if (corner) continue;
        const cx = alignPos[i], cy = alignPos[j];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, 'alignment');
          }
        }
      }
    }

    // --- Reserve format info area + dark module, and version info for v>=7 ---
    function drawFormat(mask) {
      const data = (eclObj.bits << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412; // 15-bit format string

      for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i), 'format');
      setFn(8, 7, getBit(bits, 6), 'format');
      setFn(8, 8, getBit(bits, 7), 'format');
      setFn(7, 8, getBit(bits, 8), 'format');
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i), 'format');

      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i), 'format');
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i), 'format');
      setFn(8, size - 8, true, 'dark'); // the always-dark module
    }

    function drawVersion() {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (version << 12) | rem; // 18-bit version string
      for (let i = 0; i < 18; i++) {
        const bit = getBit(bits, i);
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFn(a, b, bit, 'version');
        setFn(b, a, bit, 'version');
      }
    }

    drawFormat(0);
    if (version >= 7) drawVersion();

    // Snapshot of which modules are function patterns (before data is laid in).
    const functionMap = regionMap.map(function (row) { return row.slice(); });

    // --- Lay the data+ECC bitstream into the grid in the zig-zag order ---
    const dataCells = [];
    let bitIdx = 0;
    const dataBitLen = allCodewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < size; vert++) {
        for (let k = 0; k < 2; k++) {
          const x = right - k;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && bitIdx < dataBitLen) {
            const cw = allCodewords[bitIdx >>> 3];
            modules[y][x] = getBit(cw, 7 - (bitIdx & 7));
            regionMap[y][x] = 'data';
            dataCells.push({ x: x, y: y });
            bitIdx++;
          }
        }
      }
    }

    // --- Mask selection ---
    function applyMask(m) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (isFunction[y][x]) continue;
          let invert;
          switch (m) {
            case 0: invert = (x + y) % 2 === 0; break;
            case 1: invert = y % 2 === 0; break;
            case 2: invert = x % 3 === 0; break;
            case 3: invert = (x + y) % 3 === 0; break;
            case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
            case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
            case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
          }
          if (invert) modules[y][x] = !modules[y][x];
        }
      }
    }

    function penalty() {
      let score = 0;

      // Rule 1: runs of 5+ same-colour modules in a row/column.
      for (let y = 0; y < size; y++) {
        let run = 1;
        for (let x = 1; x < size; x++) {
          if (modules[y][x] === modules[y][x - 1]) {
            run++;
            if (run === 5) score += 3; else if (run > 5) score += 1;
          } else run = 1;
        }
      }
      for (let x = 0; x < size; x++) {
        let run = 1;
        for (let y = 1; y < size; y++) {
          if (modules[y][x] === modules[y - 1][x]) {
            run++;
            if (run === 5) score += 3; else if (run > 5) score += 1;
          } else run = 1;
        }
      }

      // Rule 2: 2x2 blocks of one colour.
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const c = modules[y][x];
          if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
        }
      }

      // Rule 3: finder-like 1:1:3:1:1 patterns with a 4-wide light run beside them.
      const p1 = [true, false, true, true, true, false, true, false, false, false, false];
      const p2 = [false, false, false, false, true, false, true, true, true, false, true];
      function match(arr, i, pat) {
        for (let k = 0; k < 11; k++) if (arr[i + k] !== pat[k]) return false;
        return true;
      }
      for (let y = 0; y < size; y++) {
        const row = modules[y];
        for (let x = 0; x + 11 <= size; x++) if (match(row, x, p1) || match(row, x, p2)) score += 40;
      }
      for (let x = 0; x < size; x++) {
        const col = [];
        for (let y = 0; y < size; y++) col.push(modules[y][x]);
        for (let y = 0; y + 11 <= size; y++) if (match(col, y, p1) || match(col, y, p2)) score += 40;
      }

      // Rule 4: overall balance of dark vs light.
      let dark = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
      const percent = dark * 100 / (size * size);
      score += Math.floor(Math.abs(percent - 50) / 5) * 10;

      return score;
    }

    const maskScores = [];
    const maskMatrices = collectAllMasks ? [] : null;
    let chosenMask = forcedMask;
    let bestScore = Infinity;

    for (let m = 0; m < 8; m++) {
      drawFormat(m);
      applyMask(m);
      if (collectAllMasks) maskMatrices[m] = modules.map(function (r) { return r.slice(); });
      const p = penalty();
      maskScores.push(p);
      if (p < bestScore) { bestScore = p; if (forcedMask < 0) chosenMask = m; }
      applyMask(m); // undo (XOR mask is its own inverse)
    }
    if (chosenMask < 0) chosenMask = 0;

    drawFormat(chosenMask);
    applyMask(chosenMask);

    return {
      version: version,
      size: size,
      modules: modules,
      isFunction: isFunction,
      regionMap: regionMap,
      functionMap: functionMap,
      dataCells: dataCells,
      alignPositions: alignPos,
      maskScores: maskScores,
      maskMatrices: maskMatrices,
      chosenMask: chosenMask,
    };
  }

  /* ------------------------------------------------------------------ *
   *  Top-level encode
   * ------------------------------------------------------------------ */

  function analyze(text) {
    const mode = detectMode(text);
    const bytes = toUtf8(text);
    const perChar = Array.from(text).map(function (ch) {
      let charMode = 'byte';
      if (/^[0-9]$/.test(ch)) charMode = 'numeric';
      else if (ALNUM.indexOf(ch) >= 0) charMode = 'alphanumeric';
      return { ch: ch, mode: charMode, code: ch.codePointAt(0) };
    });
    return {
      mode: mode,
      modeLabel: { numeric: 'Numeric', alphanumeric: 'Alphanumeric', byte: 'Byte (UTF-8)' }[mode],
      chars: Array.from(text).length,
      bytes: bytes,
      byteLength: bytes.length,
      perChar: perChar,
      bitsPerUnit: { numeric: '3⅓ bits / digit', alphanumeric: '5½ bits / char', byte: '8 bits / byte' }[mode],
    };
  }

  function encode(text, opts) {
    opts = opts || {};
    const eclName = opts.ecl && ECL[opts.ecl] ? opts.ecl : 'M';
    const boostEcl = opts.boostEcl !== false;
    const minVersion = Math.max(1, Math.min(40, opts.minVersion || 1));
    const mode = opts.mode || detectMode(text);
    const bytes = toUtf8(text);
    const dataBits = countDataBits(mode, text, bytes);

    // --- Pick the smallest version that fits at the requested ECC level ---
    let version = -1;
    let ccBits = 0;
    for (let v = minVersion; v <= 40; v++) {
      ccBits = numCharCountBits(mode, v);
      const total = 4 + ccBits + dataBits;
      if (total <= getNumDataCodewords(v, ECL[eclName].ordinal) * 8) { version = v; break; }
    }
    if (version === -1) {
      throw new Error('Message is too long for a QR code at level ' + eclName + ' (max is version 40).');
    }

    // --- Optionally raise the ECC level for free if the data still fits ---
    let ecl = eclName;
    if (boostEcl) {
      for (const cand of ['M', 'Q', 'H']) {
        if (ECL[cand].ordinal > ECL[ecl].ordinal &&
          4 + ccBits + dataBits <= getNumDataCodewords(version, ECL[cand].ordinal) * 8) {
          ecl = cand;
        }
      }
    }
    const dataCapacityBits = getNumDataCodewords(version, ECL[ecl].ordinal) * 8;

    // --- Build the bit buffer ---
    const bits = [];
    function appendBits(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    }

    appendBits(modeIndicator(mode), 4);
    appendBits(charCount(mode, text, bytes), ccBits);

    const payloadStart = bits.length;
    if (mode === 'numeric') {
      for (let i = 0; i < text.length; i += 3) {
        const chunk = text.substring(i, i + 3);
        appendBits(parseInt(chunk, 10), chunk.length * 3 + 1);
      }
    } else if (mode === 'alphanumeric') {
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i += 2) {
        if (i + 1 < chars.length) {
          appendBits(ALNUM.indexOf(chars[i]) * 45 + ALNUM.indexOf(chars[i + 1]), 11);
        } else {
          appendBits(ALNUM.indexOf(chars[i]), 6);
        }
      }
    } else {
      for (const b of bytes) appendBits(b, 8);
    }
    const payloadEnd = bits.length;

    // Terminator: up to four 0 bits.
    const terminatorLen = Math.min(4, dataCapacityBits - bits.length);
    for (let i = 0; i < terminatorLen; i++) bits.push(0);
    // Pad to a byte boundary.
    const bitPadLen = (8 - bits.length % 8) % 8;
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad bytes: alternating 11101100 / 00010001.
    const padBytes = [];
    for (let pad = 0xEC; bits.length < dataCapacityBits; pad ^= 0xEC ^ 0x11) {
      appendBits(pad, 8);
      padBytes.push(pad);
    }

    // Pack bits into codewords.
    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataCodewords.push(b);
    }

    // ECC + interleave.
    const blockInfo = {};
    const allCodewords = addEccAndInterleave(dataCodewords, version, ECL[ecl].ordinal, blockInfo);

    // Build the module matrix + choose a mask.
    const grid = buildMatrix(text.length >= 0 ? version : version, ECL[ecl], allCodewords, {
      mask: opts.mask,
      allMasks: opts.allMasks,
    });

    const trace = {
      input: text,
      mode: mode,
      modeLabel: analyze(text).modeLabel,
      bytes: bytes,
      version: version,
      size: grid.size,
      eclRequested: eclName,
      ecl: ecl,
      boosted: ecl !== eclName,
      moduleCount: grid.size * grid.size,

      modeIndicatorBits: toBitStr(modeIndicator(mode), 4),
      charCount: charCount(mode, text, bytes),
      charCountBits: toBitStr(charCount(mode, text, bytes), ccBits),
      charCountBitLen: ccBits,
      payloadBits: bits.slice(payloadStart, payloadEnd).join(''),
      payloadBitLen: payloadEnd - payloadStart,
      terminatorLen: terminatorLen,
      bitPadLen: bitPadLen,
      padBytes: padBytes,

      dataCapacityBits: dataCapacityBits,
      totalDataCodewords: dataCodewords.length,
      dataCodewords: dataCodewords,

      numBlocks: blockInfo.numBlocks,
      numShortBlocks: blockInfo.numShortBlocks,
      blockEccLen: blockInfo.blockEccLen,
      blocks: blockInfo.blocks,
      interleaved: allCodewords,
      totalCodewords: allCodewords.length,

      regionMap: grid.regionMap,
      functionMap: grid.functionMap,
      dataCells: grid.dataCells,
      alignPositions: grid.alignPositions,

      maskScores: grid.maskScores,
      maskMatrices: grid.maskMatrices,
      chosenMask: grid.chosenMask,
    };

    return {
      version: version,
      size: grid.size,
      ecl: ecl,
      mask: grid.chosenMask,
      modules: grid.modules,
      regionMap: grid.regionMap,
      trace: trace,
    };
  }

  // Capacity (in characters) for a given mode across the four ECC levels,
  // at the smallest version that fits — handy for the "choose a level" chapter.
  function capacityFor(text, mode) {
    mode = mode || detectMode(text);
    const out = {};
    ECL_ORDER.forEach(function (lvl) {
      try {
        const r = encode(text, { ecl: lvl, boostEcl: false, mode: mode });
        out[lvl] = {
          version: r.version,
          dataCodewords: r.trace.totalDataCodewords,
          capacityBits: r.trace.dataCapacityBits,
          usedBits: 4 + r.trace.charCountBitLen + r.trace.payloadBitLen,
        };
      } catch (e) {
        out[lvl] = { error: e.message };
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  Rendering helpers
   * ------------------------------------------------------------------ */

  function render(canvas, modules, opts) {
    opts = opts || {};
    const quiet = opts.quiet == null ? 4 : opts.quiet;
    const scale = opts.scale || 8;
    const size = modules.length;
    const dim = (size + quiet * 2) * scale;
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opts.dark || '#0f172a';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
    }
  }

  function toSVG(modules, opts) {
    opts = opts || {};
    const quiet = opts.quiet == null ? 4 : opts.quiet;
    const size = modules.length;
    const dim = size + quiet * 2;
    let path = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) path += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" ' +
      'shape-rendering="crispEdges">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + (opts.light || '#ffffff') + '"/>' +
      '<path d="' + path + '" fill="' + (opts.dark || '#0f172a') + '"/></svg>';
  }

  /* ------------------------------------------------------------------ */

  global.QRCode = {
    ECL: ECL,
    ECL_ORDER: ECL_ORDER,
    ALNUM: ALNUM,
    analyze: analyze,
    encode: encode,
    capacityFor: capacityFor,
    detectMode: detectMode,
    alignmentPositions: alignmentPositions,
    getNumDataCodewords: getNumDataCodewords,
    render: render,
    toSVG: toSVG,
    toBitStr: toBitStr,
  };

})(typeof window !== 'undefined' ? window : this);
