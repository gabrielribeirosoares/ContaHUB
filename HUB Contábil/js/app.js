// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Permissão centralizada ───────────────────────────────────
const isGestor = () => (currentUser?.role || '').toLowerCase() === 'gestor';

// ════════════════════════════════════════════
//  ESTADO GLOBAL (Usado por todos os arquivos)
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
let unreadObservers = {};
let activeReply = null;
let pendingFile = null;
// Som de Pop elegante para mensagens
const notifySound = new Audio("./sounds/step.mp3");
notifySound.volume = 0.5; // 50% do volume para não assustar ninguém
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
  if(dateEl) {
    dateEl.textContent = d.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  }
}

// Tenta rodar de imediato
updateDate();

// Tenta rodar de novo assim que toda a tela carregar definitivamente (garantia)
window.addEventListener('load', () => {
  updateDate(); 
});

// Passa a atualizar a cada 1 minuto
setInterval(updateDate, 60000);

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
//  AUTH & INICIALIZAÇÃO
// ════════════════════════════════════════════
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    currentUser = snap.exists
      ? { uid: user.uid, ...snap.data() }
      : { uid: user.uid, name: 'Usuário', surname: '', initials: 'US', color: '#3a4060', role: '' };
  } catch (e) {
    currentUser = { uid: user.uid, name: 'Usuário', surname: '', initials: 'US', color: '#3a4060', role: '' };
  }
  $('user-avatar').textContent = currentUser.initials || 'US';
  $('user-avatar').style.background = currentUser.color || '#3a4060';
  $('user-name-text').textContent = currentUser.name + ' ' + (currentUser.surname || '');
  
  if (typeof loadUsers === 'function') loadUsers();
  if (typeof initUnreadCounters === 'function') initUnreadCounters();
  if (typeof subscribeChat === 'function') subscribeChat('channels', currentChannel, currentChatTargetName);
  if (typeof subscribeMural === 'function') subscribeMural();
  if (typeof initSectorViews === 'function') initSectorViews();
  if (typeof subscribeClients === 'function') subscribeClients();

  // ════════════════════════════════════════════
