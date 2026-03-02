import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  build: {
    outDir: '../dist/panel-ui',
    emptyOutDir: true,
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    // Dev proxy to the panel API
    proxy: {
      '/panel/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
});
