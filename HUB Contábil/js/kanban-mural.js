// ════════════════════════════════════════════
//  SETORES (Controle de Acesso às Abas)
// ════════════════════════════════════════════
const SECTOR_LABELS = { fiscal: 'Dep. Fiscal', dp: 'Dep. Pessoal', contabil: 'Dep. Contábil' };
const ALL_SECTORS = ['fiscal', 'dp', 'contabil'];
let currentTaskSector = null;
let currentAgendaSector = null;

function getUserSectors(role) {
  if (!role) return ['fiscal'];
  const r = role.toLowerCase();
  if (r === 'gestor') return ALL_SECTORS;
  if (r === 'fiscal') return ['fiscal'];
  if (r === 'dp') return ['dp'];
  if (r === 'contabil') return ['contabil'];
  return ['fiscal'];
}

function buildSectorTabs(containerId, sectors, currentSector, onClickFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  ALL_SECTORS.forEach(s => {
    const btn = document.createElement('button');
    const locked = !sectors.includes(s);
    btn.className = 'sector-tab' + (s === currentSector ? ' active' : '') + (locked ? ' locked' : '');
    btn.textContent = SECTOR_LABELS[s];
    btn.title = locked ? 'Acesso restrito ao seu setor' : '';
    if (!locked) btn.onclick = () => onClickFn(s);
    container.appendChild(btn);
  });
}

function switchTaskSector(sector) {
  currentTaskSector = sector;
  const sectors = getUserSectors(currentUser?.role || '');
  buildSectorTabs('task-sector-tabs', sectors, sector, switchTaskSector);
  const sel = document.getElementById('task-tag-sel'); if (sel) sel.value = sector;
  if (unsubTasks) { unsubTasks(); unsubTasks = null; }
  subscribeTasks(sector);
}

function switchAgendaSector(sector) {
  currentAgendaSector = sector;
  const sectors = getUserSectors(currentUser?.role || '');
  buildSectorTabs('agenda-sector-tabs', sectors, sector, switchAgendaSector);
  const sel = document.getElementById('agenda-sector'); if (sel) sel.value = sector;
  if (unsubAgenda) { unsubAgenda(); unsubAgenda = null; }
  subscribeAgenda(sector);
}

function filterChannels() {
  const sectors = getUserSectors(currentUser?.role || '');
  const channelSectorMap = { fiscal: 'fiscal', dp: 'dp', contabil: 'contabil' };
  Object.entries(channelSectorMap).forEach(([channel, sector]) => {
    const btn = document.getElementById('btn-chan-' + channel);
    if (!btn) return;
    if (sectors.includes(sector)) {
      btn.classList.remove('locked');
    } else {
      btn.classList.add('locked');
      if (currentChannel === channel) {
        const geralBtn = document.getElementById('btn-chan-geral');
        if (geralBtn) switchChannel(geralBtn);
      }
    }
  });
}

function initSectorViews() {
  filterChannels();
  if (typeof initUsersAdmin === 'function') initUsersAdmin();
  const sectors = getUserSectors(currentUser?.role || '');
  const first = sectors[0] || 'fiscal';
  currentTaskSector = first;
  currentAgendaSector = first;
  buildSectorTabs('task-sector-tabs', sectors, first, switchTaskSector);
  buildSectorTabs('agenda-sector-tabs', sectors, first, switchAgendaSector);
  const taskSel = document.getElementById('task-tag-sel');
  if (taskSel) { Array.from(taskSel.options).forEach(o => { o.hidden = !sectors.includes(o.value); }); taskSel.value = first; }
  const agendaSel = document.getElementById('agenda-sector');
  if (agendaSel) { Array.from(agendaSel.options).forEach(o => { o.hidden = !sectors.includes(o.value); }); agendaSel.value = first; }
  subscribeTasks(first);

  // NOVO: Carregar a lista de clientes nos selects de tarefas ao iniciar a view
  carregarClientesNoSelect();

  if (typeof subscribeAgenda === 'function') subscribeAgenda(first);
  if (typeof subscribeAgendaRightPanel === 'function') subscribeAgendaRightPanel();
}

