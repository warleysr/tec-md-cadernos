// Estado global da aplicação
const state = {
  cadernos: [],
  activeCaderno: null,
  filteredQuestions: [],
  currentIndex: 0,
  selectedOption: null,
  questionStartTime: Date.now(),
  filterMode: 'all',
  activeTab: 'questao'
};

// Elementos DOM
const el = {
  viewHome: document.getElementById('viewHome'),
  viewSolver: document.getElementById('viewSolver'),
  cadernosGrid: document.getElementById('cadernosGrid'),
  headerBreadcrumb: document.getElementById('headerBreadcrumb'),
  headerStats: document.getElementById('headerStats'),
  statTotal: document.getElementById('statTotal'),
  statResolvidas: document.getElementById('statResolvidas'),
  statAcertos: document.getElementById('statAcertos'),
  statErros: document.getElementById('statErros'),
  statTaxa: document.getElementById('statTaxa'),
  qCurrentIndex: document.getElementById('qCurrentIndex'),
  qTotalCount: document.getElementById('qTotalCount'),
  qTecIdBadge: document.getElementById('qTecIdBadge'),
  filterMode: document.getElementById('filterMode'),
  qBanca: document.getElementById('qBanca'),
  qMateria: document.getElementById('qMateria'),
  qStatusBadge: document.getElementById('qStatusBadge'),
  btnToggleRemove: document.getElementById('btnToggleRemove'),
  qEnunciado: document.getElementById('qEnunciado'),
  qAlternativas: document.getElementById('qAlternativas'),
  btnResponder: document.getElementById('btnResponder'),
  qFeedback: document.getElementById('qFeedback'),
  qInfoContent: document.getElementById('qInfoContent'),
  qNoteInput: document.getElementById('qNoteInput'),
  noteSavedMsg: document.getElementById('noteSavedMsg'),
  questionIndexGrid: document.getElementById('questionIndexGrid'),
  sidebarProgressText: document.getElementById('sidebarProgressText'),
  barCorrect: document.getElementById('barCorrect'),
  barWrong: document.getElementById('barWrong')
};

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 2800);
}

// Renderizador simples e seguro de Markdown (tabelas, code blocks, imagens base64, parágrafos)
function renderMarkdown(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let inCode = false;
  let codeLines = [];
  let inTable = false;
  let tableRows = [];

  const escapeHtml = (str) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const formatInline = (str) => {
    let s = escapeHtml(str);
    // Imagens ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Bold **...**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Inline code `...`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  };

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) return;
    html += '<table>';
    tableRows.forEach((row, idx) => {
      const cells = row
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (idx === 1 && cells.every((c) => /^[-:]+$/.test(c))) {
        return; // separator row
      }
      const tag = idx === 0 ? 'th' : 'td';
      html += '<tr>' + cells.map((c) => `<${tag}>${formatInline(c)}</${tag}>`).join('') + '</tr>';
    });
    html += '</table>';
    inTable = false;
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushTable();
      if (!inCode) {
        inCode = true;
        codeLines = [];
      } else {
        html += `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.includes('|')) {
      inTable = true;
      tableRows.push(trimmed);
      continue;
    } else {
      flushTable();
    }

    if (!trimmed) continue;

    if (trimmed.startsWith('![')) {
      html += formatInline(trimmed);
    } else {
      html += `<p>${formatInline(trimmed)}</p>`;
    }
  }
  flushTable();
  if (inCode) {
    html += `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
  }
  return html;
}

// API Calls
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

async function loadCadernos() {
  state.cadernos = await api('/api/cadernos');
  renderHome();
}

