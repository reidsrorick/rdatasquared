import { tierDotHTML } from '../components/tier-dot.js';
import { dueBadgeHTML } from '../components/due-badge.js';
import { openModal } from '../components/modal.js';
import { parseTags, parseLog, prependLogEntry, computeNextDue } from '../csv.js';

export function renderDashboard(people, onUpdate, onNavigate) {
  const today = todayStr();
  const overdue = people
    .filter(p => p.next_due && p.next_due <= today)
    .sort((a, b) => a.next_due.localeCompare(b.next_due));
  const upcoming = people
    .filter(p => p.next_due && p.next_due > today && daysDiff(today, p.next_due) <= 7)
    .sort((a, b) => a.next_due.localeCompare(b.next_due));

  const longest = people.reduce((acc, p) => {
    if (!p.last_contact) return acc;
    const d = daysDiff(p.last_contact, today);
    return d > acc.days ? { days: d, name: p.name } : acc;
  }, { days: 0, name: '' });

  const el = document.createElement('div');
  el.className = 'view-dashboard';
  el.innerHTML = `
    <div class="stats-strip">
      <div class="stat-card">
        <span class="stat-value">${people.length}</span>
        <span class="stat-label">Contacts</span>
      </div>
      <div class="stat-card stat-card--warn">
        <span class="stat-value">${overdue.length}</span>
        <span class="stat-label">Overdue</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${longest.days || '—'}</span>
        <span class="stat-label">Longest gap${longest.name ? ` · ${longest.name}` : ''}</span>
      </div>
    </div>

    ${overdue.length ? `
      <section class="dash-section">
        <h2 class="section-title">Due now <span class="section-count">${overdue.length}</span></h2>
        <div class="contact-list" id="overdue-list"></div>
      </section>
    ` : `
      <section class="dash-section">
        <div class="empty-state">
          <p>You're all caught up — no one is overdue.</p>
        </div>
      </section>
    `}

    ${upcoming.length ? `
      <section class="dash-section">
        <h2 class="section-title">Coming up this week</h2>
        <div class="contact-list" id="upcoming-list"></div>
      </section>
    ` : ''}
  `;

  const overdueList = el.querySelector('#overdue-list');
  if (overdueList) {
    overdue.forEach(p => overdueList.appendChild(buildPersonRow(p, true, onUpdate, onNavigate)));
  }

  const upcomingList = el.querySelector('#upcoming-list');
  if (upcomingList) {
    upcoming.forEach(p => upcomingList.appendChild(buildPersonRow(p, false, onUpdate, onNavigate)));
  }

  return el;
}

function buildPersonRow(p, showLog, onUpdate, onNavigate) {
  const row = document.createElement('div');
  row.className = 'contact-row';
  const tags = parseTags(p.tags).slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('');
  row.innerHTML = `
    <div class="contact-row__main" role="button" tabindex="0">
      ${tierDotHTML(p.tier)}
      <span class="contact-row__name">${esc(p.name)}</span>
      ${dueBadgeHTML(p.next_due)}
      <span class="contact-row__tags">${tags}</span>
    </div>
    ${showLog ? `<button class="btn btn--sm btn--primary log-btn" data-id="${p.id}">Log follow-up</button>` : ''}
  `;

  row.querySelector('.contact-row__main').addEventListener('click', () => onNavigate('person', p.id));
  row.querySelector('.contact-row__main').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') onNavigate('person', p.id);
  });

  row.querySelector('.log-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    openLogModal(p, onUpdate);
  });

  return row;
}

function openLogModal(person, onUpdate) {
  const today = todayStr();
  const modal = openModal(`
    <div class="modal-header">
      <h3>Log follow-up · ${esc(person.name)}</h3>
      <button class="modal-close" data-modal-close aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <label class="form-label">Date
        <input type="date" id="log-date" class="form-input" value="${today}" max="${today}">
      </label>
      <label class="form-label">Notes
        <textarea id="log-notes" class="form-input form-textarea" rows="4" placeholder="What did you talk about?"></textarea>
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn--ghost" data-modal-cancel>Cancel</button>
      <button class="btn btn--primary" id="log-save-btn">Save</button>
    </div>
  `);

  document.getElementById('log-save-btn').addEventListener('click', () => {
    const date = document.getElementById('log-date').value;
    const notes = document.getElementById('log-notes').value.trim();
    if (!notes) { document.getElementById('log-notes').focus(); return; }
    const updated = {
      ...person,
      last_contact: date,
      next_due: computeNextDue(date, person.cadence_days),
      log: prependLogEntry(person.log, date, notes),
    };
    modal.close(() => onUpdate(updated));
  });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysDiff(from, to) {
  return Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000);
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
