import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versão compartilhada para a Netlify: interface estática + função /api/*.
export default defineConfig({
  root: 'src/netlify',
  publicDir: '../client/public',
  plugins: [react()],
  build: { outDir: '../../dist/netlify', emptyOutDir: true }
});
