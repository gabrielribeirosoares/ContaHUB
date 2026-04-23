async function doSignup() {
  const companyName = document.getElementById('reg-company').value.trim();
  const userName = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const feedback = document.getElementById('signup-feedback');
  const btn = document.getElementById('btn-signup');

  if (!companyName || !userName || !email || !password) {
    showFeedback('Preencha todos os campos.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = "A criar escritório...";

  try {
    // 1. Criar o utilizador no Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;

    // 2. Gerar um Tenant ID único (Slug + Timestamp)
    const tenantId = companyName.toLowerCase()
      .replace(/\s+/g, '-') 
      .replace(/[^\w-]/g, '') + '-' + Math.floor(Date.now() / 1000);

    // 3. Criar o documento da Empresa (Tenants)
    await db.collection('tenants').doc(tenantId).set({
      name: companyName,
      ownerUid: uid,
      plan: 'trial',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 4. Criar o Perfil do Usuário como GESTOR
    const initials = userName.substring(0, 2).toUpperCase();
    await db.collection('users').doc(uid).set({
      name: userName,
      surname: '',
      email: email,
      role: 'gestor',
      tenantId: tenantId,
      color: '#c9a84c',
      initials: initials,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showFeedback('Conta criada com sucesso! A entrar...', 'success');
    
    // 5. Redirecionar para o dashboard
    setTimeout(() => {
      window.location.href = 'escritorio-virtual.html';
    }, 1500);

  } catch (error) {
    console.error(error);
    showFeedback(mapError(error.code), 'error');
    btn.disabled = false;
    btn.textContent = "Criar meu Escritório →";
  }
}

function showFeedback(msg, type) {
  const el = document.getElementById('signup-feedback');
  el.className = 'feedback ' + type;
  el.style.display = 'block';
  el.textContent = (type === 'error' ? '⚠️ ' : '✅ ') + msg;
}

function mapError(code) {
  const errors = {
    'auth/email-already-in-use': 'Este e-mail já está registado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.'
  };
  return errors[code] || 'Ocorreu um erro ao criar a conta.';
}