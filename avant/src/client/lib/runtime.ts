// Modo de execução: servidor Node local ou edição online (tudo no navegador).
import type { ComponentType } from 'react';

declare global {
  interface Window {
    __avantLocal?: (method: string, url: string, body?: unknown) => Promise<{ status: number; data: unknown }>;
  }
}

export type TeamStatus = 'a_fazer' | 'em_andamento' | 'concluida';

export interface TeamActivity {
  id: string;
  title: string;
  status: TeamStatus;
  due: string | null;
  project: string | null;
  notes: string | null;
  updated_at: string;
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
  me(): Promise<{ id: string | null; canWrite: boolean; name: string }>;
  subscribe(onChange: (members: TeamMember[]) => void, onError: (message: string) => void): () => void;
  saveMine(items: TeamActivity[]): Promise<void>;
}

export const runtime: { mode: 'servidor' | 'online'; Status?: ComponentType; team?: TeamStore } = { mode: 'servidor' };
