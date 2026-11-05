import { html, useState, useEffect, useRef, useMemo } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { money, monthLabel, todayISO, longDate } from '../format.js';
import { monthKpis, monthlySpending } from '../logic/reports.js';
import { budgetByGroup } from '../logic/budget.js';
import { upcomingDue, toggleBillPaid } from '../logic/bills.js';
import { renderMonthlyChart } from '../charts.js';

function ymStr(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }

export function Dashboard() {
  const s = store.getState();
  const now = new Date();
  const today = todayISO();

  const [sel, setSel] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [includeWork, setIncludeWork] = useState(false);
  const [showAvg, setShowAvg] = useState(false);
  const [showMedian, setShowMedian] = useState(false);
  const [range, setRange] = useState(() => {
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return { from: ymStr(from.getFullYear(), from.getMonth() + 1), to: ymStr(now.getFullYear(), now.getMonth() + 1) };
  });
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  const isCurrent = sel.year === now.getFullYear() && sel.month === now.getMonth() + 1;

  if (!s.accounts.length && !s.transactions.length) {
    return html`
      <${PageHeader} title="Dashboard" />
      <div class="empty-state">
        <h2>Welcome to RBS Budget</h2>
        <p>Everything runs in your browser now. Add an account, then import a CSV or add
           transactions by hand. Back up from the Data page.</p>
        <a href="#/accounts" class="btn btn-primary">Add Account</a>
      </div>`;
  }

  const kpis = useMemo(() => monthKpis(sel.year, sel.month, { includeWork }, s),
    [sel, includeWork, s]);
  const budget = useMemo(() => budgetByGroup(sel.year, sel.month, { includeWork }, s),
    [sel, includeWork, s]);
  const due = useMemo(() => upcomingDue(today, s), [today, s]);
  const series = useMemo(() => monthlySpending(range.from, range.to, { includeWork }, s),
    [range, includeWork, s]);

  function changeMonth(delta) {
    setSel(({ year, month }) => {
      let m = month + delta, y = year;
      if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
      return { year: y, month: m };
    });
  }

  // ── Monthly line chart ──
  const canvasRef = useRef(null);
  useEffect(() => {
    const selKey = ymStr(sel.year, sel.month);
    const idx = series.findIndex((d) => d.month === selKey);
    renderMonthlyChart(canvasRef.current, series, (d) => {
      const [y, m] = d.month.split('-').map(Number);
      setSel({ year: y, month: m });
    }, idx, { showAvg, showMedian });
  }, [series, showAvg, showMedian, sel]);
  useEffect(() => () => {
    if (canvasRef.current && canvasRef.current._chart) canvasRef.current._chart.destroy();
  }, []);

  async function checkDue(d) {
    await toggleBillPaid(d.categoryId, d.dueDate);
  }

  return html`
    <${PageHeader} title="Dashboard">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="dash-month-nav">
          <button class="btn btn-sm" title="Previous month" onClick=${() => changeMonth(-1)}>←</button>
          <span class="text-muted">${monthLabel(sel.year, sel.month)}</span>
          <button class="btn btn-sm" title="Next month" onClick=${() => changeMonth(1)}>→</button>
          ${!isCurrent ? html`<button class="btn btn-sm"
            onClick=${() => setSel({ year: now.getFullYear(), month: now.getMonth() + 1 })}>This Month</button>` : null}
        </div>
        <label class="toggle-label" style="text-transform:none;letter-spacing:normal;font-size:13px;font-weight:500">
          <input type="checkbox" checked=${includeWork} onChange=${(e) => setIncludeWork(e.target.checked)} />
          Include work expenses
        </label>
      </div>
    </${PageHeader}>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Spending</div>
        <div class="stat-value expense">${money(kpis.spending)}</div></div>
      <div class="stat-card"><div class="stat-label">Income</div>
        <div class="stat-value income">${money(kpis.income)}</div></div>
      <div class="stat-card"><div class="stat-label">Net</div>
        <div class="stat-value ${kpis.net >= 0 ? 'income' : 'expense'}">${money(kpis.net)}</div></div>
      <div class="stat-card"><div class="stat-label">CC Transfers Excluded</div>
        <div class="stat-value neutral">${kpis.transfers}</div>
        <div class="stat-sub">auto-excluded from totals</div></div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card-header">
          <h2>${monthLabel(sel.year, sel.month)} Budget</h2>
          <a href="#/budget?year=${sel.year}&month=${sel.month}" class="btn btn-sm">Open Budget</a>
        </div>
        <div class="budget-bars">
          ${budget.groups.length ? budget.groups.map((g) => html`
            <div class="budget-group" key=${g.name}>
              <div class="budget-bar-row budget-group-row" onClick=${() => setCollapsedGroups((c) => {
                const n = new Set(c); n.has(g.name) ? n.delete(g.name) : n.add(g.name); return n;
              })} style="cursor:pointer">
                ${bar(g.name, g.color, g.spent, g.planned, true, !collapsedGroups.has(g.name))}
              </div>
              ${!collapsedGroups.has(g.name) ? html`
                <div class="budget-group-children">
                  ${g.categories.map((c) => html`<div class="budget-bar-row child" key=${c.name}>${bar(c.name, c.color, c.spent, c.planned, false)}</div>`)}
                </div>` : null}
            </div>`)
            : html`<p class="empty-message" style="padding:24px 8px">No budget set for this month. <a href="#/budget">Set one up →</a></p>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Next Due</h2>
          <a href="#/bills" class="btn btn-sm">Manage</a>
        </div>
        <div class="due-list">
          ${due.length ? due.map((d) => html`
            <div class="due-item due-${d.status}" key=${d.categoryId}>
              <input type="checkbox" class="due-check" checked=${d.status === 'paid'} onChange=${() => checkDue(d)} />
              <span class="color-dot" style=${`background:${d.color}`}></span>
              <div class="due-info">
                <div class="due-name">${d.name}</div>
                <div class="due-sub text-muted">
                  ${new Date(d.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·${' '}
                  ${d.status === 'paid' ? html`<span class="due-pending">Paid · pending confirmation</span>`
                    : d.days < 0 ? html`<span class="due-overdue">Overdue by ${-d.days} day${-d.days !== 1 ? 's' : ''}</span>`
                    : d.days === 0 ? 'Today' : d.days === 1 ? 'Tomorrow' : `in ${d.days} days`}
                  ${d.recurrence === 'yearly' ? ' · yearly' : ''}
                </div>
              </div>
              ${d.amount ? html`<span class="due-amount">${money(d.amount)}</span>` : null}
              ${d.link ? html`<a href=${d.link} target="_blank" rel="noopener" class="btn btn-sm cat-pay-link">↗ Pay</a>` : null}
            </div>`)
            : html`<p class="empty-message" style="padding:24px 8px">Nothing due in the next 45 days. Add due dates to categories (on Categories or Budget) to see upcoming bills here.</p>`}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Monthly Spending</h2>
        <div class="chart-controls">
          <label class="chart-toggle"><input type="checkbox" checked=${showAvg} onChange=${(e) => setShowAvg(e.target.checked)} /><span class="chart-swatch" style="background:#f59e0b"></span>Average</label>
          <label class="chart-toggle"><input type="checkbox" checked=${showMedian} onChange=${(e) => setShowMedian(e.target.checked)} /><span class="chart-swatch" style="background:#7c3aed"></span>Median</label>
          <span class="chart-range">
            <input type="month" class="form-control-sm" value=${range.from} max=${range.to}
                   onChange=${(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            <span class="text-muted" style="font-size:12px">to</span>
            <input type="month" class="form-control-sm" value=${range.to}
                   onChange=${(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
          </span>
        </div>
      </div>
      <div class="chart-container">
        ${series.length ? html`<canvas ref=${canvasRef}></canvas>`
          : html`<p class="empty-message" style="padding:40px;text-align:center">No data for this range.</p>`}
      </div>
    </div>`;
}

function barPct(spent, planned) {
  if (planned > 0) return Math.min((spent / planned) * 100, 100);
  return spent > 0 ? 100 : 0;
}

function bar(name, color, spent, planned, isGroup, open) {
  const over = spent > planned;
  return html`
    <div class="budget-bar-head">
      <span class="budget-bar-name">
        ${isGroup ? html`<span class="grp-chevron ${open ? 'open' : ''}">▸</span>` : null}
        <span class="color-dot" style=${`background:${color}`}></span>${name}
      </span>
      <span class="budget-bar-amt ${over ? 'amount-expense' : 'text-muted'}">${money(spent)} / ${money(planned)}</span>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar ${over ? 'progress-over' : 'progress-ok'}" style=${`width:${barPct(spent, planned)}%`}></div></div>`;
}
