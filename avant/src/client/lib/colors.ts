// Paleta de etiquetas vivas e complementares (estilo quadro de tarefas).
export const LABEL_COLORS = ['#1f845a', '#0c66e4', '#e56910', '#ae2e24', '#6e5dc6', '#227d9b', '#5b7f24', '#c9372c', '#943d73', '#b38600'];

export function labelColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
