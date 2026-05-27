// VIM — account screen


function currentUserDisplayName() {
  return (apiUser && (apiUser.name || apiUser.username || apiUser.email)) ||
    testerName ||
    apiUsername ||
    '';
}

function currentUsername() {
  return (apiUser && (apiUser.username || apiUser.email)) || apiUsername || '';
}

function updateUserBar() {
  const btn = document.getElementById('bar-user-btn');
  const name = document.getElementById('bar-user-name');
  if (!btn || !name) return;

  if (!isLoggedIn()) {
    btn.style.display = 'none';
    name.textContent = '';
    return;
  }

  name.textContent = currentUserDisplayName();
  btn.style.display = 'inline-flex';
}

function renderAccount() {
  const label = document.getElementById('account-label');
  const name = document.getElementById('account-name');
  const username = document.getElementById('account-username');
  const logoutBtn = document.getElementById('account-logout-btn');

  if (label) label.textContent = tr().accountLoggedUser;
  if (name) name.textContent = currentUserDisplayName();
  if (username) {
    const value = currentUsername();
    username.textContent = value && value !== currentUserDisplayName() ? value : '';
  }
  if (logoutBtn) logoutBtn.textContent = tr().logout;
}
