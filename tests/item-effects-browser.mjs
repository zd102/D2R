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
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '打开百科', exact: true }).click();
    const query = page.getByRole('searchbox', { name: '搜索装备或物品' });
    await query.fill('Rainbow Facet');
    const facet = CATALOG_SPECIALS.find(entry => entry.code === 'jew' && entry.properties.some(([code]) => code === 'extra-fire'));
    await page.locator(`[data-encyclopedia-entry="${facet.id}"]`).click();
    await expect(page.locator('.encyclopedia-detail')).toContainText('+4 火焰技能伤害 %');
    await expect(page.locator('.encyclopedia-detail')).toContainText('+4 降低敌人火焰抗性 %');
    await expect(page.locator('.encyclopedia-detail')).toContainText('变量 3 - 5');
    await expect(page.locator('.encyclopedia-detail')).toContainText('未生效：100%');
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
      const game = { hero, level: LEVELS[0], monsterCombat: { cancel() {} }, world: { physics: { removeBody() {} } }, dropLoot() {}, ui: { toast() {} }, save() {} };
      const expected = Math.floor(monsterExperience(30, 30, 'monster', { difficulty: 0, act: 0, baseLife: 30, firstClear: true }) * 1.1);
      Game.prototype.killEnemy.call(game, target); Game.prototype.killEnemy.call(game, target);
      return { hp: hero.hp, mana: hero.mana, xp: hero.xp, expected, kills: hero.kills, redeemed: target.redeemed };
    });
    assert.deepEqual(reward, { hp: 35, mana: 3, xp: reward.expected, expected: reward.expected, kills: 1, redeemed: true });
    console.log(`Item modifiers, proc labels and production kill rewards passed at ${viewport.width}px`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
