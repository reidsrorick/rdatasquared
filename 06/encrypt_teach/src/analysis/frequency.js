/* ==========================================================================
   frequency.js — the attack that ends monoalphabetic substitution and carries
   the site's central idea: KEYSPACE SIZE IS NOT SECURITY. A substitution key
   has 26! ≈ 2^88 possibilities, but the cipher preserves each letter's
   frequency, so English's fingerprint (E, T, A, O... common; Q, X, Z rare)
   shows straight through. Match the shapes and the key falls out.
   Pure helpers; the drag UI lives in src/ui/mapping-board.js.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.frequency = (function () {
  "use strict";
  const E = C101.english;

  /** Cipher-letter percentages sorted most→least frequent. */
  function ranked(cipher) {
    const p = E.percentages(cipher);
    return E.LETTERS
      .map(L => ({ letter: L, pct: p[L] }))
      .sort((a, b) => b.pct - a.pct);
  }

  /** A first-guess key mapping produced purely from frequency order: map the
      most common ciphertext letter to E, next to T, and so on down the English
      frequency ranking. This is the automatic "seed" the user then refines by
      hand on the mapping board — it is usually ~50-70% right, which is the
      point: the machine gets you most of the way with zero keyspace search. */
  function frequencySeedMap(cipher) {
    const englishOrder = E.LETTERS
      .map(L => ({ letter: L, pct: E.FREQ[L] }))
      .sort((a, b) => b.pct - a.pct)
      .map(x => x.letter);
    const cipherOrder = ranked(cipher).map(x => x.letter);
    const map = {}; // cipherLetter -> guessed plaintext letter
    for (let i = 0; i < 26; i++) map[cipherOrder[i]] = englishOrder[i];
    return map;
  }

  /** Apply a partial cipher->plain map. Unmapped letters render as a placeholder
      so the user sees which slots are still open. Preserves case & punctuation. */
  function applyMap(cipher, map, placeholder) {
    placeholder = placeholder || "·";
    let out = "";
    for (let i = 0; i < cipher.length; i++) {
      const ch = cipher[i];
      const up = ch.toUpperCase();
      if (up >= "A" && up <= "Z") {
        const g = map[up];
        if (!g) { out += placeholder; }
        else out += (ch === up) ? g : g.toLowerCase();
      } else out += ch;
    }
    return out;
  }

  return { ranked, frequencySeedMap, applyMap };
})();
