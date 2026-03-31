// ════════════════════════════════════════════
//  MAPA VIRTUAL (COM JOYSTICK MOBILE)
// ════════════════════════════════════════════


const TILE_SIZE = 40; 
let myMapX = 5;       
let myMapY = 5;       
let mapUnsub = null;
let moveTimeout = null;
let currentMapRoom = null; 

const OFFICE_ROOMS = [
  { id: 'geral', name: 'Chat Geral', left: 4, top: 4, width: 44, height: 44, color: 'rgba(201, 168, 76, 0.05)', border: 'var(--accent)' },
  { id: 'fiscal', name: 'Dep. Fiscal', left: 52, top: 4, width: 44, height: 44, color: 'rgba(91, 141, 238, 0.05)', border: 'var(--blue)' },
  { id: 'dp', name: 'Dep. Pessoal', left: 4, top: 52, width: 44, height: 44, color: 'rgba(224, 95, 95, 0.05)', border: 'var(--red)' },
  { id: 'contabil', name: 'Dep. Contábil', left: 52, top: 52, width: 44, height: 44, color: 'rgba(76, 175, 125, 0.05)', border: 'var(--green)' }
];

function drawRooms() {
  const mapContainer = document.getElementById('virtual-office-map');
  if (!mapContainer) return;

  document.querySelectorAll('.map-room').forEach(e => e.remove());

  OFFICE_ROOMS.forEach(room => {
    const roomEl = document.createElement('div');
    roomEl.id = `room-zone-${room.id}`;
    roomEl.className = 'map-room';
    roomEl.style.left = room.left + '%';
    roomEl.style.top = room.top + '%';
    roomEl.style.width = room.width + '%';
    roomEl.style.height = room.height + '%';
    roomEl.style.backgroundColor = room.color;
    roomEl.style.borderColor = room.border;
    roomEl.style.color = room.border;
    roomEl.innerHTML = `<div class="map-room-label">${room.name}</div>`;
    mapContainer.appendChild(roomEl);
  });
}

function checkRoomCollision() {
  const mapContainer = document.getElementById('virtual-office-map');
  if (!mapContainer) return;

  const mapW = mapContainer.clientWidth;
  const mapH = mapContainer.clientHeight;
  const avatarCenterX = (myMapX * TILE_SIZE) + (TILE_SIZE / 2);
  const avatarCenterY = (myMapY * TILE_SIZE) + (TILE_SIZE / 2);

  let insideRoom = null;

  for (const room of OFFICE_ROOMS) {
    const roomLeftPx = (room.left / 100) * mapW;
    const roomTopPx = (room.top / 100) * mapH;
    const roomRightPx = roomLeftPx + ((room.width / 100) * mapW);
    const roomBottomPx = roomTopPx + ((room.height / 100) * mapH);

    if (avatarCenterX >= roomLeftPx && avatarCenterX <= roomRightPx &&
        avatarCenterY >= roomTopPx && avatarCenterY <= roomBottomPx) {
      insideRoom = room;
      break;
    }
  }

  const statusBar = document.getElementById('map-status-bar');
  const btnEnter = document.getElementById('btn-enter-room');
  
  if (insideRoom !== currentMapRoom) {
    if (currentMapRoom) {
      const oldRoomEl = document.getElementById(`room-zone-${currentMapRoom.id}`);
      if (oldRoomEl) oldRoomEl.classList.remove('active-room');
    }

    currentMapRoom = insideRoom;

    if (currentMapRoom) {
      const newRoomEl = document.getElementById(`room-zone-${currentMapRoom.id}`);
      if (newRoomEl) newRoomEl.classList.add('active-room');

      // 🔴 CHECA A PERMISSÃO EM TEMPO REAL
      const userSectors = getUserSectors(currentUser?.role || '');
      const hasAccess = currentMapRoom.id === 'geral' || userSectors.includes(currentMapRoom.id);

      if (hasAccess) {
        // Tem acesso: Fica dourado e convida a entrar
        statusBar.innerHTML = `📍 Você entrou na sala <strong>${currentMapRoom.name}</strong>. Pressione <kbd>Enter</kbd> ou clique em Entrar.`;
        statusBar.style.display = 'block';
        if (btnEnter) {
          btnEnter.innerHTML = `<i class="fas fa-sign-in-alt"></i> <span>Abrir ${currentMapRoom.name}</span>`;
          btnEnter.style.background = 'linear-gradient(135deg, var(--accent), #a07830)';
          btnEnter.style.color = '#0f1117';
          btnEnter.style.display = 'flex';
          btnEnter.onclick = enterCurrentRoom;
        }
      } else {
        // Não tem acesso: Fica cinza/apagado e avisa que é restrito
        statusBar.innerHTML = `🔒 Acesso Negado à sala <strong>${currentMapRoom.name}</strong>. Área restrita.`;
        statusBar.style.display = 'block';
        if (btnEnter) {
          btnEnter.innerHTML = `<i class="fas fa-lock"></i> <span>Acesso Restrito</span>`;
          btnEnter.style.background = 'var(--surface)';
          btnEnter.style.color = 'var(--muted)';
          btnEnter.style.display = 'flex';
          btnEnter.onclick = () => alert('🔒 Você não tem permissão para acessar o chat deste setor.');
        }
      }
    } else {
      // Saiu pro corredor
      statusBar.style.display = 'none';
      if (btnEnter) btnEnter.style.display = 'none';
    }
  }
}

