/* ========== STATE & CONSTANTS ========== */
const DEFAULT_SETTINGS = {
    theme: 'light',
    username: 'John Doe',
    weeklyHours: 40,
    overtimeThreshold: 40,
    utilizationTarget: 80,
    holidays: [],   // array of 'YYYY-MM-DD' strings
    timeFormat: '12h',
    projects: [
        { name: 'Client A – Website Redesign', billable: true },
        { name: 'Internal',                    billable: false },
        { name: 'Admin',                       billable: false },
        { name: 'Client B – App Dev',          billable: true }
    ]
};

const DEFAULT_PTO = {
    types: [{ key: 'vacation', name: 'Vacation', total: 40, used: 0 }],
    requests: []
};

const PTO_PALETTE = [
    { fill: '#16A34A', light: '#F0FDF4' },
    { fill: '#F59E0B', light: '#FFFBEB' },
    { fill: '#7C3AED', light: '#F5F3FF' },
    { fill: '#0891B2', light: '#E0F2FE' },
    { fill: '#EA580C', light: '#FFF7ED' },
    { fill: '#DB2777', light: '#FDF2F8' },
];

let _ptoHistSort    = { col: 'date', dir: 'desc' };
let _ptoHistFilter  = { type: '', status: '', search: '' };
let _ytdGrain       = 'month'; // 'day' | 'week' | 'biweek' | 'month'
let _ytdFrom        = null;    // 'YYYY-MM-DD' or null (= Jan 1 of current year)
let _ytdTo          = null;    // 'YYYY-MM-DD' or null (= no upper limit)
let _ytdMode        = 'hours'; // 'hours' | 'utilization'

let state = {
    currentView: 'timesheets',
    currentWeekStart: null,
    miniCalDate: new Date(),
    fullCalDate: new Date(),
    sortField: null,
    sortDir: 'asc',
    activeFilter: 'all',
    timesheets: {},
    dailyNotes: {},   // 'YYYY-MM-DD' -> note string
    pto: structuredClone(DEFAULT_PTO),
    settings: structuredClone(DEFAULT_SETTINGS),
    confirmedCallback: null,
    pendingImportData: null,
    reportSearch: '',
    reportProjectFilter: ''
};

/* ========== STORAGE ========== */
function saveState() {
    try {
        localStorage.setItem('ts_timesheets', JSON.stringify(state.timesheets));
        localStorage.setItem('ts_notes',      JSON.stringify(state.dailyNotes));
        localStorage.setItem('ts_pto',        JSON.stringify(state.pto));
        localStorage.setItem('ts_settings',   JSON.stringify(state.settings));
    } catch (e) {
        showToast('Failed to save data: ' + e.message, 'error');
    }
}

const DATA_VERSION = '2'; // bump when storage format changes incompatibly

function loadState() {
    try {
        // If stored version doesn't match, wipe and start fresh
        const ver = localStorage.getItem('ts_version');
        if (ver !== DATA_VERSION) {
            localStorage.clear();
            localStorage.setItem('ts_version', DATA_VERSION);
            return;
        }
        const ts = localStorage.getItem('ts_timesheets');
        const pto = localStorage.getItem('ts_pto');
        const settings = localStorage.getItem('ts_settings');
        const notes = localStorage.getItem('ts_notes');
        if (ts)    state.timesheets  = JSON.parse(ts);
        if (notes) state.dailyNotes  = JSON.parse(notes);
        if (pto)   state.pto         = JSON.parse(pto);
        if (settings) state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settings) };
    } catch (e) {
        console.warn('Failed to load state:', e);
    }
}

function saveVersion() {
    localStorage.setItem('ts_version', DATA_VERSION);
}

/* ========== UTILITIES ========== */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getWeekStart(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay()); // Sunday = 0
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWeekKey(date) {
    const monday = getWeekStart(date);
    return monday.toISOString().split('T')[0];
}

function formatDateLabel(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPayPeriod(weekStartDate) {
    const start = new Date(weekStartDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d, yr) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(yr ? { year: 'numeric' } : {}) });
    return `${fmt(start)} – ${fmt(end, true)}`;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    if (state.settings.timeFormat === '12h') {
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? 'pm' : 'am';
        const hour = h % 12 || 12;
        return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    return timeStr;
}

function calcHours(startTime, endTime, breakMin) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (endMins <= startMins) return 0;
    const total = endMins - startMins - (parseInt(breakMin) || 0);
    return Math.max(0, parseFloat((total / 60).toFixed(2)));
}

function isWeekend(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
}

function getWeekDates(weekStart) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

function initials(name) {
    return (name || 'JD').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getPTODays() {
    const days = new Set();
    (state.pto.requests || []).forEach(r => {
        let cur = new Date(r.startDate + 'T00:00:00');
        const end = new Date(r.endDate + 'T00:00:00');
        while (cur <= end) {
            days.add(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
    });
    return days;
}

function getSubmittedDays() {
    const days = new Set();
    Object.values(state.timesheets).forEach(rows => {
        rows.forEach(row => {
            if (row.date) {
                // legacy flat-entry format
                days.add(row.date);
            } else {
                // grid format
                Object.entries(row.hours || {}).forEach(([d, h]) => {
                    if (parseFloat(h) > 0) days.add(d);
                });
            }
        });
    });
    return days;
}

function getProjectNames() {
    return (state.settings.projects || []).map(p => typeof p === 'string' ? p : p.name);
}

function getProjectBillable(name) {
    const p = (state.settings.projects || []).find(p => (typeof p === 'string' ? p : p.name) === name);
    if (!p) return true;
    return typeof p === 'string' ? true : p.billable !== false;
}

function getProjectHoliday(name) {
    const p = (state.settings.projects || []).find(p => (typeof p === 'string' ? p : p.name) === name);
    if (!p || typeof p === 'string') return false;
    return p.holiday === true;
}

/* ========== GRID HELPERS ========== */
function getGridRows(weekKey) {
    return state.timesheets[weekKey || state.currentWeekStart] || [];
}

// Convert grid rows to flat entry list (for dashboard / reports / PTO compat)
function gridRowsToEntries(weekKey) {
    const rows = getGridRows(weekKey);
    if (!rows.length) return [];
    if (rows[0] && rows[0].date) return rows; // legacy format
    return rows.flatMap(row =>
        Object.entries(row.hours || {})
            .filter(([, h]) => parseFloat(h) > 0)
            .map(([date, h]) => ({
                id: row.id + '_' + date,
                date, project: row.project,
                hours: parseFloat(h),
                billable: row.billable !== false,
                notes: row.notes || ''
            }))
    );
}

function getTotalHours(entries) {
    return entries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
}

function getBillableHours(entries) {
    return entries.filter(e => e.billable).reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
}

function getCurrentEntries() {
    return gridRowsToEntries(state.currentWeekStart);
}

function getPTOTypes() {
    return state.pto.types || [];
}

function getPTOType(key) {
    return getPTOTypes().find(t => t.key === key);
}

const _today = () => new Date().toISOString().split('T')[0];

function _sumPTOFromProject(linkedProject, dateFilter) {
    return Object.values(state.timesheets)
        .flat()
        .filter(row => row.project === linkedProject)
        .reduce((sum, row) =>
            sum + Object.entries(row.hours || {})
                .filter(([d]) => dateFilter(d))
                .reduce((s, [, h]) => s + (parseFloat(h) || 0), 0)
        , 0);
}

function getPTOSubmittedByType(key) {
    const t = getPTOType(key);
    const today = _today();
    if (t?.linkedProject) return _sumPTOFromProject(t.linkedProject, d => d <= today);
    return (state.pto.requests || [])
        .filter(r => r.type === key && r.status !== 'denied' && r.endDate <= today)
        .reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);
}

function getPTOPlannedByType(key) {
    const t = getPTOType(key);
    const today = _today();
    if (t?.linkedProject) return _sumPTOFromProject(t.linkedProject, d => d > today);
    return (state.pto.requests || [])
        .filter(r => r.type === key && r.status !== 'denied' && r.startDate > today)
        .reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);
}

// Total scheduled = submitted + planned (used for "remaining" calculation)
function getPTOUsedByType(key) {
    return getPTOSubmittedByType(key) + getPTOPlannedByType(key);
}

function getTotalPTOUsed() {
    return getPTOTypes().reduce((sum, t) => sum + getPTOSubmittedByType(t.key), 0);
}

function getTotalPTOPlanned() {
    return getPTOTypes().reduce((sum, t) => sum + getPTOPlannedByType(t.key), 0);
}

/* ========== NAVIGATION ========== */
function showView(viewId) {
    state.currentView = viewId;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + viewId);
    if (el) el.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.view === viewId);
    });

    const titles = {
        dashboard: 'Dashboard',
        timesheets: 'Timesheet',
        pto: 'PTO Requests',
        calendar: 'Calendar',
        reports: 'Reports',
        settings: 'Settings'
    };
    document.getElementById('header-view-name').textContent = titles[viewId] || viewId;

    const payPeriodBar = document.getElementById('pay-period-bar');
    payPeriodBar.style.display = (viewId === 'timesheets' || viewId === 'dashboard') ? 'flex' : 'none';

    if (viewId === 'dashboard')   renderDashboard();
    if (viewId === 'timesheets')  { renderTimesheetTable(); renderPTOPanel(); renderMiniCalendar(); }
    if (viewId === 'utilization') renderUtilization();
    if (viewId === 'pto')         renderPTOView();
    if (viewId === 'settings')    renderSettings();
}

const PROJ_COLORS = ['#2563EB','#16A34A','#EA580C','#7C3AED','#0891B2','#DB2777','#D97706','#059669','#4F46E5','#DC2626'];

function getProjectColor(proj) {
    const projects = (state.settings.projects || []).map(p => typeof p === 'string' ? p : p.name);
    const idx = projects.indexOf(proj);
    return PROJ_COLORS[(idx >= 0 ? idx : Math.abs(proj.split('').reduce((s,c) => s + c.charCodeAt(0), 0))) % PROJ_COLORS.length];
}

