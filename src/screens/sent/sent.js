// VIM — sent screen: read-only list of sent forms (text only, no media)

/** renderSent() — Populate the sent-forms list (name + date); a row opens the
 *  read-only detail. Same card style as drafts/outbox. */
function renderSent() {
  const header = document.getElementById('sent-header-label');
  if (header) header.textContent = tr().inviatiTitle;

  const list = document.getElementById('sent-list');
  if (!sentForms.length) {
    list.innerHTML = '<p class="list-empty">' + tr().noInviati + '</p>';
    return;
  }
  list.innerHTML = '';
  sentForms.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'list-card';
    el.style.cursor = 'pointer';
    el.onclick = () => showSentDetail(i);
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div>
          <div class="card-title">${f.label || ('#' + (i + 1))}</div>
          <div class="card-meta">${f.sentAt}</div>
        </div>
        <span style="color:var(--muted)">›</span>
      </div>`;
    list.appendChild(el);
  });
}

/** showSentDetail(i) — Read-only view of a sent form: field labels + values,
 *  media shown as the file name (no media is stored). Back returns to the list. */
function showSentDetail(i) {
  const f = sentForms[i];
  if (!f) return;
  let rows = '';
  PAGES.forEach(pg => pg.fields.forEach(q => {
    const v = f.answers ? f.answers[q.name] : undefined;
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
    rows += `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:.7rem;color:var(--muted)">${getLabel(q)}</div>
      <div style="font-size:.84rem;color:var(--ink)">${_sentValueText(q, v)}</div>
    </div>`;
  }));
  if (!rows) rows = '<p style="color:var(--muted);font-size:.82rem">—</p>';
  document.getElementById('sent-list').innerHTML = `
    <button onclick="renderSent()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:8px 0">‹ ${tr().back}</button>
    <div style="font-weight:500;font-size:.9rem;margin:4px 0 2px;color:var(--ink)">${f.label || ('#' + (i + 1))}</div>
    <div style="color:var(--muted);font-size:.72rem;margin-bottom:10px">${f.sentAt}</div>
    ${rows}`;
}

// Display text for a sent value: resolve choice labels; text/date/media shown as-is.
function _sentValueText(q, v) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const t = q.type || '';
  if (t.startsWith('select_')) {
    const list = CHOICES[t.split(' ')[1]] || [];
    return (Array.isArray(v) ? v : [v])
      .map(n => { const c = list.find(x => x.name === n); return esc(c ? getChoiceLabel(c) : n); })
      .join(', ');
  }
  return esc(v);   // text / number / date / media filename
}
