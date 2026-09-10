import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';

const output = process.env.OUTPUT_DIR || '.verification/performance';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: +(process.env.WIDTH || 1920), height: +(process.env.HEIGHT || 1080) }, deviceScaleFactor: +(process.env.DPR || 1) });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.performanceGame = game;') });
  });
  await page.addInitScript(save => {
    localStorage.setItem('eclipse-ii-save-v1', save);
    // Reproduce the same layouts, enemy placements and combat rolls on every run.
    let seed = 20260910;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let mapSeed = 20260910;
    crypto.getRandomValues = array => { for (let i = 0; i < array.length; i++) array[i] = ++mapSeed; return array; };
  }, serializeSave(newHero(process.env.HERO_CLASS || 'paladin')));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  const hardware = await page.evaluate(() => {
    const g = window.performanceGame, gl = g.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), multiDraw: !!gl.getExtension('WEBGL_multi_draw'), width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
  });
  const cdp = await page.context().newCDPSession(page);
  if (process.env.CPU_PROFILE === '1') {
    let profileIndex = 0;
    await cdp.send('Profiler.enable');
    await page.exposeFunction('beginPerfProfile', () => cdp.send('Profiler.start'));
    await page.exposeFunction('endPerfProfile', async () => { const { profile } = await cdp.send('Profiler.stop'); await writeFile(`${output}/cpu-profile-${profileIndex++}.json`, JSON.stringify(profile)); });
  }
  const areas = (process.env.AREAS || ['camp', ...Array.from({ length: 25 }, (_, i) => i), 'cow', 'uberDiablo'].join(',')).split(',');
  for (const area of areas) {
    await page.evaluate(area => {
      const g = window.performanceGame;
      g.hero.campaign.current = Number.isNaN(+area) ? 0 : +area;
      g.specialArea = ['cow', 'uberDiablo'].includes(area) ? area : undefined;
      g.hero.campaign.kills = 999; g.hero.campaign.objects = Array.from({ length: 20 }, (_, i) => i);
      g.hero.bossDefeated = false; g.loadArea(area === 'camp'); g.started = true;
      g.invincible = 9999; g.saveTimer = -9999;
    }, area);
    for (const point of (process.env.STRESS === '1' ? ['battle'] : area === 'camp' ? ['spawn'] : area === 'uberDiablo' ? ['spawn', 'boss'] : ['spawn', 'pack', 'boss'])) {
      await page.evaluate(async point => {
        const g = window.performanceGame;
        const p = ['boss', 'battle'].includes(point) ? g.world.layout.boss : point === 'pack' ? g.enemies.find(e => !e.boss).actor.group.position : g.position;
        g.position.set(p.x, 0, p.z); g.body.position.set(p.x, .5, p.z); g.body.velocity.set(0, 0, 0); g.updateCamera(1);
        g.invincible = 9999;
        if (point === 'battle') {
          const { Group } = await import('/node_modules/three/build/three.module.js');
          g.hero.level = 99; g.hero.mana = 9999; Object.keys(g.hero.skills).forEach(id => g.hero.skills[id] = 20);
          const cells = g.world.floorCells.filter(c => Math.hypot(c.x - p.x, c.z - p.z) > 3 && Math.hypot(c.x - p.x, c.z - p.z) < 8 && g.world.canWalk(p, c));
          if (!cells.length) throw new Error('No combat stress positions');
          for (const [i, enemy] of g.enemies.filter(e => !e.boss).slice(0, 24).entries()) {
            const c = cells[Math.floor(i * cells.length / 24)]; enemy.actor.group.position.set(c.x, 0, c.z); enemy.body.position.set(c.x, .5, c.z); enemy.active = true; enemy.hp = enemy.maxHp = 1e8;
          }
          for (let i = 0; i < 40; i++) {
            const c = cells[Math.floor(i * cells.length / 40)];
            g.addLoot({ id: g.nextId++, x: c.x, z: c.z, item: { ...g.hero.equipment.weapon, id: `perf-loot-${i}` }, mesh: new Group() });
          }
          const update = g.update, skills = { paladin: ['blessedHammer', 'holyBolt'], amazon: ['plagueJavelin', 'lightningFury', 'valkyrie'], sorceress: ['meteor', 'blizzard', 'frozenOrb', 'chainLightning', 'hydra'] }[g.hero.classId];
          let timer = 0, index = 0; window.performanceCasts = 0;
          g.update = function(dt) {
            timer -= dt;
            if (timer <= 0) {
              g.hero.mana = 9999; g.aim.copy(g.position).add({ x: 3, y: 0, z: 2 });
              if (g.combat.castAction(skills[index++ % skills.length], true)) window.performanceCasts++;
              timer = .45;
            }
            update.call(this, dt);
          };
          window.restorePerformanceUpdate = () => { g.update = update; };
        }
      }, point);
      const sample = await page.evaluate(async ({ warmup, frames, detailed }) => {
        const g = window.performanceGame;
        await new Promise(resolve => { let count = 0; const tick = () => ++count >= warmup ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
        if (window.beginPerfProfile) await window.beginPerfProfile();
        const costs = {}, originals = [];
        for (const [object, key, name] of [[g, 'update', 'update'], [g.composer, 'render', 'render'], [g.ui, 'update', 'ui'], [g.world.physics, 'step', 'physics'], [g.monsterCombat, 'update', 'ai'], [g.world.physics.broadphase, 'collisionPairs', 'broadphase'], [g.world.physics.narrowphase, 'getContacts', 'contacts'], [g.world.physics.solver, 'solve', 'solve'], [g.world.scene, 'updateMatrixWorld', 'matrices'], [g.monsterBatches || {}, 'update', 'batch'], [g.world, 'path', 'path']]) {
          if (!object[key]) continue;
          costs[name] = 0;
          const original = object[key]; originals.push(() => { object[key] = original; });
          object[key] = function(...args) { const start = performance.now(); try { return original.apply(this, args); } finally { costs[name] += performance.now() - start; } };
        }
        let calls = 0, triangles = 0;
        const submissions = {}, direct = g.renderer.renderBufferDirect;
        if (detailed) g.renderer.renderBufferDirect = function(...args) { const start = performance.now(); const result = direct.apply(this, args); const key = `${args[4].name || args[4].type}:${args[3].type}`; const row = submissions[key] ||= { calls: 0, ms: 0 }; row.calls++; row.ms += performance.now() - start; return result; };
        const render = g.renderer.render;
        g.renderer.render = function(...args) { const result = render.apply(this, args); calls += this.info.render.calls; triangles += this.info.render.triangles; return result; };
        const intervals = [], outliers = [];
        try {
          await new Promise(resolve => {
            let previous, previousCosts = {}, previousFrame;
            const tick = now => {
              const frame = detailed ? { costs: Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, value - (previousCosts[key] || 0)])), casts: window.performanceCasts, effects: g.effects.length, floats: g.ui.floats.length } : undefined;
              if (previous !== undefined) { intervals.push(now - previous); if (detailed && now - previous > 18) outliers.push({ interval: now - previous, previous: previousFrame, current: frame }); }
              previous = now; previousFrame = frame; if (detailed) previousCosts = { ...costs };
              if (intervals.length >= frames) resolve(); else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        } finally { originals.forEach(restore => restore()); g.renderer.render = render; g.renderer.renderBufferDirect = direct; }
        if (window.endPerfProfile) await window.endPerfProfile();
        intervals.sort((a, b) => a - b);
        return { fps: 1000 * intervals.length / intervals.reduce((a, b) => a + b, 0), p50: intervals[Math.floor(frames * .5)], p95: intervals[Math.floor(frames * .95)], p99: intervals[Math.floor(frames * .99)], max: intervals.at(-1), overBudget: intervals.filter(ms => ms > 18).length, outliers,
          calls: calls / (frames + 1), triangles: triangles / (frames + 1), submissions: Object.fromEntries(Object.entries(submissions).map(([key, value]) => [key, { calls: value.calls / (frames + 1), ms: value.ms / (frames + 1) }])), costs: Object.fromEntries(Object.entries(costs).map(([key, value]) => [key, value / (frames + 1)])), enemies: g.enemies.length, active: g.enemies.filter(e => e.active && !e.dead).length, quality: g.quality, pixelRatio: g.renderer.getPixelRatio(), seed: g.world.layout.seed, casts: window.performanceCasts || 0 };
      }, { warmup: +(process.env.WARMUP || 90), frames: +(process.env.FRAMES || 180), detailed: process.env.PROFILE_DRAWS === '1' });
      const result = { area, point, ...sample }; results.push(result); console.log(JSON.stringify(result));
      await writeFile(`${output}/results.json`, JSON.stringify({ hardware, results, errors }, null, 2));
      if (point === 'battle') { assert.ok(sample.casts >= 3 && sample.active >= 12, 'stress fixture must cast and engage a crowd'); await page.evaluate(() => window.restorePerformanceUpdate()); }
    }
  }
  assert.deepEqual(errors, []);
  if (process.env.PERF_ASSERT === '1') for (const row of results) {
    // A 60 Hz display quantizes intervals to ~16.7 ms; allow timestamp rounding
    // and occasional OS scheduling jitter, while rejecting sustained missed frames.
    assert.ok(row.fps >= 59 && row.p95 < 18, `60 FPS budget: ${JSON.stringify(row)}`);
  }
  console.log(JSON.stringify({ hardware, scenes: results.length, minFps: Math.min(...results.map(r => r.fps)), worstP95: Math.max(...results.map(r => r.p95)) }));
} finally { await browser.close(); }
