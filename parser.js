/**
 * Parser de cadernos em Markdown (formato Docling / TEC Concursos e genérico).
 */

function cleanLine(line) {
  return line.replace(/\r$/, '');
}

function stripHeadingAndBullet(line) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^-\s+/, '')
    .trim();
}

function parseBancaMeta(rawLine) {
  const clean = stripHeadingAndBullet(rawLine);
  // Ex: CEBRASPE (CESPE) - Ana Prev (ALPREV)/ALPREV/Administrativa/2026
  const yearMatch = clean.match(/\/(\d{4})\s*$/);
  const ano = yearMatch ? yearMatch[1] : '';
  const dashIdx = clean.indexOf(' - ');
  const banca = dashIdx > -1 ? clean.slice(0, dashIdx).trim() : clean;
  const concurso = dashIdx > -1 ? clean.slice(dashIdx + 3).trim() : '';
  return { raw: clean, banca, concurso, ano };
}

function parseMateriaMeta(rawLine) {
  const clean = stripHeadingAndBullet(rawLine);
  const parts = clean.split(' - ').map(s => s.trim()).filter(Boolean);
  const materia = parts[0] || clean;
  const assunto = parts.slice(1).join(' - ') || clean;
  return { raw: clean, materia, assunto };
}

function parseMarkdownCaderno(markdownText, fallbackTitle = 'Caderno Importado') {
  const lines = markdownText.split('\n').map(cleanLine);

  let title = fallbackTitle.replace(/\.md$/i, '');
  let sourceUrl = '';
  let ordenacao = '';

  const questionStartRegex = /^##\s*\[?(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/i;

  // Find index of first question
  let firstQuestionIdx = lines.findIndex(l => questionStartRegex.test(l.trim()));
  if (firstQuestionIdx === -1) {
    // Fallback: try generic "## Questão N" or "## N)"
    firstQuestionIdx = lines.findIndex(l => /^##\s*(?:Quest[aã]o\s+\d+|\d+\))/i.test(l.trim()));
  }

  const headerEnd = firstQuestionIdx > -1 ? firstQuestionIdx : Math.min(lines.length, 30);
  for (let i = 0; i < headerEnd; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('![')) continue;
    const urlMatch = trimmed.match(/https?:\/\/(?:www\.)?tecconcursos\.com\.br\/s\/[A-Za-z0-9]+/i);
    if (urlMatch) {
      sourceUrl = urlMatch[0];
      continue;
    }
    if (/^Ordena[çc][aã]o:/i.test(trimmed)) {
      ordenacao = trimmed.replace(/^Ordena[çc][aã]o:\s*/i, '').trim();
      continue;
    }
    if (trimmed.startsWith('## ') && title === fallbackTitle.replace(/\.md$/i, '')) {
      const candidate = trimmed.replace(/^##\s+/, '').trim();
      if (candidate && !candidate.startsWith('[')) {
        title = candidate;
      }
    }
  }

  // Split into question chunks
  const chunks = [];
  let currentChunk = null;

  for (let i = Math.max(0, firstQuestionIdx); i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const qMatch = trimmed.match(questionStartRegex);
    if (qMatch) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = {
        tecId: qMatch[1],
        url: `https://www.tecconcursos.com.br/questoes/${qMatch[1]}`,
        lines: []
      };
    } else if (currentChunk) {
      currentChunk.lines.push(line);
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  const questions = chunks.map((chunk, idx) => parseQuestionChunk(chunk, idx + 1));

  return {
    title,
    sourceUrl,
    ordenacao,
    questions
  };
}

function parseQuestionChunk(chunk, fallbackNumber) {
  const rawLines = chunk.lines;
  let cursor = 0;

  // Skip leading empty lines
  while (cursor < rawLines.length && !rawLines[cursor].trim()) cursor++;

  // 1. Banca line
  let bancaMeta = { raw: '', banca: 'Banca não informada', concurso: '', ano: '' };
  if (cursor < rawLines.length) {
    const line = rawLines[cursor].trim();
    if (!/^-?\s*\d+\)/.test(line)) {
      bancaMeta = parseBancaMeta(line);
      cursor++;
    }
  }

  while (cursor < rawLines.length && !rawLines[cursor].trim()) cursor++;

  // 2. Materia line (sometimes wrapped in ``` ... ``` by docling)
  let materiaMeta = { raw: '', materia: 'Geral', assunto: '' };
  if (cursor < rawLines.length) {
    const line = rawLines[cursor].trim();
    if (line === '```') {
      // Check if next line is materia and line after is ```
      if (cursor + 2 < rawLines.length && rawLines[cursor + 2].trim() === '```' && !/^-?\s*\d+\)/.test(rawLines[cursor + 1].trim())) {
        materiaMeta = parseMateriaMeta(rawLines[cursor + 1].trim());
        cursor += 3;
      }
    } else if (!/^-?\s*\d+\)/.test(line) && !/^!\[/.test(line)) {
      materiaMeta = parseMateriaMeta(line);
      cursor++;
    }
  }

  while (cursor < rawLines.length && !rawLines[cursor].trim()) cursor++;

  // 3. Extract Gabarito from the end of chunk
  let gabarito = '';
  let endIdx = rawLines.length;
  for (let i = rawLines.length - 1; i >= cursor; i--) {
    const t = rawLines[i].trim();
    if (!t) continue;
    const gabMatch = t.match(/^Gabarito:\s*(.+)$/i);
    if (gabMatch) {
      gabarito = gabMatch[1].trim();
      endIdx = i;
      break;
    }
  }

  // Normalize gabarito
  if (/^certo$/i.test(gabarito)) gabarito = 'Certo';
  else if (/^errado$/i.test(gabarito)) gabarito = 'Errado';
  else if (/^[a-e]$/i.test(gabarito)) gabarito = gabarito.toUpperCase();

  // 4. Separate body lines and alternatives
  const bodySlice = rawLines.slice(cursor, endIdx);

  // Extract question number from first body line if present
  let numero = fallbackNumber;
  if (bodySlice.length > 0) {
    const firstTrim = bodySlice[0].trim();
    const numMatch = firstTrim.match(/^-?\s*(\d+)\)\s*(.*)$/);
    if (numMatch) {
      numero = parseInt(numMatch[1], 10);
      bodySlice[0] = numMatch[2];
    }
  }

  // Check if Multiple Choice (a) .. e))
  const altRegex = /^-?\s*\(?([a-eA-E])\)\s+(.*)$/;
  const alternatives = [];
  const enunciadoLines = [];
  let inAlternatives = false;

  for (let i = 0; i < bodySlice.length; i++) {
    const line = bodySlice[i];
    const trimmed = line.trim();
    const altMatch = trimmed.match(altRegex);
    if (altMatch) {
      inAlternatives = true;
      alternatives.push({
        letter: altMatch[1].toUpperCase(),
        text: altMatch[2].trim()
      });
    } else if (inAlternatives) {
      // Continuation of previous alternative (unless it's empty)
      if (trimmed && alternatives.length > 0) {
        alternatives[alternatives.length - 1].text += '\n' + trimmed;
      }
    } else {
      enunciadoLines.push(line);
    }
  }

  let tipo = 'ME';
  if (alternatives.length === 0 || gabarito === 'Certo' || gabarito === 'Errado') {
    tipo = 'CE';
  }

  // If CE, strip trailing "Certo", "Errado", "Certo Errado" lines from enunciadoLines
  if (tipo === 'CE') {
    while (enunciadoLines.length > 0) {
      const last = enunciadoLines[enunciadoLines.length - 1].trim();
      if (!last || /^(?:Certo|Errado|Certo\s+Errado)$/i.test(last)) {
        enunciadoLines.pop();
      } else {
        break;
      }
    }
  }

  // Trim leading/trailing blank lines from enunciado
  while (enunciadoLines.length > 0 && !enunciadoLines[0].trim()) enunciadoLines.shift();
  while (enunciadoLines.length > 0 && !enunciadoLines[enunciadoLines.length - 1].trim()) enunciadoLines.pop();

  const enunciadoMd = enunciadoLines.join('\n');

  const finalAlternatives =
    tipo === 'CE'
      ? [
          { letter: 'Certo', text: 'Certo' },
          { letter: 'Errado', text: 'Errado' }
        ]
      : alternatives;

  return {
    id: chunk.tecId || `q_${fallbackNumber}`,
    tecId: chunk.tecId || String(fallbackNumber),
    url: chunk.url || '',
    numero,
    banca: bancaMeta.banca,
    concurso: bancaMeta.concurso,
    ano: bancaMeta.ano,
    bancaRaw: bancaMeta.raw,
    materia: materiaMeta.materia,
    assunto: materiaMeta.assunto,
    materiaRaw: materiaMeta.raw,
    tipo,
    enunciadoMd,
    alternativas: finalAlternatives,
    gabarito
  };
}

module.exports = { parseMarkdownCaderno };
