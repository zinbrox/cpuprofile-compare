import { parseProfile, shortUrl } from './parser.js';
import { buildComparisonRows, buildPackageRows } from './aggregator.js';

// ── state ──────────────────────────────────────────────────────────────────
const state = {
  profiles: [],   // [{ name, functions, totalDurationMs }]
  sortBy: 'totalPct',
  topN: 100,
  filter: '',
  hideIdle: true,
  viewMode: 'functions',  // 'functions' | 'packages' | 'usercode'
  source: 'all',          // 'all' | 'user' | 'pkg:<name>'
  diffBase: 0,
  diffCompare: 1,
  pkgSortBy: 'selfMs',
};

// ── elements ───────────────────────────────────────────────────────────────
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const browseBtn       = document.getElementById('browseBtn');
const chipsRow        = document.getElementById('chipsRow');
const chips           = document.getElementById('chips');
const controls        = document.getElementById('controls');
const tableWrap       = document.getElementById('tableWrap');
const tableHead       = document.getElementById('tableHead');
const tableBody       = document.getElementById('tableBody');
const emptyState      = document.getElementById('emptyState');
const sortBy          = document.getElementById('sortBy');
const filterInput     = document.getElementById('filterInput');
const topNInput       = document.getElementById('topN');
const hideIdle        = document.getElementById('hideIdle');
const viewModeEl      = document.getElementById('viewMode');
const sourceFilterEl  = document.getElementById('sourceFilter');
const sortByGroup     = document.getElementById('sortByGroup');
const filterGroup     = document.getElementById('filterGroup');
const topNGroup       = document.getElementById('topNGroup');
const sourceFilterGroup = document.getElementById('sourceFilterGroup');
const diffGroup       = document.getElementById('diffGroup');
const diffBaseEl      = document.getElementById('diffBase');
const diffCompareEl   = document.getElementById('diffCompare');
const pkgSortByEl     = document.getElementById('pkgSortBy');
const pkgSortByGroup  = document.getElementById('pkgSortByGroup');

// ── file loading ───────────────────────────────────────────────────────────
browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => loadFiles(e.target.files));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  loadFiles(e.dataTransfer.files);
});

async function loadFiles(fileList) {
  const toLoad = Array.from(fileList);
  for (const file of toLoad) {
    if (state.profiles.find(p => p.name === file.name)) continue;
    try {
      const text = await file.text();
      const { functions, totalDurationMs } = parseProfile(text);
      state.profiles.push({ name: file.name, functions, totalDurationMs });
    } catch (err) {
      alert(`Failed to parse ${file.name}: ${err.message}`);
    }
  }
  fileInput.value = '';
  render();
}

// ── controls ───────────────────────────────────────────────────────────────
sortBy.addEventListener('change', () => { state.sortBy = sortBy.value; renderTable(); });
filterInput.addEventListener('input', () => { state.filter = filterInput.value; renderTable(); });
topNInput.addEventListener('change', () => { state.topN = Math.max(10, parseInt(topNInput.value) || 100); renderTable(); });
hideIdle.addEventListener('change', () => { state.hideIdle = hideIdle.checked; renderTable(); });
viewModeEl.addEventListener('change', () => { state.viewMode = viewModeEl.value; render(); });
sourceFilterEl.addEventListener('change', () => { state.source = sourceFilterEl.value; renderTable(); });
diffBaseEl.addEventListener('change', () => { state.diffBase = parseInt(diffBaseEl.value); renderTable(); });
diffCompareEl.addEventListener('change', () => { state.diffCompare = parseInt(diffCompareEl.value); renderTable(); });
pkgSortByEl.addEventListener('change', () => { state.pkgSortBy = pkgSortByEl.value; renderTable(); });

// ── render chips ───────────────────────────────────────────────────────────
function renderChips() {
  chips.innerHTML = '';
  for (const [i, p] of state.profiles.entries()) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.index = i;

    const dot = document.createElement('span');
    dot.className = 'chip__dot';
    dot.style.background = profileColor(i);

    const moveLeft = document.createElement('button');
    moveLeft.className = 'chip__move';
    moveLeft.textContent = '←';
    moveLeft.title = 'Move left';
    moveLeft.disabled = i === 0;
    moveLeft.addEventListener('click', () => {
      [state.profiles[i - 1], state.profiles[i]] = [state.profiles[i], state.profiles[i - 1]];
      render();
    });

    const moveRight = document.createElement('button');
    moveRight.className = 'chip__move';
    moveRight.textContent = '→';
    moveRight.title = 'Move right';
    moveRight.disabled = i === state.profiles.length - 1;
    moveRight.addEventListener('click', () => {
      [state.profiles[i], state.profiles[i + 1]] = [state.profiles[i + 1], state.profiles[i]];
      render();
    });

    const label = document.createElement('span');
    label.className = 'chip__label';
    label.textContent = p.name;

    const dur = document.createElement('span');
    dur.className = 'chip__dur';
    dur.textContent = `${(p.totalDurationMs / 1000).toFixed(1)}s`;

    const remove = document.createElement('button');
    remove.className = 'chip__remove';
    remove.textContent = '✕';
    remove.title = 'Remove';
    remove.addEventListener('click', () => {
      state.profiles.splice(i, 1);
      render();
    });

    chip.append(dot, moveLeft, moveRight, label, dur, remove);
    chips.appendChild(chip);
  }
}