/* ========== DASHBOARD ========== */
function renderDashboard() {
    const target     = parseFloat(state.settings.utilizationTarget) || 80;
    const weekEntries = getCurrentEntries();

    // Per-week project breakdown
    const allWeeks = Object.keys(state.timesheets).sort();
    const weekProjMap = {}; // weekKey -> { proj -> hrs }
    allWeeks.forEach(wk => {
        weekProjMap[wk] = {};
        (state.timesheets[wk] || []).forEach(r => {
            const hrs = Object.values(r.hours || {}).reduce((s, h) => s + (parseFloat(h)||0), 0);
            if (hrs > 0) weekProjMap[wk][r.project || ''] = (weekProjMap[wk][r.project || ''] || 0) + hrs;
        });
    });

    // KPI metrics (holiday projects excluded from utilization denominator)
    const _hrsExclHolidays = (wk) => {
        let total = 0, bill = 0;
        (state.timesheets[wk] || []).forEach(r => {
            if (getProjectHoliday(r.project)) return;
            const hrs = Object.values(r.hours || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);
            total += hrs;
            if (getProjectBillable(r.project)) bill += hrs;
        });
        return { total, bill };
    };
    const weekHrs   = Object.values(weekProjMap[state.currentWeekStart] || {}).reduce((s, h) => s + h, 0);
    const ytdHrs    = allWeeks.reduce((s, wk) => s + Object.values(weekProjMap[wk]).reduce((a, h) => a + h, 0), 0);
    const { total: wkUtilTotal, bill: weekBill }  = _hrsExclHolidays(state.currentWeekStart);
    const { total: ytdUtilTotal, bill: ytdBill }  = allWeeks.reduce((acc, wk) => {
        const { total, bill } = _hrsExclHolidays(wk);
        return { total: acc.total + total, bill: acc.bill + bill };
    }, { total: 0, bill: 0 });
    const weekUtil  = wkUtilTotal  > 0 ? (weekBill / wkUtilTotal)  * 100 : null;
    const ytdUtil   = ytdUtilTotal > 0 ? (ytdBill  / ytdUtilTotal) * 100 : null;
    const ptoUsed   = getTotalPTOUsed();
    const ptoPlanned = getTotalPTOPlanned();
    const utilColor = (u) => u === null ? 'kpi-blue' : u >= target ? 'kpi-green' : 'kpi-orange';

    // Next planned PTO — first future date with PTO-linked project hours
    const today         = _today();
    const linkedProjects = getPTOTypes().map(t => t.linkedProject).filter(Boolean);
    let nextPTO = null;
    Object.values(state.timesheets).forEach(rows => {
        (rows || []).forEach(r => {
            if (!linkedProjects.includes(r.project)) return;
            Object.entries(r.hours || {}).forEach(([d, h]) => {
                if (d > today && (parseFloat(h) || 0) > 0) {
                    if (!nextPTO || d < nextPTO.date) nextPTO = { date: d, project: r.project };
                }
            });
        });
    });
    const nextPTOLabel = nextPTO
        ? new Date(nextPTO.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    document.getElementById('dash-kpi-grid').innerHTML = `
        <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${weekBill.toFixed(1)}</div>
                <div class="kpi-label">Billable Hrs This Week</div>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon-wrap ${utilColor(weekUtil)}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${weekUtil !== null ? weekUtil.toFixed(1) + '%' : '—'}</div>
                <div class="kpi-label">Utilization This Week${ytdUtil !== null ? ` <span style="font-weight:400;color:var(--text-muted)">· ${ytdUtil.toFixed(1)}% YTD</span>` : ''}</div>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${ptoUsed.toFixed(1)}</div>
                <div class="kpi-label">PTO Used YTD${ptoPlanned > 0 ? ` <span style="font-weight:400;color:var(--warning)">· ${ptoPlanned.toFixed(1)} planned</span>` : ''}</div>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon-wrap ${nextPTO ? 'kpi-green' : 'kpi-blue'}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value" style="font-size:${nextPTOLabel ? '18px' : '28px'}">${nextPTOLabel || '—'}</div>
                <div class="kpi-label">Next Planned PTO</div>
            </div>
        </div>`;

    // PTO balance rows
    const types = getPTOTypes();
    document.getElementById('dashboard-pto').innerHTML = types.length
        ? types.map((t, i) => renderBalanceRow(t.name, getPTOSubmittedByType(t.key), getPTOPlannedByType(t.key), t.total, PTO_PALETTE[i % PTO_PALETTE.length].fill)).join('')
        : '<div class="empty-state" style="padding:24px">No PTO types configured</div>';

    // Initialize date inputs (default = YTD)
    const ytdFromEl = document.getElementById('ytd-date-from');
    const ytdToEl   = document.getElementById('ytd-date-to');
    if (!ytdFromEl.value && _ytdFrom) ytdFromEl.value = _ytdFrom;
    if (!ytdToEl.value   && _ytdTo)   ytdToEl.value   = _ytdTo;

    _renderDashWeekChart(weekProjMap, allWeeks);
    _refreshYTDChart();
    _renderDashProjectBreakdown(weekEntries, weekHrs);
}

function _renderDashWeekChart(weekProjMap, allWeeks) {
    const container = document.getElementById('dash-weekly-chart');
    const legend    = document.getElementById('dash-weekly-legend');
    const weeks     = allWeeks.slice(-14);
    if (!weeks.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No data yet</div>';
        legend.innerHTML = '';
        return;
    }

    // Collect all projects across these weeks, sorted by total hours desc
    const projTotals = {};
    weeks.forEach(wk => Object.entries(weekProjMap[wk] || {}).forEach(([p, h]) => {
        projTotals[p] = (projTotals[p] || 0) + h;
    }));
    const projects = Object.keys(projTotals).sort((a, b) => projTotals[b] - projTotals[a]);

    const maxWeekTotal = Math.max(...weeks.map(wk => Object.values(weekProjMap[wk] || {}).reduce((s, h) => s + h, 0)), 1);

    container.innerHTML = `
        <div class="dash-bar-chart">
            <div class="dash-stacked-grid">
                ${weeks.map(wk => {
                    const weekTotal = Object.values(weekProjMap[wk] || {}).reduce((s, h) => s + h, 0);
                    const colH = Math.round((weekTotal / maxWeekTotal) * 140);
                    const d = new Date(wk + 'T00:00:00');
                    const lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const segs = projects.map(p => {
                        const h = weekProjMap[wk][p] || 0;
                        return h > 0 ? `<div class="stacked-seg" style="flex:${h};background:${getProjectColor(p)}" title="${escHtml(p)}: ${h.toFixed(1)} hrs"></div>` : '';
                    }).join('');
                    return `<div class="dash-bar-col" data-weekkey="${wk}" style="cursor:pointer" title="Double-click to open timesheet">
                        <div class="dash-bar-val">${weekTotal > 0 ? weekTotal.toFixed(1) : ''}</div>
                        <div class="dash-stacked-col" style="height:${colH}px">${segs}</div>
                        <div class="dash-bar-label">${lbl}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

    legend.innerHTML = projects.map(p => `
        <span class="dash-legend-item">
            <span class="dash-legend-dot" style="background:${getProjectColor(p)}"></span>
            ${escHtml(p)}
        </span>`).join('');

    // Hover + double-click on bar columns
    const tooltip = document.getElementById('chart-tooltip');
    container.querySelectorAll('.dash-bar-col[data-weekkey]').forEach(col => {
        const wk = col.dataset.weekkey;
        const d  = new Date(wk + 'T00:00:00');
        const lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        col.addEventListener('mouseenter', e => {
            const wkData = weekProjMap[wk] || {};
            const total  = Object.values(wkData).reduce((s, h) => s + h, 0);
            const rows   = Object.entries(wkData).sort((a,b)=>b[1]-a[1]).map(([p,h]) =>
                `<div class="chart-tt-row">
                    <span class="chart-tt-dot" style="background:${getProjectColor(p)}"></span>
                    <span class="chart-tt-proj">${escHtml(p)}</span>
                    <span class="chart-tt-val">${h.toFixed(1)} hrs</span>
                </div>`).join('');
            tooltip.innerHTML = `<div class="chart-tt-title">Week of ${lbl}</div>${rows}
                ${projects.length > 1 ? `<div class="chart-tt-total">Total: ${total.toFixed(1)} hrs</div>` : ''}`;
            tooltip.classList.remove('hidden');
            _positionChartTooltip(tooltip, e);
        });
        col.addEventListener('mousemove',  e => _positionChartTooltip(tooltip, e));
        col.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
        col.addEventListener('dblclick',   () => { state.currentWeekStart = wk; showView('timesheets'); });
    });
}

function _positionChartTooltip(tooltip, e) {
    const margin = 14;
    const tw = tooltip.offsetWidth  || 180;
    const th = tooltip.offsetHeight || 80;
    let x = e.clientX + margin;
    let y = e.clientY - th / 2;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - margin;
    if (y < 8)                           y = 8;
    if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
}

function _refreshYTDChart() {
    const today     = _today();
    const yearStart = `${today.slice(0,4)}-01-01`;
    const fromDate  = _ytdFrom || yearStart;
    const toDate    = _ytdTo   || null; // null = no upper limit, shows planned future entries too

    // Build per-week project map filtered to date range
    const allWeeks     = Object.keys(state.timesheets).sort();
    const weekProjMap  = {};
    allWeeks.forEach(wk => {
        weekProjMap[wk] = {};
        (state.timesheets[wk] || []).forEach(r => {
            Object.entries(r.hours || {}).forEach(([d, h]) => {
                if (d < fromDate || d > toDate) return;
                const hrs = parseFloat(h) || 0;
                if (hrs > 0) weekProjMap[wk][r.project || ''] = (weekProjMap[wk][r.project || ''] || 0) + hrs;
            });
        });
    });

    _renderDashYTDChart(weekProjMap, allWeeks, fromDate, toDate);
}

function _bucketKey(dateStr, grain) {
    const d = new Date(dateStr + 'T00:00:00');
    if (grain === 'day')   return dateStr;
    if (grain === 'month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (grain === 'week')  return getWeekKey(d);
    if (grain === 'biweek') {
        // stable biweekly: count weeks from fixed epoch, group pairs
        const ref    = new Date('2023-01-01T00:00:00');
        const wkStart = new Date(getWeekKey(d) + 'T00:00:00');
        const wkNum  = Math.round((wkStart - ref) / (7 * 24 * 3600 * 1000));
        const period = Math.floor(wkNum / 2);
        // return the Sunday that started that 2-week period
        const start  = new Date(ref.getTime() + period * 2 * 7 * 24 * 3600 * 1000);
        return start.toISOString().split('T')[0];
    }
    return dateStr;
}

function _renderDashYTDChart(weekProjMap, allWeeks, fromDate, toDate) {
    const container = document.getElementById('dash-ytd-chart');
    const legend    = document.getElementById('dash-ytd-legend');
    if (!allWeeks.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No data yet</div>';
        legend.innerHTML = ''; return;
    }

    // Build day-level data filtered to range
    const dayProj = {}; // 'YYYY-MM-DD' -> { proj -> hrs }
    allWeeks.forEach(wk => {
        (state.timesheets[wk] || []).forEach(r => {
            Object.entries(r.hours || {}).forEach(([d, h]) => {
                const hrs = parseFloat(h) || 0;
                if (hrs <= 0) return;
                if (fromDate && d < fromDate) return;
                if (toDate   && d > toDate)   return;
                if (!dayProj[d]) dayProj[d] = {};
                dayProj[d][r.project || ''] = (dayProj[d][r.project || ''] || 0) + hrs;
            });
        });
    });

    // Bucket by grain
    const grain = _ytdGrain;
    const bucketMap = {}; // bucketKey -> { proj -> hrs }
    Object.entries(dayProj).forEach(([d, projs]) => {
        let key = _bucketKey(d, grain);
        if (!bucketMap[key]) bucketMap[key] = {};
        Object.entries(projs).forEach(([p, h]) => {
            bucketMap[key][p] = (bucketMap[key][p] || 0) + h;
        });
    });

    // All grains: bucketMap already has the right keys (biweek uses stable period key)
    const buckets = Object.keys(bucketMap).sort().map(k => ({ key: k, data: bucketMap[k] }));

    if (_ytdMode === 'utilization') {
        _renderYTDUtilizationChart(buckets, xLabel, grain, rotateLbls, W, H, padL, padR, padT, padB, plotW, plotH, xPos, fromDate, toDate);
        return;
    }

    if (buckets.length < 2) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">Need more data for this view</div>';
        legend.innerHTML = ''; return;
    }

    // Top 8 projects
    const projTotals = {};
    buckets.forEach(b => Object.entries(b.data).forEach(([p, h]) => { projTotals[p] = (projTotals[p]||0)+h; }));
    const projects = Object.keys(projTotals).sort((a,b) => projTotals[b]-projTotals[a]).slice(0,8);

    // X-axis label per bucket
    const xLabel = (key) => {
        if (grain === 'month') {
            const d = new Date(key + '-01T00:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }
        if (grain === 'day') {
            const d = new Date(key + 'T00:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        // week / biweek: show Mon date
        const d = new Date(key + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Taller bottom padding for rotated day/week labels
    const rotateLbls = grain === 'day' || grain === 'week' || grain === 'biweek';
    const W = 800, H = 280, padL = 40, padR = 20, padT = 20, padB = rotateLbls ? 90 : 36;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = buckets.length;
    const series  = projects.map(p => buckets.map(b => b.data[p] || 0));
    const maxVal  = Math.max(...series.flat(), 1);
    const xPos = i => padL + (n > 1 ? (i / (n-1)) * plotW : plotW/2);
    const yPos = v => padT + plotH - (v / maxVal) * plotH;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: yPos(f*maxVal), label: (f*maxVal).toFixed(0) }));

    // Space labels so they don't overlap — minimum ~50 viewBox px apart
    const pxPerPoint  = n > 1 ? plotW / (n - 1) : plotW;
    const minSpacing  = rotateLbls ? 40 : 55;
    const xStep       = Math.max(1, Math.ceil(minSpacing / pxPerPoint));
    const xLabels     = buckets.map((b, i) => (i % xStep === 0 || i === n-1) ? xLabel(b.key) : '');

    // Today vertical line — find which bucket contains today (only if in range)
    const todayStr  = _today();
    const todayKey  = _bucketKey(todayStr, grain);
    const todayIdx  = ((!fromDate || todayStr >= fromDate) && (!toDate || todayStr <= toDate))
                      ? buckets.findIndex(b => b.key === todayKey)
                      : -1;
    // If today is past the last bucket but still in range, pin to last
    const todayX    = todayIdx >= 0 ? xPos(todayIdx) :
                      todayKey > buckets[buckets.length-1].key ? null :
                      todayKey < buckets[0].key ? null : null;

    const todayLabelRight = todayX !== null && todayX < W - padR - 36; // flip left if near edge
    const todayLine = todayX !== null ? `
        <line x1="${todayX.toFixed(1)}" y1="${padT}" x2="${todayX.toFixed(1)}" y2="${padT + plotH}"
              stroke="var(--primary)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>
        <text x="${todayLabelRight ? (todayX + 4).toFixed(1) : (todayX - 4).toFixed(1)}"
              y="${(padT + 10).toFixed(1)}"
              text-anchor="${todayLabelRight ? 'start' : 'end'}"
              font-size="9" fill="var(--primary)" font-weight="600">Today</text>
    ` : '';

    const polylines = series.map((vals, si) => {
        const pts = vals.map((v,i) => `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');
        return `<polyline points="${pts}" fill="none" stroke="${getProjectColor(projects[si])}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`;
    });
    const dots = series.map((vals, si) =>
        vals.map((v,i) => v > 0
            ? `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(v).toFixed(1)}" r="3" fill="${getProjectColor(projects[si])}" stroke="var(--bg-card)" stroke-width="1.5"/>`
            : '').join('')
    ).join('');

    // Transparent hit areas — one Voronoi-like column per bucket
    const hitAreas = buckets.map((b, i) => {
        const x1 = i === 0     ? padL     : (xPos(i) + xPos(i-1)) / 2;
        const x2 = i === n-1   ? W-padR   : (xPos(i) + xPos(i+1)) / 2;
        return `<rect class="chart-hit-area" data-bidx="${i}"
                      x="${x1.toFixed(1)}" y="${padT}"
                      width="${(x2-x1).toFixed(1)}" height="${plotH}"
                      fill="transparent" style="cursor:crosshair"/>`;
    }).join('');

    // Hover highlight line (hidden by default)
    const hoverLine = `<line id="ytd-hover-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}"
                             stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 2"
                             opacity="0" pointer-events="none"/>`;

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="dash-ytd-svg" id="ytd-svg">
        ${yTicks.map(t => `
            <line x1="${padL}" y1="${t.y.toFixed(1)}" x2="${W-padR}" y2="${t.y.toFixed(1)}" stroke="var(--border-light)" stroke-width="1"/>
            <text x="${padL-4}" y="${(t.y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-muted)">${t.label}</text>
        `).join('')}
        ${xLabels.map((lbl,i) => {
            if (!lbl) return '';
            const lx = xPos(i).toFixed(1);
            const ly = (padT + plotH + 20).toFixed(1);
            return rotateLbls
                ? `<text transform="rotate(-40 ${lx} ${ly})" x="${lx}" y="${ly}"
                         text-anchor="end" font-size="10" fill="var(--text-muted)">${lbl}</text>`
                : `<text x="${lx}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${lbl}</text>`;
        }).join('')}
        ${todayLine}
        ${hoverLine}
        ${polylines.join('')}
        ${dots}
        ${hitAreas}
    </svg>`;

    // Wire tooltip
    const tooltip = document.getElementById('chart-tooltip');
    const svgEl   = container.querySelector('#ytd-svg');
    const hlLine  = svgEl.querySelector('#ytd-hover-line');

    svgEl.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden');
        hlLine.setAttribute('opacity', '0');
    });

    svgEl.addEventListener('mousemove', e => {
        if (!tooltip.classList.contains('hidden')) _positionChartTooltip(tooltip, e);
    });

    container.querySelectorAll('.chart-hit-area').forEach(rect => {
        rect.addEventListener('dblclick', () => {
            const i = parseInt(rect.dataset.bidx);
            const bucketKey = buckets[i].key; // 'YYYY-MM-DD' or similar
            // Find the nearest week that contains this bucket
            const targetDate = new Date(bucketKey + 'T00:00:00');
            const weekKey = getWeekKey(targetDate);
            state.currentWeekStart = weekKey;
            showView('timesheets');
        });

        rect.addEventListener('mouseenter', e => {
            const i = parseInt(rect.dataset.bidx);
            const cx = xPos(i).toFixed(1);

            // Move highlight line
            hlLine.setAttribute('x1', cx);
            hlLine.setAttribute('x2', cx);
            hlLine.setAttribute('opacity', '0.5');

            // Build tooltip content
            const rows = projects.map((p, si) => {
                const v = series[si][i];
                return v > 0
                    ? `<div class="chart-tt-row">
                           <span class="chart-tt-dot" style="background:${getProjectColor(p)}"></span>
                           <span class="chart-tt-proj">${escHtml(p)}</span>
                           <span class="chart-tt-val">${v.toFixed(1)} hrs</span>
                       </div>`
                    : '';
            }).filter(Boolean).join('');

            const total = projects.reduce((s, p, si) => s + (series[si][i] || 0), 0);
            tooltip.innerHTML = `
                <div class="chart-tt-title">${xLabel(buckets[i].key)}</div>
                ${rows || '<div style="color:var(--text-muted);font-size:12px">No data</div>'}
                ${projects.length > 1 ? `<div class="chart-tt-total">Total: ${total.toFixed(1)} hrs</div>` : ''}`;
            tooltip.classList.remove('hidden');
            _positionChartTooltip(tooltip, e);
        });
    });

    legend.innerHTML = projects.map(p => `
        <span class="dash-legend-item">
            <span class="dash-legend-dot" style="background:${getProjectColor(p)}"></span>
            ${escHtml(p)}
        </span>`).join('');
}

function _renderYTDUtilizationChart(buckets, xLabel, grain, rotateLbls, W, H, padL, padR, padT, padB, plotW, plotH, xPos, fromDate, toDate) {
    const container = document.getElementById('dash-ytd-chart');
    const legend    = document.getElementById('dash-ytd-legend');
    const target    = parseFloat(state.settings.utilizationTarget) || 80;

    if (buckets.length < 2) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">Need more data for this view</div>';
        legend.innerHTML = ''; return;
    }

    // Calculate utilization per bucket from raw timesheet data bucketed by grain
    const utilBuckets = buckets.map(b => {
        let total = 0, bill = 0;
        Object.entries(b.data).forEach(([p, h]) => {
            if (getProjectHoliday(p)) return;
            total += h;
            if (getProjectBillable(p)) bill += h;
        });
        return { key: b.key, util: total > 0 ? (bill / total) * 100 : null };
    });

    const n      = utilBuckets.length;
    const yPos   = v => padT + plotH - (v / 100) * plotH;
    const todayStr = _today();
    const todayKey = _bucketKey(todayStr, grain);
    const todayIdx = ((!fromDate || todayStr >= fromDate) && (!toDate || todayStr <= toDate))
                     ? utilBuckets.findIndex(b => b.key === todayKey) : -1;
    const todayX   = todayIdx >= 0 ? xPos(todayIdx) : null;

    // Y-axis ticks at 0, 25, 50, 75, 100 — mark target
    const yTicks = [0, 25, 50, 75, 100].map(v => ({ y: yPos(v), label: v + '%' }));
    const targetY = yPos(target).toFixed(1);
    const xStep   = Math.max(1, Math.ceil(Math.max(1, (rotateLbls ? 40 : 55)) / (plotW / Math.max(n-1, 1))));
    const xLabels = utilBuckets.map((b, i) => (i % xStep === 0 || i === n-1) ? xLabel(b.key) : '');

    // Build points (skip nulls)
    const validPts = utilBuckets.map((b, i) => b.util !== null ? `${xPos(i).toFixed(1)},${yPos(b.util).toFixed(1)}` : null).filter(Boolean);
    const polyline = validPts.length > 1
        ? `<polyline points="${validPts.join(' ')}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
        : '';

    const dots = utilBuckets.map((b, i) => {
        if (b.util === null) return '';
        const onTarget = b.util >= target;
        return `<circle class="chart-hit-area" data-bidx="${i}"
                        cx="${xPos(i).toFixed(1)}" cy="${yPos(b.util).toFixed(1)}" r="5"
                        fill="${onTarget ? 'var(--success)' : 'var(--warning)'}"
                        stroke="var(--bg-card)" stroke-width="2" style="cursor:crosshair"/>`;
    }).join('');

    // Voronoi hit areas (full-height)
    const hitAreas = utilBuckets.map((b, i) => {
        const x1 = i === 0   ? padL   : (xPos(i) + xPos(i-1)) / 2;
        const x2 = i === n-1 ? W-padR : (xPos(i) + xPos(i+1)) / 2;
        return `<rect class="chart-hit-area" data-bidx="${i}"
                      x="${x1.toFixed(1)}" y="${padT}"
                      width="${(x2-x1).toFixed(1)}" height="${plotH}"
                      fill="transparent" style="cursor:crosshair"/>`;
    }).join('');

    const todayLabelRight = todayX !== null && todayX < W - padR - 36;
    const todayLine = todayX !== null ? `
        <line x1="${todayX.toFixed(1)}" y1="${padT}" x2="${todayX.toFixed(1)}" y2="${padT+plotH}"
              stroke="var(--primary)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.5"/>
        <text x="${todayLabelRight ? (todayX+4).toFixed(1) : (todayX-4).toFixed(1)}" y="${(padT+10).toFixed(1)}"
              text-anchor="${todayLabelRight ? 'start' : 'end'}" font-size="9" fill="var(--primary)" font-weight="600">Today</text>
    ` : '';

    const hoverLine = `<line id="ytd-hover-line" x1="0" y1="${padT}" x2="0" y2="${padT+plotH}"
                             stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 2"
                             opacity="0" pointer-events="none"/>`;

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="dash-ytd-svg" id="ytd-svg">
        ${yTicks.map(t => `
            <line x1="${padL}" y1="${t.y.toFixed(1)}" x2="${W-padR}" y2="${t.y.toFixed(1)}"
                  stroke="var(--border-light)" stroke-width="1"/>
            <text x="${padL-4}" y="${(t.y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-muted)">${t.label}</text>
        `).join('')}
        <line x1="${padL}" y1="${targetY}" x2="${W-padR}" y2="${targetY}"
              stroke="var(--success)" stroke-width="1" stroke-dasharray="5 3" opacity="0.6"/>
        <text x="${(W-padR+2)}" y="${(parseFloat(targetY)+4).toFixed(1)}" font-size="9" fill="var(--success)" font-weight="600">Target</text>
        ${xLabels.map((lbl, i) => {
            if (!lbl) return '';
            const lx = xPos(i).toFixed(1);
            const ly = (padT + plotH + 20).toFixed(1);
            return rotateLbls
                ? `<text transform="rotate(-40 ${lx} ${ly})" x="${lx}" y="${ly}" text-anchor="end" font-size="10" fill="var(--text-muted)">${lbl}</text>`
                : `<text x="${lx}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${lbl}</text>`;
        }).join('')}
        ${todayLine}${hoverLine}${polyline}${dots}${hitAreas}
    </svg>`;

    legend.innerHTML = `
        <span class="dash-legend-item"><span class="dash-legend-dot" style="background:var(--success)"></span>≥ ${target}%</span>
        <span class="dash-legend-item"><span class="dash-legend-dot" style="background:var(--warning)"></span>< ${target}%</span>`;

    // Tooltip + hover line
    const tooltip = document.getElementById('chart-tooltip');
    const svgEl   = container.querySelector('#ytd-svg');
    const hlLine  = svgEl.querySelector('#ytd-hover-line');

    svgEl.addEventListener('mouseleave', () => { tooltip.classList.add('hidden'); hlLine.setAttribute('opacity','0'); });
    svgEl.addEventListener('mousemove', e => { if (!tooltip.classList.contains('hidden')) _positionChartTooltip(tooltip, e); });

    container.querySelectorAll('.chart-hit-area').forEach(rect => {
        rect.addEventListener('mouseenter', e => {
            const i   = parseInt(rect.dataset.bidx);
            const b   = utilBuckets[i];
            const cx  = xPos(i).toFixed(1);
            hlLine.setAttribute('x1', cx); hlLine.setAttribute('x2', cx); hlLine.setAttribute('opacity','0.5');
            const pct = b.util !== null ? b.util.toFixed(1) + '%' : '—';
            const gap = b.util !== null ? (b.util - target).toFixed(1) : null;
            tooltip.innerHTML = `
                <div class="chart-tt-title">${xLabel(b.key)}</div>
                <div class="chart-tt-row">
                    <span class="chart-tt-dot" style="background:${b.util !== null && b.util >= target ? 'var(--success)' : 'var(--warning)'}"></span>
                    <span class="chart-tt-proj">Utilization</span>
                    <span class="chart-tt-val">${pct}</span>
                </div>
                ${gap !== null ? `<div class="chart-tt-total" style="color:${parseFloat(gap)>=0?'var(--success)':'var(--warning)'}">${parseFloat(gap)>=0?'+':''}${gap}% vs target</div>` : ''}`;
            tooltip.classList.remove('hidden');
            _positionChartTooltip(tooltip, e);
        });
        rect.addEventListener('dblclick', () => {
            const targetDate = new Date(utilBuckets[parseInt(rect.dataset.bidx)].key + 'T00:00:00');
            state.currentWeekStart = getWeekKey(targetDate);
            showView('timesheets');
        });
    });
}

function _renderDashProjectBreakdown(weekEntries, weekHrs) {
    const container = document.getElementById('dash-project-breakdown');
    if (!weekEntries.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No hours logged this week. <a href="#" class="card-link" data-view="timesheets">Open Timesheet →</a></div>';
        return;
    }
    const projMap = {};
    weekEntries.forEach(r => {
        const hrs = Object.values(r.hours || {}).reduce((a, h) => a + (parseFloat(h)||0), 0);
        if (hrs > 0) projMap[r.project || '(none)'] = (projMap[r.project || '(none)'] || 0) + hrs;
    });
    const sorted = Object.entries(projMap).sort((a, b) => b[1] - a[1]);
    container.innerHTML = `<div class="dash-proj-list">${sorted.map(([proj, hrs]) => {
        const pct      = weekHrs > 0 ? (hrs / weekHrs) * 100 : 0;
        const billable = getProjectBillable(proj);
        const color    = getProjectColor(proj);
        return `<div class="dash-proj-row">
            <div class="dash-proj-name">
                <span class="dash-proj-dot" style="background:${color}"></span>
                ${escHtml(proj)}${billable ? '<span class="dash-bill-tag">billable</span>' : ''}
            </div>
            <div class="dash-proj-bar-wrap">
                <div class="dash-proj-bar" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="dash-proj-hrs">${hrs.toFixed(1)} hrs <span class="dash-proj-pct">${Math.round(pct)}%</span></div>
        </div>`;
    }).join('')}</div>`;
}

/* ========== UTILIZATION ========== */
function renderUtilization() {
    const target = parseFloat(state.settings.utilizationTarget) || 80;

    // Build per-week data (holiday project hours excluded from denominator)
    const weekMap = {};
    Object.entries(state.timesheets).forEach(([wk, rows]) => {
        let total = 0, billable = 0;
        (rows || []).forEach(r => {
            if (getProjectHoliday(r.project)) return; // skip holiday projects entirely
            const hrs = Object.values(r.hours || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);
            total += hrs;
            if (getProjectBillable(r.project)) billable += hrs;
        });
        if (total > 0) weekMap[wk] = { total, billable };
    });

    const weeks    = Object.keys(weekMap).sort();
    const ytdTotal    = weeks.reduce((s, w) => s + weekMap[w].total,    0);
    const ytdBill     = weeks.reduce((s, w) => s + weekMap[w].billable, 0);
    const ytdUtil     = ytdTotal > 0 ? (ytdBill / ytdTotal) * 100 : 0;

    // Current week
    const curWk    = state.currentWeekStart;
    const curData  = weekMap[curWk] || { total: 0, billable: 0 };
    const curUtil  = curData.total > 0 ? (curData.billable / curData.total) * 100 : 0;

    // Gap vs target
    const ytdGap  = ytdUtil - target;
    const gapSign = ytdGap >= 0 ? '+' : '';

    // KPI cards
    const kpiColor = (pct) => pct >= target ? 'kpi-green' : pct >= target * 0.85 ? 'kpi-orange' : 'kpi-red';
    document.getElementById('util-kpi-grid').innerHTML = `
        <div class="kpi-card">
            <div class="kpi-icon-wrap ${kpiColor(curUtil)}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${curUtil.toFixed(1)}%</div>
                <div class="kpi-label">This Week</div>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon-wrap ${kpiColor(ytdUtil)}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${ytdUtil.toFixed(1)}%</div>
                <div class="kpi-label">YTD Utilization</div>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon-wrap kpi-blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${target}%</div>
                <div class="kpi-label">Target</div>
            </div>
        </div>
        <div class="kpi-card">
            <div class="kpi-icon-wrap ${ytdGap >= 0 ? 'kpi-green' : 'kpi-orange'}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${ytdGap >= 0
                        ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
                        : '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'}
                </svg>
            </div>
            <div class="kpi-body">
                <div class="kpi-value">${gapSign}${ytdGap.toFixed(1)}%</div>
                <div class="kpi-label">vs Target (YTD)</div>
            </div>
        </div>`;

    // Weekly trend chart
    _renderUtilWeekChart(weekMap, weeks, target);

    // Project breakdown
    _renderUtilProjectBreakdown(ytdTotal, ytdBill);

    // Monthly breakdown
    _renderUtilMonthlyBreakdown(weekMap, weeks, target);
}

function _renderUtilWeekChart(weekMap, weeks, target) {
    const container = document.getElementById('util-weekly-chart');
    const recent    = weeks.slice(-16);
    if (!recent.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No data yet</div>';
        document.getElementById('util-chart-sub').textContent = '';
        return;
    }
    const data = recent.map(w => {
        const d = new Date(w + 'T00:00:00');
        const pct = (weekMap[w].billable / weekMap[w].total) * 100;
        return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: pct };
    });
    const threshPct = Math.min(100, target);
    container.innerHTML = `
        <div class="dash-bar-chart">
            <div class="dash-bar-grid" style="--thresh-pct:${threshPct}%">
                ${data.map(d => {
                    const over = d.value >= target;
                    return `<div class="dash-bar-col">
                        <div class="dash-bar-val">${d.value.toFixed(0)}%</div>
                        <div class="dash-bar-bar${over ? '' : ' dash-bar-over'}" style="height:${d.value}%;background:${over ? 'var(--success)' : 'var(--warning)'}"></div>
                        <div class="dash-bar-label">${d.label}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    document.getElementById('util-chart-sub').textContent = `Last ${recent.length} weeks · target ${target}%`;
}

function _renderUtilProjectBreakdown(ytdTotal, ytdBill) {
    const container = document.getElementById('util-project-breakdown');
    const projMap   = {};
    Object.values(state.timesheets).flat().forEach(r => {
        if (!r.project) return;
        const hrs = Object.values(r.hours || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);
        if (!projMap[r.project]) projMap[r.project] = { hours: 0, billable: getProjectBillable(r.project) };
        projMap[r.project].hours += hrs;
    });
    const sorted = Object.entries(projMap).filter(([, d]) => d.hours > 0).sort((a, b) => b[1].hours - a[1].hours);
    if (!sorted.length) { container.innerHTML = '<div class="empty-state" style="padding:24px">No data</div>'; return; }

    document.getElementById('util-proj-sub').textContent =
        `${ytdBill.toFixed(1)} billable / ${ytdTotal.toFixed(1)} total hrs`;

    container.innerHTML = `<table class="pto-history-table">
        <thead><tr><th>Project</th><th>Hours</th><th>% of Total</th><th>Type</th><th style="width:200px">Share</th></tr></thead>
        <tbody>${sorted.map(([proj, d]) => {
            const pct = ytdTotal > 0 ? (d.hours / ytdTotal) * 100 : 0;
            return `<tr>
                <td style="font-weight:500">${escHtml(proj)}</td>
                <td>${d.hours.toFixed(1)}</td>
                <td>${pct.toFixed(1)}%</td>
                <td><span class="pto-status-chip ${d.billable ? 'chip-submitted' : 'chip-planned'}">${d.billable ? 'Billable' : 'Non-Billable'}</span></td>
                <td><div class="dash-proj-bar-wrap"><div class="dash-proj-bar" style="width:${pct}%;background:${d.billable ? 'var(--success)' : 'var(--text-muted)'}"></div></div></td>
            </tr>`;
        }).join('')}</tbody>
    </table>`;
}

function _renderUtilMonthlyBreakdown(weekMap, weeks, target) {
    const container = document.getElementById('util-monthly-breakdown');
    const monthMap  = {};
    weeks.forEach(w => {
        // Use Monday of the week as the month anchor
        const d = new Date(w + 'T00:00:00');
        d.setDate(d.getDate() + 1); // Mon
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = { total: 0, billable: 0 };
        monthMap[key].total    += weekMap[w].total;
        monthMap[key].billable += weekMap[w].billable;
    });
    const months = Object.keys(monthMap).sort().reverse();
    if (!months.length) { container.innerHTML = '<div class="empty-state" style="padding:24px">No data</div>'; return; }

    container.innerHTML = `<table class="pto-history-table">
        <thead><tr><th>Month</th><th>Billable Hrs</th><th>Total Hrs</th><th>Utilization</th><th style="width:180px">vs Target</th></tr></thead>
        <tbody>${months.map(m => {
            const d    = new Date(m + '-01T00:00:00');
            const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const util  = monthMap[m].total > 0 ? (monthMap[m].billable / monthMap[m].total) * 100 : 0;
            const gap   = util - target;
            const onTarget = util >= target;
            return `<tr>
                <td style="font-weight:500">${label}</td>
                <td>${monthMap[m].billable.toFixed(1)}</td>
                <td>${monthMap[m].total.toFixed(1)}</td>
                <td><span class="util-pct-badge ${onTarget ? 'util-on-target' : 'util-off-target'}">${util.toFixed(1)}%</span></td>
                <td class="${onTarget ? 'util-gap-pos' : 'util-gap-neg'}">${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%</td>
            </tr>`;
        }).join('')}</tbody>
    </table>`;
}

function renderBalanceRow(label, submitted, planned, total, color) {
    submitted = parseFloat(submitted) || 0;
    planned   = parseFloat(planned)   || 0;
    total     = parseFloat(total)     || 1;
    const scheduled  = submitted + planned;
    const remaining  = Math.max(0, total - scheduled);
    const subPct     = Math.min(100, (submitted / total) * 100);
    const planPct    = Math.min(100 - subPct, (planned / total) * 100);
    const planLabel  = planned > 0 ? ` · <span class="pto-planned-label">${planned.toFixed(1)} planned</span>` : '';

    return `
        <div class="pto-balance-row">
            <div class="pto-balance-header">
                <span class="pto-type-label">${label}</span>
                <span style="font-size:13px;font-weight:600;color:var(--text)">${remaining.toFixed(1)} <span style="color:var(--text-muted);font-size:11px;font-weight:400">/ ${total} hrs</span></span>
            </div>
            <div class="progress-bar-wrap progress-bar-dual">
                <div class="progress-bar-submitted" style="width:${subPct}%;background:${color}"></div>
                <div class="progress-bar-planned"   style="width:${planPct}%;left:${subPct}%;background:${color}"></div>
            </div>
            <div class="pto-sub-label">
                <span>${submitted.toFixed(1)} submitted${planLabel}</span>
                <span>${remaining.toFixed(1)} remaining</span>
            </div>
        </div>
    `;
}

/* ========== TIMESHEET ========== */
function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ========== GRID TIMESHEET RENDERING ========== */

const DAY_LABELS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function renderTimesheetTable() {
    updatePayPeriodLabel();

    const weekDates = getWeekDates(new Date(state.currentWeekStart + 'T00:00:00'));
    let rows = getGridRows();

    // Apply filter based on project-level billable setting
    if (state.activeFilter === 'billable')    rows = rows.filter(r => getProjectBillable(r.project));
    if (state.activeFilter === 'nonbillable') rows = rows.filter(r => !getProjectBillable(r.project));

    // Apply search
    const search = (document.getElementById('timesheet-search')?.value || '').toLowerCase();
    if (search) rows = rows.filter(r => (r.project || '').toLowerCase().includes(search) || (r.notes || '').toLowerCase().includes(search));

    const emptyColspan = weekDates.length + 5;

    // Build full table HTML (header + body + footer)
    const table = document.getElementById('timesheet-table');
    table.innerHTML = `
        <thead>
            <tr class="grid-header-row">
                <th class="col-project-h"></th>
                ${weekDates.map(d => {
                    const dt = new Date(d + 'T00:00:00');
                    const wknd = isWeekend(d);
                    return `<th class="col-grid-day${wknd ? ' col-weekend-h' : ''}" data-date="${d}">
                        <div class="grid-th-day${wknd ? ' wknd-color' : ''}">${DAY_LABELS[dt.getDay()]}</div>
                        <div class="grid-th-date">${dt.getMonth()+1}/${dt.getDate()}</div>
                    </th>`;
                }).join('')}
                <th class="col-stat-h">REG</th>
                <th class="col-stat-h col-ovt-h">OVT</th>
                <th class="col-stat-h col-total-h">TOTAL</th>
                <th class="col-del-h"></th>
            </tr>
        </thead>
        <tbody id="timesheet-tbody">
            ${rows.length
                ? rows.map(row => buildGridRowHTML(row, weekDates)).join('')
                : `<tr><td colspan="${emptyColspan}"><div class="empty-state">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="4" width="18" height="18" rx="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    No projects this week. Click <strong>Add Row</strong> to start.
                   </div></td></tr>`
            }
        </tbody>
        <tfoot>
            <tr class="notes-row">
                <td class="notes-label">Notes</td>
                ${weekDates.map(d => {
                    const hasNote = !!(state.dailyNotes[d]);
                    const preview = hasNote ? escHtml(state.dailyNotes[d].slice(0, 60)) + (state.dailyNotes[d].length > 60 ? '…' : '') : '';
                    return `<td class="grid-cell notes-cell${isWeekend(d) ? ' grid-weekend-cell' : ''}">
                        <button class="day-note-btn${hasNote ? ' has-note' : ''}" data-date="${d}"
                            title="${hasNote ? preview : 'Add note'}">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                        </button>
                    </td>`;
                }).join('')}
                <td colspan="4"></td>
            </tr>
            <tr class="grid-totals-row">
                <td class="grid-totals-label">Daily Total</td>
                ${weekDates.map(d => `<td class="grid-daily-total${isWeekend(d) ? ' grid-weekend-cell' : ''}" id="dt-${d}"></td>`).join('')}
                <td class="grid-total-stat" id="footer-reg"></td>
                <td class="grid-total-stat grid-ovt-total" id="footer-ovt"></td>
                <td class="grid-total-stat grid-grand-total" id="footer-hours"></td>
                <td></td>
            </tr>
        </tfoot>`;

    attachGridListeners(weekDates);
    updateGridTotals(weekDates);
}

function buildGridRowHTML(row, weekDates) {
    const names = getProjectNames();
    const isCustom = row.project && !names.includes(row.project);
    const opts = `<option value="">— Select Project —</option>` +
        names.map(n => `<option value="${escHtml(n)}"${n === row.project ? ' selected' : ''}>${escHtml(n)}</option>`).join('') +
        (isCustom ? `<option value="${escHtml(row.project)}" selected>${escHtml(row.project)}</option>` : '') +
        `<option value="__custom__">+ Add project…</option>`;

    const cells = weekDates.map(d => {
        const val = parseFloat(row.hours?.[d] || 0);
        const wknd = isWeekend(d);
        return `<td class="grid-cell${wknd ? ' grid-weekend-cell' : ''}">
            <input type="number" class="grid-hour-input"
                value="${val > 0 ? val : ''}"
                min="0" max="24" step="0.25"
                data-row-id="${row.id}" data-date="${d}">
        </td>`;
    }).join('');

    const { reg, ovt, total } = calcRowStats(row, weekDates);
    return `<tr data-id="${row.id}" class="grid-data-row">
        <td class="col-project-h grid-project-td">
            <div class="grid-project-cell">
                <select class="grid-project-select" data-row-id="${row.id}">${opts}</select>
            </div>
        </td>
        ${cells}
        <td class="grid-row-stat" data-stat="reg">${reg > 0 ? reg.toFixed(2) : ''}</td>
        <td class="grid-row-stat grid-ovt-stat${ovt > 0 ? ' ovt-has-value' : ''}" data-stat="ovt">${ovt > 0 ? ovt.toFixed(2) : ''}</td>
        <td class="grid-row-stat grid-total-stat" data-stat="total">${total > 0 ? total.toFixed(2) : ''}</td>
        <td class="grid-del-cell">
            <button class="row-btn delete delete-row-btn" data-id="${row.id}" title="Delete row">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
            </button>
        </td>
    </tr>`;
}

function calcRowStats(row, weekDates) {
    let reg = 0, ovt = 0;
    weekDates.forEach(d => {
        const h = parseFloat(row.hours?.[d] || 0);
        reg += Math.min(h, 8);
        ovt += Math.max(0, h - 8);
    });
    return { reg, ovt, total: reg + ovt };
}

function attachGridListeners(weekDates) {
    const table = document.getElementById('timesheet-table');

    // Hour inputs — save on change, update stats inline
    table.querySelectorAll('.grid-hour-input').forEach(inp => {
        inp.addEventListener('change', function () {
            let val = parseFloat(this.value);
            if (isNaN(val) || val < 0) { val = 0; this.value = ''; }
            if (val > 24) { val = 24; this.value = '24'; }
            const rowId = this.dataset.rowId;
            const date  = this.dataset.date;
            const row = (state.timesheets[state.currentWeekStart] || []).find(r => r.id === rowId);
            if (!row) return;
            if (!row.hours) row.hours = {};
            row.hours[date] = val;
            saveState();
            updateRowStats(rowId, weekDates);
            updateGridTotals(weekDates);
        });

        inp.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const all = [...table.querySelectorAll('.grid-hour-input')];
            const idx = all.indexOf(this);
            if (idx < all.length - 1) all[idx + 1].focus();
            else addRow();
        });
    });

    // Project selects
    table.querySelectorAll('.grid-project-select').forEach(sel => {
        sel.addEventListener('change', function () {
            const rowId = this.dataset.rowId;
            if (this.value === '__custom__') {
                const name = prompt('Project name:');
                if (name?.trim()) {
                    const n = name.trim();
                    if (!state.settings.projects.includes(n)) { state.settings.projects.push(n); saveState(); }
                    setRowProject(rowId, n);
                    renderTimesheetTable();
                } else {
                    const row = (state.timesheets[state.currentWeekStart] || []).find(r => r.id === rowId);
                    this.value = row?.project || '';
                }
            } else {
                setRowProject(rowId, this.value);
            }
        });
    });

    // Day note buttons → open modal
    table.querySelectorAll('.day-note-btn').forEach(btn => {
        btn.addEventListener('click', () => openNoteModal(btn.dataset.date));
    });

    // Delete buttons
    table.querySelectorAll('.delete-row-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteRow(btn.dataset.id));
    });
}

function setRowProject(rowId, project) {
    const row = (state.timesheets[state.currentWeekStart] || []).find(r => r.id === rowId);
    if (!row) return;
    row.project = project;
    row.billable = getProjectBillable(project);
    saveState();
    // Sync the billable checkbox in the same row without a full re-render
    const tr = document.querySelector(`tr[data-id="${rowId}"]`);
    if (tr) {
        const cb = tr.querySelector('.grid-billable-cb');
        if (cb) { cb.checked = row.billable; cb.title = row.billable ? 'Billable' : 'Non-billable'; }
    }
}

function updateRowStats(rowId, weekDates) {
    const row = (state.timesheets[state.currentWeekStart] || []).find(r => r.id === rowId);
    const tr  = document.querySelector(`tr[data-id="${rowId}"]`);
    if (!row || !tr) return;
    const { reg, ovt, total } = calcRowStats(row, weekDates);
    tr.querySelector('[data-stat="reg"]').textContent   = reg   > 0 ? reg.toFixed(2)   : '';
    const ovtCell = tr.querySelector('[data-stat="ovt"]');
    ovtCell.textContent = ovt > 0 ? ovt.toFixed(2) : '';
    ovtCell.className = `grid-row-stat grid-ovt-stat${ovt > 0 ? ' ovt-has-value' : ''}`;
    tr.querySelector('[data-stat="total"]').textContent = total > 0 ? total.toFixed(2) : '';
}

function updateGridTotals(weekDates) {
    const allRows = getGridRows();
    let totalReg = 0, totalOvt = 0;

    weekDates.forEach(d => {
        let daySum = 0;
        allRows.forEach(row => { daySum += parseFloat(row.hours?.[d] || 0); });
        const cell = document.getElementById(`dt-${d}`);
        if (cell) {
            cell.textContent = daySum > 0 ? daySum.toFixed(2) : '';
            cell.className   = `grid-daily-total${isWeekend(d) ? ' grid-weekend-cell' : ''}${daySum > 0 ? ' has-hours' : ''}`;
        }
    });

    allRows.forEach(row => {
        const { reg, ovt } = calcRowStats(row, weekDates);
        totalReg += reg; totalOvt += ovt;
    });
    const grand = totalReg + totalOvt;

    const regEl = document.getElementById('footer-reg');
    const ovtEl = document.getElementById('footer-ovt');
    const totEl = document.getElementById('footer-hours');
    if (regEl) regEl.textContent = totalReg > 0 ? totalReg.toFixed(2) : '';
    if (ovtEl) { ovtEl.textContent = totalOvt > 0 ? totalOvt.toFixed(2) : ''; ovtEl.className = `grid-total-stat grid-ovt-total${totalOvt > 0 ? ' ovt-has-value' : ''}`; }
    if (totEl) totEl.textContent = grand > 0 ? grand.toFixed(2) : '';
}

function addRow() {
    if (!state.timesheets[state.currentWeekStart]) state.timesheets[state.currentWeekStart] = [];
    const weekDates = getWeekDates(new Date(state.currentWeekStart + 'T00:00:00'));
    const hours = {};
    weekDates.forEach(d => { hours[d] = 0; });
    const row = { id: generateId(), project: '', hours, billable: true, notes: '' };
    state.timesheets[state.currentWeekStart].push(row);
    saveState();
    renderTimesheetTable();
    setTimeout(() => {
        const rows = document.querySelectorAll('#timesheet-tbody tr');
        const last = rows[rows.length - 1];
        if (last) last.querySelector('.grid-project-select, input')?.focus();
    }, 50);
    updateSubmittedDays();
}

function deleteRow(id) {
    if (!state.timesheets[state.currentWeekStart]) return;
    state.timesheets[state.currentWeekStart] = state.timesheets[state.currentWeekStart].filter(r => r.id !== id);
    saveState();
    renderTimesheetTable();
    updateSubmittedDays();
}

function openCopyWeekModal() {
    const allWeeks = Object.entries(state.timesheets)
        .filter(([k, v]) => v?.length)
        .sort((a, b) => b[0].localeCompare(a[0])); // newest first

    if (!allWeeks.length) { showToast('No weeks with data found', 'warning'); return; }

    const list = document.getElementById('copy-week-list');
    list.innerHTML = allWeeks.map(([weekKey, rows]) => {
        const d = new Date(weekKey + 'T00:00:00');
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const isCurrent = weekKey === state.currentWeekStart;
        return `
            <button class="copy-week-item${isCurrent ? ' disabled' : ''}"
                ${isCurrent ? 'disabled' : `data-week="${weekKey}"`}
                ${isCurrent ? '' : `onclick="copyWeekFromModal('${weekKey}')"` }>
                <div class="copy-week-date">${label}</div>
                <div class="copy-week-count">${rows.length} project${rows.length !== 1 ? 's' : ''}</div>
                ${isCurrent ? '<span class="copy-week-current">Current Week</span>' : ''}
            </button>
        `;
    }).join('');

    showModal('copy-week-modal');
}

function copyWeekFromModal(sourceWeekKey) {
    const sourceRows = state.timesheets[sourceWeekKey];
    if (!sourceRows?.length) { showToast('No data in that week', 'warning'); return; }

    const cur = state.timesheets[state.currentWeekStart] || [];
    const sourceDate = new Date(sourceWeekKey + 'T00:00:00');
    const sourceLabel = sourceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (cur.length > 0) {
        showConfirm('Copy Week', `Add ${sourceRows.length} project row(s) from week of ${sourceLabel}? Existing rows will be kept.`, () => doWeekCopy(sourceWeekKey, sourceRows));
    } else {
        doWeekCopy(sourceWeekKey, sourceRows);
    }
    hideModal('copy-week-modal');
}

function doWeekCopy(sourceWeekKey, sourceRows) {
    if (!state.timesheets[state.currentWeekStart]) state.timesheets[state.currentWeekStart] = [];
    const weekDates = getWeekDates(new Date(state.currentWeekStart + 'T00:00:00'));
    const blankHours = {};
    weekDates.forEach(d => { blankHours[d] = 0; });

    sourceRows.forEach(r => {
        state.timesheets[state.currentWeekStart].push({
            id: generateId(),
            project: r.project || '',
            hours: { ...blankHours },
            billable: r.billable !== false,
            notes: ''
        });
    });
    saveState();
    renderTimesheetTable();
    updateSubmittedDays();
    const sourceDate = new Date(sourceWeekKey + 'T00:00:00');
    const sourceLabel = sourceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    showToast(`Copied ${sourceRows.length} project rows from week of ${sourceLabel}`, 'success');
}

function updatePayPeriodLabel() {
    const label = document.getElementById('pay-period-label');
    if (label) label.textContent = formatPayPeriod(new Date(state.currentWeekStart + 'T00:00:00'));
}

function onTableKeydown(e) {
    // handled inside attachGridListeners
}

function updateSubmittedDays() {
    renderMiniCalendar();
}

/* ========== PTO PANEL ========== */
function renderPTOPanel() {
    const content = document.getElementById('pto-panel-content');
    const types   = getPTOTypes();
    const pending = (state.pto.requests || []).filter(r => r.status === 'pending').length;
    const ptoUsed = getTotalPTOUsed();

    const balanceRows = types.map((t, i) => {
        const color = PTO_PALETTE[i % PTO_PALETTE.length].fill;
        return renderBalanceRow(t.name, getPTOSubmittedByType(t.key), getPTOPlannedByType(t.key), t.total, color);
    }).join('');

    content.innerHTML = `
        <div style="padding:4px 12px 0">${balanceRows}</div>
        <div class="pto-items-list">
            <div class="pto-item-row">
                <span class="pto-item-label">PTO Used YTD</span>
                <span class="pto-item-value">${ptoUsed.toFixed(1)} hrs</span>
            </div>
            <div class="pto-item-row">
                <span class="pto-item-label">Pending Requests</span>
                <span class="pto-item-value">
                    ${pending > 0 ? `<span class="pending-badge">${pending} pending</span>` : '0'}
                </span>
            </div>
        </div>
    `;
}

/* ========== PTO VIEW ========== */
function renderPTOView() {
    // Balance cards
    const container = document.getElementById('pto-balance-cards');
    const types = getPTOTypes();
    const grandTotal = types.reduce((s, t) => s + (parseFloat(t.total) || 0), 0);
    const totalSub   = getTotalPTOUsed();
    const totalPlan  = getTotalPTOPlanned();

    container.innerHTML = types.map((t, i) => {
        const color    = PTO_PALETTE[i % PTO_PALETTE.length].fill;
        const subHrs   = getPTOSubmittedByType(t.key);
        const planHrs  = getPTOPlannedByType(t.key);
        const usedHrs  = subHrs + planHrs;
        const rem      = Math.max(0, (t.total || 0) - usedHrs);
        const subPct   = Math.min(100, (subHrs  / Math.max(t.total||1,1)) * 100);
        const planPct  = Math.min(100 - subPct, (planHrs / Math.max(t.total||1,1)) * 100);
        return `
        <div class="pto-balance-card">
            <div class="pto-balance-card-dot" style="background:${color}"></div>
            <div class="pto-balance-card-label">${escHtml(t.name)}</div>
            <div class="pto-balance-card-value">${rem.toFixed(1)} <span>hrs left</span></div>
            <div class="pto-balance-card-sub">
                ${subHrs.toFixed(1)} submitted${planHrs > 0 ? ` · <strong>${planHrs.toFixed(1)} planned</strong>` : ''} of ${(t.total||0).toFixed(1)} hrs
            </div>
            <div class="progress-bar-wrap progress-bar-dual">
                <div class="progress-bar-submitted" style="width:${subPct}%;background:${color}"></div>
                <div class="progress-bar-planned"   style="width:${planPct}%;left:${subPct}%;background:${color}"></div>
            </div>
        </div>`;
    }).join('') + `
        <div class="pto-balance-card pto-balance-card-total">
            <div class="pto-balance-card-label">All PTO</div>
            <div class="pto-balance-card-value">${Math.max(0, grandTotal - totalSub - totalPlan).toFixed(1)} <span>hrs left</span></div>
            <div class="pto-balance-card-sub">
                ${totalSub.toFixed(1)} submitted${totalPlan > 0 ? ` · <strong>${totalPlan.toFixed(1)} planned</strong>` : ''} of ${grandTotal.toFixed(1)} hrs
            </div>
            <div class="progress-bar-wrap progress-bar-dual">
                <div class="progress-bar-submitted" style="width:${Math.min(100,(totalSub/Math.max(grandTotal,1))*100)}%;background:var(--text-muted)"></div>
                <div class="progress-bar-planned"   style="width:${Math.min(100-Math.min(100,(totalSub/Math.max(grandTotal,1))*100),(totalPlan/Math.max(grandTotal,1))*100)}%;left:${Math.min(100,(totalSub/Math.max(grandTotal,1))*100)}%;background:var(--text-muted)"></div>
            </div>
        </div>`;

    // History — all timesheet entries linked to a PTO project, sorted newest first
    _renderPTOHistory();
}

function _renderPTOHistory() {
    const container = document.getElementById('pto-history-container');
    const sub       = document.getElementById('pto-history-sub');
    const types     = getPTOTypes();
    const linkedProjects = types.map(t => t.linkedProject).filter(Boolean);

    if (!linkedProjects.length) {
        container.innerHTML = '<div class="empty-state" style="padding:40px">Link a PTO type to a project in Settings to see history here.</div>';
        sub.textContent = '';
        return;
    }

    // Collect all rows
    const today = _today();
    const allRows = [];
    Object.entries(state.timesheets).forEach(([, weekRows]) => {
        (weekRows || []).forEach(r => {
            if (!linkedProjects.includes(r.project)) return;
            Object.entries(r.hours || {}).forEach(([d, h]) => {
                const hrs = parseFloat(h) || 0;
                if (hrs <= 0) return;
                const typeObj = types.find(t => t.linkedProject === r.project);
                allRows.push({
                    date:     d,
                    type:     typeObj ? typeObj.name : r.project,
                    hours:    hrs,
                    status:   d <= today ? 'Submitted' : 'Planned',
                    note:     state.dailyNotes[d] || '',
                });
            });
        });
    });

    if (!allRows.length) {
        container.innerHTML = '<div class="empty-state" style="padding:40px">No PTO hours logged yet in your timesheet.</div>';
        sub.textContent = '';
        return;
    }

    // Summary counts (before filtering)
    const usedHrs    = allRows.filter(r => r.status === 'Submitted').reduce((s, r) => s + r.hours, 0);
    const plannedHrs = allRows.filter(r => r.status === 'Planned').reduce((s, r) => s + r.hours, 0);
    sub.textContent  = `${usedHrs.toFixed(1)} hrs submitted · ${plannedHrs.toFixed(1)} hrs planned`;

    // Apply filters
    const f = _ptoHistFilter;
    let rows = allRows.filter(r => {
        if (f.type   && r.type   !== f.type)                              return false;
        if (f.status && r.status !== f.status)                            return false;
        if (f.search && !r.note.toLowerCase().includes(f.search.toLowerCase())) return false;
        return true;
    });

    // Apply sort
    const { col, dir } = _ptoHistSort;
    const mult = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
        const av = col === 'hours' ? a.hours : String(a[col] || '');
        const bv = col === 'hours' ? b.hours : String(b[col] || '');
        if (col === 'hours') return (av - bv) * mult;
        return av.localeCompare(bv) * mult;
    });

    const sortIcon = (c) => {
        if (_ptoHistSort.col !== c) return '<span class="sort-icon inactive">↕</span>';
        return `<span class="sort-icon">${_ptoHistSort.dir === 'asc' ? '↑' : '↓'}</span>`;
    };

    const typeOptions = [...new Set(allRows.map(r => r.type))];

    container.innerHTML = `
        <div class="pto-history-filters">
            <select class="input-sm select-field" id="phf-type">
                <option value="">All Types</option>
                ${typeOptions.map(t => `<option value="${escHtml(t)}" ${f.type === t ? 'selected' : ''}>${escHtml(t)}</option>`).join('')}
            </select>
            <select class="input-sm select-field" id="phf-status">
                <option value="">All Statuses</option>
                <option value="Submitted" ${f.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
                <option value="Planned"   ${f.status === 'Planned'   ? 'selected' : ''}>Planned</option>
            </select>
            <div class="search-box">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" class="search-input" id="phf-search" placeholder="Search notes…" value="${escHtml(f.search)}">
            </div>
            ${f.type || f.status || f.search ? `<button class="btn btn-ghost btn-sm" id="phf-clear">Clear</button>` : ''}
        </div>
        <table class="pto-history-table">
            <thead><tr>
                <th class="sortable-th" data-phcol="date">Date ${sortIcon('date')}</th>
                <th class="sortable-th" data-phcol="type">Type ${sortIcon('type')}</th>
                <th class="sortable-th" data-phcol="hours">Hours ${sortIcon('hours')}</th>
                <th class="sortable-th" data-phcol="status">Status ${sortIcon('status')}</th>
                <th class="sortable-th" data-phcol="note">Notes ${sortIcon('note')}</th>
            </tr></thead>
            <tbody>${rows.length ? rows.map(r => {
                const d = new Date(r.date + 'T00:00:00');
                const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                return `<tr class="${r.status === 'Planned' ? 'pto-planned-row' : ''}">
                    <td>${dateLabel}</td>
                    <td>${escHtml(r.type)}</td>
                    <td>${r.hours.toFixed(1)}</td>
                    <td><span class="pto-status-chip ${r.status === 'Submitted' ? 'chip-submitted' : 'chip-planned'}">${r.status}</span></td>
                    <td class="pto-history-note">${escHtml(r.note) || '<span class="pto-note-empty">—</span>'}</td>
                </tr>`;
            }).join('') : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No entries match the current filters</td></tr>`}
            </tbody>
        </table>`;

    // Wire filter controls
    container.querySelector('#phf-type').addEventListener('change', e => { _ptoHistFilter.type = e.target.value; _renderPTOHistory(); });
    container.querySelector('#phf-status').addEventListener('change', e => { _ptoHistFilter.status = e.target.value; _renderPTOHistory(); });
    container.querySelector('#phf-search').addEventListener('input', e => { _ptoHistFilter.search = e.target.value; _renderPTOHistory(); });
    container.querySelector('#phf-clear')?.addEventListener('click', () => { _ptoHistFilter = { type: '', status: '', search: '' }; _renderPTOHistory(); });

    // Wire sortable headers
    container.querySelectorAll('.sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const c = th.dataset.phcol;
            if (_ptoHistSort.col === c) _ptoHistSort.dir = _ptoHistSort.dir === 'asc' ? 'desc' : 'asc';
            else { _ptoHistSort.col = c; _ptoHistSort.dir = c === 'date' ? 'desc' : 'asc'; }
            _renderPTOHistory();
        });
    });
}

function submitPTORequest() {
    const type = document.getElementById('pto-type').value;
    const startDate = document.getElementById('pto-start').value;
    const endDate = document.getElementById('pto-end').value;
    const hoursPerDay = parseFloat(document.getElementById('pto-hours-day').value) || 8;
    const notes = document.getElementById('pto-notes').value.trim();

    if (!startDate || !endDate) { showToast('Please select start and end dates', 'error'); return; }
    if (endDate < startDate) { showToast('End date must be after start date', 'error'); return; }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    let days = 0;
    let cur = new Date(start);
    while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) days++;
        cur.setDate(cur.getDate() + 1);
    }

    const totalHours = days * hoursPerDay;
    const request = {
        id: generateId(),
        type, startDate, endDate, hoursPerDay,
        totalHours, notes,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    state.pto.requests.push(request);

    saveState();
    hideModal('pto-modal');
    showToast(`PTO request submitted: ${totalHours.toFixed(1)} hours`, 'success');

    if (state.currentView === 'pto') renderPTOView();
    if (state.currentView === 'timesheets') renderPTOPanel();
    renderMiniCalendar();
}

function updatePTOCalcPreview() {
    const startDate = document.getElementById('pto-start')?.value;
    const endDate = document.getElementById('pto-end')?.value;
    const hoursPerDay = parseFloat(document.getElementById('pto-hours-day')?.value) || 8;
    const preview = document.getElementById('pto-calc-preview');
    if (!preview) return;

    if (!startDate || !endDate || endDate < startDate) {
        preview.textContent = '';
        return;
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    let days = 0;
    let cur = new Date(start);
    while (cur <= end) {
        if (cur.getDay() !== 0 && cur.getDay() !== 6) days++;
        cur.setDate(cur.getDate() + 1);
    }

    const totalHours = days * hoursPerDay;
    preview.innerHTML = `<strong>${days}</strong> business day${days !== 1 ? 's' : ''} × <strong>${hoursPerDay}</strong> hrs/day = <strong>${totalHours.toFixed(1)} hours</strong>`;
}

/* ========== MINI CALENDAR ========== */
function renderMiniCalendar() {
    const date = state.miniCalDate;
    const year = date.getFullYear();
    const month = date.getMonth();

    document.getElementById('mini-cal-title').textContent =
        date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const grid = document.getElementById('mini-cal-grid');
    const ptoDays = getPTODays();
    const submittedDays = getSubmittedDays();
    const today = new Date().toISOString().split('T')[0];

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = `<div class="cal-days-row">`;
    ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
        html += `<div class="cal-day-header">${d}</div>`;
    });
    html += '</div><div class="cal-dates-grid">';

    // Blank cells before first day
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-date empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = (firstDay + d - 1) % 7;
        const isToday = dateStr === today;
        const isPTO = ptoDays.has(dateStr);
        const isSubmitted = submittedDays.has(dateStr);
        const isWknd = dow === 0 || dow === 6;

        let cls = 'cal-date';
        if (isToday) cls += ' today';
        else if (isPTO) cls += ' pto-day';
        else if (isSubmitted) cls += ' submitted-day';
        else if (isWknd) cls += ' weekend';

        html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
    }

    html += '</div>';
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-date[data-date]').forEach(cell => {
        cell.addEventListener('click', () => {
            // Navigate timesheet to week containing this date
            const clickedDate = new Date(cell.dataset.date + 'T00:00:00');
            state.currentWeekStart = getWeekKey(clickedDate);
            renderTimesheetTable();
            updatePayPeriodLabel();
        });
    });
}

/* ========== FULL CALENDAR ========== */
function renderFullCalendar() {
    const date = state.fullCalDate;
    const year = date.getFullYear();
    const month = date.getMonth();

    document.getElementById('full-cal-title').textContent =
        date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const grid = document.getElementById('full-cal-grid');
    const ptoDays = getPTODays();
    const submittedDays = getSubmittedDays();
    const today = new Date().toISOString().split('T')[0];

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    let html = '';

    // Prev month cells
    for (let i = firstDay - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        const prevMonth = month === 0 ? 12 : month;
        const prevYear = month === 0 ? year - 1 : year;
        const dateStr = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        html += buildFullCalCell(d, dateStr, true, false, false, false, false, []);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = (firstDay + d - 1) % 7;
        const isToday = dateStr === today;
        const isPTO = ptoDays.has(dateStr);
        const isSubmitted = submittedDays.has(dateStr);
        const isWknd = dow === 0 || dow === 6;

        // Get entries for this day
        const dayEntries = [];
        Object.values(state.timesheets).forEach(entries => {
            entries.filter(e => e.date === dateStr).forEach(e => dayEntries.push(e));
        });

        html += buildFullCalCell(d, dateStr, false, isToday, isPTO, isSubmitted, isWknd, dayEntries);
    }

    // Pad remaining cells
    const totalCells = firstDay + daysInMonth;
    const remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
    for (let d = 1; d <= remaining; d++) {
        const nextMonth = month === 11 ? 1 : month + 2;
        const nextYear = month === 11 ? year + 1 : year;
        const dateStr = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        html += buildFullCalCell(d, dateStr, true, false, false, false, false, []);
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.full-cal-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', () => {
            const dateStr = cell.dataset.date;
            if (ptoDays.has(dateStr)) return;
            // Navigate to week in timesheets
            const clickedDate = new Date(dateStr + 'T00:00:00');
            state.currentWeekStart = getWeekKey(clickedDate);
            showView('timesheets');
        });
    });
}

