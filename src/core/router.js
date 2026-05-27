// VIM — screen navigation / router


/** IDs of all screens */
const SCREENS = ['screen-login', 'screen-lang', 'screen-home', 'screen-form', 'screen-drafts', 'screen-outbox', 'screen-sent', 'screen-account'];

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
  if (typeof updateUserBar === 'function') updateUserBar();
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
  recalc();   // derive calculate fields (e.g. paese_group) from current answers
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

/** showSent() — Open the sent-forms screen (list rendered by renderSent). */
function showSent() {
  window._compiling = false;
  showScreen('screen-sent', tr().inviatiTitle, false);
  renderSent();
}

/** showAccount() — Open the logged-user screen. */
function showAccount() {
  if (!isLoggedIn()) return;
  window._compiling = false;
  showScreen('screen-account', tr().accountTitle, false);
  renderAccount();
}

