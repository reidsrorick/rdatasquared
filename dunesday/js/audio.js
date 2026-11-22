/* ============================================================
   DUNESDAY — desert hum
   An original drone synthesized live with the Web Audio API
   (no audio files). Used for the swell in the last 10 seconds
   before each showing; main.js fades the song out and this in.
   ============================================================ */
window.DunesdayAudio = (() => {
  "use strict";

  const BASE = 0.2; // resting volume
  let ctx = null;
  let master, filter, voiceGain;
  let on = false;
  let swelling = false;
  let lastBoom = 0;

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);

    // Low drone: detuned saws on A, plus a fifth, through a resonant low-pass.
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    filter.Q.value = 5;
    filter.connect(master);
    [[55, 0.22], [55.35, 0.22], [82.4, 0.1], [110, 0.06]].forEach(([f, g]) => osc("sawtooth", f, g, filter));

    // Filter slowly opens and closes, like wind over sand.
    lfo(0.05, 140, filter.frequency);

    // A distant voice: a saw shaped by two vowel formants, with a slow vibrato.
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.035;
    voiceGain.connect(master);
    const voice = ctx.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.value = 220;
    lfo(4.2, 1.6, voice.frequency);
    [[650, 9], [1080, 11]].forEach(([f, q]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      voice.connect(bp).connect(voiceGain);
    });
    voice.start();
    lfo(0.03, 0.025, voiceGain.gain);

    // Wind: looping noise through a wide band-pass.
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 900;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.045;
    noise.connect(nf).connect(ng).connect(master);
    lfo(0.11, 0.03, ng.gain);
    noise.start();
    return true;
  }

  function osc(type, freq, gain, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start();
    return o;
  }

  function lfo(rate, depth, param) {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
  }

  // A deep hit: a sine that drops in pitch, like a drum far away.
  function boom(strength = 0.6) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(strength, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 1.5);
  }

  function rampTo(param, value, seconds) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + seconds);
  }

  function rest(seconds = 4) {
    rampTo(master.gain, BASE, seconds);
    rampTo(filter.frequency, 320, seconds);
    rampTo(voiceGain.gain, 0.035, seconds);
  }

  // Call from a tap/click: phones only let audio start inside a user gesture,
  // so this opens the audio engine (silently) for later use.
  function unlock() {
    if (!ctx && !build()) return false;
    ctx.resume();
    return true;
  }

  async function enable() {
    if (!ctx && !build()) return false;
    await ctx.resume();
    on = true;
    rampTo(master.gain, BASE, 2.5);
    return true;
  }

  // suspend=false keeps the engine open so it can come back without another tap.
  function disable(suspend = true) {
    on = false;
    swelling = false;
    if (!ctx) return;
    rampTo(master.gain, 0, 0.8);
    if (suspend) setTimeout(() => { if (!on) ctx.suspend(); }, 1000);
  }

  // Called every second with the time left until the next showing.
  function update(msLeft) {
    if (!on || !ctx) return;
    if (msLeft > 0 && msLeft <= 10500) {
      swelling = true;
      const k = 1 - Math.max(0, msLeft - 500) / 10000; // 0 → 1 over the final 10 seconds
      rampTo(master.gain, BASE + 0.5 * k, 1);
      rampTo(filter.frequency, 320 + 1700 * k, 1);
      rampTo(voiceGain.gain, 0.035 + 0.22 * k, 1);
      const now = Date.now();
      if (now - lastBoom > 900) {
        lastBoom = now;
        boom(0.25 + 0.5 * k);
      }
    } else if (swelling) {
      swelling = false;
      rest();
    }
  }

  // The moment a showing starts: one big hit, hold, then settle back down.
  function showtime() {
    if (!on || !ctx) return;
    swelling = false;
    boom(1);
    rampTo(master.gain, BASE + 0.55, 0.3);
    setTimeout(() => on && rest(6), 4000);
  }

  return {
    unlock, enable, disable, update, showtime,
    isOn: () => on,
    // For debugging: current volume and filter cutoff.
    level: () => (ctx ? { gain: +master.gain.value.toFixed(2), cutoff: Math.round(filter.frequency.value), state: ctx.state } : null),
  };
})();