//  CARREGAR E ORDENAR USUÁRIOS (BARRA LATERAL)
// ════════════════════════════════════════════
function loadUsers() {
  db.collection('users').onSnapshot(snap => {
    const container = $('users-sidebar'); 
    if (!container) return;
    
    container.innerHTML = ''; 
    let count = 0;

    // 1. Extrair os usuários do Firebase para uma lista (Array)
    const usersList = [];
    snap.forEach(doc => {
      usersList.push({ id: doc.id, ...doc.data() });
    });

    // 2. Ordenar a lista em ordem alfabética (Ignorando acentos e maiúsculas/minúsculas)
    usersList.sort((a, b) => {
      const nomeA = (a.name || '').toLowerCase();
      const nomeB = (b.name || '').toLowerCase();
      return nomeA.localeCompare(nomeB);
    });

    // 3. Desenhar a lista já ordenada na tela
    usersList.forEach(u => {
      count++;
      const uid = u.id; 
      const isMe = currentUser && uid === currentUser.uid;
      const nameStr = u.name + ' ' + (u.surname || '');
      
      const div = document.createElement('div');
      div.className = 'user-row' + (isDM && currentDM === uid ? ' active-dm' : '');
      
      if (!isMe) {
        div.onclick = () => { openDM(uid, nameStr, div); closeSidebar(); };
        const roomId = currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`;
        
        if (!unreadObservers[roomId]) {
          unreadObservers[roomId] = db.collection('directMessages').doc(roomId).collection('messages').onSnapshot(s => {
            let dmCount = 0; 
            s.forEach(d => { 
              const m = d.data(); 
              if (m.authorId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) dmCount++; 
            });
            const b = div.querySelector('.unread-badge'); 
            if (b) { 
              b.textContent = dmCount; 
              b.style.display = dmCount > 0 ? 'inline-block' : 'none'; 
            }
          });
        }
      } else { 
        div.style.cursor = 'default'; 
      }
      
      const avatar = document.createElement('div');
      avatar.className = 'user-av';
      avatar.style.background = u.color || '#3a4060';
      avatar.textContent = u.initials || '??';

      const content = document.createElement('div');
      const nameEl = document.createElement('div');
      nameEl.className = 'user-name';
      nameEl.textContent = nameStr;

      if (isMe) {
        const youTag = document.createElement('span');
        youTag.style.color = 'var(--muted)';
        youTag.style.fontSize = '10px';
        youTag.textContent = ' (Você)';
        nameEl.appendChild(youTag);
      }

      const roleEl = document.createElement('div');
      roleEl.className = 'user-status';
      roleEl.textContent = u.role || '';

      content.appendChild(nameEl);
      content.appendChild(roleEl);

      const unreadBadge = document.createElement('span');
      unreadBadge.className = 'unread-badge';

      const statusDot = document.createElement('div');
      statusDot.className = 'dot';
      statusDot.style.background = 'var(--green)';

      div.appendChild(avatar);
      div.appendChild(content);
      div.appendChild(unreadBadge);
      div.appendChild(statusDot);
      container.appendChild(div);
    });
    
    const statMembers = $('stat-members');
    if (statMembers) statMembers.textContent = count;
  });
}
  
 loadUsers();
      initUnreadCounters();
      subscribeChat('channels', currentChannel, currentChatTargetName);
      subscribeMural();
      initSectorViews();
      
      setTimeout(() => { $('loading-overlay').classList.add('hidden'); showStartupAlert(); }, 600);
    });

async function doLogout() {
  if (unsubChat) unsubChat();
  if (unsubMural) unsubMural();
  if (unsubTasks) unsubTasks();
  if (unsubAgenda) unsubAgenda();
  if (unsubAgendaRP) unsubAgendaRP();
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  Object.values(unreadObservers).forEach(u => u());
  await auth.signOut();
}

// ════════════════════════════════════════════
//  PERMISSÃO DE NOTIFICAÇÕES (Gatilho de Segurança)
// ════════════════════════════════════════════
// Os navegadores exigem que o usuário clique em algo antes de pedir permissão.
// Isso vai tentar pedir permissão no primeiro clique que o usuário der na tela.
document.body.addEventListener('click', () => {
  if (typeof Notification !== 'undefined') {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          console.log("Notificações ativadas com sucesso!");
        }
      });
    }
  }
}, { once: true }); // O "{ once: true }" garante que esse código só rode 1 vez

// ════════════════════════════════════════════
    //  ALERTA INICIAL (RESUMO DE TAREFAS NO LOGIN)
    // ════════════════════════════════════════════
    async function showStartupAlert() {
      const alertEl = document.getElementById('startup-alert');
      const bodyEl = document.getElementById('startup-alert-body');
      if (!alertEl || !bodyEl || !currentUser) return;

      try {
        // 1. Descobre a quais setores o utilizador tem acesso
        const userSectors = getUserSectors(currentUser?.role || '');
        if (!userSectors || userSectors.length === 0) return;

        // 2. Busca TODAS as tarefas que pertencem a esses setores
        const snap = await db.collection('tasks')
          .where('tag', 'in', userSectors)
          .get();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let lateTasks = [];
        let soonTasks = [];

        snap.forEach(doc => {
          const t = doc.data();
          // Ignora se não tiver data ou se já estiver concluída
          if (!t.due || t.column === 'done') return;

          const d = new Date(t.due + 'T00:00:00');
          const diff = Math.ceil((d - today) / 86400000);

          if (diff < 0) {
            lateTasks.push(t);
          } else if (diff <= 3) {
            soonTasks.push(t);
          }
        });

        // Se não tiver nada atrasado ou a vencer em 3 dias, não mostra o pop-up
        if (lateTasks.length === 0 && soonTasks.length === 0) {
          return;
        }

        // Labels para mostrar o nome bonito do setor
        const SECTOR_LABELS = { fiscal: 'Dep. Fiscal', dp: 'Dep. Pessoal', contabil: 'Dep. Contábil' };
        let html = '';

        if (lateTasks.length > 0) {
          html += `<div style="color:var(--red); font-size:14px; font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:6px;">⚠️ ${lateTasks.length} Tarefa(s) Atrasada(s) no seu Setor:</div>`;
          lateTasks.forEach(t => {
            const dataFormatada = t.due.split('-').reverse().join('/');
            const setorNome = SECTOR_LABELS[t.tag] || t.tag;
            
            html += `
              <div style="background: rgba(224, 95, 95, 0.08); padding:10px 14px; border-radius:8px; margin-bottom:8px; font-size:13px; border:1px solid rgba(224,95,95,0.3); display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; flex-direction:column; gap:3px;">
                  <strong style="color:var(--text);">${escHtml(t.title)}</strong>
                  <span style="font-size:10.5px; color:var(--muted);">${setorNome} • Resp: <strong>${escHtml(t.authorName || 'N/A')}</strong></span>
                </div>
                <span style="color:var(--red); font-size:11px; white-space:nowrap; margin-left:10px;">Venceu em: ${dataFormatada}</span>
              </div>`;
          });
        }

        if (soonTasks.length > 0) {
          html += `<div style="color:var(--accent2); font-size:14px; font-weight:700; margin-bottom:8px; margin-top:16px; display:flex; align-items:center; gap:6px;">🟡 ${soonTasks.length} Tarefa(s) a Vencer em breve no seu Setor:</div>`;
          soonTasks.forEach(t => {
            const dataFormatada = t.due.split('-').reverse().join('/');
            const setorNome = SECTOR_LABELS[t.tag] || t.tag;

            html += `
              <div style="background: rgba(201, 168, 76, 0.08); padding:10px 14px; border-radius:8px; margin-bottom:8px; font-size:13px; border:1px solid rgba(201,168,76,0.3); display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; flex-direction:column; gap:3px;">
                  <strong style="color:var(--text);">${escHtml(t.title)}</strong>
                  <span style="font-size:10.5px; color:var(--muted);">${setorNome} • Resp: <strong>${escHtml(t.authorName || 'N/A')}</strong></span>
                </div>
                <span style="color:var(--accent2); font-size:11px; white-space:nowrap; margin-left:10px;">Vence em: ${dataFormatada}</span>
              </div>`;
          });
        }

        // Injeta o HTML e exibe o alerta
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
        setTimeout(() => {
          alertEl.style.display = 'none';
          alertEl.style.opacity = '1';
        }, 300);
      }
    }

    function openLightbox(url) {
  const lightbox = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  
  img.src = url;
  lightbox.style.display = 'flex';
  
  // Pequeno truque para a animação suave funcionar
  setTimeout(() => {
    lightbox.style.opacity = '1';
    img.style.transform = 'scale(1)';
  }, 10);
}

function closeLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  
  lightbox.style.opacity = '0';
  img.style.transform = 'scale(0.95)';
  
  setTimeout(() => {
    lightbox.style.display = 'none';
    img.src = '';
  }, 300);
}
