/* ===================================================================
   utils.js — Pure utility/helper functions
   No DOM, no state, no fetch. Safe to load first.
   =================================================================== */

"use strict";

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

function fmtDate(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function fmtDateTime(d) {
  return fmtDate(d) + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0");
}

// Display-only date formatter — converts stored ISO "YYYY-MM-DD" to chosen display format.
// The underlying stored value is always ISO; this only affects what users see.
// Token reference: YYYY YY | MMMM MMM MM M | DDDD DDD DD D
// DDDD=Tuesday  DDD=Tue  DD=28  D=28(unpadded)
// MMMM=April    MMM=Apr  MM=04  M=4
// YYYY=2026      YY=26
function fmtDisplayDate(isoStr, fmt) {
  if (!isoStr || !fmt) return isoStr || "";
  const parts = isoStr.split("-");
  if (parts.length !== 3) return isoStr;
  const [y, m, d] = parts;
  const months     = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fullMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const shortDays  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const fullDays   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const mi  = parseInt(m, 10) - 1;
  const di  = parseInt(d, 10);
  // Compute day-of-week lazily — only if format uses DDDD/DDD tokens
  let dow = null;
  const getDow = () => { if (dow === null) dow = new Date(`${y}-${m}-${d}T00:00:00`).getDay(); return dow; };
  // Regex matches longest token first at each position (no re-scan of replacements)
  return fmt.replace(/DDDD|DDD|DD|D|MMMM|MMM|MM|M|YYYY|YY/g, tok => {
    switch (tok) {
      case "DDDD": return fullDays[getDow()];
      case "DDD":  return shortDays[getDow()];
      case "DD":   return d;
      case "D":    return String(di);
      case "MMMM": return fullMonths[mi];
      case "MMM":  return months[mi];
      case "MM":   return m;
      case "M":    return String(mi + 1);
      case "YYYY": return y;
      case "YY":   return y.slice(2);
    }
  });
}

function fmtTime12h(timeStr) {
  // Convert "HH:MM" (24h) to "h:MM AM/PM" for display; sorting still uses raw 24h
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const period = h < 12 ? "AM" : "PM";
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Returns "YYYY-MM-DD HH:MM" for the current moment — used to compare snooze expiry
function fmtSnoozeNow() {
  const d = new Date();
  return fmtDate(d) + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, "0"); }

// Returns row.category as a string[] regardless of whether it is stored as a
// JSON array (new format) or a plain string (legacy format).
function getCategories(row) {
  const c = row?.category ?? "";
  if (!c) return [];
  if (c.charAt(0) === "[") {
    try { return JSON.parse(c).filter(Boolean); } catch {}
  }
  return [c];
}

// Converts a string[] back to the stored format (JSON array string).
function setCategories(row, arr) {
  row.category = arr.length ? JSON.stringify(arr) : "";
}

// Display helper — returns a human-readable comma-joined string.
function fmtCategories(row) {
  return getCategories(row).join(", ");
}

// ---------------------------------------------------------------------------
// Date calculations
// ---------------------------------------------------------------------------

/** Returns { start, end } ISO strings for the Mon–Sun week at `offsetWeeks` from today. */
function getWeekBounds(offsetWeeks = 0) {
  const d   = new Date();
  const dow = d.getDay();                       // 0=Sun … 6=Sat
  const toMonday = dow === 0 ? -6 : 1 - dow;   // days back to Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() + toMonday + offsetWeeks * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: fmtDate(mon), end: fmtDate(sun) };
}

/**
 * Compute next recurrence date from `fromDateStr` using `rule` ("N:unit").
 * unit: "days" | "weekdays" | "weeks" | "months"
 */
function nextRecurDate(fromDateStr, rule) {
  if (!fromDateStr || !rule) return "";
  const [rawN, unit] = rule.split(":");
  const n = Math.max(1, parseInt(rawN) || 1);
  const d = new Date(fromDateStr + "T00:00:00");
  switch (unit) {
    case "days":
      d.setDate(d.getDate() + n);
      break;
    case "weekdays":
      for (let i = 0; i < n; ) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) i++;
      }
      break;
    case "weeks":
      d.setDate(d.getDate() + n * 7);
      break;
    case "months":
      d.setMonth(d.getMonth() + n);
      break;
    default: return "";
  }
  return fmtDate(d);
}