function renderHome() {
  el.viewHome.style.display = 'block';
  el.viewSolver.style.display = 'none';
  el.headerStats.style.display = 'none';
  el.headerBreadcrumb.innerHTML = '<span>Selecione ou importe um caderno</span>';

  if (state.cadernos.length === 0) {
    el.cadernosGrid.innerHTML = `
      <div class="caderno-card" style="grid-column: 1 / -1; text-align:center; padding:40px;">
        <h3>Nenhum caderno importado ainda</h3>
        <p style="color:var(--tec-muted);">Clique em "+ Importar Caderno (.md)" para começar.</p>
      </div>
    `;
    return;
  }

  el.cadernosGrid.innerHTML = state.cadernos
    .map((c) => {
      const s = c.stats;
      return `
        <div class="caderno-card">
          <div>
            <div class="caderno-card-title">${c.title}</div>
            <div class="caderno-card-meta">${c.filename} ${c.ordenacao ? '• ' + c.ordenacao : ''}</div>
          </div>
          <div class="caderno-stats-row">
            <div class="caderno-stat-item"><span>Questões</span><strong>${s.total}</strong></div>
            <div class="caderno-stat-item"><span>Resolvidas</span><strong>${s.resolvidas}</strong></div>
            <div class="caderno-stat-item"><span>Acertos</span><strong style="color:var(--tec-green)">${s.acertos}</strong></div>
            <div class="caderno-stat-item"><span>Taxa</span><strong style="color:var(--tec-blue)">${s.taxaAcerto}%</strong></div>
          </div>
          <div class="caderno-card-actions">
            <button class="btn-primary" style="flex:1" onclick="openCaderno('${c.id}')">Resolver Caderno</button>
            <button class="btn-secondary" onclick="resetCaderno('${c.id}')" title="Zerar estatísticas deste caderno">Zerar</button>
            <button class="btn-danger-outline" onclick="deleteCaderno('${c.id}')" title="Excluir caderno">Excluir</button>
          </div>
        </div>
      `;
    })
    .join('');
}

window.openCaderno = async function (id) {
  const caderno = await api(`/api/cadernos/${id}`);
  state.activeCaderno = caderno;
  state.filterMode = 'all';
  el.filterMode.value = 'all';
  applyFilterAndIndex(0);

  el.viewHome.style.display = 'none';
  el.viewSolver.style.display = 'block';
  el.headerStats.style.display = 'flex';
  el.headerBreadcrumb.innerHTML = `<span>${caderno.title}</span>`;
  updateHeaderStats(caderno.stats);
};

window.resetCaderno = async function (id) {
  if (!confirm('Deseja zerar todas as resoluções e estatísticas deste caderno?')) return;
  await api(`/api/cadernos/${id}/reset`, { method: 'POST' });
  showToast('Estatísticas zeradas.');
  loadCadernos();
};

window.deleteCaderno = async function (id) {
  if (!confirm('Deseja excluir permanentemente este caderno?')) return;
  await api(`/api/cadernos/${id}`, { method: 'DELETE' });
  showToast('Caderno excluído.');
  loadCadernos();
};

function updateHeaderStats(stats) {
  el.statTotal.textContent = stats.ativas;
  el.statResolvidas.textContent = stats.resolvidas;
  el.statAcertos.textContent = stats.acertos;
  el.statErros.textContent = stats.erros;
  el.statTaxa.textContent = `${stats.taxaAcerto}%`;

  el.sidebarProgressText.textContent = `${stats.resolvidas}/${stats.ativas}`;
  const pctCorrect = stats.ativas > 0 ? (stats.acertos / stats.ativas) * 100 : 0;
  const pctWrong = stats.ativas > 0 ? (stats.erros / stats.ativas) * 100 : 0;
  el.barCorrect.style.width = `${pctCorrect}%`;
  el.barWrong.style.width = `${pctWrong}%`;
}

function applyFilterAndIndex(targetIndex = 0) {
  const c = state.activeCaderno;
  if (!c) return;
  const mode = state.filterMode;

  state.filteredQuestions = c.questions.filter((q) => {
    const st = c.progress[q.id] || {};
    if (mode === 'removed') return !!st.removed;
    if (st.removed) return false;
    if (mode === 'unsolved') return !st.answered;
    if (mode === 'wrong') return st.answered && !st.correta;
    if (mode === 'correct') return st.answered && st.correta;
    return true;
  });

  if (state.filteredQuestions.length === 0) {
    state.currentIndex = 0;
  } else {
    state.currentIndex = Math.max(0, Math.min(targetIndex, state.filteredQuestions.length - 1));
  }
  renderCurrentQuestion();
  renderSidebarIndex();
}

function getCurrentQuestion() {
  return state.filteredQuestions[state.currentIndex] || null;
}

