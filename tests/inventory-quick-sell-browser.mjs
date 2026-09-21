import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { savedProfile } from './browser-helpers.mjs';

const hero = newHero();
hero.gold = 1000; hero.campaign.cleared[0] = 25;
const ring = BASES.find(base => base.baseCode === 'rin');
hero.inventory = ['sell', 'keep', 'gamble'].map((id, x) => ({ ...makeItem(ring, id), x, y: 0 }));
hero.stash = [{ ...makeItem(ring, 'stash'), x: 0, y: 0 }];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.quickSellGame = game;') });
  });
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}?mode=local`);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.quickSellGame?.profile && !window.quickSellGame.paused);
  await page.evaluate(() => cancelAnimationFrame(window.quickSellGame.frameId));
  await page.keyboard.press('i');
  const item = id => page.locator(`#overlay [data-item="${id}"]`);
  const quickSell = id => item(id).click({ button: 'right', modifiers: ['Control'] });
  const state = () => page.evaluate(() => structuredClone(window.quickSellGame.hero));
  const before = await state();
  await item('sell').click({ button: 'right' });
  await item('sell').click({ modifiers: ['Control'] });
  assert.deepEqual(await state(), before, 'right click and Ctrl + left click do not sell');
  for (const flag of ['saveConflict', 'onlineOperation']) {
    await page.evaluate(flag => { window.quickSellGame[flag] = true; }, flag);
    await quickSell('sell');
    assert.deepEqual(await state(), before, `${flag} prevents selling`);
    await page.evaluate(flag => { window.quickSellGame[flag] = false; }, flag);
  }
  await item('sell').focus();
  await page.keyboard.press('Space');
  await item('sell').dispatchEvent('contextmenu', { ctrlKey: true, button: 2 });
  assert.deepEqual(await state(), before, 'active drag prevents selling');
  await page.evaluate(() => window.quickSellGame.ui.characterScreen.inventoryDrag.cancel());
  await quickSell('sell');
  await expect(item('sell')).toHaveCount(0);
  assert.equal((await state()).gold, before.gold + hero.inventory[0].value);
  assert.deepEqual((await savedProfile(page)).hero.inventory.map(item => item.id), ['keep', 'gamble']);
  await page.locator('[data-bag-view="stash"]').click();
  const afterSale = await state();
  await quickSell('stash');
  await page.locator('.gear-weapon [data-item]').click({ button: 'right', modifiers: ['Control'] });
  assert.deepEqual(await state(), afterSale, 'stash and equipped items cannot be quick sold');
  await page.evaluate(async () => {
    const g = window.quickSellGame, { CAMP } = await import('/src/camp.ts');
    g.position.set(CAMP.gamblingMerchant.x, 0, CAMP.gamblingMerchant.z);
    g.ui.openPanel('gambling-shop');
  });
  await quickSell('gamble');
  await expect(item('gamble')).toHaveCount(0);
  await expect(page.locator('.panel-gambling-shop')).toBeVisible();
  assert.equal((await savedProfile(page)).hero.gold, before.gold + hero.inventory[0].value + hero.inventory[2].value);
  await expect(item('keep')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: Ctrl + right click sells and persists backpack items in inventory and gambling; other clicks, storage, equipment, drag and save guards stay safe');
} finally { await browser.close(); }
