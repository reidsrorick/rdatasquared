import { html, useState, useEffect, useMemo } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { Modal, FormActions } from '../ui.js';
import { notify } from '../toast.js';
import { money, parseMoney, round2, monthLabel } from '../format.js';
import { catColor } from '../logic/categories.js';
import {
  budgetView, ensureAutoPopulated, savePlan, copyLastMonth, reallocate, visibleInMonth,
} from '../logic/budget.js';

function ym(query) {
  const now = new Date();
  const year = Number(query.get('year')) || now.getFullYear();
  const month = Number(query.get('month')) || now.getMonth() + 1;
  return { year, month, includeWork: query.get('include_work') === '1' };
}

function gotoMonth(year, month, includeWork) {
  const q = new URLSearchParams({ year: String(year), month: String(month) });
  if (includeWork) q.set('include_work', '1');
  location.hash = '#/budget?' + q.toString();
}

export function Budget({ query }) {
  const { year, month, includeWork } = ym(query);
  const s = store.getState();
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  useEffect(() => { ensureAutoPopulated(year, month, { includeWork }); }, [year, month, includeWork]);

  const model = useMemo(
    () => budgetView(year, month, { includeWork }, s),
    [year, month, includeWork, s],
  );
  const { expenseGroups, ungroupedExpense, planned, actual, uncategorizedActual } = model;

  const allCats = [...expenseGroups.flatMap((r) => r.categories), ...ungroupedExpense];

  // Local edits: catId -> string. Reset whenever the month/plan set changes.
  const [edits, setEdits] = useState({});
  const plansKey = s.spendingPlans.filter((p) => p.year === year && p.month === month)
    .map((p) => `${p.categoryId}:${p.amount}`).sort().join(',');
  useEffect(() => { setEdits({}); }, [year, month, plansKey]);

  const [collapsed, setCollapsed] = useState(() => new Set());
  const [schedCat, setSchedCat] = useState(null);
  const [realloc, setRealloc] = useState(null); // { mode:'from'|'cover', cat }

  const budgetOf = (id) => {
    if (id in edits) return parseMoney(edits[id]) || 0;
    return planned.get(id) || 0;
  };

  const liveTotals = useMemo(() => {
    let tp = 0, ts = uncategorizedActual;
    for (const c of allCats) { tp += budgetOf(c.id); ts += actual.get(c.id) || 0; }
    return { totalPlanned: round2(tp), totalSpent: round2(ts) };
  }, [edits, model]);
  const remaining = round2(liveTotals.totalPlanned - liveTotals.totalSpent);

  const dirty = Object.keys(edits).length > 0;

  async function doSave() {
    const entries = allCats.map((c) => ({ categoryId: c.id, amount: budgetOf(c.id) }));
    await savePlan(year, month, entries);
    setEdits({});
    notify('Plan saved.');
  }
  async function doCopyLast() {
    if (!confirm('Copy the budget from last month? This overwrites values already entered.')) return;
    const r = await copyLastMonth(year, month);
    if (!r.ok) return notify(r.message, 'error');
    setEdits({});
    notify(`Copied ${r.copied} categor${r.copied === 1 ? 'y' : 'ies'}${r.skipped ? `, skipped ${r.skipped}` : ''}.`);
  }

  function groupTotals(cats) {
    let b = 0, sp = 0;
    for (const c of cats) { b += budgetOf(c.id); sp += actual.get(c.id) || 0; }
    return { budget: round2(b), spent: round2(sp) };
  }

  const rows = [];
  for (const { group, categories } of expenseGroups) {
    rows.push({ type: 'group', key: 'g' + group.id, id: group.id, name: group.name, cats: categories });
    if (!collapsed.has(group.id)) {
      for (const c of categories) rows.push({ type: 'cat', key: 'c' + c.id, cat: c, groupId: group.id });
    }
  }
  if (ungroupedExpense.length) {
    rows.push({ type: 'group', key: 'gU', id: 'ungrouped', name: 'Ungrouped', cats: ungroupedExpense });
    if (!collapsed.has('ungrouped')) {
      for (const c of ungroupedExpense) rows.push({ type: 'cat', key: 'c' + c.id, cat: c, groupId: 'ungrouped' });
    }
  }

  return html`
    <${PageHeader} title="Spending Plan">
      <div class="page-header-right" style="display:flex;gap:8px;align-items:center">
        <span class="text-muted">${monthLabel(year, month)}</span>
        <button class="btn" onClick=${doCopyLast}>↩ Copy Last Month</button>
        <button class="btn btn-primary" onClick=${doSave} disabled=${!dirty}>Save Plan</button>
      </div>
    </${PageHeader}>

    <div class="month-nav card">
      <button class="btn btn-sm" onClick=${() => gotoMonth(month > 1 ? year : year - 1, month > 1 ? month - 1 : 12, includeWork)}>← Prev</button>
      <span class="month-nav-label">${monthLabel(year, month)}</span>
      <button class="btn btn-sm" onClick=${() => gotoMonth(month < 12 ? year : year + 1, month < 12 ? month + 1 : 1, includeWork)}>Next →</button>
      ${!isCurrent ? html`<button class="btn btn-sm btn-primary month-nav-today"
        onClick=${() => gotoMonth(now.getFullYear(), now.getMonth() + 1, includeWork)}>⌖ This Month</button>` : null}
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card">
        <div class="stat-label">Total Budgeted</div>
        <div class="stat-value neutral">${money(liveTotals.totalPlanned)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Spent</div>
        <div class="stat-value ${liveTotals.totalSpent > liveTotals.totalPlanned && liveTotals.totalPlanned > 0 ? 'expense' : 'neutral'}">${money(liveTotals.totalSpent)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Remaining</div>
        <div class="stat-value ${remaining < 0 ? 'expense' : remaining > 0 ? 'income' : 'neutral'}">${money(remaining)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Category Budgets</h2>
        <button class="btn btn-sm" style="margin-left:auto"
          onClick=${() => setCollapsed((c) => {
            const anyExpanded = rows.some((r) => r.type === 'group' && !c.has(r.id));
            return anyExpanded ? new Set(rows.filter((r) => r.type === 'group').map((r) => r.id)) : new Set();
          })}>
          ${rows.some((r) => r.type === 'group' && !collapsed.has(r.id)) ? 'Collapse all' : 'Expand all'}
        </button>
        <label class="toggle-label" style="text-transform:none;letter-spacing:normal;font-size:13px;font-weight:500">
          <input type="checkbox" checked=${includeWork}
                 onChange=${(e) => gotoMonth(year, month, e.target.checked)} />
          Include work expenses
        </label>
      </div>

      <div class="table-container">
        <table class="table budget-table">
          <thead><tr>
            <th>Category</th>
            <th class="text-right" style="width:135px">Budgeted</th>
            <th class="text-right" style="width:115px">Spent</th>
            <th class="text-right" style="width:115px">Remaining</th>
            <th style="width:160px">Progress</th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => r.type === 'group'
              ? html`<${GroupRow} key=${r.key} name=${r.name} id=${r.id}
                       totals=${groupTotals(r.cats)}
                       collapsed=${collapsed.has(r.id)}
                       onToggle=${() => setCollapsed((c) => {
                         const n = new Set(c); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n;
                       })} />`
              : html`<${CatRow} key=${r.key} cat=${r.cat} s=${s}
                       budget=${budgetOf(r.cat.id)}
                       spent=${actual.get(r.cat.id) || 0}
                       value=${r.cat.id in edits ? edits[r.cat.id] : (planned.get(r.cat.id) ? planned.get(r.cat.id).toFixed(2) : '')}
                       onInput=${(v) => setEdits((e) => ({ ...e, [r.cat.id]: v }))}
                       onSchedule=${() => setSchedCat(r.cat)}
                       onMove=${() => setRealloc({ mode: 'from', cat: r.cat })}
                       onCover=${() => setRealloc({ mode: 'cover', cat: r.cat })} />`)}

            ${uncategorizedActual > 0 ? html`
              <tr class="text-muted">
                <td><em>Uncategorized</em></td>
                <td class="text-right">—</td>
                <td class="text-right amount-expense">${money(uncategorizedActual)}</td>
                <td class="text-right">—</td>
                <td></td>
              </tr>` : null}
          </tbody>
        </table>
      </div>
    </div>

    ${schedCat ? html`<${ScheduleModal} cat=${schedCat} onClose=${() => setSchedCat(null)} />` : null}
    ${realloc ? html`<${ReallocModal} year=${year} month=${month} mode=${realloc.mode} anchor=${realloc.cat}
                      allCats=${allCats} planned=${planned} actual=${actual} budgetOf=${budgetOf}
                      onClose=${() => setRealloc(null)} onDone=${() => { setRealloc(null); setEdits({}); }} />` : null}`;
}