// ── populate source filter dropdown ───────────────────────────────────────
function populateSourceFilter() {
  const packages = new Set();
  for (const p of state.profiles) {
    for (const entry of p.functions.values()) {
      if (entry.packageName) packages.add(entry.packageName);
    }
  }

  const current = sourceFilterEl.value;
  sourceFilterEl.innerHTML =
    '<option value="all">All</option><option value="user">User Code</option>';
  for (const pkg of [...packages].sort()) {
    const opt = document.createElement('option');
    opt.value = `pkg:${pkg}`;
    opt.textContent = pkg;
    sourceFilterEl.appendChild(opt);
  }

  const valid = ['all', 'user', ...[...packages].map(p => `pkg:${p}`)];
  sourceFilterEl.value = valid.includes(current) ? current : 'all';
  state.source = sourceFilterEl.value;
}

// ── populate diff base/compare selectors ──────────────────────────────────
function populateDiffSelectors() {
  const n = state.profiles.length;

  const makeOpts = (sel, current) => {
    sel.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = state.profiles[i].name.replace(/\.cpuprofile$/, '');
      sel.appendChild(opt);
    }
    sel.value = current < n ? current : 0;
  };

  makeOpts(diffBaseEl, state.diffBase);
  makeOpts(diffCompareEl, state.diffCompare);
  state.diffBase    = parseInt(diffBaseEl.value);
  state.diffCompare = parseInt(diffCompareEl.value);

  if (state.diffBase === state.diffCompare && n >= 2) {
    state.diffCompare = state.diffBase === 0 ? 1 : 0;
    diffCompareEl.value = state.diffCompare;
  }
}

// ── sync which controls are visible ───────────────────────────────────────
function syncControlVisibility() {
  const isPkg  = state.viewMode === 'packages';
  const isUser = state.viewMode === 'usercode';
  sortByGroup.hidden       = isPkg;
  filterGroup.hidden       = isPkg;
  topNGroup.hidden         = isPkg;
  sourceFilterGroup.hidden = isPkg || isUser;
  diffGroup.hidden         = state.profiles.length < 2;
  pkgSortByGroup.hidden    = !isPkg;
}

// ── render table header (functions view) ──────────────────────────────────
function renderHead() {
  const n = state.profiles.length;
  const baseName = state.profiles[state.diffBase]?.name.replace(/\.cpuprofile$/, '') ?? '';
  const cmpName  = state.profiles[state.diffCompare]?.name.replace(/\.cpuprofile$/, '') ?? '';

  let html = '<tr><th class="col-fn">Function</th><th class="col-file">File : Line</th>';
  for (let i = 0; i < n; i++) {
    const name = state.profiles[i].name.replace(/\.cpuprofile$/, '');
    html += `<th colspan="3" class="col-profile-header" style="border-bottom: 2px solid ${profileColor(i)}">${esc(name)}</th>`;
  }
  if (n >= 2) html += `<th class="col-delta">Δ Total<br><small>${esc(cmpName)} − ${esc(baseName)}</small></th>`;
  html += '</tr><tr><th></th><th></th>';
  for (let i = 0; i < n; i++) {
    html += '<th class="col-num">Self %</th><th class="col-num">Total %</th><th class="col-num">Total ms</th>';
  }
  if (n >= 2) html += '<th></th>';
  html += '</tr>';
  tableHead.innerHTML = html;
}

// ── render table dispatcher ────────────────────────────────────────────────
function renderTable() {
  if (state.viewMode === 'packages') return renderPackagesTable();
  renderFunctionsTable();
}