function buildFullCalCell(d, dateStr, otherMonth, isToday, isPTO, isSubmitted, isWknd, entries) {
    let cls = 'full-cal-cell';
    if (otherMonth) cls += ' other-month';
    if (isToday) cls += ' today';
    else if (isPTO) cls += ' pto-cell';
    else if (isSubmitted && !isWknd) cls += ' submitted-cell';
    else if (isWknd) cls += ' weekend-cell';

    const chips = entries.slice(0, 2).map(e =>
        `<div class="full-cal-entry-chip">${escHtml(e.project || 'Entry')}</div>`
    ).join('');
    const moreText = entries.length > 2 ? `<div style="font-size:10px;color:var(--text-muted)">+${entries.length - 2} more</div>` : '';

    return `<div class="${cls}" data-date="${dateStr}">
        <div class="full-cal-date">${d}</div>
        <div class="full-cal-entries">${chips}${moreText}</div>
    </div>`;
}

/* ========== REPORTS ========== */
function renderReports() {
    const allEntries = Object.entries(state.timesheets).flatMap(([wk, entries]) =>
        entries.map(e => ({ ...e, weekKey: wk }))
    );

    // KPI for reports
    const totalHrs = getTotalHours(allEntries);
    const billHrs = getBillableHours(allEntries);
    const billPct = totalHrs > 0 ? Math.round((billHrs / totalHrs) * 100) : 0;
    const ptoUsed = getTotalPTOUsed();
    const curEntries = getCurrentEntries();
    const overtime = Math.max(0, getTotalHours(curEntries) - (state.settings.overtimeThreshold || 40));

    document.getElementById('reports-kpi').innerHTML = `
        <div class="kpi-card"><div class="kpi-icon-wrap kpi-blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="kpi-body"><div class="kpi-value">${totalHrs.toFixed(1)}</div><div class="kpi-label">Total Hours (All)</div></div></div>
        <div class="kpi-card"><div class="kpi-icon-wrap kpi-green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="kpi-body"><div class="kpi-value">${billPct}%</div><div class="kpi-label">Billable Overall</div></div></div>
        <div class="kpi-card"><div class="kpi-icon-wrap kpi-purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div><div class="kpi-body"><div class="kpi-value">${ptoUsed.toFixed(1)} hrs</div><div class="kpi-label">PTO Used YTD</div></div></div>
        <div class="kpi-card"><div class="kpi-icon-wrap kpi-orange"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="kpi-body"><div class="kpi-value">${overtime.toFixed(1)} hrs</div><div class="kpi-label">Overtime (This Week)</div></div></div>
    `;

    // Weekly chart
    renderWeeklyChart(allEntries);

    // Project chart
    renderProjectChart(allEntries);

    // Detailed table
    renderReportTable(allEntries);

    // Populate project filter
    const projectFilter = document.getElementById('report-project-filter');
    const allProjects = [...new Set(allEntries.map(e => e.project).filter(Boolean))];
    const current = projectFilter.value;
    projectFilter.innerHTML = '<option value="">All Projects</option>' +
        allProjects.map(p => `<option value="${escHtml(p)}" ${p === current ? 'selected' : ''}>${escHtml(p)}</option>`).join('');
}

