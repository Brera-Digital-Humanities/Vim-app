// VIM — drafts screen: list saved drafts, resume or delete

/** renderDrafts() — Populate the saved-drafts list (label + date + Resume/Delete). */
function renderDrafts() {
  const note = document.getElementById('drafts-persist-note');
  if (note) note.textContent = drafts.length ? tr().persistNote : '';

  const list = document.getElementById('drafts-list');
  if (!drafts.length) {
    list.innerHTML = '<p class="list-empty">' + tr().noBozza + '</p>';
    return;
  }
  list.innerHTML = '';
  drafts.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'list-card';
    el.innerHTML = `
      <div class="card-title">${item.label}</div>
      <div class="card-meta">${tr().formSavedAt} ${item.savedAt}</div>
      <div class="card-actions">
        <button class="card-btn primary" onclick="resumeDraft(${i})">${tr().resume}</button>
        <button class="card-btn danger" onclick="deleteDraft(${i})">✕</button>
      </div>`;
    list.appendChild(el);
  });
}

/** deleteDraft(i) — Remove a draft from the list (and its stored record). */
function deleteDraft(i) {
  const item = drafts[i];
  if (!item) return;
  removeDraftRecord(item.id);
  drafts.splice(i, 1);
  renderDrafts();
}
