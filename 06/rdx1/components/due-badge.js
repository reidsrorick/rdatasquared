export function dueBadgeHTML(nextDue, compact = false) {
  if (!nextDue) return '';
  const today = todayStr();
  const diff = daysDiff(today, nextDue);
  if (diff < 0) {
    const n = Math.abs(diff);
    const label = n === 1 ? '1 day overdue' : `${n} days overdue`;
    return `<span class="due-badge due-badge--overdue">${label}</span>`;
  }
  if (diff === 0) return `<span class="due-badge due-badge--today">Due today</span>`;
  if (diff <= 7) return `<span class="due-badge due-badge--soon">in ${diff}d</span>`;
  return compact ? '' : `<span class="due-badge due-badge--ok">in ${diff}d</span>`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysDiff(from, to) {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
