// Modo de execução: servidor Node local ou edição online (tudo no navegador).
import type { ComponentType } from 'react';

declare global {
  interface Window {
    __avantLocal?: (method: string, url: string, body?: unknown) => Promise<{ status: number; data: unknown }>;
  }
}

export type TeamStatus = 'a_fazer' | 'em_andamento' | 'concluida';

export interface TeamAttachment {
  id: string; // id do arquivo no armazenamento da página
  name: string;
  type: string;
  size: number;
  uploaded_at: string;
}

export interface TeamActivity {
  id: string;
  title: string;
  status: TeamStatus;
  due: string | null;
  project: string | null;
  notes: string | null;
  /** Tipo: rotina, projeto_novo, viagem, reuniao, treinamento, suporte, outro. */
  kind?: string | null;
  updated_at: string;
  created_at?: string;
  /** Quando entrou em "Concluída"; após 15 dias o cartão vai para Excluídos. */
  completed_at?: string | null;
  /** Exclusão recuperável: o cartão fica em Excluídos até ser restaurado. */
  deleted_at?: string | null;
  attachments?: TeamAttachment[];
}

export interface TeamMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  isMe: boolean;
  items: TeamActivity[];
}

/** Atividades compartilhadas: cada colaborador grava somente as próprias. */
export interface TeamStore {
  me(): Promise<{ id: string | null; canWrite: boolean; name: string; isOwner: boolean; canUpload: boolean }>;
  subscribe(onChange: (members: TeamMember[]) => void, onError: (message: string) => void): () => void;
  saveMine(items: TeamActivity[]): Promise<void>;
  /** Grava as atividades de outra pessoa (permitido apenas ao dono da página). */
  saveFor(memberId: string, items: TeamActivity[]): Promise<void>;
  upload(file: File): Promise<TeamAttachment>;
  fileUrl(att: TeamAttachment): string;
  download(att: TeamAttachment): Promise<void>;
}

/** Contas de usuário (versão compartilhada e arquivo HTML). */
export interface AuthApi {
  me: { id: string; name: string; role: 'admin' | 'membro' };
  logout(): Promise<void>;
  listUsers(): Promise<{ id: string; name: string; role: 'admin' | 'membro'; created_at: string }[]>;
  updateUser(id: string, change: { role?: 'admin' | 'membro'; password?: string }): Promise<void>;
  removeUser(id: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

export const runtime: {
  mode: 'servidor' | 'online' | 'compartilhado';
  Status?: ComponentType;
  team?: TeamStore;
  /** Nome de quem está usando (versão compartilhada); nas demais, o sistema é do Victor. */
  userName?: string;
  auth?: AuthApi;
} = { mode: 'servidor' };

export const isAdmin = () => runtime.auth?.me.role === 'admin';

export const userName = () => runtime.userName || 'Victor';
