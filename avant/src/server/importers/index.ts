// Importação no Node: exceljs, mammoth e pdf.js.
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { cellText, ExtractedFile, extractWith, pdfPageText } from './core';

export * from './core';

const libs = {
  async xlsx(buf: Uint8Array) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf) as any);
    const sheets: string[][][] = [];
    wb.eachSheet((ws) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (r) => {
        const vals: string[] = [];
        for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(r.getCell(c).value));
        rows.push(vals);
      });
      sheets.push(rows);
    });
    return sheets;
  },
  async docx(buf: Uint8Array) {
    return (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
  },
  async pdf(buf: Uint8Array) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, disableFontFace: true, verbosity: 0 });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) pages.push(pdfPageText((await (await doc.getPage(p)).getTextContent()).items as any[]));
    await doc.cleanup();
    await task.destroy();
    return pages.join('\n\n');
  }
};

export function extractFileText(filename: string, buf: Uint8Array): Promise<ExtractedFile> {
  return extractWith(libs, filename, buf);
}
