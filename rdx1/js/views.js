// ===== Page views =====
import {
  el, fmtDate, fmtDateShort, relDays, daysBetween,
  todayISO, toast, confirmModal, debounce,
} from './util.js';
import {
  displayName, sortKeyLast, sortKeyFirst, lastContactedISO, keepInTouchStatus,
  nextBirthday, openFollowUps, buildDashboard, contactMatches, findDuplicates,
  INTERVAL_OPTIONS, INTERACTION_TYPES,
} from './model.js';
import {
  getContacts, getContact, getSettings, allTags, upsertContact, deleteContact,
  mutateContact, updateSettings, wipeAll,
} from './store.js';
import {
  avatar, contactRow, tagInput, openModal, logInteractionModal, followUpModal,
} from './components.js';
import { exportJSON, readFile, validateImport, applyReplace, applyMerge } from './importExport.js';

// ---------- shared helpers ----------
function kitBadge(kit) {
  if (kit.state === 'off') return null;
  if (kit.state === 'overdue') {
    const n = -kit.dueInDays;
    return el('span', { class: 'badge badge-overdue', text: n === 0 ? 'Due today' : `${n}d overdue` });
  }
  if (kit.state === 'soon') return el('span', { class: 'badge badge-soon', text: `Due in ${kit.dueInDays}d` });
  return el('span', { class: 'badge badge-ok', text: 'On track' });
}

function pageHead(title, sub, actions) {
  return el('div', { class: 'page-head' }, [
    el('div', {}, [el('h1', { text: title }), sub ? el('div', { class: 'sub', text: sub }) : null]),
    actions ? el('div', { class: 'btn-row' }, [].concat(actions)) : null,
  ]);
}

function emptyState(msg, ctaText, ctaHref) {
  return el('div', { class: 'empty' }, [
    el('p', { text: msg }),
    ctaText ? el('a', { class: 'btn', href: ctaHref, text: ctaText }) : null,
  ]);
}

// ==================================================================
// DASHBOARD
// ==================================================================
export function renderDashboard() {
  const wrap = el('div');
  const contacts = getContacts();
  wrap.appendChild(pageHead('Dashboard', new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })));

  if (!contacts.length) {
    wrap.appendChild(emptyState('No contacts yet. Add your first, or import a backup from Settings.', 'Add a contact', '#/add'));
    return wrap;
  }

  const { reachOut, birthdays, activity } = buildDashboard(contacts);

  // Reach out
  const roBlock = el('section', { class: 'block' }, [el('h2', { text: `Reach out (${reachOut.length})` })]);
  if (!reachOut.length) {
    roBlock.appendChild(el('div', { class: 'card card-pad muted', text: "You're all caught up. 🎉" }));
  } else {
    const card = el('div', { class: 'card' });
    reachOut.slice(0, 12).forEach(item => {
      const last = lastContactedISO(item.contact);
      let right;
      const cadenceActive = item.kit && (item.kit.state === 'overdue' || item.kit.state === 'soon');
      if (item.followUp && (!cadenceActive || item.followUp._dueIn <= item.kit.dueInDays)) {
        const n = item.followUp._dueIn;
        right = el('span', {
          class: 'badge ' + (n < 0 ? 'badge-overdue' : 'badge-soon'),
          text: n < 0 ? `follow-up ${-n}d late` : `follow-up ${relDays(n)}`,
        });
      } else {
        right = kitBadge(item.kit);
      }
      const row = contactRow(item.contact, right);
      const sub = row.querySelector('.subline');
      const lastTxt = last ? `Last: ${fmtDateShort(last)}` : 'Never contacted';
      if (sub) sub.textContent = `${sub.textContent ? sub.textContent + ' · ' : ''}${lastTxt}`;
      else row.querySelector('.meta').appendChild(el('div', { class: 'subline', text: lastTxt }));
      card.appendChild(row);
    });
    roBlock.appendChild(card);
  }
  wrap.appendChild(roBlock);

  // Birthdays
  const bBlock = el('section', { class: 'block' }, [el('h2', { text: 'Upcoming birthdays' })]);
  if (!birthdays.length) {
    bBlock.appendChild(el('div', { class: 'card card-pad muted', text: 'None in the next 30 days.' }));
  } else {
    const card = el('div', { class: 'card' });
    birthdays.forEach(b => {
      card.appendChild(contactRow(b.contact, el('span', {
        class: 'badge badge-bday',
        text: `${fmtDateShort(b.dateISO)} · ${b.inDays === 0 ? 'today' : relDays(b.inDays)}${b.turning ? ` · ${b.turning}` : ''}`,
      })));
    });
    bBlock.appendChild(card);
  }
  wrap.appendChild(bBlock);

  // Recent activity
  const aBlock = el('section', { class: 'block' }, [el('h2', { text: 'Recent activity' })]);
  if (!activity.length) {
    aBlock.appendChild(el('div', { class: 'card card-pad muted', text: 'Nothing logged yet.' }));
  } else {
    const card = el('div', { class: 'card card-pad' });
    const tl = el('ul', { class: 'timeline' });
    activity.forEach(a => {
      tl.appendChild(el('li', {}, [
        el('div', { class: 't-top' }, [
          el('span', { class: 't-type' }, [
            el('a', { href: `#/contact/${a.contact.id}`, text: displayName(a.contact) }),
            ` — ${a.interaction.type}`,
          ]),
          el('span', { class: 't-date', text: fmtDateShort(a.interaction.date) }),
        ]),
        a.interaction.note ? el('div', { class: 't-note', text: a.interaction.note }) : null,
      ]));
    });
    card.appendChild(tl);
    aBlock.appendChild(card);
  }
  wrap.appendChild(aBlock);

  return wrap;
}

