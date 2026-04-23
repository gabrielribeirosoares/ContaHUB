// ════════════════════════════════════════════
//  AGENDA DE OBRIGAÇÕES
// ════════════════════════════════════════════
function subscribeAgenda(sector) {
  const managerContainer = document.getElementById('agenda-manager-list');
  const isManager = isGestor();
  unsubAgenda = db.collection('agenda')
    .where('tenantId', '==', currentUser.tenantId) // ADICIONADO
    .where('sector', '==', sector).onSnapshot(snap => {
      managerContainer.innerHTML = '';
      if (snap.empty) {
        managerContainer.innerHTML = '<div class="chat-empty" style="margin-top:40px"><span style="font-size:2rem">📅</span><span>Nenhuma obrigação cadastrada.</span></div>';
        return;
      }
      snap.forEach(doc => {
        const item = doc.data();
        const canEdit = item.authorId === currentUser?.uid || isManager;
        const isDone = item.done === true;
        const manDiv = document.createElement('div');
        manDiv.className = 'notice-card' + (isDone ? ' agenda-done-card' : '');
        manDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';
        manDiv.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0;">
          <div class="event-dot" style="background:${isDone ? 'var(--green)' : (item.color || 'var(--accent)')};width:12px;height:12px;flex-shrink:0;margin:0;"></div>
          <div style="min-width:0;">
            <div class="notice-title ${isDone ? 'agenda-done-title' : ''}" style="margin-bottom:2px">${escHtml(item.title)}</div>
            <div class="notice-body" style="font-size:11px">${escHtml(item.sub)}${isDone ? ' <span class="agenda-done-badge">✅ Concluído</span>' : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${!isDone && canEdit ? `<button class="btn-agenda-action btn-agenda-done" title="Marcar como concluído" onclick="completeAgendaItem('${doc.id}')">✅</button>` : ''}
          ${canEdit && !isDone ? `<button class="btn-agenda-action" title="Editar" onclick="openAgendaEdit('${doc.id}', '${escHtml(item.title).replace(/'/g, "\\'")}', '${item.rawDate}', '${item.sector || 'geral'}')">✏️</button>` : ''}
          ${canEdit ? `<button class="btn-agenda-action btn-agenda-del" title="Excluir" onclick="deleteAgendaItem('${doc.id}')">🗑️</button>` : ''}
        </div>`;
        managerContainer.appendChild(manDiv);
      });
    }, err => { console.warn('subscribeAgenda error:', err.message); });
}

function subscribeAgendaRightPanel() {
  const rpContainer = $('right-panel-agenda');
  if (unsubAgendaRP) { unsubAgendaRP(); unsubAgendaRP = null; }
  unsubAgendaRP = db.collection('agenda').orderBy('createdAt', 'asc').onSnapshot(snap => {
    rpContainer.innerHTML = '';
    const sectors = getUserSectors(currentUser?.role || '');
    const items = [];
    snap.forEach(doc => {
      const item = doc.data();
      if ((!item.sector || sectors.includes(item.sector)) && !item.done) items.push(item);
    });
    if (items.length === 0) {
      rpContainer.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted);text-align:center;">Agenda vazia ou sem pendências.</div>';
      return;
    }
    items.forEach(item => {
      const rpDiv = document.createElement('div');
      rpDiv.className = 'event-item';
      rpDiv.innerHTML = `<div class="event-dot" style="background:${item.color || 'var(--accent)'}"></div><div><div class="event-title">${escHtml(item.title)}</div><div class="event-sub">${escHtml(item.sub)}</div></div>`;
      rpContainer.appendChild(rpDiv);
    });
  }, err => { console.warn('subscribeAgendaRP error:', err.message); });
}

async function addAgendaItem() {
  if (!currentUser) return;
  const title = document.getElementById('agenda-title').value.trim();
  const rawDate = document.getElementById('agenda-date').value;
  const recurrence = document.getElementById('agenda-recurrence').value;
  const adjustment = document.getElementById('agenda-adjustment').value;
  const color = document.getElementById('agenda-color').value;
  if (!title || !rawDate) { alert('Preencha o título e a data.'); return; }
  const [yyyy, mm, dd] = rawDate.split('-');
  let subText = `${dd}/${mm}/${yyyy}`;
  if (recurrence !== 'Única') subText += ` · ${recurrence}`;
  if (adjustment !== 'Manter') subText += ` · ${adjustment}`;
  const btn = document.querySelector('.agenda-add-wrap .btn-post'); btn.textContent = 'Adicionando...'; btn.disabled = true;
  try {
    const agSector = document.getElementById('agenda-sector')?.value || currentAgendaSector || 'fiscal';
    await db.collection('agenda').add({
      title, sub: subText, rawDate, recurrence, adjustment, color, sector: agSector,
      tenantId: currentUser.tenantId, // ADICIONADO
      authorId: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('agenda-title').value = ''; document.getElementById('agenda-date').value = '';
    document.getElementById('agenda-recurrence').value = 'Única'; document.getElementById('agenda-adjustment').value = 'Manter';
  } catch (error) { alert('Erro: ' + error.message); }
  finally { btn.textContent = 'Adicionar à Agenda'; btn.disabled = false; }
}

async function completeAgendaItem(id) {
  if (!confirm('Marcar esta obrigação como concluída?')) return;
  await db.collection('agenda').doc(id).update({ done: true, completedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// ════════════════════════════════════════════
//  FUNÇÕES DE EDIÇÃO DA AGENDA
// ════════════════════════════════════════════

// 1. Abre o Modal e preenche os dados
function openAgendaEdit(id, title, date, sector) {
  const modal = document.getElementById('agenda-edit-modal');
  if (!modal) return;

  // Preenche os campos do formulário com os dados que vieram do botão
  document.getElementById('edit-agenda-id').value = id;
  document.getElementById('edit-agenda-title').value = title;
  document.getElementById('edit-agenda-date').value = date;

  const sectorSelect = document.getElementById('edit-agenda-tag');
  if (sectorSelect) sectorSelect.value = sector || 'geral';

  // Exibe o modal
  modal.classList.add('open');
}

// 2. Fecha o Modal
function closeAgendaEdit() {
  const modal = document.getElementById('agenda-edit-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// 3. Salva as alterações no Firebase (Corrigido)
async function saveAgendaEdit() {
  const id = document.getElementById('edit-agenda-id').value;
  const title = document.getElementById('edit-agenda-title').value.trim();
  const date = document.getElementById('edit-agenda-date').value;
  const sector = document.getElementById('edit-agenda-tag').value;

  if (!title || !date) {
    alert("Por favor, preencha o título e a data.");
    return;
  }

  try {
    const docRef = db.collection('agenda').doc(id);
    const docSnap = await docRef.get();
    let subText = "";

    // Reconstrói a data visualzinha (ex: 25/03/2026) sem perder a recorrência original
    if (docSnap.exists) {
      const oldData = docSnap.data();
      const [yyyy, mm, dd] = date.split('-');
      subText = `${dd}/${mm}/${yyyy}`;
      if (oldData.recurrence && oldData.recurrence !== 'Única') subText += ` · ${oldData.recurrence}`;
      if (oldData.adjustment && oldData.adjustment !== 'Manter') subText += ` · ${oldData.adjustment}`;
    }

    // Atualiza o documento no banco de dados com os Nomes de Campos Corretos!
    await docRef.update({
      title: title,
      rawDate: date,       // O banco usa rawDate
      sub: subText,        // Atualiza a data que aparece now ecrã
      sector: sector,      // O banco usa sector (e não tag)
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeAgendaEdit();

  } catch (error) {
    console.error("Erro ao editar agenda:", error);
    alert("Erro ao salvar. Verifique se tem permissão ou se a internet caiu.");
  }
}

async function deleteAgendaItem(id) { if (confirm('Remover esta obrigação da agenda?')) await db.collection('agenda').doc(id).delete(); }

async function gerarTarefasMensais() {
  if (!isGestor()) { alert('Apenas gestores podem gerar as obrigações do mês.'); return; }
  if (!confirm('⚙️ Deseja gerar os vencimentos deste mês na Agenda?\n\nO sistema vai ler suas obrigações "Mensais" cadastradas e criar os alertas com as datas exatas para este mês.')) return;
  const btn = document.getElementById('btn-gerar-tarefas');
  const textoOriginal = btn.textContent; btn.textContent = '⏳ Gerando...'; btn.disabled = true;
  try {
    const agendaSnap = await db.collection('agenda').where('recurrence', '==', 'Mensal').get();
    if (agendaSnap.empty) { alert('Não há obrigações marcadas como "Mensal" cadastradas para servir de molde.'); return; }
    const batch = db.batch(); let criados = 0;
    const hoje = new Date(); const anoAtual = hoje.getFullYear(); const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    agendaSnap.forEach(doc => {
      const item = doc.data();
      const partesData = item.rawDate.split('-');
      const diaVencimento = partesData[2];
      const dataVencimentoEsteMes = `${anoAtual}-${mesAtual}-${diaVencimento}`;
      const subText = `${diaVencimento}/${mesAtual}/${anoAtual} · Gerado pelo Sistema`;
      const newItemRef = db.collection('agenda').doc();
      batch.set(newItemRef, {
        title: item.title, sub: subText, rawDate: dataVencimentoEsteMes,
        recurrence: 'Única', adjustment: item.adjustment || 'Manter', color: item.color || 'var(--blue)',
        sector: item.sector || 'fiscal', done: false, authorId: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      criados++;
    });
    if (criados > 0) { await batch.commit(); alert(`✅ Sucesso! ${criados} vencimentos foram gerados e adicionados à sua Agenda.`); }
  } catch (error) { alert('Erro ao gerar vencimentos: ' + error.message); }
  finally { btn.textContent = textoOriginal; btn.disabled = false; }
}

auth.onAuthStateChanged(user => {
  if (user) { setTimeout(() => { if (isGestor()) { const btnGerar = document.getElementById('btn-gerar-tarefas'); if (btnGerar) btnGerar.style.display = 'inline-block'; } }, 800); }
});

// ════════════════════════════════════════════
//  CLIENTES (CRM)
// ════════════════════════════════════════════
let unsubClients = null;


function subscribeClients() {
  const area = document.getElementById('client-list-area');
  if (unsubClients) unsubClients();
  unsubClients = db.collection('clients')
    .where('tenantId', '==', currentUser.tenantId) // ADICIONADO
    .orderBy('razao', 'asc').onSnapshot(snap => {
      area.innerHTML = '';
      if (snap.empty) { area.innerHTML = `<div class="chat-empty" style="margin-top:40px;"><span style="font-size:2rem">🏢</span><span>Nenhum cliente cadastrado.</span></div>`; return; }

      snap.forEach(doc => {
        const c = doc.data();
        const card = document.createElement('div');
        card.className = 'notice-card';

        // Tratamento para não perder os dados antigos do e-cac caso eles existam
        const codStr = c.codigo || c.ecac || 'Não inf.';
        const filStr = c.filial || 'Matriz';

        card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span class="notice-tag" style="background:var(--surface); color:var(--accent2); border: 1px solid var(--border);">${escHtml(c.regime)}</span>
            <div class="notice-title" style="font-size:16px;">${escHtml(c.razao)}</div>
            <div class="notice-body" style="margin-top:4px;">
              <strong>CNPJ:</strong> ${escHtml(c.cnpj)} <br>
              <strong>Cód. Cliente:</strong> ${escHtml(codStr)} &nbsp;|&nbsp;
              <strong>Filial:</strong> ${escHtml(filStr)}
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-agenda-action" onclick="openClientEdit('${doc.id}', '${escHtml(c.razao).replace(/'/g, "\\'")}', '${escHtml(c.cnpj)}', '${escHtml(c.regime)}', '${escHtml(codStr).replace(/'/g, "\\'")}', '${escHtml(filStr).replace(/'/g, "\\'")}')" title="Editar" style="padding: 6px; border-radius: 6px; cursor:pointer;">✏️</button>
            <button class="btn-del" onclick="deleteClient('${doc.id}')" title="Excluir" style="padding: 6px; border-radius: 6px; cursor:pointer;">🗑️</button>
          </div>
        </div>`;
        area.appendChild(card);
      });
    }, error => { console.error("Erro no Firebase (Clientes):", error); });
}

async function addClient() {
  const razao = document.getElementById('client-razao').value.trim();
  const cnpj = document.getElementById('client-cnpj').value.trim();
  const regime = document.getElementById('client-regime').value;
  const codigo = document.getElementById('client-codigo').value.trim();
  const filial = document.getElementById('client-filial').value.trim();

  if (!razao || !cnpj) { alert('⚠️ Razão Social e CNPJ são obrigatórios.'); return; }

  const btn = document.querySelector('#tab-clientes .btn-post');
  btn.textContent = 'Verificando...';
  btn.disabled = true;

  try {
    // 1. VERIFICA SE O CNPJ JÁ EXISTE NO SISTEMA
    const cnpjQuery = await db.collection('clients')
      .where('tenantId', '==', currentUser.tenantId)
      .where('cnpj', '==', cnpj).get();

    // 👇 O ERRO ESTAVA AQUI: faltava o "p" na variável cnpjQuery 👇
    if (!cnpjQuery.empty) {
      const clienteExistente = cnpjQuery.docs[0].data().razao;
      alert(`⚠️ Cadastro Bloqueado!\n\nEste CNPJ já está cadastrado no sistema e pertence ao cliente:\n🏢 ${clienteExistente}`);
      btn.textContent = '+ Cliente'; btn.disabled = false;
      return;
    }

    // 2. VERIFICA SE O CÓDIGO DO CLIENTE JÁ EXISTE
    if (codigo) {
      const codQuery = await db.collection('clients')
        .where('tenantId', '==', currentUser.tenantId)
        .where('codigo', '==', codigo).get();

      if (!codQuery.empty) {
        const clienteExistente = codQuery.docs[0].data().razao;
        alert(`⚠️ Cadastro Bloqueado!\n\nO Cód. Cliente "${codigo}" já está sendo usado pelo cliente:\n🏢 ${clienteExistente}`);
        btn.textContent = '+ Cliente'; btn.disabled = false;
        return;
      }
    }

    btn.textContent = 'Salvando...';

    // 3. Tudo certo! Salva o novo cliente
    await db.collection('clients').add({
      razao, cnpj, regime, codigo, filial,
      tenantId: currentUser.tenantId, // 👉 Associa o cliente à empresa correta
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Limpa os campos após salvar
    document.getElementById('client-razao').value = '';
    document.getElementById('client-cnpj').value = '';
    document.getElementById('client-codigo').value = '';
    document.getElementById('client-filial').value = '';

  } catch (error) {
    alert('Erro ao salvar cliente:\n' + error.message);
  } finally {
    btn.textContent = '+ Cliente';
    btn.disabled = false;
  }
}

async function deleteClient(id) {
  if (confirm('Tem certeza que deseja remover este cliente?')) await db.collection('clients').doc(id).delete();
}

function openClientEdit(id, razao, cnpj, regime, codigo, filial) {
  document.getElementById('edit-client-id').value = id;
  document.getElementById('edit-client-razao').value = razao;
  document.getElementById('edit-client-cnpj').value = cnpj;
  document.getElementById('edit-client-regime').value = regime;
  document.getElementById('edit-client-codigo').value = codigo === 'Não inf.' ? '' : codigo;
  document.getElementById('edit-client-filial').value = filial === 'Matriz' ? '' : filial;

  document.getElementById('client-edit-modal').style.display = 'flex';
}

function closeClientEdit() {
  document.getElementById('client-edit-modal').style.display = 'none';
}

async function saveClientEdit() {
  const id = document.getElementById('edit-client-id').value;
  const razao = document.getElementById('edit-client-razao').value.trim();
  const cnpj = document.getElementById('edit-client-cnpj').value.trim();
  const regime = document.getElementById('edit-client-regime').value;
  const codigo = document.getElementById('edit-client-codigo').value.trim();
  const filial = document.getElementById('edit-client-filial').value.trim();

  if (!razao || !cnpj) {
    alert('⚠️ A Razão Social e o CNPJ são obrigatórios.');
    return;
  }

  const btn = document.querySelector('#client-edit-modal .btn-post');
  btn.textContent = 'Verificando...';
  btn.disabled = true;

  try {
    // 1. VERIFICA DUPLICIDADE DE CNPJ
    const cnpjQuery = await db.collection('clients')
      .where('tenantId', '==', currentUser.tenantId) // 👉 Filtro obrigatório
      .where('cnpj', '==', cnpj).get();
    const cnpjDuplicado = cnpjQuery.docs.find(doc => doc.id !== id);

    if (cnpjDuplicado) {
      alert(`⚠️ Alteração Bloqueada!\n\nEste CNPJ já está vinculado a outro cliente no sistema:\n🏢 ${cnpjDuplicado.data().razao}`);
      btn.textContent = 'Salvar Alterações'; btn.disabled = false;
      return;
    }

    if (codigo) {
      const codQuery = await db.collection('clients')
        .where('tenantId', '==', currentUser.tenantId) // 👉 Filtro obrigatório
        .where('codigo', '==', codigo).get();
      const codDuplicado = codQuery.docs.find(doc => doc.id !== id);

      if (codDuplicado) {
        alert(`⚠️ Alteração Bloqueada!\n\nO Cód. Cliente "${codigo}" já pertence ao cliente:\n🏢 ${codDuplicado.data().razao}`);
        btn.textContent = 'Salvar Alterações'; btn.disabled = false;
        return;
      }
    }

    btn.textContent = 'Salvando...';

    // 3. Tudo certo! Atualiza os dados no Firebase
    await db.collection('clients').doc(id).update({
      razao,
      cnpj,
      regime,
      codigo,
      filial,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeClientEdit();

  } catch (e) {
    console.error(e);
    alert('Erro ao salvar alterações: ' + e.message);
  } finally {
    btn.textContent = 'Salvar Alterações';
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════
//  PERFIL
// ════════════════════════════════════════════
function openProfile() {
  const perfilTab = document.getElementById('tab-perfil');
  const isAlreadyOpen = perfilTab.classList.contains('active');
  if (isAlreadyOpen) {
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + lastActiveTab).classList.add('active');
    const lastBtn = document.querySelector(`.tab-btn[onclick*="${lastActiveTab}"]`);
    if (lastBtn) lastBtn.classList.add('active');
  } else {
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    perfilTab.classList.add('active');
    loadProfileData();
  }
}

function loadProfileData() {
  if (!currentUser) return;
  ['prof-current-pw', 'prof-new-pw', 'prof-confirm-pw'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const pwFb = $('pw-feedback'); if (pwFb) pwFb.style.display = 'none';
  document.getElementById('prof-name').value = currentUser.name || '';
  document.getElementById('prof-surname').value = currentUser.surname || '';
  document.getElementById('prof-role').value = currentUser.role || '';
  document.getElementById('prof-color').value = currentUser.color || '#3a4060';
  const isManager = isGestor();
  const roleEl = document.getElementById('prof-role');
  roleEl.disabled = !isManager; roleEl.title = isManager ? '' : 'Apenas gestores podem alterar o cargo';
  roleEl.style.opacity = isManager ? '1' : '0.5'; roleEl.style.cursor = isManager ? 'pointer' : 'not-allowed';
}

async function updatePassword() {
  if (!currentUser) return;
  const currentPw = $('prof-current-pw').value; const newPw = $('prof-new-pw').value; const confirmPw = $('prof-confirm-pw').value;
  const feedback = $('pw-feedback');
  const showPwMsg = (msg, ok) => { feedback.style.display = 'block'; feedback.style.color = ok ? 'var(--green)' : 'var(--red)'; feedback.textContent = ok ? '✅ ' + msg : '⚠️ ' + msg; };

  if (!currentPw || !newPw || !confirmPw) { showPwMsg('Preencha todos os campos de senha.', false); return; }
  if (newPw.length < 6) { showPwMsg('A nova senha deve ter no mínimo 6 caracteres.', false); return; }
  if (newPw !== confirmPw) { showPwMsg('A confirmação de senha não confere.', false); return; }
  if (newPw === currentPw) { showPwMsg('A nova senha deve ser diferente da atual.', false); return; }

  try {
    const user = auth.currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(newPw);
    $('prof-current-pw').value = ''; $('prof-new-pw').value = ''; $('prof-confirm-pw').value = '';
    showPwMsg('Senha alterada com sucesso!', true); setTimeout(() => { feedback.style.display = 'none'; }, 4000);
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') showPwMsg('Senha atual incorreta.', false);
    else if (err.code === 'auth/requires-recent-login') showPwMsg('Sessão expirada. Faça logout e login novamente antes de alterar a senha.', false);
    else showPwMsg('Erro ao alterar senha. Tente novamente.', false);
  }
}

async function updateProfile() {
  if (!currentUser) return;
  const name = document.getElementById('prof-name').value.trim(); const surname = document.getElementById('prof-surname').value.trim();
  const isManager = isGestor();
  const role = isManager ? document.getElementById('prof-role').value.trim() : (currentUser.role || '');
  const color = document.getElementById('prof-color').value;
  if (!name) { alert('O nome é obrigatório.'); return; }
  if (name.length > 50) { alert('Nome muito longo (máx. 50 caracteres).'); return; }
  const initials = ((name[0] || '') + (surname[0] || '')).toUpperCase() || '?';
  const btn = document.querySelector('#tab-perfil .btn-post'); btn.textContent = 'Salvando...'; btn.disabled = true;
  try {
    await db.collection('users').doc(currentUser.uid).set({ name, surname, role, color, initials }, { merge: true });
    currentUser.name = name; currentUser.surname = surname; currentUser.role = role; currentUser.color = color; currentUser.initials = initials;
    filterChannels(); initSectorViews();
    $('user-avatar').textContent = initials; $('user-avatar').style.background = color;
    $('user-name-text').textContent = name + ' ' + surname;
    const feedback = document.getElementById('prof-feedback');
    feedback.style.display = 'block'; setTimeout(() => { feedback.style.display = 'none'; }, 3000);
  } catch (error) { alert('Erro: ' + error.message); }
  finally { btn.textContent = 'Salvar Alterações'; btn.disabled = false; }
}

// ════════════════════════════════════════════
//  ADMINISTRAÇÃO DE USUÁRIOS (Gestor)
// ════════════════════════════════════════════
let editingUserId = null;

function showFeedback(el, msg, color) {
  el.textContent = msg; el.style.color = color; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function loadUsers() {
  db.collection('users').onSnapshot(snap => {
    const container = $('users-sidebar'); container.innerHTML = ''; let count = 0;
    snap.forEach(doc => {
      count++;
      const u = doc.data(); const uid = doc.id; const isMe = currentUser && uid === currentUser.uid;
      const nameStr = u.name + ' ' + (u.surname || '');
      const div = document.createElement('div');
      div.className = 'user-row' + (isDM && currentDM === uid ? ' active-dm' : '');
      if (!isMe) {
        div.onclick = () => { openDM(uid, nameStr, div); closeSidebar(); };
        const roomId = currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`;
        if (!unreadObservers[roomId]) {
          unreadObservers[roomId] = db.collection('directMessages').doc(roomId).collection('messages').onSnapshot(s => {
            let dmCount = 0; s.forEach(d => { const m = d.data(); if (m.authorId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) dmCount++; });
            const b = div.querySelector('.unread-badge'); if (b) { b.textContent = dmCount; b.style.display = dmCount > 0 ? 'inline-block' : 'none'; }
          });
        }
      } else { div.style.cursor = 'default'; }
      div.innerHTML = `<div class="user-av" style="background:${u.color || '#3a4060'}">${u.initials || '??'}</div><div><div class="user-name">${nameStr} ${isMe ? '<span style="color:var(--muted);font-size:10px">(Você)</span>' : ''}</div><div class="user-status">${u.role || ''}</div></div><span class="unread-badge"></span><div class="dot" style="background:var(--green)"></div>`;
      container.appendChild(div);
    });
    $('stat-members').textContent = count;
  });
}

function initUsersAdmin() {
  const isGestorRole = isGestor();
  const btn = document.getElementById('btn-tab-usuarios');
  if (btn) btn.style.display = isGestorRole ? '' : 'none';
  if (!isGestorRole) return;
  if (unsubUsers) { unsubUsers(); unsubUsers = null; }
  unsubUsers = db.collection('users')
    .where('tenantId', '==', currentUser.tenantId).onSnapshot(snap => {
      const container = $('users-admin-list'); const label = document.getElementById('users-count-label');
      if (!container) return; container.innerHTML = '';
      if (label) label.textContent = snap.size + ' usuário(s) cadastrado(s)';
      snap.forEach(doc => {
        const u = doc.data(); const isSelf = doc.id === currentUser?.uid;
        const roleLabel = { fiscal: 'Dep. Fiscal', dp: 'Dep. Pessoal', contabil: 'Dep. Contábil', gestor: 'Gestor' }[u.role] || u.role || '—';
        const card = document.createElement('div'); card.className = 'user-admin-card';
        card.innerHTML = `<div class="user-av" style="background:${u.color || '#3a4060'};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;flex-shrink:0">${u.initials || '?'}</div><div class="uac-info"><div class="uac-name">${escHtml((u.name || '') + ' ' + (u.surname || ''))} ${isSelf ? '<span style="font-size:10px;color:var(--muted)">(você)</span>' : ''}</div><div class="uac-role">${escHtml(roleLabel)}</div><div class="uac-email">${escHtml(u.email || '')}</div></div><div class="uac-actions"><button class="btn-uac-edit" onclick="openUserEdit('${doc.id}')">✏️</button>${!isSelf ? `<button class="btn-uac-del" onclick="deleteUser('${doc.id}')">🗑️</button>` : ''}</div>`;
        container.appendChild(card);
      });
    });
}

function openCreateUser() {
  editingUserId = null;
  document.getElementById('uform-create').style.display = 'block'; document.getElementById('uform-wrap').style.display = 'none';
  document.getElementById('uform-placeholder').style.display = 'none'; document.getElementById('uform-title').textContent = '✏️ Editar Usuário';
  ['new-user-name', 'new-user-surname', 'new-user-email', 'new-user-pass'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('new-user-role').value = ''; document.getElementById('new-user-color').value = '#3a4060'; document.getElementById('new-user-feedback').style.display = 'none';
}

function cancelCreateUser() { document.getElementById('uform-create').style.display = 'none'; document.getElementById('uform-placeholder').style.display = 'block'; }

function openUserEdit(uid) {
  editingUserId = uid;
  db.collection('users').doc(uid).get().then(doc => {
    if (!doc.exists) return;
    const u = doc.data();
    document.getElementById('uform-create').style.display = 'none'; document.getElementById('uform-name').value = (u.name || '') + ' ' + (u.surname || '');
    document.getElementById('uform-role').value = u.role || ''; document.getElementById('uform-color').value = u.color || '#3a4060';
    document.getElementById('uform-wrap').style.display = 'block'; document.getElementById('uform-placeholder').style.display = 'none';
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
  document.getElementById('uform-placeholder').style.display = 'block'; document.getElementById('uform-title').textContent = '✏️ Editar Usuário';
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
    await db.collection('users').doc(uid).set({
      name, surname, email, role, color, initials,
      tenantId: currentUser.tenantId, // ADICIONADO: O novo funcionário pertence a este escritório
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await secondaryAuth.signOut(); await secondaryApp.delete();
    showFeedback(feedback, '✅ Usuário criado com sucesso!', 'var(--green)');
    setTimeout(() => { document.getElementById('uform-create').style.display = 'none'; document.getElementById('uform-placeholder').style.display = 'block'; }, 2000);
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

    document.getElementById('invite-link-display').style.display = 'block';
    document.getElementById('generated-link').value = inviteLink;

    alert("Link de convite gerado com sucesso!");
  } catch (error) {
    console.error("Erro ao gerar convite:", error);
  }
}