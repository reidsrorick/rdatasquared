/* ==========================================================================
   encoding.js — for Lesson 0, "Encoding is not encryption."
   These transforms move data between representations. NONE of them is a
   secret-keeping operation: anybody can reverse Base64/hex/ROT13 with no key,
   because there is no key. That is the whole point of the sorting exercise.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.encoding = (function () {
  "use strict";
  const B = C101.bytes;

  const base64 = {
    label: "Base64",
    reversible: true,
    reversibleByWhom: "anyone",
    encode: (s) => B.bytesToB64(B.strToBytes(s)),
    decode: (s) => B.bytesToStr(B.b64ToBytes(s)),
  };

  const hex = {
    label: "Hex",
    reversible: true,
    reversibleByWhom: "anyone",
    encode: (s) => B.bytesToHex(B.strToBytes(s)),
    decode: (s) => B.bytesToStr(B.hexToBytes(s)),
  };

  // ROT13 — a Caesar shift of 13. Presented here as the deceptive one: it
  // "looks" scrambled but is its own inverse and keyless. It is encoding.
  const rot13 = {
    label: "ROT13",
    reversible: true,
    reversibleByWhom: "anyone",
    encode: (s) => C101.caesar.encrypt(s, 13),
    decode: (s) => C101.caesar.encrypt(s, 13),
  };

  return { base64, hex, rot13 };
})();
