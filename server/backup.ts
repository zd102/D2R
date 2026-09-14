import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function backupDatabase(source: string, destination: string) {
  const target = resolve(destination);
  if (existsSync(target)) throw new Error('备份目标已存在，请使用新的文件名。');
  mkdirSync(dirname(target), { recursive: true });
  const database = new DatabaseSync(resolve(source), { readOnly: true });
  try { await backup(database, target); } finally { database.close(); }
  return target;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.env.D2R_DATABASE ?? 'server/data/online.sqlite';
  const destination = process.argv[2] ?? `server/data/backups/online-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
  console.log(await backupDatabase(source, destination));
}
