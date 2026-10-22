// Cliente HTTP com tratamento centralizado de erros.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  // Edição online: a API roda dentro do próprio navegador.
  if (window.__avantLocal) {
    const r = await window.__avantLocal(method, url, body);
    const d = r.data as any;
    if (r.status >= 400) throw new ApiError(r.status, d?.error ?? 'erro', d?.message ?? `Erro ${r.status}`, d?.details);
    return d as T;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'sem_conexao', 'Não foi possível conectar ao servidor do AVANT. Verifique se ele está em execução.');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'erro', data?.message ?? `Erro ${res.status}`, data?.details);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body ?? {}),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form)
};

export function qs(params: Record<string, string | number | undefined | null | false>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
