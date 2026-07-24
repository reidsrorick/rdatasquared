/* ==========================================================================
   ecdh.js — REAL Elliptic-Curve Diffie–Hellman via Web Crypto (P-256).
   This is the grown-up version of the toy BigInt DH: same idea (both sides
   derive a shared secret from their own private key and the other's public
   key), but over a curve where the discrete-log problem is genuinely hard.
   Used on the DH lesson to contrast the crackable toy with the real thing.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.ecdh = (function () {
  "use strict";
  const subtle = (self.crypto && self.crypto.subtle) || null;

  async function generateParty() {
    return subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  }

  /** Derive the raw shared secret bytes from my private key and their public. */
  async function deriveShared(myPrivateKey, theirPublicKey) {
    const bits = await subtle.deriveBits(
      { name: "ECDH", public: theirPublicKey }, myPrivateKey, 256);
    return new Uint8Array(bits);
  }

  return { available: !!subtle, generateParty, deriveShared };
})();
