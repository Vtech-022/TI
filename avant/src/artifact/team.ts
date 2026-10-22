// Atividades da equipe no armazenamento compartilhado do artifact.
// Cada pessoa grava apenas o próprio documento `atividades/<id>`; todos com acesso leem.
import type { TeamActivity, TeamMember, TeamStore } from '../client/lib/runtime';

export function createTeamStore(): TeamStore {
  const caps = async () => {
    const c = window.claude;
    if (!c) return { db: null, user: null };
    const [db, user] = await Promise.all([c.use('db').catch(() => null), c.use('user').catch(() => null)]);
    return { db, user };
  };

  return {
    async me() {
      const { db, user } = await caps();
      if (!db || !user) return { id: null, canWrite: false, name: '' };
      const [id, can, name] = await Promise.all([user.id(), user.can('data.write'), user.name()]);
      return { id, canWrite: !!id && can !== false, name: name || '' };
    },

    subscribe(onChange, onError) {
      let stop: (() => void) | null = null;
      let alive = true;
      (async () => {
        const { db, user } = await caps();
        if (!alive) return;
        if (!db || !user) {
          onError('As atividades da equipe precisam do armazenamento compartilhado, indisponível nesta visualização.');
          return;
        }
        const myId = await user.id();
        stop = db.collection('atividades').onSnapshot(
          async (snap: any) => {
            const docs = snap.docs.filter((d: any) => d.exists);
            const ids = docs.map((d: any) => d.id);
            const profiles = ids.length ? await user.profiles(ids) : {};
            const members: TeamMember[] = docs.map((d: any) => {
              const data = d.data() as { items?: TeamActivity[] };
              const p = profiles[d.id];
              return { id: d.id, name: p?.name || 'Colaborador', avatarUrl: p?.avatarUrl ?? null, isMe: d.id === myId, items: Array.isArray(data.items) ? data.items : [] };
            });
            if (alive) onChange(members);
          },
          (e: any) => onError(e?.message ?? 'Falha ao ler as atividades da equipe.')
        );
      })();
      return () => {
        alive = false;
        stop?.();
      };
    },

    async saveMine(items) {
      const { db, user } = await caps();
      const id = user ? await user.id() : null;
      if (!db || !id) throw new Error('Entre com sua conta para registrar atividades.');
      try {
        await db.doc(`atividades/${id}`).set({ items, updated_at: new Date().toISOString() });
      } catch (e: any) {
        if (e?.code === 'invalid_argument') throw new Error('Seu acesso a esta página é somente leitura. Peça ao responsável acesso de colaborador.');
        throw new Error(e?.message ?? 'Não foi possível salvar.');
      }
    }
  };
}
