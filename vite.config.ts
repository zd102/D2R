import { defineConfig } from 'vite';

const target = `http://127.0.0.1:${process.env.D2R_API_PORT ?? 3001}`;
export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { '/api': { target, changeOrigin: false } } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': { target, changeOrigin: false } } },
});
