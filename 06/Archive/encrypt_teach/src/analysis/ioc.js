/* ==========================================================================
   ioc.js — Friedman's index-of-coincidence attack on Vigenère period length.
   For each candidate key length k, split the ciphertext into k columns and
   average their indices of coincidence. When k is the true key length, each
   column is a single Caesar shift of English, so its IoC jumps toward the
   English value (~0.067). Wrong k's look random (~0.038). The winning k is
   the period. Pairs with kasiski.js.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.ioc = (function () {
  "use strict";
  const E = C101.english;

  /** Average IoC of the k columns for a given period. */
  function averageIoCForPeriod(cipher, k) {
    const letters = cipher.toUpperCase().replace(/[^A-Z]/g, "");
    const cols = Array.from({ length: k }, () => "");
    for (let i = 0; i < letters.length; i++) cols[i % k] += letters[i];
    let sum = 0;
    for (const c of cols) sum += E.indexOfCoincidence(c);
    return sum / k;
  }

  /** Score every period from 1..maxK. Returns [{period, ioc}] sorted so the
      most English-like (closest to 0.067) is first. */
  function scorePeriods(cipher, maxK) {
    maxK = maxK || 16;
    const out = [];
    for (let k = 1; k <= maxK; k++) {
      out.push({ period: k, ioc: averageIoCForPeriod(cipher, k) });
    }
    return out;
  }

  /** Best-guess period: the k whose average IoC is closest to English, with a
      mild penalty on larger k so we prefer the smallest period that fits
      (multiples of the true period also score well). */
  function bestPeriod(cipher, maxK) {
    const scored = scorePeriods(cipher, maxK);
    // Pick the smallest period whose average IoC is within reach of English
    // (multiples of the true period also score well, so smallest-that-fits is
    // the right tie-break); fall back to the maximum-IoC period otherwise.
    const threshold = (E.IOC_ENGLISH + E.IOC_RANDOM) / 2; // ~0.052
    const candidates = scored.filter(s => s.ioc >= threshold);
    if (candidates.length) {
      candidates.sort((a, b) => a.period - b.period);
      return candidates[0].period;
    }
    scored.sort((a, b) => b.ioc - a.ioc);
    return scored[0].period;
  }

  return { averageIoCForPeriod, scorePeriods, bestPeriod };
})();