function renderCurrentQuestion() {
  const q = getCurrentQuestion();
  const c = state.activeCaderno;
  state.questionStartTime = Date.now();

  el.qTotalCount.textContent = state.filteredQuestions.length;

  if (!q) {
    el.qCurrentIndex.textContent = '0';
    el.qTecIdBadge.textContent = '';
    el.qBanca.textContent = 'Nenhuma questão neste filtro';
    el.qMateria.textContent = '';
    el.qEnunciado.innerHTML = '<p>Altere o filtro acima para visualizar questões.</p>';
    el.qAlternativas.innerHTML = '';
    el.qFeedback.className = 'q-feedback';
    el.btnResponder.disabled = true;
    return;
  }

  const st = c.progress[q.id] || {};
  state.selectedOption = st.selected || null;

  el.qCurrentIndex.textContent = state.currentIndex + 1;
  el.qTecIdBadge.textContent = q.tecId ? `#${q.tecId}` : '';
  el.qBanca.textContent = q.bancaRaw || q.banca;
  el.qMateria.textContent = q.materiaRaw || q.materia;

  // Status badge
  if (st.removed) {
    el.qStatusBadge.textContent = 'Removida';
    el.qStatusBadge.className = 'q-status-badge removed';
    el.btnToggleRemove.innerHTML = 'Restaurar <kbd>R</kbd>';
  } else if (st.answered) {
    el.qStatusBadge.textContent = st.correta ? 'Acertou' : 'Errou';
    el.qStatusBadge.className = `q-status-badge ${st.correta ? 'correct' : 'wrong'}`;
    el.btnToggleRemove.innerHTML = 'Remover <kbd>R</kbd>';
  } else {
    el.qStatusBadge.textContent = 'Não resolvida';
    el.qStatusBadge.className = 'q-status-badge';
    el.btnToggleRemove.innerHTML = 'Remover <kbd>R</kbd>';
  }

  // Enunciado
  el.qEnunciado.innerHTML = `<p><strong>${q.numero})</strong></p>` + renderMarkdown(q.enunciadoMd);

  // Alternativas
  const eliminated = new Set(st.eliminated || []);
  el.qAlternativas.innerHTML = q.alternativas
    .map((alt, idx) => {
      const isSelected = state.selectedOption && state.selectedOption.toLowerCase() === alt.letter.toLowerCase();
      const isElim = eliminated.has(alt.letter);
      let resultClass = '';
      if (st.answered) {
        if (q.gabarito && alt.letter.toLowerCase() === q.gabarito.toLowerCase()) {
          resultClass = 'is-correct';
        } else if (isSelected && !st.correta) {
          resultClass = 'is-wrong';
        }
      }
      const keyHint = q.tipo === 'CE' ? (alt.letter === 'Certo' ? 'C' : 'E') : `${alt.letter} / ${idx + 1}`;
      return `
        <div class="alt-item ${isSelected ? 'selected' : ''} ${isElim ? 'eliminated' : ''} ${resultClass}"
             data-letter="${alt.letter}"
             onclick="selectOption('${alt.letter}')">
          <div class="alt-badge">${q.tipo === 'CE' ? alt.letter[0] : alt.letter}</div>
          <div class="alt-text">${alt.text}</div>
          <button class="alt-eliminate-btn" title="Riscar/Eliminar alternativa (${keyHint} 2x)"
                  onclick="event.stopPropagation(); toggleEliminate('${alt.letter}')">
            ✂
          </button>
        </div>
      `;
    })
    .join('');

  el.btnResponder.disabled = false;

  // Feedback
  if (st.answered) {
    el.qFeedback.className = `q-feedback ${st.correta ? 'correct' : 'wrong'}`;
    el.qFeedback.textContent = st.correta
      ? `Parabéns! Você acertou. Gabarito: ${q.gabarito}`
      : `Você errou! Gabarito oficial: ${q.gabarito}`;
  } else {
    el.qFeedback.className = 'q-feedback';
    el.qFeedback.textContent = '';
  }

  // Info panel
  el.qInfoContent.innerHTML = `
    <div class="info-label">ID TEC</div><div>${q.tecId || '-'}</div>
    <div class="info-label">Banca / Concurso</div><div>${q.bancaRaw || '-'}</div>
    <div class="info-label">Matéria / Assunto</div><div>${q.materiaRaw || '-'}</div>
    <div class="info-label">Tipo</div><div>${q.tipo === 'CE' ? 'Certo ou Errado' : 'Múltipla Escolha'}</div>
    <div class="info-label">Gabarito</div><div>${st.answered ? q.gabarito : '<em>Responda para revelar</em>'}</div>
    <div class="info-label">Tentativas</div><div>${st.attempts || 0}</div>
    ${q.url ? `<div class="info-label">Link original</div><div><a href="${q.url}" target="_blank" rel="noopener">${q.url}</a></div>` : ''}
  `;

  // Notes
  el.qNoteInput.value = st.note || '';
  el.noteSavedMsg.textContent = '';

  // Highlight active in sidebar
  document.querySelectorAll('.q-idx-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === state.currentIndex);
  });
}