// ==================================================================
// CONTACTS LIST
// ==================================================================
const listState = { q: '', tags: new Set(), fav: false, overdue: false, sort: 'last' };

export function renderContacts(initialQuery) {
  if (initialQuery != null) listState.q = initialQuery;
  const wrap = el('div');
  const contacts = getContacts();

  wrap.appendChild(pageHead(
    'Contacts', `${contacts.length} total`,
    el('a', { class: 'btn btn-sm', href: '#/add', text: '+ Add' }),
  ));

  if (!contacts.length) {
    wrap.appendChild(emptyState('No contacts yet.', 'Add a contact', '#/add'));
    return wrap;
  }

  // tools
  const search = el('input', {
    type: 'search', placeholder: 'Search name, company, tag, note…', value: listState.q, 'aria-label': 'Search',
  });
  const sortSel = el('select', { 'aria-label': 'Sort' }, [
    ['last', 'Last name A–Z'], ['first', 'First name A–Z'], ['added', 'Recently added'],
    ['contacted', 'Recently contacted'], ['overdue', 'Most overdue'],
  ].map(([v, t]) => el('option', { value: v, text: t, selected: listState.sort === v })));

  const listBox = el('div');
  const rerender = () => { renderList(listBox); };

  search.addEventListener('input', debounce(() => { listState.q = search.value; rerender(); }, 150));
  sortSel.addEventListener('change', () => { listState.sort = sortSel.value; rerender(); });

  wrap.appendChild(el('div', { class: 'list-tools' }, [search, sortSel]));

  // filter chips
  const chipRow = el('div', { class: 'filter-chips' });
  const favChip = el('span', {
    class: 'chip' + (listState.fav ? ' on' : ''), text: '★ Favorites',
    onclick: () => { listState.fav = !listState.fav; favChip.classList.toggle('on'); rerender(); },
  });
  const odChip = el('span', {
    class: 'chip' + (listState.overdue ? ' on' : ''), text: '⏰ Overdue',
    onclick: () => { listState.overdue = !listState.overdue; odChip.classList.toggle('on'); rerender(); },
  });
  chipRow.appendChild(favChip);
  chipRow.appendChild(odChip);
  allTags().forEach(t => {
    const c = el('span', {
      class: 'chip' + (listState.tags.has(t) ? ' on' : ''), text: t,
      onclick: () => {
        listState.tags.has(t) ? listState.tags.delete(t) : listState.tags.add(t);
        c.classList.toggle('on');
        rerender();
      },
    });
    chipRow.appendChild(c);
  });
  wrap.appendChild(chipRow);

  wrap.appendChild(listBox);
  renderList(listBox);
  return wrap;
}

