const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseMarkdownCaderno } = require('./parser');

const app = express();
const PORT = process.env.PORT || 3456;

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initialDb = { cadernos: {}, history: [] };
    // Auto-import sample MD if present
    const samplePath = path.join(WORKSPACE_ROOT, 'teste_docling', 'Caderno banco de dados pt1.md');
    if (fs.existsSync(samplePath)) {
      try {
        const content = fs.readFileSync(samplePath, 'utf8');
        const parsed = parseMarkdownCaderno(content, 'Caderno banco de dados pt1');
        if (parsed.questions.length > 0) {
          const id = 'caderno_' + crypto.createHash('md5').update(samplePath).digest('hex').slice(0, 8);
          initialDb.cadernos[id] = {
            id,
            title: parsed.title || 'Caderno banco de dados pt1',
            filename: 'Caderno banco de dados pt1.md',
            sourceUrl: parsed.sourceUrl,
            ordenacao: parsed.ordenacao,
            importedAt: new Date().toISOString(),
            questions: parsed.questions,
            progress: {} // qid -> { answered, selected, correta, attempts, eliminated, removed, note, updatedAt }
          };
        }
      } catch (err) {
        console.error('Erro ao auto-importar exemplo:', err.message);
      }
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function computeCadernoStats(caderno) {
  const total = caderno.questions.length;
  let resolvidas = 0;
  let acertos = 0;
  let erros = 0;
  let removidas = 0;

  for (const q of caderno.questions) {
    const st = caderno.progress[q.id];
    if (st && st.removed) removidas++;
    if (st && st.answered) {
      resolvidas++;
      if (st.correta) acertos++;
      else erros++;
    }
  }

  const ativas = total - removidas;
  const naoResolvidas = caderno.questions.filter(q => {
    const st = caderno.progress[q.id];
    return !(st && st.removed) && !(st && st.answered);
  }).length;

  const taxaAcerto = resolvidas > 0 ? Math.round((acertos / resolvidas) * 1000) / 10 : 0;

  return {
    total,
    ativas,
    resolvidas,
    naoResolvidas,
    acertos,
    erros,
    removidas,
    taxaAcerto
  };
}

// List cadernos
app.get('/api/cadernos', (req, res) => {
  const db = readDb();
  const list = Object.values(db.cadernos).map(c => ({
    id: c.id,
    title: c.title,
    filename: c.filename,
    sourceUrl: c.sourceUrl,
    ordenacao: c.ordenacao,
    importedAt: c.importedAt,
    stats: computeCadernoStats(c)
  }));
  list.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
  res.json(list);
});

// Get full caderno
app.get('/api/cadernos/:id', (req, res) => {
  const db = readDb();
  const c = db.cadernos[req.params.id];
  if (!c) return res.status(404).json({ error: 'Caderno não encontrado' });
  res.json({
    id: c.id,
    title: c.title,
    filename: c.filename,
    sourceUrl: c.sourceUrl,
    ordenacao: c.ordenacao,
    importedAt: c.importedAt,
    questions: c.questions,
    progress: c.progress,
    stats: computeCadernoStats(c)
  });
});

// Import MD from upload
app.post('/api/cadernos/import', (req, res) => {
  const { filename, content, title } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Conteúdo Markdown inválido.' });
  }
  const parsed = parseMarkdownCaderno(content, title || filename || 'Caderno MD');
  if (!parsed.questions || parsed.questions.length === 0) {
    return res.status(400).json({ error: 'Nenhuma questão encontrada neste arquivo MD.' });
  }

  const db = readDb();
  const id = 'caderno_' + crypto.randomBytes(4).toString('hex');
  db.cadernos[id] = {
    id,
    title: title || parsed.title || filename || 'Caderno MD',
    filename: filename || 'caderno.md',
    sourceUrl: parsed.sourceUrl,
    ordenacao: parsed.ordenacao,
    importedAt: new Date().toISOString(),
    questions: parsed.questions,
    progress: {}
  };
  writeDb(db);

  res.json({
    id,
    title: db.cadernos[id].title,
    stats: computeCadernoStats(db.cadernos[id])
  });
});

// List workspace .md files
app.get('/api/workspace-mds', (req, res) => {
  const results = [];
  function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'tec-cadernos-app' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        const stat = fs.statSync(full);
        results.push({
          name: entry.name,
          relativePath: path.relative(WORKSPACE_ROOT, full),
          sizeBytes: stat.size
        });
      }
    }
  }
  walk(WORKSPACE_ROOT);
  res.json(results);
});

