/* ==========================================================================
   toy-rsa.js — RSA at toy scale using BigInt with SMALL primes.
   RSA is a trapdoor permutation: easy to compute one way (modular expona-
   tiation), hard to invert without the secret factorisation.

   >>> BIT SIZE: the default primes here are ~16 bits each, giving a ~32-bit
       modulus. Real deployments use n of AT LEAST 2048 bits (primes ~1024
       bits). This code is a teaching model and is trivially breakable. <<<

   This file also demonstrates "textbook" RSA on purpose: encryption is a bare
   modular exponentiation with NO padding, which makes it deterministic and
   therefore NOT IND-CPA secure. Lesson 08 attacks exactly that.
   TEACHING ONLY — never use for anything real.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.toyRSA = (function () {
  "use strict";

  // ---- BigInt modular arithmetic ----
  function mod(a, m) { return ((a % m) + m) % m; }

  function modPow(base, exp, m) {
    base = mod(base, m);
    let result = 1n;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % m;
      base = (base * base) % m;
      exp >>= 1n;
    }
    return result;
  }

  // Extended Euclid -> modular inverse.
  function egcd(a, b) {
    if (b === 0n) return [a, 1n, 0n];
    const [g, x, y] = egcd(b, a % b);
    return [g, y, x - (a / b) * y];
  }
  function modInverse(a, m) {
    const [g, x] = egcd(mod(a, m), m);
    if (g !== 1n) throw new Error("no modular inverse (e not coprime to phi)");
    return mod(x, m);
  }

  // Small deterministic primality check — fine for teaching-size numbers.
  function isPrime(n) {
    if (n < 2n) return false;
    for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n]) {
      if (n % p === 0n) return n === p;
    }
    let d = n - 1n, r = 0n;
    while (d % 2n === 0n) { d /= 2n; r++; }
    witness: for (const a of [2n, 7n, 61n]) {
      if (a % n === 0n) continue;
      let x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      for (let i = 0n; i < r - 1n; i++) {
        x = (x * x) % n;
        if (x === n - 1n) continue witness;
      }
      return false;
    }
    return true;
  }

  /** Build a keypair from two (small, teaching-size) primes. */
  function keypair(p, q, e) {
    p = BigInt(p); q = BigInt(q); e = BigInt(e || 65537);
    if (!isPrime(p) || !isPrime(q)) throw new Error("p and q must both be prime");
    if (p === q) throw new Error("p and q must differ");
    const n = p * q;
    const phi = (p - 1n) * (q - 1n);
    if (egcd(e, phi)[0] !== 1n) throw new Error("e must be coprime to phi(n)");
    const d = modInverse(e, phi);
    const bits = n.toString(2).length;
    return { p, q, n, phi, e, d, bits };
  }

  // Textbook RSA: NO padding, NO randomness -> deterministic. That is the bug.
  function encrypt(mBig, pub) { return modPow(BigInt(mBig), pub.e, pub.n); }
  function decrypt(cBig, priv) { return modPow(BigInt(cBig), priv.d, priv.n); }

  return { modPow, modInverse, egcd, isPrime, keypair, encrypt, decrypt, mod };
})();
