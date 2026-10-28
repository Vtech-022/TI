// Quadro da equipe na versão compartilhada: lido e gravado pela API, atualizado ao vivo.
import type { TeamActivity, TeamAttachment, TeamMember, TeamStore } from '../client/lib/runtime';
import { onLive } from './live';

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
const MAX = 4 * 1024 * 1024;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? `Erro ${res.status}`);
  return data as T;
}

export function createHttpTeamStore(identity: { id: string; name: string; role: 'admin' | 'membro' }): TeamStore {
  const save = (memberId: string, items: TeamActivity[], name?: string) =>
    call('/api/team/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, items, name }) }).then(() => {
      window.dispatchEvent(new Event('avant:live-poll'));
    });

  return {
    async me() {
      return { id: identity.id, canWrite: true, name: identity.name, isOwner: identity.role === 'admin', canUpload: true };
    },

    subscribe(onChange, onError) {
      let alive = true;
      const load = async () => {
        try {
          const r = await call<{ members: (Omit<TeamMember, 'isMe' | 'avatarUrl'> & { items: TeamActivity[] })[] }>('/api/team');
          if (alive) onChange(r.members.map((m) => ({ id: m.id, name: m.name, avatarUrl: null, isMe: m.id === identity.id, items: Array.isArray(m.items) ? m.items : [] })));
        } catch (e: any) {
          if (alive) onError(e?.message ?? 'Falha ao ler as atividades da equipe.');
        }
      };
      void load();
      const off = onLive((what) => what === 'team' && void load());
      return () => {
        alive = false;
        off();
      };
    },

    saveMine(items) {
      return save(identity.id, items, identity.name);
    },

    saveFor(memberId, items) {
      return save(memberId, items, memberId === identity.id ? identity.name : undefined);
    },

    async upload(file) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) throw new Error(`"${file.name}": arquivos do Office não são aceitos como anexo. Salve como PDF e envie novamente.`);
      const type = TYPES[ext];
      if (!type) throw new Error(`"${file.name}": formato não aceito. Use foto (PNG, JPG, GIF, WEBP), vídeo (MP4, WEBM), PDF ou texto (TXT, CSV, MD, JSON).`);
      if (file.size > MAX) throw new Error(`"${file.name}" passa de 4 MB, o limite desta versão on-line.`);
      return call<TeamAttachment>('/api/team/files', { method: 'POST', headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(file.name) }, body: file });
    },

    fileUrl(att) {
      return `/api/team/files/${att.id}`;
    },

    async download(att) {
      const a = document.createElement('a');
      a.href = `/api/team/files/${att.id}?baixar=1`;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };
}
