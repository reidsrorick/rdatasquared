/* ==========================================================================
   kasiski.js — Kasiski examination. Repeated substrings in Vigenère ciphertext
   tend to appear because the same plaintext met the same slice of the keyword.
   The DISTANCE between two such repeats is therefore (usually) a multiple of
   the key length. Collect the distances, factor them, and the key length hides
   in the common factors. Complements the Friedman/IoC estimate in ioc.js.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.kasiski = (function () {
  "use strict";

  /** Find repeated substrings of length `len` and the gaps between occurrences.
      Returns [{seq, positions:[...], distances:[...]}]. */
  function repeats(cipher, len) {
    const s = cipher.toUpperCase().replace(/[^A-Z]/g, "");
    const seen = {};
    for (let i = 0; i + len <= s.length; i++) {
      const seq = s.substr(i, len);
      (seen[seq] = seen[seq] || []).push(i);
    }
    const out = [];
    for (const seq in seen) {
      if (seen[seq].length < 2) continue;
      const positions = seen[seq];
      const distances = [];
      for (let i = 1; i < positions.length; i++) distances.push(positions[i] - positions[0]);
      out.push({ seq, positions, distances });
    }
    return out;
  }

  function factorsOf(n) {
    const f = [];
    for (let d = 2; d <= n; d++) if (n % d === 0) f.push(d);
    return f;
  }

  /** Tally the factors of every repeat-distance. The key length is usually the
      factor that dominates the tally (ignoring 1). Returns [{factor,count}]
      sorted by count desc. */
  function likelyKeyLengths(cipher, len, maxFactor) {
    len = len || 3;
    maxFactor = maxFactor || 20;
    const tally = {};
    for (const r of repeats(cipher, len)) {
      for (const dist of r.distances) {
        for (const f of factorsOf(dist)) {
          if (f <= maxFactor) tally[f] = (tally[f] || 0) + 1;
        }
      }
    }
    return Object.keys(tally)
      .map(f => ({ factor: +f, count: tally[f] }))
      .sort((a, b) => b.count - a.count || a.factor - b.factor);
  }

  return { repeats, factorsOf, likelyKeyLengths };
})();
