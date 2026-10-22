// Extração de tarefas, eventos e atualizações a partir de texto livre (regras locais, sem IA externa).
import type { Certainty, EventType, Level } from '../../shared/types';
import { DateMatch, TimeMatch, parseDates, parseTimes } from './dates';
import { capitalize, fold, normalize, similarity, stem, stems, truncate } from './text';

export interface KnownProject {
  id: number;
  name: string;
  keywords: string[];
}

export interface ExtractionContext {
  referenceDate: string;
  projects: KnownProject[];
  people: string[];
}

export interface Field<T> {
  value: T;
  certainty: Certainty;
}

export interface Candidate {
  ref: number;
  kind: 'task' | 'event' | 'info';
  title: string;
  excerpt: string;
  description: string | null;
  verb: string | null;
  project: { id: number | null; name: string; certainty: Certainty } | null;
  category: Field<string> | null;
  impact: Field<Level> | null;
  effort: Field<Level> | null;
  due: (DateMatch & { time: string | null }) | null;
  responsible: Field<string> | null;
  involved: string[];
  waitingOn: { party: string; what: string; certainty: Certainty } | null;
  statusCue: 'concluida' | 'em_andamento' | 'cancelada' | null;
  parentRef: number | null;
  dependsOnRefs: number[];
  nextAction: string | null;
  author: string | null;
  sentAt: string | null;
  event: {
    type: EventType;
    date: string | null;
    dateAlternatives?: string[];
    start: string | null;
    end: string | null;
    timeAlternatives?: string[];
    participants: string[];
    location: string | null;
  } | null;
}

export interface ExtractionResult {
  candidates: Candidate[];
  ignored: { text: string; reason: string }[];
  messages: number;
}

// ---------------------------------------------------------------------------
// Léxicos

const ACTION_VERBS = new Set(
  (
    'acompanhar adicionar agendar ajustar alinhar alterar analisar apresentar aprovar arrumar assinar atualizar avaliar baixar buscar ' +
    'cadastrar calcular cancelar capacitar carregar checar cobrar comecar começar compartilhar comprar concluir conferir configurar confirmar ' +
    'consertar consolidar contatar contactar contratar convidar corrigir cotar criar definir desenvolver diagramar digitalizar divulgar documentar editar elaborar ' +
    'encaminhar enviar entregar escrever estruturar estudar excluir fazer falar finalizar formatar imprimir implantar implementar incluir iniciar instalar ' +
    'investigar lancar lançar levantar liberar ligar mandar mapear marcar melhorar migrar montar mudar orcar orçar organizar padronizar pedir pesquisar planejar ' +
    'preencher preparar programar protocolar providenciar publicar reagendar redigir reescrever refazer registrar remover reorganizar resolver responder retirar ' +
    'revisar separar solicitar subir substituir terminar testar tirar tornar traduzir treinar trocar validar verificar ver conversar reunir reunir-se'
  )
    .split(' ')
    .map(normalize)
);

/** Verbos de fechamento: dependem das ações anteriores na mesma frase. */
const CLOSING_VERBS = new Set(['enviar', 'encaminhar', 'entregar', 'submeter', 'publicar', 'validar', 'aprovar', 'mandar', 'protocolar', 'imprimir', 'apresentar']);

const PREFIX =
  /^(?:(?:eu|nos|nós|a gente)\s+)?(?:(?:preciso|precisamos|precisa|tenho que|temos que|tem que|devo|devemos|vou|vamos|favor|por favor|pfv|pf|lembrar de|lembrete:?|n[aã]o esquecer de|n[aã]o esquecer|todo:?|to-?do:?|pendente:?|pend[eê]ncia:?|tarefa:?|a[cç][aã]o:?|importante:?|urgente:?|ainda|tamb[eé]m|al[eé]m disso,?|depois,?|e)\s+)+/i;

const FILLER = /^(?:ok|okay|blz|beleza|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|oi|ol[aá]|tudo bem|certo|combinado|perfeito|show|kk+|rs+|👍|entendi|sim|n[aã]o)\b[\s!.,]*$/i;

