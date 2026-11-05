/* ==========================================================================
   bytes.js — the plumbing every other module leans on.
   Conversions between strings, byte arrays, hex, base64, and bits.
   Loaded as a classic script (NOT an ES module) so the pages open straight
   off the filesystem in Chrome without a dev server. Everything hangs off the
   single global namespace C101.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.bytes = (function () {
  "use strict";

  const enc = new TextEncoder();   // UTF-8
  const dec = new TextDecoder();

  /** UTF-8 string -> Uint8Array */
  function strToBytes(str) { return enc.encode(str); }

  /** Uint8Array -> UTF-8 string (invalid sequences become U+FFFD) */
  function bytesToStr(bytes) { return dec.decode(bytes); }

  /** Uint8Array -> lowercase hex, no separators */
  function bytesToHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
  }

  /** hex string (spaces/newlines tolerated) -> Uint8Array */
  function hexToBytes(hex) {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  /** Uint8Array -> standard base64 (uses the browser's btoa on a latin1 view) */
  function bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /** base64 -> Uint8Array */
  function b64ToBytes(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** XOR two byte arrays. Length = min(a,b) unless {pad:true} extends with the
      shorter treated as zero-extended. Returns a fresh Uint8Array. */
  function xorBytes(a, b, opts) {
    const n = (opts && opts.pad) ? Math.max(a.length, b.length)
                                 : Math.min(a.length, b.length);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (a[i] || 0) ^ (b[i] || 0);
    return out;
  }

  /** one byte -> "01001101" */
  function byteToBits(b) { return b.toString(2).padStart(8, "0"); }

  /** array/Uint8Array of bytes -> flat array of 0/1 numbers, MSB first */
  function bytesToBitArray(bytes) {
    const bits = [];
    for (let i = 0; i < bytes.length; i++) {
      for (let k = 7; k >= 0; k--) bits.push((bytes[i] >> k) & 1);
    }
    return bits;
  }

  /** inverse of bytesToBitArray */
  function bitArrayToBytes(bits) {
    const out = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) out[i >> 3] |= (1 << (7 - (i & 7)));
    }
    return out;
  }

  /** printable rendering of a byte: the char if it's printable ASCII, else '·' */
  function printable(byteVal) {
    return (byteVal >= 0x20 && byteVal <= 0x7e) ? String.fromCharCode(byteVal) : "·";
  }

  return {
    strToBytes, bytesToStr, bytesToHex, hexToBytes, bytesToB64, b64ToBytes,
    xorBytes, byteToBits, bytesToBitArray, bitArrayToBytes, printable,
  };
})();
