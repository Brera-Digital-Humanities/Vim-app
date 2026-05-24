// VIM — form screen: rendering, navigation, drafts, question/choice builders, completion

// --- field rendering & navigation ---

/**
 * renderPage(idx) — Renderizza la sezione corrente del form.
 * Mostra UN campo per volta (campo corrente = window._fieldIdx).
 *
 * @param {number} idx - Indice della sezione (0-based) in PAGES
 */
function renderPage(idx) {
  pageIdx = idx;
  window._compiling = true;   // rende il back dell'app bar una conferma di uscita
  const area = document.getElementById('form-area');
  const fill = document.getElementById('prog-fill');
  const pg   = PAGES[idx];
  if (!pg) return;

  // Campi visibili in questa sezione (filtra condizionali)
  const visFields = pg.fields.filter(f => isVisible(f.name));
  const fieldIdx  = window._fieldIdx || 0;
  const field     = visFields[fieldIdx];

  // Calcolo progresso globale (tutti i campi visibili di tutte le sezioni)
  const allFields    = PAGES.flatMap(p => p.fields.filter(f => isVisible(f.name)));
  const beforeFields = PAGES.slice(0, idx).flatMap(p => p.fields.filter(f => isVisible(f.name)));
  const globalIdx    = beforeFields.length + fieldIdx;
  const pct          = Math.round((globalIdx / allFields.length) * 100);
  fill.style.width   = pct + '%';

  // Pill contatore sezioni
  const pill = document.getElementById('pill');
  if (pill) { pill.textContent = tr().sectionLabel + ' ' + (idx + 1) + '/' + PAGES.length; pill.style.display = ''; }

  // Bottoni navigazione
  const nav     = document.getElementById('form-nav');
  nav.style.display = 'flex';
  const btnBack = document.getElementById('btn-back');
  const btnNext = document.getElementById('btn-next');
  const isRTL   = !!UI_LANGS[currentLangIdx].rtl;
  btnBack.textContent = isRTL ? '→' : '←';

  const isFirstField = idx === 0 && fieldIdx === 0;
  const isLastPage   = idx === PAGES.length - 1;
  const isLastField  = fieldIdx === visFields.length - 1;
  const atEnd        = isLastPage && isLastField;

  btnBack.style.display = isFirstField ? 'none' : '';
  btnNext.style.display = atEnd ? 'none' : '';  // Nasconde "Avanti" all'ultimo campo
  if (!atEnd) {
    btnNext.textContent = tr().avanti;
    btnNext.className   = 'btn btn-next';
    btnNext.onclick     = nextField;
  }

  // Verifica se "Completato" può essere abilitato
  updateCompleteBtn();

  // Costruzione area domanda
  const goingBack = idx < (window._lastPageIdx || 0) ||
    (idx === (window._lastPageIdx || 0) && fieldIdx < (window._lastFieldIdx || 0));
  window._lastPageIdx  = idx;
  window._lastFieldIdx = fieldIdx;

  area.innerHTML = '';

  // Header sezione con nome, nota obbligatorietà e contatore
  const isRequired = pageHasRequiredFields(pg);
  const hdr = document.createElement('div');
  hdr.className = 'form-page-header';
  hdr.innerHTML = `
    <div style="flex:1">
      <div class="form-page-label">${getGroupLabel(pg)}</div>
      ${isRequired ? `<div class="form-page-sublabel">${tr().requiredNote}</div>` : ''}
    </div>
    <span class="form-page-count">${idx + 1} / ${PAGES.length}</span>`;
  area.appendChild(hdr);

  // Se nessun campo visibile in questa sezione, avanza automaticamente
  if (!field) {
    if (!isLastPage) { window._fieldIdx = 0; renderPage(idx + 1); }
    return;
  }

  // Rendering del singolo campo con animazione slide
  const card = document.createElement('div');
  card.className = 'q-card' + (goingBack ? ' back' : '');
  card.innerHTML = buildQuestion(field);
  area.appendChild(card);
  attachListeners(card, field);
  area.scrollTop = 0;
}

