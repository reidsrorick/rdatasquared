import { tierDotHTML } from '../components/tier-dot.js';
import { dueBadgeHTML } from '../components/due-badge.js';
import { parseTags } from '../csv.js';

export function renderPeople(people, onNavigate) {
  const allTags = [...new Set(people.flatMap(p => parseTags(p.tags)))].sort();

  const el = document.createElement('div');
  el.className = 'view-people';
  el.innerHTML = `
    <div class="people-toolbar">
      <input type="search" id="people-search" class="form-input search-input" placeholder="Search by name…" aria-label="Search contacts">
      <div class="filter-chips" id="tier-chips">
        <button class="chip chip--active" data-tier="">All</button>
        <button class="chip" data-tier="inner">Inner</button>
        <button class="chip" data-tier="close">Close</button>
        <button class="chip" data-tier="casual">Casual</button>
      </div>
      ${allTags.length ? `
        <div class="filter-chips" id="tag-chips">
          ${allTags.map(t => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
      ` : ''}
    </div>
    <div class="people-table-wrap">
      <table class="people-table">
        <thead>
          <tr>
            <th></th>
            <th>Name</th>
            <th>Last contact</th>
            <th>Next due</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody id="people-tbody"></tbody>
      </table>
      <div id="people-empty" class="empty-state" style="display:none">
        <p>No contacts match your filters.</p>
      </div>
    </div>
  `;

  let activeTier = '';
  let activeTags = new Set();
  let searchQ = '';

  const tbody = el.querySelector('#people-tbody');
  const emptyEl = el.querySelector('#people-empty');

  function render() {
    const filtered = people.filter(p => {
      if (searchQ && !p.name.toLowerCase().includes(searchQ)) return false;
      if (activeTier && p.tier !== activeTier) return false;
      if (activeTags.size) {
        const ptags = new Set(parseTags(p.tags));
        for (const t of activeTags) if (!ptags.has(t)) return false;
      }
      return true;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      emptyEl.style.display = '';
    } else {
      emptyEl.style.display = 'none';
      filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'people-row';
        tr.tabIndex = 0;
        tr.dataset.id = p.id;
        const tags = parseTags(p.tags).map(t => `<span class="tag">${esc(t)}</span>`).join('');
        tr.innerHTML = `
          <td>${tierDotHTML(p.tier)}</td>
          <td class="people-row__name">${esc(p.name)}</td>
          <td class="tabnum">${p.last_contact ? formatRelative(p.last_contact) : '—'}</td>
          <td class="tabnum">${dueBadgeHTML(p.next_due) || (p.next_due ? formatRelativeDue(p.next_due) : '—')}</td>
          <td>${tags}</td>
        `;
        tr.addEventListener('click', () => onNavigate('person', p.id));
        tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onNavigate('person', p.id); });
        tbody.appendChild(tr);
      });
    }
  }

  el.querySelector('#people-search').addEventListener('input', e => {
    searchQ = e.target.value.toLowerCase().trim();
    render();
  });

  el.querySelector('#tier-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-tier]');
    if (!btn) return;
    activeTier = btn.dataset.tier;
    el.querySelectorAll('#tier-chips .chip').forEach(c => c.classList.toggle('chip--active', c === btn));
    render();
  });

  el.querySelector('#tag-chips')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    const tag = btn.dataset.tag;
    if (activeTags.has(tag)) { activeTags.delete(tag); btn.classList.remove('chip--active'); }
    else { activeTags.add(tag); btn.classList.add('chip--active'); }
    render();
  });

  render();
  return el;
}

export function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return '1 week ago';
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
  if (diff < 60) return '1 month ago';
  if (diff < 365) return `${Math.floor(diff / 30)} months ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

function formatRelativeDue(dateStr) {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `in ${diff} days`;
  if (diff < 14) return 'in 1 week';
  if (diff < 30) return `in ${Math.floor(diff / 7)} weeks`;
  return `in ${Math.floor(diff / 30)}mo`;
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
