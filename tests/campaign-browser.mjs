import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { LEVELS, levelTuning } from '../src/campaign.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', errors = [];
const state = page => page.evaluate(() => window.eclipseState);
async function seed(page, hero) {
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => { if (!sessionStorage.getItem('campaign-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('campaign-fixture', '1'); } }, serializeSave(hero));
  await page.goto(base); await enterGame(page);
}
async function chooser(page) { await page.keyboard.press('Escape'); await page.locator('[data-panel="campaign"]').click(); await expect(page.locator('.panel-campaign')).toBeVisible(); }
async function pixels(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 90; const ctx = canvas.getContext('2d'); ctx.drawImage(document.getElementById('game-canvas'), 0, 0, 90, 90);
    const data = ctx.getImageData(0, 0, 90, 90).data, colors = new Set(); let lit = 0;
    for (let i = 0; i < data.length; i += 4) { colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`); if (data[i] + data[i + 1] + data[i + 2] > 100) lit++; }
    return { lit, colors: colors.size };
  });
}
try {
  const fresh = await browser.newPage({ viewport: { width: 1440, height: 960 } }); await seed(fresh, newHero()); await chooser(fresh);
  await expect(fresh.locator('[data-enter-level="0"]')).toBeEnabled(); await expect(fresh.locator('[data-enter-level="1"]')).toBeDisabled(); await expect(fresh.locator('[data-campaign-difficulty="1"]')).toBeDisabled();
  await fresh.locator('[data-campaign-act="4"]').click(); assert.equal(await fresh.locator('[data-enter-level]:disabled').count(), 5);
  await fresh.screenshot({ path: '.verification/campaign-locked-desktop.png' });
  await fresh.locator('[data-action="close"]').click(); assert.deepEqual((await state(fresh)).campaign.cleared, [0, 0, 0]); await fresh.close();

  const hero = newHero(); hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); await seed(page, hero);
  const themes = [];
  for (const level of LEVELS) {
    await chooser(page); await page.locator(`[data-campaign-act="${level.act}"]`).click(); await page.locator(`[data-enter-level="${level.index}"]`).click();
    await page.waitForFunction(index => window.eclipseState.campaign.current === index && !window.eclipseState.paused, level.index);
    const s = await state(page); assert.equal(s.area.name, level.name); assert.equal(s.enemies.filter(enemy => enemy.boss).length, 1); assert.equal(s.enemies.find(enemy => enemy.boss).name, level.boss);
    assert.ok(s.enemies.length > level.quest.count); assert.equal(s.enemies.find(enemy => !enemy.boss).level, levelTuning(level, 0).level);
    assert.equal(s.area.questReady, true, 'Cleared levels do not require repeating the quest');
    for (const objective of s.objectives) {
      assert.ok(objective.route.length, `${level.id}: ${objective.kind} has a path`);
      const end = objective.route.at(-1); assert.ok(Math.hypot(end.x - objective.x, end.z - objective.z) < 3.4, `${level.id}: ${objective.kind} is interactable from its reachable tile`);
    }
    const sample = await pixels(page); assert.ok(sample.lit > 1500 && sample.colors > 65, `${level.id} nonblank: ${JSON.stringify(sample)}`);
    if ([2, 7, 10, 17, 20].includes(level.index)) {
      themes.push(await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()));
      await page.screenshot({ path: `.verification/campaign-act-${level.act + 1}.png` });
    }
    console.log('Area, quest routes, boss and canvas:', level.id, level.name, sample);
  }
  const previousBoss = (await state(page)).enemies.find(enemy => enemy.boss).id;
  await chooser(page); await page.locator('[data-enter-level="24"]').click();
  assert.notEqual((await state(page)).enemies.find(enemy => enemy.boss).id, previousBoss, 'Selecting the current cleared level starts a fresh boss run');
  assert.equal(new Set(themes).size, 5, 'Five acts have distinct scenes');
  await chooser(page); await page.locator('[data-campaign-difficulty="1"]').click(); await page.locator('[data-campaign-act="1"]').click(); await page.locator('[data-enter-level="8"]').click();
  assert.equal((await state(page)).difficulty, 1); await page.reload();
  await page.getByRole('dialog', { name: '选择角色', exact: true }).waitFor(); await page.locator('[data-profile-action="choose-level"]').click();
  await expect(page.locator('.panel-campaign')).toBeVisible(); await expect(page.locator('[data-campaign-difficulty="1"]')).toHaveAttribute('aria-selected', 'true');
  assert.deepEqual((await savedProfile(page)).hero.campaign.cleared, [25, 25, 25]);
  await page.screenshot({ path: '.verification/campaign-selector-desktop.png' }); await page.close();

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobile = await browser.newPage({ viewport, isMobile: true, hasTouch: true }); await seed(mobile, hero); await chooser(mobile);
    await mobile.locator('[data-campaign-act="4"]').tap();
    assert.equal(await mobile.locator('.panel-campaign').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    await mobile.screenshot({ path: `.verification/campaign-selector-${viewport.width}.png` });
    await mobile.locator('[data-enter-level="20"]').tap(); assert.equal((await state(mobile)).campaign.current, 20);
    const sample = await pixels(mobile); assert.ok(sample.lit > 1500 && sample.colors > 65);
    const canvas = await mobile.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()); await mobile.waitForTimeout(150); assert.notEqual(await mobile.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()), canvas);
    await mobile.screenshot({ path: `.verification/campaign-snow-${viewport.width}.png` });
    await mobile.locator('.bottom-nav [data-panel="quest"]').tap(); await expect(mobile.getByRole('dialog', { name: '哈洛加斯之围', exact: true })).toBeVisible();
    assert.equal(await mobile.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true); await mobile.close();
  }
  assert.deepEqual(errors, []); console.log('25 maps, replay, difficulty selection, re-entry, mobile layouts and animation passed');
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `.verification/campaign-browser-failure-${index}.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
