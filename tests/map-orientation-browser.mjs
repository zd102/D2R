import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { LEVELS, SPECIAL_LEVELS, levelLayout } from '../src/campaign.ts';

const output = process.env.OUTPUT_DIR || '.verification/map-orientation', errors = [], results = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.orientationGame = game;') });
  });
  await page.route('**/src/map-random.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('function nextMapSeed() {', 'function nextMapSeed() { if (window.orientationSeed !== undefined) return window.orientationSeed;') });
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('方向回归');
  await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  await page.waitForFunction(() => window.orientationGame.profile && !window.orientationGame.paused);
  await page.evaluate(() => { const g = window.orientationGame; cancelAnimationFrame(g.frameId); g.audio.volume = 0; });
  for (const level of [LEVELS[0], LEVELS[2], LEVELS[5], LEVELS[7], LEVELS[8], LEVELS[14], LEVELS[23], LEVELS[24], ...Object.values(SPECIAL_LEVELS)]) {
    const seeds = new Map();
    for (let seed = 0; seed < 64 && seeds.size < 4; seed++) seeds.set(levelLayout(level, seed).rotation, seed);
    assert.equal(seeds.size, 4);
    for (const [turns, seed] of seeds) {
      const result = await page.evaluate(({ index, special, seed }) => {
        const g = window.orientationGame; window.orientationSeed = seed;
        g.specialArea = special; g.hero.campaign.current = special ? 24 : index; g.hero.bossDefeated = false;
        g.hero.campaign.objects = []; g.hero.campaign.kills = 100; g.loadArea(false);
        const layout = g.world.layout, failures = [], point = p => ({ x: p.x, z: p.z });
        const entry = { body: point(g.body.position), actor: point(g.position), rune: point(g.world.rune.position), ring: point(g.playerRing.position) };
        if (!g.world.canWalk(layout.spawn, layout.spawn)) failures.push('blocked spawn');
        for (const target of [layout.supply, layout.boss, layout.exit, ...layout.chests, ...layout.objects, ...layout.rooms]) {
          let previous = layout.spawn;
          for (const next of g.world.path(previous, target)) {
            if (!g.world.canWalk(previous, next)) failures.push({ target, reason: 'blocked path segment' }); previous = next;
          }
          if (Math.hypot(previous.x - target.x, previous.z - target.z) > 3) failures.push({ target, reason: 'unreachable' });
        }
        const boss = g.enemies.find(enemy => enemy.boss), before = point(boss.actor.group.position);
        if (g.world.mysteryCorpse) {
          const corpse = g.world.mysteryCorpse, last = g.world.path(g.position, corpse).at(-1);
          if (!last || Math.hypot(last.x - corpse.x, last.z - corpse.z) > 3.2) failures.push('mystery corpse unreachable');
        }
        g.position.set(layout.boss.x, 0, layout.boss.z); g.body.position.set(layout.boss.x, .5, layout.boss.z);
        g.body.velocity.set(3, 0, 3); g.path = [g.position.clone()]; g.dead = true; g.revive();
        g.updateCamera(1);
        const screenSpawn = g.project(g.position), screenBoss = g.project(boss.actor.group.position);
        return { index, seed: layout.seed, rotation: layout.rotation, spawn: layout.spawn, boss: layout.boss, entry, actualBoss: before,
          revived: point(g.position), reviveSeed: g.world.layout.seed, velocity: point(g.body.velocity), path: g.path.length,
          screenDirection: `${Math.sign(screenBoss.x - screenSpawn.x)},${Math.sign(screenBoss.y - screenSpawn.y)}`, failures };
      }, { index: level.index, special: level.special, seed });
      assert.equal(result.seed, seed); assert.equal(result.rotation, turns);
      for (const position of Object.values(result.entry)) assert.deepEqual(position, result.spawn);
      assert.deepEqual(result.actualBoss, result.boss); assert.deepEqual(result.revived, result.spawn);
      assert.equal(result.reviveSeed, seed); assert.deepEqual(result.velocity, { x: 0, z: 0 }); assert.equal(result.path, 0);
      assert.deepEqual(result.failures, [], `${level.name}, rotation ${turns}, seed ${seed}`);
      results.push(result);
      if (level.index === 0) {
        await page.evaluate(() => {
          const g = window.orientationGame;
          g.world.floorCells.forEach(p => g.visited.add(`${Math.floor(p.x / 3)},${Math.floor(p.z / 3)}`));
          g.ui.openPanel('map'); g.ui.update(0); g.renderer.render(g.world.scene, g.camera);
        });
        await expect(page.locator('.panel-map')).toBeVisible();
        await page.screenshot({ path: `${output}/orientation-${turns}.png` });
      }
    }
    console.log(`PASS: ${level.name}, all four orientations, entry/revive and real scenery collision`);
  }
  assert.equal(new Set(results.filter(result => result.index === 0).map(result => result.screenDirection)).size, 4);
  const camp = await page.evaluate(() => { const g = window.orientationGame; g.specialArea = undefined; g.loadArea(true); g.dead = true; g.revive(); return { x: g.position.x, z: g.position.z }; });
  assert.deepEqual(camp, { x: 0, z: 11 }); assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