// ════════════════════════════════════════════
//  MURAL DE AVISOS
// ════════════════════════════════════════════
const noticeTags = { geral: '📌 Geral', urgente: '🔴 Urgente', info: '🔵 Info', sucesso: '✅ Concluído' };

function subscribeMural() {
  const area = $('mural-area');
  // ADICIONADO: Filtro tenantId
  unsubMural = db.collection('notices')
    .where('tenantId', '==', currentUser.tenantId)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      // ... (o resto do código dentro do onSnapshot mantém-se igual)
      area.innerHTML = '';
      if (snap.empty) {
        area.innerHTML = `<div class="chat-empty" style="margin-top:40px"><span style="font-size:2rem">📌</span><span>Nenhum aviso ainda.</span></div>`;
        $('stat-notices').textContent = 0; return;
      }
      $('stat-notices').textContent = snap.size;
      const userSectors = getUserSectors(currentUser?.role || '');
      const isManagerMural = userSectors.length === 4;
      snap.forEach(doc => {
        const n = doc.data();
        if (n.sector && n.sector !== 'todos' && !isManagerMural && !userSectors.includes(n.sector)) return;
        const ts = n.createdAt?.toDate?.() || new Date();
        const timeStr = ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isOwn = n.authorId === currentUser?.uid;
        const card = document.createElement('div');
        card.className = 'notice-card ' + (n.type || 'geral');
        card.innerHTML = `
           <span class="notice-tag">${noticeTags[n.type] || '📌 Geral'}</span>
           <div class="notice-title">${escHtml(n.title)}</div>
           <div class="notice-body">${escHtml(n.body || '')}</div>
           <div class="notice-footer">
             <span>${escHtml(n.authorName || '')}</span>
             <span style="display:flex;align-items:center;gap:6px">${timeStr} ${isOwn ? `<button class="btn-del" onclick="deleteNotice('${doc.id}')">✕</button>` : ''}</span>
           </div>`;
        area.appendChild(card);
      });
    });
}

async function addNotice() {
  if (!currentUser) return;
  const title = document.getElementById('notice-title').value.trim();
  const body = document.getElementById('notice-body').value.trim();
  const type = document.getElementById('notice-type').value;
  const sector = document.getElementById('notice-sector')?.value || 'todos';
  if (!title) return;

  await db.collection('notices').add({
    title, body, type, sector,
    tenantId: currentUser.tenantId, // ADICIONADO: Associação à empresa
    authorId: currentUser.uid,
    authorName: currentUser.name + ' ' + (currentUser.surname || ''),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  document.getElementById('notice-title').value = '';
  document.getElementById('notice-body').value = '';
}

async function deleteNotice(id) {
  if (!currentUser) return;
  const isManager = isGestor();
  const snap = await db.collection('notices').doc(id).get();
  if (!snap.exists) return;
  if (!isManager && snap.data().authorId !== currentUser.uid) {
    alert('Você só pode remover seus próprios avisos.'); return;
  }
  if (confirm('Remover aviso?')) await db.collection('notices').doc(id).delete();
}

// ════════════════════════════════════════════
//  KANBAN / TAREFAS
// ════════════════════════════════════════════
let currentTaskFilter = 'todas';
let currentTaskChecklist = [];
let currentTaskAttachments = [];

function applyTaskFilter(filterType, btnEl) {
  currentTaskFilter = filterType;
  if (btnEl) {
    const botoes = btnEl.parentElement.querySelectorAll('button');
    botoes.forEach(b => {
      b.style.background = 'var(--surface)';
      if (b.innerText.includes('Atrasadas')) {
        b.style.color = 'var(--red)';
        b.style.borderColor = 'var(--red)';
      } else {
        b.style.color = 'var(--text)';
        b.style.borderColor = 'var(--border)';
      }
    });
    if (filterType === 'atrasadas') {
      btnEl.style.background = 'rgba(224, 95, 95, 0.15)';
    } else {
      btnEl.style.background = 'rgba(201, 168, 76, 0.15)';
      btnEl.style.color = 'var(--accent2)';
      btnEl.style.borderColor = 'var(--accent)';
    }
  }
  if (currentTaskSector) subscribeTasks(currentTaskSector);
}

function getDueBadgeClass(due) {
  if (!due) return 'task-due';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + 'T00:00:00');
  const diff = Math.ceil((d - today) / 86400000);
  if (diff < 0) return 'task-due-late';
  if (diff <= 3) return 'task-due-soon';
  return 'task-due-ok';
}

function getDueTooltip(due) {
  if (!due) return 'Sem vencimento';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + 'T00:00:00');
  const diff = Math.ceil((d - today) / 86400000);
  const formatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (diff < 0) return 'Tarefa vencida em ' + formatted;
  if (diff === 0) return 'Vence hoje!';
  if (diff === 1) return 'Vence amanhã (' + formatted + ')';
  if (diff <= 3) return 'Vence em ' + diff + ' dias (' + formatted + ')';
  return 'Vencimento: ' + formatted;
}