const NOT_NAMES = new Set(
  (
    'segunda terca terça quarta quinta sexta sabado sábado domingo janeiro fevereiro marco março abril maio junho julho agosto setembro outubro ' +
    'novembro dezembro forms microsoft excel teams google outlook word pdf revista painel educacao educação projeto qr ata colegiado equipe ' +
    'diretoria unidade unidades coordenacao coordenação secretaria prefeitura hospital setor gerencia gerência sistema agenda reuniao reunião ' +
    'treinamento curso evento capa capas eixo eixos apresentacao apresentação versao versão trabalho trabalhos planilha planilhas automacao automação ' +
    'whatsapp email e-mail drive sharepoint power bi zoom meet sala auditorio auditório hoje amanha amanhã favor obs observacao observação tarefa ' +
    'controle virtual digital fisica física norte sul leste oeste centro estruturacao estruturação liberacao liberação ajustes ajuste prazo'
  )
    .split(' ')
    .map(normalize)
);

const TEAM_WORDS = /\b(equipe|time|diretoria|coordena[cç][aã]o|ger[eê]ncia|secretaria|setor\s+[\p{L}]+|ti|rh|financeiro|comunica[cç][aã]o|unidades?)\b/iu;

export const EVENT_NOUNS: [RegExp, EventType][] = [
  [/\breuni[aã]o\b|\bcall\b|\balinhamento\b/i, 'reuniao'],
  [/\btreinamento\b|\bcapacita[cç][aã]o\b/i, 'treinamento'],
  [/\bcurso\b|\bworkshop\b|\boficina\b|\bwebinar\b|\baula\b/i, 'curso'],
  [/\bcongresso\b|\bsemin[aá]rio\b|\bpalestra\b|\bevento\b|\bfeira\b|\bvisita\b|\bsimp[oó]sio\b|\bconfer[eê]ncia\b/i, 'evento_externo']
];

const CATEGORIES: [string, string[]][] = [
  ['Editorial', ['revista', 'capa', 'diagramacao', 'artigo', 'publicacao', 'editorial', 'eixo', 'trabalho', 'texto', 'sumario']],
  ['Dados e painéis', ['painel', 'planilha', 'dashboard', 'indicador', 'dado', 'relatorio', 'bi']],
  ['Desenvolvimento e automação', ['sistema', 'qr', 'code', 'automacao', 'forms', 'aplicativo', 'app', 'site', 'codigo', 'bug']],
  ['Documentação', ['ata', 'documento', 'oficio', 'memorando', 'parecer', 'contrato', 'colegiado']],
  ['Agenda e eventos', ['reuniao', 'treinamento', 'curso', 'evento', 'agenda', 'capacitacao', 'workshop']],
  ['Acompanhamento', ['acompanhar', 'cobrar', 'aguardar', 'retorno', 'liberacao', 'follow']],
  ['Comunicação', ['enviar', 'encaminhar', 'responder', 'email', 'mensagem', 'comunicar', 'divulgar']]
];

const CATEGORY_STEMS: [string, Set<string>][] = CATEGORIES.map(([c, words]) => [c, new Set(words.map(stem))]);

// ---------------------------------------------------------------------------
// Segmentação

const NAME_RE = '\\p{Lu}[\\p{Ll}]+(?:\\s+(?:d[aeo]s?\\s+)?\\p{Lu}[\\p{Ll}]+)?';

const WA_LINE = [
  // [21/10/2026, 14:32:10] Nome: texto
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\]\s*([^:]{1,60}):\s?(.*)$/,
  // 21/10/2026 14:32 - Nome: texto
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})\s*[-–]\s*([^:]{1,60}):\s?(.*)$/
];

interface Message {
  author: string | null;
  date: string | null;
  body: string;
}

export function splitMessages(text: string): Message[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const msgs: Message[] = [];
  let current: Message | null = null;
  let detected = false;
  for (const line of lines) {
    let matched = false;
    for (const re of WA_LINE) {
      const m = line.match(re);
      if (m) {
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        const date = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        current = { author: m[6].trim(), date, body: m[7] };
        msgs.push(current);
        matched = detected = true;
        break;
      }
    }
    if (!matched) {
      if (current) current.body += '\n' + line;
      else {
        current = { author: null, date: null, body: line };
        msgs.push(current);
      }
    }
  }
  if (!detected) return [{ author: null, date: null, body: text }];
  return msgs.filter((m) => m.body.trim());
}

