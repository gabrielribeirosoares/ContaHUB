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
let unsubUsers = null;
let unreadObservers = {};
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
  document.getElementById('tab-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  lastActiveTab = id;
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
function loadUsers() {
  if (unsubUsers) unsubUsers();

  unsubUsers = db.collection('users')
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

          const roomId = getDmDocId(currentUser.uid, uid);

          if (!unreadObservers[roomId]) {
            unreadObservers[roomId] = db.collection('directMessages').doc(roomId).collection('messages')
              .onSnapshot(s => {
                let dmCount = 0;
                s.forEach(d => {
                  const m = d.data();
                  if (m.authorId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) dmCount++;
                });
                const b = div.querySelector('.unread-badge');
                if (b) { b.textContent = dmCount; b.style.display = dmCount > 0 ? 'inline-block' : 'none'; }
              }, err => {
                if (err.code !== 'permission-denied') console.error('DM listener erro:', err);
              });
          }
        } else {
          div.style.cursor = 'default';
        }

        // ✅ Bolinha começa vermelha (offline) por padrão
        div.innerHTML = `
          <div class="dot dot-${uid}" title="Offline"></div>
          <div class="user-av" style="background:${u.color || '#3a4060'}">${u.initials || '??'}</div>
          <div>
            <div class="user-name">${nameStr} ${isMe ? '<span style="color:var(--muted);font-size:10px">(Você)</span>' : ''}</div>
            <div class="user-status">${u.role || ''}</div>
          </div>
          <span class="unread-badge"></span>
          `;

        // ✅ Insere no DOM antes do listener
        container.appendChild(div);


        rtdb.ref(`/status/${uid}`).on('value', statusSnap => {
          console.log(`[RTDB] uid=${uid} status=`, statusSnap.val());
          const status = statusSnap.val();
          const dot = div.querySelector(`.dot-${uid}`);
          if (dot) {
            const isOnline = status
              && status.state === 'online'
              && (Date.now() - status.lastChanged) < 30 * 60 * 1000;
            dot.style.setProperty('background', isOnline ? 'var(--green)' : '#e05f5f', 'important');
            dot.title = isOnline ? 'Online' : 'Offline';
          }
        });
      });

      const statMembers = $('stat-members');
      if (statMembers) statMembers.textContent = count;
    }, err => {
      console.error('loadUsers erro:', err);
    });
}

// ════════════════════════════════════════════
//  AUTH & INICIALIZAÇÃO
// ════════════════════════════════════════════
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }

  try {
    const snap = await db.collection('users').doc(user.uid).get();
    currentUser = snap.exists
      ? { uid: user.uid, ...snap.data() }
      : { uid: user.uid, name: 'Usuário', surname: '', initials: 'US', color: '#3a4060', role: '' };

    if (!currentUser.tenantId) {
      console.warn("⚠️ Utilizador sem tenantId!");
      currentUser.tenantId = "empresa_teste";
    }
  } catch (e) {
    currentUser = { uid: user.uid, name: 'Usuário', surname: '', initials: 'US', color: '#3a4060', role: '' };
  }

  $('user-avatar').textContent = currentUser.initials || 'US';
  $('user-avatar').style.background = currentUser.color || '#3a4060';
  $('user-name-text').textContent = currentUser.name + ' ' + (currentUser.surname || '');

  initPresence();
  loadUsers();

  const roomDocId = getChannelDocId(currentChannel);
  subscribeChat('channels', roomDocId, currentChatTargetName);

  if (typeof subscribeMural === 'function') subscribeMural();
  if (typeof initSectorViews === 'function') initSectorViews();
  if (typeof subscribeClients === 'function') subscribeClients();

  setTimeout(() => {
    const loader = $('loading-overlay');
    if (loader) loader.classList.add('hidden');
    showStartupAlert();
  }, 600);
});

// ════════════════════════════════════════════
//  LOGOUT
// ════════════════════════════════════════════
async function doLogout() {
  if (currentUser) {
    await rtdb.ref(`/status/${currentUser.uid}`).set({
      state: 'offline',
      lastChanged: firebase.database.ServerValue.TIMESTAMP
    });
  }
  if (unsubChat) unsubChat();
  if (unsubMural) unsubMural();
  if (unsubTasks) unsubTasks();
  if (unsubAgenda) unsubAgenda();
  if (unsubAgendaRP) unsubAgendaRP();
  if (unsubUsers) unsubUsers();
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  Object.values(unreadObservers).forEach(u => u());
  await auth.signOut();
}