// ── MOTOR DE MOVIMENTO UNIFICADO ──
function moveAvatar(direction) {
  let moved = false;
  const mapContainer = document.getElementById('virtual-office-map');
  if (!mapContainer) return;

  const maxCols = Math.floor(mapContainer.clientWidth / TILE_SIZE) - 1;
  const maxRows = Math.floor(mapContainer.clientHeight / TILE_SIZE) - 1;

  if (direction === 'up' && myMapY > 0) { myMapY--; moved = true; }
  if (direction === 'down' && myMapY < maxRows) { myMapY++; moved = true; }
  if (direction === 'left' && myMapX > 0) { myMapX--; moved = true; }
  if (direction === 'right' && myMapX < maxCols) { myMapX++; moved = true; }

  if (moved) {
    // 🔴 TOCA O SOM DO PASSO (Via HTML)
    const audioPasso = document.getElementById('som-passos');
    if (audioPasso && audioPasso.paused) {
      audioPasso.volume = 0.4; // Volume um pouco mais alto para testar
      audioPasso.play().catch(err => {
        console.error("⛔ Áudio bloqueado pelo navegador/AdBlocker:", err);
      });
    }

    updateMyAvatarLocally();
    syncPositionToFirebase();
    checkRoomCollision(); 
  }
}

// ── EVENTOS DO TECLADO (PC) ──
window.addEventListener('keydown', (e) => {
  if (lastActiveTab !== 'mapa') return;
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

  if (e.key === 'Enter' && currentMapRoom) {
    enterCurrentRoom();
    return;
  }

  const keys = {
    'ArrowUp': 'up', 'w': 'up', 'W': 'up',
    'ArrowDown': 'down', 's': 'down', 'S': 'down',
    'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right'
  };

  if (keys[e.key]) {
    e.preventDefault(); 
    moveAvatar(keys[e.key]);
  }
});

function enterCurrentRoom() {
  if (!currentMapRoom) return;
  const btnChannel = document.getElementById('btn-chan-' + currentMapRoom.id);
  
  // 🔴 TRAVA DO TECLADO: Se ele apertou Enter mas a sala é restrita, exibe o alerta
  if (btnChannel && btnChannel.classList.contains('locked')) {
    alert(`🔒 Acesso Restrito: Você não faz parte do setor ${currentMapRoom.name}.`);
    return;
  }
  
  if (btnChannel) switchChannel(btnChannel);
}
// ── LÓGICA DO JOYSTICK (MOBILE) ──
function initJoystick() {
  const base = document.getElementById('joystick-base');
  const stick = document.getElementById('joystick-stick');
  let joystickInterval = null;
  let currentDir = null;

  if (!base || !stick) return;

  const handleTouch = (e) => {
    e.preventDefault(); // Impede scroll da página
    const rect = base.getBoundingClientRect();
    const touch = e.touches[0];
    
    // Calcula o centro da base do joystick
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Distância do dedo para o centro
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;

    // Limita o movimento da "alavanca" até a borda (raio de 35px)
    const distance = Math.min(Math.hypot(dx, dy), 35);
    const angle = Math.atan2(dy, dx);
    const stickX = distance * Math.cos(angle);
    const stickY = distance * Math.sin(angle);

    stick.style.transform = `translate(${stickX}px, ${stickY}px)`;

    // Define a direção predominante (Cima, Baixo, Esquerda, Direita)
    if (Math.abs(dx) > Math.abs(dy)) {
        currentDir = dx > 0 ? 'right' : 'left';
    } else {
        currentDir = dy > 0 ? 'down' : 'up';
    }

    // Inicia o "motor de passos" se não estiver andando
    if (!joystickInterval) {
        moveAvatar(currentDir); // Dá o primeiro passo imediato
        joystickInterval = setInterval(() => moveAvatar(currentDir), 150); // Anda a cada 150ms
    }
  };

  const stopJoystick = () => {
    clearInterval(joystickInterval);
    joystickInterval = null;
    currentDir = null;
    // Retorna a alavanca pro centro (usando a transição CSS suave)
    stick.style.transform = `translate(0px, 0px)`;
  };

  base.addEventListener('touchstart', handleTouch);
  base.addEventListener('touchmove', handleTouch);
  base.addEventListener('touchend', stopJoystick);
  base.addEventListener('touchcancel', stopJoystick);
}

