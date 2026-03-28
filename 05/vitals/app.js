// ============================================================
// MANIFEST (PWA)
// ============================================================
(function () {
  const manifest = {
    name: "Vitals",
    short_name: "Vitals",
    description: "Personal health tracker",
    start_url: "./",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230f172a'/><text y='.9em' font-size='80' x='10'>❤️</text></svg>",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  document.getElementById("manifest-link").href = URL.createObjectURL(blob);
})();

// ============================================================
// STATE
// ============================================================
let db = null;
let SQL = null;
let trendChart = null;
let hydrationGlasses = 0;
let sleepDurationHours = null;
let lastSavedTime = null;
let activeMetrics = { sleep: true, hydration: true, workout: true, nutrition: true, weight: true };

const IDB_KEY = "vitals_db";
const WASM_URL = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ============================================================
// INDEXEDDB
// ============================================================
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("vitals", 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore("data");
    req.onsuccess = (e) => res(e.target.result);
    req.onerror = (e) => rej(e.target.error);
  });
}

async function loadFromIDB() {
  const idb = await openIDB();
  return new Promise((res, rej) => {
    const tx = idb.transaction("data", "readonly");
    const req = tx.objectStore("data").get(IDB_KEY);
    req.onsuccess = (e) => res(e.target.result || null);
    req.onerror = (e) => rej(e.target.error);
  });
}

async function saveToIDB(uint8arr) {
  const idb = await openIDB();
  return new Promise((res, rej) => {
    const tx = idb.transaction("data", "readwrite");
    tx.objectStore("data").put(uint8arr, IDB_KEY);
    tx.oncomplete = () => res();
    tx.onerror = (e) => rej(e.target.error);
  });
}

async function persistDB() {
  if (!db) return;
  const data = db.export();
  await saveToIDB(data);
  lastSavedTime = new Date();
  updateLastSavedText();
}

function updateLastSavedText() {
  const el = document.getElementById("last-saved-text");
  if (!el || !lastSavedTime) return;
  const diff = Math.floor((Date.now() - lastSavedTime) / 1000);
  if (diff < 60) el.textContent = "Saved just now";
  else if (diff < 3600) el.textContent = `Saved ${Math.floor(diff / 60)}m ago`;
  else el.textContent = `Saved ${Math.floor(diff / 3600)}h ago`;
}

setInterval(updateLastSavedText, 30000);

