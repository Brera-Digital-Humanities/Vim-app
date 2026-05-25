// VIM — outbox screen: list, send, edit, auto-send toggle, delete

/** renderOutbox() — Render the queued forms: per-item auto-send toggle, edit,
 *  send/retry and delete; a grey persistence note on top. */
function renderOutbox() {
  const note = document.getElementById('outbox-persist-note');
  if (note) note.textContent = outbox.length ? tr().persistNote : '';

  // Hide "Send all" when there is nothing to send.
  const sendAllBtn = document.getElementById('send-all-btn');
  if (sendAllBtn) sendAllBtn.style.display = outbox.length ? '' : 'none';

  const list = document.getElementById('outbox-list');
  if (!outbox.length) {
    list.innerHTML = '<p style="font-size:.82rem;color:var(--muted);padding:8px 0;">' + tr().noOutbox + '</p>';
    return;
  }
  const s = tr();
  list.innerHTML = '';
  outbox.forEach((item, i) => {
    const auto = item.autoSend !== false;   // default (legacy) = auto
    const failNote = item.failed
      ? `<div style="font-size:.7rem;color:var(--error);margin-top:4px">⚠️ ${s.sendFailed}</div>` : '';
    const el = document.createElement('div');
    el.style.cssText = 'padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;';
    el.innerHTML = `
      <div style="font-size:.88rem;font-weight:500;color:var(--ink)">${item.label}</div>
      <div style="font-size:.7rem;color:var(--muted);margin-top:2px">${s.formSavedAt} ${item.savedAt}</div>
      <button class="ob-auto ${auto ? 'on' : ''}" onclick="toggleAutoSend(${i})">
        ${auto ? '⚡' : '✋'} ${s.autoSendLabel}: ${auto ? s.autoOn : s.autoOff}
      </button>
      ${failNote}
      <div style="display:flex;gap:8px;margin-top:10px">
        <button onclick="editOutbox(${i})"
          style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:none;font-size:.75rem;cursor:pointer;color:var(--ink)">
          ✎ ${s.editForm}
        </button>
        <button onclick="sendSingle(${i})"
          style="flex:1;padding:8px;border:none;border-radius:8px;background:var(--ink);color:var(--bg);font-size:.75rem;cursor:pointer;">
          ${item.failed ? s.retry : s.invia}
        </button>
        <button onclick="deleteSingle(${i})"
          style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:none;font-size:.75rem;cursor:pointer;color:var(--error)">
          ✕
        </button>
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
  const res = await doSubmit(xml, item.mediaFiles);
  if (res.ok) {
    // Keep a text-only record (answers include media filenames); drop the media
    // Blobs by removing the outbox record → keeps the DB light.
    const sentRec = { id: item.id, label: item.label, sentAt: new Date().toLocaleString(), answers: item.answers };
    sentForms.push(sentRec);
    saveSentRecord(sentRec);
    const i = outbox.indexOf(item);
    if (i > -1) outbox.splice(i, 1);
    removeOutboxRecord(item.id);
    updateOutboxBadge();
  } else if (res.permanent) {
    item.failed = true;       // won't auto-retry; persist the flag
    saveOutboxRecord(item);
  }
  return res;
}

/** sendSingle(i) — Manually send one queued form (clears any failed flag). */
async function sendSingle(i) {
  const item = outbox[i];
  if (!item) return;
  delete item.failed;         // a manual send is a fresh attempt
  await _sendItem(item);
  renderOutbox();
}

let _autoSyncing = false;

/**
 * autoSync() — Send queued forms automatically when online. Sends only items
 * marked auto-send (default) and not permanently failed; guarded against
 * re-entry; retries the rest after a delay. Triggered on connectivity, at
 * startup and after completing an auto-send form.
 */
async function autoSync() {
  const pending = () => outbox.filter(it => !it.failed && it.autoSend !== false);
  // Don't sync while the user is filling/editing a form (avoids sending an item
  // that is currently being re-edited).
  if (_autoSyncing || window._compiling || !navigator.onLine || !pending().length) return;
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
  if (_autoSyncing || !navigator.onLine) return;
  const queue = outbox.filter(it => !it.failed);
  if (!queue.length) return;
  _autoSyncing = true;
  try {
    for (const item of queue) await _sendItem(item);
  } finally {
    _autoSyncing = false;
  }
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