// Import workspace .md file
app.post('/api/cadernos/import-workspace', (req, res) => {
  const { relativePath } = req.body;
  if (!relativePath) return res.status(400).json({ error: 'Caminho não informado.' });
  const target = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!target.startsWith(WORKSPACE_ROOT) || !fs.existsSync(target)) {
    return res.status(404).json({ error: 'Arquivo não encontrado no workspace.' });
  }
  const content = fs.readFileSync(target, 'utf8');
  const filename = path.basename(target);
  const parsed = parseMarkdownCaderno(content, filename);
  if (!parsed.questions.length) {
    return res.status(400).json({ error: 'Nenhuma questão encontrada neste arquivo MD.' });
  }
  const db = readDb();
  const id = 'caderno_' + crypto.randomBytes(4).toString('hex');
  db.cadernos[id] = {
    id,
    title: parsed.title || filename.replace(/\.md$/i, ''),
    filename,
    sourceUrl: parsed.sourceUrl,
    ordenacao: parsed.ordenacao,
    importedAt: new Date().toISOString(),
    questions: parsed.questions,
    progress: {}
  };
  writeDb(db);
  res.json({ id, title: db.cadernos[id].title, stats: computeCadernoStats(db.cadernos[id]) });
});

// Delete caderno
app.delete('/api/cadernos/:id', (req, res) => {
  const db = readDb();
  if (!db.cadernos[req.params.id]) {
    return res.status(404).json({ error: 'Caderno não encontrado' });
  }
  delete db.cadernos[req.params.id];
  writeDb(db);
  res.json({ ok: true });
});

// Record answer
app.post('/api/cadernos/:id/answer', (req, res) => {
  const { questionId, selected, timeSpentMs } = req.body;
  const db = readDb();
  const caderno = db.cadernos[req.params.id];
  if (!caderno) return res.status(404).json({ error: 'Caderno não encontrado' });

  const question = caderno.questions.find(q => q.id === questionId);
  if (!question) return res.status(404).json({ error: 'Questão não encontrada' });

  const correta =
    question.gabarito &&
    selected &&
    question.gabarito.toLowerCase() === selected.toLowerCase();

  const prev = caderno.progress[questionId] || {};
  const attempts = (prev.attempts || 0) + 1;

  caderno.progress[questionId] = {
    ...prev,
    answered: true,
    selected,
    correta,
    attempts,
    timeSpentMs: (prev.timeSpentMs || 0) + (timeSpentMs || 0),
    updatedAt: new Date().toISOString()
  };

  db.history.unshift({
    cadernoId: caderno.id,
    cadernoTitle: caderno.title,
    questionId: question.id,
    numero: question.numero,
    materia: question.materia,
    banca: question.banca,
    selected,
    gabarito: question.gabarito,
    correta,
    timestamp: new Date().toISOString()
  });
  if (db.history.length > 50000) db.history.length = 50000;

  writeDb(db);

  res.json({
    questionState: caderno.progress[questionId],
    gabarito: question.gabarito,
    stats: computeCadernoStats(caderno)
  });
});

// Update question state (eliminated, removed, note, flagged)
app.post('/api/cadernos/:id/question/:qid/state', (req, res) => {
  const db = readDb();
  const caderno = db.cadernos[req.params.id];
  if (!caderno) return res.status(404).json({ error: 'Caderno não encontrado' });

  const prev = caderno.progress[req.params.qid] || {};
  const allowed = ['eliminated', 'removed', 'note', 'flagged'];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }

  caderno.progress[req.params.qid] = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  writeDb(db);

  res.json({
    questionState: caderno.progress[req.params.qid],
    stats: computeCadernoStats(caderno)
  });
});

// Reset caderno stats
app.post('/api/cadernos/:id/reset', (req, res) => {
  const db = readDb();
  const caderno = db.cadernos[req.params.id];
  if (!caderno) return res.status(404).json({ error: 'Caderno não encontrado' });
  caderno.progress = {};
  writeDb(db);
  res.json({ ok: true, stats: computeCadernoStats(caderno) });
});