/**
 * nextField() — Avanza al campo successivo, o alla sezione successiva
 * se si è all'ultimo campo della sezione corrente.
 */
function nextField() {
  const pg        = PAGES[pageIdx];
  const visFields = pg.fields.filter(f => isVisible(f.name));
  const fi        = window._fieldIdx || 0;

  if (fi < visFields.length - 1) {
    // Prossimo campo nella stessa sezione
    window._fieldIdx = fi + 1;
    renderPage(pageIdx);
  } else {
    // Fine sezione: passa alla sezione successiva
    if (pageIdx < PAGES.length - 1) {
      window._fieldIdx = 0;
      renderPage(pageIdx + 1);
    }
    // Se ultima sezione, i bottoni "Avanti" è già nascosto da renderPage()
  }
}

/**
 * prevPage() — Torna al campo precedente, o all'ultimo campo della sezione
 * precedente se si è al primo campo della sezione corrente.
 */
function prevPage() {
  const fi = window._fieldIdx || 0;
  if (fi > 0) {
    window._fieldIdx = fi - 1;
    renderPage(pageIdx);
  } else if (pageIdx > 0) {
    const prevPg  = PAGES[pageIdx - 1];
    const prevVis = prevPg.fields.filter(f => isVisible(f.name));
    window._fieldIdx = prevVis.length - 1;
    renderPage(pageIdx - 1);
  }
}



// --- draft & complete ---

/**
 * saveDraft() — Salva lo stato corrente come bozza.
 * Apre un modal bottom-sheet con le opzioni "Vai alla home" / "Continua".
 *
 * La bozza è salvata in memoria (draftAnswers, draftPage).
 * NOTA: Non è persistita su disco/localStorage → si perde al refresh.
 * Per persistenza offline usare IndexedDB (vedi integrazione Enketo Express).
 */
function saveDraft() {
  saveDraftSilent();

  const s = tr();
  openModal(`
      <div class="modal-title">${s.draftTitle}</div>
      <div class="modal-msg">${s.draftMsg}</div>
      <div class="modal-actions">
        <button class="modal-btn-primary"  id="modal-home-btn">${s.draftGoHome}</button>
        <button class="modal-btn-secondary" id="modal-stay-btn">${s.draftStay}</button>
      </div>`, close => {
    document.getElementById('modal-home-btn').onclick = () => { close(); goHome(); };
    document.getElementById('modal-stay-btn').onclick = () => close();
  });
}

/** Salva la bozza senza aprire il modal (riusato dalla popup di uscita). */
function saveDraftSilent() {
  draftAnswers = JSON.parse(JSON.stringify(answers));
  draftPage    = pageIdx;
}

/**
 * confirmExit() — Popup di uscita dal form (dal pulsante indietro dell'app bar).
 * Tre scelte: salva bozza ed esci, esci senza salvare, rimani.
 */
function confirmExit() {
  const s = tr();
  openModal(`
      <div class="modal-title">${s.exitTitle}</div>
      <div class="modal-msg">${s.exitMsg}</div>
      <div class="modal-actions">
        <button class="modal-btn-primary"   id="exit-save-btn">${s.exitSave}</button>
        <button class="modal-btn-danger"    id="exit-discard-btn">${s.exitDiscard}</button>
        <button class="modal-btn-secondary" id="exit-stay-btn">${s.exitStay}</button>
      </div>`, close => {
    document.getElementById('exit-save-btn').onclick    = () => { close(); saveDraftSilent(); goHome(); };
    document.getElementById('exit-discard-btn').onclick = () => {
      close();
      answers = {}; mediaFiles = {}; pageIdx = 0; window._fieldIdx = 0;
      goHome();
    };
    document.getElementById('exit-stay-btn').onclick    = () => close();
  });
}

/**
 * openModal(innerHTML, wire) — Crea un bottom-sheet modal dentro .phone-shell.
 * `wire(close)` collega gli handler dei bottoni; `close()` rimuove il modal.
 */
