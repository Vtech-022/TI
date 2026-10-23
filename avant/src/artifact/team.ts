// Atividades da equipe no armazenamento compartilhado da página.
// Cada pessoa grava o próprio documento `atividades/<id>`; o dono da página pode ajustar qualquer um.
import type { TeamActivity, TeamAttachment, TeamMember, TeamStore } from '../client/lib/runtime';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  txt: 'text/plain'
};

export function createTeamStore(): TeamStore {
  const caps = async () => {
    const c = window.claude;
    if (!c) return { db: null, user: null, assets: null };
    const [db, user, assets] = await Promise.all([c.use('db').catch(() => null), c.use('user').catch(() => null), c.use('assets').catch(() => null)]);
    return { db, user, assets };
  };

  const write = async (memberId: string, items: TeamActivity[]) => {
    const { db } = await caps();
    if (!db) throw new Error('Armazenamento compartilhado indisponível.');
    try {
      await db.doc(`atividades/${memberId}`).set({ items, updated_at: new Date().toISOString() });
    } catch (e: any) {
      if (e?.code === 'invalid_argument') throw new Error('Você não tem permissão para alterar estes cartões. Peça ao responsável acesso de colaborador.');
      if (e?.code === 'quota_exceeded') throw new Error('O armazenamento da equipe está cheio.');
      throw new Error(e?.message ?? 'Não foi possível salvar.');
    }
  };

  return {
    async me() {
      const { db, user, assets } = await caps();
      if (!db || !user) return { id: null, canWrite: false, name: '', isOwner: false, canUpload: false };
      const [id, can, name, isOwner] = await Promise.all([user.id(), user.can('data.write'), user.name(), user.isOwner()]);
      return { id, canWrite: !!id && can !== false, name: name || '', isOwner: !!isOwner, canUpload: !!assets };
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
      const { user } = await caps();
      const id = user ? await user.id() : null;
      if (!id) throw new Error('Entre com sua conta para registrar atividades.');
      await write(id, items);
    },

    async saveFor(memberId, items) {
      await write(memberId, items);
    },

    async upload(file) {
      const { assets } = await caps();
      if (!assets) throw new Error('Envio de arquivos indisponível para o seu acesso.');
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      if (ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx' || ext === 'ppt' || ext === 'pptx') {
        throw new Error(`"${file.name}": arquivos do Office não são aceitos como anexo. Salve como PDF e envie novamente.`);
      }
      const type = TYPES[ext];
      if (!type) throw new Error(`"${file.name}": formato não aceito. Use foto (PNG, JPG, GIF, WEBP), vídeo (MP4, WEBM), PDF ou texto (TXT, CSV, MD, JSON).`);
      if (file.size > 20 * 1024 * 1024) throw new Error(`"${file.name}" passa de 20 MB.`);
      try {
        const r = await assets.upload(file, { type });
        return { id: r.id, name: file.name, type: r.contentType || type, size: r.sizeBytes ?? file.size, uploaded_at: new Date().toISOString() };
      } catch (e: any) {
        const msg: Record<string, string> = {
          too_large: 'O arquivo é grande demais.',
          unsupported_type: 'Formato de arquivo não aceito.',
          quota_or_state: 'O espaço de arquivos da página está cheio.',
          rate_limited: 'Muitos envios seguidos. Aguarde um instante.'
        };
        throw new Error(`"${file.name}": ${msg[e?.code] ?? e?.message ?? 'falha no envio.'}`);
      }
    },

    fileUrl(att: TeamAttachment) {
      return `/_blob/${att.id}`;
    },

    async download(att) {
      const dl = await window.claude?.use('downloads').catch(() => null);
      if (!dl) throw new Error('Downloads não estão disponíveis nesta visualização.');
      const res = await fetch(`/_blob/${att.id}`);
      if (!res.ok) throw new Error('Não foi possível obter o arquivo.');
      try {
        await dl.save({ filename: att.name, data: await res.blob() });
      } catch (e: any) {
        if (e?.code !== 'declined') throw new Error(e?.message ?? 'Download não concluído.');
      }
    }
  };
}
