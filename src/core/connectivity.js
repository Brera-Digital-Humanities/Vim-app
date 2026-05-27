// VIM — online/offline connectivity indicator (home status box)

/**
 * Updates the home status box from navigator.onLine: green dot + "Connected"
 * when online, muted dot + "No connection" when offline. Text follows the
 * current UI language. Call on language change and on online/offline events.
 */
function updateConnectivity() {
  const online = navigator.onLine;
  const box = document.getElementById('conn-status');
  const txt = document.getElementById('conn-text');
  if (box && txt) {
    box.classList.toggle('offline', !online);
    txt.textContent = online ? tr().statusOnline : tr().statusOffline;
  }
  if (typeof updateOutboxHomeStatus === 'function') updateOutboxHomeStatus();
  if (document.getElementById('screen-outbox')?.classList.contains('active') && typeof renderOutbox === 'function') {
    renderOutbox();
  }
  if (online && typeof autoSync === 'function') autoSync();   // flush queued forms
}

window.addEventListener('online',  updateConnectivity);
window.addEventListener('offline', updateConnectivity);
