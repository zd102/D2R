import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { newHero } from '../src/model.ts';
import { CHARACTER_FILE_FORMAT, PROFILE_PREFIX } from '../src/save-format.ts';

const output = process.env.OUTPUT_DIR || '.verification/online-browser';
await mkdir(output, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
let offset = 0;
const app = await createApp({ filename: join(output, 'online.sqlite'), now: () => Date.now() + offset, rateLimit: 10000 });
await app.listen({ host: '127.0.0.1', port: Number(process.env.D2R_API_PORT || 3001) });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], contexts = [];
const suffix = Date.now().toString(36), username = `online_${suffix}`, password = 'online-browser-password-123';
async function pageFor(viewport = { width: 1440, height: 960 }, existing) {
  const context = existing || await browser.newContext({ viewport, acceptDownloads: true });
  if (!existing) contexts.push(context);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.onlineGame = game;') });
  });
  return page;
}
async function auth(page, user = username, registering = false) {
  if (registering) await page.getByRole('button', { name: '没有账号，去注册', exact: true }).click();
  await page.locator('#online-username').fill(user); await page.locator('#online-password').fill(password);
  if (registering) await page.locator('#online-confirm').fill(password);
  await page.getByRole('button', { name: registering ? '注册账号' : '登录', exact: true }).click();
}
const roster = page => page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
async function leave(page) {
  for (let i = 0; i < 2 && !await page.getByRole('button', { name: '保存并切换角色', exact: true }).isVisible(); i++) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '保存并切换角色', exact: true }).click(); await roster(page);
}
async function enter(page, name) {
  await roster(page); await page.getByRole('option', { name, exact: true }).click();
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.profileId && !window.eclipseState.paused);
}
try {
  const page = await pageFor();
  await page.addInitScript(({ prefix }) => { if (!localStorage.getItem('online-local-fixture')) { localStorage.setItem(prefix + 'untouched', 'local-fixture'); localStorage.setItem('online-local-fixture', '1'); } }, { prefix: PROFILE_PREFIX });
  await page.goto(base);
  await page.getByRole('button', { name: /^在线模式/ }).click(); await auth(page, username, true);
  await expect(page.locator('#auth-notice')).toContainText('注册成功'); await auth(page); await roster(page);
  assert.equal(await page.evaluate(prefix => localStorage.getItem(prefix + 'untouched'), PROFILE_PREFIX), 'local-fixture');
  assert.equal(await page.evaluate(() => window.eclipseState.mode), 'online');
  await page.getByRole('button', { name: '新建角色', exact: true }).click(); await page.getByLabel('角色名称', { exact: true }).fill('在线冒险者');
  await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.profileName === '在线冒险者' && !window.eclipseState.paused);
  await page.evaluate(async () => { const g = window.onlineGame; g.hero.gold = 4567; if (!await g.flushSave()) throw new Error('save failed'); });
  await leave(page);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出角色存档', exact: true }).click();
  const download = await downloadEvent; await download.saveAs(join(output, 'exported-character.json'));
  const exported = JSON.parse(await readFile(join(output, 'exported-character.json'), 'utf8'));
  assert.equal(exported.profile.hero.gold, 4567); assert.equal(exported.format, CHARACTER_FILE_FORMAT);
  await page.getByRole('button', { name: '导入角色存档', exact: true }).click();
  await page.locator('#profile-file').setInputFiles({ name: 'uploaded.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.getByLabel('角色名称', { exact: true }).fill('上传副本');
  await page.getByRole('button', { name: '导入为新角色', exact: true }).click(); await roster(page);
  await expect(page.getByRole('option')).toHaveCount(2); await enter(page, '上传副本');
  assert.equal(await page.evaluate(() => window.eclipseState.gold), 4567);
  // The server commits a save while its first response is lost. Retrying must not roll back live state.
  let dropped = false, retryOperations = [];
  await page.route('**/api/v1/characters/*/save', async route => {
    retryOperations.push(route.request().postDataJSON().operationId);
    if (!dropped) { dropped = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.evaluate(() => { const g = window.onlineGame; g.hero.gold = 9876; g.setPlayerCount(8); });
  await page.waitForFunction(() => window.onlineGame.profile.hero.gold === 9876 && !window.eclipseState.saveBusy);
  assert.ok(retryOperations.length >= 2); assert.equal(retryOperations[0], retryOperations[1]);
  assert.equal(await page.evaluate(() => window.eclipseState.paused), true, 'Reconnect after a critical save waits for the player to resume');
  await page.unroute('**/api/v1/characters/*/save');
  await page.waitForFunction(() => window.eclipseState.onlineState === 'ready', null, { timeout: 30000 });
  // Run actual account stash transfer through the game UI at the camp chest.
  await page.evaluate(async () => {
    const g = window.onlineGame, { CAMP } = await import('/src/camp.ts');
    g.actor.group.position.set(CAMP.stash.x, .5, CAMP.stash.z); g.ui.openPanel('shared-stash');
    await g.ui.sharedStashScreen.transfer({ direction: 'unequip', slot: 'weapon' });
    if (g.hero.equipment.weapon || g.saves.readShared().items.length !== 1) throw new Error('stash transfer failed');
  });
  await leave(page); await page.screenshot({ path: join(output, 'online-roster.png') });
  // Same browser: shared Cookie cannot grant a second active page.
  const duplicate = await pageFor(undefined, page.context()); await duplicate.goto(base); await duplicate.getByRole('button', { name: /^在线模式/ }).click();
  await expect(duplicate.locator('#mode-error')).toContainText('其他页面'); await duplicate.close();
  // Independent browser: second login rejected until normal logout.
  const other = await pageFor(); await other.goto(base); await other.getByRole('button', { name: /^在线模式/ }).click(); await auth(other);
  await expect(other.locator('#mode-error')).toContainText('已登录');
  await page.getByRole('button', { name: '退出账号', exact: true }).click(); await page.getByRole('button', { name: /^本地模式/ }).waitFor();
  await auth(other); await roster(other); await enter(other, '上传副本');
  assert.equal(await other.evaluate(() => window.eclipseState.gold), 9876);
  assert.equal(await other.evaluate(() => window.onlineGame.saves.readShared().items.length), 1);
  // Unknown/unsaved client progress must never be uploaded after server expiry.
  await other.keyboard.press('Escape');
  await other.evaluate(() => { window.onlineGame.hero.gold = 99999; });
  await other.context().setOffline(true); offset += 91000;
  await expect(other.locator('.online-status')).toBeVisible();
  await other.keyboard.press('Tab'); await expect(other.locator('#online-mode-return')).toBeFocused();
  await other.keyboard.press('Escape'); await expect(other.locator('.online-status')).toBeVisible();
  await other.context().setOffline(false);
  await expect(other.locator('#online-state-title')).toHaveText('请重新登录', { timeout: 30000 });
  await other.getByRole('button', { name: '重新登录', exact: true }).click();
  await auth(other); await roster(other); await enter(other, '上传副本');
  assert.equal(await other.evaluate(() => window.eclipseState.gold), 9876);
  await leave(other); await other.getByRole('button', { name: '退出账号', exact: true }).click();
  // A separate account sees an empty roster, can upload a local save, and works on mobile.
  const mobile = await pageFor({ width: 390, height: 844 }); await mobile.goto(base); await mobile.getByRole('button', { name: /^在线模式/ }).click();
  await auth(mobile, `mobile_${suffix}`, true); await expect(mobile.locator('#auth-notice')).toContainText('注册成功');
  await auth(mobile, `mobile_${suffix}`); await roster(mobile); await expect(mobile.getByRole('option')).toHaveCount(0);
  await mobile.getByRole('button', { name: '导入角色存档', exact: true }).click();
  const hero = newHero('sorceress'); hero.gold = 1234;
  await mobile.locator('#profile-file').setInputFiles({ name: 'local.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: CHARACTER_FILE_FORMAT, version: 1, profile: { version: 2, id: 'local-source', name: '手机法师', createdAt: 1, updatedAt: 1, revision: 1, hero } })) });
  await mobile.getByRole('button', { name: '导入为新角色', exact: true }).click(); await roster(mobile);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: join(output, 'online-mobile.png') });
  await enter(mobile, '手机法师'); assert.equal(await mobile.evaluate(() => window.eclipseState.classId), 'sorceress');
  await leave(mobile); await mobile.getByRole('button', { name: '退出账号', exact: true }).click();
  await mobile.getByRole('button', { name: /^在线模式/ }).click();
  await expect(mobile.locator('#online-remember')).not.toBeChecked();
  await mobile.locator('#online-remember').check();
  await mobile.screenshot({ path: join(output, 'remember-login-mobile.png') });
  await auth(mobile, `mobile_${suffix}`); await roster(mobile);
  const storage = await mobile.context().storageState();
  assert.ok(!JSON.stringify(storage.origins).includes(password), 'Never persist the password in web storage');
  assert.ok(storage.cookies.find(c => c.name === 'eclipse-remember' && c.httpOnly));
  await mobile.context().close(); offset += 91000;
  // Restart the browser with its persisted cookies/preferences, without an active session cookie.
  storage.cookies = storage.cookies.filter(c => c.name !== 'eclipse-session');
  const restoredContext = await browser.newContext({ storageState: storage, viewport: { width: 390, height: 844 } });
  contexts.push(restoredContext);
  const restored = await pageFor(undefined, restoredContext);
  await restored.goto(base); await restored.getByRole('button', { name: /^在线模式/ }).click();
  await roster(restored); await enter(restored, '手机法师');
  assert.equal(await restored.evaluate(() => window.eclipseState.gold), 1234);
  await restored.keyboard.press('Escape');
  await restored.context().setOffline(true); offset += 91000; await restored.context().setOffline(false);
  await expect(restored.locator('#online-state-title')).toHaveText('请重新登录', { timeout: 30000 });
  await restored.getByRole('button', { name: '重新登录', exact: true }).click(); await roster(restored);
  await restored.getByRole('button', { name: '退出账号', exact: true }).click();
  await restored.getByRole('button', { name: /^在线模式/ }).click();
  await expect(restored.locator('#online-username')).toHaveValue(`mobile_${suffix}`);
  await expect(restored.locator('#online-password')).toHaveValue('');
  assert.ok(!(await restored.context().cookies()).some(c => c.name === 'eclipse-remember'));
  assert.equal(await restored.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); console.log('Online browser regression passed, including remembered login, browser restart, expiry recovery, logout revocation and mobile layout.');
} catch (error) {
  for (const [i, context] of contexts.entries()) for (const [j, page] of context.pages().entries()) await page.screenshot({ path: join(output, `failure-${i}-${j}.png`) }).catch(() => {});
  throw error;
} finally { await browser.close(); await app.close(); }