function renderSidebarIndex() {
  const c = state.activeCaderno;
  if (!c) return;
  el.questionIndexGrid.innerHTML = state.filteredQuestions
    .map((q, idx) => {
      const st = c.progress[q.id] || {};
      let cls = 'q-idx-btn';
      if (idx === state.currentIndex) cls += ' active';
      if (st.removed) cls += ' removed';
      else if (st.answered) cls += st.correta ? ' correct' : ' wrong';
      return `<button class="${cls}" onclick="jumpToIndex(${idx})">${q.numero}</button>`;
    })
    .join('');
}

window.jumpToIndex = function (idx) {
  state.currentIndex = idx;
  renderCurrentQuestion();
};

window.selectOption = function (letter) {
  state.selectedOption = letter;
  document.querySelectorAll('.alt-item').forEach((node) => {
    node.classList.toggle('selected', node.dataset.letter.toLowerCase() === letter.toLowerCase());
  });
};

window.toggleEliminate = async function (letter) {
  const q = getCurrentQuestion();
  const c = state.activeCaderno;
  if (!q || !c) return;
  const st = c.progress[q.id] || {};
  const set = new Set(st.eliminated || []);
  if (set.has(letter)) set.delete(letter);
  else set.add(letter);

  const res = await api(`/api/cadernos/${c.id}/question/${q.id}/state`, {
    method: 'POST',
    body: JSON.stringify({ eliminated: Array.from(set) })
  });
  c.progress[q.id] = res.questionState;
  renderCurrentQuestion();
};

async function submitAnswer() {
  const q = getCurrentQuestion();
  const c = state.activeCaderno;
  if (!q || !c) return;
  if (!state.selectedOption) {
    showToast('Selecione uma alternativa antes de responder.');
    return;
  }

  const timeSpentMs = Date.now() - state.questionStartTime;
  const res = await api(`/api/cadernos/${c.id}/answer`, {
    method: 'POST',
    body: JSON.stringify({
      questionId: q.id,
      selected: state.selectedOption,
      timeSpentMs
    })
  });

  c.progress[q.id] = res.questionState;
  updateHeaderStats(res.stats);
  renderCurrentQuestion();
  renderSidebarIndex();
}

// Navegação TEC Concursos: Aleatória não resolvida (L) & Próxima não resolvida (N)
function goRandomUnsolved() {
  const c = state.activeCaderno;
  if (!c) return;
  const currentQ = getCurrentQuestion();

  const unsolvedIndices = [];
  state.filteredQuestions.forEach((q, idx) => {
    const st = c.progress[q.id] || {};
    if (!st.answered && !st.removed) {
      unsolvedIndices.push(idx);
    }
  });

  if (unsolvedIndices.length === 0) {
    showToast('Todas as questões ativas deste filtro já foram resolvidas!');
    return;
  }

  let pool = unsolvedIndices;
  if (unsolvedIndices.length > 1 && currentQ) {
    pool = unsolvedIndices.filter((idx) => state.filteredQuestions[idx].id !== currentQ.id);
  }
  const picked = pool[Math.floor(Math.random() * pool.length)];
  state.currentIndex = picked;
  renderCurrentQuestion();
}

function goNextUnsolved() {
  const c = state.activeCaderno;
  if (!c || state.filteredQuestions.length === 0) return;

  const total = state.filteredQuestions.length;
  for (let offset = 1; offset <= total; offset++) {
    const idx = (state.currentIndex + offset) % total;
    const q = state.filteredQuestions[idx];
    const st = c.progress[q.id] || {};
    if (!st.answered && !st.removed) {
      state.currentIndex = idx;
      renderCurrentQuestion();
      return;
    }
  }
  showToast('Não há mais questões não resolvidas neste filtro!');
}

function goPrev() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderCurrentQuestion();
  }
}

function goNext() {
  if (state.currentIndex < state.filteredQuestions.length - 1) {
    state.currentIndex++;
    renderCurrentQuestion();
  }
}

