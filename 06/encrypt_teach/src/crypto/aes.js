/* ==========================================================================
   aes.js — REAL AES via the Web Crypto API. Nothing here is hand-rolled; the
   browser's vetted implementation does the cryptography. We only orchestrate
   modes so the lessons can show their behaviour.

   Modes exposed:
     - ECB : NOT offered by Web Crypto (deliberately — it's unsafe). We build it
             for the lesson by encrypting each 16-byte block independently with
             a single-block AES-CBC call and a zero IV. This is exactly what
             makes the ECB penguin possible, and exactly why you never use it.
     - CBC : chained blocks, needs an IV.
     - CTR : AES as a keystream; the malleability lesson lives here.
     - GCM : AEAD — encryption + authentication. The fix for CTR's malleability.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.aes = (function () {
  "use strict";
  const subtle = (self.crypto && self.crypto.subtle) || null;

  function assertSubtle() {
    if (!subtle) throw new Error(
      "Web Crypto (crypto.subtle) is unavailable here. Serve over http(s) or " +
      "use a browser that exposes it on file:// (Chrome/Firefox do)."
    );
  }

  async function importRaw(rawKeyBytes, algoName, usages) {
    assertSubtle();
    return subtle.importKey("raw", rawKeyBytes, { name: algoName }, false, usages);
  }

  /** Generate a raw AES key of the given bit length (128/192/256). */
  async function randomKeyBytes(bits) {
    const k = new Uint8Array((bits || 128) / 8);
    crypto.getRandomValues(k);
    return k;
  }

  // ---- ECB, assembled block-by-block for the demo ----
  // We use single-block AES-CBC with a zero IV: for one 16-byte block, CBC with
  // a zero IV is identical to the raw AES block function = ECB on that block.
  const ZERO_IV = new Uint8Array(16);

  async function ecbEncrypt(keyBytes, dataBytes) {
    assertSubtle();
    const key = await importRaw(keyBytes, "AES-CBC", ["encrypt"]);
    // pad to a whole number of blocks with zeros (teaching image data only)
    const nblocks = Math.ceil(dataBytes.length / 16);
    const padded = new Uint8Array(nblocks * 16);
    padded.set(dataBytes);
    const out = new Uint8Array(nblocks * 16);
    for (let b = 0; b < nblocks; b++) {
      const block = padded.subarray(b * 16, b * 16 + 16);
      // Encrypt one block; CBC appends its own padding block, so take first 16.
      const ct = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv: ZERO_IV }, key, block));
      out.set(ct.subarray(0, 16), b * 16);
    }
    return out; // identical plaintext blocks -> identical ciphertext blocks
  }

  // ---- CBC ----
  async function cbcEncrypt(keyBytes, dataBytes, iv) {
    assertSubtle();
    iv = iv || crypto.getRandomValues(new Uint8Array(16));
    const key = await importRaw(keyBytes, "AES-CBC", ["encrypt"]);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, key, dataBytes));
    return { iv, ciphertext: ct };
  }

  // ---- CTR ----
  async function ctrEncrypt(keyBytes, dataBytes, counter) {
    assertSubtle();
    counter = counter || crypto.getRandomValues(new Uint8Array(16));
    const key = await importRaw(keyBytes, "AES-CTR", ["encrypt"]);
    const ct = new Uint8Array(await subtle.encrypt(
      { name: "AES-CTR", counter, length: 64 }, key, dataBytes));
    return { counter, ciphertext: ct };
  }
  async function ctrDecrypt(keyBytes, ctBytes, counter) {
    assertSubtle();
    const key = await importRaw(keyBytes, "AES-CTR", ["decrypt"]);
    return new Uint8Array(await subtle.decrypt(
      { name: "AES-CTR", counter, length: 64 }, key, ctBytes));
  }

  // ---- GCM (AEAD) ----
  async function gcmEncrypt(keyBytes, dataBytes, iv) {
    assertSubtle();
    iv = iv || crypto.getRandomValues(new Uint8Array(12));
    const key = await importRaw(keyBytes, "AES-GCM", ["encrypt"]);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, dataBytes));
    return { iv, ciphertext: ct };
  }
  /** Returns the plaintext, or throws if the tag doesn't verify — that throw is
      the whole point of AEAD: a tampered ciphertext is REJECTED, not silently
      decrypted to garbage-with-a-flipped-bit. */
  async function gcmDecrypt(keyBytes, ctBytes, iv) {
    assertSubtle();
    const key = await importRaw(keyBytes, "AES-GCM", ["decrypt"]);
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv }, key, ctBytes));
  }

  return {
    available: !!subtle,
    randomKeyBytes,
    ecbEncrypt, cbcEncrypt,
    ctrEncrypt, ctrDecrypt,
    gcmEncrypt, gcmDecrypt,
  };
})();