function renderWeeklyChart(allEntries) {
    const container = document.getElementById('chart-weekly');
    const weekMap = {};

    allEntries.forEach(e => {
        if (!e.weekKey) return;
        weekMap[e.weekKey] = (weekMap[e.weekKey] || 0) + (parseFloat(e.hours) || 0);
    });

    const weeks = Object.keys(weekMap).sort().slice(-8);
    if (!weeks.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No data to display</div>';
        return;
    }

    const data = weeks.map(w => ({ label: w.slice(5), value: weekMap[w] }));
    container.innerHTML = renderBarChart(data, 'Hours', '#2563EB');
}

function renderProjectChart(allEntries) {
    const container = document.getElementById('chart-project');
    const projMap = {};

    allEntries.forEach(e => {
        if (!e.project) return;
        projMap[e.project] = (projMap[e.project] || 0) + (parseFloat(e.hours) || 0);
    });

    const projects = Object.entries(projMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!projects.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No data to display</div>';
        return;
    }

    const colors = ['#2563EB','#16A34A','#7C3AED','#EA580C','#0891B2','#DB2777','#65A30D','#DC2626'];
    const data = projects.map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
    container.innerHTML = renderBarChart(data, 'Hours', null);
}

function renderBarChart(data, yLabel, defaultColor) {
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barW = 36;
    const barGap = 10;
    const chartH = 160;
    const paddingLeft = 40;
    const paddingBottom = 40;
    const paddingTop = 20;
    const totalW = data.length * (barW + barGap) + paddingLeft + 20;

    let bars = '';
    data.forEach((d, i) => {
        const x = paddingLeft + i * (barW + barGap);
        const barH = Math.max(2, (d.value / maxVal) * chartH);
        const y = paddingTop + (chartH - barH);
        const color = d.color || defaultColor || '#2563EB';
        const label = d.label.length > 8 ? d.label.slice(0, 8) + '…' : d.label;

        bars += `
            <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="3" class="chart-bar"/>
            <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" class="bar-value">${d.value.toFixed(1)}</text>
            <text x="${x + barW / 2}" y="${paddingTop + chartH + 14}" text-anchor="middle" class="bar-label">${escHtml(label)}</text>
        `;
    });

    // Y-axis gridlines
    let grid = '';
    for (let i = 0; i <= 4; i++) {
        const yPos = paddingTop + (chartH / 4) * i;
        const val = maxVal - (maxVal / 4) * i;
        grid += `
            <line x1="${paddingLeft - 5}" y1="${yPos}" x2="${totalW - 10}" y2="${yPos}" stroke="var(--border)" stroke-width="1"/>
            <text x="${paddingLeft - 8}" y="${yPos + 4}" text-anchor="end" class="bar-label">${val.toFixed(0)}</text>
        `;
    }

    return `<svg viewBox="0 0 ${totalW} ${paddingTop + chartH + paddingBottom}" class="chart-svg" style="min-width:${totalW}px;height:${paddingTop + chartH + paddingBottom}px">
        ${grid}
        ${bars}
    </svg>`;
}

