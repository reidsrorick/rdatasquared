const COLUMNS = [
  'id', 'name', 'tier', 'tags', 'cadence_days',
  'last_contact', 'next_due', 'phone', 'email',
  'interests', 'important_dates', 'log'
];

export function parseCSV(text) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });
  return (result.data || []).map(normalizeRow);
}

export function serializeCSV(people) {
  return Papa.unparse(people.map(orderColumns), {
    columns: COLUMNS,
    newline: '\n',
  });
}

function orderColumns(person) {
  const row = {};
  for (const col of COLUMNS) row[col] = person[col] ?? '';
  return row;
}

function normalizeRow(row) {
  return {
    id: row.id || crypto.randomUUID(),
    name: row.name || '',
    tier: row.tier || 'casual',
    tags: row.tags || '',
    cadence_days: parseInt(row.cadence_days) || 90,
    last_contact: row.last_contact || '',
    next_due: row.next_due || '',
    phone: row.phone || '',
    email: row.email || '',
    interests: row.interests || '',
    important_dates: row.important_dates || '',
    log: row.log || '',
  };
}

export function computeNextDue(lastContact, cadenceDays) {
  if (!lastContact) return '';
  const d = new Date(lastContact + 'T00:00:00');
  d.setDate(d.getDate() + parseInt(cadenceDays));
  return d.toISOString().slice(0, 10);
}

export function parseTags(tagStr) {
  return (tagStr || '').split('|').map(t => t.trim()).filter(Boolean);
}

export function serializeTags(tagsArr) {
  return tagsArr.filter(Boolean).join('|');
}

export function parseLog(logStr) {
  if (!logStr) return [];
  return logStr.split('\n').filter(l => l.trim()).map(line => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*(.*)$/);
    if (m) return { date: m[1], notes: m[2] };
    return { date: '', notes: line };
  });
}

export function prependLogEntry(existing, date, notes) {
  const entry = `${date}: ${notes.trim()}`;
  return existing ? `${entry}\n${existing}` : entry;
}
