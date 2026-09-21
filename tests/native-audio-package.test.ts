import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyNativeAudio } from '../scripts/verify-native-audio.mjs';

test('release native audio is complete and matches imported recordings', async () => {
  const report = await verifyNativeAudio('public');
  assert.ok(report.cues >= 51);
  const manifest = JSON.parse(await readFile('public/audio/local/manifest.json', 'utf8'));
  for (const cue of ['swing', 'hit', 'potion', 'portal', 'ambient:camp']) assert.ok(manifest.sounds[cue]?.length, cue);
});

test('release verification rejects missing, corrupted and unsafe native assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'd2r-native-audio-'));
  try {
    await mkdir(join(root, 'audio/local'), { recursive: true });
    await assert.rejects(verifyNativeAudio(root), /ENOENT/);
    const file = 'local/fixture.flac', data = Buffer.from('audio fixture');
    const manifest = { sounds: { potion: [file] }, files: { [file]: { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') } } };
    const save = () => writeFile(join(root, 'audio/local/manifest.json'), JSON.stringify(manifest));
    await save();
    await assert.rejects(verifyNativeAudio(root), /ENOENT/);
    await writeFile(join(root, 'audio', file), data);
    assert.deepEqual(await verifyNativeAudio(root), { cues: 1, files: 1, bytes: data.length });
    await writeFile(join(root, 'audio', file), Buffer.alloc(data.length));
    await assert.rejects(verifyNativeAudio(root), /integrity mismatch/);
    manifest.sounds.potion = ['local/../outside.flac']; await save();
    await assert.rejects(verifyNativeAudio(root), /Invalid native audio path/);
    manifest.sounds.potion = []; await save();
    await assert.rejects(verifyNativeAudio(root), /empty cues/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