function renderReportTable(allEntries) {
    const container = document.getElementById('report-table-container');
    const search = (document.getElementById('report-search')?.value || '').toLowerCase();
    const projectFilter = document.getElementById('report-project-filter')?.value || '';

    let entries = [...allEntries];
    if (search) {
        entries = entries.filter(e =>
            (e.project || '').toLowerCase().includes(search) ||
            (e.notes || '').toLowerCase().includes(search) ||
            (e.date || '').includes(search)
        );
    }
    if (projectFilter) entries = entries.filter(e => e.project === projectFilter);
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (!entries.length) {
        container.innerHTML = '<div class="empty-state" style="padding:32px">No matching entries</div>';
        return;
    }

    container.innerHTML = `<table class="report-table">
        <thead>
            <tr>
                <th>Date</th><th>Project</th><th>Start</th><th>End</th>
                <th>Break</th><th>Hours</th><th>Billable</th><th>Notes</th>
            </tr>
        </thead>
        <tbody>
            ${entries.map(e => `
                <tr>
                    <td>${e.date || '—'}</td>
                    <td>${escHtml(e.project || '—')}</td>
                    <td>${formatTime(e.startTime) || '—'}</td>
                    <td>${formatTime(e.endTime) || '—'}</td>
                    <td>${e.breakMin || 0} min</td>
                    <td><strong>${(parseFloat(e.hours) || 0).toFixed(2)}</strong></td>
                    <td>${e.billable ? '✓' : ''}</td>
                    <td>${escHtml(e.notes || '')}</td>
                </tr>
            `).join('')}
        </tbody>
        <tfoot>
            <tr style="background:var(--bg)">
                <td colspan="5" style="padding:10px 14px;font-weight:600;color:var(--text-secondary);font-size:12px">Total (${entries.length} entries)</td>
                <td style="padding:10px 14px;font-weight:700;font-size:15px">${getTotalHours(entries).toFixed(1)}</td>
                <td colspan="2"></td>
            </tr>
        </tfoot>
    </table>`;
}

