import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { AUDIO_FILES, castSound, deathSound, impactSound, lootSound, spatialMix, weaponSound } from '../src/audio-bank.ts';
import { ambienceSamples, synthesize, TEXTURE_SECONDS } from '../src/audio-synthesis.ts';

test('audio distinguishes weapons, elemental impacts, enemies and successful item actions', () => {
  assert.equal(weaponSound('bow'), 'shot'); assert.equal(weaponSound('crossbow'), 'crossbow');
  assert.equal(weaponSound('sword'), 'swing'); assert.equal(weaponSound('hammer'), 'bluntSwing');
  assert.equal(castSound('teleport', 'magic'), 'teleport'); assert.equal(castSound('blessedHammer', 'magic'), 'hammer');
  assert.equal(castSound('fireBall', 'fire'), 'fire'); assert.equal(castSound('jab', 'physical', 'spear'), 'thrust');
  assert.equal(impactSound('physical', 'skeleton'), 'boneHit'); assert.equal(impactSound('physical', 'knight'), 'metalHit');
  assert.equal(impactSound('cold', 'skeleton'), 'coldImpact'); assert.equal(deathSound('ghost'), 'ghostDeath');
  assert.equal(lootSound({ potion: 0 }), 'itemBottle'); assert.equal(lootSound({ gold: 5 }), 'gold');
  assert.equal(lootSound({ rune: 'el' }), 'rune'); assert.equal(lootSound({ item: { slot: 'weapon', rarity: 'legendary' } }, true), 'dropRare');
  for (const file of AUDIO_FILES) assert.ok(existsSync(new URL(`../public/audio/${file}`, import.meta.url)), file);
});

test('sound position matches the isometric camera and smoothly attenuates out of range', () => {
  const listener = { x: 4, z: -3 }, right = spatialMix(listener, { x: 10, z: -9 }), left = spatialMix(listener, { x: -2, z: 3 });
  assert.ok(right.pan > 0); assert.equal(right.pan, -left.pan); assert.equal(right.gain, left.gain);
  assert.deepEqual(spatialMix(listener), { gain: 1, pan: 0 });
  assert.equal(spatialMix(listener, { x: 40, z: -3 }).gain, 0);
  assert.ok(spatialMix(listener, { x: 8, z: -3 }).gain > spatialMix(listener, { x: 18, z: -3 }).gain);
  assert.ok(spatialMix(listener, { x: 31.99, z: -3 }).gain < .001);
});

test('fallback textures are deterministic, distinct, finite, and fade without clipping', () => {
  const previous = Math.random; Math.random = () => { throw new Error('audio must not consume gameplay randomness'); };
  try {
    for (const kind of Object.keys(TEXTURE_SECONDS) as (keyof typeof TEXTURE_SECONDS)[]) {
      const pcm = synthesize(kind, 0, 16000), alternate = synthesize(kind, 1, 16000);
      assert.deepEqual(pcm, synthesize(kind, 0, 16000)); assert.notDeepEqual(pcm, alternate);
      let energy = 0;
      for (const value of pcm) { assert.ok(Number.isFinite(value) && Math.abs(value) <= .75); energy += value * value; }
      assert.ok(energy / pcm.length > .00001, kind); assert.equal(Math.abs(pcm[0]), 0); assert.ok(Math.abs(pcm.at(-1)!) < .01);
    }
  } finally { Math.random = previous; }
});

test('fallback ambience has bounded stereo loops and continuous seams', () => {
  for (const terrain of ['camp', 'field', 'cave', 'temple', 'arcane', 'lava', 'snow', 'ruins'] as const) {
    const left = ambienceSamples(terrain, 16000, 0), right = ambienceSamples(terrain, 16000, 1);
    assert.equal(left.length, 128000); assert.notDeepEqual(left, right);
    let maxStep = 0; for (let i = 1; i < left.length; i++) maxStep = Math.max(maxStep, Math.abs(left[i] - left[i - 1]));
    assert.ok(Math.abs(left[0] - left.at(-1)!) <= maxStep, `${terrain}: seam stays within the normal noise derivative`);
    assert.ok(left.every(value => Number.isFinite(value) && Math.abs(value) < .5));
  }
});