function progressCell(budget, spent) {
  if (!(budget > 0)) return html`<td></td>`;
  const pctLabel = (spent / budget) * 100;
  const pct = Math.min(pctLabel, 100);
  const over = spent > budget;
  return html`
    <td>
      <div class="progress-cell">
        <div class="progress-bar-wrap"><div class="progress-bar ${over ? 'progress-over' : 'progress-ok'}" style=${`width:${pct.toFixed(1)}%`}></div></div>
        <span class="progress-label">${Math.round(pctLabel)}%</span>
      </div>
    </td>`;
}

function remCell(budget, spent) {
  if (!(budget > 0)) return html`<td class="text-right"><span class="text-muted">—</span></td>`;
  const rem = round2(budget - spent);
  const cls = rem < 0 ? 'amount-expense' : rem === 0 ? 'text-muted' : 'amount-income';
  return html`<td class="text-right"><span class=${cls}>${money(rem)}</span></td>`;
}

function GroupRow({ name, totals, collapsed, onToggle }) {
  const { budget, spent } = totals;
  return html`
    <tr class="budget-group-header ${collapsed ? 'collapsed' : ''}" onClick=${onToggle} style="cursor:pointer">
      <td><span class="grp-chevron ${collapsed ? '' : 'open'}">▸</span>${name}</td>
      <td class="text-right budget-grp-amt">${budget > 0 ? money(budget) : '—'}</td>
      <td class="text-right budget-grp-amt">${spent > 0 ? html`<span class="amount-expense">${money(spent)}</span>` : '—'}</td>
      ${remCell(budget, spent)}
      ${progressCell(budget, spent)}
    </tr>`;
}