// ============================================================
// DATABASE INIT
// ============================================================
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sleep (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, bedtime TEXT, wake_time TEXT,
  duration_hours REAL, quality INTEGER
);
CREATE TABLE IF NOT EXISTS workout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, type TEXT, duration_minutes INTEGER, intensity INTEGER
);
CREATE TABLE IF NOT EXISTS nutrition (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, meal_notes TEXT, quality_score INTEGER
);
CREATE TABLE IF NOT EXISTS hydration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, glasses INTEGER
);
CREATE TABLE IF NOT EXISTS weight (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, weight_lbs REAL
);
`;

async function initDB() {
  SQL = await initSqlJs({ locateFile: () => WASM_URL });
  const saved = await loadFromIDB();
  if (saved) {
    db = new SQL.Database(saved);
    db.run(SCHEMA);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA);
  }
}

function queryAll(sql, params) {
  try {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) {
    console.error(e);
    return [];
  }
}

function queryOne(sql, params) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params) {
  db.run(sql, params);
  persistDB();
}

// ============================================================
// SCORE CALCULATION
// ============================================================
function calcScore(today) {
  const sleep = queryOne("SELECT * FROM sleep WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  const workout = queryOne("SELECT * FROM workout WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  const nutrition = queryOne("SELECT * FROM nutrition WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  const hydration = queryOne("SELECT * FROM hydration WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  const weight = queryOne("SELECT * FROM weight WHERE date=? ORDER BY id DESC LIMIT 1", [today]);

  let score = 0;

  if (sleep) {
    const h = sleep.duration_hours || 0;
    const q = sleep.quality || 0;
    const durationScore = h >= 7 && h <= 9 ? 1 : h >= 5 ? 0.6 : 0.3;
    const qualityScore = q >= 4 ? 1 : q / 4;
    score += 25 * ((durationScore + qualityScore) / 2);
  }

  if (workout) score += 25;
  if (nutrition) score += 20 * ((nutrition.quality_score || 0) / 5);
  if (hydration) score += 20 * Math.min((hydration.glasses || 0) / 8, 1);
  if (weight) score += 10;

  return Math.round(score);
}

// ============================================================
// DASHBOARD UPDATE
// ============================================================
function updateDashboard() {
  const today = todayStr();
  document.getElementById("dashboard-date").textContent = formatDate(today);
  document.getElementById("log-date").textContent = formatDate(today);

  const score = calcScore(today);
  document.getElementById("score-value").textContent = score;

  const ringColor = score < 40 ? "#ef4444" : score < 70 ? "#eab308" : "#22c55e";
  const ring = document.getElementById("score-ring");
  const circumference = 439.82;
  ring.style.strokeDashoffset = circumference - (score / 100) * circumference;
  ring.style.stroke = ringColor;

  const scoreLabels = ["Keep going!", "Making progress", "Good job!", "Great day!", "Perfect day!"];
  document.getElementById("score-label").textContent =
    score === 0 ? "Log your day" :
    score < 40 ? scoreLabels[0] :
    score < 60 ? scoreLabels[1] :
    score < 75 ? scoreLabels[2] :
    score < 90 ? scoreLabels[3] : scoreLabels[4];

  const sleep = queryOne("SELECT * FROM sleep WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (sleep) {
    document.getElementById("card-sleep-val").textContent = sleep.duration_hours ? `${sleep.duration_hours.toFixed(1)}h` : "—";
    document.getElementById("card-sleep-sub").textContent = `Quality: ${"★".repeat(sleep.quality || 0)}${"☆".repeat(5 - (sleep.quality || 0))}`;
  } else {
    document.getElementById("card-sleep-val").textContent = "—";
    document.getElementById("card-sleep-sub").textContent = "Tap to log →";
  }

  const workout = queryOne("SELECT * FROM workout WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (workout) {
    document.getElementById("card-workout-val").textContent = workout.type || "Done";
    document.getElementById("card-workout-sub").textContent = `${workout.duration_minutes || 0} min`;
  } else {
    document.getElementById("card-workout-val").textContent = "—";
    document.getElementById("card-workout-sub").textContent = "Tap to log →";
  }

  const nutrition = queryOne("SELECT * FROM nutrition WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (nutrition) {
    document.getElementById("card-nutrition-val").textContent = `${nutrition.quality_score || 0}/5`;
    const notes = nutrition.meal_notes || "";
    document.getElementById("card-nutrition-sub").textContent = notes.length > 24 ? notes.slice(0, 24) + "…" : notes || "Logged";
  } else {
    document.getElementById("card-nutrition-val").textContent = "—";
    document.getElementById("card-nutrition-sub").textContent = "Tap to log →";
  }

  const hydration = queryOne("SELECT * FROM hydration WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (hydration) {
    document.getElementById("card-hydration-val").textContent = `${hydration.glasses || 0} 💧`;
    document.getElementById("card-hydration-sub").textContent =
      hydration.glasses >= 8 ? "Goal reached! ✓" : `${8 - (hydration.glasses || 0)} more to go`;
  } else {
    document.getElementById("card-hydration-val").textContent = "—";
    document.getElementById("card-hydration-sub").textContent = "Tap to log →";
  }

  const weight = queryOne("SELECT * FROM weight WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (weight) {
    document.getElementById("card-weight-val").textContent = `${weight.weight_lbs} lbs`;
    const prev = queryOne("SELECT weight_lbs FROM weight WHERE date<? ORDER BY date DESC LIMIT 1", [today]);
    if (prev) {
      const diff = (weight.weight_lbs - prev.weight_lbs).toFixed(1);
      document.getElementById("card-weight-sub").textContent = diff > 0 ? `+${diff} from last` : `${diff} from last`;
    } else {
      document.getElementById("card-weight-sub").textContent = "Logged today";
    }
  } else {
    document.getElementById("card-weight-val").textContent = "—";
    document.getElementById("card-weight-sub").textContent = "Tap to log →";
  }

  updateChart();
}

// ============================================================
// CHART
// ============================================================
function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function updateChart() {
  const days = getLast30Days();
  const labels = days.map((d) => {
    const parts = d.split("-");
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  });

  function getMetricData(table, col, dateList) {
    return dateList.map((date) => {
      const row = queryOne(`SELECT ${col} FROM ${table} WHERE date=? ORDER BY id DESC LIMIT 1`, [date]);
      return row ? row[col] : null;
    });
  }

  const datasets = [
    { label: "Sleep (hrs)", data: getMetricData("sleep", "duration_hours", days), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.08)", tension: 0.4, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, hidden: !activeMetrics.sleep },
    { label: "Hydration (glasses)", data: getMetricData("hydration", "glasses", days), borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.08)", tension: 0.4, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, hidden: !activeMetrics.hydration },
    { label: "Workout intensity", data: getMetricData("workout", "intensity", days), borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.08)", tension: 0.4, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, hidden: !activeMetrics.workout },
    { label: "Nutrition score", data: getMetricData("nutrition", "quality_score", days), borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.08)", tension: 0.4, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, hidden: !activeMetrics.nutrition },
    { label: "Weight (lbs)", data: getMetricData("weight", "weight_lbs", days), borderColor: "#a855f7", backgroundColor: "rgba(168,85,247,0.08)", tension: 0.4, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, hidden: !activeMetrics.weight, yAxisID: "y2" },
  ];

  const ctx = document.getElementById("trend-chart").getContext("2d");
  if (trendChart) {
    trendChart.data.labels = labels;
    trendChart.data.datasets = datasets;
    trendChart.update("none");
    return;
  }

  trendChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#94a3b8",
          bodyColor: "#f1f5f9",
          borderColor: "#334155",
          borderWidth: 1,
          callbacks: {
            label: (ctx) => (ctx.raw === null ? null : ` ${ctx.dataset.label}: ${ctx.raw}`),
          },
        },
      },
      scales: {
        x: {
          grid: { color: "#1e293b", drawBorder: false },
          ticks: { color: "#475569", font: { size: 10 }, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: "#1e293b", drawBorder: false },
          ticks: { color: "#475569", font: { size: 10 } },
          position: "left",
        },
        y2: {
          grid: { display: false },
          ticks: { color: "#a855f7", font: { size: 10 } },
          position: "right",
          display: activeMetrics.weight,
        },
      },
    },
  });
}

function toggleMetric(metric, btn) {
  activeMetrics[metric] = !activeMetrics[metric];
  const colors = { sleep: "#3b82f6", hydration: "#06b6d4", workout: "#22c55e", nutrition: "#f97316", weight: "#a855f7" };
  if (activeMetrics[metric]) {
    btn.style.background = colors[metric];
    btn.style.color = "#0f172a";
    btn.style.borderColor = colors[metric];
    btn.classList.add("active");
  } else {
    btn.style.background = "transparent";
    btn.style.color = colors[metric];
    btn.style.borderColor = colors[metric];
    btn.classList.remove("active");
  }
  if (trendChart) {
    const idx = ["sleep", "hydration", "workout", "nutrition", "weight"].indexOf(metric);
    if (idx >= 0) trendChart.data.datasets[idx].hidden = !activeMetrics[metric];
    if (metric === "weight" && trendChart.options.scales.y2) {
      trendChart.options.scales.y2.display = activeMetrics.weight;
    }
    trendChart.update();
  }
}

// ============================================================
// LOG FORM HELPERS
// ============================================================
function toggleSection(name) {
  const body = document.getElementById(`body-${name}`);
  const chevron = document.getElementById(`chevron-${name}`);
  const isOpen = body.classList.contains("open");
  ["sleep", "workout", "nutrition", "hydration", "weight"].forEach((n) => {
    document.getElementById(`body-${n}`).classList.remove("open");
    document.getElementById(`chevron-${n}`).classList.remove("open");
  });
  if (!isOpen) {
    body.classList.add("open");
    chevron.classList.add("open");
  }
}

function setStars(container, event) {
  const star = event.target.closest(".star");
  if (!star) return;
  const val = parseInt(star.dataset.index);
  container.dataset.value = val;
  container.querySelectorAll(".star").forEach((s, i) => s.classList.toggle("filled", i < val));
}

function getStars(id) {
  return parseInt(document.getElementById(id).dataset.value) || 0;
}

function renderStars(containerId, value) {
  const container = document.getElementById(containerId);
  container.dataset.value = value;
  container.querySelectorAll(".star").forEach((s, i) => s.classList.toggle("filled", i < value));
}

function showSaved(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<span class="success-check">✓ Saved</span>';
  setTimeout(() => { const e = document.getElementById(id); if (e) e.innerHTML = ""; }, 3000);
}

function calcSleepDuration() {
  const bedtime = document.getElementById("sleep-bedtime").value;
  const wake = document.getElementById("sleep-wake").value;
  if (!bedtime || !wake) {
    sleepDurationHours = null;
    document.getElementById("sleep-duration-display").textContent = "—";
    return;
  }
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let duration = wh * 60 + wm - (bh * 60 + bm);
  if (duration <= 0) duration += 24 * 60;
  sleepDurationHours = duration / 60;
  document.getElementById("sleep-duration-display").textContent = `${sleepDurationHours.toFixed(1)}h`;
}

function adjustGlasses(delta) {
  hydrationGlasses = Math.max(0, Math.min(30, hydrationGlasses + delta));
  document.getElementById("hydration-count").textContent = hydrationGlasses;
}

// ============================================================
// LOAD TODAY'S DATA INTO LOG FORM
// ============================================================
function loadTodayIntoForm() {
  const today = todayStr();

  const sleep = queryOne("SELECT * FROM sleep WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (sleep) {
    if (sleep.bedtime) document.getElementById("sleep-bedtime").value = sleep.bedtime;
    if (sleep.wake_time) document.getElementById("sleep-wake").value = sleep.wake_time;
    calcSleepDuration();
    renderStars("stars-sleep-quality", sleep.quality || 0);
    document.getElementById("sleep-section-preview").textContent = `${(sleep.duration_hours || 0).toFixed(1)}h · Quality ${sleep.quality || 0}/5`;
  }

  const workout = queryOne("SELECT * FROM workout WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (workout) {
    document.getElementById("workout-type").value = workout.type || "";
    document.getElementById("workout-duration").value = workout.duration_minutes || "";
    renderStars("stars-workout-intensity", workout.intensity || 0);
    document.getElementById("workout-section-preview").textContent = `${workout.type || "Workout"} · ${workout.duration_minutes || 0} min`;
  }

  const nutrition = queryOne("SELECT * FROM nutrition WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (nutrition) {
    document.getElementById("nutrition-notes").value = nutrition.meal_notes || "";
    renderStars("stars-nutrition-quality", nutrition.quality_score || 0);
    document.getElementById("nutrition-section-preview").textContent = `Quality ${nutrition.quality_score || 0}/5`;
  }

  const hydration = queryOne("SELECT * FROM hydration WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  hydrationGlasses = hydration ? hydration.glasses || 0 : 0;
  document.getElementById("hydration-count").textContent = hydrationGlasses;
  if (hydration) document.getElementById("hydration-section-preview").textContent = `${hydration.glasses} glasses`;

  const weight = queryOne("SELECT * FROM weight WHERE date=? ORDER BY id DESC LIMIT 1", [today]);
  if (weight) {
    document.getElementById("weight-lbs").value = weight.weight_lbs || "";
    document.getElementById("weight-section-preview").textContent = `${weight.weight_lbs} lbs`;
  }
}

// ============================================================
// SAVE HANDLERS
// ============================================================
function saveSleep() {
  const today = todayStr();
  const bedtime = document.getElementById("sleep-bedtime").value;
  const wake = document.getElementById("sleep-wake").value;
  const quality = getStars("stars-sleep-quality");
  if (!bedtime || !wake) { showToast("Please enter bedtime and wake time", true); return false; }
  calcSleepDuration();
  const existing = queryOne("SELECT id FROM sleep WHERE date=?", [today]);
  if (existing) {
    run("UPDATE sleep SET bedtime=?, wake_time=?, duration_hours=?, quality=? WHERE id=?", [bedtime, wake, sleepDurationHours, quality, existing.id]);
  } else {
    run("INSERT INTO sleep (date,bedtime,wake_time,duration_hours,quality) VALUES (?,?,?,?,?)", [today, bedtime, wake, sleepDurationHours, quality]);
  }
  document.getElementById("sleep-section-preview").textContent = `${(sleepDurationHours || 0).toFixed(1)}h · Quality ${quality}/5`;
  showSaved("sleep-saved-indicator");
  updateDashboard();
}

function saveWorkout() {
  const today = todayStr();
  const type = document.getElementById("workout-type").value.trim();
  const duration = parseInt(document.getElementById("workout-duration").value) || 0;
  const intensity = getStars("stars-workout-intensity");
  if (!type) { showToast("Please enter an activity type", true); return false; }
  const existing = queryOne("SELECT id FROM workout WHERE date=?", [today]);
  if (existing) {
    run("UPDATE workout SET type=?, duration_minutes=?, intensity=? WHERE id=?", [type, duration, intensity, existing.id]);
  } else {
    run("INSERT INTO workout (date,type,duration_minutes,intensity) VALUES (?,?,?,?)", [today, type, duration, intensity]);
  }
  document.getElementById("workout-section-preview").textContent = `${type} · ${duration} min`;
  showSaved("workout-saved-indicator");
  updateDashboard();
}

function saveNutrition() {
  const today = todayStr();
  const notes = document.getElementById("nutrition-notes").value.trim();
  const quality = getStars("stars-nutrition-quality");
  const existing = queryOne("SELECT id FROM nutrition WHERE date=?", [today]);
  if (existing) {
    run("UPDATE nutrition SET meal_notes=?, quality_score=? WHERE id=?", [notes, quality, existing.id]);
  } else {
    run("INSERT INTO nutrition (date,meal_notes,quality_score) VALUES (?,?,?)", [today, notes, quality]);
  }
  document.getElementById("nutrition-section-preview").textContent = `Quality ${quality}/5`;
  showSaved("nutrition-saved-indicator");
  updateDashboard();
}

function saveHydration() {
  const today = todayStr();
  const existing = queryOne("SELECT id FROM hydration WHERE date=?", [today]);
  if (existing) {
    run("UPDATE hydration SET glasses=? WHERE id=?", [hydrationGlasses, existing.id]);
  } else {
    run("INSERT INTO hydration (date,glasses) VALUES (?,?)", [today, hydrationGlasses]);
  }
  document.getElementById("hydration-section-preview").textContent = `${hydrationGlasses} glasses`;
  showSaved("hydration-saved-indicator");
  updateDashboard();
}

function saveWeight() {
  const today = todayStr();
  const lbs = parseFloat(document.getElementById("weight-lbs").value);
  if (!lbs || isNaN(lbs)) { showToast("Please enter a valid weight", true); return false; }
  const existing = queryOne("SELECT id FROM weight WHERE date=?", [today]);
  if (existing) {
    run("UPDATE weight SET weight_lbs=? WHERE id=?", [lbs, existing.id]);
  } else {
    run("INSERT INTO weight (date,weight_lbs) VALUES (?,?)", [today, lbs]);
  }
  document.getElementById("weight-section-preview").textContent = `${lbs} lbs`;
  showSaved("weight-saved-indicator");
  updateDashboard();
}

// ============================================================
// BACKUP / IMPORT
// ============================================================
function saveBackup() {
  if (!db) return;
  const data = db.export();
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vitals-backup-${todayStr()}.db`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded!");
}

