(function () {
  const AUTH_KEY = 'learning-log:auth';
  let mode = 'login';

  function getStoredAuth() {
    try {
      return JSON.parse(window.localStorage.getItem(AUTH_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  async function redirectIfAlreadyLoggedIn() {
    const auth = getStoredAuth();
    if (!auth || !auth.token) return;
    try {
      const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + auth.token } });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
    } catch (e) {
      // network error - fall through and let the user log in again
    }
    window.localStorage.removeItem(AUTH_KEY);
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === mode);
    });
    const passwordEl = document.getElementById('a-password');
    const submitEl = document.getElementById('auth-submit');
    const hintEl = document.getElementById('auth-hint');
    const errorEl = document.getElementById('auth-error');

    if (mode === 'login') {
      passwordEl.autocomplete = 'current-password';
      submitEl.textContent = 'Log in';
      hintEl.textContent = 'Log in to continue tracking your learning.';
    } else {
      passwordEl.autocomplete = 'new-password';
      submitEl.textContent = 'Sign up';
      hintEl.textContent = 'Choose a username and a password (6+ characters).';
    }
    errorEl.textContent = '';
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.getAttribute('data-tab')));
  });

  document.getElementById('auth-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errorEl = document.getElementById('auth-error');
    const submitEl = document.getElementById('auth-submit');
    errorEl.textContent = '';

    const username = document.getElementById('a-username').value.trim();
    const password = document.getElementById('a-password').value;

    if (!username || !password) {
      errorEl.textContent = 'Enter a username and password.';
      return;
    }

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    submitEl.disabled = true;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.textContent = data.error || 'Something went wrong. Try again.';
        return;
      }

      window.localStorage.setItem(AUTH_KEY, JSON.stringify({ token: data.token, username: data.username }));
      window.location.href = '/';
    } catch (e) {
      errorEl.textContent = 'Could not reach the server. Is it running?';
    } finally {
      submitEl.disabled = false;
    }
  });

  redirectIfAlreadyLoggedIn();
})();
