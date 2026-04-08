'use strict';

// ============================================================
//  CONSTANTS
// ============================================================
const TZS = [
  { v:'Pacific/Honolulu',    l:'Hawaii (HST, UTC−10)' },
  { v:'America/Anchorage',   l:'Alaska (AKST/AKDT, UTC−9/−8)' },
  { v:'America/Los_Angeles', l:'Pacific (PST/PDT, UTC−8/−7)' },
  { v:'America/Denver',      l:'Mountain (MST/MDT, UTC−7/−6)' },
  { v:'America/Phoenix',     l:'Arizona (MST, UTC−7, no DST)' },
  { v:'America/Chicago',     l:'Central (CST/CDT, UTC−6/−5)' },
  { v:'America/New_York',    l:'Eastern (EST/EDT, UTC−5/−4)' },
  { v:'America/Halifax',     l:'Atlantic (AST/ADT, UTC−4/−3)' },
  { v:'America/Sao_Paulo',   l:'São Paulo (BRT, UTC−3)' },
  { v:'Atlantic/Azores',     l:'Azores (AZOT/AZOST, UTC−1/0)' },
  { v:'Europe/London',       l:'London (GMT/BST, UTC+0/+1)' },
  { v:'Europe/Paris',        l:'Central Europe (CET/CEST, UTC+1/+2)' },
  { v:'Europe/Helsinki',     l:'Eastern Europe (EET/EEST, UTC+2/+3)' },
  { v:'Europe/Moscow',       l:'Moscow (MSK, UTC+3)' },
  { v:'Asia/Dubai',          l:'Gulf (GST, UTC+4)' },
  { v:'Asia/Karachi',        l:'Pakistan (PKT, UTC+5)' },
  { v:'Asia/Kolkata',        l:'India (IST, UTC+5:30)' },
  { v:'Asia/Dhaka',          l:'Bangladesh (BST, UTC+6)' },
  { v:'Asia/Bangkok',        l:'Indochina (ICT, UTC+7)' },
  { v:'Asia/Singapore',      l:'Singapore (SGT, UTC+8)' },
  { v:'Asia/Tokyo',          l:'Japan (JST, UTC+9)' },
  { v:'Australia/Sydney',    l:'Sydney (AEST/AEDT, UTC+10/+11)' },
  { v:'Pacific/Auckland',    l:'New Zealand (NZST/NZDT, UTC+12/+13)' },
];

const P_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1',
];
const MT_COLORS = [
  '#7c3aed','#db2777','#0e7490','#b45309','#047857',
  '#be123c','#0369a1','#a16207',
];

// ============================================================
//  STATE
// ============================================================
const S = {
  participants:  [],
  hostTz:        'America/Chicago',
  view:          'week',
  inc:           30,
  h24:           false,
  darkMode:      false,
  cur:           new Date(),
  activeTab:     'cal',
  editId:        null,
  filterIds:     null,       // Set<id> | null = all
  collapsedOrgs: new Set(),
  // edit-mode paint drag
  dragging:  false,
  dragMode:  null,
  dragCells: new Set(),
  // selection drag (no edit mode)
  selDrag:   false,
  selDk:     null,
  selRange:  null,
  // meetings
  meetings:       [],
  nextMeetingId:  1,
  pendingMtDk:    null,
  pendingMtStart: null,
  pendingMtDur:   null,
  // open slots
  openSlotsData: [],
  // modal helpers
  modalReq:   true,
  bulkReq:    true,
  editTarget: null,
  epReq:      true,
  editMtId:   null,
  nextId:     1,
};

// Popup open-time guard (prevents immediate close after drag-release)
let _apOpenTime = 0;

// ============================================================
//  LOCAL STORAGE
// ============================================================

const LS_KEY = 'globalSyncPro_v2';