function importDB() {
  document.getElementById("import-file-input").click();
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));
    db.run(SCHEMA);
    await persistDB();
    updateDashboard();
    loadTodayIntoForm();
    showToast("Database imported successfully!");
  } catch (e) {
    showToast("Failed to import: invalid file", true);
    console.error(e);
  }
  event.target.value = "";
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const view = document.getElementById(`view-${name}`);
  view.classList.add("active");
  view.classList.remove("fade-in");
  void view.offsetWidth;
  view.classList.add("fade-in");

  if (name === "log") {
    loadTodayIntoForm();
    document.getElementById("footer-bar").style.display = "none";
  } else {
    updateDashboard();
    document.getElementById("footer-bar").style.display = "block";
  }
}

// ============================================================
// TOAST
// ============================================================
let toastTimer = null;
function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = isError ? "error show" : "show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = isError ? "error" : ""), 2500);
}

// ============================================================
// QUICK LOG SHEET
// ============================================================
function starsHTML(id, value = 0) {
  const stars = [1, 2, 3, 4, 5]
    .map((i) => `<span class="star${i <= value ? " filled" : ""}" data-index="${i}">★</span>`)
    .join("");
  return `<div class="star-rating" id="${id}" data-value="${value}" onclick="setStars(this,event)">${stars}</div>`;
}

