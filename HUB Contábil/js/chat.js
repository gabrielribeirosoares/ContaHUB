// ════════════════════════════════════════════
//  CONTROLE DE PAGINAÇÃO DO CHAT
// ════════════════════════════════════════════
let chatLimit = 30;
let isPaginating = false;
let previousScrollHeight = 0;
let isLoadingMore = false;

// O Canal Geral/Setores leva o ID da Empresa (Para isolar os escritórios)
const getChannelDocId = (ch) => `${currentUser.tenantId}_${ch}`;

// 🔥 CORREÇÃO 2: As DMs voltam ao original para resgatar o histórico
const getDmDocId = (uid1, uid2) => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

// ════════════════════════════════════════════
//  NOTIFICAÇÕES / UNREAD
// ════════════════════════════════════════════
function initUnreadCounters() {
  ['geral', 'fiscal', 'dp', 'contabil'].forEach(ch => {
    const channelId = getChannelDocId(ch);
    unreadObservers[ch] = db.collection('channels').doc(channelId).collection('messages').onSnapshot(snap => {
      let count = 0;
      snap.forEach(doc => {
        const m = doc.data();
        if (m.authorId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) count++;
      });
      const badge = document.querySelector(`#btn-chan-${ch} .unread-badge`);
      if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline-block' : 'none'; }

      if (!snap.metadata.fromCache && snap.docChanges().some(c => c.type === 'added')) {
        const lastMsg = snap.docChanges().find(c => c.type === 'added').doc.data();
        if (lastMsg.authorId !== currentUser.uid && lastMsg.createdAt) {
          notifySound.play().catch(() => {});
          if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
            const notification = new Notification(`ContaHub: Nova mensagem em #${ch}`, {
              body: lastMsg.text ? lastMsg.text : '📎 Ficheiro anexado',
              icon: 'logo-contahub.png'
            });
            notification.onclick = function() { window.focus(); };
          }
        }
      }
    });
  });
}

async function markAsRead(collection, docId) {
  const snap = await db.collection(collection).doc(docId).collection('messages').get();
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.readBy || !data.readBy.includes(currentUser.uid)) {
      db.collection(collection).doc(docId).collection('messages').doc(doc.id)
        .update({ readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    }
  });
}

