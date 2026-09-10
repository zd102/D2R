import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { applyAffixes, eligibleAffixes, CHARM_BASES } from '../src/affixes.ts';
import { newHero, serializeSave, stats } from '../src/model.ts';
import { enterGame, savedProfile, inventoryItems } from './browser-helpers.mjs';

function magicPair(item, prefixName, suffixName, suffixLevel) {
  const pool = eligibleAffixes(item), prefix = pool.find(a => a.kind === 'prefix' && a.name === prefixName), suffix = pool.find(a => a.kind === 'suffix' && a.name === suffixName && (!suffixLevel || a.level === suffixLevel));
  assert.ok(prefix && suffix);
  const selection = (target, candidates) => (candidates.slice(0, candidates.indexOf(target)).reduce((n, a) => n + a.frequency, 0) + target.frequency / 2) / candidates.reduce((n, a) => n + a.frequency, 0);
  const rolls = [.99, selection(prefix, pool.filter(a => a.kind === 'prefix')), selection(suffix, pool.filter(a => a.kind === 'suffix' && a.group !== prefix.group))];
  return applyAffixes(item, () => rolls.shift() ?? .999999);
}
const charm = size => ({ id: size, name: CHARM_BASES[size].name, base: CHARM_BASES[size].name, slot: 'amulet', rarity: 'magic', level: 99, power: 0, value: 100, charm: true, charmSize: size, width: 1, height: CHARM_BASES[size].height, mods: {} });
const hero = newHero(); hero.level = 99; hero.gold = 2000; hero.strength = 200; hero.dexterity = 200;
const blue = magicPair({ ...makeItem(BASES.find(b => b.name === '水晶剑'), 'blue'), rarity: 'magic', level: 99 }, 'Cruel', 'of Quickness');
const rare = applyAffixes({ ...makeItem(BASES.find(b => b.name === '项链'), 'rare'), rarity: 'rare', level: 99 }, () => .99999);
hero.inventory = [blue, magicPair(charm('small'), 'Fine', 'of Vita'), magicPair(charm('large'), 'Shimmering', 'of Vita', 74), magicPair(charm('grand'), 'Lion Branded', 'of Vita', 91)];
hero.stash = [rare, magicPair({ ...charm('small'), id: 'poison' }, 'Pestilent', 'of Anthrax')];
placeItems(hero.inventory); placeItems(hero.stash);
await mkdir('.verification', { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700 }); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(save => { if (!sessionStorage.getItem('affix-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('affix-fixture', '1'); } }, serializeSave(hero));
    await page.goto(base); await enterGame(page);
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('#game-canvas'), copy = document.createElement('canvas'); copy.width = copy.height = 64;
      const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0, 64, 64); const data = ctx.getImageData(0, 0, 64, 64).data, colors = new Set();
      for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      return colors.size;
    });
    assert.ok(pixels > 25, `game canvas nonblank: ${pixels}`);
    await page.locator('.bottom-nav [data-panel="inventory"]').click();
    await page.locator('[data-item="blue"]').click();
    await expect(page.locator('.item-affixes')).toHaveCount(0);
    await expect(page.locator('.item-basics')).toContainText('5 - 15');
    await page.locator('[data-identify="blue"]').click();
    await expect(page.locator('.item-affixes')).toContainText('+300 增强伤害 %');
    await expect(page.locator('.affix-range')).toContainText('201 - 300');
    await expect(page.locator('.item-basics')).toContainText('20 - 60');
    await page.locator('.item-details').scrollIntoViewIfNeeded(); await page.screenshot({ path: `.verification/affixes-blue-${viewport.width}.png` });
    for (const size of ['small', 'large', 'grand']) {
      await inventoryItems(page);
      const item = page.locator(`[data-item="${size}"]`);
      assert.equal(await item.evaluate(el => getComputedStyle(el).gridRowEnd), `span ${CHARM_BASES[size].height}`);
      await item.click(); await page.locator(`[data-identify="${size}"]`).click();
      await expect(page.locator('.rarity-tag')).toContainText(CHARM_BASES[size].name);
      await expect(page.locator('.item-showcase .item-art')).toHaveCount(1);
    }
    await expect(page.locator('.item-affixes')).toContainText('+1 战斗技能'); await expect(page.locator('.item-affixes')).toContainText('+45 生命');
    await expect(page.locator('.affix-range')).toContainText('41 - 45');
    const before = (await savedProfile(page)).hero, life = stats(before).maxHp;
    await page.locator('[data-stash="grand"]').click(); const stored = (await savedProfile(page)).hero; assert.equal(life - stats(stored).maxHp, 45);
    await inventoryItems(page); await page.locator('[data-bag-view="stash"]').click(); await page.locator('[data-item="rare"]').click(); await page.locator('[data-identify="rare"]').click();
    await expect(page.locator('.item-affixes')).toBeVisible(); await page.locator('.item-details').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.verification/affixes-rare-${viewport.width}.png` });
    await inventoryItems(page); await page.locator('[data-item="poison"]').click(); await page.locator('[data-identify="poison"]').click();
    await expect(page.locator('.item-affixes')).toContainText('451 毒素伤害，持续 12 秒');
    assert.equal(await page.locator('.item-affixes').getByText(/速率|帧数/).count(), 0);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.item-details, .item-affixes, .item-affixes li, .affix-range, .item-details h3')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className));
    assert.deepEqual(overflow, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.item-details').scrollIntoViewIfNeeded(); await page.screenshot({ path: `.verification/affixes-poison-${viewport.width}.png` });
    const saved = (await savedProfile(page)).hero; await page.reload(); await enterGame(page); const reloaded = (await savedProfile(page)).hero;
    for (const container of ['inventory', 'stash']) for (const item of saved[container]) {
      const restored = reloaded[container].find(candidate => candidate.id === item.id); assert.ok(restored); assert.deepEqual(restored.mods, item.mods); assert.deepEqual(restored.affixes, item.affixes); assert.equal(restored.identified, true);
    }
    await page.close(); console.log('Affix ranges, charm sizes, poison, persistence and nonblank canvas:', viewport);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
