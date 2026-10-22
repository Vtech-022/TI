declare module 'sql.js/dist/sql-asm-memory-growth.js' {
  const init: (config?: unknown) => Promise<any>;
  export default init;
}
declare module 'mammoth/mammoth.browser.js' {
  const m: { extractRawText(o: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };
  export default m;
}
declare module 'exceljs/dist/exceljs.min.js' {
  const e: any;
  export default e;
}
declare module '*?raw' {
  const s: string;
  export default s;
}
interface Window {
  claude?: { use(name: string): Promise<any> };
  __avantLocal?: (method: string, url: string, body?: unknown) => Promise<{ status: number; data: unknown }>;
}
