async function doSignup() {
  const companyName = document.getElementById('reg-company').value.trim();
  const userName = document.getElementById('reg-name').value.trim();
  const userSurname = document.getElementById('reg-surname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const feedback = document.getElementById('signup-feedback');
  const btn = document.getElementById('btn-signup');

  if (!companyName || !userName || !userSurname || !email || !password) {
    showFeedback('Preencha todos os campos.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = "A criar escritório...";

  try {
    // 1. Criar o utilizador no Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;
    await userCredential.user.getIdToken(true);
    const tenantId = uid;
    const tenantSlug = buildTenantSlug(companyName);
    const tenantRef = db.collection('tenants').doc(tenantId);
    const userRef = db.collection('users').doc(uid);

    // 3. Criar perfil do gestor (obrigatório para aparecer na aba Usuários)
    const initials = getInitials(userName, userSurname);
    await userRef.set({
      name: userName,
      surname: userSurname,
      email: email,
      role: 'gestor',
      tenantId: tenantId,
      color: '#c9a84c',
      initials: initials,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 4. Criar tenant (não bloqueia o acesso inicial caso rules neguem escrita)
    try {
      await tenantRef.set({
        name: companyName,
        slug: tenantSlug,
        ownerUid: uid,
        plan: 'trial',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (tenantErr) {
      if (tenantErr.code !== 'permission-denied') throw tenantErr;
      console.warn('Sem permissão para criar tenant no Firestore. Continuando com perfil do gestor.', tenantErr);
    }

    showFeedback('Conta criada com sucesso! A entrar...', 'success');
    
    // 5. Redirecionar para o dashboard
    setTimeout(() => {
      window.location.href = 'escritorio-virtual.html';
    }, 1500);

  } catch (error) {
    console.error(error);
    showFeedback(mapError(error.code), 'error');
    if (auth.currentUser) {
      try { await auth.currentUser.delete(); } catch (_) {}
    }
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
    'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
    'permission-denied': 'Sem permissão no Firestore para salvar o perfil do usuário.'
  };
  return errors[code] || 'Ocorreu um erro ao criar a conta.';
}

function getInitials(name, surname) {
  const first = (name || '').trim();
  const last = (surname || '').trim();
  if (!first && !last) return 'US';
  if (!last) return first.substring(0, 2).toUpperCase();
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
}

function buildTenantSlug(companyName) {
  return (companyName || 'empresa')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'empresa';
}
