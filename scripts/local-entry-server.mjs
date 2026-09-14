import { networkInterfaces } from 'node:os';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const addresses = () => Object.values(networkInterfaces()).flat().filter(Boolean).map(value => value.address);
const normalizeIP = value => (value || '').replace(/^::ffff:/, '');
export function entryOrigin(remoteAddress, port, hosts = addresses(), configured) {
  const remote = normalizeIP(remoteAddress);
  if (remote === '::1' || remote.startsWith('127.') || hosts.includes(remote)) return `http://127.0.0.1:${port}`;
  if (configured) return new URL(configured).origin;
  const host = hosts.find(value => !value.includes(':') && !value.startsWith('127.') && !value.startsWith('169.254.'));
  return host ? `http://${host}:${port}` : null;
}

export function localEntryPlugin() {
  let root, devPort = 5173, previewPort = 4173;
  const attach = (server, port) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', 'http://local');
      if (!['/__local-entry', '/__local-migration-job'].includes(url.pathname)) return next();
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      const hosts = addresses(), canonicalOrigin = entryOrigin(req.socket.remoteAddress, port, hosts, process.env.D2R_LOCAL_ORIGIN);
      const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
      if (url.pathname === '/__local-entry') return send(200, { canonicalOrigin, origins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`, ...hosts.filter(ip => !ip.includes(':')).map(ip => `http://${ip}:${port}`)] });
      // A short-lived, explicitly created local maintenance job. Never available to LAN clients.
      const remote = normalizeIP(req.socket.remoteAddress);
      if (!(remote === '::1' || remote.startsWith('127.') || hosts.includes(remote))) return send(403, { error: 'Local maintenance only' });
      try {
        const filename = resolve(root, '.verification/local-migration/task.json');
        const job = JSON.parse(await readFile(filename, 'utf8'));
        if (job.expiresAt < Date.now() || req.headers['x-migration-token'] !== job.token) return send(403, { error: 'Expired maintenance job' });
        if (req.method === 'GET') return send(200, job);
        if (req.method !== 'POST' || req.headers.origin !== `http://${req.headers.host}` || req.headers['content-type'] !== 'application/json') return send(403, { error: 'Invalid origin' });
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 20 * 1024 * 1024) throw new Error('Oversize snapshot'); }
        const result = JSON.parse(raw);
        if (result.kind === 'snapshot' && job.origins.includes(result.snapshot?.origin) && result.snapshot.origin === req.headers.origin) job.snapshots[result.snapshot.origin] ??= result.snapshot;
        else if (result.kind === 'result' && req.headers.origin === job.target) job.result ??= result;
        else return send(400, { error: 'Invalid maintenance result' });
        const temporary = filename + '.tmp'; await writeFile(temporary, JSON.stringify(job, null, 2)); await rename(temporary, filename);
        return send(200, { ok: true });
      } catch { return send(404, { error: 'No active local maintenance job' }); }
    });
  };
  return { name: 'local-save-entry', configResolved(config) { root = config.root; devPort = config.server.port; previewPort = config.preview.port; },
    configureServer(server) { attach(server, devPort); }, configurePreviewServer(server) { attach(server, previewPort); } };
}