function renderList(box) {
  box.innerHTML = '';
  let list = getContacts().filter(c => contactMatches(c, listState.q));
  if (listState.fav) list = list.filter(c => c.favorite);
  if (listState.tags.size) list = list.filter(c => [...listState.tags].every(t => c.tags.includes(t)));
  if (listState.overdue) list = list.filter(c => keepInTouchStatus(c).state === 'overdue');

  const sorters = {
    last: (a, b) => sortKeyLast(a).localeCompare(sortKeyLast(b)),
    first: (a, b) => sortKeyFirst(a).localeCompare(sortKeyFirst(b)),
    added: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
    contacted: (a, b) => String(lastContactedISO(b) || '').localeCompare(String(lastContactedISO(a) || '')),
    overdue: (a, b) => {
      const ka = keepInTouchStatus(a), kb = keepInTouchStatus(b);
      const va = ka.state === 'off' ? Infinity : ka.dueInDays;
      const vb = kb.state === 'off' ? Infinity : kb.dueInDays;
      return va - vb;
    },
  };
  list.sort(sorters[listState.sort] || sorters.last);

  if (!list.length) { box.appendChild(el('div', { class: 'empty', text: 'No matches.' })); return; }

  const card = el('div', { class: 'card' });
  list.forEach(c => {
    const kit = keepInTouchStatus(c);
    const right = kit.state === 'overdue' ? kitBadge(kit)
      : kit.state === 'soon' ? kitBadge(kit) : null;
    const row = contactRow(c, right);
    const last = lastContactedISO(c);
    if (last) {
      const sub = row.querySelector('.subline');
      const t = `Last: ${fmtDateShort(last)}`;
      if (sub) sub.textContent += ' · ' + t;
      else row.querySelector('.meta').appendChild(el('div', { class: 'subline', text: t }));
    }
    card.appendChild(row);
  });
  box.appendChild(card);
  box.appendChild(el('div', { class: 'muted mt8', text: `${list.length} shown` }));
}

