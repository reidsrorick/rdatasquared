/* ==========================================================================
   timing.js — a real, measurable timing side channel, in your browser.
   A server verifies a MAC tag with a naive byte-by-byte compare that bails at
   the first wrong byte (see hmac.insecureEqual). The time depends on how many
   LEADING bytes are correct — a leak. Timing it recovers the tag one byte at a
   time, without ever seeing it: for each position, the guess that takes longest
   is the right byte.

   Two honest details this models faithfully:
   1. The LAST byte carries no timing signal — matching it and missing it both
      run the compare to the same length. So the classic attack times the first
      n-1 bytes, then BRUTE-FORCES the final byte against the accept/reject
      answer. We do exactly that.
   2. Browser timers are clamped to ~0.1 ms and jitter only ever ADDS time, so
      the MINIMUM over several short trials converges to the clean runtime. We
      scan all 256 candidates cheaply, then run a high-trial RUNOFF among the
      finalists — the statistical care a patient attacker applies over many
      requests.

   The mechanism behind "don't roll your own crypto": the primitive is fine; the
   comparison betrayed it.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.timing = (function () {
  "use strict";

  const TAG_LEN = 3;       // bytes 0..n-2 recovered by timing, last byte brute-forced
  const WORK = 130;        // inner busy-work per byte
  const TOTAL_ROUNDS = 6;  // interleaved round-robin passes over all 256 candidates
  const ROUND_BUDGET_MS = 4500; // hard per-position cap so a slow machine never hangs
  const TARGET_MS_PER_BYTE = 1.6; // calibrated signal size — machine-independent

  let REPS = 700;          // outer repeats; set by calibrate() to hit the target
  let secret = null;
  let sink = 0;            // prevents the engine from optimizing the work away
  let secureMode = false;
  let calibrated = false;

  function newSecret() {
    secret = new Uint8Array(TAG_LEN);
    crypto.getRandomValues(secret);
    return secret;
  }

  /** Size REPS so that one extra matched byte costs ~TARGET_MS_PER_BYTE of wall
      time on THIS machine. Fast machines get more reps, slow machines fewer, so
      the signal (and the total runtime) is the same everywhere — and always
      well above the ~0.1 ms timer floor. */
  function calibrate() {
    if (!secret) newSecret();
    const matched = secret.slice(); // matches all bytes -> processes TAG_LEN bytes/rep
    for (let i = 0; i < 20; i++) oracle(matched); // warm up
    let full = Infinity;
    for (let t = 0; t < 5; t++) {
      const t0 = performance.now(); oracle(matched); const dt = performance.now() - t0;
      if (dt < full) full = dt;
    }
    // signal for one byte ~= full / TAG_LEN at the current REPS
    const signalNow = Math.max(full / TAG_LEN, 1e-4);
    REPS = Math.max(60, Math.min(20000, Math.round(REPS * (TARGET_MS_PER_BYTE / signalNow))));
    calibrated = true;
  }
  function setSecureMode(on) { secureMode = !!on; }

  /** The vulnerable check. Early-exits on the first wrong byte, so its RUNTIME
      encodes the matched-prefix length. Secure mode scans every byte, so the
      runtime is independent of the guess and the timing attack goes flat. */
  function oracle(guess) {
    for (let rep = 0; rep < REPS; rep++) {
      let diff = 0;
      for (let i = 0; i < secret.length; i++) {
        for (let w = 0; w < WORK; w++) sink += (secret[i] * 31 + w) & 7;
        if (secureMode) {
          diff |= secret[i] ^ guess[i];       // always scans all bytes
        } else if (secret[i] !== guess[i]) {
          break;                              // <-- the early exit is the leak
        }
      }
      sink += diff;
    }
  }

  /** The accept/reject answer any verifier must expose: does the tag match? */
  function verify(guess) {
    for (let i = 0; i < secret.length; i++) if (secret[i] !== guess[i]) return false;
    return true;
  }

  /** One timed oracle run for a candidate byte at `pos`. */
  function timeOne(guess, pos, v) {
    guess[pos] = v;
    for (let j = pos + 1; j < TAG_LEN; j++) guess[j] = 0;
    const t0 = performance.now();
    oracle(guess);
    return performance.now() - t0;
  }

  const tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  /** Recover one (non-final) byte at `pos` by timing. Measurements are
      INTERLEAVED — we sweep ALL 256 candidates once per round and keep each
      one's minimum across rounds — so a momentary slow patch of the machine
      hits every candidate evenly instead of pinning one candidate's sample, and
      no candidate is ever eliminated early. Jitter only adds time, so the min
      converges to each candidate's clean runtime; the correct byte's clean time
      is highest because matching lets the compare run one byte further. */
  async function profilePosition(knownPrefix, pos, onProgress) {
    if (!calibrated) calibrate();
    const guess = new Uint8Array(TAG_LEN);
    guess.set(knownPrefix.subarray(0, pos));
    for (let i = 0; i < 30; i++) oracle(guess); // warm up JIT

    const times = new Array(256);
    for (let v = 0; v < 256; v++) times[v] = { byte: v, time: Infinity };

    const deadline = performance.now() + ROUND_BUDGET_MS;
    for (let round = 0; round < TOTAL_ROUNDS; round++) {
      for (let v = 0; v < 256; v++) {
        const t = timeOne(guess, pos, v);
        if (t < times[v].time) times[v].time = t;
      }
      if (onProgress) onProgress(round, times, argMax(times));
      await tick();
      if (round >= 2 && performance.now() > deadline) break; // slow machine: stop early with what we have
    }
    return { times, bestByte: argMax(times) };
  }

  function argMax(times) {
    let b = 0, bt = -1;
    for (let k = 0; k < times.length; k++) if (times[k].time !== Infinity && times[k].time > bt) { bt = times[k].time; b = k; }
    return b;
  }

  /** The final byte has no timing signal — try all 256 against accept/reject. */
  function bruteForceLastByte(knownPrefix) {
    const guess = new Uint8Array(TAG_LEN);
    guess.set(knownPrefix.subarray(0, TAG_LEN - 1));
    for (let v = 0; v < 256; v++) {
      guess[TAG_LEN - 1] = v;
      if (verify(guess)) return v;
    }
    return null;
  }

  return {
    TAG_LEN, newSecret, setSecureMode, profilePosition, bruteForceLastByte,
    getSecret: function () { return secret; },
  };
})();
