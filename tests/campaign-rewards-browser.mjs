import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';
import { savedProfile } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.rewardGame = game;') });
  });
  const hero = newHero(); hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('reward-fixture')) {
      localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('reward-fixture', '1');
    }
  }, serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => cancelAnimationFrame(window.rewardGame.frameId));
  for (const diff of [0, 1, 2]) for (const [index, label] of [[5, '技能点 +2'], [11, '全属性 +5'], [16, '技能点 +2'], [22, '所有抗性 +5'], [23, '升级 1 级']]) {
    for (const replay of [false, true]) {
      const before = await page.evaluate(({ index, diff }) => {
        const g = window.rewardGame; g.ui.closePanel();
        if (!g.enterLevel(index, diff)) throw new Error('Cannot enter reward level');
        g.ui.openPanel('quest');
        return structuredClone(g.hero);
      }, { index, diff });
      await expect(page.locator('.quest-rewards')).toContainText(`${label} · ${replay ? '已领取' : '本难度限领一次'}`);
      const after = await page.evaluate(() => {
        const g = window.rewardGame; g.ui.closePanel();
        const boss = g.enemies.find(enemy => enemy.boss); boss.xpScale = 0;
        g.combat.damage(boss, 1e9, 'magic', true); g.ui.openPanel('quest');
        return structuredClone(g.hero);
      });
      assert.equal(after.bossDefeated, true);
      assert.equal(after.skillPoints - before.skillPoints, replay ? 0 : index === 23 ? 1 : [5, 16].includes(index) ? 2 : 0);
      for (const key of ['strength', 'dexterity', 'vitality', 'energy']) assert.equal(after[key] - before[key], !replay && index === 11 ? 5 : 0);
      assert.equal(after.bonusResist - before.bonusResist, !replay && index === 22 ? 5 : 0);
      assert.equal(after.level - before.level, !replay && index === 23 ? 1 : 0);
      await expect(page.locator('.quest-rewards')).toContainText(`${label} · 已领取`);
      assert.deepEqual((await savedProfile(page)).hero.questRewards, after.questRewards);
    }
  }
  await page.reload();
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => cancelAnimationFrame(window.rewardGame.frameId));
  const loaded = await page.evaluate(() => window.rewardGame.hero);
  assert.equal(loaded.questRewards.length, 15); assert.equal(loaded.level, 4);
  assert.equal(loaded.bonusResist, 15); assert.equal(loaded.skillPoints, 15);
  assert.deepEqual(errors, []);
  console.log('All 15 difficulty rewards, boss kills, replay prevention, UI and save reload passed');
} finally { await browser.close(); }