async function toggleReadStatus(collection, roomId, msgId, isRead) {
  const ref = db.collection(collection).doc(roomId).collection('messages').doc(msgId);
  if (isRead) await ref.update({ readBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
  else await ref.update({ readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
}

function activateChatTab() {
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-chat').classList.add('active');
  const chatBtn = document.querySelector('.tab-btn[onclick*="chat"]');
  if (chatBtn) chatBtn.classList.add('active');
}

function switchChannel(el) {
  chatLimit = 30;
  isPaginating = false;
  isLoadingMore = false;

  if (el.classList.contains('locked')) {
    alert('🔒 Acesso Negado: Você não tem permissão para acessar o chat deste setor.');
    return;
  }

  setTyping(false);
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  activateChatTab();
  $$('.channel-item').forEach(e => e.classList.remove('active'));
  $$('.user-row').forEach(e => e.classList.remove('active-dm'));
  el.classList.add('active');
  isDM = false;

  // ✅ currentChannel guarda apenas o nome simples (ex: 'geral')
  currentChannel = el.dataset.channel;
  currentChatTargetName = '#' + currentChannel;
  $('chat-header-title').textContent = '💬 #' + currentChannel;
  $('chat-input').placeholder = `Mensagem para ${currentChatTargetName}…`;
  $('chat-messages').innerHTML = `<div class="chat-empty"><span style="font-size:2rem">💬</span><span>Carregando mensagens…</span></div>`;

  if (unsubChat) unsubChat();
  cancelReply();

  // ✅ docId com prefixo do tenant — chamado UMA vez apenas
  const roomDocId = getChannelDocId(currentChannel);
  markAsRead('channels', roomDocId);
  subscribeChat('channels', roomDocId, currentChatTargetName);

  if (typeof closeSidebar === 'function') closeSidebar();
}

function openDM(targetUid, targetName, el) {
  chatLimit = 30;
  isPaginating = false;
  isLoadingMore = false;
  if (!currentUser || targetUid === currentUser.uid) return;
  activateChatTab();
  $$('.channel-item').forEach(e => e.classList.remove('active'));
  $$('.user-row').forEach(e => e.classList.remove('active-dm'));
  if (el) el.classList.add('active-dm');
  isDM = true;
  currentDM = targetUid;
  currentChatTargetName = targetName;
  $('chat-header-title').textContent = '💬 ' + targetName;

  // ✅ roomId com prefixo do tenant
  const roomId = getDmDocId(currentUser.uid, targetUid);
  $('chat-input').placeholder = `Mensagem privada para ${currentChatTargetName}…`;
  $('chat-messages').innerHTML = `<div class="chat-empty"><span style="font-size:2rem">💬</span><span>Carregando…</span></div>`;

  if (unsubChat) unsubChat();
  cancelReply();
  markAsRead('directMessages', roomId);
  subscribeChat('directMessages', roomId, currentChatTargetName);

  const chatBtn = document.querySelector('.tab-btn[onclick*="chat"]');
  if (chatBtn) switchTab('chat', chatBtn);
}

function formatChatText(text) {
  if (!text) return '';
  let safeText = escHtml(text);
  safeText = safeText.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  safeText = safeText.replace(/_(.*?)_/g, '<em>$1</em>');
  safeText = safeText.replace(/~(.*?)~/g, '<del>$1</del>');
  return safeText;
}

// ════════════════════════════════════════════
//  CHAT LÓGICA
// ════════════════════════════════════════════
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) { pendingFile = file; $('chat-input').placeholder = `Enviando: ${file.name}...`; sendMsg(); }
}

function setReply(id, name, text) {
  activeReply = { id, name, text };
  $('reply-preview').style.display = 'block';
  $('reply-name').textContent = `Respondendo a ${name}`;
  $('reply-text').textContent = text;
  $('chat-input').focus();
}

function cancelReply() {
  activeReply = null;
  $('reply-preview').style.display = 'none';
}

function setTyping(isTyping) {
  if (!currentUser) return;
  const colName = isDM ? 'directMessages' : 'channels';
  const docId = isDM ? getDmDocId(currentUser.uid, currentDM) : getChannelDocId(currentChannel);
  const ref = db.collection(colName).doc(docId);
  try {
    if (isTyping) {
      ref.set({ typing: { [currentUser.uid]: { name: currentUser.name, ts: Date.now() } } }, { merge: true });
    } else {
      ref.update({ [`typing.${currentUser.uid}`]: firebase.firestore.FieldValue.delete() }).catch(() => {});
    }
  } catch (e) {}
}

function subscribeTyping(colName, docId) {
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  unsubTyping = db.collection(colName).doc(docId).onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();
    const typing = data?.typing || {};
    const now = Date.now();
    const others = Object.entries(typing)
      .filter(([uid, v]) => v && uid !== currentUser?.uid && (now - (v.ts || 0)) < 6000)
      .map(([, v]) => v.name);
    const el = $('typing-indicator');
    const txt = $('typing-text');
    if (el && txt) {
      if (others.length > 0) {
        txt.textContent = others.join(', ') + (others.length === 1 ? ' está digitando...' : ' estão digitando...');
        el.classList.add('visible');
      } else {
        el.classList.remove('visible');
      }
    }
  });
}

// ════════════════════════════════════════════
//  ESCUTAR O SCROLL DO MOUSE
// ════════════════════════════════════════════
function subscribeChat(collectionName, docId, displayName) {
  const container = document.getElementById('chat-messages');
  container.onscroll = () => {
    if (container.scrollTop === 0 && !isLoadingMore) {
      isLoadingMore = true;
      isPaginating = true;
      previousScrollHeight = container.scrollHeight;
      chatLimit += 30;

      const loadingHtml = `<div id="chat-loading-more" style="text-align:center; padding:10px; font-size:12px; color:var(--muted);">⏳ Carregando histórico...</div>`;
      container.insertAdjacentHTML('afterbegin', loadingHtml);

      if (unsubChat) unsubChat();
      listenToMessages(collectionName, docId, displayName);
    }
  };
  listenToMessages(collectionName, docId, displayName);
}

