// VIM — API login. VIM_SERVICES_URL is injected from .env at build time.
const AUTH_API_URL = window.VIM_AUTH_API_URL ||
  '__VIM_SERVICES_URL__' ||
  `${window.location.protocol}//${window.location.hostname}:8085/api/v1`;

/** isLoggedIn() — True if a user session has already been persisted. */
function isLoggedIn() { return loggedIn === true && !!apiAccessToken; }

/** renderLogin() — Localize texts, prefill the known name, hide the error. */
function renderLogin() {
  const s = tr();
  const set = (id, prop, val) => { const e = document.getElementById(id); if (e) e[prop] = val; };
  set('login-title', 'textContent', s.loginTitle);
  set('login-name',  'placeholder', s.loginName);
  set('login-code',  'placeholder', s.loginCode);
  set('login-btn',   'textContent', s.loginBtn);
  set('login-name',  'value', apiUsername || testerName || '');
  // Reset the password field to hidden + open-eye icon
  const codeInp = document.getElementById('login-code');
  if (codeInp) codeInp.type = 'password';
  const eye = document.getElementById('login-eye');
  if (eye) { eye.innerHTML = EYE_OPEN; eye.setAttribute('aria-label', 'Mostra codice'); }
  const err = document.getElementById('login-error');
  if (err) err.style.display = 'none';
}

/**
 * doLogin() — Authenticate via the backend API. On success: persist auth and go
 * to the language screen. On error: show an inline message.
 */
async function doLogin() {
  const username = (document.getElementById('login-name').value || '').trim();
  const password = (document.getElementById('login-code').value || '').trim();
  const err  = document.getElementById('login-error');
  const btn  = document.getElementById('login-btn');
  const show = msg => { if (err) { err.textContent = msg; err.style.display = ''; } };

  if (!username) return show(tr().loginErrName);
  if (!password) return show(tr().loginErrCode);

  if (err) err.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = tr().loading;
  }

  try {
    const response = await fetch(`${AUTH_API_URL}/users/login`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ login: username, password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return show(response.status === 401 ? tr().loginErrCode : (data.error || tr().loginErrNetwork));
    }

    apiUsername    = data.user && data.user.username ? data.user.username : username;
    apiAccessToken = data.access_token || '';
    apiTokenType   = data.token_type || 'bearer';
    apiUser        = data.user || null;
    testerName     = (data.user && (data.user.name || data.user.username)) || apiUsername;
    loggedIn       = !!apiAccessToken;

    if (!loggedIn) return show(tr().loginErrNetwork);

    await saveAuth();
    // If a language was already chosen before, go straight home; otherwise
    // show the language screen (first time).
    if (langChosen) {
      goHome();
    } else {
      renderLangScreen();
      showScreen('screen-lang', tr().appTitle, false);
    }
  } catch (error) {
    show(tr().loginErrNetwork);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = tr().loginBtn;
    }
  }
}

// Eye icons for the password show/hide toggle (open = will reveal on click).
const EYE_OPEN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/** toggleLoginCode() — Show/hide the password field, swapping the eye icon. */
function toggleLoginCode() {
  const inp = document.getElementById('login-code');
  const btn = document.getElementById('login-eye');
  if (!inp || !btn) return;
  const reveal = inp.type === 'password';
  inp.type      = reveal ? 'text' : 'password';
  btn.innerHTML = reveal ? EYE_OFF : EYE_OPEN;
  btn.setAttribute('aria-label', reveal ? 'Nascondi codice' : 'Mostra codice');
  inp.focus();
}

/** logout() — Clears local session and returns to the login screen. */
function logout() {
  loggedIn       = false;
  testerName     = '';
  apiUsername    = '';
  apiAccessToken = '';
  apiTokenType   = 'bearer';
  apiUser        = null;
  saveAuth();
  updateUserBar();
  renderLogin();
  showScreen('screen-login', tr().appTitle, false);
}
