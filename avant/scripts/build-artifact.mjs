// Gera dist/artifact/avant.html: página única (JS e CSS embutidos) para publicar como artifact.
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist/artifact/assets';
const files = fs.readdirSync(dir);
const js = fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD');
const css = fs.readFileSync(path.join(dir, files.find((f) => f.endsWith('.css'))), 'utf8').replace(/<\/style/gi, '<\\/style');

const page = `<title>AVANT</title>
<meta name="description" content="AVANT — Central Inteligente de Gestão">
<style>
:root { color-scheme: light; }
${css}
.boot { min-height: 60vh; display: grid; place-items: center; font-family: var(--font); color: var(--text-2); padding: 24px; text-align: center; }
.boot.error { color: var(--critica); }
</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
fs.writeFileSync('dist/artifact/avant.html', page);
console.log(`dist/artifact/avant.html: ${(page.length / 1048576).toFixed(2)} MB`);

// Arquivo HTML avulso: abre com dois cliques, sem servidor; dados ficam no navegador.
const standalone = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(fs.readFileSync('src/client/public/favicon.svg', 'utf8').trim())}">
${page.replace('<div id="root"></div>', '</head>\n<body>\n<div id="root"></div>')}</body>
</html>
`;
fs.writeFileSync('dist/AVANT.html', standalone);
console.log(`dist/AVANT.html: ${(standalone.length / 1048576).toFixed(2)} MB`);
