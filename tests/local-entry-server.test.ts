import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { entryOrigin, localEntryPlugin } from '../scripts/local-entry-server.mjs';

test('local socket addresses use loopback while remote computers use the stable configured entry', () => {
  const hosts = ['127.0.0.1', '192.168.1.3'];
  for (const ip of ['127.0.0.1', '::1', '::ffff:192.168.1.3']) assert.equal(entryOrigin(ip, 5173, hosts, 'http://game-host:5173'), 'http://127.0.0.1:5173');
  assert.equal(entryOrigin('192.168.1.8', 5173, hosts), 'http://192.168.1.3:5173');
  assert.equal(entryOrigin('192.168.1.8', 5173, hosts, 'http://game-host:5173'), 'http://game-host:5173');
});
test('maintenance requires an active token and matching origin; a retry never replaces the original backup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'd2r-migration-test-'));
  await mkdir(join(root, '.verification/local-migration'), { recursive: true });
  const file = join(root, '.verification/local-migration/task.json');
  const plugin = localEntryPlugin(); let handler: any;
  plugin.configResolved({ root, server: { port: 5173 }, preview: { port: 4173 } });
  plugin.configureServer({ middlewares: { use(value: any) { handler = value; } } });
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, endpoint = origin + '/__local-migration-job';
  try {
    await writeFile(file, JSON.stringify({ token: 'test-token', expiresAt: Date.now() + 60000, target: origin, origins: [origin], snapshots: {} }));
    assert.equal((await fetch(endpoint)).status, 403);
    const headers = { 'X-Migration-Token': 'test-token', 'Content-Type': 'application/json', Origin: 'http://unrelated.invalid' };
    const body = (level: number) => JSON.stringify({ kind: 'snapshot', snapshot: { origin, level } });
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: body(54) })).status, 403);
    headers.Origin = origin;
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: body(54) })).status, 200);
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: body(24) })).status, 200);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).snapshots[origin].level, 54);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
