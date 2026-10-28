// Quadro da equipe no arquivo HTML avulso: tudo fica guardado neste navegador (IndexedDB).
import type { TeamActivity, TeamAttachment, TeamMember, TeamStore } from '../client/lib/runtime';
import { idbGet, idbSet } from './persist';

const BOARD = 'equipe:quadro';
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
type Board = Record<string, { name: string; items: TeamActivity[] }>;

export function createLocalTeamStore(me: { id: string; name: string; role: 'admin' | 'membro' }): TeamStore {
  const urls = new Map<string, string>();
  const listeners = new Set<(m: TeamMember[]) => void>();

  const load = async (): Promise<Board> => (await idbGet<Board>(BOARD)) ?? {};
  const toMembers = (b: Board): TeamMember[] => Object.entries(b).map(([id, m]) => ({ id, name: m.name, avatarUrl: null, isMe: id === me.id, items: m.items }));
  const preload = async (b: Board) => {
    for (const m of Object.values(b))
      for (const it of m.items)
        for (const a of it.attachments ?? []) {
          if (urls.has(a.id)) continue;
          const blob = await idbGet<Blob>(`anexo:${a.id}`);
          if (blob) urls.set(a.id, URL.createObjectURL(blob));
        }
  };
  const save = async (memberId: string, items: TeamActivity[]) => {
    const b = await load();
    b[memberId] = { name: memberId === me.id ? me.name : (b[memberId]?.name ?? 'Colaborador'), items };
    if (!(await idbSet(BOARD, b))) throw new Error('Não foi possível salvar neste navegador.');
    listeners.forEach((f) => f(toMembers(b)));
  };

  return {
    async me() {
      return { id: me.id, canWrite: true, name: me.name, isOwner: me.role === 'admin', canUpload: true };
    },
    subscribe(onChange) {
      listeners.add(onChange);
      void load().then(async (b) => {
        await preload(b);
        onChange(toMembers(b));
      });
      return () => listeners.delete(onChange);
    },
    saveMine: (items) => save(me.id, items),
    saveFor: (memberId, items) => save(memberId, items),
    async upload(file) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) throw new Error(`"${file.name}": arquivos do Office não são aceitos como anexo. Salve como PDF e envie novamente.`);
      const type = TYPES[ext];
      if (!type) throw new Error(`"${file.name}": formato não aceito. Use foto (PNG, JPG, GIF, WEBP), vídeo (MP4, WEBM), PDF ou texto (TXT, CSV, MD, JSON).`);
      if (file.size > 20 * 1024 * 1024) throw new Error(`"${file.name}" passa de 20 MB.`);
      const id = crypto.randomUUID().replace(/-/g, '');
      const blob = new Blob([await file.arrayBuffer()], { type });
      if (!(await idbSet(`anexo:${id}`, blob))) throw new Error('Não foi possível guardar o arquivo neste navegador.');
      urls.set(id, URL.createObjectURL(blob));
      return { id, name: file.name, type, size: file.size, uploaded_at: new Date().toISOString() };
    },
    fileUrl(att: TeamAttachment) {
      return urls.get(att.id) ?? '';
    },
    async download(att) {
      const href = urls.get(att.id);
      if (!href) throw new Error('Arquivo não encontrado neste navegador.');
      const a = document.createElement('a');
      a.href = href;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };
}
