import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';
import { monsterExperience } from '../src/balance.ts';
import { savedProfile } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch(), body = await response.text();
      assert.ok(body.includes('const game = new Game();'));
      await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.ppGame = game;') });
    });
    const hero = newHero(); hero.level = 30; hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
    await page.addInitScript(save => {
      if (!sessionStorage.getItem('pp-fixture')) {
        localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('pp-fixture', '1');
      }
    }, serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.evaluate(() => cancelAnimationFrame(window.ppGame.frameId));
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('人数难度', { exact: true })).toHaveValue('1');
    assert.equal(await page.locator('#player-count option').count(), 8);
    await page.getByLabel('人数难度', { exact: true }).selectOption('8');
    await expect(page.locator('#player-count-hint')).toContainText('生命 / 经验 ×4.5');
    assert.equal((await savedProfile(page)).hero.playerCount, 8);
    assert.equal(await page.locator('.panel-pause').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    const high = await page.evaluate(() => {
      const g = window.ppGame; g.ui.closePanel(); g.enterLevel(0, 1);
      const enemy = g.enemies.find(e => !e.boss && !e.elite); window.ppEnemy = enemy;
      return { hp: enemy.maxHp, damage: enemy.damage, attackRating: enemy.attackRating, players: enemy.playerCount };
    });
    assert.equal(high.players, 8);
    await page.keyboard.press('Escape');
    await expect(page.locator('#player-count-hint')).toContainText('伤害 / 命中 ×1.4375');
    await page.getByLabel('人数难度', { exact: true }).selectOption('1');
    const kill = await page.evaluate(() => {
      const g = window.ppGame, e = window.ppEnemy;
      const unchanged = { hp: e.maxHp, damage: e.damage, attackRating: e.attackRating, players: e.playerCount };
      const before = g.hero.xp, level = g.hero.level, monsterLevel = e.level, baseLife = e.definition.hp, xpScale = e.xpScale;
      const mods = g.combat.snapshot().stats.mods;
      g.ui.closePanel(); g.combat.damage(e, 1e9, 'magic', true);
      return { unchanged, before, after: g.hero.xp, level, monsterLevel, baseLife, xpScale, experienceBonus: mods.experienceBonus ?? 0 };
    });
    assert.deepEqual(kill.unchanged, high);
    const xp = monsterExperience(kill.level, kill.monsterLevel, 'monster', { difficulty: 1, act: 0, baseLife: kill.baseLife, players: 8 });
    assert.equal(kill.after - kill.before, Math.floor(xp * kill.xpScale * (1 + kill.experienceBonus / 100)));
    const low = await page.evaluate(() => {
      const g = window.ppGame; g.enterLevel(0, 1);
      const e = g.enemies.find(e => e.definition.id === window.ppEnemy.definition.id && !e.boss && !e.elite);
      return { hp: e.maxHp, damage: e.damage, players: e.playerCount };
    });
    assert.equal(low.players, 1); assert.equal(high.hp, Math.floor(low.hp * 4.5));
    assert.ok(Math.abs(high.damage / low.damage - 1.4375) < 1e-8);

    await page.keyboard.press('Escape');
    for (const players of ['2', '3', '4', '5', '6', '7', '8']) {
      await page.getByLabel('人数难度', { exact: true }).selectOption(players);
      assert.equal((await savedProfile(page)).hero.playerCount, Number(players));
    }
    assert.equal(await page.evaluate(() => {
      const g = window.ppGame, save = g.save; g.save = () => false;
      const result = g.setPlayerCount(2); g.save = save;
      return !result && g.hero.playerCount === 8;
    }), true);
    assert.deepEqual(await page.evaluate(() => {
      const g = window.ppGame, addLoot = g.addLoot, random = Math.random;
      const counts = [];
      try {
        Math.random = () => .2;
        for (const players of [1, 2, 3, 4, 5, 6, 7, 8]) {
          g.setPlayerCount(players); const drops = [];
          g.addLoot = drop => drops.push(drop);
          g.dropLoot(g.position, 'monster', 30);
          counts.push(drops.filter(drop => drop.item).length);
        }
      } finally { g.addLoot = addLoot; Math.random = random; }
      return counts;
    }), [0, 0, 1, 1, 1, 1, 1, 1], 'current setting reaches real loot generation');
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.evaluate(() => cancelAnimationFrame(window.ppGame.frameId));
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('人数难度', { exact: true })).toHaveValue('8');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile ESC 1pp–8pp, spawn snapshots, actual kill XP, save rollback and reload passed');
} finally { await browser.close(); }
