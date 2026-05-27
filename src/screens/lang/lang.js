// VIM — language screen: select, confirm, apply UI language


/** renderLangScreen() — Populate the language list (at init and whenever the screen opens). */
function renderLangScreen() {
  const list = document.getElementById('lang-list');
  list.innerHTML = '';
  UI_LANGS.forEach((lang, i) => {
    const item = document.createElement('div');
    item.className = 'lang-item' + (i === selectedLangIdx ? ' active' : '');
    item.innerHTML = `
      <div class="li-body"><div class="li-name">${lang.name}</div></div>
      <div class="li-check"></div>`;
    item.onclick = () => {
      selectedLangIdx = i;
      list.querySelectorAll('.lang-item').forEach((el, j) => el.classList.toggle('active', j === i));
      syncLangConfirmBtn();
    };
    list.appendChild(item);
  });
  // A language is preselected (default = index 0), so "Continua" starts
  // enabled and consistent with the active item.
  syncLangConfirmBtn();
}

/** Keep the "Continua" button in sync with the active language item. */
function syncLangConfirmBtn() {
  const btn = document.getElementById('lang-confirm-btn');
  if (!btn) return;
  btn.disabled    = false;
  btn.textContent = UI_LANGS[selectedLangIdx].ui.continua;
}

/**
 * confirmLanguage() — Confirm the selected language: set currentLangIdx, apply
 * UI texts, then resume the form at the same field (if coming from it) or go home.
 */
function confirmLanguage() {
  currentLangIdx = selectedLangIdx;
  langChosen     = true;   // from now on the language screen is skipped at startup
  saveLang();
  applyUILang();
  // If language change started from the form, return to the exact spot
  // (same section and field); otherwise go home.
  if (langReturn === 'form') {
    window._compiling = true;
    showScreen('screen-form', tr().questionnaire, true);
    document.getElementById('lang-btn').style.display       = '';
    document.getElementById('form-nav-extra').style.display = 'flex';
    window._fieldIdx = langReturnField;
    renderPage(pageIdx); // re-render with new labels, same field
  } else {
    goHome();
  }
}

/**
 * applyUILang() — Update all UI texts to the current language (called after
 * every language change and on goHome). Also handles RTL for Arabic (dir on
 * .phone-shell).
 */
function applyUILang() {
  const s     = tr();
  const isRTL = !!UI_LANGS[currentLangIdx].rtl;

  // RTL: set dir="rtl" on phone-shell to enable the Arabic CSS rules
  document.querySelector('.phone-shell').setAttribute('dir', isRTL ? 'rtl' : 'ltr');

  // Update home menu
  // Order must match the .menu-item order in home.html (no download item).
  const menuDefs = [
    [s.compilaTitle,       s.compilaSub],
    [s.cambiaLinguaTitle,  s.cambiaLinguaSub + ': ' + UI_LANGS[currentLangIdx].name],
    [s.bozzaTitle,         s.bozzaSub],
    [s.outboxTitle,        s.outboxSub],
    [s.inviatiTitle,       s.inviatiSub],
  ];
  document.querySelectorAll('.mi-title').forEach((el, i) => { if (menuDefs[i]) el.textContent = menuDefs[i][0]; });
  document.querySelectorAll('.mi-sub').forEach((el, i)   => { if (menuDefs[i]) el.textContent = menuDefs[i][1]; });

  // Home section labels
  const labels = document.querySelectorAll('.home-section-label');
  if (labels[0]) labels[0].textContent = s.azioniPrincipali;
  if (labels[1]) labels[1].textContent = s.archivio;

  // Home brand title (kept identical across languages, but localizable via appTitle)
  const brandH2 = document.querySelector('#screen-home .brand h2');
  if (brandH2) brandH2.textContent = s.appTitle;

  // App-bar back button: arrow (mirrored in RTL) + "Home" label
  const backArrow = document.getElementById('bar-back-arrow');
  if (backArrow) backArrow.textContent = isRTL ? '→' : '←';
  const backLabel = document.getElementById('bar-back-label');
  if (backLabel) backLabel.textContent = s.home;

  // "Change language" item on home
  const langItem = document.getElementById('home-lang-item');
  if (langItem) langItem.style.display = '';
  const sub = document.getElementById('home-lang-sub');
  if (sub) sub.textContent = UI_LANGS[currentLangIdx].name;

  // Connectivity indicator (text in current language)
  if (typeof updateConnectivity === 'function') updateConnectivity();

  // List-screen headers (outbox / drafts)
  const outH = document.getElementById('outbox-header-label');
  if (outH) outH.textContent = s.inAttesa;
  const draftH = document.getElementById('drafts-header-label');
  if (draftH) draftH.textContent = s.draftsHeader;
  const sendAllBtn = document.getElementById('send-all-btn');
  if (sendAllBtn) sendAllBtn.textContent = s.sendAll;
  updateOutboxHomeStatus();

  // Form buttons (if visible)
  const btnDraft = document.querySelector('.btn-draft');
  const btnComp  = document.getElementById('btn-complete');
  if (btnDraft) btnDraft.textContent = s.salvaBozza;
  if (btnComp)  btnComp.textContent  = s.completato;
}

// Set a home menu badge to `count` (hidden when zero).
function _setBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;
  badge.style.display = count ? '' : 'none';
  badge.textContent   = count;
}

/** updateOutboxBadge() — Refresh all home count badges (drafts, outbox, sent). */
function updateOutboxBadge() {
  _setBadge('drafts-badge', drafts.length);
  _setBadge('outbox-badge', outbox.length);
  _setBadge('sent-badge',   sentForms.length);
  updateOutboxHomeStatus();
}

function updateOutboxHomeStatus() {
  const sub = document.getElementById('home-outbox-sub');
  const item = document.getElementById('home-outbox-item');
  if (!sub) return;
  const s = tr();
  const hasError = outbox.some(it => it.failed || it.lastError);
  const sending = typeof isOutboxSending === 'function' && isOutboxSending();

  if (item) {
    item.classList.toggle('has-error', hasError);
    item.classList.toggle('is-sending', sending);
  }

  if (!outbox.length) {
    sub.textContent = s.outboxSubEmpty;
  } else if (sending) {
    sub.textContent = s.outboxSubSending;
  } else if (hasError) {
    sub.textContent = s.outboxSubError;
  } else if (navigator.onLine) {
    sub.textContent = s.outboxSubOnline;
  } else {
    sub.textContent = s.outboxSubOffline;
  }
}
