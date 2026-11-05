/* ==========================================================================
   substitution.js — a monoalphabetic substitution cipher.
   The key is a permutation of the alphabet: 26! ≈ 4.0e26 ≈ 2^88 possibilities.
   That is astronomically more than Caesar's 25. And it does not matter.
   Frequency analysis (see src/analysis/frequency.js) ignores the keyspace
   entirely and attacks the statistics instead. This file is the "how it works"
   half; the break lives next door. TEACHING ONLY.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.substitution = (function () {
  "use strict";
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /** Deterministic pseudo-random permutation from a seed string, so lessons
      are reproducible without Math.random. Fisher–Yates driven by a tiny
      string hash. */
  function keyFromSeed(seed) {
    let h = 2166136261 >>> 0; // FNV-ish
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const arr = ALPHA.split("");
    for (let i = arr.length - 1; i > 0; i--) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      const j = h % (i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.join("");
  }

  /** Validate a 26-letter key (a permutation of A..Z). Returns null if bad. */
  function normalizeKey(key) {
    const k = (key || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (k.length !== 26) return null;
    if (new Set(k.split("")).size !== 26) return null;
    return k;
  }

  /** Build plaintext->cipher and cipher->plaintext maps from a key. */
  function maps(key) {
    const enc = {}, dec = {};
    for (let i = 0; i < 26; i++) {
      enc[ALPHA[i]] = key[i];
      dec[key[i]] = ALPHA[i];
    }
    return { enc, dec };
  }

  function apply(text, table) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const up = ch.toUpperCase();
      if (table[up]) {
        const mapped = table[up];
        out += (ch === up) ? mapped : mapped.toLowerCase();
      } else {
        out += ch;
      }
    }
    return out;
  }

  function encrypt(text, key) {
    const k = normalizeKey(key);
    if (!k) throw new Error("key must be a permutation of the 26 letters");
    return apply(text, maps(k).enc);
  }
  function decrypt(text, key) {
    const k = normalizeKey(key);
    if (!k) throw new Error("key must be a permutation of the 26 letters");
    return apply(text, maps(k).dec);
  }

  return { ALPHA, keyFromSeed, normalizeKey, maps, encrypt, decrypt };
})();