function openModal(innerHTML, wire) {
  const isRTL = !!UI_LANGS[currentLangIdx].rtl;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  overlay.innerHTML = `<div class="modal-sheet"><div class="modal-handle"></div>${innerHTML}</div>`;
  document.querySelector('.phone-shell').appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  wire(close);
}

/**
 * markComplete() — Segna il form come completato e lo aggiunge alla coda outbox.
 *
 * Prerequisito: btn-complete deve avere classe .enabled (controllato da updateCompleteBtn).
 * Dopo il completamento: pulisce la bozza, aggiorna il badge outbox,
 * mostra schermata di conferma con opzione "← Home".
 */
function markComplete() {
  if (!document.getElementById('btn-complete').classList.contains('enabled')) return;

  const saved = {
    answers:    JSON.parse(JSON.stringify(answers)),
    mediaFiles: mediaFiles,
    savedAt:    new Date().toLocaleString(),
    // Label identificativa: usa il nome dell'espressione se disponibile
    label: answers['name_english'] || answers['local_name'] || ('Modulo ' + (outbox.length + 1))
  };
  outbox.push(saved);
  draftAnswers = null; // Cancella bozza dopo completamento
  updateOutboxBadge();

  // Schermata di conferma
  document.getElementById('form-nav').style.display       = 'none';
  document.getElementById('form-nav-extra').style.display = 'none';
  document.getElementById('prog-fill').style.width        = '100%';
  document.getElementById('form-area').innerHTML = `
    <div class="state-success">
      <div class="icon">📤</div>
      <h2>${tr().completato}</h2>
      <p style="margin-top:8px;font-size:.82rem;color:var(--muted)">
        Salvato nella coda di invio.<br>Vai su "Moduli da inviare" per inviarlo.
      </p>
      <button onclick="goHome()"
        style="margin-top:20px;padding:10px 24px;border:none;border-radius:8px;background:var(--ink);color:var(--bg);font-family:'DM Sans',sans-serif;font-size:.8rem;cursor:pointer;">
        ← Home
      </button>
    </div>`;
}



// --- question / media builders ---

/**
 * buildQuestion(q) — Genera l'HTML per un singolo campo del form.
 *
 * Tipi supportati:
 *   text, integer, decimal, date, email → input standard
 *   audio, image, video, file           → media field (doppio bottone)
 *   select_one {list}                   → scelte radio
 *   select_multiple {list}              → scelte checkbox (TODO: implementare)
 *
 * @param {Object} q - Campo da PAGES[n].fields[n]
 * @returns {string} HTML del campo
 */
function buildQuestion(q) {
  const label    = getLabel(q);
  const isReq    = q.required === 'true' || q.required === 'yes';
  const req      = isReq ? '<span class="q-required">*</span>' : '';
  const val      = answers[q.name] ?? '';
  const t        = q.type;
  const listName = t.startsWith('select_') ? t.split(' ')[1] : null;

  // Testo domanda + hint opzionale
  let html = `<div class="q-text">${label}${req}</div>`;
  if (q.hint_it && langKey().startsWith('Italian')) {
    html += `<div class="q-hint">${q.hint_it}</div>`;
  }

  // Rendering in base al tipo
  if      (t === 'text')                 html += `<textarea name="${q.name}" rows="3" placeholder="…">${val}</textarea>`;
  else if (t === 'integer' || t === 'decimal') html += `<input type="number" name="${q.name}" value="${val}" placeholder="0"/>`;
  else if (t === 'date')                 html += `<input type="date"   name="${q.name}" value="${val}"/>`;
  else if (t === 'email')                html += `<input type="email"  name="${q.name}" value="${val}" placeholder="email@…"/>`;
  else if (t === 'audio')                html += buildMediaField(q, 'audio');
  else if (t === 'image')                html += buildMediaField(q, 'image');
  else if (t === 'video')                html += buildMediaField(q, 'video');
  else if (t === 'file')                 html += buildMediaField(q, 'file');
  else if (listName)                     html += buildChoices(q, listName, 'radio');
  else                                   html += `<input type="text" name="${q.name}" value="${val}" placeholder="…"/>`;

  return html;
}

