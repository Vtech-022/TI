// Contas no arquivo HTML avulso: guardadas neste navegador. A senha nunca é guardada, só um resumo.
import type { AuthApi } from '../client/lib/runtime';
import { hashPassword, nameKey, StoredUser, toPublic, validateName, validatePassword, verifyPassword } from '../shared/auth';

const USERS = 'avant.contas';
const SESSION = 'avant.sessao';

function read(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS) ?? '[]');
  } catch {
    return [];
  }
}
function write(users: StoredUser[]) {
  try {
    localStorage.setItem(USERS, JSON.stringify(users));
  } catch {
    throw new Error('Este navegador não permite guardar dados. Abra o arquivo em outro navegador (Chrome ou Edge).');
  }
}

export const hasAccounts = () => read().length > 0;

const SESSION_HOURS = 12;

/** Sessão aberta neste computador: vale por 12 horas ou até clicar em Sair. */
export function sessionUser(): StoredUser | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION) ?? 'null') as { id: string; exp: number } | null;
    if (!s || s.exp < Date.now()) return null;
    return read().find((u) => u.id === s.id) ?? null;
  } catch {
    return null;
  }
}

function open(u: StoredUser) {
  try {
    localStorage.setItem(SESSION, JSON.stringify({ id: u.id, exp: Date.now() + SESSION_HOURS * 3_600_000 }));
  } catch {
    /* vale só nesta abertura */
  }
  return u;
}

export async function localLogin(name: string, password: string): Promise<StoredUser> {
  const u = read().find((x) => x.key === nameKey(name));
  if (!u || !(await verifyPassword(password, u))) throw new Error('Nome ou senha incorretos.');
  return open(u);
}

export async function localRegister(name: string, password: string): Promise<StoredUser> {
  const err = validateName(name) ?? validatePassword(password);
  if (err) throw new Error(err);
  const users = read();
  const key = nameKey(name);
  if (users.some((x) => x.key === key)) throw new Error('Já existe uma conta com esse nome. Use "Entrar" ou escolha outro nome.');
  const u: StoredUser = { id: crypto.randomUUID(), name: name.trim().replace(/\s+/g, ' '), key, ...(await hashPassword(password)), role: users.length ? 'membro' : 'admin', created_at: new Date().toISOString() };
  write([...users, u]);
  return open(u);
}

export function localAuthApi(me: StoredUser): AuthApi {
  const mustAdmin = () => {
    if (read().find((x) => x.id === me.id)?.role !== 'admin') throw new Error('Somente o administrador pode gerenciar usuários.');
  };
  return {
    me: toPublic(me),
    async logout() {
      try {
        localStorage.removeItem(SESSION);
      } catch {
        /* nada a limpar */
      }
    },
    async listUsers() {
      mustAdmin();
      return read().map(toPublic);
    },
    async updateUser(id, change) {
      mustAdmin();
      const users = read();
      const u = users.find((x) => x.id === id);
      if (!u) throw new Error('Conta não encontrada.');
      if (change.role === 'membro' && u.role === 'admin' && users.filter((x) => x.role === 'admin').length <= 1) throw new Error('É preciso ter pelo menos um administrador.');
      if (change.password !== undefined) {
        const err = validatePassword(change.password);
        if (err) throw new Error(err);
        Object.assign(u, await hashPassword(change.password));
      }
      if (change.role) u.role = change.role;
      write(users);
    },
    async removeUser(id) {
      mustAdmin();
      if (id === me.id) throw new Error('Você não pode excluir a própria conta.');
      const users = read();
      const u = users.find((x) => x.id === id);
      if (u?.role === 'admin' && users.filter((x) => x.role === 'admin').length <= 1) throw new Error('É preciso ter pelo menos um administrador.');
      write(users.filter((x) => x.id !== id));
    },
    async changePassword(current, next) {
      const users = read();
      const u = users.find((x) => x.id === me.id);
      if (!u || !(await verifyPassword(current, u))) throw new Error('A senha atual está incorreta.');
      const err = validatePassword(next);
      if (err) throw new Error(err);
      Object.assign(u, await hashPassword(next));
      write(users);
    }
  };
}
