// Partes puras da importação (compartilhadas entre Node e navegador).

export const SUPPORTED: Record<string, { mime: string; label: string }> = {
  '.txt': { mime: 'text/plain', label: 'Texto' },
  '.md': { mime: 'text/markdown', label: 'Markdown' },
  '.csv': { mime: 'text/csv', label: 'CSV' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Planilha Excel' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Documento Word' },
  '.pdf': { mime: 'application/pdf', label: 'PDF' }
};

export interface ExtractedFile {
  status: 'ok' | 'sem_texto' | 'nao_suportado' | 'erro';
  text: string | null;
  error: string | null;
  mime: string;
}

export function extensionOf(filename: string): string {
  const m = /\.[^./\\]+$/.exec(filename);
  return m ? m[0].toLowerCase() : '';
}

export function decodeText(buf: Uint8Array): string {
  let s = new TextDecoder('utf-8').decode(buf);
  if (s.includes('\uFFFD')) s = new TextDecoder('latin1').decode(buf);
  return s.replace(/^\uFEFF/, '');
}

/** Confere a assinatura binária para evitar arquivos com extensão trocada. */
export function checkSignature(ext: string, buf: Uint8Array): string | null {
  const zip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if ((ext === '.docx' || ext === '.xlsx') && !zip) return 'O arquivo não é um documento Office válido (assinatura ZIP ausente).';
  if (ext === '.pdf' && String.fromCharCode(...buf.subarray(0, 5)) !== '%PDF-') return 'O arquivo não é um PDF válido.';
  if ((ext === '.txt' || ext === '.csv' || ext === '.md') && buf.subarray(0, 8192).includes(0)) return 'O arquivo contém dados binários e não parece ser texto.';
  return null;
}

// ---------------------------------------------------------------------------
// Tabelas (CSV e XLSX): colunas reconhecidas viram frases estruturadas para a captura.

const COLS: Record<string, RegExp> = {
  title: /^(tarefa|t[ií]tulo|atividade|pend[eê]ncia|a[cç][aã]o|demanda|item|descri[cç][aã]o)$/i,
  due: /^(prazo|data|vencimento|data limite|entrega|at[eé])$/i,
  responsible: /^(respons[aá]vel|resp\.?|dono|executor)$/i,
  project: /^(projeto|frente|programa)$/i,
  status: /^(status|situa[cç][aã]o)$/i,
  priority: /^(prioridade|urg[eê]ncia)$/i,
  notes: /^(observa[cç][aã]o|observa[cç][oõ]es|obs|coment[aá]rio|notas?)$/i
};

export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const d = v.toISOString().slice(0, 10).split('-');
    return `${d[2]}/${d[1]}/${d[0]}`;
  }
  if (typeof v === 'object') {
    const o = v as any;
    if (o.richText) return o.richText.map((r: any) => r.text).join('');
    if (o.text) return String(o.text);
    if (o.result !== undefined) return cellText(o.result);
    return '';
  }
  return String(v).trim();
}

export function rowsToText(rows: string[][]): string {
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  if (!clean.length) return '';
  const header = clean[0].map((h) => h.trim());
  const idx: Partial<Record<keyof typeof COLS, number>> = {};
  header.forEach((h, i) => {
    for (const [k, re] of Object.entries(COLS)) if (re.test(h) && idx[k as keyof typeof COLS] === undefined) idx[k as keyof typeof COLS] = i;
  });
  if (idx.title === undefined) {
    return clean.map((r) => r.filter(Boolean).join(' | ')).join('\n');
  }
  const lines: string[] = [];
  for (const r of clean.slice(1)) {
    const title = r[idx.title]?.trim();
    if (!title) continue;
    const parts = [title];
    if (idx.responsible !== undefined && r[idx.responsible]) parts.push(`responsável: ${r[idx.responsible]}`);
    if (idx.project !== undefined && r[idx.project]) parts.push(`projeto: ${r[idx.project]}`);
    if (idx.priority !== undefined && r[idx.priority]) parts.push(`prioridade ${r[idx.priority].toLowerCase()}`);
    if (idx.status !== undefined && r[idx.status]) parts.push(`status ${r[idx.status].toLowerCase()}`);
    if (idx.notes !== undefined && r[idx.notes]) parts.push(`obs.: ${r[idx.notes]}`);
    let line = `- ${parts.join(' — ')}`;
    if (idx.due !== undefined && r[idx.due]) line += ` — até ${r[idx.due]}`;
    lines.push(line);
  }
  return lines.join('\n');
}

export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}


export interface ExtractorLibs {
  xlsx(buf: Uint8Array): Promise<string[][][]>;
  docx(buf: Uint8Array): Promise<string>;
  pdf(buf: Uint8Array): Promise<string>;
}

export async function extractWith(libs: ExtractorLibs, filename: string, buf: Uint8Array): Promise<ExtractedFile> {
  const ext = extensionOf(filename);
  const spec = SUPPORTED[ext];
  if (!spec) {
    return { status: 'nao_suportado', text: null, error: `Formato ${ext || 'sem extensão'} não suportado. Formatos aceitos: ${Object.keys(SUPPORTED).join(', ')}.`, mime: 'application/octet-stream' };
  }
  const sigError = checkSignature(ext, buf);
  if (sigError) return { status: 'erro', text: null, error: sigError, mime: spec.mime };
  try {
    let text = '';
    if (ext === '.txt' || ext === '.md') text = decodeText(buf);
    else if (ext === '.csv') text = rowsToText(parseCsv(decodeText(buf)));
    else if (ext === '.xlsx') {
      const sheets = await libs.xlsx(buf);
      text = sheets.map(rowsToText).filter(Boolean).join('\n\n');
    } else if (ext === '.docx') text = await libs.docx(buf);
    else if (ext === '.pdf') text = await libs.pdf(buf);
    text = text.replace(/\u0000/g, '').trim();
    if (!text) {
      return {
        status: 'sem_texto',
        text: null,
        error: ext === '.pdf' ? 'O PDF não contém texto selecionável (provavelmente digitalizado). OCR não está disponível nesta versão.' : 'Nenhum texto encontrado no arquivo.',
        mime: spec.mime
      };
    }
    return { status: 'ok', text, error: null, mime: spec.mime };
  } catch (err) {
    return { status: 'erro', text: null, error: `Não foi possível interpretar o arquivo: ${(err as Error).message}`, mime: spec.mime };
  }
}

/** Texto de uma página do pdf.js, respeitando quebras de linha. */
export function pdfPageText(items: any[]): string {
  let s = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    s += item.str;
    s += item.hasEOL ? '\n' : item.str && !item.str.endsWith(' ') ? ' ' : '';
  }
  return s.replace(/[ \t]+\n/g, '\n').trim();
}
