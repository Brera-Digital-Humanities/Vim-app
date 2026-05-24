// VIM — language screen: select, confirm, apply UI language


/**
 * renderLangScreen() — Popola la lista lingue nella schermata di selezione.
 * Chiamato all'avvio (init) e ogni volta che si apre la schermata lingua.
 */
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
 * confirmLanguage() — Conferma la lingua selezionata.
 * Aggiorna currentLangIdx, applica le traduzioni UI, poi:
 * - Se l'utente era nel form → riprende da dove era (stesso campo, lingua tradotta)
 * - Altrimenti → torna alla home
 */
function confirmLanguage() {
  currentLangIdx = selectedLangIdx;
  applyUILang();
  // Se il cambio lingua è partito dal form, torna esattamente dove si era
  // (stessa sezione e stesso campo); altrimenti torna alla home.
  if (langReturn === 'form') {
    window._compiling = true;
    showScreen('screen-form', tr().home, true);
    document.getElementById('lang-btn').style.display       = '';
    document.getElementById('form-nav-extra').style.display = 'flex';
    window._fieldIdx = langReturnField;
    renderPage(pageIdx); // Re-renderizza con le nuove label, stesso campo
  } else {
    goHome();
  }
}

/**
 * applyUILang() — Aggiorna tutti i testi dell'interfaccia nella lingua corrente.
 * Chiamato dopo ogni cambio lingua e al goHome().
 * Gestisce anche RTL per l'arabo (attributo dir sul .phone-shell).
 */
function applyUILang() {
  const s     = tr();
  const isRTL = !!UI_LANGS[currentLangIdx].rtl;

  // RTL: imposta dir="rtl" su phone-shell per attivare le regole CSS arabo
  document.querySelector('.phone-shell').setAttribute('dir', isRTL ? 'rtl' : 'ltr');

  // Aggiorna menu home
  // Order must match the .menu-item order in home.html (no "scarica modulo").
  const menuDefs = [
    [s.compilaTitle,       s.compilaSub],
    [s.cambiaLinguaTitle,  s.cambiaLinguaSub + ': ' + UI_LANGS[currentLangIdx].name],
    [s.bozzaTitle,         s.bozzaSub],
    [s.outboxTitle,        s.outboxSub],
    [s.inviatiTitle,       s.inviatiSub],
  ];
  document.querySelectorAll('.mi-title').forEach((el, i) => { if (menuDefs[i]) el.textContent = menuDefs[i][0]; });
  document.querySelectorAll('.mi-sub').forEach((el, i)   => { if (menuDefs[i]) el.textContent = menuDefs[i][1]; });

  // Etichette sezioni home
  const labels = document.querySelectorAll('.home-section-label');
  if (labels[0]) labels[0].textContent = s.azioniPrincipali;
  if (labels[1]) labels[1].textContent = s.archivio;

  // Brand home
  const brandH2 = document.querySelector('.home-brand h2');
  if (brandH2) brandH2.textContent = s.appTitle;

  // Frecce navigazione (invertite in RTL)
  const barBack = document.getElementById('bar-back-btn');
  if (barBack) barBack.textContent = isRTL ? '→' : '←';

  // Voce "cambia lingua" nella home
  const langItem = document.getElementById('home-lang-item');
  if (langItem) langItem.style.display = '';
  const sub = document.getElementById('home-lang-sub');
  if (sub) sub.textContent = UI_LANGS[currentLangIdx].name;

  // Indicatore connessione (testo nella lingua corrente)
  if (typeof updateConnectivity === 'function') updateConnectivity();

  // Bottoni form (se visibili)
  const btnDraft = document.querySelector('.btn-draft');
  const btnComp  = document.getElementById('btn-complete');
  if (btnDraft) btnDraft.textContent = s.salvaBozza;
  if (btnComp)  btnComp.textContent  = s.completato;
}

/**
 * updateOutboxBadge() — Aggiorna il badge numerico sulla voce "Moduli da inviare".
 * Mostra il numero di moduli in coda, nasconde il badge se la coda è vuota.
 */
function updateOutboxBadge() {
  const badge = document.getElementById('outbox-badge');
  if (!badge) return;
  badge.style.display = outbox.length ? '' : 'none';
  badge.textContent   = outbox.length;
}


