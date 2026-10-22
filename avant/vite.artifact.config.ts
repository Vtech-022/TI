import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Edição online: um único arquivo JavaScript, sem divisão de código, para publicar como artifact.
export default defineConfig({
  root: 'src/artifact',
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: '../../dist/artifact',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
