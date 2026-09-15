import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { savedProfile } from './browser-helpers.mjs';

const output = process.env.OUTPUT_DIR || '.verification/cube';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.cubeGame = game;') });
  });
  const hero = newHero(); hero.campaign.cleared = [6, 0, 0];
  const ring = id => makeItem(BASES.find(base => base.baseCode === 'rin'), id);
  hero.inventory = [{ ...ring('charm'), charm: true, mods: { life: 50, strength: 20, allSkills: 1 }, identified: true }, ring('exchange')]; placeItems(hero.inventory);
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('cube-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('cube-fixture', '1'); }
  }, serializeSave(hero));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => { const g = window.cubeGame; cancelAnimationFrame(g.frameId); g.ui.openPanel('inventory'); });
  await expect(page.locator('[data-container="cube"]')).toHaveCount(0);
  await page.evaluate(async () => { const g = window.cubeGame; g.ui.closePanel(); if (!await g.flushSave()) throw new Error('Fixture save failed'); g.enterLevel(6, 0); });
  await page.waitForFunction(() => !window.cubeGame.inCamp && window.cubeGame.level.index === 6);
  await page.evaluate(() => {
    const g = window.cubeGame;
    const p = g.world.layout.objects[0]; g.position.set(p.x, 0, p.z); g.body.position.set(p.x, .5, p.z);
    g.world.chests.forEach(chest => { chest.opened = true; });
    g.enemies.forEach(e => { if (!e.boss) e.dead = true; });
    if (g.contextAction()?.kind !== 'objective') throw new Error('Cube objective fixture must interact with the quest chest');
    g.interact(); g.ui.openPanel('inventory');
  });
  assert.equal((await savedProfile(page)).hero.cubeUnlocked, true);
  assert.equal((await savedProfile(page)).hero.bossDefeated, false);
  await expect(page.locator('[data-container="inventory"]')).toBeVisible();
  await expect(page.locator('[data-container="cube"]')).toBeVisible();
  await expect(page.locator('[data-bag-view="cube"]')).toHaveCount(0);
  await expect(page.locator('.cube-storage-note')).toContainText('护符不生效');
  const heroStats = () => page.evaluate(async () => (await import('/src/model.ts')).stats(window.cubeGame.hero));
  const baseline = await heroStats();
  async function drag(id, container, x, y, touch = false) {
    const source = page.locator(`.bag-item[data-item="${id}"]`), target = page.locator(`[data-container="${container}"]`);
    await source.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
    const a = await source.boundingBox(), b = await target.boundingBox(), cols = Number(await target.getAttribute('data-columns'));
    const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, to = { x: b.x + (x + .5) * b.width / cols, y: b.y + (y + .5) * b.height / 4 };
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
      for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
    }
  }
  await drag('charm', 'cube', 0, 0);
  let saved = (await savedProfile(page)).hero;
  assert.equal(saved.cube[0].id, 'charm'); assert.equal((await heroStats()).maxHp, baseline.maxHp - 50);
  await drag('exchange', 'cube', 0, 0);
  saved = (await savedProfile(page)).hero;
  assert.equal(saved.cube[0].id, 'exchange'); assert.equal(saved.inventory[0].id, 'charm');
  assert.equal((await heroStats()).maxHp, baseline.maxHp);
  await drag('exchange', 'inventory', 5, 2);
  await page.locator('[data-item="charm"]').click();
  await page.locator('[data-cube-store="charm"]').click();
  await expect(page.locator('.learn-reason')).toContainText('方块中的护符不生效');
  await page.locator('[data-cube-withdraw="charm"]').click();
  await page.screenshot({ path: `${output}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('button[data-inventory-pane="items"]').click();
  await expect(page.locator('[data-container="inventory"]')).toBeVisible();
  await expect(page.locator('[data-container="cube"]')).toBeVisible();
  await drag('charm', 'cube', 2, 3, true);
  saved = (await savedProfile(page)).hero; assert.equal(saved.cube[0].id, 'charm'); assert.equal(saved.cube[0].x, 2); assert.equal(saved.cube[0].y, 3);
  assert.equal((await heroStats()).maxHp, baseline.maxHp - 50);
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.evaluate(() => { const g = window.cubeGame; cancelAnimationFrame(g.frameId); g.ui.openPanel('inventory'); });
  await expect(page.locator('[data-container="cube"] [data-item="charm"]')).toBeVisible();
  assert.equal((await heroStats()).maxHp, baseline.maxHp - 50);
  assert.deepEqual(errors, []);
  console.log('Quest unlock, same-page cube, desktop/touch transfers and swaps, buttons, charm bonuses and save reload passed.');
} finally { await browser.close(); }
