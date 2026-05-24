// VIM — screen navigation / router


/** Elenco ID di tutte le schermate disponibili */
const SCREENS = ['screen-lang', 'screen-home', 'screen-form', 'screen-drafts', 'screen-outbox'];

/**
 * showScreen(id, title, showPill) — Attiva una schermata e aggiorna l'app bar.
 *
 * @param {string}  id       - ID della schermata da attivare
 * @param {string}  title    - Titolo da mostrare nell'app bar
 * @param {boolean} showPill - True per mostrare pill contatore e progress bar
 */
function showScreen(id, title, showPill) {
  SCREENS.forEach(s => document.getElementById(s).classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('bar-title').textContent = title;
  const isHome = id === 'screen-home' || id === 'screen-lang';
  document.getElementById('bar-back-btn').style.display = isHome ? 'none' : 'inline-flex';
  document.getElementById('prog-track').style.display   = showPill ? '' : 'none';
  // Il pill "Sezione X/9" appartiene solo al form: nascondilo altrove.
  const pill = document.getElementById('pill');
  if (pill) pill.style.display = showPill ? '' : 'none';
}

/**
 * goHome() — Torna alla schermata home.
 * Nasconde bottone lingua dall'app bar e riapplica le traduzioni UI.
 */
function goHome() {
  window._compiling = false;
  showScreen('screen-home', tr().appTitle, false);
  document.getElementById('lang-btn').style.display = 'none';
  applyUILang();
}

/**
 * barBack() — Azione del pulsante indietro nell'app bar.
 * Durante la compilazione apre la popup di uscita (confirmExit);
 * nelle altre schermate torna direttamente alla home.
 */
function barBack() {
  if (window._compiling) confirmExit();
  else goHome();
}

/**
 * startFillForm() — Avvia la compilazione di un NUOVO modulo, sempre da zero.
 * La ripresa di una compilazione avviene dalle bozze (resumeDraft).
 */
function startFillForm() {
  window._editingDraft = null;   // nuovo modulo, non una bozza
  answers = {}; mediaFiles = {}; pageIdx = 0;
  openForm();
}

/** resumeDraft(i) — Riprende la bozza i dall'elenco bozze. */
function resumeDraft(i) {
  const d = drafts[i];
  if (!d) return;
  window._editingDraft = i;
  answers    = JSON.parse(JSON.stringify(d.answers));
  mediaFiles = Object.assign({}, d.mediaFiles || {});
  pageIdx    = d.pageIdx || 0;
  openForm(d.fieldIdx || 0);
}

/** openForm(fieldIdx) — Mostra la schermata form e renderizza (helper comune). */
function openForm(fieldIdx) {
  window._fieldIdx  = fieldIdx || 0;
  window._compiling = true;
  showScreen('screen-form', tr().questionnaire, true);
  document.getElementById('lang-btn').style.display       = '';
  document.getElementById('form-nav-extra').style.display = 'flex';
  renderPage(pageIdx);
}

/** changeLang() — Cambio lingua dall'app bar DURANTE la compilazione:
 *  ricorda il punto (sezione + campo) per tornarci dopo la scelta. */
function changeLang() {
  langReturn      = 'form';
  langReturnField = window._fieldIdx || 0;
  renderLangScreen();
  showScreen('screen-lang', tr().cambiaLinguaTitle, false);
}

/** homeLangChange() — Cambio lingua dalla home: dopo la scelta torna alla home. */
function homeLangChange() {
  langReturn = 'home';
  renderLangScreen();
  showScreen('screen-lang', tr().cambiaLinguaTitle, false);
}

/** showDraft() — Mostra l'elenco delle bozze salvate (schermata dedicata). */
function showDraft() {
  window._compiling = false;
  showScreen('screen-drafts', tr().bozzaTitle, false);
  renderDrafts();
}

/** showOutbox() — Mostra la coda di moduli da inviare */
function showOutbox() {
  showScreen('screen-outbox', tr().outboxTitle, false);
  renderOutbox();
}

/**
 * showSent() — Mostra l'elenco dei moduli già inviati.
 * In questa versione mostra solo metadati (data invio), non le risposte.
 */
function showSent() {
  window._compiling = false;
  showScreen('screen-form', tr().inviatiTitle, false);
  document.getElementById('form-nav').style.display       = 'none';
  document.getElementById('form-nav-extra').style.display = 'none';
  if (!sentForms.length) {
    document.getElementById('form-area').innerHTML =
      '<div class="state-error"><p style="color:var(--muted)">' + tr().noInviati + '</p></div>';
    return;
  }
  let html = '<div style="padding:12px 0">';
  sentForms.forEach((f, i) => {
    html += `<div style="padding:12px 0;border-bottom:1px solid var(--border);font-size:.82rem;">
      <div style="font-weight:500">#${i+1}</div>
      <div style="color:var(--muted);font-size:.72rem">${f.sentAt}</div>
    </div>`;
  });
  html += '</div>';
  document.getElementById('form-area').innerHTML = html;
}


