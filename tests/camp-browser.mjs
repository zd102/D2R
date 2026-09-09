import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero } from '../src/model.ts';
import { PROFILE_PREFIX } from '../src/saves.ts';
import { CAMP } from '../src/camp.ts';

const output = '.verification/camp';
await mkdir(output, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const state = page => page.evaluate(() => window.eclipseState);
async function loadCamp(page, creating = false) {
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor();
  await expect(page.getByRole('button', { name: '关卡选择', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-profile-action="choose-level"]')).toHaveCount(0);
  await page.screenshot({ path: `${output}/roster-${page.viewportSize().width}.png` });
  if (creating) {
    await page.getByRole('button', { name: '新建角色', exact: true }).click();
    await page.getByRole('textbox', { name: '角色名称', exact: true }).fill('营地旅者');
    await page.getByRole('button', { name: '创建并进入', exact: true }).click();
  } else await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.profileId && window.eclipseState.inCamp && !window.eclipseState.paused);
  const s = await state(page);
  assert.equal(s.area.id, 'camp'); assert.equal(s.area.name, CAMP.name); assert.equal(s.enemies.length, 0);
  assert.equal(s.enemyProjectiles, 0); assert.equal(s.enemyHazards, 0); assert.equal(s.loot.length, 0);
  assert.deepEqual(s.position, CAMP.spawn);
  assert.deepEqual(s.objectives.map(p => p.kind), ['camp-portal', 'supply']);
  for (const p of s.objectives) assert.ok(p.route.length, 'Camp facilities are reachable');
  await pause(page);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).paused, false);
}
async function portal(page, touch = false) {
  const label = page.getByRole('button', { name: '远征传送阵', exact: true });
  if (touch) await label.tap(); else await label.click();
  await page.getByRole('dialog', { name: '远征传送阵', exact: true }).waitFor();
  assert.equal((await state(page)).inCamp, true);
}
async function pause(page) {
  await page.keyboard.press('Escape');
  const menu = page.locator('.panel-pause'); await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: '关卡选择', exact: true })).toHaveCount(0);
  await expect(menu.locator('[data-panel="campaign"]')).toHaveCount(0);
  const area = (await state(page)).inCamp ? 'camp' : 'level';
  await page.screenshot({ path: `${output}/pause-${area}-${page.viewportSize().width}.png` });
}
async function returnToCamp(page) {
  await pause(page);
  await page.getByRole('button', { name: '返回营地', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState.inCamp && !window.eclipseState.paused);
  assert.equal((await state(page)).enemies.length, 0);
}
async function newPage(hero, viewport = { width: 1440, height: 960 }, touch = false) {
  const page = await browser.newPage({ viewport, isMobile: touch, hasTouch: touch });
  page.on('pageerror', error => errors.push(error.message));
  if (hero) await page.addInitScript(({ hero, prefix }) => {
    if (sessionStorage.getItem('camp-fixture')) return;
    const profile = { version: 2, id: 'camp-test', name: '营地测试', createdAt: 1000, updatedAt: 1000, revision: 1, hero };
    localStorage.setItem(prefix + profile.id, JSON.stringify(profile)); sessionStorage.setItem('camp-fixture', '1');
  }, { hero, prefix: PROFILE_PREFIX });
  await page.goto(base); await loadCamp(page, !hero); return page;
}
async function canvasCheck(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const sample = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.drawImage(document.getElementById('game-canvas'), 0, 0, 100, 100);
    const data = ctx.getImageData(0, 0, 100, 100).data, colors = new Set(); let lit = 0;
    for (let i = 0; i < data.length; i += 4) { colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`); if (data[i] + data[i + 1] + data[i + 2] > 100) lit++; }
    return { lit, colors: colors.size };
  });
  assert.ok(sample.lit > 2000 && sample.colors > 65, `Camp is visible: ${JSON.stringify(sample)}`);
  const before = await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(180);
  assert.notEqual(await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()), before, 'Camp animates');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
}
try {
  const page = await newPage();
  await canvasCheck(page); await page.screenshot({ path: `${output}/desktop.png` });
  await portal(page);
  await expect(page.locator('[data-enter-level="0"]')).toBeEnabled();
  await expect(page.locator('[data-enter-level="1"]')).toBeDisabled();
  await expect(page.locator('[data-campaign-difficulty="1"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).inCamp, true);
  await page.keyboard.press('f'); await page.locator('.panel-campaign').waitFor();
  await page.locator('[data-enter-level="0"]').click();
  await page.waitForFunction(() => !window.eclipseState.inCamp && !window.eclipseState.paused);
  assert.ok((await state(page)).enemies.length > 0);
  await pause(page);
  const before = await state(page);
  await page.evaluate(prefix => {
    window.campOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith(prefix)) throw new DOMException('Full', 'QuotaExceededError'); return window.campOriginalSetItem.call(this, key, value); };
  }, PROFILE_PREFIX);
  await page.getByRole('button', { name: '返回营地', exact: true }).click();
  await page.getByText('无法保存', { exact: true }).waitFor();
  assert.equal((await state(page)).inCamp, false); assert.deepEqual((await state(page)).campaign, before.campaign);
  assert.deepEqual((await state(page)).enemies, before.enemies);
  await page.evaluate(() => { Storage.prototype.setItem = window.campOriginalSetItem; });
  await page.getByRole('button', { name: '返回营地', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState.inCamp && !window.eclipseState.paused);
  assert.deepEqual((await state(page)).campaign, before.campaign);
  await page.reload(); await loadCamp(page); await page.close();
  console.log('Fresh character, portal mouse/keyboard, locked stages, saved return and failed-save rollback passed');

  const advanced = newHero(); advanced.level = 40; advanced.campaign.cleared = [25, 7, 0]; advanced.campaign.current = 6;
  advanced.difficultyLevel = 1; advanced.unlockedDifficulty = 1; advanced.bossDefeated = true; advanced.campaign.objects = [0];
  const veteran = await newPage(advanced);
  assert.equal((await state(veteran)).bossDefeated, true, 'Loading camp does not reset the previous completed run');
  await veteran.keyboard.press('j'); await veteran.locator('.panel-quest').waitFor();
  assert.equal(await veteran.locator('[data-panel="victory"]').count(), 0, 'Camp does not offer settlement for a past run');
  await veteran.keyboard.press('Escape');
  await portal(veteran);
  for (const index of [5, 6, 7]) await expect(veteran.locator(`[data-enter-level="${index}"]`)).toBeEnabled();
  for (const index of [8, 9]) await expect(veteran.locator(`[data-enter-level="${index}"]`)).toBeDisabled();
  await expect(veteran.locator('[data-campaign-difficulty="2"]')).toBeDisabled();
  await veteran.locator('[data-enter-level="6"]').click();
  const replay = await state(veteran); assert.equal(replay.inCamp, false); assert.equal(replay.bossDefeated, false); assert.equal(replay.area.questReady, true);
  assert.equal(replay.enemies.filter(enemy => enemy.boss).length, 1);
  await returnToCamp(veteran); await portal(veteran); await veteran.locator('[data-enter-level="7"]').click();
  assert.equal((await state(veteran)).campaign.current, 7); assert.equal((await state(veteran)).area.questReady, false);
  await veteran.reload(); await loadCamp(veteran); assert.equal((await state(veteran)).campaign.current, 7);
  await veteran.close();
  const partial = newHero(); partial.campaign.kills = 4;
  const resumed = await newPage(partial); await portal(resumed); await resumed.locator('[data-enter-level="0"]').click();
  assert.equal((await state(resumed)).campaign.kills, 4);
  await returnToCamp(resumed); await portal(resumed); await resumed.locator('[data-enter-level="0"]').click();
  assert.equal((await state(resumed)).campaign.kills, 4); await resumed.close();
  console.log('Existing saves, independent difficulty unlocks, cleared replay and partial quest resumption passed');

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobile = await newPage(newHero(), viewport, true);
    await canvasCheck(mobile); await mobile.screenshot({ path: `${output}/camp-${viewport.width}.png` });
    await portal(mobile, true); await mobile.screenshot({ path: `${output}/portal-${viewport.width}.png` });
    await mobile.locator('[data-enter-level="0"]').tap();
    assert.equal((await state(mobile)).inCamp, false);
    await returnToCamp(mobile); assert.equal((await state(mobile)).enemies.length, 0);
    await mobile.close();
  }
  assert.deepEqual(errors, []); console.log('Mobile portal touch, scene framing, movement, animation and canvas pixels passed');
} catch (error) {
  for (const [i, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${i}.png` }).catch(() => {});
  console.log('Browser errors:', errors); throw error;
} finally { await browser.close(); }
