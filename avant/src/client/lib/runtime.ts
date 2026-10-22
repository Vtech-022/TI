// Modo de execução: servidor Node local ou edição online (tudo no navegador).
import type { ComponentType } from 'react';

declare global {
  interface Window {
    __avantLocal?: (method: string, url: string, body?: unknown) => Promise<{ status: number; data: unknown }>;
  }
}

export const runtime: { mode: 'servidor' | 'online'; Status?: ComponentType } = { mode: 'servidor' };
