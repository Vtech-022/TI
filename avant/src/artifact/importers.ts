// Importação no navegador: mesmas regras do servidor, bibliotecas em versão para navegador.
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import mammoth from 'mammoth/mammoth.browser.js';
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
import { cellText, ExtractedFile, extractWith, pdfPageText } from '../server/importers/core';

let workerUrl: string | null = null;

const libs = {
  async xlsx(buf: Uint8Array) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const sheets: string[][][] = [];
    wb.eachSheet((ws: any) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (r: any) => {
        const vals: string[] = [];
        for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(r.getCell(c).value));
        rows.push(vals);
      });
      sheets.push(rows);
    });
    return sheets;
  },
  async docx(buf: Uint8Array) {
    return (await mammoth.extractRawText({ arrayBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer })).value;
  },
  async pdf(buf: Uint8Array) {
    const pdfjs = await import('pdfjs-dist');
    if (!workerUrl) {
      workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    const task = pdfjs.getDocument({ data: buf, verbosity: 0 });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) pages.push(pdfPageText((await (await doc.getPage(p)).getTextContent()).items as any[]));
    await task.destroy();
    return pages.join('\n\n');
  }
};

export function extractFileText(filename: string, buf: Uint8Array): Promise<ExtractedFile> {
  return extractWith(libs, filename, buf);
}