function CatRow({ cat, s, budget, spent, value, onInput, onSchedule, onMove, onCover }) {
  return html`
    <tr class="budget-row">
      <td class="budget-cat-cell">
        <span class="color-dot" style=${`background:${catColor(cat, s)}`}></span>
        <span class="budget-cat-name">${cat.name}</span>
        ${cat.link ? html`<a href=${cat.link} target="_blank" rel="noopener" class="btn btn-sm cat-pay-link">↗ Pay</a>` : null}
        <button class="btn btn-sm budget-sched-btn" title="Edit default budget, due date & payment link" onClick=${onSchedule}>🗓 Edit</button>
        <button class="btn btn-sm budget-sched-btn" title="Reallocate budget from this category" onClick=${onMove}>⇄ Move</button>
        ${spent > budget ? html`<button class="btn btn-sm budget-sched-btn budget-cover-btn" title="Cover this category's overage" onClick=${onCover}>🛟 Cover</button>` : null}
      </td>
      <td class="text-right">
        <div class="budget-input-wrap">
          <input type="text" inputmode="decimal" class="budget-input" placeholder="—"
                 value=${value} onInput=${(e) => onInput(e.target.value)} />
        </div>
      </td>
      <td class="text-right ${spent > 0 ? 'amount-expense' : 'text-muted'}">${spent > 0 ? money(spent) : '—'}</td>
      ${remCell(budget, spent)}
      ${progressCell(budget, spent)}
    </tr>`;
}

function ScheduleModal({ cat, onClose }) {
  const [form, setForm] = useState({
    defaultBudget: cat.defaultBudget ? cat.defaultBudget.toFixed(2) : '',
    link: cat.link || '',
    recurrence: cat.recurrence || 'none',
    dueDate: cat.dueDate || '',
  });
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  async function save(e) {
    e.preventDefault();
    await store.update('categories', cat.id, {
      defaultBudget: Math.max(0, parseMoney(form.defaultBudget) || 0),
      link: form.link.trim(),
      recurrence: ['none', 'monthly', 'yearly'].includes(form.recurrence) ? form.recurrence : 'none',
      dueDate: form.dueDate || null,
    });
    notify(`${cat.name} settings saved.`);
    onClose();
  }
  return html`
    <${Modal} title=${`${cat.name} — Settings`} width=${420} onClose=${onClose}>
      <form onSubmit=${save}>
        <div class="form-group">
          <label>Default Monthly Budget</label>
          <input type="text" inputmode="decimal" class="form-control" value=${form.defaultBudget}
                 placeholder="0.00" onInput=${(e) => set({ defaultBudget: e.target.value })} />
          <span class="text-muted" style="font-size:12px">Auto-fills this category when a new month is opened with no plan yet.</span>
        </div>
        <div class="form-group">
          <label>Payment Link</label>
          <input type="url" class="form-control" value=${form.link}
                 placeholder="https://…" onInput=${(e) => set({ link: e.target.value })} />
        </div>
        <div class="form-row" style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label>Recurrence</label>
            <select class="form-control" value=${form.recurrence} onChange=${(e) => set({ recurrence: e.target.value })}>
              <option value="none">None</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Due Date</label>
            <input type="date" class="form-control" value=${form.dueDate} onInput=${(e) => set({ dueDate: e.target.value })} />
          </div>
        </div>
        <${FormActions} submitLabel="Save" onCancel=${onClose} />
      </form>
    </${Modal}>`;
}