/* ========== SETTINGS ========== */
function renderSettings() {
    const s = state.settings;
    document.getElementById('setting-username').value = s.username || '';
    document.getElementById('setting-weekly-hours').value = s.weeklyHours || 40;
    document.getElementById('setting-overtime').value    = s.overtimeThreshold  || 40;
    document.getElementById('setting-util-target').value = s.utilizationTarget  || 80;
    document.getElementById('setting-time-format').value = s.timeFormat || '12h';
    _renderHolidayList();
    renderPTOAllowancesEditor();
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeVal === s.theme);
    });
    renderProjectListEditor();
}

function saveSettings() {
    const username          = document.getElementById('setting-username').value.trim() || 'John Doe';
    const weeklyHours       = parseInt(document.getElementById('setting-weekly-hours').value) || 40;
    const overtimeThreshold  = parseInt(document.getElementById('setting-overtime').value)    || 40;
    const utilizationTarget  = parseInt(document.getElementById('setting-util-target').value) || 80;
    const timeFormat         = document.getElementById('setting-time-format').value;

    // PTO allowances are saved immediately by the allowances editor
    // projects are saved immediately by the project list editor
    state.settings = { ...state.settings, username, weeklyHours, overtimeThreshold, utilizationTarget, timeFormat };
    saveState();
    applySettings();
    showToast('Settings saved', 'success');
}

function _renderHolidayList() {
    const container = document.getElementById('holiday-list');
    if (!container) return;
    const holidays = (state.settings.holidays || []).slice().sort();
    if (!holidays.length) {
        container.innerHTML = '<div style="padding:8px 0 4px;color:var(--text-muted);font-size:13px">No holidays added yet.</div>';
        return;
    }
    container.innerHTML = holidays.map(d => {
        const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        return `<div class="holiday-item">
            <span class="holiday-date">${label}</span>
            <button class="btn btn-icon btn-sm" data-holiday="${d}" title="Remove">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>`;
    }).join('');
    container.querySelectorAll('[data-holiday]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.settings.holidays = state.settings.holidays.filter(d => d !== btn.dataset.holiday);
            saveState();
            _renderHolidayList();
        });
    });
}

/* ========== PROJECT LIST EDITOR ========== */

function renderProjectListEditor() {
    const container = document.getElementById('project-list-editor');
    if (!container) return;
    const projects = state.settings.projects || [];

    container.innerHTML = `
        <ul class="proj-list" id="proj-list">
            ${projects.map((p, i) => {
                const name     = typeof p === 'string' ? p : p.name;
                const billable = typeof p === 'string' ? true  : p.billable !== false;
                const holiday  = typeof p === 'string' ? false : p.holiday  === true;
                return `
                <li class="proj-item" draggable="true" data-index="${i}">
                    <span class="proj-drag" title="Drag to reorder">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9"  cy="5"  r="1" fill="currentColor"/>
                            <circle cx="15" cy="5"  r="1" fill="currentColor"/>
                            <circle cx="9"  cy="12" r="1" fill="currentColor"/>
                            <circle cx="15" cy="12" r="1" fill="currentColor"/>
                            <circle cx="9"  cy="19" r="1" fill="currentColor"/>
                            <circle cx="15" cy="19" r="1" fill="currentColor"/>
                        </svg>
                    </span>
                    <span class="proj-name" data-index="${i}">${escHtml(name)}</span>
                    <input class="proj-edit-input hidden" type="text" value="${escHtml(name)}" data-index="${i}" maxlength="80">
                    <button class="proj-billable-btn ${billable ? 'is-billable' : 'is-nonbillable'}" data-index="${i}" title="Toggle billable">
                        ${billable ? 'Billable' : 'Non-billable'}
                    </button>
                    <button class="proj-holiday-btn ${holiday ? 'is-holiday' : ''}" data-index="${i}" title="Toggle holiday (excluded from utilization)">
                        🏖 Holiday
                    </button>
                    <button class="proj-del-btn" data-index="${i}" title="Remove">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </li>`;
            }).join('')}
        </ul>
        <div class="proj-add-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <input type="text" id="proj-new-input" class="proj-new-input" placeholder="Add a project…" maxlength="80">
        </div>
    `;

    // Click name to edit
    container.querySelectorAll('.proj-name').forEach(span => {
        span.addEventListener('click', () => startEditProject(parseInt(span.dataset.index)));
    });

    // Edit input events
    container.querySelectorAll('.proj-edit-input').forEach(inp => {
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); commitEditProject(parseInt(inp.dataset.index), inp.value); }
            if (e.key === 'Escape') { renderProjectListEditor(); }
        });
        inp.addEventListener('blur', () => commitEditProject(parseInt(inp.dataset.index), inp.value));
    });

    // Billable toggle
    container.querySelectorAll('.proj-billable-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const p = state.settings.projects[idx];
            if (typeof p === 'string') state.settings.projects[idx] = { name: p, billable: false };
            else p.billable = !p.billable;
            saveState();
            renderProjectListEditor();
        });
    });

    // Holiday toggle
    container.querySelectorAll('.proj-holiday-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const p = state.settings.projects[idx];
            if (typeof p === 'string') state.settings.projects[idx] = { name: p, billable: true, holiday: true };
            else p.holiday = !p.holiday;
            saveState();
            renderProjectListEditor();
        });
    });

    // Delete buttons
    container.querySelectorAll('.proj-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.settings.projects.splice(parseInt(btn.dataset.index), 1);
            saveState();
            renderProjectListEditor();
            showToast('Project removed', 'success');
        });
    });

    // Add new project
    const newInput = container.querySelector('#proj-new-input');
    const commitAdd = () => {
        const val = newInput.value.trim();
        if (!val) return;
        if (getProjectNames().includes(val)) {
            showToast('Project already exists', 'warning');
            newInput.value = '';
            return;
        }
        state.settings.projects.push({ name: val, billable: true });
        saveState();
        renderProjectListEditor();
        setTimeout(() => document.getElementById('proj-new-input')?.focus(), 50);
        showToast(`"${val}" added`, 'success');
    };
    newInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitAdd(); } });
    newInput.addEventListener('blur', commitAdd);

    setupProjectDrag(container);
}

function startEditProject(index) {
    const container = document.getElementById('project-list-editor');
    const item = container.querySelector(`li[data-index="${index}"]`);
    item.querySelector('.proj-name').classList.add('hidden');
    const inp = item.querySelector('.proj-edit-input');
    inp.classList.remove('hidden');
    inp.focus();
    inp.select();
}

function commitEditProject(index, value) {
    const trimmed = value.trim();
    const projects = state.settings.projects || [];
    if (index >= projects.length) return;
    const currentName = typeof projects[index] === 'string' ? projects[index] : projects[index].name;
    if (!trimmed || trimmed === currentName) { renderProjectListEditor(); return; }
    if (typeof projects[index] === 'string') {
        projects[index] = { name: trimmed, billable: true };
    } else {
        projects[index].name = trimmed;
    }
    saveState();
    renderProjectListEditor();
}

function setupProjectDrag(container) {
    const list = container.querySelector('#proj-list');
    if (!list) return;
    let dragIdx = null;

    list.querySelectorAll('.proj-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            dragIdx = parseInt(item.dataset.index);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('drag-active');
        });
        item.addEventListener('dragend',  () => {
            item.classList.remove('drag-active');
            list.querySelectorAll('.proj-item').forEach(i => i.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.proj-item').forEach(i => i.classList.remove('drag-over'));
            item.classList.add('drag-over');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            const dropIdx = parseInt(item.dataset.index);
            if (dragIdx === null || dragIdx === dropIdx) return;
            const moved = state.settings.projects.splice(dragIdx, 1)[0];
            state.settings.projects.splice(dropIdx, 0, moved);
            saveState();
            renderProjectListEditor();
        });
    });
}

/* ========== PTO ALLOWANCES EDITOR ========== */

