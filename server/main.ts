import { createApp } from './app.ts';

const app = await createApp({ filename: process.env.D2R_DATABASE ?? 'server/data/online.sqlite',
  secureCookies: process.env.NODE_ENV === 'production', origins: process.env.D2R_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) });
await app.listen({ host: process.env.D2R_API_HOST ?? '127.0.0.1', port: Number(process.env.D2R_API_PORT ?? 3001) });
console.log(`D2R online API listening on ${app.server.address() && JSON.stringify(app.server.address())}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