// ==================================================================
// CONTACT DETAIL
// ==================================================================
export function renderContactDetail(id) {
  const c = getContact(id);
  const wrap = el('div');
  if (!c) { wrap.appendChild(emptyState('Contact not found.', 'Back to contacts', '#/contacts')); return wrap; }

  const kit = keepInTouchStatus(c);
  const nb = nextBirthday(c);

  wrap.appendChild(el('div', { class: 'detail-head' }, [
    avatar(c, true),
    el('div', { class: 'who' }, [
      el('h1', {}, [displayName(c), c.favorite ? el('span', { class: 'star', text: ' ★', style: 'color:var(--orange)' }) : null]),
      (c.title || c.company)
        ? el('div', { class: 'role', text: [c.title, c.company].filter(Boolean).join(' · ') })
        : null,
      kit.state !== 'off' ? el('div', { class: 'mt8' }, [kitBadge(kit)]) : null,
    ]),
  ]));

  // actions
  const reRender = () => rerouteRefresh(id);
  wrap.appendChild(el('div', { class: 'detail-actions' }, [
    el('button', { class: 'btn btn-sm', text: '＋ Log interaction', onclick: () => logInteractionModal(id, reRender) }),
    el('button', { class: 'btn btn-sm btn-ghost', text: '＋ Follow-up', onclick: () => followUpModal(id, reRender) }),
    el('a', { class: 'btn btn-sm btn-ghost', href: `#/edit/${id}`, text: '✎ Edit' }),
    el('button', {
      class: 'btn btn-sm btn-ghost', text: c.favorite ? '★ Unfavorite' : '☆ Favorite',
      onclick: () => { mutateContact(id, x => { x.favorite = !x.favorite; }); reRender(); },
    }),
  ]));

  // fields
  const fields = el('ul', { class: 'field-list' });
  const addField = (k, vNode) => { if (vNode) fields.appendChild(el('li', {}, [el('span', { class: 'k', text: k }), el('span', { class: 'v' }, [vNode])])); };

  c.phones.forEach(p => addField(p.label || 'phone', el('a', { href: `tel:${p.value}`, text: p.value })));
  c.emails.forEach(e => addField(e.label || 'email', el('a', { href: `mailto:${e.value}`, text: e.value })));
  if (c.address) {
    const li = el('li', {}, [
      el('span', { class: 'k', text: 'address' }),
      el('span', { class: 'v pre' }, [
        el('a', { href: `https://maps.google.com/?q=${encodeURIComponent(c.address)}`, target: '_blank', rel: 'noopener', text: c.address }),
      ]),
    ]);
    fields.appendChild(li);
  }
  if (nb) addField('birthday', el('span', {
    text: `${fmtDate(nb.dateISO)} · ${nb.inDays === 0 ? 'today' : relDays(nb.inDays)}${nb.turning ? ` (turns ${nb.turning})` : ''}`,
  }));
  if (c.tags.length) {
    const tl = el('span', { class: 'tag-line' }, c.tags.map(t => el('span', { class: 'chip chip-static', text: t })));
    addField('tags', tl);
  }
  if (kit.state !== 'off') {
    const names = { 14: 'every 2 weeks', 30: 'monthly', 60: 'every 2 months', 90: 'quarterly', 180: 'twice a year', 365: 'yearly' };
    addField('cadence', el('span', { text: names[kit.interval] || `every ${kit.interval} days` }));
  }
  c.customFields.forEach(f => addField(f.label || 'field', el('span', { class: 'pre', text: f.value })));
  if (c.notes) {
    fields.appendChild(el('li', {}, [
      el('span', { class: 'k', text: 'notes' }),
      el('span', { class: 'v pre', text: c.notes }),
    ]));
  }
  if (fields.children.length) wrap.appendChild(el('div', { class: 'card card-pad' }, [fields]));

  // follow-ups
  const ofu = c.followUps.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (ofu.length) {
    const card = el('div', { class: 'card card-pad mt16' }, [el('h2', { style: 'font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-faint);margin:0 0 8px', text: 'Follow-ups' })]);
    const tl = el('ul', { class: 'timeline' });
    ofu.forEach(f => {
      const dueIn = daysBetween(todayISO(), f.date);
      tl.appendChild(el('li', { class: f.done ? 'fu-done' : '' }, [
        el('div', { class: 't-top' }, [
          el('span', { class: 't-type', text: f.note || 'Follow up' }),
          el('span', { class: 't-date', text: fmtDateShort(f.date) + (f.done ? '' : ` · ${relDays(dueIn)}`) }),
        ]),
        el('div', { class: 't-actions' }, [
          el('button', {
            class: 'btn btn-sm btn-ghost', text: f.done ? 'Reopen' : 'Mark done',
            onclick: () => { mutateContact(id, x => { const t = x.followUps.find(y => y.id === f.id); if (t) t.done = !t.done; }); reRender(); },
          }),
          el('button', {
            class: 'btn btn-sm btn-ghost', text: 'Delete',
            onclick: () => { mutateContact(id, x => { x.followUps = x.followUps.filter(y => y.id !== f.id); }); reRender(); },
          }),
        ]),
      ]));
    });
    card.appendChild(tl);
    wrap.appendChild(card);
  }

  // interactions
  const iCard = el('div', { class: 'card card-pad mt16' }, [
    el('h2', { style: 'font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-faint);margin:0 0 8px', text: `Interaction log (${c.interactions.length})` }),
  ]);
  if (!c.interactions.length) {
    iCard.appendChild(el('div', { class: 'muted', text: 'No interactions logged yet.' }));
  } else {
    const tl = el('ul', { class: 'timeline' });
    c.interactions.forEach(i => {
      tl.appendChild(el('li', {}, [
        el('div', { class: 't-top' }, [
          el('span', { class: 't-type', text: i.type[0].toUpperCase() + i.type.slice(1) }),
          el('span', { class: 't-date', text: fmtDate(i.date) }),
        ]),
        i.note ? el('div', { class: 't-note', text: i.note }) : null,
        el('div', { class: 't-actions' }, [
          el('button', {
            class: 'btn btn-sm btn-ghost', text: 'Delete',
            onclick: async () => {
              if (await confirmModal({ title: 'Delete this log entry?', confirmText: 'Delete', danger: true })) {
                mutateContact(id, x => { x.interactions = x.interactions.filter(y => y.id !== i.id); });
                reRender();
              }
            },
          }),
        ]),
      ]));
    });
    iCard.appendChild(tl);
  }
  wrap.appendChild(iCard);

  // danger
  wrap.appendChild(el('div', { class: 'mt16' }, [
    el('button', {
      class: 'btn btn-danger btn-block', text: 'Delete contact',
      onclick: async () => {
        if (await confirmModal({ title: `Delete ${displayName(c)}?`, body: 'This cannot be undone.', confirmText: 'Delete', danger: true })) {
          deleteContact(id);
          toast('Contact deleted');
          location.hash = '#/contacts';
        }
      },
    }),
  ]));

  return wrap;
}

