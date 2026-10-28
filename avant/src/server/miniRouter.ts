// Roteador mínimo para executar as rotas da API fora do Fastify (navegador e funções da Netlify).
import type { Router } from './routes';

type Handler = (req: any, reply: any) => Promise<unknown>;
interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

export class LocalRouter implements Router {
  routes: Route[] = [];
  private add(method: string, path: string, handler: Handler) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler });
  }
  get(p: string, h: Handler) {
    this.add('GET', p, h);
  }
  post(p: string, h: Handler) {
    this.add('POST', p, h);
  }
  patch(p: string, h: Handler) {
    this.add('PATCH', p, h);
  }
  delete(p: string, h: Handler) {
    this.add('DELETE', p, h);
  }
  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    const segs = path.split('/').filter(Boolean).map(decodeURIComponent);
    for (const route of this.routes) {
      if (route.method !== method || route.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      if (route.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = segs[i]), true) : p === segs[i]))) return { route, params };
    }
    return null;
  }
}
