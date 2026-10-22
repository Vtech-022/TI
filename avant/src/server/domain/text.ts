// Utilitários de texto em português: normalização, radicais e similaridade.

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalize(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro com sem sob sobre ao aos ' +
    'à às e ou que se nao não mais muito ja já tambem também como quando onde ate até apos após entre ' +
    'este esta estes estas esse essa esses essas isso isto aquele aquela ele ela eles elas eu voce você nos ' +
    'meu minha seu sua nosso nossa dele dela lhe lhes me te ser estar ter haver foi era sao são esta está ' +
    'vai vou vamos pode poderia preciso precisa precisamos favor por favor fazer feito todo toda todos todas ' +
    'cada qual quais pelo pela pelos pelas so só ainda depois antes ver hoje amanha amanhã dia dias'
  )
    .split(' ')
    .map(normalize)
);

/** Radical leve para comparar variações (plural, gênero, verbo × substantivo). */
export function stem(word: string): string {
  let w = normalize(word);
  if (w.length <= 3) return w;
  w = w
    .replace(/oes$/, 'ao')
    .replace(/aes$/, 'ao')
    .replace(/ais$/, 'al')
    .replace(/eis$/, 'el')
    .replace(/ns$/, 'm');
  if (w.length > 4) w = w.replace(/s$/, '');
  const suffixes = ['izacao', 'acao', 'icao', 'mento', 'mente', 'idade', 'ador', 'adora', 'ando', 'endo', 'indo', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'cao', 'ao', 'a', 'o', 'e'];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

export function tokens(s: string): string[] {
  return normalize(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Verbos de trabalho equivalentes reduzidos a um radical comum. */
const SYNONYMS: Record<string, string> = {
  encaminh: 'envi',
  mand: 'envi',
  retir: 'remov',
  tir: 'remov',
  exclu: 'remov',
  termin: 'conclu',
  finaliz: 'conclu',
  chec: 'confer',
  verific: 'confer'
};

export function stems(s: string): Set<string> {
  return new Set(
    tokens(s)
      .map(stem)
      .map((t) => SYNONYMS[t] ?? t)
      .filter((t) => t.length > 1)
  );
}

/**
 * Similaridade entre dois textos curtos (0 a 1).
 * Combina coeficiente de Dice com sobreposição relativa ao menor conjunto.
 */
export function similarity(a: string, b: string): number {
  const A = stems(a);
  const B = stems(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const dice = (2 * inter) / (A.size + B.size);
  const overlap = inter / Math.min(A.size, B.size);
  // A sobreposição só pesa quando o menor conjunto tem conteúdo suficiente.
  const overlapWeight = Math.min(A.size, B.size) >= 2 ? 0.85 : 0.6;
  return Math.max(dice, overlap * overlapWeight);
}

export function capitalize(s: string): string {
  const t = s.trim();
  return t ? t[0].toLocaleUpperCase('pt-BR') + t.slice(1) : t;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

export function containsStem(text: string, word: string): boolean {
  return stems(text).has(stem(word));
}

/** Minúsculas sem acento, preservando o comprimento (índices equivalentes ao original). */
export function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const base = ch.normalize('NFD')[0] ?? ch;
    const lower = base.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}
