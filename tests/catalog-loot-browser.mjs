import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { BASES, SPECIAL_ITEMS, RUNEWORDS, RUNE_ORDER, makeItem, specialItem } from '../src/items.ts';
import { newHero, serializeSave } from '../src/model.ts';
import { enterGame, openCampaign, savedProfile, inventoryItems, inventoryItem, openSocketEditor, runeRecipes } from './browser-helpers.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = '.verification/catalog-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const hero = newHero(); hero.level = 99; hero.strength = hero.dexterity = 250; hero.gold = 10000; hero.runes = [...RUNE_ORDER];
    hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
    const target = makeItem(BASES.find(base => base.name === '水晶剑')); target.sockets = 4;
    const jewel = specialItem(SPECIAL_ITEMS.find(item => item.baseCode === 'jew').catalogId); jewel.identified = true;
    hero.inventory = [target, jewel];
    const page = await browser.newPage({ viewport }); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      if (!sessionStorage.getItem('catalog-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('catalog-fixture', '1'); }
    }, serializeSave(hero));
    await page.goto(base); await enterGame(page);
    await page.screenshot({ path: `${output}/world-${viewport.width}.png` });
    const canvas = await page.locator('canvas').first().evaluate(canvas => {
      const copy = document.createElement('canvas'); copy.width = copy.height = 64;
      const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0, 64, 64);
      const pixels = ctx.getImageData(0, 0, 64, 64).data, colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
      return colors.size;
    });
    assert.ok(canvas > 12, `world canvas ${viewport.width}: ${canvas}`);
    await openCampaign(page);
    await page.locator('[data-campaign-difficulty="2"]').click();
    for (let act = 0; act < 5; act++) {
      await page.locator(`[data-campaign-act="${act}"]`).click();
      await expect(page.locator('.campaign-level')).toHaveCount(5);
      assert.equal(await page.locator('.stage-info').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)), true);
    }
    await expect(page.locator('.campaign-level').last()).toContainText('地狱火炬');
    await page.screenshot({ path: `${output}/bosses-${viewport.width}.png` });
    await page.keyboard.press('Escape'); await page.keyboard.press('i');
    await page.locator('[data-bag-view="runes"]').click();
    await expect(page.locator('.runeword-list>div')).toHaveCount(RUNEWORDS.length);
    assert.equal(await page.locator('.runeword-list>div').evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth + 1)), true);
    await runeRecipes(page); await page.locator('.runeword-list').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/recipes-${viewport.width}.png` });
    await page.locator('[data-bag-view="inventory"]').click(); await page.locator(`[data-item="${jewel.id}"]`).click();
    await expect(page.locator('.rarity-tag')).toContainText('珠宝');
    await inventoryItem(page, target.id); await openSocketEditor(page);
    await page.locator(`[data-socket-jewel="${jewel.id}"]`).click();
    const saved = (await savedProfile(page)).hero;
    assert.equal(saved.inventory.length, 1); assert.equal(saved.inventory[0].socketedJewels[0].name, jewel.name);
    await expect(page.locator(`[data-item="${target.id}"] small`)).toHaveText('1/4');
    assert.equal(await page.locator('.socket-row>span').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)), true);
    await page.locator('.item-details').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/jewel-${viewport.width}.png` });
    await page.reload(); await enterGame(page); assert.deepEqual((await savedProfile(page)).hero.inventory, saved.inventory);
    await page.close(); console.log(`Catalog, 25 boss labels, 78 recipes, jewel sockets and persistence passed at ${viewport.width}px`);
  }
  const page = await browser.newPage(); await page.goto(base);
  const production = await page.evaluate(async () => {
    const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts'), { LEVELS } = await import('/src/campaign.ts');
    const hero = newHero(); hero.level = 99; hero.difficultyLevel = 2; hero.campaign.cleared = [25, 25, 25];
    const drops = [], game = { hero, level: LEVELS[24], nextId: 1, addLoot(drop) { drops.push(drop); } };
    const original = Math.random; Math.random = () => 0;
    try { Game.prototype.dropLoot.call(game, { x: 0, z: 0 }, 'actBoss', 99); }
    finally { Math.random = original; }
    return drops.some(drop => drop.item?.catalogId === 'unique-401');
  });
  assert.equal(production, true); await page.close(); assert.deepEqual(errors, []);
} finally { await browser.close(); }
