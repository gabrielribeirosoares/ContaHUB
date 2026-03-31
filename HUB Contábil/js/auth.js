// Verifica se o usuário já está logado e redireciona
auth.onAuthStateChanged(user => {
  if (user) window.location.href = 'escritorio-virtual.html';
});

// ════════════════════════════════════════════
//  CONTROLE DE FEEDBACK E FORMULÁRIO
// ════════════════════════════════════════════
function clearFeedback() {
  ['login-feedback'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'feedback';
    el.innerHTML = '';
  });
  ['login-email', 'login-password'].forEach(id => clearLoginFieldError(id));
}

function showFeedback(id, type, msg) {
  const el = document.getElementById(id);
  el.className = 'feedback ' + type;
  el.innerHTML = (type === 'error' ? '⚠️ ' : '✅ ') + msg;
}

function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁️' : '🙈';
}

function setLoginFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.classList.add('input-error');

  let msg = input.closest('.field').querySelector('.field-error-text');
  if (!msg) {
    msg = document.createElement('div');
    msg.className = 'field-error-text';
    input.closest('.field').appendChild(msg);
  }
  msg.textContent = message;
}

function clearLoginFieldError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.classList.remove('input-error');

  const field = input.closest('.field');
  const msg = field.querySelector('.field-error-text');
  if (msg) msg.remove();
}

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

// ════════════════════════════════════════════
//  LÓGICA DE LOGIN NO FIREBASE
// ════════════════════════════════════════════
function mapLoginError(code) {
  const generic = 'E-mail ou senha incorretos. Verifique os dados e tente novamente.';

  const map = {
    'auth/invalid-email': { feedback: 'Digite um e-mail válido.', field: 'login-email', fieldMessage: 'Informe um e-mail válido.' },
    'auth/user-not-found': { feedback: 'Não encontramos uma conta com esse e-mail.', field: 'login-email', fieldMessage: 'Este e-mail não está cadastrado.' },
    'auth/wrong-password': { feedback: 'Senha incorreta.', field: 'login-password', fieldMessage: 'A senha informada está incorreta.' },
    'auth/invalid-credential': { feedback: generic, field: 'login-password', fieldMessage: 'E-mail ou senha incorretos.' },
    'auth/invalid-login-credentials': { feedback: generic, field: 'login-password', fieldMessage: 'E-mail ou senha incorretos.' },
    'auth/too-many-requests': { feedback: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', field: null, fieldMessage: null },
    'auth/network-request-failed': { feedback: 'Sem conexão com a internet. Verifique sua rede e tente novamente.', field: null, fieldMessage: null }
  };

  return map[code] || { feedback: 'Não foi possível entrar agora. Tente novamente.', field: null, fieldMessage: null };
}

async function doLogin() {
  clearFeedback();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  let hasError = false;

  if (!email) {
    setLoginFieldError('login-email', 'Informe seu e-mail.');
    hasError = true;
  } else if (!isValidEmail(email)) {
    setLoginFieldError('login-email', 'Informe um e-mail válido.');
    hasError = true;
  }

  if (!password) {
    setLoginFieldError('login-password', 'Informe sua senha.');
    hasError = true;
  }

  if (hasError) {
    showFeedback('login-feedback', 'error', 'Preencha os campos destacados para continuar.');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Entrando…';

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    const parsed = mapLoginError(err.code);
    showFeedback('login-feedback', 'error', parsed.feedback);

    if (parsed.field && parsed.fieldMessage) {
      setLoginFieldError(parsed.field, parsed.fieldMessage);
      document.getElementById(parsed.field).focus();
    }

    btn.disabled = false;
    btn.textContent = 'Entrar no escritório →';
  }
}

// ════════════════════════════════════════════
//  TEMA (CLARO / ESCURO)
// ════════════════════════════════════════════
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-mode', isLight);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.innerHTML = isLight
      ? '<span class="icon-dark">🌙</span><span class="toggle-text">Modo escuro</span>'
      : '<span class="icon-light">☀️</span><span class="toggle-text">Modo claro</span>';
  }
  localStorage.setItem('contahub-theme', theme);
}

function toggleTheme() {
  const nextTheme = document.body.classList.contains('light-mode') ? 'dark' : 'light';
  applyTheme(nextTheme);
}

(function initTheme() {
  const saved = localStorage.getItem('contahub-theme');
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
})();