// ════════════════════════════════════════════
//  NOTIFICAÇÕES
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

// ════════════════════════════════════════════
//  ALERTA INICIAL
// ════════════════════════════════════════════
async function showStartupAlert() {
  const alertEl = document.getElementById('startup-alert');
  const bodyEl = document.getElementById('startup-alert-body');
  if (!alertEl || !bodyEl || !currentUser) return;

  try {
    const userSectors = getUserSectors(currentUser?.role || '');
    if (!userSectors || userSectors.length === 0) return;

    const snap = await db.collection('tasks')
      .where('tenantId', '==', currentUser.tenantId)
      .where('tag', 'in', userSectors)
      .get();

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let lateTasks = [], soonTasks = [];

    snap.forEach(doc => {
      const t = doc.data();
      if (!t.due || t.column === 'done') return;
      const d = new Date(t.due + 'T00:00:00');
      const diff = Math.ceil((d - today) / 86400000);
      if (diff < 0) lateTasks.push(t);
      else if (diff <= 3) soonTasks.push(t);
    });

    if (lateTasks.length === 0 && soonTasks.length === 0) return;

    const SECTOR_LABELS = { fiscal: 'Dep. Fiscal', dp: 'Dep. Pessoal', contabil: 'Dep. Contábil' };
    let html = '';

    if (lateTasks.length > 0) {
      html += `<div style="color:var(--red);font-size:14px;font-weight:700;margin-bottom:8px;">⚠️ ${lateTasks.length} Tarefa(s) Atrasada(s):</div>`;
      lateTasks.forEach(t => {
        const data = t.due.split('-').reverse().join('/');
        html += `<div style="background:rgba(224,95,95,0.08);padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:13px;border:1px solid rgba(224,95,95,0.3);display:flex;justify-content:space-between;align-items:center;">
          <div><strong style="color:var(--text)">${escHtml(t.title)}</strong><br><span style="font-size:10.5px;color:var(--muted)">${SECTOR_LABELS[t.tag] || t.tag} • Resp: ${escHtml(t.authorName || 'N/A')}</span></div>
          <span style="color:var(--red);font-size:11px;white-space:nowrap;margin-left:10px">Venceu: ${data}</span>
        </div>`;
      });
    }

    if (soonTasks.length > 0) {
      html += `<div style="color:var(--accent2);font-size:14px;font-weight:700;margin-bottom:8px;margin-top:16px;">🟡 ${soonTasks.length} Tarefa(s) a Vencer em breve:</div>`;
      soonTasks.forEach(t => {
        const data = t.due.split('-').reverse().join('/');
        html += `<div style="background:rgba(201,168,76,0.08);padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:13px;border:1px solid rgba(201,168,76,0.3);display:flex;justify-content:space-between;align-items:center;">
          <div><strong style="color:var(--text)">${escHtml(t.title)}</strong><br><span style="font-size:10.5px;color:var(--muted)">${SECTOR_LABELS[t.tag] || t.tag} • Resp: ${escHtml(t.authorName || 'N/A')}</span></div>
          <span style="color:var(--accent2);font-size:11px;white-space:nowrap;margin-left:10px">Vence: ${data}</span>
        </div>`;
      });
    }

    bodyEl.innerHTML = html;
    alertEl.style.display = 'flex';
  } catch (err) {
    console.error("Erro ao carregar resumo de tarefas:", err);
  }
}

function closeStartupAlert() {
  const alertEl = document.getElementById('startup-alert');
  if (alertEl) {
    alertEl.style.opacity = '0';
    setTimeout(() => { alertEl.style.display = 'none'; alertEl.style.opacity = '1'; }, 300);
  }
}

function openLightbox(url) {
  const lightbox = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = url;
  lightbox.style.display = 'flex';
  setTimeout(() => { lightbox.style.opacity = '1'; img.style.transform = 'scale(1)'; }, 10);
}

function closeLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  lightbox.style.opacity = '0';
  img.style.transform = 'scale(0.95)';
  setTimeout(() => { lightbox.style.display = 'none'; img.src = ''; }, 300);
}