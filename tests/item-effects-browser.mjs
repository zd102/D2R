import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { CATALOG_SPECIALS } from '../src/item-catalog-current.ts';

const output = '.verification/item-effects-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport }); page.on('pageerror', error => errors.push(error.message));
    const url = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'); url.searchParams.set('mode', 'local');
    await page.goto(url.href);
    await page.getByRole('button', { name: '打开百科', exact: true }).click();
    const query = page.getByRole('searchbox', { name: '搜索装备或物品' });
    await query.fill('Rainbow Facet');
    const facet = CATALOG_SPECIALS.find(entry => entry.code === 'jew' && entry.properties.some(([code]) => code === 'extra-fire'));
    await page.locator(`[data-encyclopedia-entry="${facet.id}"]`).click();
    await expect(page.locator('.encyclopedia-detail')).toContainText('+4 火焰技能伤害 %');
    await expect(page.locator('.encyclopedia-detail')).toContainText('+4 降低敌人火焰抗性 %');
    await expect(page.locator('.encyclopedia-detail')).toContainText('变量 3 - 5');
    await expect(page.locator('.encyclopedia-detail')).toContainText('100% 死亡触发等级 31 陨石');
    await expect(page.locator('.encyclopedia-detail')).not.toContainText('未生效');
    await page.screenshot({ path: `${output}/facet-${viewport.width}.png` });
    if (viewport.width < 700) await page.getByRole('button', { name: '返回列表', exact: true }).click();
    await query.fill("Dracul's Grasp"); await page.locator('.encyclopedia-entry').click();
    await expect(page.locator('.encyclopedia-detail')).toContainText('5% 击中触发等级 10 偷取生命');
    assert.equal(await page.locator('.encyclopedia-detail li').evaluateAll(nodes => nodes.some(node => node.textContent.includes('未生效') && node.textContent.includes('偷取生命'))), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/trigger-${viewport.width}.png` });
    const reward = await page.evaluate(async () => {
      const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts'), { LEVELS } = await import('/src/campaign.ts');
      const { monsterExperience } = await import('/src/balance.ts');
      const hero = newHero(); hero.level = 30; hero.hp = 20; hero.mana = 0;
      hero.equipment.weapon.mods = { lifeOnKill: 10, lifeOnDemonKill: 5, manaOnKill: 3, experienceBonus: 10, restInPeace: 1 };
      const target = { dead: false, boss: false, level: 30, hp: 0, body: {}, definition: { race: 'demon', hp: 30 }, actor: { group: { rotation: {}, position: { x: 0, y: 0, z: 0 } } } };
      const events = [];
      const game = { hero, level: LEVELS[0], combat: { triggerItems(event) { events.push(event); } }, monsterCombat: { cancel() {}, onDeath() {} }, audio: { play() {} }, world: { physics: { removeBody() {} } }, dropLoot() {}, ui: { toast() {} }, save() {} };
      const expected = Math.floor(monsterExperience(30, 30, 'monster', { difficulty: 0, act: 0, baseLife: 30, firstClear: true }) * 1.1);
      Game.prototype.killEnemy.call(game, target); Game.prototype.killEnemy.call(game, target);
      return { hp: hero.hp, mana: hero.mana, xp: hero.xp, expected, kills: hero.kills, redeemed: target.redeemed, events };
    });
    assert.deepEqual(reward, { hp: 35, mana: 3, xp: reward.expected, expected: reward.expected, kills: 1, redeemed: true, events: ['kill-skill'] });
    const discount = await page.evaluate(async () => {
      const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts'), { POTIONS } = await import('/src/potions.ts');
      const hero = newHero(); hero.gold = 1000; hero.equipment.weapon.mods.vendorDiscount = 25;
      const game = { hero, audio: { play() {} }, ui: { renderPanel() {} }, save() {} };
      const previous = hero.potions[0]; Game.prototype.buy.call(game, 0);
      return { spent: 1000 - hero.gold, expected: Math.floor(POTIONS[0].price * .75), count: hero.potions[0] - previous };
    });
    assert.deepEqual(discount, { spent: discount.expected, expected: discount.expected, count: 1 });
    const lifecycle = await page.evaluate(async () => {
      const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts');
      const { xpForLevel } = await import('/src/paladin.ts'), { LEVELS } = await import('/src/campaign.ts');
      const { Vector3 } = await import('/node_modules/three/build/three.module.js');
      return ['player', 'mercenary', 'dead'].map(mode => {
        const hero = newHero(); hero.level = 30; hero.xp = xpForLevel(30) - 1; hero.hp = mode === 'dead' ? 0 : 20;
        const events = [], target = { dead: false, boss: false, level: 30, hp: 0, body: {}, definition: { race: 'demon', hp: 30 }, actor: { group: { rotation: {}, position: new Vector3() } } };
        const game = { hero, dead: mode === 'dead', position: new Vector3(), level: LEVELS[0],
          combat: { triggerItems(event) { events.push(event); if (event === 'kill-skill') hero.level++; } },
          monsterCombat: { cancel() {}, onDeath() {} }, audio: { play() {} }, world: { physics: { removeBody() {} } }, dropLoot() {}, ui: { toast() {} }, burst() {}, save() {} };
        Game.prototype.killEnemy.call(game, target, undefined, mode === 'mercenary');
        return { mode, events, alive: hero.hp > 0 };
      });
    });
    assert.deepEqual(lifecycle, [
      { mode: 'player', events: ['kill-skill', 'levelup-skill'], alive: true },
      { mode: 'mercenary', events: ['levelup-skill'], alive: true },
      { mode: 'dead', events: [], alive: false },
    ]);
    console.log(`Item modifiers, proc labels and production kill rewards passed at ${viewport.width}px`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