function formatDueDate(due) {
  if (!due) return '';
  const d = new Date(due + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - today) / 86400000);
  const formatted = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (diff < 0) return '⚠️ ' + formatted;
  if (diff === 0) return '🔴 Hoje';
  if (diff <= 3) return '🟡 ' + formatted;
  return formatted;
}

function updateDueAlertsBanner(docs) {
  const alertContainer = document.getElementById('task-due-alerts-current');
  if (!alertContainer) return;

  let lateCount = 0;
  let soonCount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  docs.forEach(doc => {
    const t = doc.data();
    // Validamos apenas tarefas que NÃO estão concluídas e possuem data de vencimento
    if (t.column !== 'done' && t.due) {
      const d = new Date(t.due + 'T00:00:00');
      const diff = Math.ceil((d - today) / 86400000);

      if (diff < 0) {
        lateCount++; // Tarefa atrasada
      } else if (diff >= 0 && diff <= 3) {
        soonCount++; // Vence nos próximos 3 dias
      }
    }
  });

  // Limpa o conteúdo anterior
  alertContainer.innerHTML = '';

  // Se não houver alertas, oculta o elemento
  if (lateCount === 0 && soonCount === 0) {
    alertContainer.style.display = 'none';
    return;
  }

  // Ativa a exibição do bloco de alertas
  alertContainer.style.display = 'flex';
  alertContainer.style.flexDirection = 'column';
  alertContainer.style.gap = '8px';

  // Injeta o aviso de tarefas atrasadas (Alerta Vermelho)
  if (lateCount > 0) {
    alertContainer.innerHTML += `
      <div class="task-due-alert late">
        <span>⚠️ Atenção: Tens <strong>${lateCount}</strong> tarefa(s) atrasada(s) neste setor!</span>
      </div>
    `;
  }

  // Injeta o aviso de tarefas a vencer (Alerta Amarelo/Dourado)
  if (soonCount > 0) {
    alertContainer.innerHTML += `
      <div class="task-due-alert soon">
        <span>📅 Fique atento: <strong>${soonCount}</strong> tarefa(s) vencem nos próximos 3 dias!</span>
      </div>
    `;
  }
}

