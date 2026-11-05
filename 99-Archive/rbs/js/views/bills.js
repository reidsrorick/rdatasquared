import { html, useState, useMemo } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { PageHeader } from './common.js';
import { Modal, FormActions } from '../ui.js';
import { notify } from '../toast.js';
import { money, parseMoney, todayISO, longDate } from '../format.js';
import { groupedCategories, categoryMap } from '../logic/categories.js';
import {
  buildBills, billSummary, billHistory, toggleBillPaid, STATUS_ORDER, STATUS_LABELS,
} from '../logic/bills.js';

export function Bills() {
  const s = store.getState();
  const today = todayISO();
  const cats = categoryMap(s);

  const bills = useMemo(() => buildBills(today, s), [s, today]);
  const summary = billSummary(bills);
  const history = billHistory(s);

  const [modal, setModal] = useState(null); // null | {} (add) | bill (edit)

  const grouped = {};
  for (const st of STATUS_ORDER) grouped[st] = bills.filter((b) => b.status === st);

  async function check(bill) {
    await toggleBillPaid(bill.id, bill.dueDate);
  }

  async function removeBill(bill) {
    if (!confirm(`Remove "${bill.name}" from Bills? Its due date and recurrence will be cleared (the category stays).`)) return;
    await store.update('categories', bill.id, { dueDate: null, recurrence: 'none', defaultBudget: 0, link: '' });
    notify(`"${bill.name}" removed from Bills.`);
  }

  async function undo(bp) {
    await toggleBillPaid(bp.categoryId, bp.dueDate);
    notify('Check-off undone.');
  }

  const anyBills = bills.length > 0;

  return html`
    <${PageHeader} title="Bills">
      <button class="btn btn-primary" onClick=${() => setModal({})}>+ Add a Bill</button>
    </${PageHeader}>
    <p class="text-muted" style="font-size:13px;margin:-14px 0 18px">
      Due dates you pay on a schedule. Check one off when you pay it — it clears automatically once it shows up on a statement.
    </p>

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card"><div class="stat-label">Overdue</div>
        <div class="stat-value ${summary.overdue ? 'expense' : 'neutral'}">${summary.overdue}</div></div>
      <div class="stat-card"><div class="stat-label">Due within 7 days</div>
        <div class="stat-value neutral">${summary.dueSoon}</div></div>
      <div class="stat-card"><div class="stat-label">Pending confirmation</div>
        <div class="stat-value neutral">${summary.pending}</div></div>
      <div class="stat-card"><div class="stat-label">Est. Monthly</div>
        <div class="stat-value expense">${money(summary.monthly)}</div></div>
    </div>

    ${anyBills ? STATUS_ORDER.map((st) => {
      const items = grouped[st];
      if (!items.length) return null;
      return html`
        <div class="card" key=${st}>
          <div class="card-header">
            <h2 class="bill-group-title bill-group-${st}">${STATUS_LABELS[st]}
              <span class="text-muted" style="font-weight:500">(${items.length})</span></h2>
          </div>
          <div class="due-list" style="max-height:none">
            ${items.map((b) => html`
              <div class="due-item due-${b.status === 'paid' ? 'paid' : 'due'}" key=${b.id}>
                <input type="checkbox" class="due-check" checked=${b.status === 'paid'}
                       title=${b.status === 'paid' ? 'Marked paid — uncheck if not paid' : 'Check off as paid (pending confirmation)'}
                       onChange=${() => check(b)} />
                <span class="color-dot" style=${`background:${b.color}`}></span>
                <div class="due-info">
                  <div class="due-name">${b.name}${b.group ? html` <span class="text-subtle" style="font-weight:500;font-size:12px">· ${b.group}</span>` : null}</div>
                  <div class="due-sub text-muted">
                    ${longDate(b.dueDate)} ·${' '}
                    ${b.status === 'paid' ? html`<span class="due-pending">Paid · pending confirmation</span>`
                      : b.days < 0 ? html`<span class="due-overdue">Overdue by ${-b.days} day${-b.days !== 1 ? 's' : ''}</span>`
                      : b.days === 0 ? 'Today' : b.days === 1 ? 'Tomorrow' : `in ${b.days} days`}
                    · <span class="badge badge-gray" style="font-size:10px">${b.recurrence}</span>
                  </div>
                </div>
                ${b.amount ? html`<span class="due-amount">${money(b.amount)}</span>`
                  : html`<span class="text-subtle" style="font-size:12px">no amount</span>`}
                ${b.link ? html`<a href=${b.link} target="_blank" rel="noopener" class="btn btn-sm cat-pay-link">↗ Pay</a>` : null}
                <button class="btn btn-sm" onClick=${() => setModal(b)}>Edit</button>
                <button class="btn btn-sm btn-danger" title="Remove due date" onClick=${() => removeBill(b)}>×</button>
              </div>`)}
          </div>
        </div>`;
    }) : html`
      <div class="card">
        <p class="empty-message" style="padding:32px 12px">No bills yet. Click <strong>+ Add a Bill</strong> above — pick a category, set its due date and how often it repeats.</p>
      </div>`}

    ${history.length ? html`
      <div class="card">
        <div class="card-header"><h2>Recent check-offs</h2><span class="text-muted" style="font-size:12px">Marked paid by you</span></div>
        <table class="table">
          <thead><tr><th>Bill</th><th>For due date</th><th>Checked off</th><th></th></tr></thead>
          <tbody>
            ${history.map((h) => html`
              <tr key=${h.id}>
                <td>${cats.get(h.categoryId)?.name || '—'}</td>
                <td>${longDate(h.dueDate)}</td>
                <td class="text-muted">${h.createdAt ? longDate(h.createdAt.slice(0, 10)) : '—'}</td>
                <td class="text-right"><button class="btn btn-sm" onClick=${() => undo(h)}>Undo</button></td>
              </tr>`)}
          </tbody>
        </table>
      </div>` : null}

    ${modal ? html`<${BillModal} bill=${modal} existingBillIds=${new Set(bills.map((b) => b.id))}
                    onClose=${() => setModal(null)} />` : null}`;
}

