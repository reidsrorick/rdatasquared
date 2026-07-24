/* ==========================================================================
   toy-dh.js — Diffie–Hellman key exchange with BigInt and a SMALL prime.
   Two parties agree on a shared secret over a public channel, never sending
   the secret itself. Security rests on the discrete-log problem: given g^a mod p
   it is hard to find a — when p is large.

   >>> BIT SIZE: the default prime here is ~11 bits. Real deployments use a
       prime p of AT LEAST 2048 bits, or better, an elliptic curve such as
       X25519. This toy prime can be broken by hand. <<<

   DH gives secrecy against a PASSIVE eavesdropper but says nothing about WHO
   is on the other end — a man in the middle defeats unauthenticated DH. That
   gap is what motivates authenticated key exchange / signatures. TEACHING ONLY.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.toyDH = (function () {
  "use strict";
  const modPow = C101.toyRSA.modPow;

  // A small "safe-ish" prime and generator for demonstrations.
  const DEFAULT_P = 2087n;
  const DEFAULT_G = 5n;

  /** One side's public value from a private exponent: A = g^a mod p. */
  function publicValue(priv, g, p) {
    return modPow(BigInt(g || DEFAULT_G), BigInt(priv), BigInt(p || DEFAULT_P));
  }

  /** Shared secret from your private and the other side's public value:
      s = B^a mod p = (g^b)^a = g^(ab) = A^b. Both sides land on the same s. */
  function sharedSecret(theirPublic, myPriv, p) {
    return modPow(BigInt(theirPublic), BigInt(myPriv), BigInt(p || DEFAULT_P));
  }

  /** THE BREAK (passive attacker): brute-force the discrete log because p is
      tiny. Returns the private exponent a such that g^a mod p == pub, or null. */
  function crackDiscreteLog(pub, g, p) {
    g = BigInt(g || DEFAULT_G); p = BigInt(p || DEFAULT_P); pub = BigInt(pub);
    let acc = 1n;
    for (let a = 0n; a < p; a++) {
      if (acc === pub) return a;
      acc = (acc * g) % p;
    }
    return null;
  }

  return { DEFAULT_P, DEFAULT_G, publicValue, sharedSecret, crackDiscreteLog };
})();
