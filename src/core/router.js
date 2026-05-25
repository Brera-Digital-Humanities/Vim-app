// VIM — screen navigation / router


/** IDs of all screens */
const SCREENS = ['screen-login', 'screen-lang', 'screen-home', 'screen-form', 'screen-drafts', 'screen-outbox'];

/**
 * showScreen(id, title, showPill) — Activate a screen and update the app bar.
 * showPill toggles the section counter pill + progress bar (form only).
 */
function showScreen(id, title, showPill) {
  SCREENS.forEach(s => document.getElementById(s).classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('bar-title').textContent = title;
  const isHome = id === 'screen-home' || id === 'screen-lang' || id === 'screen-login';
  document.getElementById('bar-back-btn').style.display = isHome ? 'none' : 'inline-flex';
  document.getElementById('prog-track').style.display   = showPill ? '' : 'none';
  // The "Section X/9" pill belongs to the form only: hide it elsewhere.
  const pill = document.getElementById('pill');
  if (pill) pill.style.display = showPill ? '' : 'none';
}

/** goHome() — Back to the home screen; hide the language button, re-apply UI texts. */
function goHome() {
  window._compiling = false;
  showScreen('screen-home', tr().appTitle, false);
  document.getElementById('lang-btn').style.display = 'none';
  applyUILang();
  updateOutboxBadge();   // refresh drafts/outbox/sent count badges
  if (typeof updateStorageWarning === 'function') updateStorageWarning();
}

/**
 * barBack() — App-bar back button: while filling, open the exit popup
 * (confirmExit); elsewhere go straight home.
 */
function barBack() {
  if (window._compiling) confirmExit();
  else goHome();
}

/** startFillForm() — Start a NEW form from scratch (resume happens via drafts). */
function startFillForm() {
  window._editingDraft    = null;   // new form, not a draft
  window._editingOutboxId = null;   // not editing a queued form
  window._instanceId      = newId();  // fresh instanceID for this form
  answers = {}; mediaFiles = {}; pageIdx = 0;
  openForm();
}

/** resumeDraft(i) — Resume draft i from the drafts list. */
function resumeDraft(i) {
  const d = drafts[i];
  if (!d) return;
  window._editingDraft    = i;
  window._editingOutboxId = null;
  window._instanceId      = d.id;  // keep the draft's instanceID through to submit
  answers    = JSON.parse(JSON.stringify(d.answers));
  mediaFiles = Object.assign({}, d.mediaFiles || {});
  pageIdx    = d.pageIdx || 0;
  openForm(d.fieldIdx || 0);
}

/** openForm(fieldIdx) — Show the form screen and render it (shared helper). */
function openForm(fieldIdx) {
  window._fieldIdx  = fieldIdx || 0;
  window._compiling = true;
  showScreen('screen-form', tr().questionnaire, true);
  document.getElementById('lang-btn').style.display       = '';
  document.getElementById('form-nav-extra').style.display = 'flex';
  renderPage(pageIdx);
}

/** changeLang() — Change language from the app bar WHILE filling: remember the
 *  spot (section + field) to return to after choosing. */
function changeLang() {
  langReturn      = 'form';
  langReturnField = window._fieldIdx || 0;
  renderLangScreen();
  showScreen('screen-lang', tr().cambiaLinguaTitle, false);
}

/** homeLangChange() — Change language from home: return home after choosing. */
function homeLangChange() {
  langReturn = 'home';
  renderLangScreen();
  showScreen('screen-lang', tr().cambiaLinguaTitle, false);
}

/** showDraft() — Show the saved drafts list (dedicated screen). */
function showDraft() {
  window._compiling = false;
  showScreen('screen-drafts', tr().bozzaTitle, false);
  renderDrafts();
}

/** showOutbox() — Show the queue of forms to send. */
function showOutbox() {
  showScreen('screen-outbox', tr().outboxTitle, false);
  renderOutbox();
}

/** showSent() — List the sent forms (name + date); each opens a read-only view.
 *  Only text is kept (no media), so the detail shows values and file names. */
function showSent() {
  window._compiling = false;
  showScreen('screen-form', tr().inviatiTitle, false);
  document.getElementById('form-nav').style.display       = 'none';
  document.getElementById('form-nav-extra').style.display = 'none';
  const area = document.getElementById('form-area');
  if (!sentForms.length) {
    area.innerHTML = '<div class="state-error"><p style="color:var(--muted)">' + tr().noInviati + '</p></div>';
    return;
  }
  let html = '<div style="padding:12px 0">';
  sentForms.forEach((f, i) => {
    html += `<div onclick="showSentDetail(${i})" style="padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div>
        <div style="font-weight:500;font-size:.84rem;color:var(--ink)">${f.label || ('#' + (i + 1))}</div>
        <div style="color:var(--muted);font-size:.72rem">${f.sentAt}</div>
      </div>
      <span style="color:var(--muted)">›</span>
    </div>`;
  });
  html += '</div>';
  area.innerHTML = html;
}

/** showSentDetail(i) — Read-only view of a sent form: field labels + values,
 *  media shown as the file name (no media is stored). */
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
  document.getElementById('form-area').innerHTML = `
    <button onclick="showSent()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:8px 0">‹ ${tr().back}</button>
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