const QUICK_LOG_FORMS = {
  sleep() {
    const rec = queryOne("SELECT * FROM sleep WHERE date=? ORDER BY id DESC LIMIT 1", [todayStr()]);
    const bedtime = rec?.bedtime || "";
    const wake = rec?.wake_time || "";
    const quality = rec?.quality || 0;
    let durationText = "—";
    if (bedtime && wake) {
      const [bh, bm] = bedtime.split(":").map(Number);
      const [wh, wm] = wake.split(":").map(Number);
      let dur = wh * 60 + wm - (bh * 60 + bm);
      if (dur <= 0) dur += 1440;
      sleepDurationHours = dur / 60;
      durationText = `${sleepDurationHours.toFixed(1)}h`;
    }
    return `
      <div class="ql-header"><span>😴 Sleep</span><button class="ql-close" onclick="closeQuickLog()">✕</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <label class="ql-label">Bedtime</label>
          <input type="time" id="sleep-bedtime" value="${bedtime}" onchange="calcSleepDuration()">
        </div>
        <div>
          <label class="ql-label">Wake Time</label>
          <input type="time" id="sleep-wake" value="${wake}" onchange="calcSleepDuration()">
        </div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;color:#64748b;">Duration</span>
        <span style="font-size:16px;font-weight:700;color:#3b82f6;" id="sleep-duration-display">${durationText}</span>
      </div>
      <div style="margin-bottom:16px;">
        <label class="ql-label" style="margin-bottom:8px;">Sleep Quality</label>
        ${starsHTML("stars-sleep-quality", quality)}
      </div>
      <button class="save-btn" style="width:100%;" onclick="quickSave(saveSleep)">Save Sleep</button>`;
  },

  workout() {
    const rec = queryOne("SELECT * FROM workout WHERE date=? ORDER BY id DESC LIMIT 1", [todayStr()]);
    return `
      <div class="ql-header"><span>💪 Workout</span><button class="ql-close" onclick="closeQuickLog()">✕</button></div>
      <div style="margin-bottom:12px;">
        <label class="ql-label">Activity Type</label>
        <input type="text" id="workout-type" value="${rec?.type || ""}" placeholder="e.g. Running, Lifting, Yoga">
      </div>
      <div style="margin-bottom:12px;">
        <label class="ql-label">Duration (minutes)</label>
        <input type="number" id="workout-duration" value="${rec?.duration_minutes || ""}" placeholder="45" min="1" max="480">
      </div>
      <div style="margin-bottom:16px;">
        <label class="ql-label" style="margin-bottom:8px;">Intensity</label>
        ${starsHTML("stars-workout-intensity", rec?.intensity || 0)}
      </div>
      <button class="save-btn" style="width:100%;" onclick="quickSave(saveWorkout)">Save Workout</button>`;
  },

  nutrition() {
    const rec = queryOne("SELECT * FROM nutrition WHERE date=? ORDER BY id DESC LIMIT 1", [todayStr()]);
    return `
      <div class="ql-header"><span>🥗 Nutrition</span><button class="ql-close" onclick="closeQuickLog()">✕</button></div>
      <div style="margin-bottom:12px;">
        <label class="ql-label">Meal Notes</label>
        <textarea id="nutrition-notes" placeholder="What did you eat today?">${rec?.meal_notes || ""}</textarea>
      </div>
      <div style="margin-bottom:16px;">
        <label class="ql-label" style="margin-bottom:8px;">Overall Quality</label>
        ${starsHTML("stars-nutrition-quality", rec?.quality_score || 0)}
      </div>
      <button class="save-btn" style="width:100%;" onclick="quickSave(saveNutrition)">Save Nutrition</button>`;
  },

  hydration() {
    const rec = queryOne("SELECT * FROM hydration WHERE date=? ORDER BY id DESC LIMIT 1", [todayStr()]);
    hydrationGlasses = rec?.glasses || 0;
    return `
      <div class="ql-header"><span>💧 Hydration</span><button class="ql-close" onclick="closeQuickLog()">✕</button></div>
      <div style="display:flex;align-items:center;justify-content:center;gap:24px;padding:12px 0 20px;">
        <button class="hydration-btn" style="background:#0f172a;color:#94a3b8;font-size:28px;" onclick="adjustGlasses(-1)">−</button>
        <div style="text-align:center;">
          <div style="font-size:56px;font-weight:800;color:#06b6d4;line-height:1;" id="hydration-count">${hydrationGlasses}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">glasses of water</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">goal: 8</div>
        </div>
        <button class="hydration-btn" style="background:#0f172a;color:#06b6d4;font-size:28px;" onclick="adjustGlasses(1)">+</button>
      </div>
      <button class="save-btn" style="width:100%;" onclick="quickSave(saveHydration)">Save Hydration</button>`;
  },

  weight() {
    const rec = queryOne("SELECT * FROM weight WHERE date=? ORDER BY id DESC LIMIT 1", [todayStr()]);
    return `
      <div class="ql-header"><span>⚖️ Weight</span><button class="ql-close" onclick="closeQuickLog()">✕</button></div>
      <div style="margin-bottom:16px;">
        <label class="ql-label">Weight (lbs)</label>
        <input type="number" id="weight-lbs" value="${rec?.weight_lbs || ""}" placeholder="175.5" step="0.1" min="50" max="700">
      </div>
      <button class="save-btn" style="width:100%;" onclick="quickSave(saveWeight)">Save Weight</button>`;
  },
};

