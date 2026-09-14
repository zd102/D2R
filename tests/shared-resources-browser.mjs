import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero } from '../src/model.ts';
import { PROFILE_PREFIX } from '../src/save-format.ts';

const url = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173'); url.searchParams.set('mode', 'local');
const output = process.env.OUTPUT_DIR || '.verification/shared-resources-browser'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
async function enter(page, id) {
  await page.locator(`[data-profile-id="${id}"]`).click();
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(id => window.eclipseState?.profileId === id && !window.eclipseState.paused, id);
}
async function leave(page) {
  await page.evaluate(() => window.resourceGame.ui.openPanel('pause'));
  await page.getByRole('button', { name: '保存并切换角色', exact: true }).click();
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
}
const inventory = page => page.evaluate(() => ({ gold: window.resourceGame.hero.gold, runes: window.resourceGame.hero.runes }));
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.resourceGame = game;') });
    });
    const first = newHero(), second = newHero(); first.gold = 250; second.gold = 500; first.runes = ['el', 'el']; second.runes = ['el', 'tir'];
    await page.addInitScript(({ first, second, prefix }) => {
      if (localStorage.getItem('resource-fixture')) return;
      for (const [id, hero] of [['first', first], ['second', second]]) localStorage.setItem(prefix + id, JSON.stringify({ version: 2, id, name: id, createdAt: 1, updatedAt: 1, revision: 1, hero }));
      localStorage.setItem('resource-fixture', '1');
    }, { first, second, prefix: PROFILE_PREFIX });
    await page.goto(url.href); await enter(page, 'first');
    assert.deepEqual(await inventory(page), { gold: 750, runes: ['el', 'el', 'el', 'tir'] });
    await page.evaluate(async () => { const g = window.resourceGame; g.buy(0); if (!await g.flushSave()) throw new Error('purchase save failed'); g.ui.openPanel('inventory'); });
    await page.locator('[data-bag-view="runes"]').click();
    await expect(page.locator('.inventory-footer-hint')).toContainText('本地所有角色共享金币和符文');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('[data-upgrade-rune="el"]').click();
    await page.evaluate(async () => { if (!await window.resourceGame.flushSave()) throw new Error('rune save failed'); });
    const spent = await inventory(page); assert.ok(spent.gold < 750); assert.deepEqual(spent.runes, ['tir', 'eld']);
    await page.screenshot({ path: `${output}/shared-${width}.png` });
    await leave(page); await enter(page, 'second'); assert.deepEqual(await inventory(page), spent);
    await page.reload(); await enter(page, 'first'); assert.deepEqual(await inventory(page), spent); await leave(page);
    // Two actual browser documents compete for the same remaining resources.
    const other = await context.newPage(); await other.goto(url.href);
    await other.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
    for (const [target, id] of [[page, 'first'], [other, 'second']]) await target.evaluate(async id => {
      const { SaveStore } = await import('/src/saves.ts'); const { refreshSharedStorage } = await import('/src/shared-storage.ts'); await refreshSharedStorage();
      window.resourceStore = new SaveStore(localStorage); window.resourceSnapshot = window.resourceStore.read(id);
    }, id);
    const results = await Promise.all([page, other].map(target => target.evaluate(async () => {
      const p = window.resourceSnapshot;
      try { await window.resourceStore.saveAtomic(p.id, { ...p.hero, gold: p.hero.gold - 10, runes: ['eld'] }, p.revision, p.resourcesRevision); return true; } catch { return false; }
    })));
    assert.equal(results.filter(Boolean).length, 1);
    await page.reload(); await enter(page, 'second');
    assert.deepEqual(await inventory(page), { gold: spent.gold - 10, runes: ['eld'] });
    await other.evaluate(async () => {
      const { refreshSharedStorage } = await import('/src/shared-storage.ts'); await refreshSharedStorage();
      const p = window.resourceStore.read('first');
      await window.resourceStore.saveAtomic(p.id, { ...p.hero, gold: p.hero.gold - 1 }, p.revision, p.resourcesRevision);
    });
    await page.waitForFunction(gold => window.eclipseState.gold === gold, spent.gold - 11);
    assert.equal(await page.evaluate(() => window.resourceGame.saveConflict), false);
    await other.close(); await context.close();
    console.log(`Shared gold purchases, rune crafting, switching, reload and concurrent spending passed at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