function rerouteRefresh(id) {
  // Re-render current detail view in place
  const main = document.getElementById('main');
  if (!main) return;
  main.innerHTML = '';
  main.appendChild(renderContactDetail(id));
}

// ==================================================================
// CONTACT FORM (add / edit)
// ==================================================================
export function renderContactForm(id) {
  const editing = !!id;
  const c = editing ? getContact(id) : null;
  const wrap = el('div');
  if (editing && !c) { wrap.appendChild(emptyState('Contact not found.')); return wrap; }

  const src = c || {
    firstName: '', lastName: '', company: '', title: '', address: '', notes: '',
    phones: [], emails: [], customFields: [], tags: [], favorite: false,
    birthday: null, keepInTouch: { enabled: false, intervalDays: 90 },
  };

  wrap.appendChild(pageHead(editing ? 'Edit contact' : 'New contact'));
  const form = el('form', {});

  const fn = inputRow('First name', 'text', src.firstName, { autofocus: true });
  const ln = inputRow('Last name', 'text', src.lastName);
  form.appendChild(el('div', { class: 'two-col' }, [fn.row, ln.row]));

  const co = inputRow('Company', 'text', src.company);
  const ti = inputRow('Title', 'text', src.title);
  form.appendChild(el('div', { class: 'two-col' }, [co.row, ti.row]));

  // phones
  const phonesBox = multiField('Phone', src.phones.length ? src.phones : [{ label: 'mobile', value: '' }], 'tel',
    ['mobile', 'work', 'home', 'other']);
  form.appendChild(phonesBox.group);

  // emails
  const emailsBox = multiField('Email', src.emails.length ? src.emails : [{ label: 'personal', value: '' }], 'email',
    ['personal', 'work', 'other']);
  form.appendChild(emailsBox.group);

  const addr = el('textarea', { placeholder: 'Street, city, …' });
  addr.value = src.address;
  form.appendChild(el('div', { class: 'form-row' }, [el('label', { text: 'Address' }), addr]));

  // birthday
  const bMonth = el('select', { 'aria-label': 'Birthday month' }, [
    el('option', { value: '', text: '—' }),
    ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      .map((m, i) => el('option', { value: String(i + 1), text: m, selected: src.birthday && src.birthday.month === i + 1 })),
  ]);
  const bDay = el('input', { type: 'number', min: '1', max: '31', placeholder: 'Day' });
  if (src.birthday) bDay.value = src.birthday.day;
  const bYear = el('input', { type: 'number', min: '1900', max: '2100', placeholder: 'Year (optional)' });
  if (src.birthday && src.birthday.year) bYear.value = src.birthday.year;
  form.appendChild(el('div', { class: 'form-row' }, [
    el('label', { text: 'Birthday' }),
    el('div', { class: 'two-col' }, [bMonth, bDay]),
    el('div', { class: 'mt8' }, [bYear]),
  ]));

  // tags
  const tags = tagInput(src.tags);
  form.appendChild(el('div', { class: 'form-row' }, [el('label', { text: 'Tags' }), tags.element]));

  // keep in touch
  const kitEnable = el('input', { type: 'checkbox' });
  kitEnable.checked = !!(src.keepInTouch && src.keepInTouch.enabled);
  const kitInterval = el('select', {}, INTERVAL_OPTIONS.map(o =>
    el('option', { value: String(o.v), text: o.label, selected: (src.keepInTouch?.intervalDays || 90) === o.v })));
  form.appendChild(el('fieldset', { class: 'form-group' }, [
    el('legend', { text: 'Keep in touch' }),
    el('label', { class: 'inline-check' }, [kitEnable, 'Remind me to reach out on a schedule']),
    el('div', { class: 'form-row mt8' }, [el('label', { text: 'How often' }), kitInterval]),
  ]));

  // custom fields
  const customBox = customFields(src.customFields);
  form.appendChild(customBox.group);

  // notes
  const notes = el('textarea', { placeholder: 'Anything worth remembering…' });
  notes.value = src.notes;
  form.appendChild(el('div', { class: 'form-row' }, [el('label', { text: 'Notes' }), notes]));

  // favorite
  const fav = el('input', { type: 'checkbox' });
  fav.checked = !!src.favorite;
  form.appendChild(el('div', { class: 'form-row' }, [el('label', { class: 'inline-check' }, [fav, 'Mark as favorite'])]));

  // actions
  form.appendChild(el('div', { class: 'form-actions' }, [
    el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onclick: () => history.back() }),
    el('button', { type: 'submit', class: 'btn', text: editing ? 'Save changes' : 'Add contact' }),
  ]));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const contact = {
      ...(c || {}),
      id: editing ? id : undefined,
      firstName: fn.input.value, lastName: ln.input.value,
      company: co.input.value, title: ti.input.value,
      phones: phonesBox.getValues(), emails: emailsBox.getValues(),
      address: addr.value,
      birthday: bMonth.value && bDay.value
        ? { month: Number(bMonth.value), day: Number(bDay.value), year: bYear.value ? Number(bYear.value) : null }
        : null,
      tags: tags.getTags(),
      notes: notes.value,
      customFields: customBox.getValues(),
      favorite: fav.checked,
      keepInTouch: { enabled: kitEnable.checked, intervalDays: Number(kitInterval.value) },
    };
    if (!contact.firstName.trim() && !contact.lastName.trim() && !contact.company.trim()) {
      toast('Give the contact a name or company.');
      return;
    }
    const saved = upsertContact(contact);
    toast(editing ? 'Saved' : 'Contact added');
    location.hash = `#/contact/${saved.id}`;
  });

  wrap.appendChild(form);
  return wrap;
}