function ReallocModal({ year, month, mode, anchor, allCats, planned, actual, budgetOf, onClose, onDone }) {
  const rem = (id) => round2((budgetOf(id)) - (actual.get(id) || 0));
  const overage = Math.max(0, round2((actual.get(anchor.id) || 0) - budgetOf(anchor.id)));

  const [toId, setToId] = useState('');
  const [fromId, setFromId] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');

  const sourceId = mode === 'from' ? anchor.id : (fromId ? Number(fromId) : null);
  const destId = mode === 'from' ? (toId ? Number(toId) : null) : anchor.id;

  const surplusCats = allCats
    .filter((c) => c.id !== anchor.id && rem(c.id) > 0.005)
    .sort((a, b) => rem(b.id) - rem(a.id));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const amt = parseMoney(amount);
    if (!sourceId || !destId) return setErr('Pick a category.');
    if (!(amt > 0)) return setErr('Enter an amount greater than zero.');
    const r = await reallocate(year, month, sourceId, destId, amt);
    if (!r.ok) return setErr(r.message);
    notify('Budget reallocated.');
    onDone();
  }

  return html`
    <${Modal} title=${mode === 'from' ? 'Reallocate Budget' : 'Cover Overage'} width=${440} onClose=${onClose}>
      <p class="text-muted" style="font-size:12px;margin-top:-4px">
        ${mode === 'from'
          ? html`Move budget out of <b>${anchor.name}</b> for ${monthLabel(year, month)}.`
          : html`Pull budget into <b>${anchor.name}</b> (over by ${money(overage)}) from a category with room to spare.`}
      </p>
      <form onSubmit=${submit}>
        ${mode === 'from' ? html`
          <div class="form-group">
            <label>From</label>
            <div style="font-weight:600">${anchor.name}</div>
            <div class="text-muted" style="font-size:12px;margin-top:4px">
              Budgeted ${money(budgetOf(anchor.id))}, spent ${money(actual.get(anchor.id) || 0)}, remaining ${money(rem(anchor.id))}
            </div>
          </div>
          <div class="form-group">
            <label>To</label>
            <select class="form-control" value=${toId} onChange=${(e) => setToId(e.target.value)}>
              <option value="">Select…</option>
              ${allCats.filter((c) => c.id !== anchor.id).map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
            </select>
          </div>` : html`
          <div class="form-group">
            <label>Cover from</label>
            <select class="form-control" value=${fromId} onChange=${(e) => setFromId(e.target.value)}>
              <option value="">Select a category with surplus…</option>
              ${surplusCats.map((c) => html`<option value=${String(c.id)}>${c.name} — ${money(rem(c.id))} to spare</option>`)}
            </select>
            ${fromId ? html`<button type="button" class="btn btn-sm" style="margin-top:6px"
              onClick=${() => setAmount(Math.min(overage, rem(Number(fromId))).toFixed(2))}>
              Fill ${money(Math.min(overage, rem(Number(fromId))))}
            </button>` : null}
          </div>`}
        <div class="form-group">
          <label>Amount</label>
          <input type="text" inputmode="decimal" class="form-control" value=${amount}
                 placeholder="0.00" onInput=${(e) => setAmount(e.target.value)} />
        </div>
        ${err ? html`<div class="amount-expense" style="font-size:13px;margin-bottom:10px">${err}</div>` : null}
        <${FormActions} submitLabel=${mode === 'from' ? 'Move' : 'Cover'} onCancel=${onClose} />
      </form>
    </${Modal}>`;
}
