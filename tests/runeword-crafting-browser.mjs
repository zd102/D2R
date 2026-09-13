import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { AVAILABLE_RUNEWORDS, BASES, makeItem, placeItems } from '../src/items.ts';
import { savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/runeword-crafting';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.craftingGame = game;') });
  });
  const spirit = AVAILABLE_RUNEWORDS.find(word => word.name === '精神'), stealth = AVAILABLE_RUNEWORDS.find(word => word.name === '隐密');
  const base = (code, id, sockets) => ({ ...makeItem(BASES.find(base => base.baseCode === code), id), sockets });
  const hero = newHero(); hero.cubeUnlocked = true;
  hero.inventory = [base('crs', 'sword', 4)]; hero.stash = [base('uit', 'shield', 4)]; hero.cube = [base('qui', 'armor', 2)];
  placeItems(hero.inventory); placeItems(hero.stash, 10); placeItems(hero.cube, 4, 3);
  hero.runes = [...spirit.runes, ...stealth.runes];
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('craft-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('craft-fixture', '1'); }
  }, serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => { const g = window.craftingGame; cancelAnimationFrame(g.frameId); g.ui.openPanel('inventory'); });
  await page.locator('.bag-item[data-item="sword"]').click();
  const preview = page.locator(`.item-runewords [data-runeword="${spirit.catalogId}"]`), craft = page.locator(`[data-craft-runeword="${spirit.catalogId}"]`);
  await expect(page.locator('.item-runewords [data-runeword]').first()).toHaveAttribute('data-runeword', spirit.catalogId);
  await expect(craft).toBeEnabled(); await preview.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await page.waitForTimeout(180); await preview.hover();
  await expect(page.locator('#ui-tooltip')).toContainText('25 - 35');
  assert.deepEqual(await page.evaluate(() => window.craftingGame.hero.runes), hero.runes);
  await page.screenshot({ path: `${output}/desktop-preview.png` });
  await craft.click();
  let saved = (await savedProfile(page)).hero;
  assert.equal(saved.inventory[0].catalogId, spirit.catalogId); assert.deepEqual(saved.inventory[0].runes, spirit.runes); assert.deepEqual(saved.runes, stealth.runes);
  await expect(page.locator('[data-craft-runeword]')).toHaveCount(0);
  await page.locator('[data-bag-view="stash"]').click(); await page.locator('.bag-item[data-item="shield"]').click();
  await expect(craft).toBeDisabled(); await expect(page.locator('.item-runewords')).toContainText('缺少：');
  await page.evaluate(runes => { const g = window.craftingGame; g.hero.runes.push(...runes); g.save(false); g.ui.renderPanel(); window.realCraftSave = g.save; g.save = () => false; }, spirit.runes);
  const before = await page.evaluate(() => JSON.stringify(window.craftingGame.hero));
  await craft.click(); assert.equal(await page.evaluate(() => JSON.stringify(window.craftingGame.hero)), before, 'failed save rolls back all consumed runes and item changes');
  await page.evaluate(() => { window.craftingGame.save = window.realCraftSave; });
  await craft.click(); saved = (await savedProfile(page)).hero; assert.equal(saved.stash[0].catalogId, spirit.catalogId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-bag-view="inventory"]').click(); await page.locator('.bag-item[data-item="armor"]').click();
  await page.locator('button[data-inventory-pane="details"]').click();
  const mobilePreview = page.locator(`.item-runewords [data-runeword="${stealth.catalogId}"]`);
  await expect(page.locator('.item-runewords [data-runeword]').first()).toHaveAttribute('data-runeword', stealth.catalogId);
  await mobilePreview.scrollIntoViewIfNeeded();
  const box = await mobilePreview.boundingBox(), cdp = await page.context().newCDPSession(page);
  async function tap(x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#ui-tooltip')).toContainText('隐密');
  await page.locator('.panel-header').click();
  const mobileCraft = page.locator(`[data-craft-runeword="${stealth.catalogId}"]`); await mobileCraft.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/mobile-craft.png` });
  const craftBox = await mobileCraft.boundingBox(); await tap(craftBox.x + craftBox.width / 2, craftBox.y + craftBox.height / 2);
  await expect(page.locator('[data-craft-runeword]')).toHaveCount(0);
  saved = (await savedProfile(page)).hero; assert.equal(saved.cube[0].catalogId, stealth.catalogId); assert.deepEqual(saved.runes, []);
  await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  saved = (await savedProfile(page)).hero;
  assert.equal(saved.inventory[0].catalogId, spirit.catalogId); assert.equal(saved.stash[0].catalogId, spirit.catalogId); assert.equal(saved.cube[0].catalogId, stealth.catalogId);
  assert.deepEqual(errors, []);
  console.log('Equipment recipe previews, one-click crafting, missing materials, save rollback, stash/cube, touch and reload passed.');
} finally { await browser.close(); }
