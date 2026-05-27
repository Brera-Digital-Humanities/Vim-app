// VIM — form screen: rendering, navigation, drafts, question/choice builders, completion

// Soft warning threshold for media size (server may reject larger attachments).
const MAX_MEDIA_MB = 10;

// --- field rendering & navigation ---

/** renderPage(idx) — Render the current section, one field at a time (window._fieldIdx). */
function renderPage(idx) {
  pageIdx = idx;
  window._compiling = true;   // makes the app-bar back act as an exit confirm
  const area = document.getElementById('form-area');
  const fill = document.getElementById('prog-fill');
  const pg   = PAGES[idx];
  if (!pg) return;

  // Visible fields in this section (filter out conditionals)
  const visFields = pg.fields.filter(f => isVisible(f.name));
  const fieldIdx  = window._fieldIdx || 0;
  const field     = visFields[fieldIdx];

  // Global progress (all visible fields across all sections)
  const allFields    = PAGES.flatMap(p => p.fields.filter(f => isVisible(f.name)));
  const beforeFields = PAGES.slice(0, idx).flatMap(p => p.fields.filter(f => isVisible(f.name)));
  const globalIdx    = beforeFields.length + fieldIdx;
  const pct          = Math.round((globalIdx / allFields.length) * 100);
  fill.style.width   = pct + '%';

  // Section counter pill
  const pill = document.getElementById('pill');
  if (pill) { pill.textContent = tr().sectionLabel + ' ' + (idx + 1) + '/' + PAGES.length; pill.style.display = ''; }

  // Navigation buttons
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
  btnNext.style.display = atEnd ? 'none' : '';  // hide "Next" on the last field
  if (!atEnd) {
    btnNext.textContent = tr().avanti;
    btnNext.className   = 'btn btn-next';
    btnNext.onclick     = nextField;
  }

  // Decide whether "Complete" can be enabled
  updateCompleteBtn();

  // Build the question area
  const goingBack = idx < (window._lastPageIdx || 0) ||
    (idx === (window._lastPageIdx || 0) && fieldIdx < (window._lastFieldIdx || 0));
  window._lastPageIdx  = idx;
  window._lastFieldIdx = fieldIdx;

  area.innerHTML = '';

  // Section header: name, required note, counter
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

  // No visible field in this section: auto-advance
  if (!field) {
    if (!isLastPage) { window._fieldIdx = 0; renderPage(idx + 1); }
    return;
  }

  // Render the single field with a slide animation
  const card = document.createElement('div');
  card.className = 'q-card' + (goingBack ? ' back' : '');
  card.innerHTML = buildQuestion(field);
  area.appendChild(card);

  // "Required field" alert (hidden until "Next" is forced)
  const err = document.createElement('div');
  err.className = 'field-error';
  err.id = 'field-error';
  err.textContent = tr().fieldRequired;
  err.style.display = 'none';
  area.appendChild(err);

  attachListeners(card, field);
  updateNextBtnState();
  area.scrollTop = 0;
}

/** nextField() — Advance to the next field, or the next section if at the section's last field. */
function nextField() {
  const pg        = PAGES[pageIdx];
  const visFields = pg.fields.filter(f => isVisible(f.name));
  const fi        = window._fieldIdx || 0;
  const field     = visFields[fi];

  // Required field left empty: block advancing and show the alert.
  if (field && isFieldRequired(field) && isFieldEmpty(field)) {
    const err = document.getElementById('field-error');
    if (err) {
      err.style.display = '';
      err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake');
    }
    return;
  }

  if (fi < visFields.length - 1) {
    // Next field in the same section
    window._fieldIdx = fi + 1;
    renderPage(pageIdx);
  } else {
    // End of section: move to the next one
    if (pageIdx < PAGES.length - 1) {
      window._fieldIdx = 0;
      renderPage(pageIdx + 1);
    }
    // On the last section "Next" is already hidden by renderPage()
  }
}

/**
 * clearDependentFilters(changedName) — When a field a cascading select depends
 * on changes, clear child fields whose value is no longer valid (e.g. changing
 * file_occasion_cat drops file_occasion if it no longer matches the category).
 */
function clearDependentFilters(changedName) {
  PAGES.forEach(p => p.fields.forEach(f => {
    if (!f.choice_filter) return;
    const m = f.choice_filter.match(/(\w+)\s*=\s*\$\{(\w+)\}/);
    if (!m || m[2] !== changedName) return;
    const cur = answers[f.name];
    if (!cur) return;
    const col  = m[1];
    const list = f.type.split(' ')[1] || '';
    const opts = CHOICES[list] || [];
    const stillValid = opts.some(c => c.name === cur && c[col] === answers[changedName]);
    if (!stillValid) delete answers[f.name];
  }));
}

