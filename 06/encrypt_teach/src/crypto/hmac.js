/* ==========================================================================
   hmac.js — REAL HMAC-SHA-256 and SHA-256 via Web Crypto, plus a DELIBERATELY
   BROKEN verifier for the timing side-channel lesson.

   The point of Lesson 09 is not "HMAC is bad" — HMAC is great. The point is
   that a correct primitive can be destroyed by how you COMPARE its output. The
   naive verifier below bails at the first mismatched byte, so the time it takes
   leaks how many leading bytes were correct. That is the timing oracle.
   The constant-time comparison beside it is the fix.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.hmac = (function () {
  "use strict";
  const subtle = (self.crypto && self.crypto.subtle) || null;
  const B = C101.bytes;

  async function sha256(bytes) {
    return new Uint8Array(await subtle.digest("SHA-256", bytes));
  }

  async function importKey(rawKeyBytes) {
    return subtle.importKey(
      "raw", rawKeyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign", "verify"]);
  }

  /** Compute the real tag over a message with a raw key. */
  async function tag(keyBytes, msgBytes) {
    const key = await importKey(keyBytes);
    return new Uint8Array(await subtle.sign("HMAC", key, msgBytes));
  }

  /** NAIVE, INSECURE comparison: early-exit on the first differing byte.
      Returns {equal, comparisons} where `comparisons` is how many bytes were
      inspected before returning — the quantity a timing attacker measures. */
  function insecureEqual(a, b) {
    if (a.length !== b.length) return { equal: false, comparisons: 0 };
    let i = 0;
    for (; i < a.length; i++) {
      if (a[i] !== b[i]) return { equal: false, comparisons: i + 1 };
    }
    return { equal: true, comparisons: i };
  }

  /** CONSTANT-TIME comparison: always scans every byte, accumulating diffs.
      The running time no longer depends on where the first mismatch is. */
  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  return { available: !!subtle, sha256, tag, insecureEqual, constantTimeEqual };
})();
