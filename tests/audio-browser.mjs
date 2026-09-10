import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.env.OUTPUT_DIR || '.verification/audio-system';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [], report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.audioTestGame = game;') });
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await expect(page.getByRole('dialog', { name: '选择角色', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => !!window.audioTestGame.audio.context), false, 'no audio context before gesture');
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.locator('#profile-name').fill('音效回归');
  await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  await page.waitForFunction(() => window.audioTestGame.profile && !window.audioTestGame.paused);
  report.loaded = await page.evaluate(async () => {
    const g = window.audioTestGame; cancelAnimationFrame(g.frameId); g.audio.unlock(); await g.audio.context.resume(); await g.audio.preload();
    g.audio.setHidden(true); g.audio.setHidden(false); return g.audio.diagnostics();
  });
  assert.deepEqual(report.loaded.failedFiles, [], 'all configured audio files decode');
  report.native = await page.evaluate(async () => {
    const audio = window.audioTestGame.audio, { nativeAudioManifest } = await import('/src/audio-native.ts');
    const files = nativeAudioManifest.sounds?.potion;
    if (!files) return { available: false };
    const expected = await audio.context.decodeAudioData(await (await fetch(`/audio/${files[0]}`)).arrayBuffer());
    let actual, rate;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { actual = this.buffer; rate = this.playbackRate.value; return original.apply(this, args); };
    try { audio.stopEffects(); audio.play('potion'); } finally { AudioBufferSourceNode.prototype.start = original; }
    const same = actual.length === expected.length && actual.numberOfChannels === expected.numberOfChannels && actual.getChannelData(0).every((sample, i) => sample === expected.getChannelData(0)[i]);
    audio.stopEffects(); return { available: true, same, rate, cues: Object.keys(nativeAudioManifest.sounds).length };
  });
  if (report.native.available) { assert.equal(report.native.same, true, 'the original potion recording is used unchanged'); assert.equal(report.native.rate, 1); assert.equal(report.loaded.nativeCues, report.native.cues); }
  report.events = await page.evaluate(async () => {
    const g = window.audioTestGame, log = [], original = g.audio.play.bind(g.audio);
    g.audio.play = (kind, options) => { log.push({ kind, nativeKey: options?.nativeKey }); return original(kind, options); };
    g.loadArea(false); g.paused = false; g.hero.hp = 1; g.hero.potions[0] = 2; g.drink(0);
    const enemy = g.spawnEnemy(g.position.x + 1, g.position.z, 'skeleton'); enemy.hp = enemy.maxHp = 1000;
    const before = log.length; g.combat.damage(enemy, 0, 'physical'); const silentZero = log.length === before;
    g.combat.damage(enemy, 1, 'physical'); g.combat.damage(enemy, 10, 'cold'); g.killEnemy(enemy);
    const { SOUND_BANK } = await import('/src/audio-bank.ts');
    g.audio.stopEffects(); for (const kind of Object.keys(SOUND_BANK)) g.audio.play(kind);
    const maximum = g.audio.diagnostics().voices; g.audio.stopEffects();
    g.audio.play = original;
    return { log, silentZero, maximum };
  });
  assert.ok(report.events.silentZero, 'zero damage creates no impact');
  for (const kind of ['portal', 'potion', 'boneHit', 'coldImpact', 'boneDeath']) assert.ok(report.events.log.some(event => event.kind === kind), kind);
  assert.ok(report.events.maximum <= 24, 'event storm is bounded');

  report.scene = await page.evaluate(() => {
    const audio = window.audioTestGame.audio, original = audio.play.bind(audio), steps = [];
    audio.play = (kind, options) => { if (kind.startsWith('step')) steps.push(kind); return original(kind, options); };
    const scene = { position: { x: 0, z: 0 }, area: 'test', terrain: 'cave', paused: false, active: true, running: false };
    audio.updateScene(scene); for (let i = 0; i < 30; i++) audio.updateScene(scene);
    const stationary = steps.length;
    for (let i = 1; i <= 8; i++) audio.updateScene({ ...scene, position: { x: i * .25, z: 0 } });
    const walking = steps.length;
    audio.updateScene({ ...scene, position: { x: 20, z: 0 } }); const teleported = steps.length;
    for (const terrain of ['camp', 'snow', 'lava', 'cave', 'temple', 'field', 'ruins', 'arcane']) audio.updateScene({ ...scene, terrain });
    const ambience = audio.diagnostics().ambience;
    audio.setHidden(true); const hidden = audio.diagnostics(); const hiddenPlay = audio.play('hit'); audio.setHidden(false);
    audio.play = original; return { stationary, walking, teleported, ambience, hidden, hiddenPlay };
  });
  assert.equal(report.scene.stationary, 0); assert.ok(report.scene.walking > 0); assert.equal(report.scene.teleported, report.scene.walking);
  assert.ok(report.scene.ambience <= 2); assert.equal(report.scene.hidden.ambience, 0); assert.equal(report.scene.hidden.voices, 0); assert.equal(report.scene.hiddenPlay, false);

  report.mute = await page.evaluate(async () => {
    const audio = window.audioTestGame.audio; audio.stopEffects(); audio.volume = 1; audio.play('level');
    const analyser = audio.context.createAnalyser(); audio.master.connect(analyser); const samples = new Float32Array(analyser.fftSize);
    const energy = () => { analyser.getFloatTimeDomainData(samples); return samples.reduce((sum, x) => sum + x * x, 0) / samples.length; };
    await new Promise(resolve => setTimeout(resolve, 250)); const audible = energy();
    audio.volume = 0; await new Promise(resolve => setTimeout(resolve, 400)); const muted = energy();
    audio.master.disconnect(analyser); analyser.disconnect(); audio.stopEffects(); audio.volume = .63; audio.toggleMute(); audio.toggleMute();
    const restored = audio.volume;
    audio.setChannelVolume('effects', .41); audio.setChannelVolume('ambience', .27); audio.setChannelVolume('ui', .53);
    const { GameAudio } = await import('/src/audio.ts'); const fresh = new GameAudio();
    const persisted = { volume: fresh.volume, effects: fresh.channelVolume('effects'), ambience: fresh.channelVolume('ambience'), ui: fresh.channelVolume('ui') }; fresh.dispose();
    return { audible, muted, restored, persisted };
  });
  assert.ok(report.mute.audible > 1e-7, 'the mixer outputs an audible waveform'); assert.ok(report.mute.muted < 1e-10, 'mute silences currently playing sound and reverb');
  assert.equal(report.mute.restored, .63); assert.deepEqual(report.mute.persisted, { volume: .63, effects: .41, ambience: .27, ui: .53 });

  await page.evaluate(() => window.audioTestGame.ui.openPanel('pause'));
  await expect(page.locator('#audio-effects')).toHaveValue('41');
  await page.locator('#audio-effects').focus(); await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => window.audioTestGame.audio.channelVolume('effects')), 0);
  await page.screenshot({ path: `${output}/settings-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: `${output}/settings-mobile.png` });
  report.released = await page.evaluate(async () => {
    const audio = window.audioTestGame.audio; audio.setChannelVolume('effects', 1); audio.stopEffects(); audio.play('hit');
    return audio.diagnostics();
  });
  await page.waitForFunction(() => window.audioTestGame.audio.diagnostics().voices === 0, null, { timeout: 15000 });
  await page.evaluate(() => window.audioTestGame.audio.dispose());
  const disposed = await page.evaluate(() => window.audioTestGame.audio.diagnostics()); assert.equal(disposed.buffers, 0); assert.equal(disposed.voices, 0); assert.equal(disposed.ambience, 0);

  // Explicitly exercise a clean checkout and a failed sample load.
  report.fallback = await page.evaluate(async () => {
    const { GameAudio } = await import('/src/audio.ts'), audio = new GameAudio(); audio.unlock(); await audio.context.resume(); await audio.preload(); audio.volume = .35;
    const { SOUND_BANK } = await import('/src/audio-bank.ts'); let played = 0;
    for (const kind of Object.keys(SOUND_BANK)) { audio.stopEffects(); if (audio.play(kind)) played++; }
    const result = { played, expected: Object.keys(SOUND_BANK).length, ...audio.diagnostics() }; audio.dispose(); return result;
  });
  assert.equal(report.fallback.played, report.fallback.expected); assert.equal(report.fallback.nativeCues, 0); assert.deepEqual(report.fallback.failedFiles, []);
  await page.route('**/audio/local/unavailable.flac', route => route.fulfill({ status: 503, body: '' }));
  report.failure = await page.evaluate(async () => {
    const { GameAudio } = await import('/src/audio.ts'), audio = new GameAudio({ sounds: { potion: ['local/unavailable.flac'] } });
    audio.unlock(); await audio.context.resume(); await audio.preload(); const plays = audio.play('potion'), failed = audio.diagnostics().failedFiles; audio.dispose(); return { plays, failed };
  });
  assert.equal(report.failure.plays, true); assert.deepEqual(report.failure.failed, ['local/unavailable.flac']);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ native: report.native, loaded: report.loaded, fallback: report.fallback.played, mute: report.mute, result: 'passed' }, null, 2));
} finally { await browser.close(); }
