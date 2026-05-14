import { tierDotHTML } from '../components/tier-dot.js';
import { dueBadgeHTML } from '../components/due-badge.js';
import { openModal } from '../components/modal.js';
import { parseTags, serializeTags, parseLog, prependLogEntry, computeNextDue } from '../csv.js';
import { formatRelative } from './people.js';

export function renderPersonDetail(person, onUpdate, onDelete, onBack) {
  const el = document.createElement('div');
  el.className = 'view-person';

  function rebuild(p) {
    el.innerHTML = buildHTML(p);
    attachEvents(el, p);
  }

  rebuild(person);
  return el;

  function buildHTML(p) {
    const tags = parseTags(p.tags);
    const logEntries = parseLog(p.log);
    const tagsHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const logHTML = logEntries.length
      ? logEntries.map((e, i) => `
          <div class="log-entry" style="--i:${i}">
            <span class="log-entry__date tabnum">${e.date}</span>
            <p class="log-entry__notes">${esc(e.notes)}</p>
          </div>
        `).join('')
      : `<div class="empty-state empty-state--sm"><p>No log entries yet.</p></div>`;

    return `
      <div class="person-header">
        <button class="btn btn--ghost btn--back" id="back-btn">← Back</button>
        <div class="person-header__info">
          ${tierDotHTML(p.tier)}
          <h1 class="person-name">${esc(p.name)}</h1>
          ${dueBadgeHTML(p.next_due)}
        </div>
        <button class="btn btn--primary" id="log-followup-btn">Log follow-up</button>
      </div>

      <div class="person-body">
        <section class="person-section card">
          <h2 class="section-title">Details</h2>
          <form id="person-form" class="person-form" autocomplete="off">
            <div class="form-grid">
              <label class="form-label">Name
                <input type="text" name="name" class="form-input" value="${esc(p.name)}" required>
              </label>
              <label class="form-label">Tier
                <select name="tier" class="form-input">
                  ${['inner','close','casual'].map(t => `<option value="${t}"${p.tier===t?' selected':''}>${cap(t)}</option>`).join('')}
                </select>
              </label>
              <label class="form-label">Cadence (days)
                <input type="number" name="cadence_days" class="form-input" value="${p.cadence_days}" min="1" max="3650">
              </label>
              <label class="form-label">Last contact
                <input type="date" name="last_contact" class="form-input" value="${p.last_contact}">
              </label>
              <label class="form-label">Phone
                <input type="tel" name="phone" class="form-input" value="${esc(p.phone)}">
              </label>
              <label class="form-label">Email
                <input type="email" name="email" class="form-input" value="${esc(p.email)}">
              </label>
              <label class="form-label span-2">Tags (pipe-separated)
                <input type="text" name="tags" class="form-input" value="${esc(p.tags)}" placeholder="college|climbing|sf">
              </label>
              <label class="form-label span-2">Interests
                <input type="text" name="interests" class="form-input" value="${esc(p.interests)}">
              </label>
              <label class="form-label span-2">Important dates (pipe-separated)
                <input type="text" name="important_dates" class="form-input" value="${esc(p.important_dates)}" placeholder="birthday:1990-06-15|anniversary:2018-04-20">
              </label>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn--primary">Save changes</button>
              <button type="button" id="delete-btn" class="btn btn--danger">Delete</button>
            </div>
          </form>
        </section>

        <section class="person-section">
          <h2 class="section-title">Activity log
            ${p.last_contact ? `<span class="section-subtitle">Last contact: ${formatRelative(p.last_contact)}</span>` : ''}
          </h2>
          <div class="log-list">${logHTML}</div>
        </section>
      </div>
    `;
  }

  function attachEvents(el, p) {
    el.querySelector('#back-btn').addEventListener('click', onBack);

    el.querySelector('#log-followup-btn').addEventListener('click', () => {
      openLogModal(p, updated => {
        onUpdate(updated);
        rebuild(updated);
      });
    });

    el.querySelector('#person-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updated = {
        ...p,
        name: fd.get('name'),
        tier: fd.get('tier'),
        cadence_days: parseInt(fd.get('cadence_days')) || p.cadence_days,
        last_contact: fd.get('last_contact'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        tags: fd.get('tags'),
        interests: fd.get('interests'),
        important_dates: fd.get('important_dates'),
      };
      updated.next_due = computeNextDue(updated.last_contact, updated.cadence_days);
      onUpdate(updated);
      rebuild(updated);
      showToast('Saved');
    });

    el.querySelector('#delete-btn').addEventListener('click', () => {
      openModal(`
        <div class="modal-header">
          <h3>Delete ${esc(p.name)}?</h3>
        </div>
        <div class="modal-body">
          <p>This will permanently remove them from your contacts. This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn--ghost" data-modal-cancel>Cancel</button>
          <button class="btn btn--danger" data-modal-confirm>Delete</button>
        </div>
      `, {
        onConfirm: () => onDelete(p.id),
      });
    });
  }
}

function openLogModal(person, onSave) {
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
    modal.close(() => onSave(updated));
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--visible'));
  setTimeout(() => {
    t.classList.remove('toast--visible');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, 1800);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