async function toggleRemoveCurrent() {
  const q = getCurrentQuestion();
  const c = state.activeCaderno;
  if (!q || !c) return;
  const st = c.progress[q.id] || {};
  const nextRemoved = !st.removed;

  const res = await api(`/api/cadernos/${c.id}/question/${q.id}/state`, {
    method: 'POST',
    body: JSON.stringify({ removed: nextRemoved })
  });
  c.progress[q.id] = res.questionState;
  updateHeaderStats(res.stats);
  showToast(nextRemoved ? 'Questão removida do caderno.' : 'Questão restaurada ao caderno.');
  applyFilterAndIndex(state.currentIndex);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.q-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.getElementById('panelQuestao').style.display = tabName === 'questao' ? 'block' : 'none';
  document.getElementById('panelInfo').style.display = tabName === 'info' ? 'block' : 'none';
  document.getElementById('panelAnotacao').style.display = tabName === 'anotacao' ? 'block' : 'none';
}

// Modais
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach((m) => (m.style.display = 'none'));
}

async function openImportModal() {
  openModal('modalImport');
  const listEl = document.getElementById('workspaceMdsList');
  listEl.innerHTML = '<span>Buscando arquivos .md no workspace...</span>';
  try {
    const files = await api('/api/workspace-mds');
    const section = document.getElementById('workspaceMdsSection');
    if (files.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    listEl.innerHTML = files
      .map(
        (f) => `
        <div class="ws-md-item">
          <span>${f.relativePath} (${Math.round(f.sizeBytes / 1024)} KB)</span>
          <button class="btn-secondary" onclick="importWorkspaceMd('${f.relativePath.replace(/\\/g, '\\\\')}')">Importar</button>
        </div>
      `
      )
      .join('');
  } catch (err) {
    document.getElementById('workspaceMdsSection').style.display = 'none';
  }
}

window.importWorkspaceMd = async function (relativePath) {
  try {
    const res = await api('/api/cadernos/import-workspace', {
      method: 'POST',
      body: JSON.stringify({ relativePath })
    });
    closeModal('modalImport');
    showToast(`Importado: ${res.title} (${res.stats.total} questões)`);
    await loadCadernos();
    openCaderno(res.id);
  } catch (err) {
    showToast('Erro: ' + err.message);
  }
};

async function handleMdFilesUpload(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  const titleInput = document.getElementById('importTitleInput');
  const customTitle = files.length === 1 ? titleInput.value.trim() : '';

  let importedCount = 0;
  let lastId = null;

  for (const file of files) {
    try {
      const content = await file.text();
      const res = await api('/api/cadernos/import', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, content, title: customTitle || undefined })
      });
      importedCount++;
      lastId = res.id;
    } catch (err) {
      showToast(`Erro em ${file.name}: ${err.message}`);
    }
  }

  if (importedCount > 0) {
    closeModal('modalImport');
    titleInput.value = '';
    document.getElementById('mdFileInput').value = '';
    showToast(
      importedCount === 1
        ? 'Caderno importado com sucesso!'
        : `${importedCount} cadernos importados com sucesso!`
    );
    await loadCadernos();
    if (files.length === 1 && lastId) openCaderno(lastId);
  }
}

async function handlePasteImport() {
  const pasteEl = document.getElementById('importPasteInput');
  const titleEl = document.getElementById('importTitleInput');
  const content = pasteEl.value.trim();
  if (!content) {
    showToast('Cole o conteúdo Markdown antes de importar.');
    return;
  }
  const title = titleEl.value.trim() || 'Caderno Colado';
  try {
    const res = await api('/api/cadernos/import', {
      method: 'POST',
      body: JSON.stringify({ filename: `${title}.md`, content, title })
    });
    closeModal('modalImport');
    pasteEl.value = '';
    titleEl.value = '';
    showToast(`Importado: ${res.title} (${res.stats.total} questões)`);
    await loadCadernos();
    openCaderno(res.id);
  } catch (err) {
    showToast('Erro ao importar: ' + err.message);
  }
}

