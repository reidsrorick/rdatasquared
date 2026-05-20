/* ============================================================
   STORAGE
   ============================================================ */
const store = {
  get(k, fb = null) {
    try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); }
    catch { return fb; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { return false; }
  }
};

/* ============================================================
   AUDIO ENGINE
   ============================================================ */
let _ctx = null;
function actx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}
function vol() { return parseFloat(document.getElementById('volume').value); }

function tone(freq, type, dur, gain, t) {
  const c = actx(), osc = c.createOscillator(), g = c.createGain();
  osc.connect(g); g.connect(c.destination);
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  osc.start(t); osc.stop(t + dur + .05);
}

const SOUNDS = {
  beep:  (v, t) => { tone(880, 'sine', .15, v, t); tone(880, 'sine', .15, v, t + .25); tone(880, 'sine', .15, v, t + .5); return .95; },
  alarm: (v, t) => { tone(960, 'sawtooth', .45, v * .45, t); tone(480, 'sawtooth', .45, v * .45, t + .5); return 1.1; },
  buzz:  (v, t) => { tone(120, 'sawtooth', .5, v * .6, t); tone(180, 'sawtooth', .5, v * .3, t); return .75; },
  chime: (v, t) => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 'sine', .7, v * .65, t + i * .14)); return 1.3; },
  bell:  (v, t) => { tone(1047, 'sine', 1.6, v, t); tone(1568, 'sine', 1.0, v * .3, t); tone(2093, 'sine', .7, v * .12, t); return 2.1; },
  none:  () => 0,
};

let alertLoop = null;
function previewSound(name) { stopAlertSound(); const fn = SOUNDS[name]; if (fn) fn(vol(), actx().currentTime); }
function startAlertSound(name) {
  stopAlertSound();
  const fn = SOUNDS[name]; if (!fn || name === 'none') return;
  function tick() { const c = actx(); alertLoop = setTimeout(tick, (fn(vol(), c.currentTime) || 1) * 950); }
  tick();
}
function stopAlertSound() { clearTimeout(alertLoop); alertLoop = null; }

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
function notifStatus() {
  if (!('Notification' in window)) return 'unsupported';
  if (location.protocol === 'file:') return 'file-blocked';
  return Notification.permission;
}
function initPerms() {
  const el = document.getElementById('permNotice');
  const msg = document.getElementById('permMsg');
  const btn = el.querySelector('.btn-xs');
  const st = notifStatus();
  if (st === 'granted') {
    el.classList.add('hidden');
  } else if (st === 'file-blocked') {
    msg.textContent = 'Notifications are blocked for local files. Serve via http:// (e.g. VS Code Live Server). The in-app banner still fires.';
    if (btn) btn.remove(); el.style.borderColor = 'var(--red)';
  } else if (st === 'denied') {
    msg.textContent = 'Notifications blocked — enable them in browser Site Settings, then refresh.';
    if (btn) btn.remove(); el.style.borderColor = 'var(--red)';
  } else if (st === 'unsupported') {
    msg.textContent = 'Notifications not supported in this browser.';
    if (btn) btn.remove();
  }
}
function askNotifPerm() {
  Notification.requestPermission().then(p => {
    if (p === 'granted') {
      document.getElementById('permNotice').classList.add('hidden');
      new Notification('TimerX', { body: 'Notifications enabled ✓' });
    } else { initPerms(); }
  });
}
function notify(title, body) {
  if (notifStatus() !== 'granted') return;
  const n = new Notification(title, { body });
  setTimeout(() => n.close(), 12000);
}
function testAlert() {
  startAlertSound(document.getElementById('newTimerSound').value);
  notify('🔔 Test', 'Sound + banner are working.');
  showAlert('🔔 Test alert — sound and banner are working', false);
}

/* ============================================================
   CLOCK + TABS + ALERT BANNER
   ============================================================ */
function tickClock() { document.getElementById('liveClock').textContent = new Date().toLocaleTimeString(); }
tickClock();
setInterval(tickClock, 1000);

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', ['timer', 'alarm', 'stopwatch'][i] === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  store.set('tx-tab', name);
}

