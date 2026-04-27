// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Permissão centralizada ───────────────────────────────────
const isGestor = () => (currentUser?.role || '').toLowerCase() === 'gestor';

// ════════════════════════════════════════════
//  ESTADO GLOBAL
// ════════════════════════════════════════════
let currentUser = null;
let currentChannel = 'geral';
let isDM = false;
let currentDM = null;
let currentChatTargetName = '#geral';
let unsubChat = null;
let unsubMural = null;
let unsubTasks = null;
let unsubAgenda = null;
let unsubAgendaRP = null;
let unsubUsersSidebar = null;
let unsubUsersAdmin = null;
let unreadObservers = {};
let statusObservers = {}; // 🔴 NOVO: para limpar listeners de status
let activeReply = null;
let pendingFile = null;
const notifySound = new Audio("./sounds/step.mp3");
notifySound.volume = 0.5;
let typingTimeout = null;
let unsubTyping = null;
let _lastSendTs = 0;
let lastActiveTab = 'chat';

// ════════════════════════════════════════════
//  UI & SIDEBAR
// ════════════════════════════════════════════
function toggleSidebar() {
  $('sidebar').classList.toggle('open');
  $('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('open');
}
function toggleRightPanel() {
  $('right-panel').classList.toggle('open');
}
function updateDate() {
  const d = new Date();
  const dateEl = document.getElementById('live-date');
  if (dateEl) {
    dateEl.textContent = d.toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  }
}
updateDate();
window.addEventListener('load', () => { updateDate(); setInterval(updateDate, 60000); });

function switchTab(id, btn) {
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('tab-' + id);
  if (!panel) return;
  panel.classList.add('active');
  if (btn) btn.classList.add('active');
  lastActiveTab = id;

  if (id === 'usuarios') {
    const usersBox = panel.querySelector('.users-admin-wrap');
    if (usersBox) {
      usersBox.classList.remove('users-box-enter');
      void usersBox.offsetWidth; // reinicia animação
      usersBox.classList.add('users-box-enter');
    }
  }
}

function toggleTheme() {
  const body = document.body;
  const btn = document.getElementById('btn-theme');
  if (body.classList.contains('light')) {
    body.classList.remove('light');
    if (btn) btn.textContent = '🌙';
    localStorage.setItem('contahub-theme', 'dark');
  } else {
    body.classList.add('light');
    if (btn) btn.textContent = '☀️';
    localStorage.setItem('contahub-theme', 'light');
  }
}

(function initTheme() {
  const savedTheme = localStorage.getItem('contahub-theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('btn-theme');
      if (btn) btn.textContent = '☀️';
    });
  }
})();

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════
//  SISTEMA DE PRESENÇA ONLINE/OFFLINE
// ════════════════════════════════════════════
function initPresence() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const userStatusRTDB = rtdb.ref(`/status/${uid}`);
  const connectedRef = rtdb.ref('.info/connected');

  const isOnline = {
    state: 'online',
    lastChanged: firebase.database.ServerValue.TIMESTAMP
  };
  const isOffline = {
    state: 'offline',
    lastChanged: firebase.database.ServerValue.TIMESTAMP
  };

  connectedRef.on('value', snap => {
    if (snap.val() === false) return;
    userStatusRTDB.onDisconnect().set(isOffline).then(() => {
      userStatusRTDB.set(isOnline);
    });
  });
}

