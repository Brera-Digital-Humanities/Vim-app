// VIM — outbox screen: list, send, edit, auto-send toggle, delete

let _autoSyncing = false;
const _sendingIds = new Set();
let _outboxLastResult = null;

function isOutboxSending() {
  return _sendingIds.size > 0 || _autoSyncing;
}

function _obHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function _submitErrorText(res) {
  const s = tr();
  const message = res && res.message ? res.message : s.submitGenericError;
  return res && res.status ? message : `${s.networkError}: ${message}`;
}

function _latestOutboxError() {
  return outbox
    .filter(item => item.lastError)
    .sort((a, b) => String(b.lastAttemptAt || '').localeCompare(String(a.lastAttemptAt || '')))[0] || null;
}

function renderOutboxDebug() {
  const box = document.getElementById('outbox-debug');
  if (!box) return;

  const s = tr();
  const latestError = _latestOutboxError();
  const result = _outboxLastResult || (latestError ? {
    ok: false,
    label: latestError.label,
    at: latestError.lastAttemptAt,
    message: latestError.lastError,
    status: latestError.lastStatus,
  } : null);

  if (!outbox.length && !result) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  const online = navigator.onLine;
  const status = online ? s.statusOnline : s.statusOffline;
  const lines = [
    `<div class="odb-title">${_obHtml(s.sendDebugTitle)}</div>`,
    `<div><strong>${_obHtml(s.connectionState)}:</strong> ${_obHtml(status)}</div>`,
  ];

  if (isOutboxSending()) {
    lines.push(`<div class="odb-result ok">${_obHtml(s.submitInProgress)}</div>`);
  }

  if (result) {
    const cls = result.ok ? 'ok' : 'error';
    lines.push(`<div class="odb-result ${cls}">${_obHtml(result.ok ? s.submitOk : s.submitFailed)}</div>`);
    if (result.label) lines.push(`<div><strong>${_obHtml(s.form)}:</strong> ${_obHtml(result.label)}</div>`);
    if (result.at) lines.push(`<div><strong>${_obHtml(s.lastAttempt)}:</strong> ${_obHtml(result.at)}</div>`);
    if (!result.ok && result.status) lines.push(`<div><strong>${_obHtml(s.httpStatus)}:</strong> ${_obHtml(result.status)}</div>`);
    if (result.message) lines.push(`<pre>${_obHtml(result.message)}</pre>`);
  } else {
    lines.push(`<div class="odb-result ok">${_obHtml(s.noSubmitErrors)}</div>`);
  }

  box.style.display = '';
  box.innerHTML = lines.join('');
}

/** renderOutbox() — Render the queued forms: per-item auto-send toggle, edit,
 *  send/retry and delete; a grey persistence note on top. */