/**
 * clearHiddenFields() — Drop from answers/mediaFiles the values of fields no
 * longer visible (relevant rule unmet), so hidden-field data is never sent to
 * Kobo (e.g. media_audio after switching file_type from audio to photo).
 * Mirrors XForm semantics: relevant off → value cleared.
 */
function clearHiddenFields() {
  PAGES.forEach(p => p.fields.forEach(f => {
    if (!isVisible(f.name)) {
      if (f.name in answers)   delete answers[f.name];
      if (mediaFiles[f.name])  delete mediaFiles[f.name];
    }
  }));
}

/** currentField() — The field currently shown (section + _fieldIdx). */
function currentField() {
  const pg = PAGES[pageIdx];
  if (!pg) return null;
  const vis = pg.fields.filter(f => isVisible(f.name));
  return vis[window._fieldIdx || 0] || null;
}

/**
 * updateNextBtnState() — "Next" looks disabled (.locked) when the current field
 * is required and empty, but stays clickable: the click shows the alert (see
 * nextField). Once filled, it unlocks and hides the alert.
 */
function updateNextBtnState() {
  const btn = document.getElementById('btn-next');
  if (!btn) return;
  const f = currentField();
  const locked = !!(f && isFieldRequired(f) && isFieldEmpty(f));
  btn.classList.toggle('locked', locked);
  if (!locked) {
    const err = document.getElementById('field-error');
    if (err) err.style.display = 'none';
  }
}

/** prevPage() — Go to the previous field, or the last field of the previous section. */
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
 * saveDraft() — Save the current state as a draft (in `drafts`) and open a
 * bottom-sheet modal with "Go home" / "Stay" options.
 */
function saveDraft() {
  saveDraftSilent();

  const s = tr();
  openModal(`
      <div class="modal-title">${s.draftTitle}</div>
      <div class="modal-msg">${s.draftMsg}</div>
      <div class="modal-note-danger">${s.persistNote}</div>
      <div class="modal-actions">
        <button class="modal-btn-primary"  id="modal-home-btn">${s.draftGoHome}</button>
        <button class="modal-btn-secondary" id="modal-stay-btn">${s.draftStay}</button>
      </div>`, close => {
    document.getElementById('modal-home-btn').onclick = () => { close(); goHome(); };
    document.getElementById('modal-stay-btn').onclick = () => close();
  });
}

/**
 * saveDraftSilent() — Save the current state as a draft, no modal. Updates the
 * draft being edited (window._editingDraft) or appends a new one to `drafts`.
 */
function saveDraftSilent() {
  const editing = window._editingDraft != null && drafts[window._editingDraft];
  const entry = {
    id:         editing ? drafts[window._editingDraft].id : (window._instanceId ||= newId()),
    answers:    JSON.parse(JSON.stringify(answers)),
    mediaFiles: Object.assign({}, mediaFiles),
    pageIdx:    pageIdx,
    fieldIdx:   window._fieldIdx || 0,
    savedAt:    new Date().toLocaleString(),
    label:      answers['name_english'] || answers['local_name'] || ('Bozza ' + (drafts.length + 1)),
  };
  if (editing) {
    drafts[window._editingDraft] = entry;
  } else {
    drafts.push(entry);
    window._editingDraft = drafts.length - 1;
  }
  saveDraftRecord(entry);   // persist just this draft (not the whole list)
}

/**
 * confirmExit() — Exit popup for the form (from the app-bar back button).
 * Three choices: save draft and exit, exit without saving, stay.
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
 * openModal(innerHTML, wire) — Create a bottom-sheet modal inside .phone-shell.
 * `wire(close)` binds the button handlers; `close()` removes the modal.
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
 * markComplete() — Ask how to send the completed form (auto when online vs
 * manual), then finalize. Requires btn-complete to be .enabled.
 */
function markComplete() {
  if (!document.getElementById('btn-complete').classList.contains('enabled')) return;
  const s = tr();
  openModal(`
      <div class="modal-title">${s.completeHow}</div>
      <div class="modal-note-danger">${s.persistNote}</div>
      <div class="modal-actions">
        <button class="modal-btn-primary"   id="complete-auto-btn">${s.sendAuto}</button>
        <button class="modal-btn-secondary" id="complete-manual-btn">${s.sendManual}</button>
      </div>`, close => {
    document.getElementById('complete-auto-btn').onclick   = () => { close(); _finalizeComplete(true); };
    document.getElementById('complete-manual-btn').onclick = () => { close(); _finalizeComplete(false); };
  });
}

/**
 * _finalizeComplete(autoSend) — Snapshot the form into the outbox and show the
 * confirmation. The OpenRosa XML is built now and stored, so the queued
 * submission is immune to later schema changes. `autoSend` chooses whether it
 * is sent automatically when online or only on manual request.
 */
