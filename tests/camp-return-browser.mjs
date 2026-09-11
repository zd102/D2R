import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats } from '../src/model.ts';
import { PROFILE_PREFIX } from '../src/saves.ts';

const output = process.env.OUTPUT_DIR || '.verification/camp-return';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700 });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.returnGame = game;') });
    });
    const hero = newHero(); hero.level = 90; hero.vitality = 1000; hero.hp = stats(hero).maxHp;
    hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
    await page.addInitScript(({ hero, prefix }) => {
      if (sessionStorage.getItem('return-fixture')) return;
      localStorage.setItem(prefix + 'return-test', JSON.stringify({ version: 2, id: 'return-test', name: '返程测试', createdAt: 1000, updatedAt: 1000, revision: 1, hero }));
      sessionStorage.setItem('return-fixture', '1');
    }, { hero, prefix: PROFILE_PREFIX });
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.returnGame?.profile && !window.returnGame.paused);
    await page.evaluate(() => cancelAnimationFrame(window.returnGame.frameId));
    assert.equal(await page.evaluate(() => !!window.returnGame.world.returnPortal), false);
    const facilities = await page.evaluate(async () => {
      const { CAMP } = await import('/src/camp.ts'), g = window.returnGame;
      return ['portal', 'mysteryPortal', 'returnPortal', 'supply', 'baseMerchant', 'mercenaryMerchant', 'stash'].map(key => {
        const p = CAMP[key], end = g.world.path(g.position, p).at(-1);
        return { key, reachable: !!end && Math.hypot(end.x - p.x, end.z - p.z) < 3.5 };
      });
    });
    assert.ok(facilities.every(p => p.reachable), JSON.stringify(facilities));
    await page.evaluate(() => {
      const g = window.returnGame; g.enterLevel(2); g.invincible = 1000;
      const p = g.world.path(g.position, g.world.layout.route[2]).at(-1);
      g.position.copy(p); g.body.position.set(p.x, .5, p.z);
      g.combat.damage(g.enemies.find(e => !e.boss), 1e9, 'magic', true);
      g.world.chests[0].opened = true; g.world.chests[0].lid.rotation.x = -1.7;
      g.visited.add('return-test');
      window.frozen = { world: g.world, enemies: g.enemies, loot: g.loot, position: g.position.clone(),
        campaign: JSON.stringify(g.hero.campaign), hp: g.enemies.map(e => e.hp), bodies: g.world.physics.bodies.length, seed: g.world.layout.seed };
      if (!g.returnToCamp()) throw new Error('Return to camp failed');
      g.ui.update(0); g.updateCamera(1); g.renderer.render(g.world.scene, g.camera);
    });
    await page.screenshot({ path: `${output}/camp-${viewport.width}.png` });
    assert.equal(await page.evaluate(() => window.returnGame.world.scene.children.filter(o => o === window.returnGame.world.returnPortal).length), 1);
    assert.equal(await page.evaluate(() => !!window.returnGame.world.portal && !!window.returnGame.world.mysteryPortal), true);
    await expect(page.getByRole('button', { name: '返程传送门', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返程传送门', exact: true }).click();
    await page.evaluate(() => {
      const g = window.returnGame;
      for (let i = 0; i < 600 && g.inCamp; i++) g.update(1 / 60);
      g.ui.update(0);
    });
    async function assertRestored() {
      assert.deepEqual(await page.evaluate(() => {
        const g = window.returnGame, f = window.frozen;
        return { field: !g.inCamp, sameWorld: g.world === f.world, sameEnemies: g.enemies === f.enemies,
          sameLoot: g.loot === f.loot, position: g.position.distanceTo(f.position) < .001,
          hp: JSON.stringify(g.enemies.map(e => e.hp)) === JSON.stringify(f.hp),
          campaign: JSON.stringify(g.hero.campaign) === f.campaign, chest: g.world.chests[0].opened,
          visited: g.visited.has('return-test'), noSaved: !g.campReturn, bodies: g.world.physics.bodies.length === f.bodies };
      }), { field: true, sameWorld: true, sameEnemies: true, sameLoot: true, position: true, hp: true, campaign: true, chest: true, visited: true, noSaved: true, bodies: true });
    }
    await assertRestored();
    for (let trip = 0; trip < 3; trip++) {
      await page.evaluate(async () => {
        const g = window.returnGame, { CAMP } = await import('/src/camp.ts');
        if (!g.returnToCamp()) throw new Error('Repeated return failed');
        if (g.world.scene.children.filter(o => o === g.world.returnPortal).length !== 1) throw new Error('Duplicate portal');
        const p = g.world.path(g.position, CAMP.returnPortal).at(-1);
        g.position.copy(p); g.body.position.set(p.x, .5, p.z); g.ui.update(0);
      });
      await page.keyboard.press('f');
      await assertRestored();
    }
    await page.evaluate(() => {
      const g = window.returnGame; g.returnToCamp();
      const suspended = g.campReturn.world;
      if (!g.enterLevel(3) || g.campReturn || suspended.scene.children.length) throw new Error('New journey did not release previous scene');
      g.returnToCamp();
      if (g.campReturn.world.level.index !== 3) throw new Error('Portal did not target latest level');
    });
    if (viewport.width > 700) await page.evaluate(async () => {
      const g = window.returnGame, { CAMP } = await import('/src/camp.ts');
      const { createWirtsLeg } = await import('/src/items.ts');
      const p = g.world.path(g.position, CAMP.returnPortal).at(-1);
      g.position.copy(p); g.body.position.set(p.x, .5, p.z);
      const saved = g.campReturn, save = g.save;
      g.save = () => false;
      if (g.resumeCampReturn() || !g.inCamp || g.campReturn !== saved) throw new Error('Failed save lost the return destination');
      g.save = save;
      for (const area of ['cow', 'uberDiablo']) {
        const catalyst = createWirtsLeg(2); g.hero.inventory.push(catalyst);
        if (!g.enterSpecialArea(area, 2, catalyst)) throw new Error('Special area fixture failed');
        const world = g.world, enemies = g.enemies, count = g.hero.inventory.length;
        const boss = g.enemies.find(e => e.boss); if (boss) g.combat.damage(boss, 1e9, 'magic', true);
        const defeated = g.hero.bossDefeated, loot = g.loot;
        g.returnToCamp();
        const end = g.world.path(g.position, CAMP.returnPortal).at(-1);
        g.position.copy(end); g.body.position.set(end.x, .5, end.z);
        if (!g.resumeCampReturn() || g.specialArea !== area || g.world !== world || g.enemies !== enemies || g.loot !== loot || g.hero.bossDefeated !== defeated || g.hero.inventory.length !== count) throw new Error('Special area did not resume its completed encounter without a second catalyst');
        g.update(1 / 60); g.returnToCamp();
      }
    });
    await page.reload();
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.returnGame?.profile && !window.returnGame.paused);
    assert.equal(await page.evaluate(() => !!window.returnGame.campReturn || !!window.returnGame.world.returnPortal), false);
    await expect(page.getByRole('button', { name: '返程传送门', exact: true })).toHaveCount(0);
    await page.close();
    console.log(`Camp return ${viewport.width}: exact scene/position, frozen enemies/loot/chests, repeated F/click, independent portals, new journey cleanup and reload passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
