import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero } from '../src/model.ts';
import { BASES, makeItem, specialItem, placeItems } from '../src/items.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-data.ts';
import { PROFILE_PREFIX } from '../src/saves.ts';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.OUTPUT_DIR || '.verification/shared-stash-browser'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
const hero = newHero(); hero.level = 90; hero.gold = 1000;
const item = specialItem(CATALOG_SPECIALS.find(entry => entry.key === 'Skin of the Vipermagi').id, () => 0); item.id = 'shared-random';
const thrown = makeItem(BASES.find(base => base.baseCode === 'jav'), 'shared-throw'); thrown.quantity = 0;
hero.inventory = [item]; hero.stash = [thrown]; placeItems(hero.inventory); placeItems(hero.stash, 10);
const state = page => page.evaluate(() => window.eclipseState);
async function records(page) {
  return page.evaluate(async () => {
    const { refreshSharedStorage } = await import('/src/shared-storage.ts'); await refreshSharedStorage();
    const { SaveStore } = await import('/src/saves.ts'); const store = new SaveStore(localStorage);
    return { profiles: store.list(), shared: store.readShared() };
  });
}
async function seed(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ hero, second, prefix }) => {
    if (localStorage.getItem('shared-fixture')) return;
    for (const [id, name, character] of [['first', '第一位', hero], ['second', '第二位', second]]) localStorage.setItem(prefix + id, JSON.stringify({ version: 2, id, name, createdAt: 1, updatedAt: 1, revision: 1, hero: character }));
    localStorage.setItem('shared-fixture', '1');
  }, { hero, second: newHero(), prefix: PROFILE_PREFIX });
  await page.goto(base);
}
async function enter(page, id) {
  await page.locator(`[data-profile-id="${id}"]`).click();
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(id => window.eclipseState?.profileId === id && window.eclipseState.inCamp && !window.eclipseState.paused, id);
}
async function open(page) {
  await page.locator('.camp-portal-label[data-action="shared-stash"]').click();
  await page.getByRole('dialog', { name: '本地共享仓库', exact: true }).waitFor();
  assert.equal((await state(page)).inCamp, true);
}
async function transfer(page, side, id, destination) {
  await page.locator(`[data-shared-side="${side}"][data-shared-item="${id}"]`).click();
  await page.locator(`[data-shared-transfer="${destination}"]`).click();
  await page.waitForFunction(() => !document.querySelector('[data-shared-transfer]') || !!document.querySelector('.shared-error'));
  await expect(page.locator('.shared-error')).toHaveCount(0);
}
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 700 }); const page = await context.newPage(); await seed(page); await enter(page, 'first');
    const geometry = await page.evaluate(async () => {
      const { GameWorld } = await import('/src/world.ts'), { CAMP } = await import('/src/camp.ts'), THREE = await import('/node_modules/three/build/three.module.js');
      const world = new GameWorld(undefined, true), route = world.path(new THREE.Vector3(CAMP.spawn.x, 0, CAMP.spawn.z), CAMP.stash);
      const result = { children: world.sharedStash.children.length, route: route.length, distance: route.length ? Math.hypot(route.at(-1).x - CAMP.stash.x, route.at(-1).z - CAMP.stash.z) : 99 };
      world.dispose(); return result;
    });
    assert.ok(geometry.children >= 6 && geometry.route > 0 && geometry.distance < 3.5);
    const colors = await page.locator('#game-canvas').evaluate(canvas => {
      const copy = document.createElement('canvas'); copy.width = copy.height = 80; const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0, 80, 80);
      const pixels = ctx.getImageData(0, 0, 80, 80).data, colors = new Set(); for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i] >> 3},${pixels[i+1] >> 3},${pixels[i+2] >> 3}`); return colors.size;
    }); assert.ok(colors > 100);
    await page.screenshot({ path: `${output}/camp-${viewport.width}.png` });
    await open(page); await transfer(page, 'personal', 'shared-random', 'inventory');
    await page.locator('[data-shared-view="stash"]').click(); await transfer(page, 'personal', 'shared-throw', 'stash');
    let saved = await records(page); assert.equal(saved.shared.items.length, 2); assert.equal(saved.profiles.find(profile => profile.id === 'first').hero.inventory.length, 0);
    assert.deepEqual(saved.shared.items.find(value => value.id === item.id).mods, item.mods); assert.equal(saved.shared.items.find(value => value.id === thrown.id).quantity, 0);
    await page.locator(`[data-shared-side="shared"][data-shared-item="${item.id}"]`).click();
    await page.screenshot({ path: `${output}/shared-${viewport.width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '保存并切换角色', exact: true }).click();
    await enter(page, 'second'); await open(page);
    await transfer(page, 'shared', 'shared-random', 'inventory'); await transfer(page, 'shared', 'shared-throw', 'stash');
    saved = await records(page); const recipient = saved.profiles.find(profile => profile.id === 'second');
    assert.equal(saved.shared.items.length, 0); assert.equal(recipient.hero.inventory[0].identified, false); assert.deepEqual(recipient.hero.inventory[0].catalogRolls, item.catalogRolls); assert.equal(recipient.hero.stash[0].quantity, 0);
    await page.reload(); await enter(page, 'second'); await open(page);
    await expect(page.locator('[data-shared-side="personal"][data-shared-item="shared-random"]')).toHaveCount(1);
    await page.locator('[data-shared-view="stash"]').click(); await expect(page.locator('[data-shared-side="personal"][data-shared-item="shared-throw"]')).toHaveCount(1);
    await page.screenshot({ path: `${output}/received-${viewport.width}.png` });
    // A real quota failure must retain the source and leave shared storage unchanged.
    await page.evaluate(() => { window.originalSharedWrite = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'shared') throw new DOMException('Full', 'QuotaExceededError'); return window.originalSharedWrite.call(this, value, key); }; });
    await page.locator('[data-shared-item="shared-throw"]').click(); await page.locator('[data-shared-transfer="stash"]').click();
    await expect(page.locator('.shared-error')).toBeVisible(); saved = await records(page); assert.equal(saved.shared.items.length, 0); assert.equal(saved.profiles.find(profile => profile.id === 'second').hero.stash.length, 1);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalSharedWrite; });
    await transfer(page, 'personal', 'shared-throw', 'stash');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '保存并切换角色', exact: true }).click();
    if (viewport.width === 1440) {
      const other = await context.newPage(); await seed(other);
      const contest = async (target, id) => target.evaluate(async ({ id }) => {
        const { SaveStore } = await import('/src/saves.ts'); const store = new SaveStore(localStorage), profile = store.read(id);
        try { await store.transferShared(id, profile.hero, profile.revision, 5, { direction: 'withdraw', container: 'inventory', itemId: 'shared-throw' }); return true; } catch { return false; }
      }, { id });
      const won = await Promise.all([contest(page, 'first'), contest(other, 'second')]); assert.equal(won.filter(Boolean).length, 1);
      saved = await records(page); assert.equal(saved.shared.items.length, 0); assert.equal(saved.profiles.flatMap(profile => profile.hero.inventory).filter(value => value.id === 'shared-throw').length, 1);
      const ownerId = saved.profiles.find(profile => profile.hero.inventory.some(value => value.id === 'shared-throw')).id;
      await enter(page, 'first'); await open(page); await enter(other, 'second'); await open(other);
      const ownerPage = ownerId === 'first' ? page : other, observer = ownerId === 'first' ? other : page;
      await ownerPage.evaluate(() => {
        window.originalMirrorWrite = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) { if (key === 'eclipse-ii-shared-stash-v1') throw new DOMException('Full', 'QuotaExceededError'); return window.originalMirrorWrite.call(this, key, value); };
      });
      await transfer(ownerPage, 'personal', 'shared-throw', 'inventory');
      await expect(observer.locator('[data-shared-side="shared"][data-shared-item="shared-throw"]')).toHaveCount(1);
      await ownerPage.evaluate(() => { Storage.prototype.setItem = window.originalMirrorWrite; });
      await transfer(observer, 'shared', 'shared-throw', 'inventory');
      saved = await records(observer); assert.equal(saved.shared.items.length, 0); assert.equal(saved.profiles.flatMap(profile => profile.hero.inventory).filter(value => value.id === 'shared-throw').length, 1);
      await other.close();
    }
    await context.close(); console.log(`Camp chest, four transfer routes, cross-character reload, rolled items, quota protection and layout passed at ${viewport.width}px`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${index}.png` }).catch(() => {});
  console.log(errors); throw error;
} finally { await browser.close(); }
