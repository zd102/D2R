import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, SAVE_KEY, serializeSave } from '../src/model.ts';
import { PROFILE_PREFIX, LAST_PROFILE_KEY } from '../src/saves.ts';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const page = await context.newPage();
const state = target => target.evaluate(() => window.eclipseState);
const roster = target => target.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
const records = target => target.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => JSON.parse(localStorage.getItem(key))), PROFILE_PREFIX);
async function select(target, name) {
  await roster(target); await target.getByRole('option', { name, exact: true }).click();
  await target.getByRole('button', { name: '进入旅程', exact: true }).click();
  await target.waitForFunction(() => window.eclipseState?.profileId && !window.eclipseState.paused);
}
async function create(target, name) {
  await roster(target); await target.getByRole('button', { name: '新建角色', exact: true }).click();
  await target.getByRole('textbox', { name: '角色名称', exact: true }).fill(name);
  await target.getByRole('button', { name: '创建并进入', exact: true }).click();
  await target.waitForFunction(() => window.eclipseState?.profileId && !window.eclipseState.paused);
}
async function leave(target) {
  if (!(await state(target)).paused) await target.keyboard.press('Escape');
  await target.getByRole('button', { name: '保存并切换角色', exact: true }).click(); await roster(target);
}
try {
  const legacy = newHero(); legacy.level = 3; legacy.gold = 270; legacy.points = 6; legacy.shrines = [0]; legacy.equipment.weapon.power = 39;
  const original = serializeSave(legacy);
  await page.addInitScript(({ key, original }) => {
    if (!sessionStorage.getItem('legacy-fixture')) { localStorage.setItem(key, original); sessionStorage.setItem('legacy-fixture', '1'); }
  }, { key: SAVE_KEY, original });
  await page.goto(base); await roster(page);
  assert.equal((await state(page)).profileId, null); assert.equal((await state(page)).paused, true);
  assert.equal((await records(page)).length, 1); assert.deepEqual((await records(page))[0].hero, legacy);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), original);
  await page.keyboard.press('Escape'); await page.keyboard.press('i'); await page.keyboard.press('e');
  await roster(page); assert.equal((await state(page)).profileId, null, 'No gameplay before selection');
  await page.screenshot({ path: '.verification/profiles-desktop.png' });
  await page.getByRole('button', { name: '新建角色', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('   ');
  await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '角色名称' }).waitFor();
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('晨星');
  await page.screenshot({ path: '.verification/profiles-create.png' });
  await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.profileName === '晨星');
  assert.equal((await state(page)).gold, 0); assert.equal((await state(page)).level, 1);
  await leave(page);
  const beforeA = (await records(page)).find(p => p.name === '晨星');
  assert.equal(beforeA.hero.mana, 15); assert.equal((await records(page)).length, 2);
  await select(page, '灰烬行者'); assert.equal((await state(page)).gold, 270); assert.equal((await state(page)).level, 3);
  await page.keyboard.press('c'); await page.getByRole('button', { name: '提升力量', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await leave(page);
  const afterA = await records(page);
  assert.deepEqual(afterA.find(p => p.name === '晨星'), beforeA, 'Other character is unchanged');
  assert.equal(afterA.find(p => p.name === '灰烬行者').hero.strength, 26);
  await page.getByRole('option', { name: '晨星', exact: true }).click();
  await page.getByRole('button', { name: '重命名角色', exact: true }).click();
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('灰烬行者');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '同名角色' }).waitFor();
  await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('晨星二号');
  await page.getByRole('button', { name: '保存名称', exact: true }).click(); await roster(page);
  assert.deepEqual((await records(page)).find(p => p.name === '晨星二号').hero, beforeA.hero);
  await page.getByRole('option', { name: '灰烬行者', exact: true }).click();
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await page.getByRole('button', { name: '保留角色', exact: true }).click(); assert.equal((await records(page)).length, 2);
  await page.getByRole('button', { name: '删除角色', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click(); await page.reload(); await roster(page);
  assert.equal((await records(page)).length, 1); assert.equal(await page.getByRole('option', { name: '灰烬行者' }).count(), 0);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), original, 'Migration backup remains intact');
  console.log('Migration, creation, selection, isolation, rename and deletion passed');

  await select(page, '晨星二号');
  const second = await context.newPage(); await second.goto(base); await select(second, '晨星二号');
  await second.getByRole('button', { name: '保存旅程', exact: true }).click();
  await page.getByRole('dialog', { name: '存档已变更' }).waitFor();
  assert.equal((await state(page)).paused, true);
  const revision = (await records(second))[0].revision;
  await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '存档已变更' }).waitFor();
  await page.getByRole('button', { name: '返回角色选择', exact: true }).click(); await roster(page);
  assert.equal((await records(page))[0].revision, revision, 'Conflicted window does not overwrite storage');
  await create(page, '远行者');
  await page.getByRole('button', { name: '保存旅程', exact: true }).click();
  assert.notEqual((await state(second)).profileId, (await state(page)).profileId);
  assert.equal(await second.getByRole('dialog', { name: '存档已变更' }).count(), 0, 'Different characters do not conflict');
  await leave(second);
  await second.getByRole('option', { name: '远行者', exact: true }).click();
  await second.getByRole('button', { name: '删除角色', exact: true }).click();
  await second.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('dialog', { name: '存档已变更' }).waitFor();
  await page.getByRole('button', { name: '返回角色选择', exact: true }).click(); await roster(page);
  assert.equal((await records(page)).length, 1, 'Deleted active role is not resurrected');
  await second.close();
  console.log('Multiple windows and deleted-active-save protection passed');

  const seed = (await records(page))[0];
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobile = await browser.newPage({ viewport, isMobile: true, hasTouch: true }); mobile.on('pageerror', error => errors.push(error.message));
    await mobile.addInitScript(({ seed, prefix, last }) => {
      if (sessionStorage.getItem('mobile-seed')) return;
      for (let i = 0; i < 6; i++) { const profile = { ...seed, id: `mobile-${i}`, name: `守夜者${i + 1}`, updatedAt: seed.updatedAt + i }; localStorage.setItem(prefix + profile.id, JSON.stringify(profile)); }
      localStorage.setItem(last, 'mobile-0'); sessionStorage.setItem('mobile-seed', '1');
    }, { seed, prefix: PROFILE_PREFIX, last: LAST_PROFILE_KEY });
    await mobile.goto(base); await roster(mobile);
    const rect = await mobile.getByRole('dialog').boundingBox();
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, 'Roster fits viewport');
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.screenshot({ path: `.verification/profiles-${viewport.width}.png` });
    await mobile.getByRole('button', { name: '进入旅程', exact: true }).tap();
    assert.equal((await state(mobile)).profileName, '守夜者1');
    await mobile.close();
  }
  const unavailable = await browser.newPage();
  await unavailable.addInitScript(prefix => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith(prefix)) throw new DOMException('Full', 'QuotaExceededError'); return set.call(this, key, value); }; }, PROFILE_PREFIX);
  await unavailable.goto(base); await roster(unavailable);
  await unavailable.getByRole('button', { name: '新建角色', exact: true }).click();
  await unavailable.getByRole('textbox', { name: '角色名称', exact: true }).fill('无法写入');
  await unavailable.getByRole('button', { name: '创建并进入', exact: true }).click();
  await unavailable.getByRole('alert').filter({ hasText: '未能完成' }).waitFor();
  assert.equal((await state(unavailable)).profileId, null); assert.equal((await records(unavailable)).length, 0);
  await unavailable.close();
  assert.deepEqual(errors, []);
  console.log('Mobile portrait/landscape and unavailable storage passed');
} catch (error) {
  await page.screenshot({ path: '.verification/profiles-failure.png' });
  console.log('Browser errors:', errors); throw error;
} finally { await browser.close(); }
