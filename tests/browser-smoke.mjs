import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = new URL('../.verification/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
page.on('pageerror', error => { errors.push(error.message); console.log('PAGE ERROR:', error.message); });
page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE ERROR:', message.text()); } });
try {
  await page.goto(base);
  await page.waitForFunction(() => window.eclipseState?.drawCalls > 0, undefined, { timeout: 60000 });
  await page.screenshot({ path: new URL('desktop.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  const pixels = await page.evaluate(() => {
    const source = document.getElementById('game-canvas'), sample = document.createElement('canvas'); sample.width = 100; sample.height = 100;
    const ctx = sample.getContext('2d'); ctx.drawImage(source, 0, 0, 100, 100); const pixels = ctx.getImageData(0, 0, 100, 100).data;
    const colors = new Set(); let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) { colors.add(`${pixels[i] >> 3},${pixels[i + 1] >> 3},${pixels[i + 2] >> 3}`); if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 100) lit++; }
    return { colors: colors.size, lit };
  });
  assert.ok(pixels.colors > 100 && pixels.lit > 2000, `Nonblank scene: ${JSON.stringify(pixels)}`);
  const before = await page.evaluate(() => window.eclipseState.position);
  await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
  const after = await page.evaluate(() => window.eclipseState.position);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 2, 'W moves the player');
  await page.keyboard.press('e');
  assert.ok(await page.evaluate(() => window.eclipseState.mana < 95), 'Nova consumes mana');
  await page.keyboard.press('i'); await page.getByRole('dialog', { name: '行囊' }).waitFor();
  assert.equal(await page.evaluate(() => window.eclipseState.paused), true);
  await page.screenshot({ path: new URL('inventory.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await page.getByRole('button', { name: '守誓者长剑', exact: true }).click();
  await page.getByText('已装备', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.keyboard.press('Tab'); await page.getByRole('dialog', { name: '遗忘墓园' }).waitFor();
  await page.screenshot({ path: new URL('map.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '保存旅程', exact: true }).click();
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('eclipse-ii-save-v1')).hero.level === 1));
  console.log('Desktop passed:', JSON.stringify({ pixels, position: after, errors }));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(base); await mobile.waitForFunction(() => window.eclipseState?.drawCalls > 0);
  const mobilePixels = await mobile.evaluate(() => {
    const sample = document.createElement('canvas'); sample.width = 80; sample.height = 80;
    const ctx = sample.getContext('2d'); ctx.drawImage(document.getElementById('game-canvas'), 0, 0, 80, 80);
    const pixels = ctx.getImageData(0, 0, 80, 80).data; let lit = 0; const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 65) lit++; colors.add(`${pixels[i] >> 3},${pixels[i + 1] >> 3},${pixels[i + 2] >> 3}`); }
    return { lit, colors: colors.size };
  });
  assert.ok(mobilePixels.lit > 1500 && mobilePixels.colors > 80, 'Mobile scene is nonblank');
  await mobile.screenshot({ path: new URL('mobile.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
  const joystick = await mobile.locator('#joystick').boundingBox();
  await mobile.mouse.move(joystick.x + joystick.width / 2, joystick.y + joystick.height / 2); await mobile.mouse.down();
  await mobile.mouse.move(joystick.x + joystick.width / 2, joystick.y + 5); await mobile.waitForTimeout(900); await mobile.mouse.up();
  assert.ok(await mobile.evaluate(() => Math.hypot(window.eclipseState.position.x, window.eclipseState.position.z - 11) > 1), 'Mobile joystick moves');
  await mobile.getByRole('button', { name: '背包 · I', exact: true }).tap(); await mobile.getByRole('dialog', { name: '行囊' }).waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: new URL('mobile-inventory.png', output).pathname.replace(/^\/(\w:)/, '$1') });
  await mobile.getByRole('button', { name: '关闭', exact: true }).tap();
  await mobile.getByRole('button', { name: '灵魂新星 · E · 30 法力', exact: true }).tap();
  assert.ok(await mobile.evaluate(() => window.eclipseState.mana < 95), 'Touch skill consumes mana');
  console.log('Mobile passed');
  assert.deepEqual(errors, [], 'No browser errors');
} finally { await browser.close(); }