function openQuickLog(category) {
  document.getElementById("quick-log-content").innerHTML = QUICK_LOG_FORMS[category]();
  const overlay = document.getElementById("quick-log-overlay");
  const sheet = document.getElementById("quick-log-sheet");
  overlay.style.display = "block";
  sheet.style.display = "block";
  requestAnimationFrame(() => requestAnimationFrame(() => (sheet.style.transform = "translateY(0)")));
}

function closeQuickLog() {
  const sheet = document.getElementById("quick-log-sheet");
  sheet.style.transform = "translateY(100%)";
  setTimeout(() => {
    sheet.style.display = "none";
    document.getElementById("quick-log-overlay").style.display = "none";
  }, 300);
}

function quickSave(saveFn) {
  if (saveFn() !== false) closeQuickLog();
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  try {
    await initDB();
    document.getElementById("loading").style.display = "none";
    document.getElementById("app").style.display = "block";
    document.getElementById("footer-bar").style.display = "block";
    updateDashboard();
    const saved = await loadFromIDB();
    if (saved) {
      lastSavedTime = new Date();
      updateLastSavedText();
    }
  } catch (e) {
    document.getElementById("loading").innerHTML = `
      <div style="text-align:center;padding:32px;">
        <div style="font-size:24px;font-weight:700;margin-bottom:12px;">Failed to load</div>
        <div style="color:#94a3b8;font-size:14px;margin-bottom:16px;">${e.message}</div>
        <button onclick="location.reload()" style="background:#6366f1;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">Retry</button>
      </div>`;
    console.error(e);
  }
}

boot();
