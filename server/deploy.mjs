import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { access } from 'node:fs/promises';
import staticFiles from '@fastify/static';
import { createApp } from './app.ts';
import { entryOrigin } from '../scripts/local-entry-server.mjs';

export async function createDeployment({ root, filename, port, secureCookies = false, origins, localOrigin }) {
  await access(resolve(root, 'index.html'));
  return createApp({ filename, secureCookies, origins, configure: async app => {
    await app.register(staticFiles, { root, dotfiles: 'deny', maxAge: 0 });
    app.get('/__local-entry', async (request, reply) => {
      const hosts = Object.values(networkInterfaces()).flat().filter(Boolean).map(value => value.address);
      reply.header('Cache-Control', 'no-store');
      return { canonicalOrigin: localOrigin || entryOrigin(request.socket.remoteAddress, port, hosts),
        origins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`] };
    });
  } });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.D2R_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('D2R_PORT must be between 1 and 65535');
  if (!process.env.D2R_DATABASE) throw new Error('D2R_DATABASE must specify a persistent database path');
  const app = await createDeployment({
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../dist'),
    filename: resolve(process.env.D2R_DATABASE), port,
    secureCookies: process.env.D2R_SECURE_COOKIES === 'true',
    origins: process.env.D2R_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
    localOrigin: process.env.D2R_LOCAL_ORIGIN,
  });
  try {
    await app.listen({ host: process.env.D2R_HOST ?? '0.0.0.0', port });
    console.log(`D2R server listening on port ${port}`);
  } catch (error) { await app.close(); throw error; }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    app.close().catch(error => { console.error(error); process.exitCode = 1; });
  });
}
