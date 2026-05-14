import {
  hasFSA, initStorage, pickOrCreateFile, createNewFile,
  scheduleSave, setSaveStatusEl, importCSVFile, exportCSVFile
} from './storage.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPeople } from './views/people.js';
import { renderPersonDetail } from './views/person-detail.js';
import { openAddPersonModal } from './views/add-person.js';

let people = [];
let currentView = 'dashboard';
let currentPersonId = null;

const mainEl = document.getElementById('main');
const saveStatusEl = document.getElementById('save-status');

setSaveStatusEl(saveStatusEl);

// ── Router ────────────────────────────────────────────────────────────────────

function navigate(view, id = null) {
  currentView = view;
  currentPersonId = id;
  renderView();
  updateNav();
}

function updateNav() {
  document.querySelectorAll('.nav-tab').forEach(t => {
    const active = (currentView === 'dashboard' && t.dataset.view === 'dashboard')
      || (currentView === 'people' && t.dataset.view === 'people')
      || (currentView === 'person' && t.dataset.view === 'people');
    t.classList.toggle('nav-tab--active', active);
    t.setAttribute('aria-current', active ? 'page' : '');
  });
}

function renderView() {
  // Animate out
  mainEl.classList.add('view-exit');
  setTimeout(() => {
    mainEl.innerHTML = '';
    mainEl.classList.remove('view-exit');
    mainEl.classList.add('view-enter');

    let el;
    if (currentView === 'dashboard') {
      el = renderDashboard(people, updatePerson, navigate);
    } else if (currentView === 'people') {
      el = renderPeople(people, navigate);
    } else if (currentView === 'person') {
      const p = people.find(x => x.id === currentPersonId);
      if (!p) { navigate('people'); return; }
      el = renderPersonDetail(p, updatePerson, deletePerson, () => navigate('people'));
    }

    if (el) mainEl.appendChild(el);
    requestAnimationFrame(() => mainEl.classList.remove('view-enter'));
  }, 150);
}

// ── Data mutations ────────────────────────────────────────────────────────────

function updatePerson(updated) {
  const idx = people.findIndex(p => p.id === updated.id);
  if (idx === -1) people.push(updated);
  else people[idx] = updated;
  scheduleSave(people);
}

function deletePerson(id) {
  people = people.filter(p => p.id !== id);
  scheduleSave(people);
  navigate('people');
}

function addPerson(person) {
  people.push(person);
  scheduleSave(people);
  navigate('person', person.id);
}

// ── Nav bindings ──────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => navigate(tab.dataset.view));
});

document.getElementById('add-btn').addEventListener('click', () => {
  openAddPersonModal(addPerson);
});

// ── File disconnect recovery ──────────────────────────────────────────────────

document.addEventListener('rdx1:file-disconnected', () => {
  showFileSetup(true);
});

// ── File System setup ─────────────────────────────────────────────────────────

async function showFileSetup(disconnected = false) {
  mainEl.innerHTML = `
    <div class="setup-screen">
      <div class="setup-card card">
        <div class="setup-logo">
          <img src="assets/logo.svg" alt="RDX1" height="36">
        </div>
        <h2>${disconnected ? 'File disconnected' : 'Welcome to RDX1'}</h2>
        <p>${disconnected
          ? 'The CSV file could not be found. Reconnect it or pick a different one.'
          : 'Pick an existing contacts CSV, or start fresh with a new file.'}</p>
        <div class="setup-actions">
          <button class="btn btn--primary" id="setup-open">Open existing file</button>
          ${!disconnected ? `<button class="btn btn--ghost" id="setup-new">Create new file</button>` : ''}
        </div>
        ${!hasFSA ? `<p class="setup-note">Your browser doesn't support the File System Access API. Changes will be saved in-browser only. Use the export button to save your data.</p>` : ''}
      </div>
    </div>
  `;

  document.getElementById('setup-open')?.addEventListener('click', async () => {
    const data = await pickOrCreateFile();
    if (data !== null) { people = data; renderView(); }
  });

  document.getElementById('setup-new')?.addEventListener('click', async () => {
    const data = await createNewFile();
    if (data !== null) { people = data; renderView(); }
  });
}

// ── Fallback toolbar (no FSA) ─────────────────────────────────────────────────

function mountFallbackButtons() {
  const bar = document.getElementById('topbar-right');
  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn--ghost btn--sm';
  importBtn.textContent = 'Import CSV';
  importBtn.addEventListener('click', () => importCSVFile(data => { people = data; renderView(); }));

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--ghost btn--sm';
  exportBtn.textContent = 'Export CSV';
  exportBtn.addEventListener('click', () => exportCSVFile(people));

  bar.prepend(exportBtn);
  bar.prepend(importBtn);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    if (!hasFSA) mountFallbackButtons();

    const data = await initStorage();
    if (data !== null) {
      people = data;
      renderView();
      updateNav();
    } else {
      showFileSetup(false);
    }
  } catch (err) {
    console.error('[RDX1] boot error:', err);
    showFileSetup(false);
  }
}

boot().catch(err => {
  console.error('[RDX1] unhandled boot error:', err);
  showFileSetup(false);
});
