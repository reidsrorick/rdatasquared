// The data model: one plain object, all collections as id-keyed arrays.
// freshState() builds a new install's defaults; migrate() upgrades an older
// exported/stored blob to the current shape.

export const SCHEMA_VERSION = 1;

export const COLLECTIONS = [
  'accounts', 'categoryGroups', 'categories', 'tags', 'transactions',
  'spendingPlans', 'billPayments', 'balanceSnapshots', 'imports', 'recurringCharges',
];

// collection name -> singular key used in state.seq
export const SEQ_KEY = {
  accounts: 'account',
  categoryGroups: 'categoryGroup',
  categories: 'category',
  tags: 'tag',
  transactions: 'transaction',
  spendingPlans: 'spendingPlan',
  billPayments: 'billPayment',
  balanceSnapshots: 'balanceSnapshot',
  imports: 'import',
  recurringCharges: 'recurringCharge',
};

export function emptyState() {
  const s = {
    version: SCHEMA_VERSION,
    meta: { lastExport: null, createdAt: new Date().toISOString() },
    seq: {},
  };
  for (const c of COLLECTIONS) {
    s[c] = [];
    s.seq[SEQ_KEY[c]] = 0;
  }
  return s;
}

export function freshState() {
  const s = emptyState();
  let cg = 0, c = 0, t = 0;

  const group = (name, color) => {
    const id = ++cg;
    s.categoryGroups.push({ id, name, color, sortOrder: id - 1 });
    return id;
  };
  const cat = (name, color, groupId, opts = {}) => {
    const id = ++c;
    s.categories.push({
      id, name, color,
      isIncome: !!opts.isIncome,
      excludeFromBudget: !!opts.excludeFromBudget,
      groupId,
      sortOrder: opts.sortOrder ?? 0,
      notes: '', link: '',
      dueDate: null, recurrence: 'none', defaultBudget: 0,
    });
    return id;
  };

  const food    = group('Food & Dining',  '#ea580c');
  const trans   = group('Transportation', '#ca8a04');
  const housing = group('Housing & Bills', '#0891b2');
  const shop    = group('Shopping',       '#7c3aed');
  const ent     = group('Entertainment',  '#db2777');
  const health  = group('Health',         '#dc2626');
  const travel  = group('Travel',         '#2563eb');
  const income  = group('Income',         '#15803d');
  const other   = group('Other',          '#6b7280');

  cat('Groceries',     '#16a34a', food,    { sortOrder: 0 });
  cat('Dining Out',    '#ea580c', food,    { sortOrder: 1 });
  cat('Fast Food',     '#f97316', food,    { sortOrder: 2 });
  cat('Gas',           '#ca8a04', trans,   { sortOrder: 0 });
  cat('Parking',       '#a16207', trans,   { sortOrder: 1 });
  cat('Rent/Mortgage', '#0e7490', housing, { sortOrder: 0 });
  cat('Utilities',     '#0891b2', housing, { sortOrder: 1 });
  cat('Shopping',      '#7c3aed', shop,    { sortOrder: 0 });
  cat('Clothing',      '#6d28d9', shop,    { sortOrder: 1 });
  cat('Entertainment', '#db2777', ent,     { sortOrder: 0 });
  cat('Subscriptions', '#9333ea', ent,     { sortOrder: 1 });
  cat('Healthcare',    '#dc2626', health,  { sortOrder: 0 });
  cat('Pharmacy',      '#b91c1c', health,  { sortOrder: 1 });
  cat('Travel',        '#2563eb', travel,  { sortOrder: 0 });
  cat('Hotels',        '#1d4ed8', travel,  { sortOrder: 1 });
  cat('Income',        '#15803d', income,  { sortOrder: 0, isIncome: true });
  cat('Transfer',      '#9ca3af', other,   { sortOrder: 0, excludeFromBudget: true });
  cat('Other',         '#6b7280', other,   { sortOrder: 1 });

  s.tags.push({ id: ++t, name: 'Work', color: '#0891b2', excludeFromBudget: true, sortOrder: 0 });

  s.seq.categoryGroup = cg;
  s.seq.category = c;
  s.seq.tag = t;
  return s;
}

// Bring a stored or imported blob up to the current schema. Keyed on the blob's
// own version so future format changes are a matter of adding cases here.
export function migrate(state) {
  if (!state || typeof state !== 'object') return freshState();

  state.meta = state.meta || { lastExport: null };
  state.seq = state.seq || {};
  for (const c of COLLECTIONS) {
    if (!Array.isArray(state[c])) state[c] = [];
    const k = SEQ_KEY[c];
    if (typeof state.seq[k] !== 'number') {
      state.seq[k] = state[c].reduce((max, r) => Math.max(max, r.id || 0), 0);
    }
  }

  // --- version upgrades go here ---
  // if (state.version < 2) { ...; state.version = 2; }

  state.version = SCHEMA_VERSION;
  return state;
}

// Shape check for imported files — enough to reject a wrong file, not a full validator.
export function looksLikeBackup(data) {
  return data && typeof data === 'object'
    && Array.isArray(data.transactions)
    && Array.isArray(data.accounts)
    && Array.isArray(data.categories);
}