function renderPTOAllowancesEditor() {
    const container = document.getElementById('pto-allowances-editor');
    if (!container) return;
    const types = getPTOTypes();

    container.innerHTML = `
        <ul class="proj-list" id="pto-type-list">
            ${types.map((t, i) => {
                const color = PTO_PALETTE[i % PTO_PALETTE.length].fill;
                return `
                <li class="proj-item pto-allowance-item" data-index="${i}">
                    <span class="pto-type-dot" style="background:${color}"></span>
                    <span class="proj-name pto-type-name" data-index="${i}">${escHtml(t.name)}</span>
                    <input class="proj-edit-input hidden pto-name-input" type="text" value="${escHtml(t.name)}" data-index="${i}" maxlength="40">
                    <div class="pto-hrs-wrap">
                        <input type="number" class="pto-hrs-input" value="${t.total || 0}" min="0" max="9999" step="0.5" data-index="${i}">
                        <span class="pto-hrs-label">hrs/yr</span>
                    </div>
                    <select class="pto-link-select" data-index="${i}" title="Track used hours from timesheet project">
                        <option value="">From requests</option>
                        ${getProjectNames().map(n => `<option value="${escHtml(n)}" ${t.linkedProject === n ? 'selected' : ''}>${escHtml(n)}</option>`).join('')}
                    </select>
                    <button class="proj-del-btn pto-del-btn" data-index="${i}" title="Remove">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </li>`;
            }).join('')}
        </ul>
        <div class="proj-add-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <input type="text" id="pto-new-name" class="proj-new-input" placeholder="Add PTO type (e.g. Sick Leave)…" maxlength="40">
        </div>
    `;

    // Click name to edit
    container.querySelectorAll('.pto-type-name').forEach(span => {
        span.addEventListener('click', () => {
            const idx = parseInt(span.dataset.index);
            span.classList.add('hidden');
            const inp = container.querySelector(`.pto-name-input[data-index="${idx}"]`);
            inp.classList.remove('hidden');
            inp.focus(); inp.select();
        });
    });

    // Name input commit
    container.querySelectorAll('.pto-name-input').forEach(inp => {
        const commit = () => {
            const idx = parseInt(inp.dataset.index);
            const t = getPTOTypes()[idx];
            if (!t) return;
            const val = inp.value.trim();
            if (val && val !== t.name) { t.name = val; saveState(); }
            renderPTOAllowancesEditor();
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') renderPTOAllowancesEditor(); });
        inp.addEventListener('blur', commit);
    });

    // Linked project dropdown
    container.querySelectorAll('.pto-link-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const t = getPTOTypes()[parseInt(sel.dataset.index)];
            if (!t) return;
            t.linkedProject = sel.value || undefined;
            saveState();
        });
    });

    // Hours input — save on change
    container.querySelectorAll('.pto-hrs-input').forEach(inp => {
        inp.addEventListener('change', () => {
            const idx = parseInt(inp.dataset.index);
            const t = getPTOTypes()[idx];
            if (!t) return;
            t.total = parseFloat(inp.value) || 0;
            saveState();
        });
    });

    // Delete
    container.querySelectorAll('.pto-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            showConfirm('Remove PTO Type', `Remove "${getPTOTypes()[idx]?.name}"? Existing requests are kept.`, () => {
                state.pto.types.splice(idx, 1);
                saveState();
                renderPTOAllowancesEditor();
                showToast('PTO type removed', 'success');
            });
        });
    });

    // Add new type
    const addInput = container.querySelector('#pto-new-name');
    const commitAdd = () => {
        const val = addInput.value.trim();
        if (!val) return;
        if (getPTOTypes().some(t => t.name.toLowerCase() === val.toLowerCase())) {
            showToast('That PTO type already exists', 'warning');
            addInput.value = '';
            return;
        }
        const key = val.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
        state.pto.types.push({ key, name: val, total: 0, used: 0 });
        saveState();
        renderPTOAllowancesEditor();
        setTimeout(() => document.getElementById('pto-new-name')?.focus(), 50);
        showToast(`"${val}" added — set hours/yr above`, 'success');
    };
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitAdd(); } });
    addInput.addEventListener('blur', commitAdd);
}

function applySettings() {
    const s = state.settings;
    document.documentElement.setAttribute('data-theme', s.theme || 'light');
    document.getElementById('user-name').textContent = s.username || 'John Doe';
    document.getElementById('user-avatar').textContent = initials(s.username);

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeVal === s.theme);
    });
}

/* ========== EXCEL EXPORT ========== */

function exportExcel() {
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded — check your internet connection', 'error');
        return;
    }
    const wb = XLSX.utils.book_new();
    buildTimesheetSheet(wb);
    buildPTOSheet(wb);
    buildSettingsSheet(wb);
    const filename = `timesheet-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('Excel file exported', 'success');
}

function buildTimesheetSheet(wb) {
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const fmtDate = d => `${d.getDate()}-${MON[d.getMonth()]}`;

    // Monday of a given date's week
    const getMondayOf = dateStr => {
        const d = new Date(dateStr + 'T00:00:00');
        const dow = d.getDay();
        d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        return d;
    };

    // Collect date → project → hours across all weeks
    const dateMap = {}; // { 'YYYY-MM-DD': { projectName: hours } }
    Object.values(state.timesheets).forEach(rows => {
        rows.forEach(row => {
            if (!row.project) return;
            Object.entries(row.hours || {}).forEach(([date, hrs]) => {
                const h = parseFloat(hrs) || 0;
                if (h <= 0) return;
                if (!dateMap[date]) dateMap[date] = {};
                dateMap[date][row.project] = (dateMap[date][row.project] || 0) + h;
            });
        });
    });

    const sortedDates = Object.keys(dateMap).sort();

    if (!sortedDates.length) {
        const ws = XLSX.utils.aoa_to_sheet([['No timesheet data recorded.']]);
        XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
        return;
    }

    // Build ordered project list: settings order first, then any extras
    const settingsNames = getProjectNames();
    const allUsed = [...new Set(Object.values(dateMap).flatMap(d => Object.keys(d)))];
    const projects = [
        ...settingsNames.filter(p => allUsed.includes(p)),
        ...allUsed.filter(p => !settingsNames.includes(p))
    ];

    // Header row
    const header = ['Week Of', 'Date', ...projects.map(p => getProjectBillable(p) ? `[BILLABLE] ${p}` : p)];

    // Data rows — one per date
    const dataRows = sortedDates.map(date => {
        const d       = new Date(date + 'T00:00:00');
        const monday  = getMondayOf(date);
        const row     = [fmtDate(monday), fmtDate(d)];
        projects.forEach(p => {
            const h = dateMap[date]?.[p] || 0;
            row.push(h > 0 ? h : '');
        });
        return row;
    });

    // Add a Notes column to every data row
    const noteHeader = [...header, 'Notes'];
    const noteDataRows = dataRows.map((row, i) => {
        const date = sortedDates[i];
        return [...row, state.dailyNotes[date] || ''];
    });

    const ws = XLSX.utils.aoa_to_sheet([noteHeader, ...noteDataRows]);
    ws['!cols'] = [
        { wch: 10 }, { wch: 10 },
        ...projects.map(p => ({ wch: Math.max(14, p.length + 4) })),
        { wch: 40 }  // Notes column
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
}

function buildPTOSheet(wb) {
    const types = getPTOTypes();
    const today = _today();

    // Section 1 — Balances
    const balanceRows = types.map(t => {
        const sub  = getPTOSubmittedByType(t.key);
        const plan = getPTOPlannedByType(t.key);
        const rem  = Math.max(0, (t.total || 0) - sub - plan);
        return [t.name, t.key, t.linkedProject || '', t.total, sub, plan, sub + plan, rem];
    });

    // Section 2 — History (all PTO days from timesheet, sorted newest first)
    const linkedProjects = types.map(t => t.linkedProject).filter(Boolean);
    const historyRows = [];
    Object.entries(state.timesheets).forEach(([, weekRows]) => {
        (weekRows || []).forEach(r => {
            if (!linkedProjects.includes(r.project)) return;
            Object.entries(r.hours || {}).forEach(([d, h]) => {
                const hrs = parseFloat(h) || 0;
                if (hrs <= 0) return;
                const typeObj = types.find(t => t.linkedProject === r.project);
                historyRows.push([
                    d,
                    typeObj ? typeObj.name : r.project,
                    hrs,
                    d <= today ? 'Submitted' : 'Planned',
                    state.dailyNotes[d] || ''
                ]);
            });
        });
    });
    historyRows.sort((a, b) => b[0].localeCompare(a[0]));

    const data = [
        ['PTO BALANCES'],
        [],
        ['Type', 'Key', 'Linked Project', 'Total Hours', 'Submitted', 'Planned', 'Total Used', 'Remaining'],
        ...balanceRows,
        [],
        [],
        ['PTO HISTORY'],
        [],
        ['Date', 'Type', 'Hours', 'Status', 'Notes'],
        ...(historyRows.length ? historyRows : [['No PTO hours logged yet.']]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, 'PTO');
}

function buildSettingsSheet(wb) {
    const s = state.settings;
    const data = [
        ['SETTINGS'],
        [],
        ['Setting', 'Value'],
        ['Username',           s.username],
        ['Weekly Hours',       s.weeklyHours],
        ['Overtime Threshold',  s.overtimeThreshold],
        ['Utilization Target', s.utilizationTarget || 80],
        ['Time Format',        s.timeFormat === '12h' ? '12-hour (AM/PM)' : '24-hour'],
        ['Theme',              s.theme === 'dark' ? 'Dark' : 'Light'],
        ['Projects',           (s.projects || []).map(p => typeof p === 'string' ? p : p.name).join(', ')],
        ['ProjectsBillable',   (s.projects || []).map(p => typeof p === 'string' ? '1' : (p.billable !== false ? '1' : '0')).join(',')],
        [],
        ['Data Version', DATA_VERSION],
        ['Exported At',  new Date().toISOString()]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 22 }, { wch: 44 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Settings');
}

/* ========== EXCEL IMPORT ========== */

function processImportFile(file) {
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded — check your internet connection', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheets = wb.SheetNames;

            if (!sheets.includes('Timesheet') && !sheets.includes('Settings') && !sheets.includes('PTO')) {
                throw new Error('This does not look like a valid export file (missing expected sheets)');
            }

            // Count rows for summary
            let dataRows = 0, weekSet = new Set();
            if (sheets.includes('Timesheet')) {
                const tsRows = XLSX.utils.sheet_to_json(wb.Sheets['Timesheet'], { header: 1, defval: '' });
                if (tsRows.length > 1) {
                    const hdr = tsRows[0].map(c => String(c ?? '').trim());
                    const dateIdx = hdr.indexOf('Date');
                    const weekOfIdx = hdr.indexOf('Week Of');
                    tsRows.slice(1).forEach(r => {
                        if (!r[dateIdx >= 0 ? dateIdx : 1]) return;
                        dataRows++;
                        const wk = r[weekOfIdx >= 0 ? weekOfIdx : 0];
                        if (wk) weekSet.add(String(wk));
                    });
                }
            }

            state.pendingImportData = wb;
            document.getElementById('import-filename').textContent = file.name;
            document.getElementById('import-summary').textContent =
                `Sheets: ${sheets.join(', ')}  ·  ${weekSet.size} week(s)  ·  ${dataRows} day row(s)`;
            document.getElementById('import-preview').classList.remove('hidden');
            document.getElementById('import-confirm').classList.remove('hidden');
            document.getElementById('drop-zone').classList.add('hidden');
        } catch (err) {
            showToast('Failed to read file: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function performImport() {
    const wb = state.pendingImportData;
    if (!wb) return;

    try {
        const newTimesheets = {};
        const newPTO = structuredClone(DEFAULT_PTO);
        const newSettings = { ...DEFAULT_SETTINGS };
        state.dailyNotes = {};   // clear before import

        if (wb.SheetNames.includes('Timesheet')) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Timesheet'], { header: 1, defval: '' });
            parseTimesheetSheet(rows, newTimesheets);
        }
        if (wb.SheetNames.includes('PTO')) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['PTO'], { header: 1, defval: '' });
            parsePTOSheet(rows, newPTO);
        }
        if (wb.SheetNames.includes('Settings')) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Settings'], { header: 1, defval: '' });
            parseSettingsSheet(rows, newSettings);
        }

        // Reconstruct project objects from the two parallel arrays stored in the sheet
        if (newSettings._projectNames) {
            const billableFlags = newSettings._projectBillable || [];
            newSettings.projects = newSettings._projectNames.map((name, i) => ({
                name, billable: billableFlags[i] !== '0'
            }));
            delete newSettings._projectNames;
            delete newSettings._projectBillable;
        }

        state.timesheets = newTimesheets;
        state.pto = newPTO;
        state.settings = { ...DEFAULT_SETTINGS, ...newSettings };
        saveVersion();
        saveState();
        applySettings();
        hideModal('import-modal');
        showView(state.currentView);
        showToast('Excel data imported successfully', 'success');
        state.pendingImportData = null;
    } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
    }
}

function parseTimesheetSheet(rows, newTimesheets) {
    if (!rows.length) return;
    const header0 = rows[0].map(c => String(c ?? '').trim());

    // Flat format: header row contains a 'Date' column (may be first or second)
    if (header0.includes('Date')) {
        const header    = header0;
        const dateIdx   = header.indexOf('Date');
        const weekOfIdx = header.indexOf('Week Of');
        // Project columns start after both Date and Week Of columns
        const lastMeta  = Math.max(dateIdx, weekOfIdx);
        const projStart = lastMeta >= 0 ? lastMeta + 1 : 1;

        // Non-project metadata columns that may appear after the project columns
        const META_COLS = new Set(['Notes', 'Week Of', 'Date']);

        // Strip [BILLABLE] prefix; keep original indices so row[projStart + i] stays valid
        const projCols = header.slice(projStart).map(h => {
            const clean = h.replace(/^\[BILLABLE\]\s*/i, '').trim();
            return META_COLS.has(clean) ? null : clean; // null = skip this column
        });

        const MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
        const parseDate = str => {
            // Handles Excel numeric serial, "25-May", "May 25, 2026", or ISO string
            if (typeof str === 'number') {
                // Excel serial → UTC date (avoid TZ shift by working in UTC)
                const ms = Math.round((str - 25569) * 86400000);
                const d  = new Date(ms);
                const y  = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, dy = d.getUTCDate();
                return `${y}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
            }
            const s = String(str).trim();
            // "28-May" or "28-May-2026"
            const m1 = s.match(/^(\d+)-([A-Za-z]+)(?:-(\d{4}))?$/);
            if (m1) {
                const year = m1[3] ? parseInt(m1[3]) : new Date().getFullYear();
                return `${year}-${String((MON[m1[2]] ?? 0) + 1).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
            }
            // ISO "2026-05-28" already
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            // Try JS Date parse as last resort
            const d2 = new Date(s);
            if (!isNaN(d2)) return d2.toISOString().split('T')[0];
            return s;
        };

        const notesColIdx = header.indexOf('Notes');

        rows.slice(1).forEach(row => {
            const rawDate = dateIdx >= 0 ? row[dateIdx] : row[1]; // Date column
            if (!rawDate) return;
            const dateStr = parseDate(rawDate);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

            // Restore day note if present
            if (notesColIdx >= 0) {
                const note = String(row[notesColIdx] || '').trim();
                if (note) state.dailyNotes[dateStr] = note;
            }

            const weekKey = getWeekKey(new Date(dateStr + 'T00:00:00'));
            if (!newTimesheets[weekKey]) newTimesheets[weekKey] = [];

            projCols.forEach((proj, i) => {
                if (!proj) return;
                const hrs = parseFloat(row[projStart + i]) || 0;

                let gridRow = newTimesheets[weekKey].find(r => r.project === proj);
                if (!gridRow) {
                    const weekDates = getWeekDates(new Date(weekKey + 'T00:00:00'));
                    const hours = {};
                    weekDates.forEach(d => { hours[d] = 0; });
                    gridRow = { id: generateId(), project: proj, hours, billable: getProjectBillable(proj), notes: '' };
                    newTimesheets[weekKey].push(gridRow);
                }
                if (hrs > 0) gridRow.hours[dateStr] = (gridRow.hours[dateStr] || 0) + hrs;
            });
        });

        // Second pass: ensure every week has a row for every project in the header,
        // even if that project had zero hours for every day of that week.
        Object.keys(newTimesheets).forEach(weekKey => {
            const weekDates = getWeekDates(new Date(weekKey + 'T00:00:00'));
            projCols.forEach(proj => {
                if (!proj) return;
                if (!newTimesheets[weekKey].find(r => r.project === proj)) {
                    const hours = {};
                    weekDates.forEach(d => { hours[d] = 0; });
                    newTimesheets[weekKey].push({ id: generateId(), project: proj, hours, billable: getProjectBillable(proj), notes: '' });
                }
            });
        });
        return;
    }

    // Legacy WEEKKEY format (backwards compat)
    const weekKeyRe = /\[WEEKKEY:(\d{4}-\d{2}-\d{2})\]/;
    let weekKey = null, weekDates = [], inData = false;
    rows.forEach(row => {
        const first = String(row[0] ?? '').trim();
        const m = first.match(weekKeyRe);
        if (m) { weekKey = m[1]; weekDates = getWeekDates(new Date(weekKey + 'T00:00:00')); inData = false; return; }
        if (!weekKey) return;
        if (first === 'Project') { inData = true; return; }
        if (!first || first === 'DAILY TOTAL') { if (!first) inData = false; return; }
        if (!inData) return;
        const hours = {};
        weekDates.forEach((d, i) => { hours[d] = parseFloat(row[i + 2]) || 0; });
        if (!newTimesheets[weekKey]) newTimesheets[weekKey] = [];
        newTimesheets[weekKey].push({ id: generateId(), project: first, billable: String(row[1]??'').toLowerCase() !== 'no', hours, notes: '' });
    });
}

function parsePTOSheet(rows, newPTO) {
    let section = null, headerSeen = false;
    newPTO.types = [];

    rows.forEach(row => {
        const first = String(row[0] ?? '').trim();
        if (first === 'PTO BALANCES') { section = 'balances'; headerSeen = false; return; }
        if (first === 'PTO HISTORY')  { section = 'history';  headerSeen = false; return; }
        if (first === 'Type')         { headerSeen = true; return; }
        if (!first || !headerSeen)    return;

        if (section === 'balances') {
            const name          = first;
            const key           = String(row[1] || name.toLowerCase().replace(/\s+/g, '_'));
            const linkedProject = String(row[2] || '').trim() || undefined;
            const total         = parseFloat(row[3]) || 0;
            newPTO.types.push({ key, name, total, ...(linkedProject ? { linkedProject } : {}) });
        }
        // History rows are derived from the timesheet, so we don't need to re-import them
    });

    if (!newPTO.types.length) newPTO.types = DEFAULT_PTO.types.map(t => ({ ...t }));
}

function parseSettingsSheet(rows, newSettings) {
    let inData = false;
    rows.forEach(row => {
        const key = String(row[0] ?? '').trim();
        const val = String(row[1] ?? '').trim();
        if (key === 'Setting') { inData = true; return; }
        if (!inData || !key || ['SETTINGS','Data Version','Exported At'].includes(key)) return;
        if (key === 'Username')           newSettings.username = val;
        else if (key === 'Weekly Hours')       newSettings.weeklyHours = parseInt(val) || 40;
        else if (key === 'Overtime Threshold')  newSettings.overtimeThreshold  = parseInt(val) || 40;
        else if (key === 'Utilization Target')  newSettings.utilizationTarget  = parseInt(val) || 80;
        else if (key === 'Time Format')        newSettings.timeFormat = val.includes('24') ? '24h' : '12h';
        else if (key === 'Theme')              newSettings.theme = val.toLowerCase().includes('dark') ? 'dark' : 'light';
        else if (key === 'Projects')           newSettings._projectNames = val.split(',').map(p => p.trim()).filter(Boolean);
        else if (key === 'ProjectsBillable')   newSettings._projectBillable = val.split(',');

    });
}

/* ========== TOAST NOTIFICATIONS ========== */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
        info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = (icons[type] || icons.info) + `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 280);
    }, 3500);
}