// ── render functions table ─────────────────────────────────────────────────
function renderFunctionsTable() {
  renderHead();

  const effectiveSource = state.viewMode === 'usercode' ? 'user' : state.source;
  const rows = buildComparisonRows(state.profiles, {
    sortBy: state.sortBy,
    topN: state.topN,
    filter: state.filter,
    hideIdle: state.hideIdle,
    source: effectiveSource,
    diffBase: state.diffBase,
    diffCompare: state.diffCompare,
  });

  if (rows.length === 0) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;
  tableWrap.hidden = false;

  const n = state.profiles.length;
  const frag = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.isIdle) tr.classList.add('row-idle');

    const tdFn = document.createElement('td');
    tdFn.className = 'col-fn';
    tdFn.textContent = row.functionName || '(anonymous)';
    tdFn.title = row.functionName;

    const tdFile = document.createElement('td');
    tdFile.className = 'col-file';
    const short = shortUrl(row.url);
    tdFile.textContent = short ? `${short}:${row.lineNumber}` : '';
    tdFile.title = row.url ? `${row.url}:${row.lineNumber}` : '';

    tr.append(tdFn, tdFile);

    for (let i = 0; i < n; i++) {
      const pp = row.perProfile[i];
      tr.append(
        numCell(pp.selfPct.toFixed(2) + '%'),
        numCell(pp.totalPct.toFixed(2) + '%'),
        numCell(pp.totalMs.toFixed(1)),
      );
    }

    if (n >= 2 && (row.delta !== null || row.deltaMs !== null)) {
      const td = document.createElement('td');
      td.className = 'col-delta';
      const pct = row.delta ?? 0;
      const ms  = row.deltaMs ?? 0;
      const sign = pct >= 0 ? '+' : '';
      const msSign = ms >= 0 ? '+' : '';
      td.innerHTML = `<span>${sign}${pct.toFixed(2)}%</span><br><span class="delta-sub">${msSign}${ms.toFixed(1)} ms</span>`;
      const abs = Math.abs(pct);
      if (abs < 0.1) {
        td.classList.add('delta-neutral');
      } else if (pct > 0) {
        td.classList.add('delta-slower');
      } else {
        td.classList.add('delta-faster');
      }
      tr.appendChild(td);
    }

    frag.appendChild(tr);
  }

  tableBody.innerHTML = '';
  tableBody.appendChild(frag);
}

// ── render packages table ──────────────────────────────────────────────────
function renderPackagesTable() {
  const rows = buildPackageRows(state.profiles, {
    hideIdle: state.hideIdle,
    diffBase: state.diffBase,
    diffCompare: state.diffCompare,
    sortBy: state.pkgSortBy,
  });

  if (rows.length === 0) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;
  tableWrap.hidden = false;

  const n = state.profiles.length;
  const baseName = state.profiles[state.diffBase]?.name.replace(/\.cpuprofile$/, '') ?? '';
  const cmpName  = state.profiles[state.diffCompare]?.name.replace(/\.cpuprofile$/, '') ?? '';

  let html = '<tr><th class="col-fn">Package / Source</th>';
  for (let i = 0; i < n; i++) {
    const name = state.profiles[i].name.replace(/\.cpuprofile$/, '');
    html += `<th colspan="2" class="col-profile-header" style="border-bottom: 2px solid ${profileColor(i)}">${esc(name)}</th>`;
  }
  if (n >= 2) html += `<th class="col-delta">Δ Self ms / %<br><small>${esc(cmpName)} − ${esc(baseName)}</small></th>`;
  html += '</tr><tr><th></th>';
  for (let i = 0; i < n; i++) html += '<th class="col-num">Self %</th><th class="col-num">Self ms</th>';
  if (n >= 2) html += '<th></th>';
  html += '</tr>';
  tableHead.innerHTML = html;

  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');

    const tdPkg = document.createElement('td');
    tdPkg.className = 'col-fn';
    tdPkg.textContent = row.label;
    if (row.packageName === null) tdPkg.style.fontStyle = 'italic';
    tr.appendChild(tdPkg);

    for (let i = 0; i < n; i++) {
      const pp = row.perProfile[i];
      tr.append(
        numCell(pp.selfPct.toFixed(2) + '%'),
        numCell(pp.selfMs.toFixed(1)),
      );
    }

    if (n >= 2 && row.delta !== null) {
      const td = document.createElement('td');
      td.className = 'col-delta';
      const ms  = row.delta ?? 0;
      const pct = row.deltaPct ?? 0;
      const sign  = ms  >= 0 ? '+' : '';
      const pSign = pct >= 0 ? '+' : '';
      td.innerHTML = `<span>${sign}${ms.toFixed(1)} ms</span><br><span class="delta-sub">${pSign}${pct.toFixed(2)}%</span>`;
      const abs = Math.abs(ms);
      if (abs < 1) {
        td.classList.add('delta-neutral');
      } else if (ms > 0) {
        td.classList.add('delta-slower');
      } else {
        td.classList.add('delta-faster');
      }
      tr.appendChild(td);
    }

    frag.appendChild(tr);
  }

  tableBody.innerHTML = '';
  tableBody.appendChild(frag);
}

// ── top-level render ───────────────────────────────────────────────────────
function render() {
  const hasProfiles = state.profiles.length > 0;

  chipsRow.hidden  = !hasProfiles;
  controls.hidden  = !hasProfiles;

  if (!hasProfiles) {
    tableWrap.hidden = true;
    emptyState.hidden = true;
    return;
  }

  renderChips();
  populateSourceFilter();
  populateDiffSelectors();
  syncControlVisibility();
  renderTable();
}

// ── helpers ────────────────────────────────────────────────────────────────
function numCell(text) {
  const td = document.createElement('td');
  td.className = 'col-num';
  td.textContent = text;
  return td;
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PROFILE_COLORS = ['#4fc3f7', '#ffb74d', '#a5d6a7', '#ce93d8', '#f48fb1', '#80cbc4'];
function profileColor(i) {
  return PROFILE_COLORS[i % PROFILE_COLORS.length];
}