function subscribeTasks(sector) {
  // Filtro tenantId
  const query = db.collection('tasks')
    .where('tenantId', '==', currentUser.tenantId)
    .where('tag', '==', sector);

  unsubTasks = query.onSnapshot(snap => {
    ['todo', 'prog', 'done'].forEach(col => { const el = document.getElementById('col-' + col); if (el) el.innerHTML = ''; });
    let openCount = 0;
    const docs = [];
    snap.forEach(doc => docs.push(doc));
    updateDueAlertsBanner(docs);
    docs.sort((a, b) => {
      const ta = a.data().createdAt?.toMillis?.() || 0;
      const tb = b.data().createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    docs.forEach(doc => {
      const t = doc.data();
      if (currentTaskFilter === 'minhas' && t.authorId !== currentUser?.uid) return;
      if (currentTaskFilter === 'atrasadas') {
        if (!t.due || t.column === 'done') return;
        const d = new Date(t.due + 'T00:00:00');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (Math.ceil((d - today) / 86400000) >= 0) return;
      }
      const col = t.column || 'todo';
      if (col !== 'done') openCount++;

      const isOwn = t.authorId === currentUser?.uid;
      const isManager = isGestor();
      const card = document.createElement('div');
      card.className = 'task-card'; if (col === 'done') card.style.opacity = '.65';

      const checkCount = t.checklist ? t.checklist.length : 0;
      const doneCount = t.checklist ? t.checklist.filter(c => c.done).length : 0;
      const checkHtml = checkCount > 0 ? `<div style="font-size:11px; color:var(--muted); margin-top:6px; display:flex; align-items:center; gap:4px;"><span style="color:${doneCount === checkCount ? 'var(--green)' : 'var(--accent2)'}">☑ ${doneCount}/${checkCount}</span> concluídos</div>` : '';
      const checklistStr = encodeURIComponent(JSON.stringify(t.checklist || []));

      // HTML do Cliente
      const clientHtml = t.clientName ? `<div style="font-size:11.5px; font-weight:500; color:var(--blue); margin-top:4px; margin-bottom:2px;"><i class="fas fa-building" style="margin-right:4px;"></i>${escHtml(t.clientName)}</div>` : '';

      // 👇 LÓGICA INTELIGENTE DAS INICIAIS (Nome + Sobrenome) 👇
      let calculatedInitials = '??';
      if (t.authorName && t.authorName.trim() !== '') {
        // Quebra o nome completo pelos espaços
        const nameParts = t.authorName.trim().split(/\s+/);
        if (nameParts.length > 1) {
          // Pega a 1ª letra do primeiro nome e a 1ª letra do último nome
          calculatedInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
        } else {
          // Se a pessoa só tiver um nome, pega as duas primeiras letras dele
          calculatedInitials = nameParts[0].substring(0, 2).toUpperCase();
        }
      } else if (t.authorInitials && t.authorInitials !== 'US') {
        calculatedInitials = t.authorInitials;
      }

      // 👇 HTML do Card completo usando o calculatedInitials
      card.innerHTML = `
          <div class="task-card-title" style="${col === 'done' ? 'text-decoration:line-through;padding-right:80px' : 'padding-right:80px'}">${escHtml(t.title)}</div>
          ${clientHtml}
          ${checkHtml}
          <div class="task-card-meta" style="margin-top:8px;">
            <span class="task-tag ${t.tag || 'fiscal'}">${SECTOR_LABELS[t.tag] || t.tag || 'fiscal'}</span>
            
            <div class="task-assignee" title="${t.authorName || 'Sem autor'}" style="background:${t.authorColor || '#3a4060'}">
              ${calculatedInitials}
            </div>
            
            <span class="${col === 'done' ? 'task-due' : getDueBadgeClass(t.due)}" title="${col === 'done' ? 'Concluído' : getDueTooltip(t.due)}">${col === 'done' ? ('✅ ' + (t.completedAt?.toDate ? t.completedAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'Concluído')) : formatDueDate(t.due)}</span>
          </div>
          <div class="task-actions" style="display:none;position:absolute;top:6px;right:6px;gap:4px;flex-direction:row;align-items:center;">
            ${(isOwn || isManager) && col !== 'done' ? `<button title="Concluir" onclick="completeTask('${doc.id}')" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--green);cursor:pointer;font-size:12px;padding:2px 6px;line-height:1.4;">✓</button>` : ''}
            ${(isOwn || isManager) ? `<button title="Editar" onclick="openEditTask('${doc.id}','${escHtml(t.title).replace(/'/g, "\\'")}','${t.tag || 'fiscal'}','${t.due || ''}','${t.column || 'todo'}', '${checklistStr}', '${encodeURIComponent(JSON.stringify(t.attachments || []))}', '${t.clientId || ''}')" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--muted);cursor:pointer;font-size:11px;padding:2px 6px;line-height:1.4;">✏️</button>` : ''}
            ${(isOwn || isManager) ? `<button title="Excluir" onclick="deleteTask('${doc.id}')" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--red);cursor:pointer;font-size:12px;padding:2px 6px;line-height:1.4;">✕</button>` : ''}
          </div>`;

      card.addEventListener('mouseenter', () => { const a = card.querySelector('.task-actions'); if (a) a.style.display = 'flex'; });
      card.addEventListener('mouseleave', () => { const a = card.querySelector('.task-actions'); if (a) a.style.display = 'none'; });
      const colEl = document.getElementById('col-' + col); if (colEl) colEl.appendChild(card);
    });

    const statEl = $('stat-tasks'); if (statEl) statEl.textContent = openCount;
    ['todo', 'prog', 'done'].forEach(col => { const c = document.getElementById('count-' + col); if (c) c.textContent = document.getElementById('col-' + col)?.children.length || 0; });
  });
}

async function addTask() {
  if (!currentUser) return;
  const title = document.getElementById('task-title').value.trim();
  const tag = document.getElementById('task-tag-sel').value;
  const col = document.getElementById('task-col-sel').value;
  const due = document.getElementById('task-due').value.trim();

  // NOVO: Pegando as informações do cliente
  const clientSel = document.getElementById('task-client-sel');
  const clientId = clientSel ? clientSel.value : '';
  const clientName = clientSel && clientSel.selectedIndex > 0 ? clientSel.options[clientSel.selectedIndex].text : '';

  if (!title) { alert('⚠️ Por favor, digite o título da tarefa.'); return; }
  if (!due) { alert('⚠️ Por favor, informe a data de vencimento da tarefa.'); return; }
  if (title.length > 200) { alert('⚠️ Título muito longo (máx. 200 caracteres).'); return; }

  const validTags = ['fiscal', 'dp', 'contabil'];
  if (!validTags.includes(tag)) return;

  const btn = document.querySelector('.tasks-add .btn-post');
  btn.textContent = 'Adicionando...'; btn.disabled = true;

  try {
    await db.collection('tasks').add({
      title, tag, due, column: col,
      clientId, clientName,
      checklist: [],
      tenantId: currentUser.tenantId, // ADICIONADO: Associação à empresa
      authorId: currentUser.uid,
      authorName: currentUser.name,
      authorInitials: currentUser.initials || 'US',
      authorColor: currentUser.color || '#3a4060',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('task-title').value = '';
    document.getElementById('task-due').value = '';
    if (clientSel) clientSel.value = ''; // Limpa o campo do cliente
  } catch (error) {
    alert('Erro ao salvar tarefa: ' + error.message);
  } finally {
    btn.textContent = '+ Tarefa'; btn.disabled = false;
  }
}

function openEditTask(id, title, tag, due, col, checklistStr, attachmentsStr, clientId = '') {
  document.getElementById('edit-task-id').value = id;
  document.getElementById('edit-task-title').value = title;
  document.getElementById('edit-task-tag').value = tag;
  document.getElementById('edit-task-col').value = col;
  document.getElementById('edit-task-due').value = due;

  // Removemos a tentativa manual de atribuir o value e chamamos a função que constrói a lista:
  populateEditTaskClients(clientId);

  try { currentTaskChecklist = checklistStr ? JSON.parse(decodeURIComponent(checklistStr)) : []; }
  catch (e) { currentTaskChecklist = []; }
  renderChecklist();

  try { currentTaskAttachments = attachmentsStr ? JSON.parse(decodeURIComponent(attachmentsStr)) : []; }
  catch (e) { currentTaskAttachments = []; }
  renderAttachments();

  const modal = document.getElementById('task-edit-modal');
  modal.style.display = 'flex';
}

function renderChecklist() {
  const container = document.getElementById('edit-task-checklist-container');
  container.innerHTML = '';
  if (currentTaskChecklist.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:var(--muted); font-style:italic; padding-left:4px;">Nenhuma subtarefa adicionada.</div>';
    return;
  }
  currentTaskChecklist.forEach((item, index) => {
    container.innerHTML += `
      <div style="display:flex; align-items:center; gap:10px; background:var(--surface); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
        <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklist(${index})" style="width:16px; height:16px; cursor:pointer; accent-color:var(--green);">
        <span style="flex:1; font-size:13px; ${item.done ? 'text-decoration:line-through; color:var(--muted);' : 'color:var(--text);'}">${escHtml(item.text)}</span>
        <button onclick="removeChecklist(${index})" title="Excluir" style="background:none; border:none; color:var(--red); font-size:14px; cursor:pointer; padding:0 4px;">✕</button>
      </div>`;
  });
}

function addChecklistItem() {
  const inp = document.getElementById('edit-task-new-check');
  const text = inp.value.trim();
  if (!text) return;
  currentTaskChecklist.push({ text: text, done: false });
  inp.value = '';
  renderChecklist();
}

function toggleChecklist(index) {
  currentTaskChecklist[index].done = !currentTaskChecklist[index].done;
  renderChecklist();
}

function removeChecklist(index) {
  currentTaskChecklist.splice(index, 1);
  renderChecklist();
}

function renderAttachments() {
  const container = document.getElementById('edit-task-attachments-container');
  container.innerHTML = '';
  if (currentTaskAttachments.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:var(--muted); font-style:italic; padding-left:4px;">Nenhum arquivo anexado.</div>';
    return;
  }
  currentTaskAttachments.forEach((file, index) => {
    container.innerHTML += `
      <div style="display:flex; align-items:center; gap:8px; background:var(--bg); padding:6px 10px; border-radius:6px; border:1px solid var(--border);">
        <a href="${file.url}" target="_blank" style="flex:1; font-size:12px; color:var(--blue); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📄 ${escHtml(file.name)}</a>
        <button onclick="removeAttachment(${index})" title="Excluir Anexo" style="background:none; border:none; color:var(--red); font-size:12px; cursor:pointer;">✕</button>
      </div>`;
  });
}

async function uploadTaskFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const taskId = document.getElementById('edit-task-id').value;
  if (!taskId) { alert('Salve a tarefa primeiro antes de anexar arquivos.'); return; }

  const btnSalvar = document.querySelector('#task-edit-modal .btn-post');
  btnSalvar.textContent = '⏳ Enviando Arquivo...'; btnSalvar.disabled = true;

  try {
    const fileRef = storage.ref(`tasks/${taskId}/${Date.now()}_${file.name}`);
    const snapshot = await fileRef.put(file);
    const fileUrl = await snapshot.ref.getDownloadURL();
    currentTaskAttachments.push({ name: file.name, url: fileUrl });
    renderAttachments();
  } catch (error) { alert('Erro ao enviar arquivo: ' + error.message); }
  finally { btnSalvar.textContent = 'Salvar Tarefa'; btnSalvar.disabled = false; e.target.value = ''; }
}

function removeAttachment(index) {
  if (confirm('Remover este anexo? O arquivo não será apagado do servidor, apenas desvinculado da tarefa.')) {
    currentTaskAttachments.splice(index, 1);
    renderAttachments();
  }
}

async function saveTaskEdit() {
  const id = document.getElementById('edit-task-id').value;
  const title = document.getElementById('edit-task-title').value.trim();
  const tag = document.getElementById('edit-task-tag').value;
  const col = document.getElementById('edit-task-col').value;
  const due = document.getElementById('edit-task-due').value.trim();

  if (!title) {
    alert('O título é obrigatório.');
    return;
  }

  // Captura do Cliente
  const editClientSel = document.getElementById('edit-task-client');
  const clientId = editClientSel ? editClientSel.value : '';

  // Só pega o nome se realmente houver um clientId selecionado válido
  const clientName = (clientId && editClientSel && editClientSel.selectedIndex > 0)
    ? editClientSel.options[editClientSel.selectedIndex].text
    : '';

  const btn = document.querySelector('#task-edit-modal .btn-post');
  if (btn) { btn.textContent = 'Salvando...'; btn.disabled = true; }

  try {
    await db.collection('tasks').doc(id).update({
      title,
      tag,
      column: col,
      due: due || null, // Evita enviar string vazia para datas
      clientId,
      clientName,
      checklist: typeof currentTaskChecklist !== 'undefined' ? currentTaskChecklist : [],
      attachments: typeof currentTaskAttachments !== 'undefined' ? currentTaskAttachments : []
    });

    if (typeof closeEditTask === 'function') {
      closeEditTask();
    }
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    if (btn) { btn.textContent = 'Salvar Tarefa'; btn.disabled = false; }
  }
}

function closeEditTask() { $('task-edit-modal').style.display = 'none'; }
async function completeTask(id) { await db.collection('tasks').doc(id).update({ column: 'done', completedAt: firebase.firestore.FieldValue.serverTimestamp() }); }

async function deleteTask(id) {
  if (!currentUser) return;
  const isManager = isGestor();
  const snap = await db.collection('tasks').doc(id).get();
  if (!snap.exists) return;
  if (!isManager && snap.data().authorId !== currentUser.uid) { alert('Você só pode excluir suas próprias tarefas.'); return; }
  if (confirm('Remover tarefa?')) await db.collection('tasks').doc(id).delete();
}

// ════════════════════════════════════════════
// Função para popular os selects de clientes em TEMPO REAL
// ════════════════════════════════════════════
let unsubClientesSelect = null;

function carregarClientesNoSelect() {
  const clientSel = document.getElementById('task-client-sel');
  const editClientSel = document.getElementById('edit-task-client');

  if (!clientSel || !editClientSel) return;

  if (unsubClientesSelect) {
    unsubClientesSelect();
  }

  unsubClientesSelect = db.collection('clients')
    .where('tenantId', '==', currentUser.tenantId) // ADICIONADO
    .orderBy('razao')
    .onSnapshot(snap => { // ... {
      let optionsHTML = '<option value="">Sem cliente</option>';

      snap.forEach(doc => {
        const cliente = doc.data();
        const nomeCliente = cliente.razao || 'Cliente sem nome';
        optionsHTML += `<option value="${doc.id}">${nomeCliente}</option>`;
      });

      clientSel.innerHTML = optionsHTML;
      editClientSel.innerHTML = optionsHTML;
    }, error => {
      console.error("Erro ao carregar clientes:", error);
    });
}

// ════════════════════════════════════════════
// IMPORTAÇÃO DE PLANILHA (BLINDADA)
// ════════════════════════════════════════════
async function importarPlanilhaTarefas(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Tentativa de achar o botão, mas não trava se ele não existir (anti-crash)
  let btn = event.target.nextElementSibling;
  if (btn && btn.tagName !== 'BUTTON') btn = null;

  let textoOriginal = '📥';
  if (btn) {
    textoOriginal = btn.innerHTML;
    btn.innerHTML = '⏳';
    btn.disabled = true;
  }

  try {
    // 1. Dicionário de Clientes
    const clientsSnap = await db.collection('clients').get();
    const mapClientes = {};

    clientsSnap.forEach(doc => {
      const c = doc.data();
      const clientObj = { id: doc.id, name: c.razao || '' };
      if (c.razao) mapClientes[c.razao.toLowerCase().trim()] = clientObj;
      if (c.cnpj) mapClientes[c.cnpj.replace(/\D/g, '')] = clientObj;
    });

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const primeiraAba = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[primeiraAba];
        const json = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        if (json.length === 0) {
          alert('⚠️ A planilha parece estar vazia.');
          event.target.value = '';
          if (btn) { btn.innerHTML = textoOriginal; btn.disabled = false; }
          return;
        }

        if (!confirm(`Analisando as tarefas da planilha... Deseja importá-las?`)) {
          event.target.value = '';
          if (btn) { btn.innerHTML = textoOriginal; btn.disabled = false; }
          return;
        }

        const batch = db.batch();
        let importadas = 0;
        let clientesNaoEncontrados = 0;

        json.forEach(linha => {
          // CONVERSÃO SEGURA: Ignora maiúsculas/minúsculas no cabeçalho do CSV
          const lSafe = {};
          for (let key in linha) {
            lSafe[key.trim().toUpperCase()] = linha[key];
          }

          // Busca Título
          const titulo = lSafe['TÍTULO'] || lSafe['TITULO'] || lSafe['TAREFA'] || lSafe['NOME'] || '';
          if (!titulo.trim()) return;

          // CORREÇÃO 1: Se o "título" for apenas o próprio cabeçalho escrito no meio da tabela, ignora a linha.
          if (titulo.trim().toUpperCase() === 'TAREFA' || titulo.trim().toUpperCase() === 'TITULO' || titulo.trim().toUpperCase() === 'TÍTULO') {
            return;
          }

          // Busca Setor
          let setorPlanilha = (lSafe['SETOR'] || lSafe['DEPARTAMENTO'] || 'fiscal').toString().toLowerCase();
          let tag = 'fiscal';
          if (setorPlanilha.includes('pessoal') || setorPlanilha === 'dp') tag = 'dp';
          if (setorPlanilha.includes('contabil') || setorPlanilha.includes('contábil')) tag = 'contabil';

          // CORREÇÃO 2: Busca Data (Adicionado DATA DE ENTREGA e correção de barras duplas //)
          let dataVencimento = '';
          let rawDate = lSafe['DATA DE ENTREGA'] || lSafe['VENCIMENTO'] || lSafe['DATA'] || '';

          if (rawDate && typeof rawDate === 'string') {
            // Se houver erros de digitação como 10//04//2026, ele substitui por 10/04/2026
            let dataLimpa = rawDate.replace(/\/+/g, '/').trim();
            let partes = dataLimpa.split('/');
            if (partes.length === 3) {
              dataVencimento = `${partes[2]}-${partes[1]}-${partes[0]}`; // Formata para YYYY-MM-DD
            }
          }

          // Busca Cliente
          let clientIdSelecionado = '';
          let clientNameSelecionado = '';
          let rawClient = (lSafe['CLIENTE'] || lSafe['RAZÃO SOCIAL'] || lSafe['RAZAO SOCIAL'] || lSafe['CLIENTE/RAZAO SOCIAL'] || lSafe['CNPJ'] || '').toString().trim();
          let valorClientePlanilha = rawClient.toLowerCase();

          if (valorClientePlanilha) {
            let apenasNumeros = valorClientePlanilha.replace(/\D/g, '');
            if (mapClientes[valorClientePlanilha]) {
              clientIdSelecionado = mapClientes[valorClientePlanilha].id;
              clientNameSelecionado = mapClientes[valorClientePlanilha].name;
            } else if (apenasNumeros && mapClientes[apenasNumeros]) {
              clientIdSelecionado = mapClientes[apenasNumeros].id;
              clientNameSelecionado = mapClientes[apenasNumeros].name;
            } else {
              clientesNaoEncontrados++;
              clientNameSelecionado = rawClient; // Mantém o nome puro caso o Firebase não o encontre
            }
          }

          const taskRef = db.collection('tasks').doc();
          batch.set(taskRef, {
            title: titulo,
            tag: tag,
            clientId: clientIdSelecionado,
            clientName: clientNameSelecionado,
            column: 'todo', // Aterrisa no "A Fazer"
            due: dataVencimento,
            checklist: [],
            authorId: currentUser?.uid || '',
            authorName: currentUser?.name || '',
            authorInitials: currentUser?.initials || 'US',
            authorColor: currentUser?.color || '#3a4060',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          importadas++;
        });

        if (importadas > 0) {
          await batch.commit();
          let msg = `✅ Sucesso! ${importadas} tarefas foram importadas.`;
          if (clientesNaoEncontrados > 0) {
            msg += `\n⚠️ Obs: ${clientesNaoEncontrados} tarefas não vincularam perfeitamente ao cliente do sistema, mas foram criadas mesmo assim.`;
          }
          alert(msg);
        }

      } catch (error) {
        console.error(error);
        alert('❌ Erro ao ler a planilha: ' + error.message);
      } finally {
        event.target.value = ''; // Limpa pra permitir importar a mesma de novo
        if (btn) {
          btn.innerHTML = textoOriginal;
          btn.disabled = false;
        }
      }
    };

    reader.readAsArrayBuffer(file);

  } catch (error) {
    alert("Erro interno: " + error.message);
    event.target.value = '';
    if (btn) {
      btn.innerHTML = textoOriginal;
      btn.disabled = false;
    }
  }
}

async function populateEditTaskClients(currentClientId = '') {
  const select = document.getElementById('edit-task-client');
  if (!select || !currentUser?.tenantId) return;

  select.innerHTML = '<option value="">Sem cliente selecionado</option>';

  try {
    const snap = await db.collection('clients')
      .where('tenantId', '==', currentUser.tenantId)
      .get();

    snap.forEach(doc => {
      const c = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = c.razao || c.nome || 'Cliente';

      // Pré-seleciona o cliente que já estava salvo na tarefa
      if (doc.id === currentClientId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
  }
}
