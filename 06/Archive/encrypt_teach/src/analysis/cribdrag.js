/* ==========================================================================
   cribdrag.js — the two-time-pad attack. If one pad key K is reused on two
   messages:  C1 = P1 ⊕ K   and   C2 = P2 ⊕ K.
   XOR the ciphertexts and the KEY CANCELS:
       C1 ⊕ C2 = (P1 ⊕ K) ⊕ (P2 ⊕ K) = P1 ⊕ P2.
   The attacker now has P1 ⊕ P2 with no key at all. "Crib-drag" a likely word
   (e.g. " the ") along it: at each offset, XOR the crib in; if the result at
   that window is readable English, you have simultaneously found a slice of the
   OTHER plaintext. Slide, guess, extend. Both messages unravel together.
   This is why OTP keys are ONE-time.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.cribdrag = (function () {
  "use strict";
  const B = C101.bytes;

  /** P1 ⊕ P2 from the two ciphertexts (the key has vanished). */
  function combine(c1, c2) { return B.xorBytes(c1, c2); }

  /** Slide `crib` (a string) across xored = P1⊕P2. At offset i, compute
      xored[i..] ⊕ crib. If crib sat under P1 there, this window equals P2's
      bytes there (and vice-versa). We score each offset by how printable/
      English the revealed window is, so good guesses float to the top. */
  function dragCrib(xored, crib) {
    const cribBytes = B.strToBytes(crib);
    const results = [];
    for (let off = 0; off + cribBytes.length <= xored.length; off++) {
      let revealed = "";
      let printableCount = 0;
      for (let k = 0; k < cribBytes.length; k++) {
        const v = xored[off + k] ^ cribBytes[k];
        revealed += B.printable(v);
        if (v === 0x20 || (v >= 0x41 && v <= 0x7a)) printableCount++;
      }
      results.push({
        offset: off,
        revealed,
        score: printableCount / cribBytes.length, // 1.0 = all letters/space
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /** Once the analyst commits "at offset o, message A reads `guess`", the same
      bytes reveal message B there: B = (P1⊕P2)[o..] ⊕ guess. Returns the bytes. */
  function revealOther(xored, offset, guess) {
    const g = B.strToBytes(guess);
    const out = new Uint8Array(g.length);
    for (let k = 0; k < g.length; k++) out[k] = (xored[offset + k] || 0) ^ g[k];
    return out;
  }

  return { combine, dragCrib, revealOther };
})();