let _snoozeAlarm = null;
function showAlert(msg, isAlarm, ref) {
  const bar = document.getElementById('alertBanner');
  document.getElementById('alertText').textContent = msg;
  bar.className = isAlarm ? 'open' : 'open timer-style';
  document.getElementById('snoozeBtn').style.display = isAlarm ? '' : 'none';
  _snoozeAlarm = ref || null;
}
function dismissAlert() {
  document.getElementById('alertBanner').classList.remove('open');
  stopAlertSound();
  _snoozeAlarm = null;
}
function snoozeAlarm() {
  if (_snoozeAlarm) {
    const t = new Date(Date.now() + 5 * 60000);
    _addAlarm(pad(t.getHours()) + ':' + pad(t.getMinutes()), 'Snoozed — ' + (_snoozeAlarm.label || 'Alarm'), _snoozeAlarm.sound);
  }
  dismissAlert();
}

function flashSaved(ok) {
  const el = document.getElementById('savedToast');
  el.textContent = ok ? '💾 Saved' : '⚠️ Could not save (storage blocked)';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.opacity = '0', 1800);
}

function pad(n) { return String(n).padStart(2, '0'); }
function fmtSecs(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/* ============================================================
   PRESETS
   ============================================================ */
const DEFAULT_PRESETS = [
  { id: 1, label: '1 min',  secs: 60 },
  { id: 2, label: '5 min',  secs: 300 },
  { id: 3, label: '10 min', secs: 600 },
  { id: 4, label: '25 min', secs: 1500 },
  { id: 5, label: '1 hr',   secs: 3600 },
];
let presets = store.get('tx-presets', DEFAULT_PRESETS);

function savePresets() { store.set('tx-presets', presets); }

function renderPresets() {
  document.getElementById('presetsRow').innerHTML = presets.map(p =>
    `<button class="preset-btn" onclick="launchPreset(${p.id})">${escH(p.label)}</button>`
  ).join('');
  document.getElementById('presetEditorRows').innerHTML = presets.map(p => `
    <div class="pe-row">
      <input type="text" value="${escH(p.label)}" oninput="editPreset(${p.id},'label',this.value)" placeholder="Name">
      <input type="number" value="${Math.round(p.secs / 60)}" min="1" max="1440" oninput="editPreset(${p.id},'mins',this.value)">
      <span class="pe-unit">min</span>
      <button class="btn-icon" onclick="removePreset(${p.id})">✕</button>
    </div>`).join('');
}
function launchPreset(id) {
  const p = presets.find(x => x.id === id); if (!p) return;
  const label = document.getElementById('newTimerLabel').value.trim() || p.label;
  const sound = document.getElementById('newTimerSound').value;
  _createTimer(label, p.secs, sound, true);
}
function addPreset() { presets.push({ id: Date.now(), label: 'Custom', secs: 300 }); savePresets(); renderPresets(); }
function removePreset(id) { presets = presets.filter(p => p.id !== id); savePresets(); renderPresets(); }
function editPreset(id, field, val) {
  const p = presets.find(x => x.id === id); if (!p) return;
  if (field === 'label') p.label = val;
  if (field === 'mins') p.secs = (parseInt(val) || 1) * 60;
  savePresets();
  document.getElementById('presetsRow').innerHTML = presets.map(p =>
    `<button class="preset-btn" onclick="launchPreset(${p.id})">${escH(p.label)}</button>`
  ).join('');
}
function togglePresetEditor() {
  const ed = document.getElementById('presetEditor'), btn = document.getElementById('presetEditBtn');
  const open = ed.style.display === 'none';
  ed.style.display = open ? '' : 'none';
  btn.textContent = open ? '✓ Done' : '✎ Edit';
}

/* ============================================================
   TIMERS (multi-instance)
   ============================================================ */
let timers = [], timerSeq = 0;

function tiAdj(id, delta, max) {
  const el = document.getElementById(id);
  let v = (parseInt(el.value) || 0) + delta;
  if (v < 0) v = max; if (v > max) v = 0;
  el.value = v;
}

function createTimer() {
  const h = +(document.getElementById('tiH').value) || 0;
  const m = +(document.getElementById('tiM').value) || 0;
  const s = +(document.getElementById('tiS').value) || 0;
  const total = h * 3600 + m * 60 + s; if (total === 0) return;
  const label = document.getElementById('newTimerLabel').value.trim() || `Timer ${++timerSeq}`;
  const sound = document.getElementById('newTimerSound').value;
  _createTimer(label, total, sound, true);
}

function _createTimer(label, total, sound, autoStart) {
  const id = Date.now() + Math.random();
  const t = { id, label, total, remaining: total, running: false, sound, done: false, _tick: null };
  timers.push(t);
  removeEmptyState('timerCards');
  appendTimerCard(t);
  if (autoStart) startTimer(id);
  saveTimers();
}

function appendTimerCard(t) {
  const div = document.createElement('div');
  div.className = 't-card' + (t.done ? ' is-done' : t.running ? ' is-running' : '');
  div.id = 'tc-' + t.id;
  const pct = t.total > 0 ? (t.remaining / t.total) * 100 : 0;
  const barCol = pct > 50 ? 'var(--accent)' : pct > 20 ? 'var(--amber)' : 'var(--red)';
  const btnTxt = t.done ? 'Restart' : t.running ? 'Pause' : t.remaining < t.total ? 'Resume' : 'Start';
  div.innerHTML = `
    <div class="t-top">
      <span class="t-lbl" title="${escH(t.label)}">${escH(t.label)}</span>
      <span class="t-time" id="tt-${t.id}">${fmtSecs(t.remaining)}</span>
      <button class="btn-icon" onclick="deleteTimer(${t.id})" title="Remove">✕</button>
    </div>
    <div class="t-bar-track"><div class="t-bar" id="tb-${t.id}" style="width:${pct}%;background:${barCol}"></div></div>
    <div class="t-ctrls">
      <button class="btn-card-sec" onclick="resetTimer(${t.id})">↺ Reset</button>
      <button class="btn-card-pri" id="tbtn-${t.id}" onclick="timerToggle(${t.id})">${btnTxt}</button>
    </div>`;
  document.getElementById('timerCards').appendChild(div);
  if (t.done) document.getElementById('tt-' + t.id).classList.add('pulsing');
}

function timerToggle(id) {
  const t = timers.find(x => x.id === id); if (!t) return;
  if (t.done) { resetTimer(id); return; }
  t.running ? pauseTimer(id) : startTimer(id);
}
function startTimer(id) {
  const t = timers.find(x => x.id === id); if (!t || t.running || t.remaining === 0) return;
  t.running = true; updateTimerCard(t);
  t._tick = setInterval(() => { t.remaining--; updateTimerDisp(t); if (t.remaining <= 0) timerDone(t); }, 1000);
  saveTimers();
}
function pauseTimer(id) {
  const t = timers.find(x => x.id === id); if (!t || !t.running) return;
  t.running = false; clearInterval(t._tick); updateTimerCard(t); saveTimers();
}
function resetTimer(id) {
  const t = timers.find(x => x.id === id); if (!t) return;
  clearInterval(t._tick); t.running = false; t.done = false; t.remaining = t.total;
  updateTimerCard(t); saveTimers();
}
function deleteTimer(id) {
  const t = timers.find(x => x.id === id); if (t) clearInterval(t._tick);
  timers = timers.filter(x => x.id !== id);
  const el = document.getElementById('tc-' + id); if (el) el.remove();
  if (!timers.length) document.getElementById('timerCards').innerHTML = '<div class="empty-state">No timers yet — set a duration above or tap a Quick Start preset.</div>';
  saveTimers();
}
function timerDone(t) {
  clearInterval(t._tick); t.running = false; t.done = true; t.remaining = 0;
  updateTimerCard(t);
  startAlertSound(t.sound);
  notify('⏱ ' + t.label, 'Timer complete!');
  showAlert('⏱ ' + t.label + ' — Done!', false);
  saveTimers();
}
function updateTimerDisp(t) {
  const te = document.getElementById('tt-' + t.id), be = document.getElementById('tb-' + t.id);
  if (!te || !be) return;
  const pct = t.total > 0 ? (t.remaining / t.total) * 100 : 0;
  te.textContent = fmtSecs(t.remaining);
  be.style.width = pct + '%';
  be.style.background = pct > 50 ? 'var(--accent)' : pct > 20 ? 'var(--amber)' : 'var(--red)';
}
function updateTimerCard(t) {
  const card = document.getElementById('tc-' + t.id); if (!card) return;
  card.className = 't-card' + (t.done ? ' is-done' : t.running ? ' is-running' : '');
  const btn = document.getElementById('tbtn-' + t.id);
  if (btn) btn.textContent = t.done ? 'Restart' : t.running ? 'Pause' : t.remaining < t.total ? 'Resume' : 'Start';
  const te = document.getElementById('tt-' + t.id);
  if (te) te.classList.toggle('pulsing', t.done);
  updateTimerDisp(t);
}
function saveTimers() {
  const ok = store.set('tx-timers', timers.map(t => ({
    id: t.id, label: t.label, total: t.total, remaining: t.remaining,
    sound: t.sound, running: t.running, savedAt: Date.now(), done: t.done
  })));
  flashSaved(ok);
}

/* ============================================================
   STOPWATCHES (multi-instance)
   ============================================================ */
let stopwatches = [], swSeq = 0;

function createStopwatch() {
  const label = document.getElementById('newSwLabel').value.trim() || `Stopwatch ${++swSeq}`;
  document.getElementById('newSwLabel').value = '';
  const id = Date.now() + Math.random();
  const sw = { id, label, running: false, elapsed: 0, startTime: 0, laps: [], _tick: null };
  stopwatches.push(sw);
  removeEmptyState('swCards');
  appendSwCard(sw);
}
function appendSwCard(sw) {
  const div = document.createElement('div');
  div.className = 'sw-card'; div.id = 'swc-' + sw.id;
  div.innerHTML = `
    <div class="sw-top">
      <span class="sw-lbl">${escH(sw.label)}</span>
      <span class="sw-time" id="swt-${sw.id}">00:00<span class="sw-cs">.00</span></span>
      <button class="btn-icon" onclick="deleteStopwatch(${sw.id})" title="Remove">✕</button>
    </div>
    <div class="sw-ctrls">
      <button class="btn-card-sec" id="swsec-${sw.id}" onclick="swSecAction(${sw.id})">Reset</button>
      <button class="btn-card-pri" id="swpri-${sw.id}" onclick="swToggle(${sw.id})">Start</button>
    </div>
    <div class="sw-laps" id="swlaps-${sw.id}"></div>`;
  document.getElementById('swCards').appendChild(div);
  if (sw.elapsed > 0) updateSwDisp(sw);
  if (sw.laps.length) renderSwLaps(sw);
}
function swToggle(id) {
  const sw = stopwatches.find(x => x.id === id); if (!sw) return;
  if (sw.running) {
    sw.elapsed += Date.now() - sw.startTime; sw.running = false; clearInterval(sw._tick);
    document.getElementById('swpri-' + id).textContent = 'Resume';
    document.getElementById('swsec-' + id).textContent = 'Reset';
    document.getElementById('swc-' + id).classList.remove('is-running');
  } else {
    sw.startTime = Date.now(); sw.running = true;
    sw._tick = setInterval(() => updateSwDisp(sw), 47);
    document.getElementById('swpri-' + id).textContent = 'Stop';
    document.getElementById('swsec-' + id).textContent = 'Lap';
    document.getElementById('swc-' + id).classList.add('is-running');
  }
}
function swSecAction(id) {
  const sw = stopwatches.find(x => x.id === id); if (!sw) return;
  if (sw.running) {
    const total = sw.elapsed + (Date.now() - sw.startTime);
    const prev = sw.laps.length ? sw.laps[sw.laps.length - 1].total : 0;
    sw.laps.push({ lap: total - prev, total });
    renderSwLaps(sw);
  } else {
    clearInterval(sw._tick); sw.elapsed = 0; sw.startTime = 0; sw.laps = [];
    document.getElementById('swt-' + id).innerHTML = '00:00<span class="sw-cs">.00</span>';
    document.getElementById('swpri-' + id).textContent = 'Start';
    document.getElementById('swsec-' + id).textContent = 'Reset';
    document.getElementById('swc-' + id).classList.remove('is-running');
    document.getElementById('swlaps-' + id).innerHTML = '';
  }
}
function updateSwDisp(sw) {
  const ms = sw.elapsed + (sw.running ? Date.now() - sw.startTime : 0);
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor((ms % 1000) / 10);
  const el = document.getElementById('swt-' + sw.id);
  if (el) el.innerHTML = `${pad(m)}:${pad(s)}<span class="sw-cs">.${pad(cs)}</span>`;
}
function deleteStopwatch(id) {
  const sw = stopwatches.find(x => x.id === id); if (sw) clearInterval(sw._tick);
  stopwatches = stopwatches.filter(x => x.id !== id);
  const el = document.getElementById('swc-' + id); if (el) el.remove();
  if (!stopwatches.length) document.getElementById('swCards').innerHTML = '<div class="empty-state">No stopwatches — tap + New to create one.</div>';
}
function lapFmt(ms) {
  const m = Math.floor(ms / 60000); ms %= 60000;
  const s = Math.floor(ms / 1000), cs = Math.floor((ms % 1000) / 10);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}
function renderSwLaps(sw) {
  const el = document.getElementById('swlaps-' + sw.id);
  if (!el || !sw.laps.length) { if (el) el.innerHTML = ''; return; }
  const raws = sw.laps.map(l => l.lap), best = Math.min(...raws), worst = Math.max(...raws);
  el.innerHTML = sw.laps.slice().reverse().map((lap, ri) => {
    const i = sw.laps.length - 1 - ri;
    const cls = sw.laps.length > 1 ? (lap.lap === best ? 'best' : lap.lap === worst ? 'worst' : '') : '';
    return `<div class="sw-lap-row ${cls}">
      <span class="ln">Lap ${i + 1}</span>
      <span class="ls">${lapFmt(lap.lap)}</span>
      <span style="color:var(--dim)">${lapFmt(lap.total)}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   ALARM TIME PICKER
   ============================================================ */
function atpAdj(field, delta) {
  if (field === 'h') {
    const el = document.getElementById('atpH');
    let v = (parseInt(el.value) || 12) + delta;
    if (v < 1) v = 12; if (v > 12) v = 1;
    el.value = v;
  } else {
    const el = document.getElementById('atpM');
    let v = (parseInt(el.value) || 0) + delta;
    if (v < 0) v = 55; if (v > 59) v = 0;
    el.value = v;
  }
  saveAlarmPickerState();
}
function atpSetAmPm(val) {
  document.getElementById('atpAM').classList.toggle('active', val === 'AM');
  document.getElementById('atpPM').classList.toggle('active', val === 'PM');
  saveAlarmPickerState();
}
function atpGetTime() {
  let h = parseInt(document.getElementById('atpH').value) || 12;
  const m = parseInt(document.getElementById('atpM').value) || 0;
  const isAM = document.getElementById('atpAM').classList.contains('active');
  if (isAM && h === 12) h = 0;
  if (!isAM && h !== 12) h += 12;
  return pad(h) + ':' + pad(m);
}

/* ============================================================
   ALARMS
   ============================================================ */
let alarms = [], alarmChecker = null;

function addAlarm() {
  const t = atpGetTime();
  const l = document.getElementById('alarmLabelInput').value.trim() || 'Alarm';
  const s = document.getElementById('alarmSound').value;
  saveAlarmPickerState();
  _addAlarm(t, l, s);
  document.getElementById('alarmLabelInput').value = '';
}

function saveAlarmPickerState() {
  store.set('tx-alarm-picker', {
    h: document.getElementById('atpH').value,
    m: document.getElementById('atpM').value,
    ampm: document.getElementById('atpAM').classList.contains('active') ? 'AM' : 'PM',
    sound: document.getElementById('alarmSound').value
  });
}

function restoreAlarmPickerState() {
  const s = store.get('tx-alarm-picker');
  if (!s) return;
  if (s.h) document.getElementById('atpH').value = s.h;
  if (s.m !== undefined) document.getElementById('atpM').value = s.m;
  if (s.ampm) atpSetAmPm(s.ampm);
  if (s.sound) document.getElementById('alarmSound').value = s.sound;
}
function _addAlarm(time, label, sound) {
  alarms.push({ id: Date.now() + Math.random(), time, label, sound, on: true, fired: false });
  saveAlarms(); renderAlarms(); ensureAlarmChecker();
}
function saveAlarms() {
  const ok = store.set('tx-alarms', alarms.map(a => ({ id: a.id, time: a.time, label: a.label, sound: a.sound, on: a.on })));
  flashSaved(ok);
}
function removeAlarm(id) { alarms = alarms.filter(a => a.id !== id); saveAlarms(); renderAlarms(); }
function toggleAlarm(id) { const a = alarms.find(a => a.id === id); if (a) { a.on = !a.on; a.fired = false; } saveAlarms(); renderAlarms(); }
function renderAlarms() {
  const el = document.getElementById('alarmList');
  if (!alarms.length) { el.innerHTML = '<div class="empty-state">No alarms set</div>'; return; }
  const now = new Date();
  el.innerHTML = alarms.map(a => {
    const [hh, mm] = a.time.split(':'), h = parseInt(hh), ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    const disp = `${h12}:${pad(parseInt(mm))} ${ampm}`;
    const next = new Date(); next.setHours(h, parseInt(mm), 0, 0); if (next <= now) next.setDate(next.getDate() + 1);
    const d = Math.round((next - now) / 60000);
    const inTxt = d < 60 ? `in ${d}m` : `in ${Math.floor(d / 60)}h ${d % 60}m`;
    const soon = d < 60;
    return `<div class="alarm-item ${a.on ? 'is-on' : ''}">
      <div class="alarm-info">
        <div class="alarm-time-row">
          <span class="alarm-time ${!a.on ? 'off' : ''}">${disp}</span>
          ${a.on ? `<span class="alarm-next ${soon ? 'soon' : ''}">${inTxt}</span>` : '<span class="alarm-next">Off</span>'}
        </div>
        <div class="alarm-lbl">${escH(a.label)} · ${a.sound}</div>
      </div>
      <button class="toggle ${a.on ? 'on' : ''}" onclick="toggleAlarm(${a.id})"></button>
      <button class="btn-icon" onclick="removeAlarm(${a.id})" title="Delete">✕</button>
    </div>`;
  }).join('');
}
function ensureAlarmChecker() { if (!alarmChecker) { checkAlarms(); alarmChecker = setInterval(checkAlarms, 15000); } }
function checkAlarms() {
  const now = new Date(), hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  alarms.forEach(a => {
    if (a.on && a.time === hhmm && !a.fired) {
      a.fired = true; setTimeout(() => { a.fired = false; }, 65000); fireAlarm(a);
    }
  });
  if (alarms.length) renderAlarms();
}
function fireAlarm(a) { startAlertSound(a.sound); notify('⏰ ' + a.label, a.time); showAlert(`⏰ ${a.label}  —  ${a.time}`, true, a); }

/* ============================================================
   UTILITIES
   ============================================================ */
function escH(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function removeEmptyState(id) { const es = document.querySelector('#' + id + ' .empty-state'); if (es) es.remove(); }

/* ============================================================
   TAB TITLE
   ============================================================ */
function updateTitle() {
  if (alertLoop) {
    document.title = document.title.startsWith('🔔') ? '⏰ Alert! — TimerX' : '🔔 Alert! — TimerX';
    return;
  }
  const rt = timers.filter(t => t.running);
  if (rt.length) {
    const t = rt[0], suf = rt.length > 1 ? ` +${rt.length - 1}` : '';
    document.title = `⏱ ${fmtSecs(t.remaining)}${suf} — TimerX`; return;
  }
  const rs = stopwatches.filter(s => s.running);
  if (rs.length) {
    const sw = rs[0], ms = sw.elapsed + (Date.now() - sw.startTime);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    const suf = rs.length > 1 ? ` +${rs.length - 1}` : '';
    document.title = `▶ ${pad(m)}:${pad(s)}${suf} — TimerX`; return;
  }
  document.title = 'TimerX — Alarm · Timer · Stopwatch';
}
setInterval(updateTitle, 1000);

/* ============================================================
   INIT
   ============================================================ */
initPerms();

const savedTab = store.get('tx-tab');
if (savedTab) switchTab(savedTab);

presets = store.get('tx-presets', DEFAULT_PRESETS);
renderPresets();

const savedTimers = store.get('tx-timers', []);
if (Array.isArray(savedTimers) && savedTimers.length) {
  savedTimers.forEach(t => {
    let remaining = t.remaining, done = t.done || false;
    if (t.running && t.savedAt) {
      const elapsed = Math.floor((Date.now() - t.savedAt) / 1000);
      remaining = Math.max(0, t.remaining - elapsed);
      if (remaining === 0) done = true;
    }
    timers.push({ id: t.id, label: t.label, total: t.total, remaining, sound: t.sound, running: false, done, _tick: null });
  });
  if (timers.length) removeEmptyState('timerCards');
  timers.forEach(t => appendTimerCard(t));
}

const savedAlarms = store.get('tx-alarms', []);
if (Array.isArray(savedAlarms) && savedAlarms.length) {
  alarms = savedAlarms.map(a => ({ ...a, fired: false }));
  renderAlarms(); ensureAlarmChecker();
}

restoreAlarmPickerState();
document.getElementById('alarmSound').addEventListener('change', saveAlarmPickerState);

const savedTimerSound = store.get('tx-timer-sound');
if (savedTimerSound) document.getElementById('newTimerSound').value = savedTimerSound;
document.getElementById('newTimerSound').addEventListener('change', function () {
  store.set('tx-timer-sound', this.value);
});

setInterval(() => { if (alarms.length) renderAlarms(); }, 60000);