async function openStatsModal(period = 'total') {
  openModal('modalStats');
  const body = document.getElementById('statsModalBody');
  body.innerHTML = '<p>Carregando estatísticas...</p>';
  const data = await api(`/api/stats/global?period=${period}`);

  const periodLabels = {
    day: 'Resolvidas Hoje',
    week: 'Resolvidas na Semana',
    total: 'Resolvidas (Total)'
  };

  const timelineSection =
    period !== 'total'
      ? `
    <h3>${period === 'day' ? 'Histórico por Dia' : 'Histórico por Semana'}</h3>
    <table class="stats-table">
      <thead><tr><th>${period === 'day' ? 'Dia' : 'Semana'}</th><th>Resolvidas</th><th>Acertos</th><th>Erros</th><th>Taxa</th></tr></thead>
      <tbody>
        ${
          data.timeline.length > 0
            ? data.timeline
                .map(
                  (t) =>
                    `<tr><td>${t.label}</td><td>${t.total}</td><td style="color:var(--tec-green)">${t.acertos}</td><td style="color:var(--tec-red)">${t.erros}</td><td><strong>${t.taxa}%</strong></td></tr>`
                )
                .join('')
            : '<tr><td colspan="5">Nenhuma resolução registrada ainda.</td></tr>'
        }
      </tbody>
    </table>`
      : '';

  const materiaRows = Object.entries(data.byMateria)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([mat, s]) => {
      const pct = s.total > 0 ? Math.round((s.acertos / s.total) * 1000) / 10 : 0;
      return `<tr><td>${mat}</td><td>${s.total}</td><td style="color:var(--tec-green)">${s.acertos}</td><td style="color:var(--tec-red)">${s.erros}</td><td><strong>${pct}%</strong></td></tr>`;
    })
    .join('');

  const bancaRows = Object.entries(data.byBanca)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([ban, s]) => {
      const pct = s.total > 0 ? Math.round((s.acertos / s.total) * 1000) / 10 : 0;
      return `<tr><td>${ban}</td><td>${s.total}</td><td style="color:var(--tec-green)">${s.acertos}</td><td style="color:var(--tec-red)">${s.erros}</td><td><strong>${pct}%</strong></td></tr>`;
    })
    .join('');

  body.innerHTML = `
    <div class="stats-period-tabs">
      <button class="stats-period-btn ${period === 'day' ? 'active' : ''}" onclick="openStatsModal('day')">Por Dia</button>
      <button class="stats-period-btn ${period === 'week' ? 'active' : ''}" onclick="openStatsModal('week')">Por Semana</button>
      <button class="stats-period-btn ${period === 'total' ? 'active' : ''}" onclick="openStatsModal('total')">Total</button>
    </div>

    <div class="stats-summary-cards">
      <div class="stats-card"><span>Cadernos</span><strong>${data.totalCadernos}</strong></div>
      <div class="stats-card"><span>${periodLabels[period]}</span><strong>${data.totalResolvidas}</strong></div>
      <div class="stats-card"><span>Acertos / Erros</span><strong><span style="color:var(--tec-green)">${data.totalAcertos}</span> / <span style="color:var(--tec-red)">${data.totalErros}</span></strong></div>
      <div class="stats-card"><span>Aproveitamento</span><strong style="color:var(--tec-blue)">${data.taxaAcerto}%</strong></div>
    </div>

    ${timelineSection}

    <h3>Desempenho por Matéria</h3>
    <table class="stats-table">
      <thead><tr><th>Matéria</th><th>Resolvidas</th><th>Acertos</th><th>Erros</th><th>Taxa</th></tr></thead>
      <tbody>${materiaRows || '<tr><td colspan="5">Nenhuma questão resolvida neste período.</td></tr>'}</tbody>
    </table>

    <h3>Desempenho por Banca</h3>
    <table class="stats-table">
      <thead><tr><th>Banca</th><th>Resolvidas</th><th>Acertos</th><th>Erros</th><th>Taxa</th></tr></thead>
      <tbody>${bancaRows || '<tr><td colspan="5">Nenhuma questão resolvida neste período.</td></tr>'}</tbody>
    </table>
  `;
}
window.openStatsModal = openStatsModal;

// Event Listeners
document.getElementById('btnHome').addEventListener('click', loadCadernos);
document.getElementById('btnBackHome').addEventListener('click', loadCadernos);
document.getElementById('btnImportOpen').addEventListener('click', openImportModal);
document.getElementById('btnHomeImport').addEventListener('click', openImportModal);
document.getElementById('btnStatsOpen').addEventListener('click', () => openStatsModal('total'));
document.getElementById('btnShortcutsOpen').addEventListener('click', () => openModal('modalShortcuts'));