/**
 * buildMediaField(q, kind) — Genera HTML per un campo media.
 *
 * Crea DUE bottoni separati:
 *   1. Registra/Scatta (con capture="environment" per mobile)
 *   2. Carica da file (senza capture, apre il file picker)
 *
 * Dopo l'acquisizione mostra l'anteprima inline (immagine, video, audio).
 *
 * @param {Object} q    - Campo da PAGES[n].fields[n]
 * @param {string} kind - Tipo: 'audio' | 'image' | 'video' | 'file'
 * @returns {string} HTML del campo media
 */
function buildMediaField(q, kind) {
  const s   = tr();
  const cap = mediaFiles[q.name]; // File già acquisito (se presente)

  // Configurazione per tipo
  let recLabel, uplLabel, recAccept, uplAccept, recCapture, icon;
  if (kind === 'audio') {
    recLabel = s.tapRecord; uplLabel = s.tapUploadAudio;
    recAccept = 'audio/*'; uplAccept = 'audio/*'; recCapture = '';
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
    </svg>`;
  } else if (kind === 'image') {
    recLabel = s.tapPhoto; uplLabel = s.tapUploadPhoto;
    recAccept = 'image/*'; uplAccept = 'image/*'; recCapture = 'environment';
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21,15 16,10 5,21"/>
    </svg>`;
  } else if (kind === 'video') {
    recLabel = s.tapVideo; uplLabel = s.tapUploadVideo;
    recAccept = 'video/*'; uplAccept = 'video/*'; recCapture = 'environment';
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>`;
  } else {
    recLabel = s.tapFile; uplLabel = s.tapFile;
    recAccept = '*/*'; uplAccept = '*/*'; recCapture = '';
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>`;
  }

  const capAttr  = recCapture ? `capture="${recCapture}"` : '';
  const capInfo  = cap ? `<div style="font-size:.72rem;color:var(--accent2);margin-top:6px">✓ ${cap.name}</div>` : '';
  const captured = cap ? ' captured' : '';

  // Icona upload
  const uploadIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>`;

  return `
    <div class="media-field">
      <div style="display:flex;gap:8px">
        <!-- Bottone 1: registra/scatta (con capture per dispositivi mobili) -->
        <label class="media-btn${captured}" for="media_rec_${q.name}" style="flex:1">
          <span class="mb-icon">${icon}</span>
          <span class="mb-text">${recLabel}</span>
        </label>
        <!-- Bottone 2: carica da file -->
        <label class="media-btn${captured}" for="media_upl_${q.name}" style="flex:1">
          <span class="mb-icon">${uploadIcon}</span>
          <span class="mb-text">${uplLabel}</span>
        </label>
      </div>
      <!-- Input nascosti — gestiti dai label sopra -->
      <input type="file" id="media_rec_${q.name}" accept="${recAccept}" ${capAttr}
        style="display:none" onchange="handleMedia(event,'${q.name}','${kind}')"/>
      <input type="file" id="media_upl_${q.name}" accept="${uplAccept}"
        style="display:none" onchange="handleMedia(event,'${q.name}','${kind}')"/>
      ${capInfo}
      <!-- Area anteprima: popolata da handleMedia() -->
      <div id="media-preview-${q.name}" class="media-preview"></div>
    </div>`;
}

/**
 * handleMedia(event, name, kind) — Gestisce l'acquisizione di un file media.
 * Aggiorna mediaFiles[], answers[], bottoni e mostra l'anteprima.
 *
 * @param {Event}  event - Evento change dell'input file
 * @param {string} name  - Nome del campo
 * @param {string} kind  - Tipo: 'audio' | 'image' | 'video' | 'file'
 */
function handleMedia(event, name, kind) {
  const file = event.target.files[0];
  if (!file) return;
  mediaFiles[name] = file;
  answers[name]    = file.name;

  // Anteprima inline
  const preview = document.getElementById('media-preview-' + name);
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.style.display = 'block';
    if      (kind === 'image') preview.innerHTML = `<img src="${url}" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px"/>`;
    else if (kind === 'video') preview.innerHTML = `<video src="${url}" controls style="width:100%;max-height:180px;border-radius:8px"></video>`;
    else if (kind === 'audio') preview.innerHTML = `<audio src="${url}" controls style="width:100%;margin-top:4px"></audio>`;
  }

  // Segna entrambi i bottoni come "captured"
  document.querySelectorAll(`[for="media_rec_${name}"], [for="media_upl_${name}"]`)
    .forEach(el => el.classList.add('captured'));

  updateCompleteBtn();
}