function _finalizeComplete(autoSend) {
  recalc();              // ensure calculate fields (paese_group, file_name) are current
  clearHiddenFields();   // safety net: never submit values of hidden fields
  const id = window._instanceId || newId();   // stable instanceID for dedup
  const saved = {
    id,
    answers:    JSON.parse(JSON.stringify(answers)),
    mediaFiles: mediaFiles,
    xml:        buildSubmissionXml(answers, mediaFiles, id),   // snapshot (schema-proof)
    schemaSig:  schemaSig(),                                   // detect later schema changes
    autoSend:   autoSend !== false,
    savedAt:    new Date().toLocaleString(),
    label:      answers['name_english'] || answers['local_name'] || ('Modulo ' + (outbox.length + 1)),
  };
  // Replace in place if re-editing an outbox item, otherwise append.
  const ix = window._editingOutboxId ? outbox.findIndex(o => o.id === window._editingOutboxId) : -1;
  if (ix > -1) outbox[ix] = saved; else outbox.push(saved);
  saveOutboxRecord(saved);
  // If a draft was being completed, remove it (same instanceID is now in outbox).
  if (window._editingDraft != null && drafts[window._editingDraft]) {
    removeDraftRecord(drafts[window._editingDraft].id);
    drafts.splice(window._editingDraft, 1);
  }
  window._editingDraft    = null;
  window._editingOutboxId = null;
  window._instanceId      = null;
  window._compiling       = false;   // form is done — allow auto-sync
  updateOutboxBadge();
  if (saved.autoSend && typeof autoSync === 'function') autoSync();   // send now if online

  // Confirmation screen
  const isRTL = !!UI_LANGS[currentLangIdx].rtl;
  document.getElementById('form-nav').style.display       = 'none';
  document.getElementById('form-nav-extra').style.display = 'none';
  document.getElementById('prog-fill').style.width        = '100%';
  document.getElementById('form-area').innerHTML = `
    <div class="state-success">
      <div class="icon">📤</div>
      <h2>${tr().completato}</h2>
      <p style="margin-top:8px;font-size:.82rem;color:var(--muted)">
        ${tr().outboxSavedMsg}
      </p>
      <button onclick="goHome()"
        style="margin-top:20px;padding:10px 24px;border:none;border-radius:8px;background:var(--ink);color:var(--bg);font-family:'DM Sans',sans-serif;font-size:.8rem;cursor:pointer;">
        ${isRTL ? '→' : '←'} ${tr().home}
      </button>
    </div>`;
}

/**
 * schemaSig() — Short signature of the current form schema (field names+types),
 * stored with a completed form to detect whether the form changed before a
 * later re-edit (see editOutbox).
 */
function schemaSig() {
  const str = PAGES.flatMap(p => p.fields.map(f => f.name + ':' + f.type)).join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return String(h >>> 0);
}



// --- question / media builders ---

/**
 * buildQuestion(q) — Build the HTML for a single form field.
 * Types: text/integer/decimal/date/email → standard inputs · audio/image/video/
 * file → media field (two buttons) · select_one {list} → radio choices.
 */
