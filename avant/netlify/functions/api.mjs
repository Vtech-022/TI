// Função Netlify (v2) que atende todas as rotas /api/*.
import { handle } from "./lib/app.mjs";
import { createNetlifyStore } from "./lib/store.mjs";

let ctx;

export default async (request) => {
  ctx ??= { store: createNetlifyStore("avant"), env: process.env };
  return handle(request, ctx);
};

export const config = { path: "/api/*" };