// ---- form building blocks ----
function inputRow(label, type, value, opts = {}) {
  const input = el('input', { type, value: value || '' });
  if (opts.autofocus) input.setAttribute('autofocus', '');
  const row = el('div', { class: 'form-row' }, [el('label', { text: label }), input]);
  return { row, input };
}

function multiField(label, items, type, labelOptions) {
  const group = el('fieldset', { class: 'form-group' }, [el('legend', { text: label })]);
  const rows = el('div');
  group.appendChild(rows);

  function addRow(item = { label: labelOptions[0], value: '' }) {
    const labelSel = el('select', { 'aria-label': `${label} type` },
      labelOptions.map(o => el('option', { value: o, text: o, selected: o === item.label })));
    if (item.label && !labelOptions.includes(item.label)) {
      labelSel.appendChild(el('option', { value: item.label, text: item.label, selected: true }));
    }
    const val = el('input', { type, value: item.value || '', placeholder: label });
    const rm = el('button', { type: 'button', class: 'row-x', text: '×', 'aria-label': `Remove ${label}` });
    const row = el('div', { class: 'multi-row' }, [labelSel, val, rm]);
    rm.addEventListener('click', () => { row.remove(); });
    rows.appendChild(row);
  }
  items.forEach(addRow);
  group.appendChild(el('button', { type: 'button', class: 'add-line', text: `+ Add ${label.toLowerCase()}`, onclick: () => addRow() }));

  return {
    group,
    getValues: () => [...rows.querySelectorAll('.multi-row')].map(r => ({
      label: r.querySelector('select').value,
      value: r.querySelector('input').value.trim(),
    })).filter(x => x.value),
  };
}