function saveState() {
  try {
    const data = {
      participants: S.participants.map(p => ({
        id: p.id, name: p.name, org: p.org, tz: p.tz, required: p.required,
        color: p.color, mode: p.mode,
        availability: [...p.availability],
        blocked:      [...p.blocked],
      })),
      meetings:       S.meetings,
      hostTz:         S.hostTz,
      view:           S.view,
      inc:            S.inc,
      h24:            S.h24,
      darkMode:       S.darkMode,
      nextId:         S.nextId,
      nextMeetingId:  S.nextMeetingId,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch(e) { /* quota exceeded, ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    S.participants = (data.participants || []).map(p => ({
      ...p,
      availability: new Set(p.availability || []),
      blocked:      new Set(p.blocked      || []),
      mode:         p.mode || 'avail',
      org:          p.org  || '',
    }));
    S.meetings      = data.meetings      || [];
    S.hostTz        = data.hostTz        || 'America/Chicago';
    S.view          = data.view          || 'week';
    S.inc           = data.inc           || 30;
    S.h24           = data.h24           || false;
    S.darkMode      = data.darkMode      || false;
    S.nextId        = data.nextId        || 1;
    S.nextMeetingId = data.nextMeetingId || 1;
  } catch(e) { console.warn('Could not load saved state:', e); }
}

function confirmReset() {
  if (!confirm('Reset the session? This will clear all participants, availability, and meetings.')) return;
  localStorage.removeItem(LS_KEY);
  S.participants = []; S.meetings = []; S.editId = null; S.filterIds = null;
  S.nextId = 1; S.nextMeetingId = 1;
  S.view = 'week'; S.inc = 30; S.h24 = false;
  renderAll();
}

// ============================================================
//  DARK MODE
// ============================================================

function applyDarkMode() {
  document.body.classList.toggle('dark', S.darkMode);
  document.getElementById('dark-toggle').textContent = S.darkMode ? '☀️' : '🌙';
}

function toggleDark() {
  S.darkMode = !S.darkMode;
  applyDarkMode();
  saveState();
}

// ============================================================
//  TIMEZONE UTILITIES
// ============================================================

function dateParts(utcDate, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false,
  });
  const obj = {};
  fmt.formatToParts(utcDate).forEach(p => { obj[p.type] = p.value; });
  return { year:+obj.year, month:+obj.month, day:+obj.day, hour:+obj.hour % 24, minute:+obj.minute };
}

function localToUTC(yr, mo, dy, hr, mi, tz) {
  const fakeMs = Date.UTC(yr, mo-1, dy, hr, mi, 0);
  const p = dateParts(new Date(fakeMs), tz);
  const rt = Date.UTC(p.year, p.month-1, p.day, p.hour, p.minute, 0);
  return new Date(fakeMs + (fakeMs - rt));
}

function slotKey(d) {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

function keyToDate(k) { return new Date(k + ':00Z'); }
function p2(n)        { return String(n).padStart(2,'0'); }
function dayUTC(yr,mo,dy,tz) { return localToUTC(yr,mo,dy,0,0,tz); }

function hostSlots(dayDate, startMin, endMin) {
  const p = dateParts(dayDate, S.hostTz);
  const out = [];
  for (let m = startMin; m < endMin; m += 15)
    out.push(slotKey(localToUTC(p.year, p.month, p.day, Math.floor(m/60), m%60, S.hostTz)));
  return out;
}

function pSlots(yr, mo, dy, startMin, endMin, tz) {
  const out = [];
  for (let m = startMin; m < endMin; m += 15)
    out.push(slotKey(localToUTC(yr, mo, dy, Math.floor(m/60), m%60, tz)));
  return out;
}

// ============================================================
//  DATE UTILITIES
// ============================================================

function dow(yr, mo, dy) { return new Date(Date.UTC(yr, mo-1, dy)).getUTCDay(); }

function addDays(yr, mo, dy, n) {
  const d = new Date(Date.UTC(yr, mo-1, dy));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth()+1, day: d.getUTCDate() };
}

function weekDays() {
  const p = dateParts(S.cur, S.hostTz);
  const wd = dow(p.year, p.month, p.day);
  const isWW = S.view === 'workweek';
  const off  = isWW ? -(wd===0 ? 6 : wd-1) : -wd;
  const cnt  = isWW ? 5 : 7;
  const days = [];
  for (let i = 0; i < cnt; i++) {
    const d = addDays(p.year, p.month, p.day, off+i);
    days.push(dayUTC(d.year, d.month, d.day, S.hostTz));
  }
  return days;
}

function monthCells() {
  const p = dateParts(S.cur, S.hostTz);
  const withWknd = S.view === 'cal-wk';
  const startDow = withWknd ? 0 : 1;
  const backDays = ((dow(p.year,p.month,1) - startDow) + 7) % 7;
  const cells    = [];
  const start    = new Date(Date.UTC(p.year, p.month-1, 1-backDays));
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < (withWknd ? 7 : 5); col++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + row*7 + col);
      const yr=d.getUTCFullYear(), mo=d.getUTCMonth()+1, dy=d.getUTCDate();
      if (!withWknd && (d.getUTCDay()===0||d.getUTCDay()===6)) continue;
      cells.push({ utcDate: dayUTC(yr,mo,dy,S.hostTz), year:yr, month:mo, day:dy, isCur: mo===p.month });
    }
  }
  return cells;
}

function fmtTime(min) {
  const h=Math.floor(min/60)%24, m=min%60;
  const ap=h<12?'AM':'PM', h12=h%12||12;
  return `${h12}:${p2(m)} ${ap}`;
}

function viewLabel() {
  const p = dateParts(S.cur, S.hostTz);
  if (S.view==='cal-wk'||S.view==='cal-mf')
    return new Date(Date.UTC(p.year,p.month-1,1)).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const days=weekDays();
  const f=dateParts(days[0],S.hostTz), l=dateParts(days[days.length-1],S.hostTz);
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (f.month===l.month) return `${MN[f.month-1]} ${f.day}–${l.day}, ${f.year}`;
  return `${MN[f.month-1]} ${f.day} – ${MN[l.month-1]} ${l.day}, ${l.year}`;
}

// ============================================================
//  PARTICIPANT MANAGEMENT
// ============================================================

function mkParticipant(name, org, tz, required) {
  const id = S.nextId++;
  return { id, name, org:org||'', tz, required, color:P_COLORS[(id-1)%P_COLORS.length],
           availability:new Set(), blocked:new Set(), mode:'avail' };
}

function removeParticipant(id) {
  S.participants = S.participants.filter(p => p.id !== id);
  if (S.editId===id) S.editId = null;
  if (S.filterIds)   { S.filterIds.delete(id); if (!S.filterIds.size) S.filterIds=null; }
  renderAll();
}

function toggleReq(id) {
  const p = S.participants.find(p=>p.id===id);
  if (p) { p.required=!p.required; renderAll(); }
}

function updateTZ(id, tz) {
  const p = S.participants.find(p=>p.id===id);
  if (p) { p.tz=tz; renderAll(); }
}

// ============================================================
//  CTRL+CLICK FILTER
// ============================================================

function handleCardClick(evt, id) {
  if (evt.ctrlKey || evt.metaKey) {
    if (!S.filterIds) S.filterIds = new Set();
    S.filterIds.has(id) ? S.filterIds.delete(id) : S.filterIds.add(id);
    if (!S.filterIds.size) S.filterIds = null;
    S.editId = null;
    renderAll();
  } else {
    startEdit(id);
  }
}

function clearFilter() { S.filterIds=null; renderAll(); }

function getFilteredParticipants() {
  return S.filterIds ? S.participants.filter(p=>S.filterIds.has(p.id)) : S.participants;
}

// ============================================================
//  AVAILABILITY LOGIC
// ============================================================

function isAvail(part, utcSlots) {
  if (part.mode==='block') return utcSlots.every(s=>!part.blocked.has(s));
  return utcSlots.every(s=>part.availability.has(s));
}

function availInfo(utcSlots) {
  const rFree=[], rMiss=[], oFree=[];
  for (const p of getFilteredParticipants()) {
    const free=isAvail(p,utcSlots);
    if (p.required) { free?rFree.push(p):rMiss.push(p); }
    else            { if (free) oFree.push(p); }
  }
  return {rFree,rMiss,oFree};
}

function heatColor(info) {
  const total=getFilteredParticipants().length;
  if (!total) return 'var(--heat-0)';
  const r=(info.rFree.length+info.oFree.length)/total;
  if (r===0)  return 'var(--heat-0)';
  if (r<0.34) return 'var(--heat-1)';
  if (r<0.67) return 'var(--heat-2)';
  if (r<1.0)  return 'var(--heat-3)';
  return 'var(--heat-4)';
}

function addAvailBlock(pid, dateStr, startT, endT, tz) {
  const p=S.participants.find(p=>p.id===pid); if (!p) return;
  const [yr,mo,dy]=dateStr.split('-').map(Number);
  const [sh,sm]=startT.split(':').map(Number);
  const [eh,em]=endT.split(':').map(Number);
  const sMin=sh*60+sm, eMin=eh*60+em;
  if (sMin>=eMin) { alert('Start must be before End.'); return; }
  pSlots(yr,mo,dy,sMin,eMin,tz).forEach(s=>
    p.mode==='block' ? p.blocked.add(s) : p.availability.add(s)
  );
  renderAll();
}

function setEditMode(mode) {
  if (S.editId===null) return;
  const p=S.participants.find(p=>p.id===S.editId);
  if (p) { p.mode=mode; renderAll(); }
}

// ============================================================
//  QUICK GAP FINDER (SIDEBAR)
// ============================================================

function runGapFinder() {
  const dur=parseInt(document.getElementById('gap-dur').value)||60;
  const req=getFilteredParticipants().filter(p=>p.required);
  const opt=getFilteredParticipants().filter(p=>!p.required);

  if (!S.participants.length) {
    document.getElementById('gap-results').innerHTML='<div class="no-res">Add participants first.</div>';
    return;
  }
  const days=(S.view==='week'||S.view==='workweek')
    ? weekDays()
    : monthCells().filter(c=>c.isCur).map(c=>c.utcDate);
  const winS=S.h24?0:8*60, winE=S.h24?24*60:18*60;
  const cands=[];

  for (const dayDate of days) {
    for (let m=winS; m+dur<=winE; m+=S.inc) {
      const utcSl=hostSlots(dayDate,m,m+dur);
      const info=availInfo(utcSl);
      const allReq=info.rMiss.length===0;
      if (req.length>0&&info.rFree.length===0) continue;
      let rank;
      if      (allReq&&info.oFree.length===opt.length) rank=1;
      else if (allReq&&info.oFree.length>0)            rank=2;
      else if (allReq)                                  rank=3;
      else                                              rank=4;
      cands.push({dayDate,startMin:m,endMin:m+dur,rank,
        rFree:info.rFree.map(p=>p.name), rMiss:info.rMiss.map(p=>p.name), oFree:info.oFree.map(p=>p.name),
        score:info.oFree.length*1000+info.rFree.length});
    }
  }
  cands.sort((a,b)=>a.rank-b.rank||b.score-a.score);
  const top=cands.slice(0,10);
  const el=document.getElementById('gap-results');
  if (!top.length) { el.innerHTML='<div class="no-res">No open slots found in view.</div>'; return; }
  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  el.innerHTML=top.map(c=>{
    const p=dateParts(c.dayDate,S.hostTz);
    const star=c.rank===1?'★★★':c.rank===2?'★★':c.rank===3?'★':'◎';
    return `<div class="gr-card r${Math.min(c.rank,3)}">
      <div class="gr-time">${star} ${DAY[dow(p.year,p.month,p.day)]} ${p.month}/${p.day} · ${fmtTime(c.startMin)}–${fmtTime(c.endMin)}</div>
      ${c.rFree.length?`<div class="gr-free">✓ Req: ${c.rFree.join(', ')}</div>`:''}
      ${c.oFree.length?`<div class="gr-opt">Opt: ${c.oFree.join(', ')}</div>`:''}
      ${c.rMiss.length?`<div class="gr-miss">✗ Missing: ${c.rMiss.join(', ')}</div>`:''}
    </div>`;
  }).join('');
}

// ============================================================
//  OPEN SLOTS TAB
// ============================================================

function setTab(tab) {
  S.activeTab=tab;
  document.getElementById('tab-cal').classList.toggle('on',   tab==='cal');
  document.getElementById('tab-slots').classList.toggle('on', tab==='slots');
  document.getElementById('cal-wrapper').classList.toggle('hidden', tab!=='cal');
  document.getElementById('slots-panel').classList.toggle('hidden', tab!=='slots');
  ['nav-grp','nav-div','view-grp','view-div','inc-grp','inc-div','h24-grp'].forEach(id=>{
    const el=document.getElementById(id);
    if (el) el.style.display=tab==='cal'?'':'none';
  });
}

function goOpenSlots() {
  document.getElementById('os-dur').value=document.getElementById('gap-dur').value;
  setTab('slots');
}

function runOpenSlots() {
  const dur     =parseInt(document.getElementById('os-dur').value)||60;
  const fromStr =document.getElementById('os-from').value;
  const toStr   =document.getElementById('os-to').value;
  const minRank =parseInt(document.getElementById('os-minrank').value);
  const sortBy  =document.getElementById('os-sort').value;
  const activeDow=new Set();
  document.querySelectorAll('.dow-btn.on').forEach(btn=>activeDow.add(+btn.dataset.dow));

  if (!S.participants.length) { setSlotsPH('Add participants before searching.'); return; }
  if (!activeDow.size)        { setSlotsPH('Select at least one day of the week.'); return; }

  const mkUTC=str=>{ const [y,m,d]=str.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
  const startUTC=fromStr ? mkUTC(fromStr) : new Date();
  const endUTC  =toStr   ? mkUTC(toStr)   : new Date(startUTC.getTime()+14*864e5);

  const req=getFilteredParticipants().filter(p=>p.required);
  const opt=getFilteredParticipants().filter(p=>!p.required);
  const winS=8*60, winE=18*60;
  const cands=[];

  let d=new Date(startUTC);
  while (d<=endUTC) {
    const dp=dateParts(d,S.hostTz);
    if (activeDow.has(dow(dp.year,dp.month,dp.day))) {
      const dayDate=dayUTC(dp.year,dp.month,dp.day,S.hostTz);
      for (let m=winS; m+dur<=winE; m+=S.inc) {
        const utcSl=hostSlots(dayDate,m,m+dur);
        const info=availInfo(utcSl);
        const allReq=info.rMiss.length===0;
        if (req.length>0&&info.rFree.length===0) continue;
        let rank;
        if      (allReq&&info.oFree.length===opt.length) rank=1;
        else if (allReq&&info.oFree.length>0)            rank=2;
        else if (allReq)                                  rank=3;
        else                                              rank=4;
        if (rank>minRank) continue;
        cands.push({dayDate,dp,startMin:m,endMin:m+dur,rank,
          rFree:info.rFree.map(p=>p.name), rMiss:info.rMiss.map(p=>p.name), oFree:info.oFree.map(p=>p.name),
          score:info.oFree.length*1000+info.rFree.length});
      }
    }
    d.setUTCDate(d.getUTCDate()+1);
  }

  if (sortBy==='rank')  cands.sort((a,b)=>a.rank-b.rank||b.score-a.score);
  if (sortBy==='time')  cands.sort((a,b)=>a.dayDate-b.dayDate||a.startMin-b.startMin);
  if (sortBy==='avail') cands.sort((a,b)=>(b.rFree.length+b.oFree.length)-(a.rFree.length+a.oFree.length)||a.rank-b.rank);

  S.openSlotsData=cands;
  renderOpenSlotsTable(cands);
}

function renderOpenSlotsTable(data) {
  const tbody=document.getElementById('slots-tbody');
  const table=document.getElementById('slots-table');
  const ph   =document.getElementById('slots-placeholder');
  const expBtn=document.getElementById('os-export-btn');

  if (!data.length) { setSlotsPH('No slots found. Try expanding the date range or adjusting filters.'); expBtn.disabled=true; expBtn.style.opacity='.5'; return; }
  ph.classList.add('hidden'); table.classList.remove('hidden');
  expBtn.disabled=false; expBtn.style.opacity='1';

  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const star=['','★★★','★★','★','◎'];
  const rcls=['','r1-badge','r2-badge','r3-badge','r4-badge'];

  tbody.innerHTML=data.map(c=>{
    const day=DAY[dow(c.dp.year,c.dp.month,c.dp.day)];
    const dk=slotKey(c.dayDate);
    return `<tr>
      <td><span class="rank-badge ${rcls[c.rank]}">${star[c.rank]}</span></td>
      <td><strong>${day}</strong> ${c.dp.month}/${c.dp.day}/${c.dp.year}</td>
      <td>${fmtTime(c.startMin)} – ${fmtTime(c.endMin)}</td>
      <td style="color:var(--success)">${c.rFree.join(', ')||'—'}</td>
      <td style="color:var(--text-muted)">${c.oFree.join(', ')||'—'}</td>
      <td style="color:var(--danger)">${c.rMiss.join(', ')||'—'}</td>
      <td><button class="goto-btn" onclick="jumpToSlot('${dk}',${c.startMin})">Go →</button></td>
    </tr>`;
  }).join('');
}

function setSlotsPH(msg) {
  document.getElementById('slots-placeholder').innerHTML=msg;
  document.getElementById('slots-placeholder').classList.remove('hidden');
  document.getElementById('slots-table').classList.add('hidden');
}

function jumpToSlot(dk, _m) { S.cur=keyToDate(dk); setTab('cal'); renderAll(); }

function exportOpenSlots() {
  if (!S.openSlotsData.length) return;
  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labels=['','All+Optional','AllReq+SomeOpt','AllRequired','SomeRequired'];
  const rows=['Rank,Date,DayOfWeek,StartTime,EndTime,RequiredFree,OptionalFree,MissingRequired'];
  S.openSlotsData.forEach(c=>{
    const day=DAY[dow(c.dp.year,c.dp.month,c.dp.day)];
    const date=`${c.dp.year}-${p2(c.dp.month)}-${p2(c.dp.day)}`;
    rows.push([labels[c.rank],date,day,fmtTime(c.startMin),fmtTime(c.endMin),
      esc(c.rFree.join('; ')),esc(c.oFree.join('; ')),esc(c.rMiss.join('; '))].join(','));
  });
  dlBlob(new Blob([rows.join('\n')],{type:'text/csv'}),'global_sync_open_slots.csv');
}

// ============================================================
//  CSV IMPORT / EXPORT
// ============================================================

function exportCSV() {
  if (!S.participants.length) { alert('No participants to export.'); return; }
  const rows=['Name,Organization,Required_Status,TimeZone,AvailMode,Date,StartTime,EndTime'];
  for (const p of S.participants) {
    const base=[esc(p.name),esc(p.org),p.required?'Required':'Optional',p.tz,p.mode];
    const src=p.mode==='block'?p.blocked:p.availability;
    if (!src.size) { rows.push([...base,'','',''].join(',')); continue; }
    const sorted=[...src].sort();
    const blocks=[]; let bStart=null,bPrev=null,bPrevDate=null;
    for (const slot of sorted) {
      const lp=dateParts(keyToDate(slot),p.tz);
      const ld=`${lp.year}-${p2(lp.month)}-${p2(lp.day)}`;
      if (!bStart) { bStart=slot; bPrev=slot; bPrevDate=ld; }
      else {
        const diff=keyToDate(slot)-keyToDate(bPrev);
        if (diff===15*60*1000&&ld===bPrevDate) { bPrev=slot; bPrevDate=ld; }
        else { blocks.push([bStart,bPrev]); bStart=slot; bPrev=slot; bPrevDate=ld; }
      }
    }
    if (bStart) blocks.push([bStart,bPrev]);
    for (const [s,e] of blocks) {
      const sp=dateParts(keyToDate(s),p.tz);
      const ep=dateParts(new Date(keyToDate(e).getTime()+15*60*1000),p.tz);
      rows.push([...base,`${sp.year}-${p2(sp.month)}-${p2(sp.day)}`,
        `${p2(sp.hour)}:${p2(sp.minute)}`,`${p2(ep.hour)}:${p2(ep.minute)}`].join(','));
    }
  }
  dlBlob(new Blob([rows.join('\n')],{type:'text/csv'}),'global_sync_schedule.csv');
}

function esc(v) {
  v=String(v);
  return (v.includes(',')||v.includes('"')||v.includes('\n'))?'"'+v.replace(/"/g,'""')+'"':v;
}
function dlBlob(blob,name) {
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:name});
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function handleImport(evt) {
  const f=evt.target.files[0]; if (!f) return;
  const r=new FileReader();
  r.onload=e=>{ try { importCSV(e.target.result); } catch(err) { alert('Import error: '+err.message); } };
  r.readAsText(f); evt.target.value='';
}

function parseLine(line) {
  const out=[]; let q=false,cur='';
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if (c==='"') { if (q&&line[i+1]==='"') { cur+='"'; i++; } else q=!q; }
    else if (c===','&&!q) { out.push(cur.trim()); cur=''; }
    else cur+=c;
  }
  out.push(cur.trim()); return out;
}

function importCSV(text) {
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length<2) throw new Error('No data rows found.');
  const hdr=parseLine(lines[0]).map(h=>h.toLowerCase().replace(/[\s_]+/g,'_'));
  const ci=f=>hdr.indexOf(f);
  const ni=ci('name'),oi=ci('organization'),ri=ci('required_status'),ti=ci('timezone');
  const mi=ci('availmode'),di=ci('date'),si=ci('starttime'),ei=ci('endtime');
  if (ni<0||ri<0||ti<0) throw new Error('Missing columns: Name, Required_Status, TimeZone.');

  const map=new Map();
  for (let i=1;i<lines.length;i++) {
    const cols=parseLine(lines[i]); if (cols.length<3) continue;
    const name=cols[ni]; if (!name) continue;
    const req=/required|true|1/i.test(cols[ri]||'');
    let tz=cols[ti]||'America/Chicago';
    try { Intl.DateTimeFormat('en-US',{timeZone:tz}); } catch { tz='America/Chicago'; }
    const org=oi>=0?cols[oi]||'':'';
    const mode=mi>=0&&cols[mi]==='block'?'block':'avail';
    if (!map.has(name)) map.set(name,{name,req,tz,org,mode,blocks:[]});
    const entry=map.get(name);
    if (di>=0&&si>=0&&ei>=0&&cols[di]&&cols[si]&&cols[ei])
      entry.blocks.push({date:cols[di],start:cols[si],end:cols[ei]});
  }
  for (const [name,data] of map) {
    let p=S.participants.find(p=>p.name===name);
    if (!p) { p=mkParticipant(name,data.org,data.tz,data.req); S.participants.push(p); }
    else    { p.tz=data.tz; p.required=data.req; p.org=data.org; }
    p.mode=data.mode;
    for (const b of data.blocks) {
      const [yr,mo,dy]=b.date.split('-').map(Number);
      const [sh,sm]=b.start.split(':').map(Number);
      const [eh,em]=b.end.split(':').map(Number);
      const sM=sh*60+sm, eM=eh*60+em;
      if (isNaN(sM)||isNaN(eM)||sM>=eM) continue;
      pSlots(yr,mo,dy,sM,eM,p.tz).forEach(s=>(p.mode==='block'?p.blocked:p.availability).add(s));
    }
  }
  renderAll();
  alert(`Imported ${map.size} participant(s).`);
}

// ============================================================
//  MEETINGS
// ============================================================

function cellMeetings(dk,m,inc) {
  return S.meetings.filter(mt=>mt.dk===dk&&mt.startMin<m+inc&&mt.startMin+mt.duration>m);
}

function showMeetingModal(meetingId) {
  S.editMtId=meetingId;
  document.getElementById('mt-modal-title').textContent=meetingId?'Edit Meeting':'Create Meeting';
  document.getElementById('mt-delete-btn').classList.toggle('hidden',!meetingId);
  const plist=document.getElementById('mt-participants');
  plist.innerHTML=S.participants.length
    ? S.participants.map(p=>
        `<label><input type="checkbox" value="${p.id}" checked>
         <span style="color:${p.color}">●</span> ${p.name}
         <span style="font-size:10px;color:var(--text-muted)">${p.required?'[REQ]':'[OPT]'}</span></label>`
      ).join('')
    : '<em style="font-size:12px;color:var(--text-muted)">No participants yet.</em>';

  if (meetingId) {
    const mt=S.meetings.find(m=>m.id===meetingId);
    if (mt) {
      document.getElementById('mt-title').value=mt.title;
      document.getElementById('mt-dur').value=mt.duration;
      document.getElementById('mt-start').value=`${p2(Math.floor(mt.startMin/60))}:${p2(mt.startMin%60)}`;
      const dp=dateParts(keyToDate(mt.dk),S.hostTz);
      document.getElementById('mt-date').value=`${dp.year}-${p2(dp.month)}-${p2(dp.day)}`;
      document.querySelectorAll('#mt-participants input').forEach(inp=>{inp.checked=mt.participantIds.includes(+inp.value);});
    }
  } else {
    document.getElementById('mt-title').value='';
    document.getElementById('mt-dur').value='60';
    if (S.pendingMtDk) {
      const dp=dateParts(keyToDate(S.pendingMtDk),S.hostTz);
      document.getElementById('mt-date').value=`${dp.year}-${p2(dp.month)}-${p2(dp.day)}`;
      document.getElementById('mt-start').value=`${p2(Math.floor(S.pendingMtStart/60))}:${p2(S.pendingMtStart%60)}`;
      if (S.pendingMtDur) document.getElementById('mt-dur').value=String(Math.min(S.pendingMtDur,240));
      S.pendingMtDk=S.pendingMtStart=S.pendingMtDur=null;
    } else {
      const tp=dateParts(new Date(),S.hostTz);
      document.getElementById('mt-date').value=`${tp.year}-${p2(tp.month)}-${p2(tp.day)}`;
      document.getElementById('mt-start').value='09:00';
    }
  }
  document.getElementById('modal-meeting').classList.remove('hidden');
  setTimeout(()=>document.getElementById('mt-title').focus(),50);
}

function submitMeeting() {
  const title=document.getElementById('mt-title').value.trim();
  const dateV=document.getElementById('mt-date').value;
  const startV=document.getElementById('mt-start').value;
  const dur=parseInt(document.getElementById('mt-dur').value);
  if (!title||!dateV||!startV) { alert('Fill in Title, Date, and Start Time.'); return; }
  const [yr,mo,dy]=dateV.split('-').map(Number);
  const [sh,sm]=startV.split(':').map(Number);
  const startMin=sh*60+sm;
  const dk=slotKey(dayUTC(yr,mo,dy,S.hostTz));
  const pids=[...document.querySelectorAll('#mt-participants input:checked')].map(i=>+i.value);

  if (S.editMtId) {
    const mt=S.meetings.find(m=>m.id===S.editMtId);
    if (mt) Object.assign(mt,{title,dk,startMin,duration:dur,participantIds:pids});
  } else {
    S.meetings.push({id:S.nextMeetingId++,title,dk,startMin,duration:dur,
      color:MT_COLORS[S.nextMeetingId%MT_COLORS.length],participantIds:pids});
  }
  closeModal('modal-meeting'); renderAll();
}

function deleteMeeting() {
  if (!S.editMtId) return;
  const mt=S.meetings.find(m=>m.id===S.editMtId);
  if (!mt||!confirm(`Delete meeting "${mt.title}"?`)) return;
  S.meetings=S.meetings.filter(m=>m.id!==S.editMtId);
  closeModal('modal-meeting'); renderAll();
}

function openMeeting(id) { showMeetingModal(id); }

// ============================================================
//  RENDERING
// ============================================================

function renderAll() {
  renderSidebar();
  renderCalendar();
  document.getElementById('tb-label').textContent=viewLabel();
  updateToolbar();
  saveState();
}

function updateToolbar() {
  ['week','workweek','cal-wk','cal-mf'].forEach((v,i)=>{
    const ids=['v-week','v-ww','v-cal-wk','v-cal-mf'];
    document.getElementById(ids[i]).classList.toggle('on',S.view===v);
  });
  [15,30,60].forEach(n=>document.getElementById(`inc-${n}`).classList.toggle('on',S.inc===n));
  document.getElementById('btn-24h').classList.toggle('on',S.h24);

  const editing=S.editId!==null;
  document.getElementById('exit-edit-grp').classList.toggle('hidden',!editing);
  document.getElementById('edit-mode-grp').classList.toggle('hidden',!editing);

  if (editing) {
    document.getElementById('edit-banner').classList.add('vis');
    const p=S.participants.find(p=>p.id===S.editId);
    const tzL=TZS.find(t=>t.v===p?.tz)?.l||p?.tz||'';
    document.getElementById('eb-info').innerHTML=`✏️ Editing: <strong>${p?.name||''}</strong> &nbsp;|&nbsp; ${tzL}`;
    document.getElementById('eb-tz-note').textContent=`(${p?.tz||''})`;
    const tp=dateParts(new Date(),S.hostTz);
    if (!document.getElementById('f-date').value)
      document.getElementById('f-date').value=`${tp.year}-${p2(tp.month)}-${p2(tp.day)}`;
    const isBlock=p?.mode==='block';
    document.getElementById('eb-avail-btn').classList.toggle('on',!isBlock);
    const bBtn=document.getElementById('eb-block-btn');
    bBtn.style.cssText=isBlock?'background:var(--danger);color:#fff;border-color:var(--danger)':'';
  } else {
    document.getElementById('edit-banner').classList.remove('vis');
    document.getElementById('f-date').value='';
  }
}

// ---- SIDEBAR ----
function renderSidebar() {
  const el=document.getElementById('p-list');
  if (!S.participants.length) {
    el.innerHTML='<div class="no-res">No participants yet.<br>Click <strong>+ Add</strong> to begin.</div>';
    document.getElementById('filter-banner').classList.add('hidden');
    return;
  }
  const groups=new Map();
  S.participants.forEach(p=>{ const k=p.org||'__none'; if (!groups.has(k)) groups.set(k,[]); groups.get(k).push(p); });
  const orgs=[...groups.keys()].sort((a,b)=>{ if(a==='__none')return 1; if(b==='__none')return -1; return a.localeCompare(b); });
  const hasOrgs=!(orgs.length===1&&orgs[0]==='__none');

  el.innerHTML=orgs.map(org=>{
    const members=groups.get(org);
    const label=org==='__none'?'No Group':org;
    const collapsed=S.collapsedOrgs.has(org);
    const cards=members.map(renderParticipantCard).join('');
    if (!hasOrgs) return cards;
    return `<div class="org-group">
      <div class="org-hdr" onclick="toggleOrgCollapse('${org.replace(/'/g,"\\'")}')">
        <span class="org-arrow" style="transform:${collapsed?'rotate(-90deg)':''}">▾</span>
        ${label} <span style="opacity:.6">(${members.length})</span>
      </div>
      <div class="org-body" style="display:${collapsed?'none':'flex'};flex-direction:column;gap:6px">${cards}</div>
    </div>`;
  }).join('');

  const fb=document.getElementById('filter-banner');
  if (S.filterIds&&S.filterIds.size) {
    fb.classList.remove('hidden');
    document.getElementById('filter-label').textContent=`Filtering: ${S.filterIds.size} of ${S.participants.length} shown`;
  } else {
    fb.classList.add('hidden');
  }
}

function renderParticipantCard(p) {
  const hrs=(p.availability.size*15/60).toFixed(1);
  const editing=S.editId===p.id;
  const filtered=S.filterIds&&S.filterIds.has(p.id);
  const modeTag=p.mode==='block'?`<span style="font-size:9px;color:#fca5a5;font-weight:700">⊘</span>`:'';
  const tzOpts=TZS.map(t=>`<option value="${t.v}"${t.v===p.tz?' selected':''}>${t.l}</option>`).join('');
  let cls='p-card';
  if (editing)  cls+=' active';
  if (filtered) cls+=' filtered';
  return `<div class="${cls}" onclick="handleCardClick(event,${p.id})" title="Click to edit · Ctrl+Click to filter">
    <div class="p-head">
      <div class="p-dot" style="background:${p.color}"></div>
      <span class="p-name" title="${p.name}">${p.name} ${modeTag}</span>
      <span class="p-badge ${p.required?'p-req':'p-opt'}" onclick="event.stopPropagation();toggleReq(${p.id})">${p.required?'REQ':'OPT'}</span>
    </div>
    <div class="p-foot">
      <select class="p-tz" onclick="event.stopPropagation()" onchange="event.stopPropagation();updateTZ(${p.id},this.value)">${tzOpts}</select>
      <span class="p-hrs">${hrs}h</span>
      <button class="ico-btn" onclick="event.stopPropagation();showEditParticipantModal(${p.id})" title="Edit">✎</button>
      <button class="ico-btn ico-del" onclick="event.stopPropagation();removeParticipant(${p.id})" title="Remove">✕</button>
    </div>
  </div>`;
}

function toggleOrgCollapse(org) {
  S.collapsedOrgs.has(org)?S.collapsedOrgs.delete(org):S.collapsedOrgs.add(org);
  renderSidebar();
}

// ---- CALENDAR DISPATCH ----
function renderCalendar() {
  if (S.activeTab!=='cal') return;
  if (S.view==='week'||S.view==='workweek') renderWeekGrid();
  else renderMonthGrid();
}

// ---- WEEK GRID ----
function renderWeekGrid() {
  const days=weekDays(), N=days.length;
  const winS=S.h24?0:8*60, winE=S.h24?24*60:18*60;
  const inc=S.inc, cellH=inc===15?20:inc===30?36:60;
  const todayP=dateParts(new Date(),S.hostTz);
  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const ep=S.editId!==null?S.participants.find(p=>p.id===S.editId):null;

  // CTRL+click filter mode → show individual participant strips
  const showStrips=S.filterIds&&S.filterIds.size>0&&!ep;
  const fps=showStrips?getFilteredParticipants():[];
  const stripH=Math.min(5,Math.max(3,Math.floor(cellH*0.22)));

  let html=`<div class="wk-grid" style="grid-template-columns:72px repeat(${N},1fr);user-select:none">`;
  html+=`<div class="g-corner" style="height:46px"></div>`;
  days.forEach(dd=>{
    const p=dateParts(dd,S.hostTz);
    const isToday=p.year===todayP.year&&p.month===todayP.month&&p.day===todayP.day;
    html+=`<div class="g-day-hdr${isToday?' today-hdr':''}">
      <div class="dh-name">${DAY[dow(p.year,p.month,p.day)]}</div>
      <div class="dh-date">${p.month}/${p.day}</div>
    </div>`;
  });

  for (let m=winS; m<winE; m+=inc) {
    const isHr=m%60===0;
    html+=`<div class="g-time-lbl${isHr?' hr-start':''}" style="height:${cellH}px">${isHr?fmtTime(m):''}</div>`;
    days.forEach(dd=>{
      const dk=slotKey(dd);
      const utcSl=hostSlots(dd,m,m+inc);
      let bg='', cls='g-cell';

      if (ep) {
        // Edit mode: show this participant's state
        if (ep.mode==='block') {
          bg=utcSl.every(s=>ep.blocked.has(s))?'var(--blk-on)':'var(--blk-off)';
        } else {
          bg=isAvail(ep,utcSl)?ep.color+'aa':'var(--heat-0)';
        }
      } else if (showStrips) {
        // CTRL+click multi-person: neutral bg + colored per-person strips at bottom
        bg='var(--heat-0)';
        const info=availInfo(utcSl);
        const hasReq=fps.some(p=>p.required);
        if (hasReq&&info.rMiss.length===0) cls+=' all-req';
      } else {
        // Normal heatmap
        const info=availInfo(utcSl);
        bg=heatColor(info);
        const hasReq=getFilteredParticipants().some(p=>p.required);
        if (hasReq&&info.rMiss.length===0) cls+=' all-req';
      }
      if (isHr) cls+=' hr-start';

      // Per-person availability strips (CTRL+click filter mode)
      let stripsHtml='';
      if (showStrips&&fps.length) {
        stripsHtml=`<div class="avail-strips" style="height:${stripH}px">` +
          fps.map(fp=>{
            const free=isAvail(fp,utcSl);
            return `<div class="avail-strip" style="background:${free?fp.color:'rgba(0,0,0,0.07)'}"></div>`;
          }).join('') +
          `</div>`;
      }

      // Meeting overlays
      const mts=cellMeetings(dk,m,inc);
      const mtHtml=mts.map(mt=>{
        const isStart=mt.startMin>=m&&mt.startMin<m+inc;
        return isStart
          ?`<div class="mt-start" style="background:${mt.color}" onclick="event.stopPropagation();openMeeting(${mt.id})" title="${mt.title}">${mt.title}</div>`
          :`<div class="mt-cont"  style="background:${mt.color}" onclick="event.stopPropagation();openMeeting(${mt.id})"></div>`;
      }).join('');

      html+=`<div class="${cls}" data-dk="${dk}" data-m="${m}"
        style="height:${cellH}px;background:${bg}"
        onmousedown="onCellDown(event,'${dk}',${m})"
        onmouseenter="onCellEnter(event,'${dk}',${m})"
        onmouseleave="hideTooltip()">${mtHtml}${stripsHtml}</div>`;
    });
  }
  html+='</div>';
  document.getElementById('cal-inner').innerHTML=html;
}

// ---- MONTH GRID ----
function renderMonthGrid() {
  const cells=monthCells();
  const N=S.view==='cal-wk'?7:5;
  const dayNames=S.view==='cal-wk'?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['Mon','Tue','Wed','Thu','Fri'];
  const todayP=dateParts(new Date(),S.hostTz);
  const showStrips=S.filterIds&&S.filterIds.size>0;
  const fps=showStrips?getFilteredParticipants():[];

  let html=`<div class="mo-grid" style="grid-template-columns:repeat(${N},1fr)">`;
  dayNames.forEach(d=>html+=`<div class="mo-day-hdr">${d}</div>`);

  const winS=8*60, winE=18*60;
  const hasReq=getFilteredParticipants().some(p=>p.required);

  for (const cell of cells) {
    const {utcDate,year,month,day,isCur}=cell;
    const isToday=year===todayP.year&&month===todayP.month&&day===todayP.day;
    let totalFree=0,totalSlots=0,hasAllReq=false;
    for (let m=winS;m<winE;m+=30) {
      const info=availInfo(hostSlots(utcDate,m,m+30));
      totalFree+=info.rFree.length+info.oFree.length; totalSlots++;
      if (hasReq&&info.rMiss.length===0) hasAllReq=true;
    }
    const total=getFilteredParticipants().length;
    const ratio=total>0?totalFree/(totalSlots*total):0;
    const barColor=ratio===0?'':ratio<0.34?'var(--heat-1)':ratio<0.67?'var(--heat-2)':ratio<1?'var(--heat-3)':'var(--heat-4)';
    const dk=slotKey(utcDate);
    const dayMts=S.meetings.filter(mt=>mt.dk===dk);
    const mDots=dayMts.map(mt=>`<span class="mo-meeting-dot" style="background:${mt.color}" title="${mt.title}"></span>`).join('');

    // Per-person strip for month cell
    let stripsHtml='';
    if (showStrips&&fps.length) {
      const daySlots=hostSlots(utcDate,winS,winE);
      stripsHtml=`<div style="display:flex;gap:2px;margin-top:4px">` +
        fps.map(fp=>{
          const free=isAvail(fp,daySlots);
          return `<div style="flex:1;height:4px;border-radius:2px;background:${free?fp.color:'rgba(0,0,0,0.1)'}"></div>`;
        }).join('') +
        `</div>`;
    }

    let cls='mo-cell'+(!isCur?' other':'')+(hasAllReq?' all-req':'');
    html+=`<div class="${cls}" onclick="onMonthClick('${dk}')" onmouseenter="onMonthHover(event,'${dk}')" onmouseleave="hideTooltip()">
      <div class="mo-date">${isToday?`<div class="today-dot">${day}</div>`:day}</div>
      ${barColor?`<div class="mo-bar" style="background:${barColor}"></div>`:''}
      ${total>0&&totalFree>0&&!showStrips?`<div class="mo-mini-label">${Math.round(ratio*100)}% free</div>`:''}
      ${stripsHtml}
      ${mDots?`<div style="margin-top:4px">${mDots}</div>`:''}
    </div>`;
  }
  html+='</div>';
  document.getElementById('cal-inner').innerHTML=html;
}

// ============================================================
//  EDIT MODE
// ============================================================

function startEdit(id) { S.editId=S.editId===id?null:id; renderAll(); }
function exitEdit()    { S.editId=null; renderAll(); }

function addFormBlock() {
  if (S.editId===null) { alert('Select a participant first.'); return; }
  const p=S.participants.find(p=>p.id===S.editId); if (!p) return;
  const d=document.getElementById('f-date').value;
  const s=document.getElementById('f-start').value;
  const e=document.getElementById('f-end').value;
  if (!d||!s||!e) { alert('Fill in date, start, and end times.'); return; }
  addAvailBlock(S.editId,d,s,e,p.tz);
}

function clearDay() {
  if (S.editId===null) return;
  const p=S.participants.find(p=>p.id===S.editId); if (!p) return;
  const d=document.getElementById('f-date').value;
  if (!d) { alert('Select a date first.'); return; }
  if (!confirm(`Clear all ${p.mode==='block'?'blocked':'available'} time for ${p.name} on ${d}?`)) return;
  const target=p.mode==='block'?p.blocked:p.availability;
  const toRm=[];
  for (const s of target) {
    const lp=dateParts(keyToDate(s),p.tz);
    if (`${lp.year}-${p2(lp.month)}-${p2(lp.day)}`===d) toRm.push(s);
  }
  toRm.forEach(s=>target.delete(s));
  renderAll();
}

// ============================================================
//  PAINT-ON DRAG (edit mode) + SELECTION DRAG (no edit mode)
// ============================================================

function onCellDown(evt, dk, m) {
  if (evt.button!==0) return;
  evt.preventDefault();
  cpClose();

  if (S.editId!==null) {
    // --- Edit-mode paint drag ---
    const p=S.participants.find(p=>p.id===S.editId); if (!p) return;
    const utcSl=hostSlots(keyToDate(dk),m,m+S.inc);
    const target=p.mode==='block'?p.blocked:p.availability;
    S.dragMode=utcSl.every(s=>target.has(s))?'remove':'add';
    S.dragging=true; S.dragCells=new Set();
    toggleCell(dk,m,p,utcSl);
    document.addEventListener('mouseup',onMouseUp,{once:true});
  } else {
    // --- Selection drag (assign popup) ---
    S.selDrag=true; S.selDk=dk;
    S.selRange={minM:m, maxM:m};
    highlightSelRange();
    document.addEventListener('mouseup',onMouseUp,{once:true});
  }
}

function onCellEnter(evt, dk, m) {
  if (S.selDrag) {
    if (dk===S.selDk) {
      S.selRange.minM=Math.min(S.selRange.minM,m);
      S.selRange.maxM=Math.max(S.selRange.maxM,m);
      highlightSelRange();
    }
    return;
  }
  if (!S.dragging) { showCellTT(evt,dk,m); return; }
  const p=S.participants.find(p=>p.id===S.editId); if (!p) return;
  toggleCell(dk,m,p,hostSlots(keyToDate(dk),m,m+S.inc));
}

function highlightSelRange() {
  if (!S.selDk||!S.selRange) return;
  document.querySelectorAll(`[data-dk="${S.selDk}"]`).forEach(cell=>{
    const cm=parseInt(cell.dataset.m);
    cell.classList.toggle('sel-hl',cm>=S.selRange.minM&&cm<=S.selRange.maxM);
  });
}

function toggleCell(dk, m, p, utcSl) {
  const ck=`${dk}_${m}`;
  if (S.dragCells.has(ck)) return;
  S.dragCells.add(ck);
  const target=p.mode==='block'?p.blocked:p.availability;
  if (S.dragMode==='add') utcSl.forEach(s=>target.add(s));
  else                     utcSl.forEach(s=>target.delete(s));

  const cell=document.querySelector(`[data-dk="${dk}"][data-m="${m}"]`);
  if (cell) {
    if (p.mode==='block') {
      cell.style.background=utcSl.every(s=>p.blocked.has(s))?'var(--blk-on)':'var(--blk-off)';
    } else {
      cell.style.background=S.dragMode==='add'?p.color+'aa':'var(--heat-0)';
    }
  }
  const hrsEls=document.querySelectorAll('.p-hrs');
  const idx=S.participants.findIndex(pp=>pp.id===p.id);
  if (hrsEls[idx]) hrsEls[idx].textContent=(p.availability.size*15/60).toFixed(1)+'h';
}

function onMouseUp(evt) {
  if (S.selDrag) {
    S.selDrag=false;
    // Show assign popup. Guard against immediate close by recording open time.
    if (S.selRange) {
      showAssignPopup(evt);
    } else {
      clearSelHighlight();
    }
    return;
  }
  S.dragging=false; S.dragMode=null; S.dragCells=new Set();
  // Persist after paint-drag ends
  saveState();
}

function onMonthClick(dk) {
  if (S.editId!==null) {
    const p=S.participants.find(p=>p.id===S.editId); if (!p) return;
    const lp=dateParts(keyToDate(dk),p.tz);
    document.getElementById('f-date').value=`${lp.year}-${p2(lp.month)}-${p2(lp.day)}`;
  }
}

// ============================================================
//  QUICK-ASSIGN POPUP
// ============================================================

function showAssignPopup(evt) {
  if (!S.participants.length||!S.selRange) { clearSelHighlight(); S.selRange=null; S.selDk=null; return; }
  const {minM,maxM}=S.selRange;
  const dk=S.selDk;
  const dayDate=keyToDate(dk);
  const p=dateParts(dayDate,S.hostTz);
  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  document.getElementById('ap-head').textContent=
    `${DAY[dow(p.year,p.month,p.day)]} ${p.month}/${p.day}, ${fmtTime(minM)} – ${fmtTime(maxM+S.inc)}`;

  document.getElementById('ap-plist').innerHTML=S.participants.map(pp=>
    `<label>
       <input type="checkbox" value="${pp.id}" ${!S.filterIds||S.filterIds.has(pp.id)?'checked':''}>
       <span style="color:${pp.color};font-size:10px">●</span>
       ${pp.name} <span style="font-size:10px;color:var(--text-muted)">${pp.required?'[REQ]':'[OPT]'}</span>
     </label>`
  ).join('');

  document.querySelector('input[name="ap-mode"][value="avail"]').checked=true;

  const popup=document.getElementById('assign-popup');
  popup.classList.remove('hidden');
  _apOpenTime=Date.now();  // guard against immediate close

  const px=Math.min(evt.clientX+10, window.innerWidth -280);
  const py=Math.min(evt.clientY-10, window.innerHeight-320);
  popup.style.left=px+'px'; popup.style.top=py+'px';
}

function apConfirm() {
  const mode=document.querySelector('input[name="ap-mode"]:checked')?.value||'avail';
  const checked=[...document.querySelectorAll('#ap-plist input:checked')].map(i=>+i.value);
  if (!S.selRange||!checked.length) { apCancel(); return; }

  const {minM,maxM}=S.selRange;
  // Cover the entire selected range (minM through maxM+inc)
  const slots=hostSlots(keyToDate(S.selDk),minM,maxM+S.inc);

  for (const id of checked) {
    const p=S.participants.find(p=>p.id===id); if (!p) continue;
    const target=mode==='block'?p.blocked:p.availability;
    slots.forEach(s=>target.add(s));
  }
  apCancel();
  renderAll();
}

function apCancel() {
  clearSelHighlight();
  document.getElementById('assign-popup').classList.add('hidden');
  S.selRange=null; S.selDk=null;
}

function apCreateMeeting() {
  if (!S.selRange) return;
  S.pendingMtDk=S.selDk;
  S.pendingMtStart=S.selRange.minM;
  S.pendingMtDur=S.selRange.maxM-S.selRange.minM+S.inc;
  apCancel();
  showMeetingModal(null);
}

function clearSelHighlight() {
  document.querySelectorAll('.sel-hl').forEach(c=>c.classList.remove('sel-hl'));
}

// ============================================================
//  TOOLTIP
// ============================================================

function showCellTT(evt, dk, m) {
  if (!S.participants.length) return;
  const dd=keyToDate(dk);
  const utcSl=hostSlots(dd,m,m+S.inc);
  const info=availInfo(utcSl);
  const p=dateParts(dd,S.hostTz);
  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mts=cellMeetings(dk,m,S.inc);

  let c=`<div class="tt-title">${DAY[dow(p.year,p.month,p.day)]}, ${p.month}/${p.day} · ${fmtTime(m)}–${fmtTime(m+S.inc)}</div>`;
  if (mts.length) c+=`<div style="margin-bottom:5px">${mts.map(mt=>`<span style="color:${mt.color}">● ${mt.title}</span>`).join('<br>')}</div>`;
  if (info.rFree.length) c+=`<div class="tt-row"><span class="tt-lbl">Req Free:</span><div class="tt-vals">${info.rFree.map(x=>`<span class="chip chip-f">${x.name}</span>`).join('')}</div></div>`;
  if (info.oFree.length) c+=`<div class="tt-row"><span class="tt-lbl">Opt Free:</span><div class="tt-vals">${info.oFree.map(x=>`<span class="chip chip-o">${x.name}</span>`).join('')}</div></div>`;
  if (info.rMiss.length) c+=`<div class="tt-row"><span class="tt-lbl">Missing:</span><div class="tt-vals">${info.rMiss.map(x=>`<span class="chip chip-m">${x.name}</span>`).join('')}</div></div>`;
  if (!info.rFree.length&&!info.rMiss.length&&!info.oFree.length&&!mts.length)
    c+=`<div style="color:#94a3b8;font-size:11px">No availability marked</div>`;
  placeTooltip(evt.clientX+14,evt.clientY-12,c);
}

function onMonthHover(evt, dk) {
  if (!S.participants.length) return;
  const dd=keyToDate(dk), p=dateParts(dd,S.hostTz);
  const info=availInfo(hostSlots(dd,8*60,18*60));
  const mts=S.meetings.filter(mt=>mt.dk===dk);
  const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let c=`<div class="tt-title">${DAY[dow(p.year,p.month,p.day)]}, ${p.month}/${p.day}/${p.year}</div>`;
  c+=`<div style="font-size:10px;color:#94a3b8;margin-bottom:6px">8 AM–6 PM window</div>`;
  if (mts.length) c+=`<div style="margin-bottom:5px;font-size:11px">${mts.map(mt=>`<span style="color:${mt.color}">● ${mt.title} ${fmtTime(mt.startMin)}</span>`).join('<br>')}</div>`;
  if (info.rFree.length) c+=`<div class="tt-row"><span class="tt-lbl">Req:</span><div class="tt-vals">${info.rFree.map(x=>`<span class="chip chip-f">${x.name}</span>`).join('')}</div></div>`;
  if (info.oFree.length) c+=`<div class="tt-row"><span class="tt-lbl">Opt:</span><div class="tt-vals">${info.oFree.map(x=>`<span class="chip chip-o">${x.name}</span>`).join('')}</div></div>`;
  if (info.rMiss.length) c+=`<div class="tt-row"><span class="tt-lbl">Missing:</span><div class="tt-vals">${info.rMiss.map(x=>`<span class="chip chip-m">${x.name}</span>`).join('')}</div></div>`;
  placeTooltip(evt.clientX+14,evt.clientY-12,c);
}

function placeTooltip(x, y, content) {
  const tt=document.getElementById('tooltip');
  tt.innerHTML=content; tt.classList.add('vis');
  tt.style.left='0'; tt.style.top='0';
  const r=tt.getBoundingClientRect();
  const tx=Math.min(x,window.innerWidth-r.width-12);
  const ty=y+r.height>window.innerHeight?y-r.height-20:y;
  tt.style.left=tx+'px'; tt.style.top=ty+'px';
}

function hideTooltip() {
  if (!S.dragging&&!S.selDrag) document.getElementById('tooltip').classList.remove('vis');
}

// ============================================================
//  NAVIGATION
// ============================================================

function navigate(dir) {
  const p=dateParts(S.cur,S.hostTz);
  if (S.view==='week'||S.view==='workweek') {
    const n=addDays(p.year,p.month,p.day,dir*(S.view==='workweek'?5:7));
    S.cur=new Date(Date.UTC(n.year,n.month-1,n.day));
  } else {
    let nm=p.month+dir, ny=p.year;
    if (nm>12){nm=1;ny++;} if (nm<1){nm=12;ny--;}
    S.cur=new Date(Date.UTC(ny,nm-1,Math.min(p.day,28)));
  }
  renderAll();
}

function goToday()  { S.cur=new Date(); renderAll(); }
function setView(v) { S.view=v; renderAll(); }
function setInc(n)  { S.inc=n;  renderAll(); }
function toggle24h(){ S.h24=!S.h24; renderAll(); }

// ============================================================
//  CLOCK PICKER
// ============================================================

const CP={targetId:null,phase:'h',h:9,m:0,ap:'AM'};

function cpOpen(inputId) {
  const picker=document.getElementById('clock-picker');
  if (!picker.classList.contains('hidden')&&CP.targetId===inputId) return;
  CP.targetId=inputId;
  const el=document.getElementById(inputId); if (!el) return;
  const val=el.value||'09:00';
  const [hh,mm]=val.split(':').map(Number);
  CP.h=hh%12||12; CP.m=mm; CP.ap=hh<12?'AM':'PM'; CP.phase='h';
  picker.classList.remove('hidden');
  const r=el.getBoundingClientRect();
  let left=r.left, top=r.bottom+6;
  if (left+230>window.innerWidth)  left=window.innerWidth-238;
  if (top+320>window.innerHeight)  top=r.top-320;
  picker.style.left=left+'px'; picker.style.top=top+'px';
  cpRender();
}

function cpRender() {
  document.getElementById('cp-phase-lbl').textContent=CP.phase==='h'?'Select Hour':'Select Minute';
  document.getElementById('cp-display').textContent=`${CP.h}:${p2(CP.m)} ${CP.ap}`;
  document.getElementById('cp-am').classList.toggle('on',CP.ap==='AM');
  document.getElementById('cp-pm').classList.toggle('on',CP.ap==='PM');
  const R=76,cx=98,cy=98,face=document.getElementById('cp-face');
  if (CP.phase==='h') {
    face.innerHTML=Array.from({length:12},(_,i)=>{
      const n=i+1, a=(n/12)*2*Math.PI-Math.PI/2;
      return `<div class="cp-num${n===CP.h?' cp-sel':''}" style="left:${cx+R*Math.cos(a)}px;top:${cy+R*Math.sin(a)}px" onclick="cpPick(${n})">${n}</div>`;
    }).join('');
  } else {
    face.innerHTML=Array.from({length:12},(_,i)=>{
      const n=i*5, a=(i/12)*2*Math.PI-Math.PI/2;
      return `<div class="cp-num${n===CP.m?' cp-sel':''}" style="left:${cx+R*Math.cos(a)}px;top:${cy+R*Math.sin(a)}px" onclick="cpPick(${n})">${p2(n)}</div>`;
    }).join('');
  }
}

function cpPick(n) {
  if (CP.phase==='h') { CP.h=n; CP.phase='m'; cpRender(); }
  else                { CP.m=n; cpConfirm(); }
}

function cpSetAP(ap) { CP.ap=ap; cpRender(); }

function cpConfirm() {
  if (!CP.targetId) return;
  let h=CP.h;
  if (CP.ap==='PM'&&h!==12) h+=12;
  if (CP.ap==='AM'&&h===12) h=0;
  const el=document.getElementById(CP.targetId);
  if (el) el.value=`${p2(h)}:${p2(CP.m)}`;
  cpClose();
}

function cpCancel() { cpClose(); }
function cpClose()  { document.getElementById('clock-picker').classList.add('hidden'); CP.targetId=null; }

// ============================================================
//  EDIT PARTICIPANT MODAL
// ============================================================

function showEditParticipantModal(id) {
  const p=S.participants.find(p=>p.id===id); if (!p) return;
  S.editTarget=id; S.epReq=p.required;
  document.getElementById('ep-name').value=p.name;
  document.getElementById('ep-org').value=p.org||'';
  document.getElementById('ep-tz').value=p.tz;
  document.getElementById('ep-req-btn').className='tog-opt'+(p.required?' tog-req':'');
  document.getElementById('ep-opt-btn').className='tog-opt'+(!p.required?' tog-opt-s':'');
  document.getElementById('modal-edit-p').classList.remove('hidden');
}

function epSelReq(req) {
  S.epReq=req;
  document.getElementById('ep-req-btn').className='tog-opt'+(req?' tog-req':'');
  document.getElementById('ep-opt-btn').className='tog-opt'+(!req?' tog-opt-s':'');
}

function submitEditParticipant() {
  const name=document.getElementById('ep-name').value.trim();
  const org =document.getElementById('ep-org').value.trim();
  const tz  =document.getElementById('ep-tz').value;
  if (!name) { alert('Name is required.'); return; }
  const p=S.participants.find(p=>p.id===S.editTarget);
  if (p) { p.name=name; p.org=org; p.tz=tz; p.required=S.epReq; }
  closeModal('modal-edit-p'); renderAll();
}

function deleteParticipantFromModal() {
  const p=S.participants.find(p=>p.id===S.editTarget); if (!p) return;
  if (!confirm(`Remove "${p.name}"?`)) return;
  removeParticipant(S.editTarget);
  closeModal('modal-edit-p');
}

// ============================================================
//  ADD PARTICIPANT MODAL
// ============================================================

function showAddModal() {
  S.modalReq=true;
  document.getElementById('m-name').value='';
  document.getElementById('m-org').value='';
  document.getElementById('m-req-btn').className='tog-opt tog-req';
  document.getElementById('m-opt-btn').className='tog-opt';
  document.getElementById('modal-add').classList.remove('hidden');
  setTimeout(()=>document.getElementById('m-name').focus(),50);
}

function selReq(req) {
  S.modalReq=req;
  document.getElementById('m-req-btn').className='tog-opt'+(req?' tog-req':'');
  document.getElementById('m-opt-btn').className='tog-opt'+(!req?' tog-opt-s':'');
}

function submitAdd() {
  const name=document.getElementById('m-name').value.trim();
  const org =document.getElementById('m-org').value.trim();
  const tz  =document.getElementById('m-tz').value;
  if (!name) { alert('Please enter a name.'); return; }
  S.participants.push(mkParticipant(name,org,tz,S.modalReq));
  closeModal('modal-add'); renderAll();
}

// ============================================================
//  BULK ADD MODAL
// ============================================================

function showBulkAddModal() {
  S.bulkReq=true;
  document.getElementById('bulk-names').value='';
  document.getElementById('bulk-org').value='';
  document.getElementById('bulk-tz').value=S.hostTz;
  document.getElementById('bulk-req-btn').className='tog-opt tog-req';
  document.getElementById('bulk-opt-btn').className='tog-opt';
  document.getElementById('modal-bulk').classList.remove('hidden');
  setTimeout(()=>document.getElementById('bulk-names').focus(),50);
}

function bulkSelReq(req) {
  S.bulkReq=req;
  document.getElementById('bulk-req-btn').className='tog-opt'+(req?' tog-req':'');
  document.getElementById('bulk-opt-btn').className='tog-opt'+(!req?' tog-opt-s':'');
}

function submitBulkAdd() {
  const raw=document.getElementById('bulk-names').value;
  const org=document.getElementById('bulk-org').value.trim();
  const tz =document.getElementById('bulk-tz').value;
  const names=raw.split('\n').map(n=>n.trim()).filter(Boolean);
  if (!names.length) { alert('Enter at least one name.'); return; }
  names.forEach(name=>{ S.participants.push(mkParticipant(name,org,tz,S.bulkReq)); });
  closeModal('modal-bulk'); renderAll();
  const word=names.length===1?'participant':'participants';
  // Brief visual feedback without blocking alert
  const btn=document.querySelector('[onclick="showBulkAddModal()"]');
  if (btn) { const orig=btn.textContent; btn.textContent=`✓ Added ${names.length} ${word}`; setTimeout(()=>{btn.textContent=orig;},2000); }
}

// ============================================================
//  SHARED MODAL HELPERS
// ============================================================

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  cpClose();
}

// ============================================================
//  OPEN SLOTS FILTER INIT
// ============================================================

function initOpenSlots() {
  const today=new Date(), tp=dateParts(today,S.hostTz);
  const toDate=new Date(today.getTime()+14*864e5), tpp=dateParts(toDate,S.hostTz);
  document.getElementById('os-from').value=`${tp.year}-${p2(tp.month)}-${p2(tp.day)}`;
  document.getElementById('os-to').value=`${tpp.year}-${p2(tpp.month)}-${p2(tpp.day)}`;
  document.getElementById('dow-btns').innerHTML=
    ['Su','Mo','Tu','We','Th','Fr','Sa'].map((l,i)=>
      `<button class="dow-btn${i>=1&&i<=5?' on':''}" data-dow="${i}" onclick="this.classList.toggle('on')">${l}</button>`
    ).join('');
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

document.addEventListener('click', e => {
  // Modal backdrop
  if (e.target.classList.contains('modal-ov')) e.target.classList.add('hidden');

  // Clock picker – close on outside click (but not if clicking a clock-btn)
  const cp=document.getElementById('clock-picker');
  if (!cp.classList.contains('hidden')&&!cp.contains(e.target)&&!e.target.classList.contains('clock-btn')) cpClose();

  // Assign popup – close on outside click, but guard against immediately closing after drag-release
  const ap=document.getElementById('assign-popup');
  if (!ap.classList.contains('hidden')&&!ap.contains(e.target)&&Date.now()-_apOpenTime>300) apCancel();
});

document.addEventListener('keydown', e=>{
  if (e.key==='Escape') {
    cpClose(); apCancel();
    if (S.editId!==null) { exitEdit(); return; }
    document.querySelectorAll('.modal-ov:not(.hidden)').forEach(m=>m.classList.add('hidden'));
  }
  if (!e.target.matches('input,select,textarea')) {
    if (e.key==='ArrowLeft')  navigate(-1);
    if (e.key==='ArrowRight') navigate(1);
  }
});

document.getElementById('cal-wrapper').addEventListener('selectstart', e=>e.preventDefault());

// ============================================================
//  INIT
// ============================================================

function init() {
  loadState();
  applyDarkMode();

  const opts=TZS.map(t=>`<option value="${t.v}">${t.l}</option>`).join('');
  ['host-tz','m-tz','ep-tz','bulk-tz'].forEach(id=>{
    const el=document.getElementById(id);
    if (el) el.innerHTML=opts;
  });
  document.getElementById('host-tz').value=S.hostTz;
  document.getElementById('host-tz').addEventListener('change',function(){ S.hostTz=this.value; renderAll(); });
  document.getElementById('m-tz').value=S.hostTz;

  initOpenSlots();
  renderAll();
}

init();