function buildQuestion(q) {
  const label    = getLabel(q);
  const isReq    = q.required === 'true' || q.required === 'yes';
  const req      = isReq ? '<span class="q-required">*</span>' : '';
  const val      = answers[q.name] ?? '';
  const t        = q.type;
  const listName = t.startsWith('select_') ? t.split(' ')[1] : null;

  // Question text + optional hint
  let html = `<div class="q-text">${label}${req}</div>`;
  if (q.hint_it && langKey().startsWith('Italian')) {
    html += `<div class="q-hint">${q.hint_it}</div>`;
  }

  // Render by type
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
 * buildMediaField(q, kind) — Build the HTML for a media field. Two buttons:
 * (1) record/capture (capture="environment" on mobile), (2) upload from file.
 * After capture it shows an inline preview (image/video/audio).
 * kind: 'audio' | 'image' | 'video' | 'file'.
 */
function buildMediaField(q, kind) {
  const s   = tr();
  const cap = mediaFiles[q.name]; // file already captured (if any)

  // Per-type configuration
  let recLabel, uplLabel, recAccept, uplAccept, recCapture, icon;
  if (kind === 'audio') {
    recLabel = s.tapRecord; uplLabel = s.tapUploadAudio;
    recAccept = 'audio/*'; uplAccept = 'audio/*'; recCapture = 'microphone';
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

  // Upload icon
  const uploadIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>`;

  return `
    <div class="media-field">
      <div style="display:flex;gap:8px">
        <!-- Button 1: record/capture (capture attr for mobile) -->
        <label class="media-btn${captured}" for="media_rec_${q.name}" style="flex:1">
          <span class="mb-icon">${icon}</span>
          <span class="mb-text">${recLabel}</span>
        </label>
        <!-- Button 2: upload from file -->
        <label class="media-btn${captured}" for="media_upl_${q.name}" style="flex:1">
          <span class="mb-icon">${uploadIcon}</span>
          <span class="mb-text">${uplLabel}</span>
        </label>
      </div>
      <!-- Hidden inputs — driven by the labels above -->
      <input type="file" id="media_rec_${q.name}" accept="${recAccept}" ${capAttr}
        style="display:none" onchange="handleMedia(event,'${q.name}','${kind}')"/>
      <input type="file" id="media_upl_${q.name}" accept="${uplAccept}"
        style="display:none" onchange="handleMedia(event,'${q.name}','${kind}')"/>
      ${capInfo}
      <!-- Large-file warning: filled by handleMedia() when over MAX_MEDIA_MB -->
      <div id="media-warn-${q.name}" class="media-warn" style="display:none"></div>
      <!-- Preview area: filled by handleMedia() -->
      <div id="media-preview-${q.name}" class="media-preview"></div>
    </div>`;
}

/**
 * handleMedia(event, name, kind) — Handle a captured media file: update
 * mediaFiles[]/answers[], mark the buttons, show the inline preview.
 * kind: 'audio' | 'image' | 'video' | 'file'.
 */
function handleMedia(event, name, kind) {
  const file = event.target.files[0];
  if (!file) return;
  mediaFiles[name] = file;
  answers[name]    = file.name;

  // Large-file warning (soft: the server may reject very large attachments)
  const warn = document.getElementById('media-warn-' + name);
  if (warn) {
    const mb = file.size / (1024 * 1024);
    const big = mb > MAX_MEDIA_MB;
    warn.style.display = big ? '' : 'none';
    if (big) warn.textContent = `(${mb.toFixed(0)} MB) ` + tr().mediaLargeWarn;
  }

  // Inline preview
  const preview = document.getElementById('media-preview-' + name);
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.style.display = 'block';
    if      (kind === 'image') preview.innerHTML = `<img src="${url}" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px"/>`;
    else if (kind === 'video') preview.innerHTML = `<video src="${url}" controls style="width:100%;max-height:180px;border-radius:8px"></video>`;
    else if (kind === 'audio') preview.innerHTML = `<audio src="${url}" controls style="width:100%;margin-top:4px"></audio>`;
  }

  // Mark both buttons as "captured"
  document.querySelectorAll(`[for="media_rec_${name}"], [for="media_upl_${name}"]`)
    .forEach(el => el.classList.add('captured'));

  updateCompleteBtn();
  updateNextBtnState();
}



// --- choices & listeners ---

/**
 * buildChoices(q, listName, kind) — Build the HTML for a select field. Choices
 * come from CHOICES[listName] (from the XLS, in data.js).
 * kind: 'radio' (select_one) | 'check' (select_multiple).
 */
function buildChoices(q, listName, kind) {
  let opts = CHOICES[listName] || [];

  // Cascading select: keep only choices matching the filter "col=${field}"
  // (e.g. file_occasion shows only occasions whose `cat` = chosen category).
  if (q.choice_filter) {
    const m = q.choice_filter.match(/(\w+)\s*=\s*\$\{(\w+)\}/);
    if (m) {
      const col = m[1], dep = m[2];
      opts = opts.filter(c => c[col] === answers[dep]);
    }
  }

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
 * attachListeners(card, q) — Wire the listeners on a field's inputs: update
 * answers[] on every interaction and recompute updateCompleteBtn().
 */
function attachListeners(card, q) {
  // Text, number, date inputs
  card.querySelectorAll('input:not([type=file]):not([type=range]), textarea, select').forEach(inp => {
    inp.addEventListener('input', () => {
      answers[q.name] = inp.value;
      const changedCalc = recalc();   // recompute calculate fields (e.g. paese_group)
      clearDependentFilters(q.name);
      changedCalc.forEach(clearDependentFilters);
      clearHiddenFields();
      updateCompleteBtn();
      updateNextBtnState();
    });
  });

  // Radio/checkbox choices
  card.querySelectorAll('.choice-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const val  = item.dataset.val;
      // Deselect all choices of the same field (radio)
      card.querySelectorAll(`.choice-item[data-name="${name}"]`).forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      answers[name] = val;
      const changedCalc = recalc();   // recompute calculate fields (e.g. paese_group)
      clearDependentFilters(name);
      changedCalc.forEach(clearDependentFilters);
      clearHiddenFields();
      updateCompleteBtn();
      updateNextBtnState();
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
 * updateCompleteBtn() — Enable "Complete" when every required AND visible field
 * (in any section) is filled. Conditional fields hidden by their `relevant`
 * rule are skipped (as on Kobo). Driven by the Kobo `required` flag,
 * independent of section order. Called by attachListeners/handleMedia/renderPage.
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

/** showSuccess() — Show the success screen after submit (called by doSubmit). */