function customFields(items) {
  const group = el('fieldset', { class: 'form-group' }, [el('legend', { text: 'Custom fields' })]);
  const rows = el('div');
  group.appendChild(rows);
  function addRow(item = { label: '', value: '' }) {
    const l = el('input', { type: 'text', placeholder: 'Label', value: item.label || '' });
    const v = el('input', { type: 'text', placeholder: 'Value', value: item.value || '' });
    const rm = el('button', { type: 'button', class: 'row-x', text: '×', 'aria-label': 'Remove field' });
    const row = el('div', { class: 'grid-labelval' }, [l, v, rm]);
    rm.addEventListener('click', () => row.remove());
    rows.appendChild(row);
  }
  items.forEach(addRow);
  group.appendChild(el('button', { type: 'button', class: 'add-line', text: '+ Add custom field', onclick: () => addRow() }));
  return {
    group,
    getValues: () => [...rows.querySelectorAll('.grid-labelval')].map(r => {
      const [l, v] = r.querySelectorAll('input');
      return { label: l.value.trim(), value: v.value.trim() };
    }).filter(x => x.label || x.value),
  };
}

// ==================================================================
// SETTINGS
// ==================================================================
export function renderSettings() {
  const wrap = el('div');
  const s = getSettings();
  const contacts = getContacts();
  wrap.appendChild(pageHead('Settings'));

  // stats
  const withCadence = contacts.filter(c => c.keepInTouch?.enabled).length;
  const overdue = contacts.filter(c => keepInTouchStatus(c).state === 'overdue').length;
  wrap.appendChild(el('div', { class: 'stat-grid' }, [
    stat(contacts.length, 'Contacts'),
    stat(withCadence, 'On a cadence'),
    stat(overdue, 'Overdue'),
  ]));

  // theme
  const themeSel = el('select', {}, [
    ['auto', 'Auto (match device)'], ['light', 'Light'], ['dark', 'Dark'],
  ].map(([v, t]) => el('option', { value: v, text: t, selected: s.theme === v })));
  themeSel.addEventListener('change', () => { updateSettings({ theme: themeSel.value }); applyTheme(); });
  wrap.appendChild(el('section', { class: 'block mt16' }, [
    el('h2', { text: 'Appearance' }),
    el('div', { class: 'card card-pad' }, [
      el('div', { class: 'form-row' }, [el('label', { text: 'Theme' }), themeSel]),
    ]),
  ]));

  // backup / data
  const reminderSel = el('select', {}, [
    ['0', 'Off'], ['7', 'Weekly'], ['14', 'Every 2 weeks'], ['30', 'Monthly'], ['90', 'Quarterly'],
  ].map(([v, t]) => el('option', { value: v, text: t, selected: String(s.backupReminderDays) === v })));
  reminderSel.addEventListener('change', () => updateSettings({ backupReminderDays: Number(reminderSel.value) }));

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const parsed = await readFile(file);
      const info = validateImport(parsed);
      importFlow(info);
    } catch (e) {
      toast(e.message || 'Import failed');
    }
    fileInput.value = '';
  });

  const lastExport = s.lastExportAt
    ? `Last export: ${new Date(s.lastExportAt).toLocaleString()}`
    : 'No export yet on this device.';

  wrap.appendChild(el('section', { class: 'block mt16' }, [
    el('h2', { text: 'Backup & transfer' }),
    el('div', { class: 'card card-pad' }, [
      el('p', { class: 'muted', text: 'All your data lives in this browser. Export a JSON file to back up or move to another device.' }),
      el('div', { class: 'btn-row mt8' }, [
        el('button', { class: 'btn', text: '⬇ Export JSON', onclick: exportJSON }),
        el('button', { class: 'btn btn-ghost', text: '⬆ Import JSON', onclick: () => fileInput.click() }),
      ]),
      fileInput,
      el('div', { class: 'muted mt8', text: lastExport }),
      el('hr', { class: 'hr' }),
      el('div', { class: 'form-row' }, [el('label', { text: 'Remind me to back up' }), reminderSel]),
    ]),
  ]));

  // danger zone
  wrap.appendChild(el('section', { class: 'block mt16' }, [
    el('h2', { text: 'Danger zone' }),
    el('div', { class: 'card card-pad' }, [
      el('p', { class: 'muted', text: 'Erase every contact and setting from this browser. Export first if unsure.' }),
      el('button', {
        class: 'btn btn-danger mt8', text: 'Erase all data',
        onclick: async () => {
          if (await confirmModal({ title: 'Erase everything?', body: 'All contacts and settings on this device will be deleted. This cannot be undone.', confirmText: 'Erase all', danger: true })) {
            wipeAll();
            toast('All data erased');
            location.hash = '#/';
          }
        },
      }),
    ]),
  ]));

  wrap.appendChild(el('p', { class: 'muted mt16', style: 'text-align:center', text: 'RDX1 · Rolodex One — runs entirely in your browser.' }));
  return wrap;
}

