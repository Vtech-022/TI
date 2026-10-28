// Regras de conta e segurança do AVANT: senha, e-mail, nome, resumo de senha e sessões.

import { pbkdf2, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

export const PBKDF2_ITERATIONS = 150_000;
export const SESSION_DAYS = 30;
export const MAX_ATTEMPTS = 5;
export const LOCK_SECONDS = 60;

/** Regra da senha (idêntica à da interface): no mínimo 7 caracteres, com 1 letra, 1 número e 1 especial, sem espaços. */
export function passwordError(p) {
  if (typeof p !== "string") return "Informe a senha.";
  if (p.length < 7) return "A senha deve ter no mínimo 7 caracteres.";
  if (p.length > 64) return "A senha deve ter no máximo 64 caracteres.";
  if (/\s/.test(p)) return "A senha não pode ter espaços.";
  if (!/\p{L}/u.test(p)) return "A senha precisa ter pelo menos uma letra.";
  if (!/\d/.test(p)) return "A senha precisa ter pelo menos um número.";
  if (!/[^\p{L}\d\s]/u.test(p)) return "A senha precisa ter pelo menos um caractere especial (ex.: @ # ! $ %).";
  return null;
}

export function nameError(n) {
  if (typeof n !== "string") return "Informe seu nome completo.";
  const t = n.trim().replace(/\s+/g, " ");
  if (t.length < 2) return "Informe seu nome completo (pelo menos 2 letras).";
  if (t.length > 60) return "Nome muito longo (máximo 60 caracteres).";
  return null;
}

export function normalizeName(n) {
  return String(n).trim().replace(/\s+/g, " ");
}

/** Chave de identificação por nome: sem acentos, sem diferenciar maiúsculas/minúsculas. */
export function nameKey(n) {
  return normalizeName(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return { salt: salt.toString("hex"), hash: hash.toString("hex"), iter: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password, rec) {
  const iter = rec.iter ?? PBKDF2_ITERATIONS;
  const salt = Buffer.from(rec.salt, "hex");
  const hash = await pbkdf2Async(password, salt, iter, 32, "sha256");
  const expected = Buffer.from(rec.hash, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function newId() {
  return randomBytes(12).toString("hex");
}

export function cookieHeader(token, { secure = true, maxAgeSeconds = SESSION_DAYS * 86400 } = {}) {
  return [
    `avant_session=${token}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearCookieHeader({ secure = true } = {}) {
  return cookieHeader("", { secure, maxAgeSeconds: 0 });
}

export function readCookie(request, name) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
