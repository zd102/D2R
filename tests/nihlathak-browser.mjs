import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const diff of [0, 1, 2]) {
    const context = await browser.newContext({ viewport: { width: diff === 1 ? 390 : 1440, height: 900 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    // Expose the instance only in this intercepted test response.
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = window.testGame = new Game();') });
    });
    const hero = newHero(); hero.level = 90; hero.difficultyLevel = diff; hero.unlockedDifficulty = diff;
    hero.campaign.cleared = diff === 0 ? [22,0,0] : diff === 1 ? [25,22,0] : [25,25,22];
    hero.questRewards.push(`${diff}:anya`);
    await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.testGame?.inCamp && !window.testGame.paused);
    await page.evaluate(() => window.testGame.ui.openPanel('mystery-portal'));
    assert.equal(await page.locator(`[data-temple-entry="${diff}"]`).isEnabled(), true);
    if (diff < 2) assert.equal(await page.locator(`[data-temple-entry="${diff + 1}"]`).isDisabled(), true);
    await page.locator(`[data-temple-entry="${diff}"]`).click();
    await page.waitForFunction(() => window.eclipseState.area.id === 'nihlathaks-temple' && !window.eclipseState.paused);
    const result = await page.evaluate(() => {
      const g = window.testGame, start = structuredClone(g.hero.campaign);
      g.paused = true;
      const pindle = g.enemies.find(e => e.definition.id === 'pindleskin');
      const distance = pindle.actor.group.position.distanceTo(g.position);
      const path = g.world.path(g.position, pindle.actor.group.position);
      const pindleSuper = pindle.superUnique, fire = pindle.affixes.some(a => a.id === 'fireEnchanted');
      g.killEnemy(pindle);
      const afterPindle = g.hero.bossDefeated, nihl = g.enemies.find(e => e.definition.id === 'nihlathak');
      const mc = g.monsterCombat, rewards = JSON.stringify([g.hero.xp, g.hero.kills, g.loot.length]);
      mc.summon(nihl, 'summonMinions', nihl.actor.group.position);
      const summoned = g.enemies.find(e => e.owner === nihl.id && e.corpseExplosionSource);
      if (!summoned) throw new Error('Nihlathak did not summon a minion');
      g.killEnemy(summoned);
      const source = mc.explosionTarget(nihl);
      if (source !== summoned || summoned.redeemed || !summoned.actor.group.visible) throw new Error('Summoned minion did not leave an explodable corpse');
      mc.startCast(nihl, 'corpseExplosion'); mc.cancel(nihl);
      if (!summoned.redeemed) throw new Error('Corpse explosion did not consume the summoned corpse');
      mc.summon(nihl, 'summonMinions', nihl.actor.group.position);
      const peaceful = g.enemies.find(e => !e.dead && e.owner === nihl.id);
      if (!peaceful) throw new Error('Consumed corpse did not free a summon slot');
      g.killEnemy(peaceful, { restInPeace: 1 });
      if (!peaceful.redeemed || mc.explosionTarget(nihl)) throw new Error('Rest in Peace did not deny corpse explosion');
      if (JSON.stringify([g.hero.xp, g.hero.kills, g.loot.length]) !== rewards) throw new Error('Summoned minions granted rewards');
      if (mc.attackSpec(nihl, 'inferno').type !== 'cold') throw new Error('Arctic Blast must deal cold damage');
      const minion = g.enemies.find(e => !e.boss && e.actor.group.position.distanceTo(nihl.actor.group.position) < 8);
      g.killEnemy(minion);
      const target = g.monsterCombat.explosionTarget(nihl);
      g.monsterCombat.startCast(nihl, 'corpseExplosion');
      const consumed = target?.redeemed;
      g.killEnemy(nihl);
      return { distance, path: path.length, pindleSuper, fire, afterPindle, nihlSuper: nihl.superUnique, completed: g.hero.bossDefeated, unchanged: JSON.stringify(start) === JSON.stringify(g.hero.campaign), consumed, diff: g.hero.difficultyLevel, finite: g.enemies.every(e => Number.isFinite(e.hp)) };
    });
    assert.ok(result.distance <= 8 && result.path > 0);
    assert.equal(result.diff, diff);
    for (const key of ['pindleSuper','fire','nihlSuper','completed','unchanged','consumed','finite']) assert.equal(result[key], true, key);
    assert.equal(result.afterPindle, false);
    await page.evaluate(() => { const g = window.testGame; g.paused = false; g.returnToCamp(); });
    await page.waitForFunction(() => window.testGame.inCamp && !window.testGame.paused);
    await page.evaluate(() => window.testGame.ui.openPanel('mystery-portal'));
    await page.locator(`[data-temple-entry="${diff}"]`).click();
    await page.waitForFunction(() => window.testGame.specialArea === 'nihlathak' && !window.testGame.inCamp);
    assert.equal(await page.evaluate(() => window.testGame.enemies.some(e => e.definition.id === 'pindleskin' && !e.dead)), true);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('Nihlathak: all difficulties, mobile portal, entrance, super uniques, corpse explosion, completion and repeat entry passed');
} catch (error) { console.error(errors); throw error; } finally { await browser.close(); }