// ════════════════════════════════════════════
//  RENDERIZAR AS MENSAGENS NO CHAT
// ════════════════════════════════════════════
function listenToMessages(collectionName, docId, displayName) {
  const container = document.getElementById('chat-messages');
  subscribeTyping(collectionName, docId);

  unsubChat = db.collection(collectionName).doc(docId).collection('messages')
    .orderBy('createdAt', 'asc').limitToLast(chatLimit)
    .onSnapshot(snap => {
      container.innerHTML = '';

      if (snap.empty) {
        container.innerHTML = `<div class="chat-empty"><span style="font-size:2rem">💬</span><span>Nenhuma mensagem com <strong>${displayName}</strong></span></div>`;
        isLoadingMore = false;
        return;
      }

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      let todayCount = 0;
      let lastDateStr = null;

      if (snap.size < chatLimit && snap.size >= 30) {
        container.innerHTML = `<div style="text-align:center; padding:20px; font-size:12px; color:var(--muted); opacity:0.7;">— Início da conversa —</div>`;
      }

      snap.forEach(doc => {
        const m = doc.data();
        const ts = m.createdAt?.toDate?.() || new Date();
        if (ts >= today) todayCount++;

        const msgDate = new Date(ts);
        msgDate.setHours(0, 0, 0, 0);
        let currentDateStr = '';

        if (msgDate.getTime() === today.getTime()) {
          currentDateStr = 'Hoje';
        } else if (msgDate.getTime() === yesterday.getTime()) {
          currentDateStr = 'Ontem';
        } else {
          currentDateStr = ts.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        }

        if (currentDateStr !== lastDateStr) {
          const divider = document.createElement('div');
          divider.className = 'chat-date-divider';
          divider.innerHTML = `<span>${currentDateStr}</span>`;
          container.appendChild(divider);
          lastDateStr = currentDateStr;
        }

        const timeStr = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isOwn = m.authorId === currentUser?.uid;
        const isRead = m.readBy && m.readBy.includes(currentUser?.uid);

        const safeRawText = m.text ? escHtml(m.text).replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ') : 'Arquivo anexado';
        const formattedText = typeof formatChatText === 'function' ? formatChatText(m.text) : escHtml(m.text);

        let replyHtml = m.replyTo ? `<div class="msg-reply-box"><strong>${escHtml(m.replyTo.name)}:</strong> ${escHtml(m.replyTo.text)}</div>` : '';
        let fileHtml = '';
        if (m.fileUrl) {
          if (m.fileType && m.fileType.startsWith('image/'))
            fileHtml = `<img src="${m.fileUrl}" class="msg-attachment" alt="anexo" onclick="openLightbox('${m.fileUrl}')">`;
          else
            fileHtml = `<a href="${m.fileUrl}" target="_blank" class="msg-file-link">📄 ${escHtml(m.fileName)}</a>`;
        }

        const textHtml = m.text ? `<div style="line-height:1.4;">${formattedText}</div>` : '';
        const bubbleContent = replyHtml + textHtml + fileHtml;

        const div = document.createElement('div');
        div.className = 'msg-group' + (isOwn ? ' msg-own' : '');
        div.innerHTML = `
          <div class="msg-av" style="background:${m.authorColor || '#3a4060'}">${m.authorInitials || '??'}</div>
          <div class="msg-inner">
            <div class="msg-header">
              <span class="msg-name" style="color:${isOwn ? 'var(--accent2)' : '#8fa3e8'}">${m.authorName || 'Usuário'}</span>
              <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-bubble" style="${!isOwn && !isRead ? 'border-left:3px solid var(--accent)' : ''}">${bubbleContent}</div>
            <div class="msg-actions">
              <span onclick="setReply('${doc.id}','${m.authorName}','${safeRawText}')">↩ Responder</span>
              <span onclick="toggleReadStatus('${collectionName}','${docId}','${doc.id}',${isRead})">${isRead ? '📨 Marcar não lida' : '👁️ Marcar lida'}</span>
            </div>
          </div>`;
        container.appendChild(div);
      });

      const statMsgs = document.getElementById('stat-msgs');
      if (statMsgs) statMsgs.textContent = todayCount;
      isLoadingMore = false;

      if (isPaginating) {
        container.scrollTop = container.scrollHeight - previousScrollHeight;
        isPaginating = false;
      } else {
        container.scrollTop = container.scrollHeight;
      }
    });
}

