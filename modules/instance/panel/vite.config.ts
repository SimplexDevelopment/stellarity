import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/panel/',
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
    // Dev proxy to the instance server (panel is mounted at /panel)
    proxy: {
      '/panel/api': {
        target: 'http://localhost:4150',
        changeOrigin: true,
      },
    },
  },
});