function BillModal({ bill, existingBillIds, onClose }) {
  const s = store.getState();
  const { groups, ungrouped } = groupedCategories(s);
  const editing = !!bill.id;

  const [form, setForm] = useState({
    categoryId: bill.id ? String(bill.id) : '',
    dueDate: bill.dueDate || '',
    recurrence: bill.recurrence || 'monthly',
    amount: bill.amount ? String(bill.amount) : '',
    link: bill.link || '',
  });
  const set = (p) => setForm((f) => ({ ...f, ...p }));

  const avail = (list) => list.filter((c) => !existingBillIds.has(c.id));

  async function submit(e) {
    e.preventDefault();
    const catId = Number(form.categoryId);
    if (!catId) return notify('Pick a category.', 'error');
    if (!form.dueDate) return notify('Due date is required.', 'error');
    await store.update('categories', catId, {
      dueDate: form.dueDate,
      recurrence: form.recurrence,
      defaultBudget: Math.max(0, parseMoney(form.amount) || 0),
      link: form.link.trim(),
    });
    notify(editing ? 'Bill updated.' : 'Bill added.');
    onClose();
  }

  return html`
    <${Modal} title=${editing ? 'Edit Bill' : 'Add a Bill'} width=${420} onClose=${onClose}>
      <form onSubmit=${submit}>
        ${editing ? html`
          <div class="form-group">
            <label>Category</label>
            <div><strong>${bill.name}</strong></div>
          </div>` : html`
          <div class="form-group">
            <label>Category *</label>
            <select class="form-control" value=${form.categoryId} onChange=${(e) => set({ categoryId: e.target.value })}>
              <option value="">— pick a category —</option>
              ${groups.map((g) => avail(g.categories).length ? html`
                <optgroup label=${g.name}>
                  ${avail(g.categories).map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
                </optgroup>` : null)}
              ${avail(ungrouped).length ? html`
                <optgroup label="Ungrouped">
                  ${avail(ungrouped).map((c) => html`<option value=${String(c.id)}>${c.name}</option>`)}
                </optgroup>` : null}
            </select>
            <div class="amount-hint">Bills are categories with a due date. Set a category's due date here to make it a bill.</div>
          </div>`}
        <div class="form-group">
          <label>Due date *</label>
          <input type="date" class="form-control" required value=${form.dueDate} onInput=${(e) => set({ dueDate: e.target.value })} />
          <div class="amount-hint">For a monthly bill the day of the month is what matters; for yearly, the month & day.</div>
        </div>
        <div class="form-group">
          <label>Repeats</label>
          <select class="form-control" value=${form.recurrence} onChange=${(e) => set({ recurrence: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div class="form-group">
          <label>Expected amount</label>
          <input type="text" inputmode="decimal" class="form-control" placeholder="0.00"
                 value=${form.amount} onInput=${(e) => set({ amount: e.target.value })} />
          <div class="amount-hint">Optional — shown on the dashboard and used for the monthly estimate.</div>
        </div>
        <div class="form-group">
          <label>Pay link</label>
          <input type="url" class="form-control" placeholder="https://…" value=${form.link} onInput=${(e) => set({ link: e.target.value })} />
        </div>
        <${FormActions} submitLabel=${editing ? 'Save Changes' : 'Add Bill'} onCancel=${onClose} />
      </form>
    </${Modal}>`;
}
