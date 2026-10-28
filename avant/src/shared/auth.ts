// Regras de conta e senha, iguais no navegador e no servidor.

export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 7;
export const PASSWORD_RULE = `De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres, com pelo menos uma letra, um número e um caractere especial (ex.: Av@2026).`;

export type Role = 'admin' | 'membro';
export interface PublicUser {
  id: string;
  name: string;
  role: Role;
  created_at: string;
}
export interface StoredUser extends PublicUser {
  key: string; // nome normalizado (sem acento, minúsculo) para não haver contas repetidas
  salt: string;
  hash: string;
}

export function validatePassword(p: string): string | null {
  if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return `A senha deve ter de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(p)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/\d/.test(p)) return 'A senha precisa ter pelo menos um número.';
  if (!/[^\p{L}\d\s]/u.test(p)) return 'A senha precisa ter pelo menos um caractere especial (ex.: @ # ! $ %).';
  if (/\s/.test(p)) return 'A senha não pode ter espaços.';
  return null;
}

export function validateName(n: string): string | null {
  const t = n.trim();
  if (t.length < 2) return 'Informe seu nome (pelo menos 2 letras).';
  if (t.length > 60) return 'Nome muito longo (máximo 60 caracteres).';
  return null;
}

export const nameKey = (n: string) =>
  n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** PBKDF2-SHA256: a senha nunca é guardada, só um resumo com sal aleatório. */
export async function hashPassword(password: string, saltHex?: string): Promise<{ salt: string; hash: string }> {
  const salt = saltHex ? new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 120_000 }, key, 256);
  return { salt: hex(salt), hash: hex(bits) };
}

export async function verifyPassword(password: string, user: Pick<StoredUser, 'salt' | 'hash'>): Promise<boolean> {
  const { hash } = await hashPassword(password, user.salt);
  // comparação em tempo constante
  let diff = hash.length ^ user.hash.length;
  for (let i = 0; i < Math.min(hash.length, user.hash.length); i++) diff |= hash.charCodeAt(i) ^ user.hash.charCodeAt(i);
  return diff === 0;
}

export const toPublic = ({ id, name, role, created_at }: StoredUser): PublicUser => ({ id, name, role, created_at });
