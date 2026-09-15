import { defineConfig } from 'vite';
import { localEntryPlugin } from './scripts/local-entry-server.mjs';

const target = `http://127.0.0.1:${process.env.D2R_API_PORT ?? 3001}`;
export default defineConfig({
  plugins: [localEntryPlugin()],
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/.verification/**'] }, proxy: { '/api': { target, changeOrigin: false } } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': { target, changeOrigin: false } } },
});
