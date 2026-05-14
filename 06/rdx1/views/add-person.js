import { openModal } from '../components/modal.js';
import { computeNextDue } from '../csv.js';

export function openAddPersonModal(onAdd) {
  const today = todayStr();
  const modal = openModal(`
    <div class="modal-header">
      <h3>Add contact</h3>
      <button class="modal-close" data-modal-close aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <form id="add-person-form" class="person-form" autocomplete="off" novalidate>
        <div class="form-grid">
          <label class="form-label">Name *
            <input type="text" name="name" class="form-input" placeholder="Full name" required>
          </label>
          <label class="form-label">Tier
            <select name="tier" class="form-input">
              <option value="casual">Casual</option>
              <option value="close">Close</option>
              <option value="inner">Inner</option>
            </select>
          </label>
          <label class="form-label">Cadence (days)
            <input type="number" name="cadence_days" class="form-input" value="90" min="1" max="3650">
          </label>
          <label class="form-label">Last contact
            <input type="date" name="last_contact" class="form-input" value="${today}">
          </label>
          <label class="form-label">Next due <span id="next-due-preview" class="form-hint"></span>
            <input type="date" name="next_due_display" class="form-input" id="next-due-input" readonly tabindex="-1">
          </label>
          <label class="form-label">Phone
            <input type="tel" name="phone" class="form-input">
          </label>
          <label class="form-label span-2">Email
            <input type="email" name="email" class="form-input">
          </label>
          <label class="form-label span-2">Tags (pipe-separated)
            <input type="text" name="tags" class="form-input" placeholder="college|climbing|sf">
          </label>
          <label class="form-label span-2">Interests
            <input type="text" name="interests" class="form-input" placeholder="rock climbing, sci-fi, dogs">
          </label>
          <label class="form-label span-2">Important dates
            <input type="text" name="important_dates" class="form-input" placeholder="birthday:1990-06-15">
          </label>
        </div>
        <div id="add-error" class="form-error" style="display:none"></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn--ghost" data-modal-cancel>Cancel</button>
      <button type="submit" form="add-person-form" class="btn btn--primary">Add contact</button>
    </div>
  `, { wide: true });

  const form = document.getElementById('add-person-form');
  const nextDueInput = document.getElementById('next-due-input');

  function updateNextDue() {
    const lc = form.elements.last_contact.value;
    const cd = parseInt(form.elements.cadence_days.value) || 90;
    const nd = computeNextDue(lc, cd);
    nextDueInput.value = nd;
  }

  updateNextDue();
  form.elements.last_contact.addEventListener('input', updateNextDue);
  form.elements.cadence_days.addEventListener('input', updateNextDue);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get('name').trim();
    if (!name) {
      form.elements.name.focus();
      return;
    }
    const lc = fd.get('last_contact');
    const cd = parseInt(fd.get('cadence_days')) || 90;
    const person = {
      id: crypto.randomUUID(),
      name,
      tier: fd.get('tier'),
      tags: fd.get('tags'),
      cadence_days: cd,
      last_contact: lc,
      next_due: computeNextDue(lc, cd),
      phone: fd.get('phone'),
      email: fd.get('email'),
      interests: fd.get('interests'),
      important_dates: fd.get('important_dates'),
      log: '',
    };
    modal.close(() => onAdd(person));
  });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
