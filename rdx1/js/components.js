// ===== Reusable UI components =====
import { el, initials, colorFor, todayISO, toast, uid } from './util.js';
import { displayName, INTERACTION_TYPES } from './model.js';
import { allTags, mutateContact } from './store.js';

export function avatar(c, big = false) {
  return el('div', {
    class: 'avatar' + (big ? ' avatar-lg' : ''),
    style: `background:${colorFor(c.id || displayName(c))}`,
    text: initials(c.firstName, c.lastName) === '?' && c.company
      ? c.company.slice(0, 2).toUpperCase()
      : initials(c.firstName, c.lastName),
    'aria-hidden': 'true',
  });
}

export function contactRow(c, rightNode = null) {
  const bits = [c.title, c.company].filter(Boolean).join(' · ');
  return el('div', {
    class: 'contact-row',
    role: 'link',
    tabindex: '0',
    onclick: () => { location.hash = `#/contact/${c.id}`; },
    onkeydown: e => { if (e.key === 'Enter') location.hash = `#/contact/${c.id}`; },
  }, [
    avatar(c),
    el('div', { class: 'meta' }, [
      el('div', { class: 'name' }, [
        displayName(c),
        c.favorite ? el('span', { class: 'star', text: ' ★' }) : null,
      ]),
      bits ? el('div', { class: 'subline', text: bits }) : null,
    ]),
    rightNode ? el('div', { class: 'right' }, [rightNode]) : null,
  ]);
}

// ---- Tag input: chips + autocomplete ----
// Behaviour: type text -> suggestions of existing tags appear; Enter picks the
// highlighted suggestion (or the typed text if none), adds a chip, clears input.
// Comma also commits. Backspace on empty input removes the last chip.
export function tagInput(initial = []) {
  let tags = [...initial];
  let active = -1;
  let suggestions = [];

  const chipsWrap = el('div', { class: 'taginput' });
  const field = el('input', {
    type: 'text',
    placeholder: tags.length ? 'Add another…' : 'Type a tag, press Enter',
    'aria-label': 'Add tag',
    autocomplete: 'off',
  });
  const suggestBox = el('div', { class: 'tag-suggest', hidden: true });

  function renderChips() {
    [...chipsWrap.querySelectorAll('.chip')].forEach(n => n.remove());
    tags.forEach(t => {
      const chip = el('span', { class: 'chip' }, [
        t,
        el('span', {
          class: 'x', text: '×', role: 'button', 'aria-label': `Remove ${t}`,
          onclick: () => { tags = tags.filter(x => x !== t); renderChips(); field.focus(); },
        }),
      ]);
      chipsWrap.insertBefore(chip, field);
    });
    field.placeholder = tags.length ? 'Add another…' : 'Type a tag, press Enter';
  }

  function updateSuggestions() {
    const q = field.value.trim().toLowerCase();
    const pool = allTags().filter(t => !tags.includes(t));
    suggestions = q
      ? pool.filter(t => t.toLowerCase().includes(q)).sort((a, b) => {
          const ai = a.toLowerCase().startsWith(q) ? 0 : 1;
          const bi = b.toLowerCase().startsWith(q) ? 0 : 1;
          return ai - bi || a.localeCompare(b);
        })
      : pool.slice(0, 8);
    active = suggestions.length ? 0 : -1;
    renderSuggest();
  }

  function renderSuggest() {
    suggestBox.innerHTML = '';
    if (!suggestions.length) {
      const q = field.value.trim();
      if (q) {
        suggestBox.appendChild(el('div', { class: 'hint', text: `Press Enter to add “${q}”` }));
        suggestBox.hidden = false;
      } else {
        suggestBox.hidden = true;
      }
      return;
    }
    suggestions.forEach((s, i) => {
      suggestBox.appendChild(el('div', {
        class: i === active ? 'active' : '',
        onmousedown: e => { e.preventDefault(); commit(s); },
      }, [s]));
    });
    suggestBox.hidden = false;
  }

  function commit(value) {
    const v = (value ?? field.value).trim().replace(/,+$/, '').trim();
    if (v && !tags.includes(v)) tags.push(v);
    field.value = '';
    suggestBox.hidden = true;
    suggestions = [];
    renderChips();
    field.focus();
  }

  field.addEventListener('input', () => {
    if (field.value.includes(',')) { commit(field.value.split(',')[0]); return; }
    updateSuggestions();
  });
  field.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) commit(suggestions[active]);
      else if (field.value.trim()) commit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); if (suggestions.length) { active = (active + 1) % suggestions.length; renderSuggest(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); if (suggestions.length) { active = (active - 1 + suggestions.length) % suggestions.length; renderSuggest(); }
    } else if (e.key === 'Backspace' && !field.value && tags.length) {
      tags.pop(); renderChips();
    } else if (e.key === 'Escape') {
      suggestBox.hidden = true;
    }
  });
  field.addEventListener('focus', updateSuggestions);
  field.addEventListener('blur', () => { setTimeout(() => { suggestBox.hidden = true; }, 120); });

  chipsWrap.appendChild(field);
  chipsWrap.appendChild(suggestBox);
  renderChips();

  return {
    element: chipsWrap,
    getTags: () => {
      const pending = field.value.trim().replace(/,+$/, '').trim();
      return pending && !tags.includes(pending) ? [...tags, pending] : [...tags];
    },
  };
}

// ---- Modal shell ----
export function openModal(title, contentNodes, { onSubmit, submitText = 'Save' } = {}) {
  const back = el('div', { class: 'modal-back' });
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const form = el('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
    el('h3', { text: title }),
    ...[].concat(contentNodes),
    el('div', { class: 'form-actions' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onclick: close }),
      el('button', { type: 'submit', class: 'btn', text: submitText }),
    ]),
  ]);
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (onSubmit && onSubmit() === false) return;
    close();
  });
  back.appendChild(form);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  const firstInput = form.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();
  return { close };
}

// ---- Quick "log interaction" modal ----
export function logInteractionModal(contactId, onDone) {
  const date = el('input', { type: 'date', value: todayISO(), required: true });
  const type = el('select', {}, INTERACTION_TYPES.map(t =>
    el('option', { value: t, text: t[0].toUpperCase() + t.slice(1) })));
  const note = el('textarea', { placeholder: 'What happened? (optional)' });
  openModal('Log an interaction', [
    el('div', { class: 'form-row' }, [el('label', { text: 'Date' }), date]),
    el('div', { class: 'form-row' }, [el('label', { text: 'Type' }), type]),
    el('div', { class: 'form-row' }, [el('label', { text: 'Note' }), note]),
  ], {
    submitText: 'Log it',
    onSubmit: () => {
      mutateContact(contactId, c => {
        c.interactions.unshift({ id: uid(), date: date.value, type: type.value, note: note.value.trim() });
        c.interactions.sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      toast('Interaction logged');
      onDone && onDone();
    },
  });
}

// ---- Add follow-up modal ----
export function followUpModal(contactId, onDone) {
  const date = el('input', { type: 'date', value: todayISO(), required: true });
  const note = el('textarea', { placeholder: 'What to do / talk about' });
  openModal('Add a follow-up', [
    el('div', { class: 'form-row' }, [el('label', { text: 'Due date' }), date]),
    el('div', { class: 'form-row' }, [el('label', { text: 'Note' }), note]),
  ], {
    submitText: 'Add',
    onSubmit: () => {
      mutateContact(contactId, c => {
        c.followUps.unshift({ id: uid(), date: date.value, note: note.value.trim(), done: false });
        c.followUps.sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      toast('Follow-up added');
      onDone && onDone();
    },
  });
}
