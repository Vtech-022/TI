import { describe, expect, it } from 'vitest';
import { extractFileText, parseCsv } from '../src/server/importers';
import { makeDocx, makePdf, makeXlsx } from './fixtures';

describe('importação de arquivos', () => {
  it('TXT em UTF-8 e em Latin-1', async () => {
    const utf = await extractFileText('notas.txt', Buffer.from('Revisar a ata até sexta\nEnviar relatório', 'utf8'));
    expect(utf).toMatchObject({ status: 'ok', text: 'Revisar a ata até sexta\nEnviar relatório' });
    const latin = await extractFileText('notas.txt', Buffer.from('Reunião com a coordenação', 'latin1'));
    expect(latin.text).toBe('Reunião com a coordenação');
  });

  it('CSV com colunas reconhecidas vira frases estruturadas', async () => {
    const csv = 'Tarefa;Prazo;Responsável;Projeto\n"Revisar contrato; versão 2";30/10/2026;Marcos;Compras\nLigar para fornecedor;;;\n';
    expect(parseCsv(csv)[1]).toEqual(['Revisar contrato; versão 2', '30/10/2026', 'Marcos', 'Compras']);
    const r = await extractFileText('lista.csv', Buffer.from(csv));
    expect(r.text).toBe('- Revisar contrato; versão 2 — responsável: Marcos — projeto: Compras — até 30/10/2026\n- Ligar para fornecedor');
  });

  it('XLSX', async () => {
    const buf = await makeXlsx([
      ['Atividade', 'Data limite', 'Responsável'],
      ['Atualizar planilha de metas', new Date(Date.UTC(2026, 10, 3)), 'Rogério']
    ]);
    const r = await extractFileText('metas.xlsx', buf);
    expect(r).toMatchObject({ status: 'ok', text: '- Atualizar planilha de metas — responsável: Rogério — até 03/11/2026' });
  });

  it('DOCX', async () => {
    const r = await extractFileText('ata.docx', await makeDocx(['Encaminhamentos:', '- Revisar o regimento até 05/11/2026', '- Agendar reunião com a diretoria']));
    expect(r.status).toBe('ok');
    expect(r.text).toContain('Revisar o regimento até 05/11/2026');
    expect(r.text).toContain('Agendar reunião com a diretoria');
  });

  it('PDF com texto e PDF sem texto selecionável', async () => {
    const r = await extractFileText('pauta.pdf', makePdf(['Revisar o relatorio financeiro ate 30/10/2026', 'Enviar convite aos participantes']));
    expect(r.status).toBe('ok');
    expect(r.text).toContain('Revisar o relatorio financeiro ate 30/10/2026');
    expect(r.text).toContain('Enviar convite aos participantes');
    const scanned = await extractFileText('digitalizado.pdf', makePdf([]));
    expect(scanned.status).toBe('sem_texto');
    expect(scanned.error).toMatch(/OCR/);
  });

  it('informa formatos não suportados e arquivos com extensão trocada', async () => {
    expect((await extractFileText('imagem.png', Buffer.from([1, 2, 3]))).status).toBe('nao_suportado');
    const fake = await extractFileText('falso.pdf', Buffer.from('não sou um pdf'));
    expect(fake).toMatchObject({ status: 'erro', error: 'O arquivo não é um PDF válido.' });
    const fakeDocx = await extractFileText('falso.docx', Buffer.from('texto'));
    expect(fakeDocx.status).toBe('erro');
    const binTxt = await extractFileText('bin.txt', Buffer.from([0x41, 0x00, 0x42]));
    expect(binTxt.status).toBe('erro');
  });
});
