/* ==========================================================================
   vigenere.js — polyalphabetic substitution. A keyword picks a different
   Caesar shift for each successive letter, so the same plaintext letter
   encrypts differently depending on position. This flattens the single-letter
   frequencies that killed the substitution cipher.
   Its weakness is that the keyword REPEATS, giving the ciphertext a hidden
   period. Find the period (Kasiski/Friedman) and it collapses into that many
   independent Caesar ciphers. TEACHING ONLY.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.vigenere = (function () {
  "use strict";

  function cleanKey(key) {
    const k = (key || "").toUpperCase().replace(/[^A-Z]/g, "");
    return k.length ? k : null;
  }

  /** Core. dir = +1 encrypt, -1 decrypt. The key advances ONLY on letters,
      so spaces and punctuation don't consume key positions. */
  function run(text, key, dir) {
    const k = cleanKey(key);
    if (!k) throw new Error("key must contain at least one letter");
    let out = "", ki = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const code = ch.charCodeAt(0);
      let base = -1;
      if (code >= 65 && code <= 90) base = 65;
      else if (code >= 97 && code <= 122) base = 97;
      if (base === -1) { out += ch; continue; }
      const shift = k.charCodeAt(ki % k.length) - 65;
      const p = code - base;
      out += String.fromCharCode((p + dir * shift + 26) % 26 + base);
      ki++;
    }
    return out;
  }

  function encrypt(text, key) { return run(text, key, +1); }
  function decrypt(text, key) { return run(text, key, -1); }

  /** Given the (presumed) period, slice the ciphertext letters into that many
      columns. Each column was encrypted with a single Caesar shift, so each
      can be cracked independently — the reduction that ends Vigenère. */
  function columns(cipher, period) {
    const letters = cipher.toUpperCase().replace(/[^A-Z]/g, "");
    const cols = Array.from({ length: period }, () => "");
    for (let i = 0; i < letters.length; i++) cols[i % period] += letters[i];
    return cols;
  }

  /** For each column, pick the Caesar shift whose decryption looks most like
      English (chi-squared). Concatenating the winning shifts recovers the key. */
  function recoverKey(cipher, period) {
    const cols = columns(cipher, period);
    let key = "";
    for (const col of cols) {
      let best = 0, bestScore = Infinity;
      for (let s = 0; s < 26; s++) {
        const dec = C101.caesar.decrypt(col, s);
        const score = C101.english.chiSquared(dec);
        if (score < bestScore) { bestScore = score; best = s; }
      }
      key += String.fromCharCode(65 + best);
    }
    return key;
  }

  return { encrypt, decrypt, columns, recoverKey, cleanKey };
})();
