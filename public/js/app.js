(function () {
  const AUTH_KEY = 'learning-log:auth';
  const DEFAULT_CATEGORIES = ['Internship', 'Coursework', 'Thesis', 'Self-study'];

  function getAuth() {
    try {
      return JSON.parse(window.localStorage.getItem(AUTH_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  const auth = getAuth();
  if (!auth || !auth.token) {
    window.location.href = '/login.html';
    return;
  }

  function logout() {
    window.localStorage.removeItem(AUTH_KEY);
    window.location.href = '/login.html';
  }

  async function apiFetch(path, options) {
    options = options || {};
    const headers = Object.assign({ Authorization: 'Bearer ' + auth.token }, options.headers);
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, Object.assign({}, options, { headers }));
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res;
  }

  let entries = [];
  let categories = [];
  let filter = 'all';
  let techFilter = 'all';

  const CATEGORY_PALETTE = [
    { fg: '#4a1b0c', bg: 'var(--rust-soft)', dot: '#a5502c' },
    { fg: '#042c53', bg: 'var(--slate-soft)', dot: '#3d5a73' },
    { fg: '#04342c', bg: 'var(--moss-soft)', dot: '#3a5a45' },
    { fg: '#2c2c2a', bg: '#eeece4', dot: '#6b6a5f' },
    { fg: '#4a3407', bg: '#f3ecd8', dot: '#a5792c' },
    { fg: '#3a0c42', bg: '#ece1f3', dot: '#7a3d8a' }
  ];

  function styleForCategory(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function todayInputValue() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  function parseTags(raw) {
    return raw.split(',').map(t => t.trim()).filter(Boolean);
  }

  async function load() {
    try {
      const [catRes, entRes] = await Promise.all([apiFetch('/categories'), apiFetch('/entries')]);
      categories = await catRes.json();
      entries = await entRes.json();
    } catch (e) {
      console.error('Failed to load data', e);
      categories = [];
      entries = [];
    }
    if (!categories.length) categories = DEFAULT_CATEGORIES.slice();
    render();
  }

  function computeStreak() {
    if (entries.length === 0) return 0;
    const days = new Set(entries.map(e => new Date(e.date).toDateString()));
    let streak = 0;
    let cursor = new Date();
    while (days.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function renderStats() {
    const total = entries.length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = entries.filter(e => new Date(e.date).getTime() >= weekAgo).length;
    const streak = computeStreak();

    document.getElementById('streak-badge').innerHTML = streak > 0
      ? '<i class="ti ti-flame streak-icon" aria-hidden="true"></i>' + streak + ' day streak'
      : 'start today';

    const stats = [
      { label: 'total entries', value: total },
      { label: 'this week', value: thisWeek }
    ];

    const row = document.getElementById('stats-row');
    row.innerHTML = stats.map(s => `
      <div class="stat-card">
        <p class="mono stat-label">${s.label}</p>
        <p class="stat-value">${s.value}</p>
      </div>
    `).join('');

    renderTechFilterOptions();
  }

  function allTags() {
    const set = new Set();
    entries.forEach(e => (e.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function renderTechFilterOptions() {
    const sel = document.getElementById('tech-filter');
    const tags = allTags();
    const current = sel.value || 'all';
    sel.innerHTML = '<option value="all">All technologies</option>' +
      tags.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    if (tags.includes(current) || current === 'all') {
      sel.value = current;
    } else {
      sel.value = 'all';
      techFilter = 'all';
    }
  }

  function renderCategoryFilters() {
    const container = document.getElementById('category-filters');

    const allPill = `<button data-filter="all" class="filter-pill${filter === 'all' ? ' active' : ''}">All</button>`;

    const catPills = categories.map(cat => {
      const active = filter === cat;
      const removeBtn = categories.length > 1
        ? `<i class="ti ti-x filter-pill-remove" data-remove-category="${escapeHtml(cat)}" aria-label="Remove category ${escapeHtml(cat)}"></i>`
        : '';
      return `<button data-filter="${escapeHtml(cat)}" class="filter-pill${active ? ' active' : ''}">${escapeHtml(cat)}${removeBtn}</button>`;
    }).join('');

    const addControl = `
      <span class="category-add">
        <input id="new-category-input" type="text" placeholder="New category" class="mono category-add-input" />
        <button id="add-category-btn" class="category-add-btn" aria-label="Add category">
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </span>`;

    container.innerHTML = allPill + catPills + addControl;

    container.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        if (ev.target.hasAttribute('data-remove-category')) return;
        filter = btn.getAttribute('data-filter');
        renderCategoryFilters();
        renderEntries();
      });
    });

    container.querySelectorAll('[data-remove-category]').forEach(icon => {
      icon.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const cat = icon.getAttribute('data-remove-category');
        if (categories.length <= 1) return;
        try {
          const res = await apiFetch('/categories/' + encodeURIComponent(cat), { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) { alert(data.error || 'Could not remove category.'); return; }
          categories = data;
          if (filter === cat) filter = 'all';
          renderCategoryFilters();
          renderCategoryOptions();
          renderEntries();
        } catch (e) { /* handled by apiFetch on auth failure */ }
      });
    });

    async function addCategory() {
      const input = document.getElementById('new-category-input');
      const name = input.value.trim();
      if (!name) return;
      try {
        const res = await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name }) });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Could not add category.'); return; }
        categories = data;
        renderCategoryFilters();
        renderCategoryOptions();
      } catch (e) { /* handled by apiFetch on auth failure */ }
    }

    document.getElementById('add-category-btn').addEventListener('click', addCategory);
    document.getElementById('new-category-input').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); addCategory(); }
    });
  }

  function renderCategoryOptions() {
    const sel = document.getElementById('f-category');
    const current = sel.value;
    sel.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    sel.value = categories.includes(current) ? current : categories[0];
  }

  function renderEntries() {
    const list = document.getElementById('entries-list');
    const empty = document.getElementById('empty-state');
    let filtered = filter === 'all' ? entries : entries.filter(e => e.category === filter);
    if (techFilter !== 'all') {
      filtered = filtered.filter(e => (e.tags || []).includes(techFilter));
    }
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
      list.innerHTML = '';
      empty.classList.add('visible');
      return;
    }
    empty.classList.remove('visible');

    list.innerHTML = sorted.map((e) => {
      const style = styleForCategory(e.category);
      return `
        <div class="entry-row">
          <div class="mono entry-date">${fmtDate(e.date)}</div>
          <div class="entry-main">
            <div class="entry-head">
              <span class="entry-skill">${escapeHtml(e.skill)}</span>
              <span class="mono entry-badge" style="background:${style.bg}; color:${style.fg};">${escapeHtml(e.category)}</span>
            </div>
            ${e.note ? `<p class="entry-note">${escapeHtml(e.note)}</p>` : ''}
            ${(e.tags && e.tags.length) ? `<div class="entry-tags">${e.tags.map(t => `<span class="mono entry-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          <button data-delete="${e.id}" class="entry-delete" aria-label="Delete entry">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        try {
          const res = await apiFetch('/entries/' + encodeURIComponent(id), { method: 'DELETE' });
          if (!res.ok && res.status !== 204) { alert('Could not delete entry.'); return; }
          entries = entries.filter(e => e.id !== id);
          render();
        } catch (e) { /* handled by apiFetch on auth failure */ }
      });
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function render() {
    renderStats();
    renderCategoryFilters();
    renderCategoryOptions();
    renderEntries();
  }

  document.getElementById('user-badge').textContent = auth.username;
  document.getElementById('logout-btn').addEventListener('click', logout);

  document.getElementById('tech-filter').addEventListener('change', (e) => {
    techFilter = e.target.value;
    renderEntries();
  });

  document.getElementById('f-submit').addEventListener('click', async () => {
    const skillEl = document.getElementById('f-skill');
    const noteEl = document.getElementById('f-note');
    const catEl = document.getElementById('f-category');
    const tagsEl = document.getElementById('f-tags');
    const dateEl = document.getElementById('f-date');
    const skill = skillEl.value.trim();
    if (!skill) { skillEl.focus(); return; }

    const chosenDate = dateEl.value ? new Date(dateEl.value + 'T12:00:00') : new Date();

    try {
      const res = await apiFetch('/entries', {
        method: 'POST',
        body: JSON.stringify({
          skill: skill,
          category: catEl.value,
          note: noteEl.value.trim(),
          tags: parseTags(tagsEl.value),
          date: chosenDate.toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not save entry.'); return; }

      entries.push(data);
      skillEl.value = '';
      noteEl.value = '';
      tagsEl.value = '';
      dateEl.value = todayInputValue();
      render();
    } catch (e) { /* handled by apiFetch on auth failure */ }
  });

  function getWeekEntries() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const weekEntries = entries.filter(e => {
      const d = new Date(e.date);
      return d >= weekAgo && d < startOfTomorrow;
    });
    const sorted = [...weekEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const rangeStr = weekAgo.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' – ' + now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return { sorted, weekAgo, now, rangeStr };
  }

  function buildWeeklyReport() {
    const { sorted, rangeStr } = getWeekEntries();

    const byCategory = {};
    sorted.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + 1; });

    const tagCounts = {};
    sorted.forEach(e => (e.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    let md = `# Weekly learning report\n\n`;
    md += `**Range:** ${rangeStr}\n`;
    md += `**Entries logged:** ${sorted.length}\n\n`;

    if (Object.keys(byCategory).length) {
      md += `## By category\n\n`;
      Object.entries(byCategory).forEach(([cat, count]) => {
        md += `- ${cat}: ${count}\n`;
      });
      md += `\n`;
    }

    if (topTags.length) {
      md += `## Technologies touched\n\n`;
      topTags.forEach(([tag, count]) => {
        md += `- ${tag} (${count})\n`;
      });
      md += `\n`;
    }

    if (sorted.length) {
      md += `## Entries\n\n`;
      sorted.forEach(e => {
        const d = new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        md += `### ${d} – ${e.skill} (${e.category})\n\n`;
        if (e.note) md += `${e.note}\n\n`;
        if (e.tags && e.tags.length) md += `Technologies: ${e.tags.join(', ')}\n\n`;
      });
    } else {
      md += `No entries logged this week.\n`;
    }

    return md;
  }

  document.getElementById('export-btn').addEventListener('click', () => {
    const md = buildWeeklyReport();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = todayInputValue();
    a.href = url;
    a.download = `weekly-report-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  const DOCX_CDN_URL = 'https://cdn.jsdelivr.net/npm/docx@8.2.2/build/index.js';
  let docxLibPromise = null;
  function loadDocxLib() {
    if (!docxLibPromise) docxLibPromise = import(DOCX_CDN_URL);
    return docxLibPromise;
  }

  async function buildWeeklyReportDocx() {
    const docx = await loadDocxLib();
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel,
      Table, TableRow, TableCell, WidthType, ShadingType, VerticalAlign
    } = docx;

    const { sorted, rangeStr } = getWeekEntries();

    const COLUMN_WIDTHS = [14, 22, 16, 22, 26];
    const HEADERS = ['Date', 'Skill', 'Category', 'Technologies', 'Notes'];

    function headerCell(text, width) {
      return new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        shading: { fill: '1C2321', type: ShadingType.CLEAR, color: 'auto' },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })] })]
      });
    }

    function bodyCell(text, width) {
      return new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: text || '—', size: 18 })] })]
      });
    }

    const headerRow = new TableRow({
      tableHeader: true,
      children: HEADERS.map((h, i) => headerCell(h, COLUMN_WIDTHS[i]))
    });

    const bodyRows = sorted.length
      ? sorted.map(e => new TableRow({
          children: [
            bodyCell(new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), COLUMN_WIDTHS[0]),
            bodyCell(e.skill, COLUMN_WIDTHS[1]),
            bodyCell(e.category, COLUMN_WIDTHS[2]),
            bodyCell((e.tags || []).join(', '), COLUMN_WIDTHS[3]),
            bodyCell(e.note, COLUMN_WIDTHS[4])
          ]
        }))
      : [new TableRow({
          children: [new TableCell({
            columnSpan: HEADERS.length,
            children: [new Paragraph('No entries logged this week.')]
          })]
        })];

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows]
    });

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: 'Weekly Learning Report', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: `Range: ${rangeStr}`, bold: true })] }),
          new Paragraph({ text: `Entries logged: ${sorted.length}` }),
          new Paragraph({ text: '' }),
          table
        ]
      }]
    });

    return Packer.toBlob(doc);
  }

  document.getElementById('export-docx-btn').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Building…';
    try {
      const blob = await buildWeeklyReportDocx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weekly-report-${todayInputValue()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to build .docx report', err);
      alert('Could not build the Word report. Check your internet connection (the .docx library loads from a CDN) and try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  document.getElementById('f-date').value = todayInputValue();
  load();
})();
