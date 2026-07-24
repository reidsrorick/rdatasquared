/* ==========================================================================
   english.js — the statistical fingerprint of English text.
   This is the ammunition for the attacks: letter frequencies to compare
   against, a chi-squared score to rank candidate decryptions automatically,
   and a small crib list for the two-time-pad drag.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.english = (function () {
  "use strict";

  // Relative frequency of A..Z in ordinary English, as percentages.
  // (Classic corpus figures — good enough to crack schoolbook ciphers.)
  const FREQ = {
    A: 8.17, B: 1.49, C: 2.78, D: 4.25, E: 12.70, F: 2.23, G: 2.02,
    H: 6.09, I: 6.97, J: 0.15, K: 0.77, L: 4.03, M: 2.41, N: 6.75,
    O: 7.51, P: 1.93, Q: 0.10, R: 5.99, S: 6.33, T: 9.06, U: 2.76,
    V: 0.98, W: 2.36, X: 0.15, Y: 1.97, Z: 0.07,
  };

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Expected coincidence rate for English (used by Friedman/IoC in Vigenère).
  const IOC_ENGLISH = 0.0667;
  const IOC_RANDOM = 0.0385; // 1/26

  /** Count A..Z in a string; returns {A:n,...} ignoring case and non-letters. */
  function counts(text) {
    const c = {};
    for (const L of LETTERS) c[L] = 0;
    const up = text.toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const ch = up[i];
      if (ch >= "A" && ch <= "Z") c[ch]++;
    }
    return c;
  }

  /** Same as counts() but returned as percentages of the total letters. */
  function percentages(text) {
    const c = counts(text);
    let total = 0;
    for (const L of LETTERS) total += c[L];
    const p = {};
    for (const L of LETTERS) p[L] = total ? (c[L] / total) * 100 : 0;
    return p;
  }

  /** Chi-squared distance between a text's letter distribution and English.
      Lower = more English-like. This is what lets the Caesar/Vigenère tools
      pick the best shift automatically. */
  function chiSquared(text) {
    const c = counts(text);
    let total = 0;
    for (const L of LETTERS) total += c[L];
    if (total === 0) return Infinity;
    let chi = 0;
    for (const L of LETTERS) {
      const expected = (FREQ[L] / 100) * total;
      const diff = c[L] - expected;
      chi += (diff * diff) / expected;
    }
    return chi;
  }

  /** Index of coincidence: probability two random letters of the text match.
      ~0.067 for English, ~0.038 for uniform-random. The needle Friedman reads. */
  function indexOfCoincidence(text) {
    const c = counts(text);
    let n = 0;
    for (const L of LETTERS) n += c[L];
    if (n < 2) return 0;
    let sum = 0;
    for (const L of LETTERS) sum += c[L] * (c[L] - 1);
    return sum / (n * (n - 1));
  }

  // Short, high-value cribs for guessing at reused-key plaintexts.
  const CRIBS = [
    " the ", " and ", " that ", " have ", " with ", " this ", " from ",
    " you ", " for ", " are ", "the ", " a ", "ing ", "tion", " to ",
    " of ", " in ", " is ", " it ", " be ", " as ", " at ",
  ];

  return {
    FREQ, LETTERS, IOC_ENGLISH, IOC_RANDOM, CRIBS,
    counts, percentages, chiSquared, indexOfCoincidence,
  };
})();
