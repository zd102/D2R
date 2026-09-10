import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem, specialItem, socketItem, placeItems } from '../src/items.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-data.ts';
import { savedProfile, inventoryItems, openSocketEditor } from './browser-helpers.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.OUTPUT_DIR || '.verification/item-rolls-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
const hero = newHero(); hero.gold = 1000;
const armor = specialItem(CATALOG_SPECIALS.find(entry => entry.key === 'Skin of the Vipermagi').id, () => 0); armor.id = 'rolled-armor';
const belt = specialItem(CATALOG_SPECIALS.find(entry => entry.key === "Tal Rasha's Fire-Spun Cloth").id, () => 1); belt.id = 'rolled-belt'; belt.identified = true;
const sword = makeItem(BASES.find(base => base.baseCode === 'crs'), 'rolled-spirit'); sword.sockets = 4;
for (const rune of ['tal', 'thul', 'ort']) socketItem(sword, rune);
hero.inventory = [armor, belt, sword]; hero.runes = ['amn']; placeItems(hero.inventory);
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700 }); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      if (!sessionStorage.getItem('rolls-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('rolls-fixture', '1'); }
    }, serializeSave(hero));
    await page.goto(base); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
    await page.locator('.bottom-nav [data-panel="inventory"]').click();
    await page.locator('[data-item="rolled-armor"]').click(); await page.locator('[data-identify="rolled-armor"]').click();
    await expect(page.locator('.item-affixes')).toContainText('+20 所有抗性');
    await expect(page.locator('.item-affixes')).toContainText('20 - 35');
    assert.deepEqual((await savedProfile(page)).hero.inventory.find(item => item.id === armor.id).mods, armor.mods);
    await inventoryItems(page); await page.locator('[data-item="rolled-belt"]').click(); await expect(page.locator('.item-affixes')).toContainText('+15');
    await inventoryItems(page); await page.locator('[data-item="rolled-spirit"]').click(); await openSocketEditor(page);
    await page.locator('[data-socket="amn"]').click();
    const rolled = (await savedProfile(page)).hero.inventory.find(item => item.id === sword.id);
    assert.equal(rolled.rarity, 'runeword'); assert.equal(rolled.catalogVersion, 2);
    assert.ok(rolled.mods.fcr >= 25 && rolled.mods.fcr <= 35); assert.ok(rolled.mods.mana >= 89 && rolled.mods.mana <= 112);
    await expect(page.locator('.item-affixes')).toContainText(`+${rolled.mods.fcr} 施法速度`);
    await expect(page.locator('.item-affixes')).toContainText('25 - 35');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.item-affixes').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/crafted-${viewport.width}.png` });
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
    assert.deepEqual((await savedProfile(page)).hero.inventory.find(item => item.id === sword.id), rolled);
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: '保存并切换角色', exact: true }).click();
    await page.getByRole('button', { name: '打开百科', exact: true }).click();
    await page.getByRole('searchbox').fill('Spirit'); await page.getByRole('combobox', { name: '物品分类', exact: true }).selectOption('runeword');
    await page.locator('.encyclopedia-entry').click();
    await expect(page.locator('.encyclopedia-detail')).toContainText('+30 施法速度');
    await expect(page.locator('.encyclopedia-detail')).toContainText('变量 25 - 35');
    await page.getByRole('combobox', { name: '符文之语底材', exact: true }).selectOption('水晶剑');
    const before = await page.locator('.encyclopedia-mods').innerText();
    await page.getByRole('combobox', { name: '符文之语底材', exact: true }).selectOption('统治者大盾');
    await page.getByRole('combobox', { name: '符文之语底材', exact: true }).selectOption('水晶剑');
    assert.equal(await page.locator('.encyclopedia-mods').innerText(), before);
    await page.screenshot({ path: `${output}/preview-${viewport.width}.png` });
    await page.close(); console.log(`Random crafting, ranges, identification, stable previews and reload passed at ${viewport.width}px`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${page.viewportSize().width}.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
