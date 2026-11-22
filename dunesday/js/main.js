/* ============================================================
   DUNESDAY — behavior
   ============================================================ */
(() => {
  "use strict";

  const C = window.DUNESDAY;
  const SHOWINGS = C.showings
    .map((s) => ({ ...s, t: new Date(s.start).getTime() }))
    .sort((a, b) => a.t - b.t);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel) => document.querySelector(sel);

  /* ---------- Countdown ---------- */

  const nums = {};
  document.querySelectorAll(".num").forEach((el) => (nums[el.dataset.unit] = el));

  function setNum(unit, value) {
    const el = nums[unit];
    const text = String(value).padStart(2, "0");
    if (el.textContent === text) return;
    el.textContent = text;
    if (!reduceMotion) {
      el.classList.remove("tick");
      void el.offsetWidth; // restart animation
      el.classList.add("tick");
    }
  }

  // Showtime labels in the theater's time zone, e.g. { time: "12:45 AM", date: "Fri · Dec 18", night: "Thu night" }.
  function showLabels(s) {
    const d = new Date(s.t);
    const fmt = (opts, date = d) => new Intl.DateTimeFormat("en-US", { timeZone: C.timeZone, ...opts }).format(date);
    const hour = Number(fmt({ hour: "numeric", hourCycle: "h23" }));
    return {
      time: fmt({ hour: "numeric", minute: "2-digit" }),
      date: `${fmt({ weekday: "short" })} · ${fmt({ month: "short", day: "numeric" })}`,
      // A 12:45 AM show is really the night before; label it that way so nobody shows up a day late.
      night: hour < 5 ? `${fmt({ weekday: "short" }, new Date(s.t - 6 * 3600e3))} night` : null,
    };
  }

  let arrived = false;
  let currentIdx = -1;

  function tick() {
    const now = Date.now();
    const idx = SHOWINGS.findIndex((s) => s.t > now);
    if (idx === -1) {
      if (!arrived) arrive();
      return;
    }
    if (idx !== currentIdx) {
      // A showing just started while the page was open: celebrate.
      if (currentIdx !== -1) showtime(SHOWINGS[currentIdx]);
      currentIdx = idx;
      renderNextUp(SHOWINGS[idx]);
      renderTickets(now);
    }
    const diff = SHOWINGS[idx].t - now;
    const s = Math.floor(diff / 1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    setNum("days", days);
    setNum("hours", hours);
    setNum("minutes", mins);
    setNum("seconds", s % 60);
    const secs = s % 60;
    document.title = days > 0 ? `${days} days · DUNESDAY`
      : hours > 0 || mins > 0 ? `${hours}h ${mins}m · DUNESDAY`
      : `${secs}s · DUNESDAY`;
    // Tab icon: days left, then hours on the last day, minutes in the last hour, seconds in the last minute.
    updateFavicon(days > 0 ? String(days) : hours > 0 ? `${hours}h` : mins > 0 ? `${mins}m` : String(secs));
    updateMeter(now);
    soundTick(diff);
    updateTakeover(SHOWINGS[idx], diff);
    // Fire again right after the next whole second.
    setTimeout(tick, (diff % 1000) + 20);
  }

  function renderNextUp(s) {
    const l = showLabels(s);
    $("#next-up").innerHTML =
      `Next up <b class="${s.side === "doom" ? "doom" : "spice"}">${esc(s.title)}</b> ` +
      `<span class="nw">${esc(l.night ? `${l.night}, ${l.time}` : `${l.date}, ${l.time}`)}</span>`;
  }

  function showtime(s) {
    toast(`${s.title} starts now`);
    takeoverShowtime(s);
    soundShowtime();
    sand.burst(window.innerWidth / 2, window.innerHeight * 0.4, 160);
    setTimeout(() => summonWorm(true), 1200);
  }

  function arrive() {
    if (currentIdx !== -1) {
      // The last showing just started while the page was open.
      takeoverShowtime(SHOWINGS[SHOWINGS.length - 1]);
      soundShowtime();
    }
    arrived = true;
    setFavicon("assets/favicon.svg", "image/svg+xml");
    lastIconKey = "";
    document.body.classList.add("arrived");
    document.title = "DUNESDAY";
    $(".date").textContent = "December 18 – 20 · 2026";
    renderTickets(Infinity);
    setTimeout(() => summonWorm(true), 800);
    setTimeout(() => sand.burst(window.innerWidth / 2, window.innerHeight * 0.4, 160), 300);
  }

  /* ---------- Final-minute takeover ---------- */

  const takeover = $("#takeover");
  const takeoverNum = $("#takeover-num");
  let takeoverFor = null;      // which showing the overlay is currently for
  let takeoverClosedFor = null; // the viewer closed it for this showing
  let takeoverHoldUntil = 0;    // keep the "showtime" screen up until this moment

  function showTakeover(s) {
    if (takeoverFor === s.t) return;
    takeoverFor = s.t;
    takeover.dataset.side = s.side === "doom" ? "doom" : "spice";
    takeover.classList.remove("now");
    $("#takeover-label").textContent = `${s.title} starts in`;
    $("#takeover-sub").textContent = [s.theater, seatLabel(s.seats)].filter(Boolean).join(" · ");
    takeover.hidden = false;
    document.body.classList.add("final-minute");
  }

  function hideTakeover() {
    takeover.hidden = true;
    takeoverFor = null;
    document.body.classList.remove("final-minute", "final-ten");
  }

  // Called every second: full screen for the last 60 seconds, shaking for the last 10.
  function updateTakeover(s, msLeft) {
    if (Date.now() < takeoverHoldUntil) return;
    const inFinalMinute = msLeft > 0 && msLeft <= 60000 && takeoverClosedFor !== s.t;
    if (!inFinalMinute) {
      if (!takeover.hidden) hideTakeover();
      return;
    }
    showTakeover(s);
    const sec = Math.floor(msLeft / 1000);
    if (takeoverNum.textContent !== String(sec)) {
      takeoverNum.textContent = String(sec);
      takeoverNum.classList.remove("beat");
      void takeoverNum.offsetWidth;
      takeoverNum.classList.add("beat");
    }
    const finalTen = msLeft <= 10500;
    document.body.classList.toggle("final-ten", finalTen && !reduceMotion);
    if (finalTen) takeover.style.setProperty("--shake", `${Math.min(10, 11 - sec) * 0.8}px`);
  }

  // At zero: the number turns into the movie title, then the overlay fades away.
  function takeoverShowtime(s) {
    if (takeoverClosedFor === s.t) return;
    showTakeover(s);
    takeover.classList.add("now");
    document.body.classList.remove("final-ten");
    $("#takeover-label").textContent = "Now showing";
    takeoverNum.textContent = s.title;
    takeoverHoldUntil = Date.now() + 8000;
    setTimeout(() => { takeoverHoldUntil = 0; hideTakeover(); }, 8000);
  }

  $("#takeover-close").addEventListener("click", () => {
    takeoverClosedFor = SHOWINGS[currentIdx] ? SHOWINGS[currentIdx].t : null;
    takeoverHoldUntil = 0;
    hideTakeover();
  });

  /* ---------- Tab icon (days left) ---------- */

  const faviconLink = document.querySelector('link[rel="icon"]');
  let lastIconKey = "";
  let lastIconLabel = "";

  function setFavicon(href, type) {
    faviconLink.type = type;
    faviconLink.href = href;
  }

  function updateFavicon(label) {
    lastIconLabel = label;
    const doom = document.body.dataset.side === "doom";
    const key = `${label}|${doom}`;
    if (key === lastIconKey) return;
    lastIconKey = key;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    // Dark tile with a dune along the bottom, in the current theme's color.
    g.fillStyle = doom ? "#06120d" : "#1a0d06";
    if (g.roundRect) { g.beginPath(); g.roundRect(0, 0, 64, 64, 14); g.fill(); } else g.fillRect(0, 0, 64, 64);
    g.fillStyle = doom ? "rgba(63,224,140,.28)" : "rgba(242,155,56,.3)";
    g.beginPath();
    g.moveTo(0, 52); g.bezierCurveTo(18, 42, 36, 46, 64, 44); g.lineTo(64, 64); g.lineTo(0, 64); g.closePath();
    g.fill();
    // The number, as big as fits.
    g.fillStyle = doom ? "#3fe08c" : "#f29b38";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 46;
    do { g.font = `800 ${size}px "Arial Black", "Segoe UI", system-ui, sans-serif`; size -= 2; } while (g.measureText(label).width > 58 && size > 16);
    g.fillText(label, 32, 34);
    setFavicon(c.toDataURL("image/png"), "image/png");
  }

  /* ---------- Worm meter ---------- */

  const METER_START = new Date(C.meterStart).getTime();
  const LEVELS = [[0.25, "Calm"], [0.5, "Tremors"], [0.75, "Rumbling"], [0.95, "Worm sign"], [Infinity, "Close"]];

  function meterProgress(now) {
    const first = SHOWINGS[0].t;
    if (now >= first) return 1;
    return Math.min(1, Math.max(0, (now - METER_START) / (first - METER_START)));
  }

  let lastPct = -1;
  function updateMeter(now) {
    const p = meterProgress(now);
    const pct = Math.floor(p * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    $("#meter-fill").style.width = `${p * 100}%`;
    $("#meter-worm").style.left = `${p * 100}%`;
    $("#meter-pct").textContent = `${pct}%`;
    $("#meter-bar").setAttribute("aria-valuenow", String(pct));
    $("#meter-level").textContent = LEVELS.find(([max]) => p < max)[1];
  }

  // Worms wander through on their own, more often as the date gets closer:
  // about every 3 minutes a month out, down to every ~15 seconds at the end.
  function scheduleWildWorm() {
    if (reduceMotion) return;
    const p = meterProgress(Date.now());
    const meanSec = 180 - 165 * p * p;
    const delay = meanSec * (0.5 + Math.random()) * 1000;
    setTimeout(() => {
      if (document.visibilityState === "visible") summonWorm(true);
      scheduleWildWorm();
    }, delay);
  }

  /* ---------- Theater ---------- */

  function renderTheater() {
    const t = C.theater;
    if (!t) return;
    const q = encodeURIComponent(`${t.name}, ${t.address}`);
    $("#theater").innerHTML = `
      <div class="theater-info">
        <div class="theater-name">${esc(t.name)}</div>
        <div class="theater-addr">${esc(t.address)}</div>
        <div class="theater-note">${esc(t.note || "")}</div>
        <div class="theater-links">
          <a class="btn btn-sm" href="https://www.google.com/maps/dir/?api=1&destination=${q}" target="_blank" rel="noopener">Google Maps</a>
          <a class="btn btn-sm" href="https://maps.apple.com/?daddr=${q}" target="_blank" rel="noopener">Apple Maps</a>
        </div>
      </div>
      <div class="map">
        <iframe title="Map of ${esc(t.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
          src="https://www.google.com/maps?q=${q}&z=15&output=embed"></iframe>
      </div>`;
  }

  /* ---------- Tickets ---------- */

  // ["K19","K20","K21","K22"] → "Row K · Seats 19–22"; mixed rows or gaps are listed out.
  function seatLabel(seats) {
    if (!seats || !seats.length) return "";
    const parsed = seats.map((s) => String(s).toUpperCase().match(/^([A-Z]+)\s*(\d+)$/));
    const rows = [...new Set(parsed.map((p) => p && p[1]))];
    if (parsed.every(Boolean) && rows.length === 1) {
      const nums = parsed.map((p) => Number(p[2])).sort((a, b) => a - b);
      const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
      const list = nums.length === 1 ? `Seat ${nums[0]}` : contiguous ? `Seats ${nums[0]}–${nums[nums.length - 1]}` : `Seats ${nums.join(", ")}`;
      return `Row ${rows[0]} · ${list}`;
    }
    return `Seats ${seats.map((s) => String(s).toUpperCase()).join(", ")}`;
  }

  // 150 → "2 hr 30 min"
  const runtime = (min) => [Math.floor(min / 60) && `${Math.floor(min / 60)} hr`, min % 60 && `${min % 60} min`].filter(Boolean).join(" ");

  function renderTickets(now) {
    $("#tickets").innerHTML = SHOWINGS.map((s) => {
      const l = showLabels(s);
      const seen = s.t <= now;
      // If the poster can't load, remove it (and its link) so the ticket falls back to the plain design.
      const img = s.poster
        ? `<img class="ticket-poster" src="${esc(s.poster)}" alt="${esc(s.title)} poster" loading="lazy" referrerpolicy="no-referrer" onerror="(this.closest('a') || this).remove()">`
        : "";
      const lb = s.letterboxd ? esc(s.letterboxd) : "";
      return `<article class="ticket ${s.side === "doom" ? "doom" : "spice"}${seen ? " seen" : ""}">
        ${img && lb ? `<a class="ticket-poster-link" href="${lb}" target="_blank" rel="noopener" aria-label="${esc(s.title)} on Letterboxd">${img}</a>` : img}
        <div class="ticket-main">
          <div class="ticket-title">${esc(s.title)}</div>
          <div class="ticket-meta">${esc(s.theater)}</div>
          ${s.format || s.durationMin ? `<div class="ticket-format">${esc([s.format, s.durationMin && runtime(s.durationMin)].filter(Boolean).join(" · "))}</div>` : ""}
          ${s.seats && s.seats.length ? `<div class="ticket-seats">${esc(seatLabel(s.seats))}</div>` : ""}
          <div class="ticket-foot">
            <span class="ticket-status">${seen ? "Seen" : "Booked"}</span>
            ${lb ? `<a class="ticket-lb" href="${lb}" target="_blank" rel="noopener">Letterboxd ↗</a>` : ""}
          </div>
        </div>
        <div class="ticket-stub">
          <div class="ticket-day">${esc(l.night || l.date)}</div>
          <div class="ticket-time">${esc(l.time)}</div>
          ${l.night ? `<div class="ticket-day">${esc(l.date)}</div>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  // Escapes text before it goes into HTML.
  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Side picker (theme) ---------- */

  function setSide(side, persist = true) {
    document.body.dataset.side = side;
    document.querySelectorAll(".title button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.side === side)));
    $('meta[name="theme-color"]').setAttribute("content", side === "doom" ? "#030605" : "#120a06");
    sand.refreshColor();
    if (lastIconLabel && !arrived) updateFavicon(lastIconLabel); // recolor the tab icon
    if (persist) {
      try { localStorage.setItem("dunesday-side", side); } catch (e) { /* storage unavailable */ }
    }
  }

  // Tap DUNE for the Dune theme, SDAY for the Doomsday theme. Each tap also plays its voice line.
  document.querySelectorAll(".title button").forEach((b) =>
    b.addEventListener("click", () => {
      sayLine(b.dataset.side);
      if (document.body.dataset.side === b.dataset.side) return;
      setSide(b.dataset.side);
      const r = b.getBoundingClientRect();
      sand.burst(r.left + r.width / 2, r.top + r.height / 2, 50);
    })
  );

  /* ---------- Drifting sand (canvas) ---------- */

  const sand = (() => {
    const canvas = $("#sand");
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1;
    let drift = [];
    let sparks = [];
    let rgb = "255, 196, 120";

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(240, Math.round((w * h) / 7000));
      drift = Array.from({ length: count }, () => makeGrain(Math.random() * w));
    }

    function makeGrain(x) {
      // Denser near the dunes (bottom), sparser in the sky.
      const y = h * (0.25 + Math.pow(Math.random(), 0.6) * 0.75);
      return {
        x, y,
        vx: 0.3 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        r: 0.4 + Math.random() * 1.6,
        a: 0.15 + Math.random() * 0.55,
      };
    }

    function refreshColor() {
      rgb = getComputedStyle(document.body).getPropertyValue("--particle").trim() || rgb;
    }

    function burst(x, y, n = 60) {
      if (reduceMotion) return;
      const rect = canvas.getBoundingClientRect();
      const cx = x - rect.left, cy = y - rect.top;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 5;
        sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1.5, r: 0.8 + Math.random() * 2, life: 1 });
      }
    }

    let t = 0;
    function frame() {
      t += 0.01;
      ctx.clearRect(0, 0, w, h);
      const gust = 1 + Math.sin(t * 0.7) * 0.4; // wind rises and falls

      for (const g of drift) {
        g.x += g.vx * gust;
        g.y += Math.sin(t * 2 + g.phase) * 0.25;
        if (g.x > w + 5) Object.assign(g, makeGrain(-5));
        ctx.fillStyle = `rgba(${rgb}, ${g.a})`;
        ctx.fillRect(g.x, g.y, g.r * 2.2, g.r);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12; p.vx *= 0.98;
        p.life -= 0.018;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(${rgb}, ${p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMotion) requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);
    resize();
    refreshColor();
    requestAnimationFrame(frame);

    return { burst, refreshColor };
  })();

  // Tap the sky for a puff of sand.
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a, .panel, .welcome")) return;
    sand.burst(e.clientX, e.clientY, 40);
  });

  /* ---------- Sandworm easter egg ---------- */

  const worm = $("#worm");
  const dunes = $(".dunes");
  let wormBusy = false;

  function summonWorm(silent = false) {
    if (wormBusy) return;
    wormBusy = true;
    dunes.classList.add("shake");
    worm.classList.remove("run");
    void worm.getBoundingClientRect();
    worm.classList.add("run");
    if (!silent) toast("Worm sign!");
    const meter = $("#meter");
    meter.classList.remove("wiggle");
    void meter.offsetWidth;
    meter.classList.add("wiggle");
    // Kick up sand along the worm's back while it travels.
    const spray = setInterval(() => {
      const r = worm.getBoundingClientRect();
      if (r.width && r.right > 0 && r.left < window.innerWidth) sand.burst(r.left + r.width * 0.85, r.top + 6, 14);
    }, 140);
    setTimeout(() => {
      clearInterval(spray);
      worm.classList.remove("run");
      dunes.classList.remove("shake");
      wormBusy = false;
    }, 7800);
  }

  // Tap the title 3 times quickly...
  let taps = [];
  $("#title").addEventListener("click", (e) => {
    const title = e.currentTarget;
    title.classList.remove("pulse");
    void title.offsetWidth;
    title.classList.add("pulse");
    const now = Date.now();
    taps = taps.filter((ts) => now - ts < 1500).concat(now);
    if (taps.length >= 3) { taps = []; summonWorm(); }
  });

  // ...or type "worm".
  let typed = "";
  document.addEventListener("keydown", (e) => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === "worm") summonWorm();
  });

  /* ---------- Calendar + share ---------- */

  function downloadIcs() {
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const utc = (ms) => {
      const x = new Date(ms);
      return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
    };
    const events = SHOWINGS.flatMap((s, i) => [
      "BEGIN:VEVENT",
      `UID:dunesday-2026-showing-${i + 1}@dunesday`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(s.t)}`,
      `DTEND:${utc(s.t + (s.durationMin || 180) * 60000)}`,
      `SUMMARY:DUNESDAY: ${s.title}`,
      `LOCATION:${[s.theater, C.theater && C.theater.address].filter(Boolean).join(", ").replace(/([,;])/g, "\\$1")}`,
      `DESCRIPTION:${C.siteUrl}`,
      `URL:${C.siteUrl}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${s.title} starts in 2 hours`,
      "TRIGGER:-PT2H",
      "END:VALARM",
      "END:VEVENT",
    ]);
    // iCalendar wants lines of at most 75 characters; longer ones continue on the next line after a space.
    const fold = (line) => line.match(/.{1,72}/gu).join("\r\n ");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dunesday//Countdown//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].map(fold).join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dunesday.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("Both showings added to the invite");
  }

  async function share() {
    const url = location.hostname === "localhost" ? location.href : C.siteUrl;
    const data = { title: "DUNESDAY · December 18", text: "Dune: Part Three and Avengers: Doomsday at AMC NorthPark 15.", url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch (e) {
      toast(url);
    }
  }

  $("#btn-cal").addEventListener("click", downloadIcs);
  $("#btn-share").addEventListener("click", share);

  /* ---------- Kneel (Doomsday theme) ---------- */

  const kneelBtn = $("#btn-kneel");
  let kneels = 0;
  try { kneels = Number(localStorage.getItem("dunesday-kneels")) || 0; } catch (e) { /* storage unavailable */ }

  function renderKneels() {
    kneelBtn.innerHTML = kneels ? `Kneel<span class="kneel-count">×${kneels}</span>` : "Kneel";
  }

  kneelBtn.addEventListener("click", () => {
    if (document.body.classList.contains("kneeling")) return;
    kneels += 1;
    try { localStorage.setItem("dunesday-kneels", String(kneels)); } catch (e) { /* storage unavailable */ }
    renderKneels();
    document.body.classList.add("kneeling");
    const moon = $(".moon-big").getBoundingClientRect();
    sand.burst(moon.left + moon.width / 2, moon.top + moon.height / 2, 70);
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(60);
    setTimeout(() => document.body.classList.remove("kneeling"), 1250);
  });
  renderKneels();

  /* ---------- Sound ----------
     Dream of Arrakis loops (a section of the official YouTube upload).
     In the last 10 seconds before a showing, the song fades out and the
     synthesized hum swells; after the big hit, the song comes back.
     Browsers only allow sound after a tap, so it all starts on the first
     tap anywhere. Muting is remembered on this device. */

  const soundBtn = $("#btn-sound");
  const soundFab = $("#sound-fab");
  const clip = C.clip;
  $("#soundtrack-link").href = C.soundtrackLink;

  let soundWanted = true;   // the viewer hasn't muted
  let soundStarted = false; // the first tap has happened
  let soundMode = "song";   // "song" or "swell"
  // YouTube won't play in a page opened straight from a file (file://), so go straight to the hum there.
  // ?nosong on the URL forces the hum fallback, for testing.
  let songFailed = !clip || location.protocol === "file:" || new URLSearchParams(location.search).has("nosong");
  try { soundWanted = localStorage.getItem("dunesday-muted") !== "1"; } catch (e) { /* storage unavailable */ }

  const music = (() => {
    let player = null;
    let ready = false;
    let wantPlay = false;
    let fadeTimer = null;
    let loopTimer = null;

    function load() {
      if (!clip) return;
      window.onYouTubeIframeAPIReady = () => {
        player = new YT.Player("yt-player", {
          host: "https://www.youtube-nocookie.com",
          videoId: clip.youtubeId,
          playerVars: { start: clip.start, end: clip.end, rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: () => {
              ready = true;
              if (wantPlay) play();
            },
            onError: () => useHumInstead(), // e.g. embedding refused, video unavailable
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED && wantPlay) restart();
              if (e.data === YT.PlayerState.PLAYING) {
                // The song works after all: drop the hum fallback.
                if (songFailed) { songFailed = false; if (soundMode === "song") window.DunesdayAudio.disable(false); }
                // Someone pressed play on the player itself: count that as turning sound on.
                wantPlay = true;
                if (!soundWanted) setMuted(false);
                else if (!soundStarted) startSound(false);
                updateSoundUI();
              }
            },
          },
        });
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
      // Loop just the chosen section: jump back to the start once it passes the end.
      loopTimer = setInterval(() => {
        if (ready && wantPlay && player.getCurrentTime && player.getCurrentTime() >= clip.end - 0.25) restart();
      }, 250);
    }

    function restart() {
      player.seekTo(clip.start, true);
      player.playVideo();
    }

    function fade(to, ms, done) {
      clearInterval(fadeTimer);
      if (!ready) { done && done(); return; }
      const from = player.getVolume();
      const steps = Math.max(1, Math.round(ms / 50));
      let i = 0;
      fadeTimer = setInterval(() => {
        i += 1;
        player.setVolume(Math.round(from + (to - from) * (i / steps)));
        if (i >= steps) { clearInterval(fadeTimer); done && done(); }
      }, 50);
    }

    function play() {
      wantPlay = true;
      if (!ready) return;
      player.setVolume(0);
      if (player.getCurrentTime() < clip.start || player.getCurrentTime() >= clip.end) player.seekTo(clip.start, true);
      player.playVideo();
      fade(100, 1500);
    }

    function stop(fadeMs = 600) {
      wantPlay = false;
      if (!ready) return;
      fade(0, fadeMs, () => player.pauseVideo());
    }

    // Dip the song under a voice line, then bring it back.
    function duck(down) {
      if (!ready || !wantPlay) return;
      fade(down ? 20 : 100, down ? 250 : 900);
    }

    const isPlaying = () => ready && player.getPlayerState() === YT.PlayerState.PLAYING;
    const isBuffering = () => !ready || player.getPlayerState() === YT.PlayerState.BUFFERING;
    // For debugging: { state, time, volume }.
    const status = () => (ready ? { state: player.getPlayerState(), time: +player.getCurrentTime().toFixed(1), volume: player.getVolume() } : "loading");

    return { load, play, stop, duck, isPlaying, isBuffering, status };
  })();
  window.DunesdayMusic = music;

  if (clip) {
    const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    $("#clip-title").textContent = clip.title;
    $("#clip-sub").textContent = `· ${clip.artist} · loops ${mmss(clip.start)}–${mmss(clip.end)}`;
    if (!songFailed) music.load();
  } else {
    $("#clip").remove();
  }

  function updateSoundUI() {
    const b = document.body;
    b.classList.toggle("sound-muted", !soundWanted);
    b.classList.toggle("sound-waiting", soundWanted && !soundStarted);
    b.classList.toggle("sound-playing", soundWanted && soundStarted);
    soundBtn.setAttribute("aria-checked", String(soundWanted));
    soundFab.setAttribute("aria-label", soundWanted ? "Mute" : "Unmute");
  }

  // Runs inside a tap, so phones allow the audio to start.
  // The background sound outside the finale: the song, or the hum if the song can't play.
  function playBed() {
    if (songFailed) window.DunesdayAudio.enable();
    else music.play();
  }

  // The song couldn't load or play (offline, blocked, opened as a local file...): keep the hum going instead.
  function useHumInstead() {
    if (songFailed) return;
    songFailed = true;
    if (soundWanted && soundStarted && soundMode === "song") {
      window.DunesdayAudio.enable();
      toast("Couldn't load the song, so here's the desert hum");
    }
  }

  // A few seconds after starting, make sure the song is actually playing.
  function checkSong(triesLeft = 3) {
    setTimeout(() => {
      if (songFailed || !soundWanted || soundMode !== "song" || music.isPlaying()) return;
      if (music.isBuffering() && triesLeft > 1) checkSong(triesLeft - 1); // slow connection: give it longer
      else useHumInstead();
    }, 4000);
  }

  function startSound(playSong = true) {
    soundStarted = true;
    window.DunesdayAudio.unlock();
    if (playSong && soundMode === "song") {
      playBed();
      checkSong();
    }
    updateSoundUI();
  }

  function setMuted(muted) {
    soundWanted = !muted;
    try { muted ? localStorage.setItem("dunesday-muted", "1") : localStorage.removeItem("dunesday-muted"); } catch (e) { /* storage unavailable */ }
    if (muted) {
      music.stop();
      window.DunesdayAudio.disable();
    } else {
      startSound(false);
      if (soundMode === "swell") window.DunesdayAudio.enable();
      else { playBed(); checkSong(); }
    }
    updateSoundUI();
  }

  // The speaker button and the switch: first press starts sound, after that they mute/unmute.
  function onSoundControl() {
    if (soundWanted && !soundStarted) startSound();
    else setMuted(soundWanted);
  }
  soundBtn.addEventListener("click", onSoundControl);
  soundFab.addEventListener("click", onSoundControl);

  // First tap anywhere else starts the sound (unless muted).
  function firstGesture(e) {
    if (e.target.closest && e.target.closest("#btn-sound, #sound-fab")) return; // they handle themselves
    ["pointerdown", "keydown"].forEach((t) => document.removeEventListener(t, firstGesture, true));
    if (soundWanted && !soundStarted) startSound();
  }
  ["pointerdown", "keydown"].forEach((t) => document.addEventListener(t, firstGesture, true));

  /* Voice lines for the title taps: "Lisan al Gaib!" for DUNE, "VICTOR" for SDAY.
     Plays a recording if one is set in config, otherwise the browser speaks it. */
  const lines = C.voiceLines || {};
  const recordings = {};
  let speaking = false;
  let deepVoice = null;

  // Prefer a deep English voice when the device has one.
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    const deep = /(male|daniel|guy|davis|andrew|christopher|eric|roger|aaron|arthur|fred|ralph|david|mark|george|james)/i;
    deepVoice = voices.find((v) => deep.test(v.name) && !/female/i.test(v.name)) || voices[0] || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", pickVoice);
  }

  function lineDone() {
    speaking = false;
    music.duck(false);
  }

  function sayLine(side) {
    const line = lines[side];
    if (!line || !soundWanted || speaking) return;
    speaking = true;
    music.duck(true);
    window.DunesdayAudio.hit(line.hit);
    const safety = setTimeout(lineDone, 6000); // never leave the song dipped

    const speak = () => {
      if (!("speechSynthesis" in window)) { clearTimeout(safety); setTimeout(lineDone, 1200); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line.say || line.text);
      if (deepVoice) u.voice = deepVoice;
      u.lang = (deepVoice && deepVoice.lang) || "en-US";
      u.pitch = line.pitch ?? 0.5;
      u.rate = line.rate ?? 0.8;
      u.volume = 1;
      u.onend = u.onerror = () => { clearTimeout(safety); lineDone(); };
      setTimeout(() => speechSynthesis.speak(u), 120); // let the hit land first
    };

    if (line.file) {
      const a = recordings[side] || (recordings[side] = new Audio(line.file));
      a.currentTime = 0;
      a.onended = () => { clearTimeout(safety); lineDone(); };
      a.play().catch(() => speak()); // missing or blocked file: fall back to the browser voice
    } else {
      speak();
    }
  }

  // Called every second by the countdown.
  function soundTick(msLeft) {
    if (!soundWanted || !soundStarted) return;
    if (msLeft > 0 && msLeft <= 11000 && soundMode === "song") {
      soundMode = "swell";
      music.stop(1500);
      window.DunesdayAudio.enable();
    }
    window.DunesdayAudio.update(msLeft);
  }

  // A showing just started: the hum's big hit, then the song returns.
  function soundShowtime() {
    window.DunesdayAudio.showtime();
    setTimeout(() => {
      if (soundMode !== "swell") return;
      soundMode = "song";
      if (songFailed) return; // the hum is the background sound; it has already settled back down
      window.DunesdayAudio.disable(false);
      if (soundWanted && soundStarted) music.play();
    }, 9000);
  }

  updateSoundUI();

  /* ---------- Install as an app ---------- */

  const installBtn = $("#btn-install");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installPrompt = null;

  // Android / desktop Chrome & Edge: the browser offers a real install prompt.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
    toast("Installed. Look for the Dunesday icon.");
  });
  // iPhone / iPad: there's no prompt, so explain the Share-sheet steps.
  if (isIOS && !standalone) installBtn.hidden = false;

  installBtn.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installBtn.hidden = true;
    } else {
      toast("Tap the Share button, then “Add to Home Screen”");
    }
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
  }

  /* ---------- Toast ---------- */

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------- Boot ---------- */

  // Personal links: ?name=Mike greets them; &side=doom (or dune) picks their starting theme.
  // The name is remembered, so it still shows when they open the home-screen app.
  // ?name= with nothing after it forgets the saved name. Underscores become spaces (Big_Mike → Big Mike).
  const params = new URLSearchParams(location.search);
  let guest = (params.get("name") || "").replace(/_/g, " ").trim().replace(/\s+/g, " ").slice(0, 24);
  try {
    if (guest) localStorage.setItem("dunesday-name", guest);
    else if (params.has("name")) localStorage.removeItem("dunesday-name");
    else guest = localStorage.getItem("dunesday-name") || "";
  } catch (e) { /* storage unavailable */ }
  if (guest) {
    $("#greeting").textContent = `Hey ${guest}`;
    $("#greeting").hidden = false;
  }

  // Welcome pop-up: the first time each person opens their personal link on a device.
  // Add &welcome to the link to show it again.
  const welcome = $("#welcome");
  function openWelcome(name) {
    $("#welcome-title").textContent = `Welcome, ${name}`;
    $("#welcome-theater").textContent = (C.theater && C.theater.name) || SHOWINGS[0].theater;
    $("#welcome-shows").innerHTML = SHOWINGS.map((s) => {
      const l = showLabels(s);
      const when = l.night ? `${l.night}, ${l.time} (${l.date})` : `${l.date}, ${l.time}`;
      return `<li class="${s.side === "doom" ? "doom" : "spice"}">
        <div class="welcome-show-title">${esc(s.title)}</div>
        <div class="welcome-show-when">${esc(when)}</div>
        ${s.seats && s.seats.length ? `<div class="welcome-show-seats">${esc(seatLabel(s.seats))}</div>` : ""}
      </li>`;
    }).join("");
    // Only mention the after-midnight thing if it's true for every showing.
    $(".welcome-note").hidden = !SHOWINGS.every((s) => showLabels(s).night);
    if (typeof welcome.showModal === "function") welcome.showModal();
    else welcome.setAttribute("open", "");
  }
  function closeWelcome() {
    if (typeof welcome.close === "function") welcome.close();
    else welcome.removeAttribute("open");
  }
  $("#welcome-x").addEventListener("click", closeWelcome);
  $("#welcome-go").addEventListener("click", closeWelcome); // the tap also starts the sound
  $("#welcome-cal").addEventListener("click", downloadIcs);
  welcome.addEventListener("click", (e) => { if (e.target === welcome) closeWelcome(); }); // tap outside to close

  const nameFromLink = (params.get("name") || "").trim() !== "";
  let welcomedName = null;
  try { welcomedName = localStorage.getItem("dunesday-welcomed"); } catch (e) { /* storage unavailable */ }
  if (guest && ((nameFromLink && welcomedName !== guest) || params.has("welcome"))) {
    openWelcome(guest);
    try { localStorage.setItem("dunesday-welcomed", guest); } catch (e) { /* storage unavailable */ }
  }
  const linkSide = { dune: "spice", spice: "spice", doom: "doom", doomsday: "doom" }[(params.get("side") || "").toLowerCase()];

  // Theme: the viewer's own choice wins; otherwise the link's; otherwise Dune.
  let saved = null;
  try { saved = localStorage.getItem("dunesday-side"); } catch (e) { /* storage unavailable */ }
  if (saved === "doom" || saved === "spice") setSide(saved, false);
  else if (linkSide) setSide(linkSide);

  renderTheater();

  // Preview the arrival state with ?arrived
  if (new URLSearchParams(location.search).has("arrived")) arrive();
  else tick();
  setTimeout(scheduleWildWorm, 8000);
})();
