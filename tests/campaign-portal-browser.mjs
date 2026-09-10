import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats, serializeSave } from '../src/model.ts';
import { savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/campaign-portals';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.portalGame = game;') });
  });
  const hero = newHero(); hero.level = 90; hero.vitality = 1000;
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.portalGame && !window.portalGame.paused);
  await page.evaluate(() => cancelAnimationFrame(window.portalGame.frameId));

  for (const [index, diff] of [[0, 0], [4, 0], [24, 0], [24, 1], [24, 2]]) {
    await page.evaluate(({ index, diff }) => {
      const g = window.portalGame;
      g.hero.campaign.cleared = diff === 0 ? [index, 0, 0] : diff === 1 ? [25, index, 0] : [25, 25, index];
      g.hero.unlockedDifficulty = diff;
      if (!g.enterLevel(index, diff)) throw new Error('Could not enter portal fixture');
      g.monsterCombat.update = () => {}; g.invincible = 1000;
      const route = g.world.path(g.position, g.world.layout.exit), end = route.at(-1);
      if (!end || Math.hypot(end.x - g.world.layout.exit.x, end.z - g.world.layout.exit.z) >= 3.5) throw new Error('Portal is unreachable');
      window.portalApproach = end.toArray();
      g.position.copy(end); g.body.position.set(end.x, .5, end.z); g.ui.update(0);
    }, { index, diff });
    assert.equal(await page.evaluate(() => window.portalGame.world.exit.visible), false);
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => window.portalGame.hero.campaign.current), index, 'inactive portal cannot advance');
    await page.evaluate(() => {
      const g = window.portalGame; g.ui.closePanel(); g.releaseInput();
      g.body.position.set(0, .5, 11); g.position.set(0, 0, 11);
      const quest = g.level.quest;
      if (quest.kind === 'kill') g.hero.campaign.kills = quest.count;
      else { g.hero.campaign.objects = Array.from({ length: quest.count }, (_, i) => i); g.hero.campaign.objects.forEach(id => g.world.completeObjective(id)); }
      g.combat.damage(g.enemies.find(e => e.boss), 1e9, 'magic', true);
      for (let frame = 0; frame < 150; frame++) g.update(1 / 60);
      g.ui.update(0);
    });
    assert.deepEqual(await page.evaluate(() => {
      const g = window.portalGame;
      return { cleared: g.hero.bossDefeated, visible: g.world.exit.visible, paused: g.paused, index: g.hero.campaign.current };
    }), { cleared: true, visible: true, paused: false, index });
    assert.equal(await page.getByRole('dialog').count(), 0, 'boss defeat never opens a settlement window');
    assert.ok(await page.evaluate(() => window.portalGame.loot.some(l => l.item)), 'boss equipment remains available to collect');
    assert.equal((await savedProfile(page)).hero.campaign.cleared[diff], index + 1);

    await page.keyboard.press('j');
    assert.equal(await page.locator('[data-panel="victory"], [data-action="next"]').count(), 0);
    await expect(page.locator('.panel-quest')).toContainText('传送门已激活');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-panel="victory"]').count(), 0, 'pause has no settlement entry');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => window.portalGame.hero.campaign.current), index, 'distant F cannot activate the exit');

    await page.evaluate(() => {
      const g = window.portalGame, [x, , z] = window.portalApproach;
      g.position.set(x, 0, z); g.body.position.set(x, .5, z);
      g.updateCamera(1); g.camera.updateMatrixWorld(); g.ui.update(0);
      g.renderer.render(g.world.scene, g.camera);
    });
    assert.equal(await page.evaluate(() => window.portalGame.contextAction()?.kind), 'exit');
    await expect(page.locator('#context-action')).toBeVisible();
    await page.screenshot({ path: `${output}/portal-${diff}-${index}.png` });
    if (index === 0) {
      await page.evaluate(() => { const g = window.portalGame; window.portalSave = g.save; g.save = () => false; });
      await page.keyboard.press('f');
      assert.equal(await page.evaluate(() => window.portalGame.hero.campaign.current), index, 'failed save keeps the completed area');
      assert.equal(await page.evaluate(() => window.portalGame.hero.bossDefeated && window.portalGame.world.exit.visible), true);
      await page.evaluate(() => window.portalGame.save = window.portalSave);
    }
    // Walking into range does not auto-teleport; an explicit F (or touch on its
    // context action) is required, with no intermediate modal.
    if (index === 4) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.portalGame.ui.update(0));
      await page.locator('#context-action').click();
      await page.setViewportSize({ width: 1440, height: 960 });
    } else await page.keyboard.press('f');
    const next = await page.evaluate(() => {
      const g = window.portalGame;
      return { inCamp: g.inCamp, index: g.hero.campaign.current, diff: g.hero.difficultyLevel, paused: g.paused, portal: g.world.exit.visible };
    });
    assert.equal(next.paused, false); assert.equal(next.portal, false);
    assert.equal(next.inCamp, index === 24 && diff === 2);
    if (!next.inCamp) {
      assert.equal(next.index, index === 24 ? 0 : index + 1);
      assert.equal(next.diff, index === 24 ? diff + 1 : diff);
    }
    const saved = (await savedProfile(page)).hero;
    assert.equal(saved.campaign.current, next.index); assert.equal(saved.difficultyLevel, next.diff);
    console.log(`Portal passed: difficulty ${diff}, area ${index}`);
  }
  assert.deepEqual(errors, []);
  console.log('Completion without modal, gated portals, F/touch progression, save rollback and final Hell return passed');
} finally { await browser.close(); }
