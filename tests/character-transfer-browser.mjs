import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { newHero } from '../src/model.ts';
import { CHARACTER_FILE_FORMAT, CHARACTER_FILE_LIMIT, PROFILE_PREFIX } from '../src/saves.ts';

const output = '.verification/character-transfer';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const page = await context.newPage();
const seed = { version: 2, id: 'transfer-source', name: '远征者', createdAt: 1000, updatedAt: 2000, revision: 3, hero: newHero() };
seed.hero.level = 12; seed.hero.gold = 87654; seed.hero.kills = 321;
seed.hero.inventory = [{ ...seed.hero.equipment.weapon, id: 'transfer-bag', x: 0, y: 0 }];
seed.hero.stash = [{ ...seed.hero.equipment.shield, id: 'transfer-stash', x: 0, y: 0 }];
seed.hero.runes = ['el', 'tir'];
const content = JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 1, profile: seed });
const roster = target => target.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
const records = target => target.evaluate(prefix => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => [key, localStorage.getItem(key)])), PROFILE_PREFIX);
const choose = (target, raw = content, name = 'character.json') => target.locator('#profile-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw) });
async function openImport(target) {
  const picker = target.waitForEvent('filechooser');
  await target.getByRole('button', { name: '导入角色存档', exact: true }).click();
  await picker;
  await target.getByRole('dialog', { name: '导入角色', exact: true }).waitFor();
}
async function preview(target, raw = content) {
  await choose(target, raw);
  await target.getByRole('textbox', { name: '角色名称', exact: true }).waitFor();
}
async function checkView(target, viewport) {
  const rect = await target.getByRole('dialog').boundingBox();
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, 'Dialog fits viewport');
  assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
  assert.equal(await target.locator('.profile-screen i[data-lucide]').count(), 0, 'All profile icons are registered and rendered');
  assert.ok(await target.evaluate(() => {
    const canvas = document.querySelector('#game-canvas'), gl = canvas.getContext('webgl2');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4096) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size > 20;
  }), 'Rendered game scene is nonblank');
}
try {
  await page.goto(base); await roster(page);
  assert.equal(await page.getByRole('button', { name: '导出角色存档' }).count(), 0);
  await openImport(page); await preview(page);
  assert.deepEqual(await records(page), {}, 'Preview performs no writes');
  await page.getByRole('button', { name: '返回角色选择', exact: true }).click(); await roster(page);
  assert.deepEqual(await records(page), {}, 'Cancel performs no writes');
  await openImport(page); await preview(page);
  await page.getByRole('button', { name: '导入为新角色', exact: true }).click(); await roster(page);
  const first = Object.values(await records(page)).map(JSON.parse)[0];
  assert.notEqual(first.id, seed.id); assert.deepEqual(first.hero, seed.hero); assert.equal(first.revision, 1);
  assert.equal(await page.getByRole('option', { name: seed.name, exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal((await page.evaluate(() => window.eclipseState)).profileId, null);
  const before = await records(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出角色存档', exact: true }).click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /^eclipse-ii-.*\.json$/);
  const exported = await readFile(await download.path(), 'utf8');
  assert.deepEqual(JSON.parse(exported).profile, first); assert.deepEqual(await records(page), before);
  await page.screenshot({ path: `${output}/desktop-roster.png` });
  await checkView(page, { width: 1440, height: 960 });

  await openImport(page); await preview(page, exported);
  await page.getByRole('button', { name: '导入为新角色', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '同名角色' }).waitFor();
  assert.deepEqual(await records(page), before);
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('远征副本');
  await page.getByRole('button', { name: '导入为新角色', exact: true }).click(); await roster(page);
  const copied = await records(page); assert.equal(Object.keys(copied).length, 2);
  assert.equal(copied[PROFILE_PREFIX + first.id], before[PROFILE_PREFIX + first.id]);
  await page.reload(); await roster(page); assert.deepEqual(await records(page), copied);

  await openImport(page); await choose(page, '{broken');
  await page.getByRole('alert').filter({ hasText: 'JSON' }).waitFor();
  await choose(page, JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 99 }));
  await page.getByRole('alert').filter({ hasText: '版本' }).waitFor();
  await choose(page, 'x'.repeat(CHARACTER_FILE_LIMIT + 1));
  await page.getByRole('alert').filter({ hasText: '2 MB' }).waitFor();
  assert.deepEqual(await records(page), copied);
  await preview(page, exported);
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('存储失败重试');
  await page.evaluate(prefix => {
    window.originalTransferSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith(prefix)) throw new DOMException('Full', 'QuotaExceededError');
      return window.originalTransferSetItem.call(this, key, value);
    };
  }, PROFILE_PREFIX);
  await page.getByRole('button', { name: '导入为新角色', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '未能完成' }).waitFor();
  assert.deepEqual(await records(page), copied);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalTransferSetItem; });
  await page.getByRole('button', { name: '导入为新角色', exact: true }).click(); await roster(page);
  assert.equal(Object.keys(await records(page)).length, 3);
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.profileName === '存储失败重试' && !window.eclipseState.paused);
  assert.equal((await page.evaluate(() => window.eclipseState)).gold, seed.hero.gold);
  await page.keyboard.press('Escape');
  console.log('Import preview, cancellation, download, round trip, duplicate names, invalid files and storage retry passed');

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobileContext = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
    await mobile.addInitScript(({ first, prefix }) => {
      for (let i = 0; i < 6; i++) { const profile = { ...first, id: `mobile-${i}`, name: `守夜者${i}` }; localStorage.setItem(prefix + profile.id, JSON.stringify(profile)); }
    }, { first, prefix: PROFILE_PREFIX });
    await mobile.goto(base); await roster(mobile); await checkView(mobile, viewport);
    await mobile.screenshot({ path: `${output}/roster-${viewport.width}.png` });
    await openImport(mobile); await preview(mobile, exported);
    await checkView(mobile, viewport);
    await mobile.screenshot({ path: `${output}/import-${viewport.width}.png` });
    const name = `移动导入${viewport.width}`;
    await mobile.getByRole('textbox', { name: '角色名称', exact: true }).fill(name);
    await mobile.getByRole('button', { name: '导入为新角色', exact: true }).tap(); await roster(mobile);
    assert.equal(await mobile.getByRole('option', { name, exact: true }).getAttribute('aria-selected'), 'true');
    await mobileContext.close();
  }
  assert.deepEqual(errors, []);
  console.log('Desktop/mobile portrait/landscape screenshots, canvas pixels and import controls passed');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.log('Browser errors:', errors); throw error;
} finally { await browser.close(); }
