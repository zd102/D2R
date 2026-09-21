import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { savedProfile } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = process.env.OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
const errors = [];
async function settle(page) { await page.waitForFunction(() => !window.gamblingBagGame.onlineSaveBusy); }
async function openShop(page) {
  await page.evaluate(async () => {
    const game = window.gamblingBagGame, { CAMP } = await import('/src/camp.ts');
    cancelAnimationFrame(game.frameId);
    game.position.set(CAMP.gamblingMerchant.x, 0, CAMP.gamblingMerchant.z);
    game.ui.openPanel('gambling-shop');
  });
  await expect(page.locator('.panel-gambling-shop')).toBeVisible();
}
async function failSave(page, fail) {
  await page.evaluate(fail => {
    if (fail) {
      window.gamblingBagPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'shared') throw new DOMException('Full', 'QuotaExceededError');
        return window.gamblingBagPut.apply(this, args);
      };
    } else IDBObjectStore.prototype.put = window.gamblingBagPut;
  }, fail);
}
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 800 }, { width: 844, height: 390 }]) {
    const mobile = viewport.width < 900;
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.gamblingBagGame = game;') });
    });
    const hero = newHero(); hero.campaign.cleared[0] = 25; hero.gold = 500000;
    const ring = BASES.find(base => base.baseCode === 'rin');
    hero.inventory = ['sell-ring', 'store-ring', 'move-ring'].map((id, x) => ({ ...makeItem(ring, id), x, y: 0 }));
    await page.addInitScript(save => {
      if (sessionStorage.getItem('gambling-bag-fixture')) return;
      localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('gambling-bag-fixture', '1');
    }, serializeSave(hero));
    await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}?mode=local`);
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.gamblingBagGame?.profile && !window.gamblingBagGame.paused);
    await openShop(page);
    await expect(page.locator('.gambling-inventory .bag-item')).toHaveCount(3);
    if (output) await page.screenshot({ path: `${output}/gambling-compact-${viewport.width}.png` });
    assert.equal(await page.locator('[data-buy-gamble]').evaluateAll(buttons => buttons.length === 14 && buttons.every(button => {
      const r = button.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })), true, 'all 14 gambling purchase buttons fit onscreen without scrolling');
    await expect(page.locator('.shop-items .gambling-base-tier')).toHaveText(Array(14).fill('底材 · 普通'));
    const choose = async id => { const item = page.locator(`[data-item="${id}"]`); if (mobile) await item.tap(); else await item.click(); };
    await choose('sell-ring');
    await expect(page.locator('.gambling-inventory .item-details h3')).toHaveText(hero.inventory[0].name);
    assert.equal(await page.locator('.panel-body').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.locator('.shop-items').evaluate(el => getComputedStyle(el).display), 'grid');

    for (const [action, id] of [['sell', 'sell-ring'], ['store', 'store-ring']]) {
      await choose(id); await failSave(page, true);
      const before = await page.evaluate(() => structuredClone(window.gamblingBagGame.hero));
      await page.locator(`[data-gambling-${action}="${id}"]`).click(); await settle(page);
      assert.deepEqual(await page.evaluate(() => structuredClone(window.gamblingBagGame.hero)), before, `${action} rolls back on save failure`);
      await expect(page.locator(`[data-item="${id}"]`)).toBeVisible();
      await failSave(page, false);
      await page.locator(`[data-gambling-${action}="${id}"]`).click(); await settle(page);
      await expect(page.locator(`[data-item="${id}"]`)).toHaveCount(0);
      await expect(page.locator('.panel-gambling-shop')).toBeVisible();
    }
    const saved = (await savedProfile(page)).hero;
    assert.equal(saved.gold, hero.gold + hero.inventory[0].value);
    assert.equal(saved.stash[0].id, 'store-ring');

    const source = page.locator('[data-item="move-ring"]');
    await source.scrollIntoViewIfNeeded();
    const rect = await source.boundingBox();
    const grid = await page.locator('.gambling-inventory .diablo-grid').evaluate(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, cell: el.clientWidth / 10, row: el.clientHeight / 4 };
    });
    const target = { x: grid.x + 7.5 * grid.cell, y: grid.y + 1.5 * grid.row };
    if (mobile) {
      const touch = await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 }] });
      await expect(page.locator('.item-drag-ghost')).toBeVisible();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...target, id: 1 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 6 }); await page.mouse.up();
    }
    await settle(page);
    let moved = (await savedProfile(page)).hero.inventory.find(item => item.id === 'move-ring');
    assert.deepEqual([moved.x, moved.y], [7, 1], 'pointer drag persists coordinates');
    await failSave(page, true);
    await source.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter'); await settle(page);
    assert.deepEqual(await page.evaluate(() => { const item = window.gamblingBagGame.hero.inventory.find(item => item.id === 'move-ring'); return [item.x, item.y]; }), [7, 1], 'failed drag save restores coordinates');
    await failSave(page, false);
    await source.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter'); await settle(page);
    moved = (await savedProfile(page)).hero.inventory.find(item => item.id === 'move-ring');
    assert.deepEqual([moved.x, moved.y], [6, 1], 'keyboard move persists coordinates');
    await page.locator('[data-buy-gamble="rin"]').click(); await settle(page);
    await expect(page.locator('.gambling-inventory .bag-item')).toHaveCount(2);
    if (output) await page.screenshot({ path: `${output}/gambling-bag-${viewport.width}.png` });
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.gamblingBagGame?.profile);
    await openShop(page);
    const reloaded = (await savedProfile(page)).hero;
    assert.equal(reloaded.stash[0].id, 'store-ring');
    assert.equal(reloaded.inventory.length, 2);
    assert.ok(!reloaded.inventory.some(item => item.id === 'sell-ring'));
    assert.deepEqual([reloaded.inventory[0].x, reloaded.inventory[0].y], [6, 1]);
    await page.close();
    console.log(`Gambling inventory ${viewport.width}: selection, sale, storage, pointer/keyboard moves, rollback, purchase and reload passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
