// Função Netlify (v2) que atende todas as rotas /api/*.
import { handle } from "./lib/app.mjs";
import { createNetlifyStore } from "./lib/store.mjs";

export default async (request) => {
  // O token de acesso ao Netlify Blobs é válido só por um tempo e vem do contexto de
  // cada execução: a conexão NÃO pode ser guardada entre requisições (dava "Token expired").
  const ctx = { store: createNetlifyStore("avant"), env: process.env };
  return handle(request, ctx);
};

export const config = { path: "/api/*" };