function renderOutbox() {
  const note = document.getElementById('outbox-persist-note');
  if (note) note.textContent = outbox.length ? tr().persistNote : '';
  renderOutboxDebug();

  // Hide "Send all" when there is nothing to send.
  const sendAllBtn = document.getElementById('send-all-btn');
  if (sendAllBtn) sendAllBtn.style.display = outbox.length ? '' : 'none';

  const list = document.getElementById('outbox-list');
  if (!outbox.length) {
    list.innerHTML = '<p class="list-empty">' + tr().noOutbox + '</p>';
    return;
  }
  const s = tr();
  list.innerHTML = '';
  outbox.forEach((item, i) => {
    const auto = item.autoSend !== false;   // default (legacy) = auto
    const sending = _sendingIds.has(item.id);
    const hasError = item.failed || item.lastError;
    const failNote = item.failed ? `<div class="card-warn">${_obHtml(s.sendFailed)} ${_obHtml(s.autoSuspended)}</div>` : '';
    const lastError = item.lastError
      ? `<div class="card-warn"><strong>${_obHtml(s.lastError)}:</strong> ${_obHtml(item.lastError)}</div>`
      : '';
    const lastAttempt = item.lastAttemptAt
      ? `<div class="card-meta">${_obHtml(s.lastAttempt)}: ${_obHtml(item.lastAttemptAt)}</div>`
      : '';
    const lastStatus = item.lastStatus
      ? `<div class="card-meta">${_obHtml(s.httpStatus)}: ${_obHtml(item.lastStatus)}</div>`
      : '';
    const el = document.createElement('div');
    el.className = 'list-card' + (sending ? ' is-sending' : '') + (hasError ? ' is-error' : '');
    el.innerHTML = `<div class="outbox-card-header">
      <div><div class="card-title">${_obHtml(item.label)}</div>
      <div class="card-meta">${_obHtml(s.formSavedAt)} ${_obHtml(item.savedAt)}</div>
      ${lastAttempt}${lastStatus}</div>
      <button class="ob-auto ${auto ? 'on' : ''}" onclick="toggleAutoSend(${i})">
        ${auto ? '<span class="green"></span>' : '<span class="red"></span>'} ${_obHtml(s.autoSendLabel)}: ${auto ? _obHtml(s.autoOn) : _obHtml(s.autoOff)}
      </button></div>
      ${failNote}
      ${lastError}
      <div class="card-actions">
        <button class="card-btn" onclick="editOutbox(${i})" ${sending ? 'disabled' : ''}>✎ ${_obHtml(s.editForm)}</button>
        <button class="card-btn primary" onclick="sendSingle(${i})" ${sending ? 'disabled' : ''}>${sending ? _obHtml(s.sending) : _obHtml(item.failed ? s.retry : s.invia)}</button>
        <button class="card-btn danger" onclick="deleteSingle(${i})" ${sending ? 'disabled' : ''}>✕</button>
      </div>`;
    list.appendChild(el);
  });
}

// Send one queued item (by reference). Uses the stored OpenRosa XML snapshot
// (falling back to rebuilding it for older records). On success move it to
// sentForms and drop its record; on a permanent failure flag it so we stop
// auto-retrying. instanceID makes the send idempotent.
async function _sendItem(item) {
  const xml = item.xml || buildSubmissionXml(item.answers, item.mediaFiles, item.id);
  item.lastAttemptAt = new Date().toLocaleString();
  item.attempts = (item.attempts || 0) + 1;
  delete item.lastError;
  delete item.lastStatus;
  const res = await doSubmit(xml, item.mediaFiles);
  if (res.ok) {
    _outboxLastResult = { ok: true, label: item.label, at: item.lastAttemptAt, message: tr().submitOk };
    // Keep a text-only record (answers include media filenames); drop the media
    // Blobs by removing the outbox record → keeps the DB light.
    const sentRec = { id: item.id, label: item.label, sentAt: new Date().toLocaleString(), answers: item.answers };
    sentForms.push(sentRec);
    saveSentRecord(sentRec);
    const i = outbox.indexOf(item);
    if (i > -1) outbox.splice(i, 1);
    removeOutboxRecord(item.id);
    updateOutboxBadge();
  } else {
    item.lastStatus = res.status || 0;
    item.lastError = _submitErrorText(res);
    item.failed = true;
    item.autoSend = false;
    _outboxLastResult = { ok: false, label: item.label, at: item.lastAttemptAt, message: item.lastError, status: item.lastStatus };
    saveOutboxRecord(item);
    updateOutboxBadge();
  }
  return res;
}

/** sendSingle(i) — Manually send one queued form (clears any failed flag). */
async function sendSingle(i) {
  const item = outbox[i];
  if (!item || _sendingIds.has(item.id)) return;
  delete item.failed;         // a manual send is a fresh attempt
  delete item.lastError;
  delete item.lastStatus;
  _outboxLastResult = null;
  _sendingIds.add(item.id);
  updateOutboxBadge();
  renderOutbox();
  try {
    await _sendItem(item);
  } finally {
    _sendingIds.delete(item.id);
    updateOutboxBadge();
    renderOutbox();
  }
}