// ── DESENHAR E SINCRONIZAR AVATARES ──
function updateMyAvatarLocally() {
  if (!currentUser) return;
  const myAvatar = document.getElementById(`avatar-${currentUser.uid}`);
  if (myAvatar) {
    myAvatar.style.transform = `translate(${myMapX * TILE_SIZE}px, ${myMapY * TILE_SIZE}px)`;
  }
}

function syncPositionToFirebase() {
  if (!currentUser) return;
  clearTimeout(moveTimeout);
  moveTimeout = setTimeout(async () => {
    try {
      await db.collection('users').doc(currentUser.uid).update({
        mapX: myMapX,
        mapY: myMapY,
        lastMapUpdate: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) { }
  }, 800); 
}

function subscribeMap() {
  const mapContainer = document.getElementById('virtual-office-map');
  if (!mapContainer) return;
  if (mapUnsub) { mapUnsub(); mapUnsub = null; }

  mapUnsub = db.collection('users').onSnapshot(snap => {
    snap.forEach(doc => {
      const u = doc.data();
      const uid = doc.id;
      if (u.mapX === undefined || u.mapY === undefined) return;
      if (uid === currentUser?.uid) return; 
      drawAvatar(uid, u);
    });
  });
}

function drawAvatar(uid, userData) {
  const mapContainer = document.getElementById('virtual-office-map');
  let avatarEl = document.getElementById(`avatar-${uid}`);

  const xPos = userData.mapX * TILE_SIZE;
  const yPos = userData.mapY * TILE_SIZE;
  const isMe = currentUser && uid === currentUser.uid;

  if (!avatarEl) {
    avatarEl = document.createElement('div');
    avatarEl.id = `avatar-${uid}`;
    avatarEl.className = 'map-avatar-wrapper' + (isMe ? ' is-me' : '');
    
    const initials = userData.initials || '??';
    const color = userData.color || '#3a4060';
    const name = userData.name || 'Membro';

    avatarEl.innerHTML = `
      <div class="map-avatar-name">${escHtml(name)}</div>
      <div class="map-avatar-circle" style="background:${color}">${initials}</div>
    `;
    mapContainer.appendChild(avatarEl);
  }

  avatarEl.style.transform = `translate(${xPos}px, ${yPos}px)`;
}

// ── INICIALIZAÇÃO ──
document.addEventListener('DOMContentLoaded', () => {
  const mapTabBtn = document.querySelector('.tab-btn[onclick*="mapa"]');
  if (mapTabBtn) {
    const originalOnClick = mapTabBtn.onclick;
    mapTabBtn.onclick = function(e) {
      if (typeof originalOnClick === 'function') originalOnClick.call(this, e);
      
      drawRooms();
      checkRoomCollision();

      if (currentUser && !document.getElementById(`avatar-${currentUser.uid}`)) {
        drawAvatar(currentUser.uid, { ...currentUser, mapX: myMapX, mapY: myMapY });
      }
      
      subscribeMap();
      initJoystick(); // Inicia os ouvintes de toque do mobile
    };
  }

  // Vincula o botão flutuante à mesma função do 'Enter' do teclado
  const btnEnter = document.getElementById('btn-enter-room');
  if (btnEnter) {
    btnEnter.onclick = enterCurrentRoom;
  }
});

// ════════════════════════════════════════════
//  DESTRAVADOR DE ÁUDIO PARA SERVIDORES REAIS
// ════════════════════════════════════════════
document.addEventListener('click', function unlockAudio() {
  const audioPasso = document.getElementById('som-passos');
  if (audioPasso) {
    // Toca o áudio mutado e pausa imediatamente só para o navegador "autorizar" o som
    audioPasso.volume = 0; 
    audioPasso.play().then(() => {
      audioPasso.pause();
      audioPasso.currentTime = 0;
      audioPasso.volume = 0.4; // Devolve o volume normal
    }).catch(() => {});
  }
  // Remove este evento para rodar apenas no primeiro clique do usuário
  document.removeEventListener('click', unlockAudio);
}, { once: true });