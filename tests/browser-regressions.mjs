import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => errors.push(e.message));
  const hero = newHero(); hero.hp = 1; hero.gold = 1000;
  await page.addInitScript(save => {
    if (!sessionStorage.getItem('death-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('death-fixture', '1'); }
  }, serializeSave(hero));
  await page.goto(base); await enterGame(page);
  const initial = await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(400);
  assert.notEqual(await page.locator('#game-canvas').evaluate(canvas => canvas.toDataURL()), initial, 'Scene animates');
  const target = await page.evaluate(() => window.eclipseState.enemies.find(e => e.id === 1));
  await page.mouse.click(target.screen.x - 60, target.screen.y + 40);
  await page.getByRole('dialog', { name: '你已陨落' }).waitFor({ timeout: 30000 });
  assert.equal((await savedProfile(page)).hero.gold, 990, 'Level-based death penalty persisted');
  assert.equal((await savedProfile(page)).hero.corpse.equipment.weapon.id, 'starter-sword');
  await page.screenshot({ path: '.verification/death.png' });
  await page.getByRole('button', { name: '在传送阵重生', exact: true }).click();
  assert.equal(await page.evaluate(() => window.eclipseState.dead), false);
  assert.equal(await page.evaluate(() => window.eclipseState.gold), 990);
  assert.equal(await page.evaluate(() => window.eclipseState.hp), 55);
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => window.eclipseState.position);
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  assert.deepEqual(await page.evaluate(() => window.eclipseState.position), before, 'Pause stops movement');
  await page.locator('#quality').selectOption('low');
  await page.locator('#volume').fill('10');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.eclipseState.paused), false, 'Escape closes settings while input is focused');
  await page.reload(); await enterGame(page);
  assert.equal(await page.evaluate(() => window.eclipseState.gold), 990, 'Revive and reload do not charge twice');
  await page.keyboard.press('f'); assert.equal((await savedProfile(page)).hero.corpse, null); assert.equal((await savedProfile(page)).hero.equipment.weapon.id, 'starter-sword');
  console.log('Death, revival, pause, settings and animation passed');

  for (const size of [{ width: 360, height: 640 }, { width: 844, height: 390 }]) {
    const mobile = await browser.newPage({ viewport: size, isMobile: true, hasTouch: true });
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(base); await enterGame(mobile);
    const layout = await mobile.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].map(el => ({ tag: el.tagName, id: el.id, cls: el.className, right: el.getBoundingClientRect().right })).filter(el => el.right > innerWidth + 1) }));
    if (layout.scroll > layout.width) { console.log('Overflow:', JSON.stringify({ size, layout })); await mobile.screenshot({ path: '.verification/overflow.png' }); }
    assert.equal(layout.scroll <= layout.width, true);
    const skillRects = await mobile.locator('.action-row .skill').evaluateAll(buttons => buttons.map(b => { const rect = b.getBoundingClientRect(); return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom }; }));
    assert.ok(skillRects.every(r => r.x >= 0 && r.right <= size.width && r.y >= 0 && r.bottom <= size.height), 'All skills fit the viewport');
    assert.ok(await mobile.locator('#joystick').isVisible(), 'Touch movement is available in both orientations');
    await mobile.screenshot({ path: `.verification/mobile-${size.width}.png` });
    await mobile.getByRole('button', { name: '角色 · C', exact: true }).tap();
    const dialog = await mobile.getByRole('dialog').boundingBox();
    assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= size.width && dialog.y + dialog.height <= size.height, 'Dialog stays within viewport');
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log('Small mobile and landscape layouts passed');
} finally { await browser.close(); }