/* ========== MODALS ========== */
function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function showConfirm(title, message, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    state.confirmedCallback = callback;
    showModal('confirm-modal');
}

/* ========== WEEK NAVIGATION ========== */
function navigateWeek(delta) {
    const d = new Date(state.currentWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    state.currentWeekStart = d.toISOString().split('T')[0];

    // Sync mini calendar to show relevant month
    state.miniCalDate = new Date(state.currentWeekStart + 'T00:00:00');

    if (state.currentView === 'timesheets') {
        renderTimesheetTable();
        renderMiniCalendar();
    }
    if (state.currentView === 'dashboard') renderDashboard();
    updatePayPeriodLabel();
}

function goToToday() {
    state.currentWeekStart = getWeekKey(new Date());
    state.miniCalDate = new Date();
    if (state.currentView === 'timesheets') {
        renderTimesheetTable();
        renderMiniCalendar();
    }
    if (state.currentView === 'dashboard') renderDashboard();
    updatePayPeriodLabel();
}

/* ========== EVENT LISTENERS ========== */
function setupEventListeners() {
    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            showView(item.dataset.view);
            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('mobile-open');
            document.querySelector('.sidebar-overlay')?.classList.remove('visible');
        });
    });

    // Card links
    document.addEventListener('click', e => {
        const link = e.target.closest('.card-link[data-view]');
        if (link) { e.preventDefault(); showView(link.dataset.view); }
    });

    // Sidebar collapse
    document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('ts_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    });

    // Mobile menu
    const mobileBtn = document.getElementById('mobile-menu-btn');
    mobileBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('mobile-open');
        document.querySelector('.sidebar-overlay')?.classList.add('visible');
    });

    // Sidebar overlay (mobile)
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('mobile-open');
        overlay.classList.remove('visible');
    });

    // Week navigation
    document.getElementById('btn-prev-week').addEventListener('click', () => navigateWeek(-1));
    document.getElementById('btn-next-week').addEventListener('click', () => navigateWeek(1));
    document.getElementById('btn-today').addEventListener('click', goToToday);

    // Add entry
    document.getElementById('btn-add-entry').addEventListener('click', () => {
        showView('timesheets');
        setTimeout(addRow, 50);
    });

    // Add row
    document.getElementById('btn-add-row').addEventListener('click', () => addRow());

    // Copy from week
    document.getElementById('btn-copy-week').addEventListener('click', openCopyWeekModal);

    // Export
    document.getElementById('btn-export').addEventListener('click', exportExcel);
    document.getElementById('settings-export').addEventListener('click', exportExcel);

    // Import
    document.getElementById('btn-import').addEventListener('click', () => showModal('import-modal'));
    document.getElementById('settings-import').addEventListener('click', () => showModal('import-modal'));

    // Drop zone
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file?.name.endsWith('.xlsx')) processImportFile(file);
        else showToast('Please drop a .xlsx file', 'error');
    });
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) processImportFile(fileInput.files[0]);
    });

    document.getElementById('import-clear-file').addEventListener('click', () => {
        state.pendingImportData = null;
        document.getElementById('import-preview').classList.add('hidden');
        document.getElementById('import-confirm').classList.add('hidden');
        document.getElementById('drop-zone').classList.remove('hidden');
        fileInput.value = '';
    });

    document.getElementById('import-confirm').addEventListener('click', performImport);
    document.getElementById('import-cancel').addEventListener('click', () => {
        hideModal('import-modal');
        state.pendingImportData = null;
        document.getElementById('import-preview').classList.add('hidden');
        document.getElementById('import-confirm').classList.add('hidden');
        document.getElementById('drop-zone').classList.remove('hidden');
    });

    document.getElementById('note-save-btn').addEventListener('click', saveNoteModal);
    document.getElementById('note-clear-btn').addEventListener('click', () => {
        document.getElementById('note-textarea').value = '';
        saveNoteModal();
    });
    // Ctrl/Cmd+Enter saves the note
    document.getElementById('note-textarea').addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNoteModal(); }
    });

    // Edit PTO panel balances
    document.getElementById('btn-edit-pto-panel').addEventListener('click', () => {
        showView('pto');
    });

    // Confirm modal
    document.getElementById('confirm-ok').addEventListener('click', () => {
        if (state.confirmedCallback) state.confirmedCallback();
        state.confirmedCallback = null;
        hideModal('confirm-modal');
    });
    document.getElementById('confirm-cancel').addEventListener('click', () => {
        state.confirmedCallback = null;
        hideModal('confirm-modal');
    });

    // Close modal buttons
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.modal) hideModal(btn.dataset.modal);
        });
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
                if (overlay.id === 'import-modal') {
                    state.pendingImportData = null;
                    document.getElementById('import-preview').classList.add('hidden');
                    document.getElementById('import-confirm').classList.add('hidden');
                    document.getElementById('drop-zone').classList.remove('hidden');
                }
            }
        });
    });

    // Settings save
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);


    // Theme toggle
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.settings.theme = btn.dataset.themeVal;
            applySettings();
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.themeVal === state.settings.theme));
        });
    });

    // Reset data
    document.getElementById('btn-reset-data').addEventListener('click', () => {
        showConfirm('Reset All Data', 'This will permanently delete ALL timesheet entries, PTO data, and settings. This cannot be undone. Are you sure?', () => {
            localStorage.clear();
            state.timesheets = {};
            state.pto = structuredClone(DEFAULT_PTO);
            state.settings = structuredClone(DEFAULT_SETTINGS);
            state.currentWeekStart = getWeekKey(new Date());
            applySettings();
            showView('timesheets');
            showToast('All data has been reset', 'warning');
        });
    });

    // Timesheet filter tabs
    document.getElementById('filter-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeFilter = tab.dataset.filter;
        renderTimesheetTable();
    });

    // Timesheet search
    document.getElementById('timesheet-search').addEventListener('input', () => {
        renderTimesheetTable();
    });

    // Table keyboard navigation (Tab to add new row)
    document.getElementById('timesheet-tbody').addEventListener('keydown', onTableKeydown);

    // Mini calendar navigation
    document.getElementById('mini-cal-prev').addEventListener('click', () => {
        state.miniCalDate = new Date(state.miniCalDate.getFullYear(), state.miniCalDate.getMonth() - 1, 1);
        renderMiniCalendar();
    });
    document.getElementById('mini-cal-next').addEventListener('click', () => {
        state.miniCalDate = new Date(state.miniCalDate.getFullYear(), state.miniCalDate.getMonth() + 1, 1);
        renderMiniCalendar();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
        }
    });

    // YTD mode toggle
    document.getElementById('ytd-mode-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;
        _ytdMode = tab.dataset.mode;
        document.querySelectorAll('#ytd-mode-tabs .filter-tab').forEach(t => t.classList.toggle('active', t === tab));
        // Update chart title
        document.querySelector('#view-dashboard .card:has(#dash-ytd-chart) h3').textContent =
            _ytdMode === 'utilization' ? 'Utilization Over Time' : 'Hours by Project';
        if (state.currentView === 'dashboard') _refreshYTDChart();
    });

    // YTD chart grain tabs
    document.getElementById('ytd-grain-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;
        _ytdGrain = tab.dataset.grain;
        document.querySelectorAll('#ytd-grain-tabs .filter-tab').forEach(t => t.classList.toggle('active', t === tab));
        if (state.currentView === 'dashboard') _refreshYTDChart();
    });

    // YTD date range
    document.getElementById('ytd-date-from').addEventListener('change', e => {
        _ytdFrom = e.target.value || null;
        if (state.currentView === 'dashboard') _refreshYTDChart();
    });
    document.getElementById('ytd-date-to').addEventListener('change', e => {
        _ytdTo = e.target.value || null;
        if (state.currentView === 'dashboard') _refreshYTDChart();
    });
    document.getElementById('ytd-range-reset').addEventListener('click', () => {
        _ytdFrom = null; _ytdTo = null;
        document.getElementById('ytd-date-from').value = '';
        document.getElementById('ytd-date-to').value   = '';
        if (state.currentView === 'dashboard') _refreshYTDChart();
    });

    // More button (show quick actions tooltip)
    document.getElementById('btn-more').addEventListener('click', () => {
        showToast('Tip: Use the sidebar to navigate between views', 'info');
    });
}

function openNoteModal(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('note-modal-title').textContent = label;
    document.getElementById('note-textarea').value = state.dailyNotes[dateStr] || '';
    document.getElementById('note-modal').dataset.date = dateStr;
    document.getElementById('note-clear-btn').style.display = state.dailyNotes[dateStr] ? '' : 'none';
    showModal('note-modal');
    setTimeout(() => document.getElementById('note-textarea').focus(), 50);
}

function saveNoteModal() {
    const dateStr = document.getElementById('note-modal').dataset.date;
    const val = document.getElementById('note-textarea').value.trim();
    if (val) state.dailyNotes[dateStr] = val;
    else delete state.dailyNotes[dateStr];
    saveState();
    hideModal('note-modal');
    // Refresh just the notes row buttons
    const weekDates = getWeekDates(new Date(state.currentWeekStart + 'T00:00:00'));
    renderTimesheetTable();
}

function openPTOModal() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pto-start').value = today;
    document.getElementById('pto-end').value = today;
    document.getElementById('pto-hours-day').value = 8;
    document.getElementById('pto-notes').value = '';
    // Populate type dropdown from dynamic types list
    const sel = document.getElementById('pto-type');
    sel.innerHTML = getPTOTypes().map(t => `<option value="${escHtml(t.key)}">${escHtml(t.name)}</option>`).join('');
    document.getElementById('pto-calc-preview').innerHTML = '';
    updatePTOCalcPreview();
    showModal('pto-modal');
}

/* ========== SEED DATA ========== */
function seedDemoData() {
    const weekKey = getWeekKey(new Date());
    if (state.timesheets[weekKey]?.length > 0) return;

    // weekDates[0]=Sun [1]=Mon [2]=Tue [3]=Wed [4]=Thu [5]=Fri [6]=Sat
    const weekDates = getWeekDates(new Date(weekKey + 'T00:00:00'));
    const names = getProjectNames();

    const makeHours = (vals) => {
        const h = {};
        weekDates.forEach((d, i) => { h[d] = vals[i] || 0; });
        return h;
    };

    state.timesheets[weekKey] = [
        { id: generateId(), project: names[0] || '', hours: makeHours([0, 8, 0, 6, 6, 8, 0]), billable: getProjectBillable(names[0]), notes: '' },
        { id: generateId(), project: names[1] || '', hours: makeHours([0, 0, 6, 2, 2, 0, 0]), billable: getProjectBillable(names[1]), notes: '' },
        { id: generateId(), project: names[2] || '', hours: makeHours([0, 0, 2, 0, 0, 0, 0]), billable: getProjectBillable(names[2]), notes: '' },
    ];
}

/* ========== INITIALIZATION ========== */
function init() {
    loadState();

    // Set current week
    state.currentWeekStart = getWeekKey(new Date());
    state.miniCalDate = new Date();
    state.fullCalDate = new Date();

    // Migrate string projects → object format
    if (state.settings.projects?.length && typeof state.settings.projects[0] === 'string') {
        state.settings.projects = state.settings.projects.map(name => ({ name, billable: true }));
    }

    // Migrate old fixed vacation/sick/floating keys → types array
    if (state.pto.vacation !== undefined && !state.pto.types) {
        const types = [];
        if ((state.pto.vacation?.total || 0) > 0)
            types.push({ key: 'vacation', name: 'Vacation', total: state.pto.vacation.total, used: state.pto.vacation.used || 0 });
        if ((state.pto.sick?.total || 0) > 0)
            types.push({ key: 'sick', name: 'Sick Leave', total: state.pto.sick.total, used: state.pto.sick.used || 0 });
        if ((state.pto.floating?.total || 0) > 0)
            types.push({ key: 'floating', name: 'Floating Holiday', total: state.pto.floating.total, used: state.pto.floating.used || 0 });
        if (!types.length)
            types.push({ key: 'vacation', name: 'Vacation', total: 40, used: 0 });
        state.pto.types = types;
        state.pto.requests = state.pto.requests || [];
        delete state.pto.vacation; delete state.pto.sick; delete state.pto.floating;
    }

    // Migrate legacy flat-entry format to grid format if needed
    Object.keys(state.timesheets).forEach(wk => {
        const rows = state.timesheets[wk];
        if (rows.length && rows[0].date) {
            // Old format detected — convert to grid
            const grid = {};
            rows.forEach(e => {
                const key = e.project || '__unknown__';
                if (!grid[key]) grid[key] = { id: generateId(), project: e.project || '', hours: {}, billable: e.billable !== false, notes: e.notes || '' };
                if (e.date) grid[key].hours[e.date] = (grid[key].hours[e.date] || 0) + (parseFloat(e.hours) || 0);
            });
            state.timesheets[wk] = Object.values(grid);
        }
    });

    // Seed demo data if first run
    if (Object.keys(state.timesheets).length === 0) {
        seedDemoData();
    }

    applySettings();
    saveVersion();
    saveState();
    if (localStorage.getItem('ts_sidebar_collapsed') === '1') {
        document.getElementById('sidebar').classList.add('collapsed');
    }
    document.documentElement.classList.remove('sidebar-pre-collapse');
    setupEventListeners();

    // Show default view
    showView('timesheets');
}

// Start the app
init();