// --- choices & listeners ---

/**
 * buildChoices(q, listName, kind) — Genera HTML per un campo select.
 * Le scelte sono lette da CHOICES[listName] (hardcoded da XLS in vim.data.js).
 *
 * @param {Object} q        - Campo
 * @param {string} listName - Nome della lista in CHOICES (es. "dominio_list")
 * @param {string} kind     - 'radio' (select_one) | 'check' (select_multiple)
 * @returns {string} HTML della lista scelte
 */
function buildChoices(q, listName, kind) {
  const opts   = CHOICES[listName] || [];
  if (!opts.length) return '<p style="font-size:.8rem;color:var(--muted)">—</p>';
  const curVal = answers[q.name] || '';
  let html = '<div class="choices">';
  for (const c of opts) {
    const sel = curVal === c.name ? 'selected' : '';
    html += `<div class="choice-item ${sel}"
               data-name="${q.name}"
               data-val="${c.name}"
               data-kind="${kind}">
      <div class="choice-dot"></div>
      <span>${getChoiceLabel(c)}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

/**
 * attachListeners(card, q) — Collega i listener agli input di un campo.
 * Aggiorna answers[] ad ogni interazione e ricalcola updateCompleteBtn().
 *
 * @param {HTMLElement} card - Il div.q-card del campo
 * @param {Object}      q    - Il campo corrispondente
 */
function attachListeners(card, q) {
  // Input testuali, numerici, date
  card.querySelectorAll('input:not([type=file]):not([type=range]), textarea, select').forEach(inp => {
    inp.addEventListener('input', () => {
      answers[q.name] = inp.value;
      updateCompleteBtn();
    });
  });

  // Scelte radio/checkbox
  card.querySelectorAll('.choice-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const val  = item.dataset.val;
      // Deseleziona tutte le scelte dello stesso campo (radio)
      card.querySelectorAll(`.choice-item[data-name="${name}"]`).forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      answers[name] = val;
      updateCompleteBtn();
    });
  });
}



// --- completion gate ---

// Required flag comes from Kobo (sync writes "yes"/"").
function isFieldRequired(f) { return f.required === 'yes' || f.required === 'true'; }

// Empty check; media fields keep their value in mediaFiles, not answers.
function isFieldEmpty(f) {
  if (/^(audio|image|video|file)$/.test(f.type) && mediaFiles[f.name]) return false;
  const v = answers[f.name];
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

// A section has obligations only via its currently-visible required fields.
function pageHasRequiredFields(pg) {
  return pg.fields.some(f => isFieldRequired(f) && isVisible(f.name));
}

/**
 * updateCompleteBtn() — Enable "Completato" when every required AND visible
 * field (in any section) is filled. Conditional fields hidden by their
 * `relevant` rule are skipped (as on Kobo). Driven by the Kobo `required`
 * flag, independent of section order.
 * Called by attachListeners(), handleMedia() and renderPage().
 */
function updateCompleteBtn() {
  const btn = document.getElementById('btn-complete');
  if (!btn) return;

  let allFilled = true;
  for (const pg of PAGES) {
    for (const f of pg.fields) {
      if (!isFieldRequired(f) || !isVisible(f.name)) continue;
      if (isFieldEmpty(f)) { allFilled = false; break; }
    }
    if (!allFilled) break;
  }

  btn.disabled = !allFilled;
  btn.classList.toggle('enabled', allFilled);
}

/**
 * showSuccess() — Mostra la schermata di successo dopo l'invio.
 * Chiamata da doSubmit() in api.js.
 */
