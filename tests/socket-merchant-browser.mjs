import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { socketMerchantPrice } from '../src/socket-merchant.ts';
import { savedProfile } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
async function open(hero, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 960 }, hasTouch: width < 700 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.socketVerification = game;') });
  });
  await page.addInitScript(hero => {
    if (sessionStorage.getItem('socket-fixture')) return;
    localStorage.setItem('eclipse-ii-profile-v2:socket-test', JSON.stringify({ version: 2, id: 'socket-test', name: '打孔测试', createdAt: 1, updatedAt: 1, revision: 1, hero }));
    sessionStorage.setItem('socket-fixture', '1');
  }, hero);
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}?mode=local`);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  return page;
}
try {
  const locked = newHero(); locked.campaign.cleared[0] = 24;
  const page = await open(locked, 1440);
  await expect(page.locator('[data-action="socket-merchant"]')).toHaveCount(0);
  assert.equal(await page.evaluate(() => !!window.socketVerification.socketVendor), false);
  await page.evaluate(() => window.socketVerification.useSocketMerchant());
  await expect(page.locator('.panel-socket-shop')).toHaveCount(0); await page.close();
  for (const width of [1440, 390]) {
    const hero = newHero(); hero.campaign.cleared[0] = 25; hero.gold = 100000;
    const item = { ...makeItem(BASES.find(base => base.baseCode === 'crs'), 'socket-sword'), level: 26 };
    const second = { ...item, id: 'second-sword' };
    hero.inventory = [item, second]; placeItems(hero.inventory);
    const page = await open(hero, width);
    assert.equal(await page.evaluate(() => !!window.socketVerification.socketVendor), true);
    const objective = await page.evaluate(() => window.eclipseState.objectives.find(p => p.kind === 'socket-merchant'));
    assert.ok(objective.route.length, 'Merchant is reachable');
    await page.evaluate(() => window.socketVerification.ui.openPanel('socket-shop'));
    await expect(page.locator('.panel-socket-shop')).toHaveCount(0);
    const label = page.getByRole('button', { name: '打孔商人', exact: true });
    if (width < 700) await label.tap(); else await label.click();
    await expect(page.locator('.panel-socket-shop')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.panel-socket-shop')).toContainText('打孔结果：4 孔');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await expect(page.locator('.panel-socket-shop')).toBeVisible();
    assert.equal(await page.locator('.panel-body').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Panel fits viewport');
    await page.locator('[data-buy-socket="socket-sword"]').click();
    await expect(page.locator('[data-buy-socket="socket-sword"]')).toBeDisabled();
    await page.waitForFunction(() => !window.socketVerification.onlineOperation);
    let saved = (await savedProfile(page)).hero;
    assert.equal(saved.inventory[0].sockets, 4); assert.equal(saved.gold, hero.gold - socketMerchantPrice(hero, item));
    // Force a save failure: neither the charge nor socket result may survive.
    await page.evaluate(() => {
      window.socketOriginalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === 'shared') throw new DOMException('Full', 'QuotaExceededError'); return window.socketOriginalPut.apply(this, args); };
    });
    await page.locator('[data-buy-socket="second-sword"]').click();
    await page.waitForFunction(() => !window.socketVerification.onlineOperation);
    assert.deepEqual(await page.evaluate(() => ({ sockets: window.socketVerification.hero.inventory[1].sockets, gold: window.socketVerification.hero.gold })), { sockets: 0, gold: saved.gold });
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.socketOriginalPut; });
    await page.locator('[data-buy-socket="second-sword"]').click();
    await page.waitForFunction(() => !window.socketVerification.onlineOperation);
    saved = (await savedProfile(page)).hero;
    assert.equal(saved.inventory[1].sockets, 4);
    assert.equal(saved.gold, hero.gold - socketMerchantPrice(hero, item) * 2);
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.inCamp);
    assert.equal((await savedProfile(page)).hero.inventory[0].sockets, 4);
    await page.close();
    console.log(`Socket merchant ${width}px: unlock, navigation, payment, repeat service, rollback and reload passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
