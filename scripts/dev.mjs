import { spawn } from 'node:child_process';
import { createApp } from '../server/app.ts';

const port = Number(process.env.D2R_API_PORT ?? 3001);
const app = await createApp({ filename: process.env.D2R_DATABASE ?? 'server/data/online.sqlite' });
await app.listen({ host: '127.0.0.1', port });
console.log(`Online API: http://127.0.0.1:${port}`);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
let closing = false;
async function close(code = 0) {
  if (closing) return; closing = true; vite.kill(); await app.close(); process.exitCode = code;
}
vite.on('exit', code => void close(code ?? 0));
vite.on('error', error => { console.error(error.message); void close(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void close());