const GENERIC_HEADER = /^(?:minhas\s+|nossas\s+)?(?:pend[eê]ncias|tarefas|to-?do|lista|itens|a fazer|afazeres|demandas|prioridades|resumo|atualiza[cç](?:[oõ]es|ao|ão)|recados|anota[cç](?:[oõ]es|ao|ão)|obs(?:erva[cç](?:[oõ]es|ao|ão))?)\b/i;

const BULLET = /^\s*(?:[-–—•*▪◦·]|\d{1,2}[.)]|\(?[a-z]\)|\[\s?[x ]?\s?\])\s+/i;

function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[.!?;])\s+(?=\S)|;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstWord(s: string): string {
  return normalize(s).split(/[\s,.:;]+/)[0] ?? '';
}

function isActionVerb(word: string): boolean {
  return ACTION_VERBS.has(normalize(word));
}

/** Divide uma frase em ações coordenadas ("revisar X, retirar Y e enviar Z"). */
function splitActions(sentence: string): string[] {
  const parts: string[] = [];
  const re = /(,\s*(?:e\s+)?|\s+e\s+|\s+depois\s+|\s+em seguida\s+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const after = sentence.slice(m.index + m[0].length);
    if (isActionVerb(firstWord(after))) {
      parts.push(sentence.slice(last, m.index));
      last = m.index + m[0].length;
    }
  }
  parts.push(sentence.slice(last));
  const out = parts.map((p) => p.trim()).filter(Boolean);
  // "revisar a ata e encaminhar para Luciana" → "encaminhar a ata para Luciana"
  for (let i = 1; i < out.length; i++) {
    const m = out[i].match(/^(\S+)\s+((?:para|pra|ao|à|aos|às)\s+.*)$/i);
    if (m && isActionVerb(m[1])) {
      const prevObject = out[i - 1].split(/\s+/).slice(1).join(' ');
      if (prevObject) out[i] = `${m[1]} ${prevObject} ${m[2]}`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pessoas, projetos e demais campos

function isName(word: string): boolean {
  const first = normalize(word.split(/\s+/)[0]);
  return !NOT_NAMES.has(first) && !/^\p{Lu}{2,}$/u.test(word);
}

function cleanName(n: string): string {
  return n.trim().replace(/\s+/g, ' ');
}

interface People {
  responsible: Field<string> | null;
  involved: string[];
  waitingParty: string | null;
}

export function extractPeople(sentence: string, ctx: ExtractionContext): People {
  const involved = new Set<string>();
  let responsible: Field<string> | null = null;
  let waitingParty: string | null = null;
  const take = (re: RegExp, fn: (name: string, m: RegExpMatchArray) => void) => {
    for (const m of sentence.matchAll(re)) {
      const name = cleanName(m[1]);
      if (isName(name)) fn(name, m);
    }
  };
  take(new RegExp(`(?:respons[aá]vel|resp\\.?)\\s*:?\\s*(${NAME_RE})`, 'gu'), (n) => (responsible = { value: n, certainty: 'explicita' }));
  take(new RegExp(`@(${NAME_RE})`, 'gu'), (n) => (responsible = { value: n, certainty: 'explicita' }));
  take(
    new RegExp(`(?:^|[.;,]\\s*)(?:[AaOo]\\s+)?(${NAME_RE})\\s+(?:vai|v[aã]o|ficou de|fica de|ir[aá]|deve|precisa|tem que|est[aá] vendo|est[aá] fazendo|ficou respons[aá]vel)\\b`, 'gu'),
    (n) => {
      responsible = { value: n, certainty: 'explicita' };
      waitingParty = n;
    }
  );
  take(new RegExp(`\\b(?:com|c\\/)\\s+(?:[ao]s?\\s+)?(${NAME_RE})`, 'gu'), (n) => involved.add(n));
  take(new RegExp(`\\b(?:para|pra|pro|[àa]|ao)\\s+(?:[ao]\\s+)?(${NAME_RE})`, 'gu'), (n) => involved.add(n));
  take(new RegExp(`\\b(?:d[ao])\\s+(${NAME_RE})`, 'gu'), (n) => {
    if (ctx.people.some((p) => normalize(p) === normalize(n)) || /libera|retorno|resposta|aprova/i.test(sentence)) involved.add(n);
  });
  take(new RegExp(`\\b(?:aguardando|aguardar|esperando|esperar|depende d[eao]s?|dependendo d[eao]s?|retorno d[aeo]s?|resposta d[aeo]s?)\\s+(?:[ao]s?\\s+)?(${NAME_RE})`, 'gu'), (n) => {
    involved.add(n);
    waitingParty = waitingParty ?? n;
  });
  take(new RegExp(`(?:pedir|cobrar|solicitar|perguntar)\\s+(?:[aà]|ao|para|pra|[ao])?\\s*(${NAME_RE})`, 'gu'), (n) => involved.add(n));
  take(new RegExp(`[:—–-]\\s*(${NAME_RE})\\s*\\.?$`, 'gu'), (n) => involved.add(n));
  // Pessoas já conhecidas citadas em minúsculas.
  const folded = ` ${fold(sentence)} `;
  for (const p of ctx.people) {
    const fp = fold(p);
    if (fp.length > 2 && new RegExp(`[^\\p{L}]${fp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\p{L}]`, 'u').test(folded)) {
      if (![...involved].some((i) => fold(i) === fp) && !(responsible && fold((responsible as Field<string>).value) === fp)) involved.add(p);
    }
  }
  const team = sentence.match(new RegExp(`\\b(?:com|para|pra|da|do)\\s+(?:a|o)\\s+${TEAM_WORDS.source}`, 'iu'));
  if (team) involved.add(capitalize(team[1]));
  const resp = responsible as Field<string> | null;
  if (resp) involved.delete(resp.value);
  return { responsible: resp, involved: [...involved], waitingParty };
}

export function matchProject(text: string, ctx: ExtractionContext): Candidate['project'] {
  const explicit = text.match(/\bprojeto:?\s+([^,.;:\n]{3,80})/i);
  if (explicit) {
    const name = explicit[1].trim().replace(/\s+(?:at[eé]|para|com)\b.*$/i, '');
    const best = ctx.projects.map((p) => ({ p, s: similarity(name, p.name) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.6) return { id: best.p.id, name: best.p.name, certainty: 'explicita' };
    return { id: null, name: capitalize(name), certainty: 'explicita' };
  }
  const textStems = stems(text);
  const folded = fold(text);
  let best: { p: KnownProject; hits: number } | null = null;
  let tie = false;
  for (const p of ctx.projects) {
    let hits = 0;
    for (const kw of p.keywords) {
      const kwStems = [...stems(kw)];
      if (kwStems.length > 1 ? folded.includes(fold(kw)) : kwStems.length === 1 && textStems.has(kwStems[0])) hits += kwStems.length > 1 ? 2 : 1;
    }
    if (folded.includes(fold(p.name))) hits += 3;
    if (hits === 0) continue;
    if (!best || hits > best.hits) {
      best = { p, hits };
      tie = false;
    } else if (hits === best.hits) tie = true;
  }
  if (!best || tie) return null;
  return { id: best.p.id, name: best.p.name, certainty: 'inferida' };
}

function categorize(text: string): Field<string> | null {
  const s = stems(text);
  let best: [string, number] | null = null;
  for (const [cat, words] of CATEGORY_STEMS) {
    let n = 0;
    for (const w of words) if (s.has(w)) n++;
    if (n > 0 && (!best || n > best[1])) best = [cat, n];
  }
  return best ? { value: best[0], certainty: 'inferida' } : null;
}

function detectImpact(text: string): Field<Level> | null {
  if (/\b(urgente|urg[eê]ncia|cr[ií]tic[oa]|imprescind[ií]vel|sem falta|prazo final|essencial|priorit[aá]ri[oa]|prioridade m[aá]xima)\b/i.test(text)) return { value: 'alto', certainty: 'explicita' };
  if (/\b(importante|diretoria|prioridade)\b/i.test(text)) return { value: 'alto', certainty: 'inferida' };
  if (/\b(quando der|sem pressa|se poss[ií]vel|quando puder|baixa prioridade|n[aã]o [eé] urgente)\b/i.test(text)) return { value: 'baixo', certainty: 'explicita' };
  return null;
}

function detectEffort(text: string): Field<Level> | null {
  if (/\b(r[aá]pid[oa]|rapidinho|simples|\d{1,2}\s?min(?:utos)?|minutinhos|s[oó] (?:enviar|encaminhar|mandar))\b/i.test(text)) return { value: 'baixo', certainty: 'inferida' };
  if (/\b(desenvolver|sistema|estruturar|implantar|implementar|elaborar|migrar|reestruturar)\b/i.test(text)) return { value: 'alto', certainty: 'inferida' };
  return null;
}

function detectStatus(text: string): Candidate['statusCue'] {
  if (/\b(cancelad[oa]|n[aã]o precisa mais|desconsiderar|desconsidera)\b/i.test(text)) return 'cancelada';
  if (/\b(?<!(?:fica|ficar[aá]|vai ficar|estar[aá]|deve ficar)\s)(conclu[ií]d[oa]s?|conclu[ií]|finalizad[oa]s?|finalizei|j[aá] (?:foi |foram )?(?:feito|feita|enviad[oa]s?|entregue|resolvid[oa])|j[aá] enviei|j[aá] mandei|j[aá] fiz|enviad[oa]s?|entregue|resolvid[oa]|est[aá] pront[oa])\b/i.test(text))
    return 'concluida';
  if (/\b(em andamento|comecei|iniciei|estou fazendo|estou vendo|est[aá] sendo feit[oa]|j[aá] estou)\b/i.test(text)) return 'em_andamento';
  return null;
}

const WAIT_EXPLICIT = /\b(aguardando|aguardar|esperando|depende d[eao]s?|dependendo d[eao]s?|pendente d[eao]s?|falta (?:o |a )?retorno|sem retorno)\b/i;
const WAIT_INFERRED = /\b(acompanhar|cobrar|libera[cç][aã]o|retorno d[aeo]|aprova[cç][aã]o d[aeo]|resposta d[aeo]|ver com|verificar com)\b/i;

function cleanTitle(fragment: string, dates: DateMatch[], times: TimeMatch[]): string {
  let s = fragment;
  for (const d of dates) s = s.replace(new RegExp(`(?:\\s*(?:at[eé]|para|pra|na|no|em|prazo:?|dia|entregar|vence)\\s+)?${escapeRe(d.raw)}`, 'i'), '');
  for (const t of times) s = s.replace(new RegExp(`(?:\\s*(?:[aà]s|das|a partir das)\\s+)?${escapeRe(t.raw)}`, 'i'), '');
  s = s
    .replace(/\b(?:respons[aá]vel|resp\.?)\s*:?\s*[\p{L} ]+$/iu, '')
    .replace(/\b(?:com urg[eê]ncia|urgente|sem falta|por favor|pfv)\b/gi, '')
    .replace(PREFIX, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:–—-]+|[\s,;:–—.!-]+$/g, '');
  return truncate(capitalize(s), 140);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

export function detectEvent(sentence: string, dates: DateMatch[], times: TimeMatch[], startsWithVerb: boolean): Candidate['event'] {
  if (startsWithVerb) return null;
  const type = EVENT_NOUNS.find(([re]) => re.test(sentence))?.[1];
  if (!type || (!times.length && !dates.length)) return null;
  const date = dates[0] ?? null;
  const time = times[0] ?? null;
  const participants: string[] = [];
  const pm = sentence.match(/\bcom\s+(?:[ao]s?\s+)?([^,.;]+?)(?=\s+(?:n[ao]|em|às|as|dia|para|sobre|local)\b|[,.;]|$)/i);
  if (pm) {
    for (const p of pm[1].split(/\s+e\s+|,\s*/)) {
      const clean = p.trim().replace(/^(?:[ao]s?)\s+/i, '');
      if (clean && !/\d/.test(clean)) participants.push(capitalize(clean));
    }
  }
  const loc = sentence.match(/\b(?:local:?\s*|no |na |em )((?:sala|audit[oó]rio|anfiteatro|teams|zoom|google meet|meet|plen[aá]rio|laborat[oó]rio)\b[^,.;]*)/i);
  return {
    type,
    date: date?.date ?? null,
    dateAlternatives: date?.alternatives,
    start: time?.start ?? null,
    end: time?.end ?? null,
    timeAlternatives: time?.alternatives,
    participants,
    location: loc ? capitalize(loc[1].trim()) : null
  };
}

export function eventTitle(sentence: string, dates: DateMatch[], times: TimeMatch[]): string {
  let s = cleanTitle(sentence, dates, times);
  s = s.replace(/\bcom\s+(?:[ao]s?\s+)?[^,.;]+$/i, '').replace(/\b(?:no|na|em)\s+(?:sala|audit[oó]rio|anfiteatro|teams|zoom|meet)\b.*$/i, '');
  s = s.replace(/^(?:tem|teremos|haver[aá]|vai ter|temos)\s+(?:uma?\s+)?/i, '');
  return truncate(capitalize(s.trim().replace(/[\s,;:–—.-]+$/, '')), 140) || 'Evento';
}

// ---------------------------------------------------------------------------

/** Analisa o texto e devolve candidatos estruturados (sem acessar o banco). */
export function extract(text: string, ctx: ExtractionContext): ExtractionResult {
  const messages = splitMessages(text);
  const candidates: Candidate[] = [];
  const ignored: ExtractionResult['ignored'] = [];
  let ref = 0;

  for (const msg of messages) {
    const refDate = msg.date ?? ctx.referenceDate;
    const lines = msg.body.split('\n').map((l) => l.replace(/\s+$/, ''));
    const nonEmpty = lines.filter((l) => l.trim());
    const listContext = nonEmpty.length > 1 || nonEmpty.some((l) => BULLET.test(l));
    let header: { ref: number | null; responsible: string | null; project: Candidate['project']; text: string } | null = null;

    for (let li = 0; li < lines.length; li++) {
      const rawLine = lines[li];
      if (!rawLine.trim()) {
        header = null;
        continue;
      }
      const isBullet = BULLET.test(rawLine);
      const line = rawLine.replace(BULLET, '').trim();
      if (!isBullet && !/^\s/.test(rawLine)) {
        // Uma linha comum que não é item encerra o grupo do cabeçalho anterior.
        if (header && !line.endsWith(':')) header = null;
      }

      // Cabeçalho de lista ("Ajustes da revista:" ou "Daniela:")
      const nextLine = lines.slice(li + 1).find((l) => l.trim());
      if (line.endsWith(':') && nextLine && (BULLET.test(nextLine) || /^\s/.test(nextLine))) {
        const label = line.slice(0, -1).trim();
        if (GENERIC_HEADER.test(label)) {
          header = { ref: null, responsible: null, project: matchProject(label, ctx), text: label };
          continue;
        }
        if (new RegExp(`^${NAME_RE}$`, 'u').test(label) && isName(label)) {
          header = { ref: null, responsible: label, project: null, text: label };
          continue;
        }
        const dates = parseDates(label, refDate);
        const people = extractPeople(label, ctx);
        const c = buildCandidate(ref++, label, label, 'task', dates, [], people, ctx, msg, refDate, null);
        candidates.push(c);
        header = { ref: c.ref, responsible: null, project: c.project, text: label };
        continue;
      }

      for (const sentence of splitSentences(line)) {
        if (FILLER.test(sentence) || sentence.replace(/[^\p{L}]/gu, '').length < 3) {
          ignored.push({ text: sentence, reason: 'Mensagem sem conteúdo acionável.' });
          continue;
        }
        let body = sentence.replace(PREFIX, '');
        const dates = parseDates(sentence, refDate);
        const times = parseTimes(sentence);
        const people = extractPeople(sentence, ctx);
        if (header?.responsible && !people.responsible) people.responsible = { value: header.responsible, certainty: 'explicita' };

        // "Daniela vai verificar ..." → ação de terceiro
        const thirdParty = body.match(new RegExp(`^(?:[AaOo]\\s+)?(${NAME_RE})\\s+(?:vai|v[aã]o|ficou de|fica de|ir[aá]|deve|precisa|tem que)\\s+(.*)$`, 'u'));
        if (thirdParty && isName(thirdParty[1])) body = thirdParty[2];

        const startsWithVerb = isActionVerb(firstWord(body));
        const event = detectEvent(sentence, dates, times, startsWithVerb);
        if (event) {
          const c = buildCandidate(ref++, sentence, sentence, 'event', dates, times, people, ctx, msg, refDate, null);
          c.event = event;
          c.title = eventTitle(body, dates, times);
          candidates.push(c);
          continue;
        }

        const actions = startsWithVerb ? splitActions(body) : [body];
        const actionable = startsWithVerb || isBullet || listContext || header !== null || !!thirdParty;
        if (!actionable) {
          // Frase informativa: pode atualizar uma tarefa existente (data, status, responsável).
          const cue = detectStatus(sentence);
          if (dates.length || cue || people.responsible || WAIT_EXPLICIT.test(sentence)) {
            candidates.push(buildCandidate(ref++, sentence, body, 'info', dates, times, people, ctx, msg, refDate, header?.ref ?? null));
          } else {
            ignored.push({ text: sentence, reason: 'Não foi identificada uma ação ou atualização.' });
          }
          continue;
        }

        const refs: number[] = [];
        for (const action of actions) {
          const c = buildCandidate(ref++, sentence, action, 'task', dates, times, people, ctx, msg, refDate, header?.ref ?? null);
          if (thirdParty && isName(thirdParty[1])) {
            c.responsible = { value: cleanName(thirdParty[1]), certainty: 'explicita' };
            c.waitingOn = c.waitingOn ?? { party: cleanName(thirdParty[1]), what: c.title, certainty: 'explicita' };
            c.nextAction = `Acompanhar com ${cleanName(thirdParty[1])}: ${c.title.charAt(0).toLowerCase()}${c.title.slice(1)}`;
          }
          if (!c.project && header?.project) c.project = header.project;
          candidates.push(c);
          refs.push(c.ref);
        }
        // Sequência: verbo de fechamento depende das ações anteriores da mesma frase.
        if (refs.length > 1) {
          const lastC = candidates[candidates.length - 1];
          if (lastC.verb && CLOSING_VERBS.has(lastC.verb)) lastC.dependsOnRefs = refs.slice(0, -1);
          // Projeto inferido em uma ação vale para as demais da mesma frase.
          const proj = candidates.slice(-refs.length).find((c) => c.project)?.project ?? null;
          for (const c of candidates.slice(-refs.length)) if (!c.project && proj) c.project = { ...proj, certainty: 'inferida' };
        }
      }
    }
  }

  // Duplicidades dentro da mesma captura
  const unique: Candidate[] = [];
  for (const c of candidates) {
    const dup = unique.find((u) => u.kind === c.kind && c.kind !== 'info' && similarity(u.title, c.title) >= 0.9);
    if (dup) {
      ignored.push({ text: c.excerpt, reason: `Repetição de "${dup.title}" na mesma captura.` });
      for (const o of candidates) {
        o.dependsOnRefs = o.dependsOnRefs.map((r) => (r === c.ref ? dup.ref : r));
        if (o.parentRef === c.ref) o.parentRef = dup.ref;
      }
      continue;
    }
    unique.push(c);
  }
  return { candidates: unique, ignored, messages: messages.length };
}

function buildCandidate(
  ref: number,
  sentence: string,
  fragment: string,
  kind: Candidate['kind'],
  dates: DateMatch[],
  times: TimeMatch[],
  people: People,
  ctx: ExtractionContext,
  msg: Message,
  refDate: string,
  parentRef: number | null
): Candidate {
  const title = cleanTitle(fragment, dates, times) || truncate(capitalize(sentence), 140);
  const verb = isActionVerb(firstWord(title)) ? normalize(firstWord(title)) : null;
  const due = dates[0] ? { ...dates[0], time: times[0]?.start ?? null } : null;
  let waitingOn: Candidate['waitingOn'] = null;
  const party = people.waitingParty ?? people.involved[0] ?? null;
  if (party && WAIT_EXPLICIT.test(sentence)) waitingOn = { party, what: title, certainty: 'explicita' };
  else if (party && WAIT_INFERRED.test(sentence)) waitingOn = { party, what: title, certainty: 'inferida' };
  const description = normalize(sentence) !== normalize(title) && sentence.length > title.length + 8 ? sentence : null;
  return {
    ref,
    kind,
    title,
    excerpt: sentence,
    description,
    verb,
    project: matchProject(sentence, ctx),
    category: categorize(`${title} ${sentence}`),
    impact: detectImpact(sentence),
    effort: detectEffort(title),
    due,
    responsible: people.responsible,
    involved: people.involved,
    waitingOn,
    statusCue: detectStatus(sentence),
    parentRef,
    dependsOnRefs: [],
    nextAction: kind === 'task' ? (verb ? title : null) : null,
    author: msg.author,
    sentAt: msg.date ?? (refDate !== ctx.referenceDate ? refDate : null),
    event: null
  };
}