async function sendMsg() {
  if (!currentUser) return;
  const now = Date.now();
  if (now - _lastSendTs < 800) return;
  _lastSendTs = now;
  clearTimeout(typingTimeout); setTyping(false);
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text && !pendingFile) return;
  if (text.length > 2000) { alert('Mensagem muito longa (máx. 2000 caracteres).'); return; }
  const btn = $('btn-send-msg'); btn.disabled = true;
  let fileUrl = null, fileName = null, fileType = null;
  const colName = isDM ? 'directMessages' : 'channels';
  const docId = isDM ? getDmDocId(currentUser.uid, currentDM) : getChannelDocId(currentChannel);
  try {
    if (pendingFile) {
      const fileRef = storage.ref(`${colName}/${docId}/${Date.now()}_${pendingFile.name}`);
      const snapshot = await fileRef.put(pendingFile);
      fileUrl = await snapshot.ref.getDownloadURL();
      fileName = pendingFile.name; fileType = pendingFile.type;
    }
    await db.collection(colName).doc(docId).collection('messages').add({
      text, fileUrl, fileName, fileType,
      replyTo: activeReply ? { id: activeReply.id, name: activeReply.name, text: activeReply.text } : null,
      authorId: currentUser.uid,
      authorName: currentUser.name + ' ' + (currentUser.surname || ''),
      authorInitials: currentUser.initials || 'US',
      authorColor: currentUser.color || '#3a4060',
      readBy: [currentUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = ''; pendingFile = null;
    document.getElementById('chat-file-input').value = '';
    $('chat-input').placeholder = `Mensagem para ${currentChatTargetName}…`;
    cancelReply();
  } catch (error) { alert('Erro ao enviar: ' + error.message); }
  finally { btn.disabled = false; }
}

async function clearChat() {
  if (!currentUser) return;
  if (!isGestor()) { alert('Apenas gestores podem limpar o histórico do chat.'); return; }
  const colName = isDM ? 'directMessages' : 'channels';
  const docId = isDM ? getDmDocId(currentUser.uid, currentDM) : getChannelDocId(currentChannel);
  if (!docId) { alert('Abra um canal ou conversa antes de limpar.'); return; }
  const targetLabel = isDM ? `a conversa com ${currentChatTargetName}` : `o canal #${currentChannel}`;
  if (!confirm(`⚠️ Apagar TODAS as mensagens de ${targetLabel}?\n\nEsta ação não pode ser desfeita.`)) return;
  const btn = document.querySelector('.btn-clear-chat');
  btn.disabled = true; btn.textContent = '⏳ Apagando…';
  try {
    // ✅ Para o listener antes de deletar
    if (unsubChat) { unsubChat(); unsubChat = null; }
    const snap = await db.collection(colName).doc(docId).collection('messages').get();
    if (snap.empty) {
      btn.textContent = '✅ Já vazio';
      setTimeout(() => { btn.disabled = false; btn.textContent = '🗑️ Limpar'; }, 2000);
      listenToMessages(colName, docId, currentChatTargetName);
      return;
    }
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    btn.textContent = '✅ Limpo!';
  } catch (err) {
    alert('Erro: ' + err.message);
    btn.textContent = '🗑️ Limpar';
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = '🗑️ Limpar'; }, 2500);
    // ✅ Reativa o listener após limpar
    listenToMessages(colName, docId, currentChatTargetName);
  }
}

// ════════════════════════════════════════════
//  CONTROLE INTELIGENTE DO INPUT DE MENSAGEM
// ════════════════════════════════════════════
const chatInput = document.getElementById('chat-input');
let isCurrentlyTyping = false;

if (chatInput) {
  chatInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      sendMsg();
      isCurrentlyTyping = false;
      return;
    }
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      setTyping(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isCurrentlyTyping = false;
      setTyping(false);
    }, 3500);
  });
}

document.body.addEventListener('click', () => {
  if (typeof Notification !== 'undefined') {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }
}, { once: true });

// ════════════════════════════════════════════
//  SISTEMA DE EMOJIS
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const btnEmoji = document.getElementById('btn-emoji');
  const pickerContainer = document.getElementById('emoji-picker-container');
  const chatInput = document.getElementById('chat-input');

  if (btnEmoji && pickerContainer && chatInput) {
    const pickerOptions = {
      set: 'apple',
      theme: 'dark',
      locale: 'pt',
      onEmojiSelect: (emoji) => {
        const cursorPosition = chatInput.selectionStart;
        const textBefore = chatInput.value.substring(0, cursorPosition);
        const textAfter = chatInput.value.substring(cursorPosition);
        chatInput.value = textBefore + emoji.native + textAfter;
        chatInput.selectionStart = chatInput.selectionEnd = cursorPosition + emoji.native.length;
        chatInput.focus();
        chatInput.dispatchEvent(new Event('input'));
      }
    };
    const picker = new EmojiMart.Picker(pickerOptions);
    pickerContainer.appendChild(picker);

    btnEmoji.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = pickerContainer.style.display === 'none';
      pickerContainer.style.display = isHidden ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!pickerContainer.contains(e.target) && e.target !== btnEmoji) {
        pickerContainer.style.display = 'none';
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const btnEnviar = document.getElementById('btn-send-msg');
  const inputChat = document.getElementById('chat-input');

  if (btnEnviar && inputChat) {
    inputChat.addEventListener('input', () => {
      btnEnviar.disabled = inputChat.value.trim() === '';
    });

    btnEnviar.addEventListener('click', (e) => {
      e.preventDefault();
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
      });
      inputChat.dispatchEvent(enterEvent);
      inputChat.focus();
    });
  }
});