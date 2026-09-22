import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// A release must contain the original recordings, not silently use the fallback.
export async function verifyNativeAudio(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'audio/local/manifest.json'), 'utf8'));
  const cues = Object.values(manifest.sounds ?? {});
  if (!cues.length || cues.some(files => !Array.isArray(files) || !files.length)) throw new Error('Native audio manifest has empty cues');
  const files = [...new Set(cues.flat())];
  let bytes = 0;
  for (const file of files) {
    if (typeof file !== 'string' || !/^local\/[a-z0-9_ ./-]+\.(wav|ogg|mp3|flac)$/i.test(file) || file.includes('..')) throw new Error(`Invalid native audio path: ${file}`);
    const data = await readFile(resolve(root, 'audio', file));
    const metadata = manifest.files?.[file];
    if (!metadata || data.length !== metadata.bytes || createHash('sha256').update(data).digest('hex') !== metadata.sha256) throw new Error(`Native audio integrity mismatch: ${file}`);
    bytes += data.length;
  }
  return { cues: cues.length, files: files.length, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('Native audio verified:', await verifyNativeAudio(resolve(process.argv[2] || 'public')));
}
