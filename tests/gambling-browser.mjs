import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero } from '../src/model.ts';
import { mkdir } from 'node:fs/promises';
import { savedProfile } from './browser-helpers.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
if (process.env.OUTPUT_DIR) await mkdir(process.env.OUTPUT_DIR, { recursive: true });
async function open(hero, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 960 }, hasTouch: width < 700 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.gamblingVerification = game;') });
  });
  await page.addInitScript(hero => {
    if (sessionStorage.getItem('gambling-fixture')) return;
    localStorage.setItem('eclipse-ii-profile-v2:gambling-test', JSON.stringify({ version: 2, id: 'gambling-test', name: '赌博测试', createdAt: 1, updatedAt: 1, revision: 1, hero }));
    sessionStorage.setItem('gambling-fixture', '1');
  }, hero);
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}?mode=local`);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  return page;
}
try {
  const locked = newHero(); locked.campaign.cleared[0] = 24;
  const page = await open(locked, 1440);
  await expect(page.locator('[data-action="gambling-merchant"]')).toHaveCount(0);
  assert.equal(await page.evaluate(() => !!window.gamblingVerification.gamblingVendor), false);
  await page.evaluate(() => window.gamblingVerification.useGamblingMerchant());
  await expect(page.locator('.panel-gambling-shop')).toHaveCount(0); await page.close();
  for (const width of [1440, 390]) {
    const hero = newHero(); hero.campaign.cleared[0] = 25;
    hero.level = 80; hero.gold = 300000;
    const page = await open(hero, width);
    assert.equal(await page.evaluate(() => !!window.gamblingVerification.gamblingVendor), true);
    assert.deepEqual(await page.evaluate(() => {
      const game = window.gamblingVerification, position = game.position.clone();
      const actions = [game.socketVendor, game.gamblingVendor].map(vendor => {
        game.position.copy(vendor.group.position); return game.contextAction()?.kind;
      });
      game.position.copy(position); return actions;
    }), ['socket-shop', 'gambling-shop'], 'F chooses the closer merchant');
    const objective = await page.evaluate(() => window.eclipseState.objectives.find(p => p.kind === 'gambling-merchant'));
    assert.ok(objective.route.length, 'Merchant is reachable');
    await page.evaluate(() => window.gamblingVerification.ui.openPanel('gambling-shop'));
    await expect(page.locator('.panel-gambling-shop')).toHaveCount(0);
    const label = page.getByRole('button', { name: '赌博商人', exact: true });
    if (width < 700) await label.tap(); else await label.click();
    await expect(page.locator('.panel-gambling-shop')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.panel-gambling-shop')).toContainText('安雅');
    await expect(page.locator('[data-buy-gamble]')).toHaveCount(14);
    const stock = await page.evaluate(() => [...window.gamblingVerification.gambleStock]);
    await page.getByRole('button', { name: '免费刷新货单' }).click();
    assert.notDeepEqual(await page.evaluate(() => window.gamblingVerification.gambleStock), stock);
    assert.equal(await page.evaluate(() => window.gamblingVerification.hero.gold), hero.gold);
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await expect(page.locator('.panel-gambling-shop')).toBeVisible();
    assert.equal(await page.locator('.panel-body').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'Panel fits viewport');
    if (process.env.OUTPUT_DIR) await page.screenshot({ path: `${process.env.OUTPUT_DIR}/gambling-${width}.png` });
    await page.locator('[data-buy-gamble="rin"]').click();
    await page.waitForFunction(() => !window.gamblingVerification.onlineOperation);
    let saved = (await savedProfile(page)).hero;
    assert.equal(saved.inventory.length, 1); assert.equal(saved.inventory[0].identified, true);
    assert.equal(saved.gold, hero.gold - 50000);
    // Force a save failure: neither the charge nor rolled item may survive.
    await page.evaluate(() => {
      window.gamblingOriginalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === 'shared') throw new DOMException('Full', 'QuotaExceededError'); return window.gamblingOriginalPut.apply(this, args); };
    });
    await page.locator('[data-buy-gamble="rin"]').click();
    await page.waitForFunction(() => !window.gamblingVerification.onlineOperation);
    assert.deepEqual(await page.evaluate(() => ({ count: window.gamblingVerification.hero.inventory.length, gold: window.gamblingVerification.hero.gold })), { count: 1, gold: saved.gold });
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.gamblingOriginalPut; });
    await page.locator('[data-buy-gamble="rin"]').click();
    await page.waitForFunction(() => !window.gamblingVerification.onlineOperation);
    saved = (await savedProfile(page)).hero;
    assert.equal(saved.inventory.length, 2); assert.equal(saved.inventory[1].identified, true);
    assert.notEqual(saved.inventory[0].id, saved.inventory[1].id);
    assert.equal(saved.gold, hero.gold - 100000);
    await page.evaluate(() => { window.gamblingVerification.hero.gold = 0; window.gamblingVerification.ui.renderPanel(); });
    await expect(page.locator('[data-buy-gamble="rin"]')).toBeDisabled();
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.eclipseState?.inCamp);
    assert.equal((await savedProfile(page)).hero.inventory.length, 2);
    await page.close();
    console.log(`Gambling merchant ${width}px: unlock, navigation, payment, repeat service, rollback and reload passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