// ════════════════════════════════════════════
//  CARREGAR USUÁRIOS (BARRA LATERAL)
// ════════════════════════════════════════════
// ════════════════════════════════════════════
//  CARREGAR USUÁRIOS (BARRA LATERAL)
// ════════════════════════════════════════════
function loadUsers() {
  if (unsubUsersSidebar) unsubUsersSidebar();
  
  Object.values(statusObservers).forEach(unsub => unsub());
  statusObservers = {};

  unsubUsersSidebar = db.collection('users')
    .where('tenantId', '==', currentUser.tenantId)
    .onSnapshot(snap => {
      const container = $('users-sidebar');
      if (!container) return;

      container.innerHTML = '';
      let count = 0;
      const usersList = [];

      snap.forEach(doc => usersList.push({ id: doc.id, ...doc.data() }));

      usersList.sort((a, b) =>
        (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
      );

      usersList.forEach(u => {
        count++;
        const uid = u.id;
        const isMe = currentUser && uid === currentUser.uid;
        const nameStr = u.name + ' ' + (u.surname || '');

        const div = document.createElement('div');
        div.className = 'user-row' + (isDM && currentDM === uid ? ' active-dm' : '');
        div.dataset.uid = uid;

        if (!isMe) {
          div.onclick = () => { openDM(uid, nameStr, div); closeSidebar(); };
          
          // 🔥 CORREÇÃO 1: Cria o ID da sala diretamente aqui, sem depender do chat.js (Restaura o Histórico)
          const roomId = typeof getDmDocId === 'function'
            ? getDmDocId(currentUser.uid, uid)
            : (currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`);

          if (typeof ensureDmRoomExists === 'function') {
            ensureDmRoomExists(roomId, uid).catch(() => {});
          }

          if (!unreadObservers[roomId]) {
            let dmBootstrapped = false;
            unreadObservers[roomId] = db.collection('directMessages').doc(roomId).collection('messages')
              .onSnapshot(s => {
                let dmCount = 0;
                s.forEach(d => {
                  const m = d.data();
                  if (m.authorId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) dmCount++;
                });
                const b = div.querySelector('.unread-badge');
                if (b) { b.textContent = dmCount; b.style.display = dmCount > 0 ? 'inline-block' : 'none'; }

                if (dmBootstrapped && !s.metadata.fromCache) {
                  const lastAdded = s.docChanges().filter(c => c.type === 'added').map(c => c.doc.data())
                    .find(m => m.authorId !== currentUser.uid);
                  if (lastAdded) {
                    notifySound.play().catch(() => {});
                    if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
                      const notification = new Notification(`ContaHub: Nova mensagem de ${nameStr}`, {
                        body: lastAdded.text || '📎 Ficheiro anexado',
                        icon: 'logo-contahub.png'
                      });
                      notification.onclick = function() { window.focus(); };
                    }
                  }
                }
                dmBootstrapped = true;
              }, err => {
                if (err.code === 'permission-denied') {
                  const b = div.querySelector('.unread-badge');
                  if (b) b.style.display = 'none';
                  return;
                }
                console.error('DM listener erro:', err);
              });
          }
        } else {
          div.style.cursor = 'default';
        }

        div.innerHTML = `
          <div class="user-av" style="background:${u.color || '#3a4060'}">${u.initials || '??'}</div>
          <div>
            <div class="user-name">${nameStr} ${isMe ? '<span style="color:var(--muted);font-size:10px">(Você)</span>' : ''}</div>
            <div class="user-status">${u.role || ''}</div>
          </div>
          <span class="unread-badge"></span>
          <div class="dot dot-${uid}" title="Offline"></div>
        `;

        container.appendChild(div);

        const statusRef = rtdb.ref(`/status/${uid}`);
        const listener = statusRef.on('value', statusSnap => {
          const status = statusSnap.val();
          const dot = div.querySelector(`.dot-${uid}`);
          if (dot) {
            const isOnline = status && status.state === 'online';
            if (isOnline) {
              dot.classList.add('online');
              dot.title = 'Online';
            } else {
              dot.classList.remove('online');
              dot.title = 'Offline';
            }
          }
        });
        statusObservers[uid] = () => statusRef.off('value', listener);
      });

      const statMembers = $('stat-members');
      if (statMembers) statMembers.textContent = count;
    }, err => {
      console.error('Erro crítico no loadUsers:', err);
    });
}

// ════════════════════════════════════════════
//  AUTH & INICIALIZAÇÃO DO SISTEMA
// ════════════════════════════════════════════
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }

  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (snap.exists) {
      currentUser = { uid: user.uid, ...snap.data() };
    } else {
      const defaultName = (user.displayName || user.email || 'Gestor').split('@')[0];
      currentUser = {
        uid: user.uid,
        name: defaultName,
        surname: '',
        initials: (defaultName || 'G').substring(0, 2).toUpperCase(),
        color: '#c9a84c',
        role: 'gestor',
        tenantId: user.uid
      };

      try {
        await db.collection('users').doc(user.uid).set({
          name: currentUser.name,
          surname: '',
          email: user.email || '',
          role: 'gestor',
          tenantId: user.uid,
          color: currentUser.color,
          initials: currentUser.initials,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (bootstrapErr) {
        if (bootstrapErr.code !== 'permission-denied') throw bootstrapErr;
        console.warn('Sem permissão para bootstrap do perfil. Usando perfil local de gestor.', bootstrapErr);
      }
    }

    if (!currentUser.tenantId) {
      console.warn("⚠️ Utilizador sem tenantId!");
      currentUser.tenantId = user.uid;
    }
  } catch (e) {
    currentUser = { uid: user.uid, name: 'Gestor', surname: '', initials: 'GE', color: '#c9a84c', role: 'gestor', tenantId: user.uid };
  }

  // Atualiza a interface
  $('user-avatar').textContent = currentUser.initials || 'US';
  $('user-avatar').style.background = currentUser.color || '#3a4060';
  $('user-name-text').textContent = currentUser.name + ' ' + (currentUser.surname || '');

  // Inicia os serviços principais
  initPresence();
  loadUsers(); // 🟢 ÚNICA CHAMADA
  if (typeof initUnreadCounters === 'function') initUnreadCounters();

  if (typeof getChannelDocId === 'function' && typeof subscribeChat === 'function') {
    const roomDocId = getChannelDocId(currentChannel);
    subscribeChat('channels', roomDocId, currentChatTargetName);
  }

  if (typeof subscribeMural === 'function') subscribeMural();
  if (typeof initSectorViews === 'function') initSectorViews();
  if (typeof subscribeClients === 'function') subscribeClients();

  if (isGestor()) {
    const btnGerar = document.getElementById('btn-gerar-tarefas');
    if (btnGerar) btnGerar.style.display = 'inline-block';
  }

  setTimeout(() => {
    const loader = $('loading-overlay');
    if (loader) loader.classList.add('hidden');
    if (typeof showStartupAlert === 'function') showStartupAlert();
  }, 600);
});

// ════════════════════════════════════════════
//  LOGOUT (com cleanup completo)
// ════════════════════════════════════════════
async function doLogout() {
  if (currentUser) {
    await rtdb.ref(`/status/${currentUser.uid}`).set({
      state: 'offline',
      lastChanged: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // Limpa todos os listeners
  if (unsubChat) unsubChat();
  if (unsubMural) unsubMural();
  if (unsubTasks) unsubTasks();
  if (unsubAgenda) unsubAgenda();
  if (unsubAgendaRP) unsubAgendaRP();
  if (unsubUsersSidebar) unsubUsersSidebar();
  if (unsubUsersAdmin) unsubUsersAdmin();
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  
  Object.values(unreadObservers).forEach(u => u());
  Object.values(statusObservers).forEach(u => u()); // 🟢 LIMPA STATUS LISTENERS
  
  // Reseta objetos de listeners
  unreadObservers = {};
  statusObservers = {};
  
  await auth.signOut();
}

// ════════════════════════════════════════════
//  NOTIFICAÇÕES E ALERTAS
// ════════════════════════════════════════════
document.body.addEventListener('click', () => {
  if (typeof Notification !== 'undefined') {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") console.log("Notificações ativadas!");
      });
    }
  }
}, { once: true });

// ... (resto das funções permanecem iguais: showStartupAlert, closeStartupAlert, openLightbox, etc.)

// ════════════════════════════════════════════
//  ADMINISTRAÇÃO DE USUÁRIOS (Gestor)
// ════════════════════════════════════════════
let editingUserId = null;

function showFeedback(el, msg, color) {
  el.textContent = msg; el.style.color = color; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function animateUserForm(formEl) {
  if (!formEl) return;
  formEl.classList.remove('users-form-enter');
  void formEl.offsetWidth;
  formEl.classList.add('users-form-enter');
}

function initUsersAdmin() {
  const isGestorRole = isGestor();
  const btn = document.getElementById('btn-tab-usuarios');
  if (btn) btn.style.display = isGestorRole ? '' : 'none';
  if (!isGestorRole) return;
  
  if (unsubUsersAdmin) { unsubUsersAdmin(); unsubUsersAdmin = null; }
  
  unsubUsersAdmin = db.collection('users')
    .where('tenantId', '==', currentUser.tenantId).onSnapshot(snap => {
      const container = $('users-admin-list');
      const label = document.getElementById('users-count-label');
      if (!container) return; 
      container.innerHTML = '';
      
      if (label) label.textContent = snap.size + ' usuário(s) cadastrado(s)';
      
      snap.forEach(doc => {
        const u = doc.data(); 
        const isSelf = doc.id === currentUser?.uid;
        const roleLabel = { fiscal: 'Dep. Fiscal', dp: 'Dep. Pessoal', contabil: 'Dep. Contábil', gestor: 'Gestor' }[u.role] || u.role || '—';
        
        const card = document.createElement('div'); 
        card.className = 'user-admin-card';
        card.innerHTML = `
          <div class="user-av users-admin-avatar" style="background:${u.color || '#3a4060'}">${u.initials || '?'}</div>
          <div class="uac-info">
            <div class="uac-name">${escHtml((u.name || '') + ' ' + (u.surname || ''))} ${isSelf ? '<span class="uac-self-tag">(você)</span>' : ''}</div>
            <div class="uac-role">${escHtml(roleLabel)}</div>
            <div class="uac-email">${escHtml(u.email || '')}</div>
          </div>
          <div class="uac-actions">
            <button class="btn-uac-edit" onclick="openUserEdit('${doc.id}')">✏️</button>
            ${!isSelf ? `<button class="btn-uac-del" onclick="deleteUser('${doc.id}')">🗑️</button>` : ''}
          </div>`;
        container.appendChild(card);
      });
    });
}

function openCreateUser() {
  editingUserId = null;
  const editModal = document.getElementById('user-edit-modal');
  if (editModal) editModal.style.display = 'none';
  document.getElementById('uform-create').style.display = 'block'; document.getElementById('uform-wrap').style.display = 'none';
  document.getElementById('user-create-modal').style.display = 'flex';
  animateUserForm(document.getElementById('uform-create'));
  ['new-user-name', 'new-user-surname', 'new-user-email', 'new-user-pass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('new-user-role').value = ''; document.getElementById('new-user-color').value = '#3a4060'; document.getElementById('new-user-feedback').style.display = 'none';
}

function cancelCreateUser() {
  document.getElementById('uform-create').style.display = 'none';
  const modal = document.getElementById('user-create-modal');
  if (modal) modal.style.display = 'none';
}

function openUserEdit(uid) {
  editingUserId = uid;
  db.collection('users').doc(uid).get().then(doc => {
    if (!doc.exists) return;
    const u = doc.data();
    document.getElementById('uform-create').style.display = 'none'; document.getElementById('uform-name').value = (u.name || '') + ' ' + (u.surname || '');
    document.getElementById('uform-role').value = u.role || ''; document.getElementById('uform-color').value = u.color || '#3a4060';
    document.getElementById('uform-wrap').style.display = 'block';
    document.getElementById('user-edit-modal').style.display = 'flex';
    cancelCreateUser();
    animateUserForm(document.getElementById('uform-wrap'));
    document.getElementById('uform-title').textContent = '✏️ Editar: ' + escHtml(u.name || ''); document.getElementById('uform-feedback').style.display = 'none';
  });
}

async function saveUserEdit() {
  if (!editingUserId) return;
  const fullName = document.getElementById('uform-name').value.trim(); const role = document.getElementById('uform-role').value; const color = document.getElementById('uform-color').value;
  const parts = fullName.split(' '); const name = parts[0] || ''; const surname = parts.slice(1).join(' '); const initials = ((name[0] || '') + (surname[0] || '')).toUpperCase() || '?';
  try {
    await db.collection('users').doc(editingUserId).update({ name, surname, role, color, initials });
    if (editingUserId === currentUser?.uid) {
      currentUser.name = name; currentUser.surname = surname; currentUser.role = role; currentUser.color = color; currentUser.initials = initials;
      $('user-avatar').textContent = initials; $('user-avatar').style.background = color; $('user-name-text').textContent = fullName;
      filterChannels(); initSectorViews();
    }
    const fb = document.getElementById('uform-feedback'); if (fb) { fb.style.display = 'block'; setTimeout(() => fb.style.display = 'none', 3000); }
  } catch (e) { alert('Erro: ' + e.message); }
}

function cancelUserEdit() {
  editingUserId = null; document.getElementById('uform-wrap').style.display = 'none'; document.getElementById('uform-create').style.display = 'none';
  const modal = document.getElementById('user-edit-modal');
  if (modal) modal.style.display = 'none';
  document.getElementById('uform-title').textContent = '✏️ Editar Usuário';
}

function closeUserEditModal(event) {
  if (event?.target?.id !== 'user-edit-modal') return;
  cancelUserEdit();
}

function closeUserCreateModal(event) {
  if (event?.target?.id !== 'user-create-modal') return;
  cancelCreateUser();
}

async function deleteUser(uid) { if (confirm('Remover este usuário do sistema?')) { try { await db.collection('users').doc(uid).delete(); } catch (e) { alert('Erro: ' + e.message); } } }

async function createUser() {
  const name = document.getElementById('new-user-name').value.trim(); const surname = document.getElementById('new-user-surname').value.trim();
  const email = document.getElementById('new-user-email').value.trim(); const pass = document.getElementById('new-user-pass').value;
  const role = document.getElementById('new-user-role').value; const color = document.getElementById('new-user-color').value;
  const feedback = document.getElementById('new-user-feedback');
  if (!name || !email || !pass || !role) { showFeedback(feedback, '⚠️ Preencha todos os campos obrigatórios.', 'var(--red)'); return; }
  if (pass.length < 6) { showFeedback(feedback, '⚠️ A senha deve ter ao menos 6 caracteres.', 'var(--red)'); return; }
  const btn = document.querySelector('#uform-create .btn-post'); btn.textContent = 'Criando...'; btn.disabled = true;
  try {
    const secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary_' + Date.now());
    const secondaryAuth = secondaryApp.auth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
    const uid = cred.user.uid; const initials = ((name[0] || '') + (surname[0] || '')).toUpperCase();
    // Localize esta parte dentro da função createUser()
    await db.collection('users').doc(uid).set({
      name,
      surname,
      email,
      role,
      color,
      initials,
      tenantId: currentUser.tenantId, // 🔴 ADICIONE ESTA LINHA
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await secondaryAuth.signOut(); await secondaryApp.delete();
    showFeedback(feedback, '✅ Usuário criado com sucesso!', 'var(--green)');
    setTimeout(() => { cancelCreateUser(); }, 2000);
  } catch (e) {
    const msgs = { 'auth/email-already-in-use': 'Este e-mail já está em uso.', 'auth/invalid-email': 'E-mail inválido.' };
    showFeedback(feedback, '❌ ' + (msgs[e.code] || e.message), 'var(--red)');
  } finally { btn.textContent = 'Criar Usuário'; btn.disabled = false; }
}

async function generateInviteLink() {
  const email = document.getElementById('invite-email').value.trim();
  const role = document.getElementById('invite-role').value;

  if (!email) return alert("Digite o e-mail do funcionário.");

  try {
    const inviteRef = await db.collection('invites').add({
      email,
      role,
      tenantId: currentUser.tenantId,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Gera o link apontando para uma nova página de aceite

    const inviteLink = window.location.href.replace("escritorio-virtual.html", "aceitar-convite.html") + "?id=" + inviteRef.id;

    openInviteModal();
    document.getElementById('invite-link-display').style.display = 'block';
    document.getElementById('generated-link').value = inviteLink;

    alert("Link de convite gerado com sucesso!");
  } catch (error) {
    console.error("Erro ao gerar convite:", error);
  }
}

function openInviteModal() {
  const modal = document.getElementById('user-invite-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  animateUserForm(document.getElementById('users-invite-body'));
}

function closeInviteModal(event) {
  if (event?.target && event.target.id !== 'user-invite-modal') return;
  const modal = document.getElementById('user-invite-modal');
  if (modal) modal.style.display = 'none';
}
