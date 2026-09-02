// ===== Derived / computed data =====
import { todayISO, daysBetween, parseISO, isoDate } from './util.js';

export function displayName(c) {
  const n = `${c.firstName} ${c.lastName}`.trim();
  return n || c.company || '(no name)';
}

export function sortKeyLast(c) {
  return `${(c.lastName || c.firstName || c.company || '~').toLowerCase()} ${(c.firstName || '').toLowerCase()}`;
}
export function sortKeyFirst(c) {
  return `${(c.firstName || c.lastName || c.company || '~').toLowerCase()} ${(c.lastName || '').toLowerCase()}`;
}

export function lastInteraction(c) {
  return c.interactions.length ? c.interactions[0] : null; // already sorted desc
}
export function lastContactedISO(c) {
  const li = lastInteraction(c);
  return li ? li.date : null;
}

// Keep-in-touch status. Returns { state, dueInDays, sinceDays, anchorISO }
// state: 'off' | 'ok' | 'soon' | 'overdue'
export function keepInTouchStatus(c, todayStr = todayISO()) {
  if (!c.keepInTouch || !c.keepInTouch.enabled) return { state: 'off' };
  const interval = c.keepInTouch.intervalDays || 90;
  const anchor = lastContactedISO(c) || isoDate(parseISO(c.createdAt ? c.createdAt.slice(0, 10) : todayStr) || new Date());
  const since = daysBetween(anchor, todayStr);
  const dueIn = interval - since;
  let state = 'ok';
  if (dueIn <= 0) state = 'overdue';
  else if (dueIn <= 7) state = 'soon';
  return { state, dueInDays: dueIn, sinceDays: since, anchorISO: anchor, interval };
}

// Next occurrence of a birthday (this year or next). Returns { dateISO, inDays, turning }
export function nextBirthday(c, todayStr = todayISO()) {
  if (!c.birthday) return null;
  const today = parseISO(todayStr);
  const { month, day, year } = c.birthday;
  let target = new Date(today.getFullYear(), month - 1, day);
  if (target < today) target = new Date(today.getFullYear() + 1, month - 1, day);
  const inDays = Math.round((target - today) / 86400000);
  const turning = year ? target.getFullYear() - year : null;
  return { dateISO: isoDate(target), inDays, turning };
}

export function openFollowUps(c) {
  return c.followUps.filter(f => !f.done);
}

// ---- Dashboard aggregation ----
export function buildDashboard(contacts, todayStr = todayISO()) {
  const reachOut = [];
  const birthdays = [];
  const activity = [];

  for (const c of contacts) {
    const kit = keepInTouchStatus(c, todayStr);
    const fus = openFollowUps(c).map(f => ({ ...f, _dueIn: daysBetween(todayStr, f.date) }));
    const soonestFU = fus.filter(f => f._dueIn <= 7).sort((a, b) => a._dueIn - b._dueIn)[0] || null;

    if (kit.state === 'overdue' || kit.state === 'soon' || soonestFU) {
      // rank: most overdue first (smallest number). Follow-up date can override.
      const cadenceRank = (kit.state === 'overdue' || kit.state === 'soon') ? kit.dueInDays : Infinity;
      const fuRank = soonestFU ? soonestFU._dueIn : Infinity;
      reachOut.push({
        contact: c,
        rank: Math.min(cadenceRank, fuRank),
        kit,
        followUp: soonestFU,
      });
    }

    const nb = nextBirthday(c, todayStr);
    if (nb && nb.inDays <= 30) birthdays.push({ contact: c, ...nb });

    for (const i of c.interactions) activity.push({ contact: c, interaction: i });
  }

  reachOut.sort((a, b) => a.rank - b.rank);
  birthdays.sort((a, b) => a.inDays - b.inDays);
  activity.sort((a, b) => (a.interaction.date < b.interaction.date ? 1 : -1));

  return { reachOut, birthdays, activity: activity.slice(0, 12) };
}

// ---- Search ----
export function contactMatches(c, q) {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  const hay = [
    c.firstName, c.lastName, c.company, c.title, c.notes, c.address,
    ...c.tags,
    ...c.phones.map(p => p.value),
    ...c.emails.map(e => e.value),
    ...c.customFields.map(f => `${f.label} ${f.value}`),
  ].join(' ').toLowerCase();
  return needle.split(/\s+/).every(term => hay.includes(term));
}

// ---- Duplicate detection ----
export function findDuplicates(existing, incoming) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const dups = [];
  for (const inc of incoming) {
    if (existing.some(e => e.id === inc.id)) continue; // same id = update, not dup
    const incName = norm(displayName(inc));
    const incEmails = new Set(inc.emails.map(e => norm(e.value)).filter(Boolean));
    const incPhones = new Set(inc.phones.map(p => norm(p.value)).filter(Boolean));
    const match = existing.find(e => {
      if (incName && norm(displayName(e)) === incName) return true;
      if ([...incEmails].some(x => e.emails.some(y => norm(y.value) === x))) return true;
      if ([...incPhones].some(x => e.phones.some(y => norm(y.value) === x))) return true;
      return false;
    });
    if (match) dups.push({ incoming: inc, existing: match });
  }
  return dups;
}

export const INTERVAL_OPTIONS = [
  { v: 14, label: 'Every 2 weeks' },
  { v: 30, label: 'Monthly' },
  { v: 60, label: 'Every 2 months' },
  { v: 90, label: 'Quarterly' },
  { v: 180, label: 'Twice a year' },
  { v: 365, label: 'Yearly' },
];

export const INTERACTION_TYPES = ['call', 'meeting', 'message', 'email', 'note', 'other'];