/**
 * autoSync() — Send queued forms automatically when online. Sends only items
 * marked auto-send (default) and not permanently failed; guarded against
 * re-entry; retries the rest after a delay. Triggered on connectivity, at
 * startup and after completing an auto-send form.
 */
async function autoSync() {
  const pending = () => outbox.filter(it => !it.failed && !it.lastError && it.autoSend !== false);
  // Don't sync while the user is filling/editing a form (avoids sending an item
  // that is currently being re-edited).
  if (_autoSyncing || _sendingIds.size || window._compiling || !navigator.onLine || !pending().length) return;
  _autoSyncing = true;
  try {
    for (const item of pending()) await _sendItem(item);
  } finally {
    _autoSyncing = false;
  }
  if (document.getElementById('outbox-list')) renderOutbox();
  if (pending().length && navigator.onLine) {
    clearTimeout(window._syncRetry);
    window._syncRetry = setTimeout(autoSync, 30000);   // simple retry (transient errors only)
  }
}

/** sendAllOutbox() — "Send all" button: flush every pending form now (manual ones included). */
async function sendAllOutbox() {
  if (_autoSyncing || _sendingIds.size) return;
  if (!navigator.onLine) {
    _outboxLastResult = { ok: false, at: new Date().toLocaleString(), message: tr().submitNoConnection };
    renderOutbox();
    return;
  }
  const queue = outbox.slice();
  if (!queue.length) return;
  _autoSyncing = true;
  _outboxLastResult = null;
  queue.forEach(item => {
    delete item.failed;
    delete item.lastError;
    delete item.lastStatus;
    _sendingIds.add(item.id);
  });
  updateOutboxBadge();
  renderOutbox();
  try {
    for (const item of queue) await _sendItem(item);
  } finally {
    _autoSyncing = false;
    queue.forEach(item => _sendingIds.delete(item.id));
  }
  updateOutboxBadge();
  renderOutbox();
}

/** toggleAutoSend(i) — Flip a form between auto-send and manual; send now if turned on. */
function toggleAutoSend(i) {
  const item = outbox[i];
  if (!item) return;
  item.autoSend = item.autoSend === false;   // false → true, true/undefined → false
  saveOutboxRecord(item);
  renderOutbox();
  if (item.autoSend && navigator.onLine) autoSync();
}

/**
 * editOutbox(i) — Re-edit a completed form. If the form schema changed since it
 * was completed, warn first: "edit anyway" (data may be lost) or "send as is"
 * (submit the stored snapshot unchanged).
 */
function editOutbox(i) {
  const item = outbox[i];
  if (!item) return;
  const s = tr();
  if (item.schemaSig && item.schemaSig !== schemaSig()) {
    openModal(`
        <div class="modal-title">${s.schemaChangedTitle}</div>
        <div class="modal-msg">${s.schemaChangedMsg}</div>
        <div class="modal-actions">
          <button class="modal-btn-primary"   id="edit-anyway-btn">${s.editAnyway}</button>
          <button class="modal-btn-secondary" id="send-asis-btn">${s.sendAsIs}</button>
        </div>`, close => {
      document.getElementById('edit-anyway-btn').onclick = () => { close(); _loadOutboxForEdit(item); };
      document.getElementById('send-asis-btn').onclick   = () => { close(); sendSingle(i); };
    });
    return;
  }
  _loadOutboxForEdit(item);
}

// Load an outbox item back into the form for editing; on re-complete it replaces
// the same record (kept identified by instanceID).
function _loadOutboxForEdit(item) {
  window._editingDraft    = null;
  window._editingOutboxId = item.id;
  window._instanceId      = item.id;
  answers    = JSON.parse(JSON.stringify(item.answers));
  mediaFiles = Object.assign({}, item.mediaFiles || {});
  pageIdx    = 0;
  openForm(0);
}

/** deleteSingle(i) — Remove a form from the queue without sending it. */
function deleteSingle(i) {
  const item = outbox[i];
  if (!item) return;
  removeOutboxRecord(item.id);
  outbox.splice(i, 1);
  updateOutboxBadge();
  renderOutbox();
}
