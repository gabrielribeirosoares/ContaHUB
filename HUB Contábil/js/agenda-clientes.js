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
  
  // 🔴 ADICIONE O FILTRO .where ABAIXO:
  unsubAgendaRP = db.collection('agenda')
    .where('tenantId', '==', currentUser.tenantId) // <--- ESTA LINHA EVITA ERROS DE PERMISSÃO
    .orderBy('createdAt', 'asc').onSnapshot(snap => {
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