document.getElementById('btnPrevQ').addEventListener('click', goPrev);
document.getElementById('btnNextQ').addEventListener('click', goNext);
document.getElementById('btnNextUnsolved').addEventListener('click', goNextUnsolved);
document.getElementById('btnRandomUnsolved').addEventListener('click', goRandomUnsolved);
document.getElementById('btnJumpQ').addEventListener('click', () => {
  document.getElementById('jumpMax').textContent = state.filteredQuestions.length;
  document.getElementById('jumpInput').value = '';
  openModal('modalJump');
  setTimeout(() => document.getElementById('jumpInput').focus(), 50);
});

document.getElementById('jumpForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const val = parseInt(document.getElementById('jumpInput').value, 10);
  if (val >= 1 && val <= state.filteredQuestions.length) {
    state.currentIndex = val - 1;
    renderCurrentQuestion();
    closeModal('modalJump');
  } else {
    showToast('Número de questão inválido.');
  }
});

document.getElementById('filterMode').addEventListener('change', (e) => {
  state.filterMode = e.target.value;
  applyFilterAndIndex(0);
});

document.getElementById('btnResponder').addEventListener('click', submitAnswer);
document.getElementById('btnToggleRemove').addEventListener('click', toggleRemoveCurrent);

document.querySelectorAll('.q-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.getElementById('btnSaveNote').addEventListener('click', async () => {
  const q = getCurrentQuestion();
  const c = state.activeCaderno;
  if (!q || !c) return;
  const note = el.qNoteInput.value;
  const res = await api(`/api/cadernos/${c.id}/question/${q.id}/state`, {
    method: 'POST',
    body: JSON.stringify({ note })
  });
  c.progress[q.id] = res.questionState;
  el.noteSavedMsg.textContent = 'Anotação salva!';
});

// Close modal buttons
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach((bd) => {
  bd.addEventListener('click', (e) => {
    if (e.target === bd) bd.style.display = 'none';
  });
});

// File upload, paste & drag-drop
document.getElementById('mdFileInput').addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleMdFilesUpload(e.target.files);
});
document.getElementById('btnImportPaste').addEventListener('click', handlePasteImport);
const dropzone = document.getElementById('mdDropzone');
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleMdFilesUpload(e.dataTransfer.files);
});

// Atalhos de teclado padrão TEC Concursos
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
    return;
  }

  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === '?') {
    e.preventDefault();
    openModal('modalShortcuts');
    return;
  }

  // Atalhos funcionam na tela do solver
  if (el.viewSolver.style.display === 'none') return;

  const key = e.key.toLowerCase();

  if (key === 'l') {
    e.preventDefault();
    goRandomUnsolved();
  } else if (key === 'n') {
    e.preventDefault();
    goNextUnsolved();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    goNext();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goPrev();
  } else if (key === 'p') {
    e.preventDefault();
    document.getElementById('btnJumpQ').click();
  } else if (key === 'i') {
    e.preventDefault();
    switchTab(state.activeTab === 'info' ? 'questao' : 'info');
  } else if (key === 'o') {
    e.preventDefault();
    switchTab(state.activeTab === 'anotacao' ? 'questao' : 'anotacao');
  } else if (key === 'r') {
    e.preventDefault();
    toggleRemoveCurrent();
  } else if (e.key === 'Enter') {
    if (state.activeTab === 'questao') {
      e.preventDefault();
      submitAnswer();
    }
  } else {
    // Seleção / Eliminação de alternativas
    const q = getCurrentQuestion();
    if (!q) return;

    let targetLetter = null;
    if (q.tipo === 'CE') {
      if (key === 'c') targetLetter = 'Certo';
      else if (key === 'e') targetLetter = 'Errado';
    } else {
      const map = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' };
      targetLetter = map[key] || null;
    }

    if (targetLetter && q.alternativas.some((a) => a.letter.toLowerCase() === targetLetter.toLowerCase())) {
      e.preventDefault();
      if (state.selectedOption && state.selectedOption.toLowerCase() === targetLetter.toLowerCase()) {
        // Pressionar 2x a mesma tecla risca/elimina a alternativa (padrão TEC Concursos)
        toggleEliminate(targetLetter);
      } else {
        selectOption(targetLetter);
      }
    }
  }
});

// Inicialização
loadCadernos();
