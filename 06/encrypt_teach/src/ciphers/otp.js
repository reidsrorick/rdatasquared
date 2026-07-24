/* ==========================================================================
   otp.js — the one-time pad. XOR the message with a truly random key that is
   as long as the message and NEVER reused. Provably unbreakable: every
   plaintext of the right length is equally consistent with the ciphertext.
   The catch is entirely operational — key length = message length, one use
   only. Reuse the key even once and the perfection evaporates (see the
   two-time-pad attack in analysis/cribdrag.js). Works on bytes.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.otp = (function () {
  "use strict";

  /** A true-random key of n bytes from the OS CSPRNG. */
  function randomKey(n) {
    const k = new Uint8Array(n);
    crypto.getRandomValues(k);
    return k;
  }

  /** Encrypt = decrypt = XOR. Symmetric by construction. Byte arrays in/out. */
  function xor(dataBytes, keyBytes) {
    if (keyBytes.length < dataBytes.length) {
      throw new Error("one-time pad requires key at least as long as message");
    }
    return C101.bytes.xorBytes(dataBytes, keyBytes);
  }

  // Convenience string helpers for the UI.
  function encryptString(plaintext, keyBytes) {
    return xor(C101.bytes.strToBytes(plaintext), keyBytes);
  }
  function decryptToString(cipherBytes, keyBytes) {
    return C101.bytes.bytesToStr(xor(cipherBytes, keyBytes));
  }

  return { randomKey, xor, encryptString, decryptToString };
})();
