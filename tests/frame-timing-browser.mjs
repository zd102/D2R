import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.timingGame = game;') });
  });
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(newHero()));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.timingGame && !window.timingGame.paused);
  await page.evaluate(() => cancelAnimationFrame(window.timingGame.frameId));

  // Drive the real render loop with controlled timestamps. Keep simulation,
  // navigation and Cannon intact; omit GPU/audio/UI work between sampled frames.
  const result = await page.evaluate(() => {
    const g = window.timingGame, samples = [];
    const original = { now: performance.now, raf: window.requestAnimationFrame, render: g.renderer.render, compose: g.composer.render, audio: g.audio.updateScene, ui: g.ui.update };
    let now = 1000, renders = 0;
    performance.now = () => now;
    window.requestAnimationFrame = () => 0;
    g.renderer.render = g.composer.render = () => { renders++; };
    g.audio.updateScene = g.ui.update = () => {};
    const frame = dt => { now += dt * 1000; g.loop(); };
    const reset = start => {
      g.releaseInput(); g.frameClock?.reset(); g.lastFrame = now;
      g.combat.lock = g.combat.stagger = g.combat.movementRecovery = 0;
      g.combat.moving = g.combat.running = false;
      g.hero.running = true; g.hero.stamina = 500; g.hero.cold = 0; g.invincible = 100;
      g.saveTimer = 0; g.paused = false;
      g.position.set(start.x, 0, start.z); g.body.position.set(start.x, .5, start.z);
      g.body.velocity.set(0, 0, 0); g.world.physics.accumulator = 0;
      g.updateCamera(1);
    };
    try {
      const schedules = [144, 120, 60, 30, 20, 15, 10, 5].map(fps => ({ name: `${fps} FPS`, frames: Array(fps).fill(1 / fps) }));
      schedules.push({ name: 'uneven frames', frames: Array.from({ length: 4 }, () => [1 / 120, 1 / 30, 1 / 15, 1 / 60, 1 / 10, 1 / 40]).flat() });
      for (const level of [0, 6, 7]) {
        g.hero.campaign.current = level; g.loadArea(false);
        for (const enemy of g.enemies) { g.world.physics.removeBody(enemy.body); g.disposeObject(enemy.actor.group); }
        g.enemies = [];
        const start = g.world.floorCells.find(p => g.world.canWalk(p, { x: p.x + 9, z: p.z }));
        if (!start) throw new Error(`No open measurement route in ${g.level.name}`);
        for (const mode of ['mouse', 'wasd']) for (const schedule of schedules) {
          reset(start); g.movementMode = mode;
          if (mode === 'mouse') g.moveTo(g.position.clone().set(start.x + 9, 0, start.z));
          else { g.keys.add('d'); g.keys.add('s'); }
          const before = g.time, beforeRenders = renders;
          schedule.frames.forEach(frame);
          samples.push({ level, mode, schedule: schedule.name, distance: g.position.x - start.x, sideways: g.position.z - start.z,
            elapsed: g.time - before, stamina: g.hero.stamina, renders: renders - beforeRenders, frames: schedule.frames.length });
        }
      }
      const start = { x: g.position.x, z: g.position.z };
      reset(start); g.movementMode = 'mouse';
      g.moveTo(g.position.clone().set(start.x + 2, 0, start.z));
      for (let i = 0; i < 15; i++) frame(1 / 10);
      const arrivalError = Math.abs(g.position.x - start.x - 2);
      const arrived = g.path.length === 0;
      g.world.addCollider(start.x + 2, start.z, .2, 3);
      const wallDistances = [60, 10].map(fps => {
        reset(start); g.movementMode = 'wasd'; g.keys.add('d'); g.keys.add('s');
        for (let i = 0; i < fps; i++) frame(1 / fps);
        return g.position.x - start.x;
      });
      reset(start); g.movementMode = 'wasd'; g.keys.add('d'); g.keys.add('s');
      const beforeStall = g.time; frame(10);
      const stallElapsed = g.time - beforeStall;
      g.paused = true; const pausedX = g.position.x; frame(30);
      const pausedDistance = g.position.x - pausedX;
      g.paused = false; const beforeResume = g.time; frame(1 / 60);
      return { samples, arrivalError, arrived, wallDistances, stallElapsed, pausedDistance, resumeElapsed: g.time - beforeResume };
    } finally {
      performance.now = original.now; window.requestAnimationFrame = original.raf;
      g.renderer.render = original.render; g.composer.render = original.compose;
      g.audio.updateScene = original.audio; g.ui.update = original.ui;
    }
  });
  for (const sample of result.samples) {
    const reference = result.samples.find(other => other.level === sample.level && other.mode === sample.mode && other.schedule === '60 FPS');
    const context = JSON.stringify(sample);
    assert.ok(Math.abs(sample.elapsed - 1) < 1e-6, `simulation follows wall time: ${context}`);
    assert.ok(Math.abs(sample.distance - reference.distance) < .01, `speed is independent of render FPS: ${context}`);
    assert.ok(sample.distance > 4.9 && sample.distance < 5, `preserves existing 60 FPS movement: ${context}`);
    assert.ok(Math.abs(sample.sideways) < .01, `open route stays straight: ${context}`);
    assert.ok(Math.abs(sample.stamina - reference.stamina) < .01, `stamina follows simulation time: ${context}`);
    assert.equal(sample.renders, sample.frames, 'render only once per displayed frame');
  }
  assert.ok(result.arrived && result.arrivalError < .13, 'low FPS navigation arrives without overshooting');
  // Cannon allows a small contact overlap. Low FPS must retain the same stopping
  // position as 60 FPS and keep the body on the near side of the wall.
  assert.ok(Math.abs(result.wallDistances[0] - result.wallDistances[1]) < .001, `collision is independent of FPS: ${result.wallDistances}`);
  assert.ok(result.wallDistances.every(distance => distance > 1.3 && distance < 1.55), `keyboard movement cannot tunnel through a thin collider: ${result.wallDistances}`);
  assert.ok(result.stallElapsed <= .25 + 1e-6, 'long stalls have bounded catch-up');
  assert.equal(result.pausedDistance, 0, 'paused time does not move the hero');
  assert.ok(Math.abs(result.resumeElapsed - 1 / 60) < 1e-6, 'resuming does not replay paused time');
  assert.deepEqual(errors, []);
  console.log('Render-loop movement, stamina and simulation time match at 5–144 FPS and uneven frame intervals on ordinary and sandy ground; arrival, collisions, pause and long stalls passed.');
} finally { await browser.close(); }
