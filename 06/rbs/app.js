const { useState, useEffect, useMemo } = React;

const CATEGORIES = [
  'Food & Dining', 'Housing', 'Transport', 'Entertainment',
  'Healthcare', 'Shopping', 'Utilities', 'Income', 'Savings', 'Other'
];

// ── persistence ──────────────────────────────────────────────────────────────

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));

const today = () => new Date().toISOString().split('T')[0];

// ── Summary ───────────────────────────────────────────────────────────────────

function Summary({ transactions }) {
  const income   = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const balance  = income + expenses;

  return (
    <div className="summary">
      <div className="summary-card">
        <span className="s-label">Balance</span>
        <span className={`s-amount ${balance >= 0 ? 'pos' : 'neg'}`}>
          {balance < 0 ? '−' : ''}{fmt(balance)}
        </span>
      </div>
      <div className="summary-card">
        <span className="s-label">Income</span>
        <span className="s-amount pos">{fmt(income)}</span>
      </div>
      <div className="summary-card">
        <span className="s-label">Expenses</span>
        <span className="s-amount neg">{fmt(expenses)}</span>
      </div>
    </div>
  );
}

// ── AddTransaction ────────────────────────────────────────────────────────────

const EMPTY_FORM = { description: '', amount: '', category: 'Other', date: today(), type: 'expense' };

function AddTransaction({ onAdd }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    setError('');
    const amt = parseFloat(form.amount);
    if (!form.description.trim()) return setError('Description is required.');
    if (isNaN(amt) || amt <= 0)  return setError('Enter a valid positive amount.');
    onAdd({
      id: crypto.randomUUID(),
      description: form.description.trim(),
      amount: form.type === 'expense' ? -amt : amt,
      category: form.category,
      date: form.date,
    });
    setForm(f => ({ ...EMPTY_FORM, type: f.type, date: f.date, category: f.category }));
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <h2 className="section-title">Add Transaction</h2>

      <div className="type-toggle">
        {['expense', 'income'].map(t => (
          <button
            key={t} type="button"
            className={`type-btn ${form.type === t ? `active-${t}` : ''}`}
            onClick={() => set('type', t)}
          >
            {t === 'expense' ? '− Expense' : '+ Income'}
          </button>
        ))}
      </div>

      <div className="form-grid">
        <input
          className="f-desc"
          placeholder="Description"
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
        <input
          className="f-amount"
          type="number" placeholder="0.00" min="0" step="0.01"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
        />
        <select value={form.category} onChange={e => set('category', e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        <button className="add-btn" type="submit">Add</button>
      </div>

      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

// ── TransactionList ───────────────────────────────────────────────────────────

function TransactionList({ transactions, onDelete, onEdit }) {
  const [search, setSearch]   = useState('');
  const [catFilter, setCat]   = useState('All');
  const [typeFilter, setType] = useState('All');

  const filtered = useMemo(() => {
    return [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .filter(t => {
        const matchSearch = t.description.toLowerCase().includes(search.toLowerCase());
        const matchCat    = catFilter === 'All' || t.category === catFilter;
        const matchType   = typeFilter === 'All'
          || (typeFilter === 'income'  && t.amount > 0)
          || (typeFilter === 'expense' && t.amount < 0);
        return matchSearch && matchCat && matchType;
      });
  }, [transactions, search, catFilter, typeFilter]);

  return (
    <div className="tx-section">
      <div className="tx-header">
        <h2 className="section-title">Transactions</h2>
        <span className="tx-count">{filtered.length} of {transactions.length}</span>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={catFilter} onChange={e => setCat(e.target.value)}>
          <option>All</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setType(e.target.value)}>
          <option value="All">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>

      {filtered.length === 0
        ? <p className="empty">No transactions match your filters.</p>
        : filtered.map(t => (
          <TransactionRow key={t.id} t={t} onDelete={onDelete} onEdit={onEdit} />
        ))
      }
    </div>
  );
}

// ── TransactionRow ────────────────────────────────────────────────────────────

function TransactionRow({ t, onDelete, onEdit }) {
  const [editingCat, setEditingCat] = useState(false);

  return (
    <div className={`tx-row ${t.amount >= 0 ? 'tx-income' : 'tx-expense'}`}>
      <div className="tx-accent" />
      <div className="tx-body">
        <div className="tx-top">
          <span className="tx-desc">{t.description}</span>
          <span className={`tx-amount ${t.amount >= 0 ? 'pos' : 'neg'}`}>
            {t.amount >= 0 ? '+' : '−'}{fmt(t.amount)}
          </span>
        </div>
        <div className="tx-meta">
          <span className="tx-date">{t.date}</span>
          {editingCat
            ? (
              <select
                className="cat-select-inline"
                value={t.category}
                autoFocus
                onChange={e => { onEdit(t.id, { category: e.target.value }); setEditingCat(false); }}
                onBlur={() => setEditingCat(false)}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            )
            : (
              <button className="cat-pill" onClick={() => setEditingCat(true)} title="Edit category">
                {t.category}
              </button>
            )
          }
        </div>
      </div>
      <button className="del-btn" onClick={() => onDelete(t.id)} title="Delete">×</button>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [transactions, setTx] = useLocalStorage('budget_v1', []);

  const addTx    = (t)         => setTx(prev => [t, ...prev]);
  const deleteTx = (id)        => setTx(prev => prev.filter(t => t.id !== id));
  const editTx   = (id, patch) => setTx(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Budget</h1>
        <span className="app-sub">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
      </header>
      <main className="app-main">
        <Summary transactions={transactions} />
        <AddTransaction onAdd={addTx} />
        <TransactionList transactions={transactions} onDelete={deleteTx} onEdit={editTx} />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
