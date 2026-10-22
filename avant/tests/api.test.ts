import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDocx } from './fixtures';
import { makeApp } from './helpers';

function multipart(files: { name: string; data: Buffer }[], fields: Record<string, string> = {}) {
  const boundary = '----avant' + crypto.randomBytes(6).toString('hex');
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(f.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('API HTTP', () => {
  it('painel calculado a partir do banco', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.today).toBe('2026-10-22');
    expect(d.counts.open).toBe(20);
    expect(d.counts.waiting).toBe(2);
    expect(d.counts.inferred_dates).toBe(1);
    expect(d.counts.critical).toBe(0);
    expect(d.focus.length).toBeGreaterThan(0);
    expect(d.focus.every((f: any) => !f.task.is_blocked)).toBe(true);
    expect(d.projects).toHaveLength(3);
  });

  it('valida entradas e responde erros úteis', async () => {
    const { app } = await makeApp();
    const bad = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'x', due_date: '2026-02-30' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toMatch(/título|Data inválida/);
    expect((await app.inject({ method: 'GET', url: '/api/tasks/9999' })).statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: '/api/tasks/1', payload: {} });
    expect(del.statusCode).toBe(400);
    const prio = await app.inject({ method: 'POST', url: '/api/tasks/1/priority', payload: { priority: 'critica' } });
    expect(prio.statusCode).toBe(400);
  });

  it('CRUD de tarefa com edição manual de prazo marcada como confirmada', async () => {
    const { app } = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Preparar pauta da reunião' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const patched = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload: { due_date: '2026-10-23' } });
    expect(patched.json()).toMatchObject({ due_date: '2026-10-23', certainty: { due_date: 'confirmada' } });
    const detail = (await app.inject({ method: 'GET', url: `/api/tasks/${id}` })).json();
    expect(detail.task.priority).toBe('alta');
    expect(detail.history.map((h: any) => h.operation)).toEqual(['prioridade_recalculada', 'atualizada', 'criada']);
    expect(detail.history[0].summary).toContain('Normal → Alta');
    const done = await app.inject({ method: 'POST', url: `/api/tasks/${id}/status`, payload: { status: 'concluida' } });
    expect(done.json().status).toBe('concluida');
  });

  it('bloqueio de conclusão retorna as pendências', async () => {
    const { app, ctx } = await makeApp();
    const id = (ctx.db.prepare("SELECT id FROM tasks WHERE title LIKE 'Validar as versões%'").get() as any).id;
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/status`, payload: { status: 'concluida' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().details.blockers).toHaveLength(3);
  });

  it('captura com pré-visualização e gravação', async () => {
    const { app } = await makeApp();
    const text = '- Montar cronograma do seminário até 06/11/2026\n- Pedir orçamento à gráfica';
    const preview = (await app.inject({ method: 'POST', url: '/api/captures', payload: { text, dry_run: true } })).json();
    expect(preview.capture_id).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/captures' })).json()).toHaveLength(0);
    const saved = (await app.inject({ method: 'POST', url: '/api/captures', payload: { text } })).json();
    expect(saved.stats.nova_tarefa).toBe(2);
    const undo = await app.inject({ method: 'POST', url: `/api/captures/${saved.capture_id}/undo` });
    expect(undo.json().undone).toBeGreaterThanOrEqual(2);
  });

  it('upload preserva o original, extrai texto e alimenta a captura', async () => {
    const { app, ctx } = await makeApp();
    const docx = await makeDocx(['Encaminhamentos:', '- Revisar o regimento interno até 05/11/2026', '- Agendar visita técnica ao CRI Norte']);
    const mp = multipart([{ name: 'encaminhamentos.docx', data: docx }], { capture: '1' });
    const res = await app.inject({ method: 'POST', url: '/api/documents', payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(201);
    const [r] = res.json();
    expect(r.document.parse_status).toBe('ok');
    expect(r.capture.stats.nova_tarefa).toBeGreaterThanOrEqual(1);
    const stored = ctx.db.prepare('SELECT storage_path, sha256 FROM documents WHERE id = ?').get(r.document.id) as any;
    const file = fs.readFileSync(path.join(ctx.dataDir, stored.storage_path));
    expect(crypto.createHash('sha256').update(file).digest('hex')).toBe(crypto.createHash('sha256').update(docx).digest('hex'));
    const dl = await app.inject({ method: 'GET', url: `/api/documents/${r.document.id}/file` });
    expect(dl.rawPayload.equals(docx)).toBe(true);
    // Remover do AVANT mantém o arquivo físico
    await app.inject({ method: 'DELETE', url: `/api/documents/${r.document.id}`, payload: { confirm: true } });
    expect(fs.existsSync(path.join(ctx.dataDir, stored.storage_path))).toBe(true);
  });

  it('upload rejeita formato não suportado sem perder os demais dados', async () => {
    const { app } = await makeApp();
    const mp = multipart([{ name: 'foto.png', data: Buffer.from([0x89, 0x50]) }]);
    const [r] = (await app.inject({ method: 'POST', url: '/api/documents', payload: mp.payload, headers: mp.headers })).json();
    expect(r.document.parse_status).toBe('nao_suportado');
    expect(r.document.parse_error).toMatch(/não suportado/);
  });

  it('agenda via API: interpretação, criação e conflito', async () => {
    const { app } = await makeApp();
    const draft = (await app.inject({ method: 'POST', url: '/api/events/parse', payload: { text: 'Treinamento na terça-feira às 14h com a equipe.' } })).json();
    expect(draft).toMatchObject({ date: '2026-10-27', start: '14:00' });
    const a = await app.inject({ method: 'POST', url: '/api/events', payload: { title: 'Treinamento', type: 'treinamento', start_at: '2026-10-27T17:00:00.000Z' } });
    expect(a.statusCode).toBe(201);
    const b = (await app.inject({ method: 'POST', url: '/api/events', payload: { title: 'Reunião', type: 'reuniao', start_at: '2026-10-27T17:30:00.000Z', end_at: '2026-10-27T18:30:00.000Z' } })).json();
    expect(b.conflicts).toHaveLength(1);
    const alerts = (await app.inject({ method: 'GET', url: '/api/alerts' })).json();
    expect(alerts.some((x: any) => x.kind === 'conflito_agenda')).toBe(true);
  });

  it('pesquisa, relatórios, histórico e exportação', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/search?q=luciana' })).json()[0]).toMatchObject({ type: 'person' });
    const rep = (await app.inject({ method: 'GET', url: '/api/reports' })).json();
    expect(rep.totals).toMatchObject({ tasks: 20, open: 20, completed: 0 });
    expect(rep.by_priority).toMatchObject({ alta: 17, normal: 3 });
    const hist = (await app.inject({ method: 'GET', url: '/api/history?entity_type=task' })).json();
    expect(hist.length).toBeGreaterThan(0);
    const exp = await app.inject({ method: 'GET', url: '/api/export' });
    expect(exp.headers['content-disposition']).toContain('avant-backup-2026-10-22.json');
    expect(exp.json().tasks).toHaveLength(20);
  });
});
