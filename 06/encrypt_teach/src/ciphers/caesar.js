/* ==========================================================================
   caesar.js — the shift cipher. The entire key is ONE number (0..25).
   This tiny keyspace is the whole lesson: 25 guesses and you are done.
   Pure functions, no DOM. TEACHING ONLY.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.caesar = (function () {
  "use strict";
  const A = 65; // 'A'

  /** Shift a single letter by n; leaves non-letters untouched, preserves case. */
  function shiftChar(ch, n) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90)  return String.fromCharCode((code - 65 + n + 26) % 26 + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode((code - 97 + n + 26) % 26 + 97);
    return ch;
  }

  /** Encrypt: every letter moves forward `shift` places in the alphabet. */
  function encrypt(text, shift) {
    const n = ((shift % 26) + 26) % 26;
    let out = "";
    for (let i = 0; i < text.length; i++) out += shiftChar(text[i], n);
    return out;
  }

  /** Decrypt is just encryption by the negative shift. */
  function decrypt(text, shift) { return encrypt(text, -shift); }

  /** THE BREAK. Return all 25 non-trivial decryptions, each scored by how
      English-like it looks (chi-squared: lower is better). The attacker just
      reads the list — no key needed, because there are only 25 keys. */
  function bruteForce(cipher) {
    const results = [];
    for (let s = 0; s < 26; s++) {
      const text = decrypt(cipher, s);
      results.push({ shift: s, text: text, score: C101.english.chiSquared(text) });
    }
    // Best guess first.
    return results.slice().sort((a, b) => a.score - b.score).map(r => r);
  }

  return { encrypt, decrypt, bruteForce, shiftChar };
})();
