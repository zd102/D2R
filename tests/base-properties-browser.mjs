import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { rollBaseProperties } from '../src/base-properties.ts';
import { newHero, serializeSave } from '../src/model.ts';
import { inventoryItems, savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/base-properties-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const hero = newHero(); hero.gold = 10000;
const shield = makeItem(BASES.find(base => base.baseCode === 'pa1'), 'native-unidentified');
shield.level = 90; shield.rarity = 'magic'; shield.mods = { magicFind: 99 };
rollBaseProperties(shield, () => 0); shield.identified = false;
const armor = makeItem(BASES.find(base => base.baseCode === 'uit'), 'superior-ethereal');
armor.level = 90; armor.baseQuality = 'superior'; rollBaseProperties(armor, () => 0); armor.sockets = 4;
hero.inventory = [shield, armor]; placeItems(hero.inventory);
const errors = [];
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 700 });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      if (!sessionStorage.getItem('native-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('native-fixture', '1'); }
    }, serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
    await page.locator('.bottom-nav [data-panel="inventory"]').click();
    await page.locator('[data-item="native-unidentified"]').click();
    await expect(page.locator('.item-affixes')).toContainText('+5 所有抗性');
    await expect(page.locator('.item-affixes')).toContainText('无形');
    await expect(page.locator('.item-affixes')).not.toContainText('+99');
    await expect(page.locator('.unidentified-note')).toContainText('鉴定后显示额外魔法属性');
    await page.screenshot({ path: `${output}/unidentified-${viewport.width}.png` });
    await page.locator('[data-identify="native-unidentified"]').click();
    await expect(page.locator('.item-affixes')).toContainText('+99');
    await inventoryItems(page); await page.locator('[data-item="superior-ethereal"]').click();
    await expect(page.locator('.item-basics')).toContainText('超强');
    await expect(page.locator('.item-basics')).toContainText('无法修复');
    await expect(page.locator('.item-affixes')).toContainText('+5 增强防御');
    await expect(page.locator('.item-showcase .item-visual.ethereal')).toBeVisible();
    const saved = (await savedProfile(page)).hero.inventory;
    assert.deepEqual(saved.find(item => item.id === armor.id), armor);
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
    assert.deepEqual((await savedProfile(page)).hero.inventory.find(item => item.id === armor.id), armor);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Native properties visible before identification; superior/ethereal details and reload passed on desktop/mobile.');
} finally { await browser.close(); }