function toLocalDateKey(dateInput) {
  const d = new Date(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekStart(dateInput) {
  const d = new Date(dateInput);
  const day = d.getDay(); // 0=Dom .. 6=Sab
  const diff = (day === 0 ? -6 : 1 - day); // Segunda-feira
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return start;
}

function formatDateBr(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

// Global stats across all cadernos (period: day | week | total)
app.get('/api/stats/global', (req, res) => {
  const db = readDb();
  const period = ['day', 'week', 'total'].includes(req.query.period) ? req.query.period : 'total';

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const currentWeekStart = getWeekStart(now);
  const currentWeekKey = toLocalDateKey(currentWeekStart);

  let totalQuestoes = 0;
  for (const c of Object.values(db.cadernos)) {
    totalQuestoes += c.questions.length;
  }

  let totalResolvidas = 0;
  let totalAcertos = 0;
  let totalErros = 0;
  const byMateria = {};
  const byBanca = {};
  const timelineMap = {};

  if (period === 'total') {
    for (const c of Object.values(db.cadernos)) {
      for (const q of c.questions) {
        const st = c.progress[q.id];
        if (st && st.answered) {
          totalResolvidas++;
          if (st.correta) totalAcertos++;
          else totalErros++;

          const mat = q.materia || 'Geral';
          if (!byMateria[mat]) byMateria[mat] = { total: 0, acertos: 0, erros: 0 };
          byMateria[mat].total++;
          if (st.correta) byMateria[mat].acertos++;
          else byMateria[mat].erros++;

          const ban = q.banca || 'Outras';
          if (!byBanca[ban]) byBanca[ban] = { total: 0, acertos: 0, erros: 0 };
          byBanca[ban].total++;
          if (st.correta) byBanca[ban].acertos++;
          else byBanca[ban].erros++;
        }
      }
    }
  } else {
    for (const h of db.history) {
      const hDateKey = toLocalDateKey(h.timestamp);
      const hWeekStart = getWeekStart(h.timestamp);
      const hWeekKey = toLocalDateKey(hWeekStart);

      // Build timeline buckets for day or week
      const bucketKey = period === 'day' ? hDateKey : hWeekKey;
      if (!timelineMap[bucketKey]) {
        let label = bucketKey;
        if (period === 'day') {
          const [yy, mm, dd] = hDateKey.split('-');
          label = hDateKey === todayKey ? `Hoje (${dd}/${mm}/${yy})` : `${dd}/${mm}/${yy}`;
        } else {
          const weekEnd = new Date(hWeekStart.getFullYear(), hWeekStart.getMonth(), hWeekStart.getDate() + 6);
          const prefix = hWeekKey === currentWeekKey ? 'Esta semana ' : '';
          label = `${prefix}(${formatDateBr(hWeekStart)} a ${formatDateBr(weekEnd)})`;
        }
        timelineMap[bucketKey] = { key: bucketKey, label, total: 0, acertos: 0, erros: 0 };
      }
      timelineMap[bucketKey].total++;
      if (h.correta) timelineMap[bucketKey].acertos++;
      else timelineMap[bucketKey].erros++;

      const matchesCurrent = period === 'day' ? hDateKey === todayKey : hWeekKey === currentWeekKey;
      if (!matchesCurrent) continue;

      totalResolvidas++;
      if (h.correta) totalAcertos++;
      else totalErros++;

      const mat = h.materia || 'Geral';
      if (!byMateria[mat]) byMateria[mat] = { total: 0, acertos: 0, erros: 0 };
      byMateria[mat].total++;
      if (h.correta) byMateria[mat].acertos++;
      else byMateria[mat].erros++;

      const ban = h.banca || 'Outras';
      if (!byBanca[ban]) byBanca[ban] = { total: 0, acertos: 0, erros: 0 };
      byBanca[ban].total++;
      if (h.correta) byBanca[ban].acertos++;
      else byBanca[ban].erros++;
    }
  }

  const timeline = Object.values(timelineMap)
    .sort((a, b) => b.key.localeCompare(a.key))
    .map(item => ({
      ...item,
      taxa: item.total > 0 ? Math.round((item.acertos / item.total) * 1000) / 10 : 0
    }));

  res.json({
    period,
    totalCadernos: Object.keys(db.cadernos).length,
    totalQuestoes,
    totalResolvidas,
    totalAcertos,
    totalErros,
    taxaAcerto: totalResolvidas > 0 ? Math.round((totalAcertos / totalResolvidas) * 1000) / 10 : 0,
    timeline,
    byMateria,
    byBanca,
    recentHistory: db.history.slice(0, 50)
  });
});

app.listen(PORT, () => {
  ensureDb();
  console.log(`TEC MD Cadernos rodando em http://localhost:${PORT}`);
});