function stat(n, l) {
  return el('div', { class: 'stat' }, [el('div', { class: 'n', text: String(n) }), el('div', { class: 'l', text: l })]);
}

// ---- import flow with merge/replace + dup warning ----
function importFlow(info) {
  const existing = getContacts();
  const dups = findDuplicates(existing, info.normalized.contacts);
  const meta = [];
  meta.push(el('p', {}, [`This file has `, el('strong', { text: `${info.count} contact${info.count === 1 ? '' : 's'}` }), '.']));
  if (info.exportedAt) meta.push(el('p', { class: 'muted', text: `Exported ${new Date(info.exportedAt).toLocaleString()}` }));
  if (dups.length) {
    meta.push(el('p', { class: 'muted', text: `${dups.length} may already exist (matched by name, email, or phone): ${dups.slice(0, 5).map(d => displayName(d.incoming)).join(', ')}${dups.length > 5 ? '…' : ''}` }));
  }
  meta.push(el('p', { class: 'muted mt8', text: 'Replace: wipe current data and load this file (use this for a full device transfer). Merge: add new and update matching by id.' }));

  openModal('Import backup', meta, {
    submitText: 'Replace all',
    onSubmit: () => { applyReplace(info.normalized); location.hash = '#/'; },
  });
  // add a Merge button into the just-opened modal
  const actions = document.querySelector('.modal-back .form-actions');
  if (actions) {
    const merge = el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'Merge',
      onclick: () => {
        applyMerge(info.normalized);
        document.querySelector('.modal-back')?.remove();
        location.hash = '#/contacts';
      },
    });
    actions.insertBefore(merge, actions.lastChild);
  }
}

// ---- theme ----
export function applyTheme() {
  const s = getSettings();
  document.documentElement.setAttribute('data-theme', s.theme || 'auto');
}
