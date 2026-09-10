import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { LAST_PROFILE_KEY, PROFILE_PREFIX } from '../src/saves.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const hero = newHero();
hero.inventory = [{ ...makeItem(BASES[0], 'drag-sword'), x: 0, y: 0 }, { ...makeItem(BASES.find(item => item.slot === 'shield'), 'blocker'), x: 4, y: 0 }];
hero.stash = [{ ...makeItem(BASES.find(item => item.slot === 'armor'), 'drag-armor'), x: 0, y: 0 }];
const errors = [];
async function open(page, fixture = hero) {
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => { if (!sessionStorage.getItem('drag-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('drag-fixture', '1'); } }, serializeSave(fixture));
  await page.goto(base); await enterGame(page); await page.locator('.bottom-nav [data-panel="inventory"]').click();
}
async function grid(page) {
  return page.locator('.diablo-grid').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, cell: el.clientWidth / 10, row: el.clientHeight / Number(el.dataset.rows) }; });
}
async function start(page, id, grabX = .5, grabY = .5) {
  const source = page.locator(`.bag-item[data-item="${id}"]`); await source.scrollIntoViewIfNeeded();
  const rect = await source.boundingBox(), g = await grid(page);
  await page.mouse.move(rect.x + g.cell * grabX, rect.y + g.row * grabY); await page.mouse.down();
  return { g, grabX, grabY };
}
async function dragTo(page, id, x, y, grabX = .5, grabY = .5) {
  const drag = await start(page, id, grabX, grabY);
  await page.mouse.move(drag.g.x + (x + grabX) * drag.g.cell, drag.g.y + (y + grabY) * drag.g.row, { steps: 6 });
  return drag;
}
async function position(page, container, id) { const item = (await savedProfile(page)).hero[container].find(item => item.id === id); return { x: item.x, y: item.y }; }

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); await open(page);
  await page.locator('[data-item="blocker"]').click(); assert.equal(await page.locator('.item-details h3').textContent(), hero.inventory[1].name, 'Click still selects details');
  await dragTo(page, 'drag-sword', 7, 1, 1.5, 2.5);
  await expect(page.locator('.item-drop-preview')).toHaveAttribute('data-valid', 'true');
  await page.screenshot({ path: '.verification/inventory-drag-desktop.png' }); await page.mouse.up();
  assert.deepEqual(await position(page, 'inventory', 'drag-sword'), { x: 7, y: 1 }); assert.deepEqual(await position(page, 'inventory', 'blocker'), { x: 4, y: 0 });
  assert.equal(await page.locator('.item-drag-ghost').count(), 0);
  const beforeInvalid = await savedProfile(page);
  await dragTo(page, 'drag-sword', 3, 0);
  await expect(page.locator('.item-drop-preview')).toHaveAttribute('data-valid', 'false');
  await page.screenshot({ path: '.verification/inventory-drag-invalid.png' }); await page.mouse.up();
  assert.deepEqual(await savedProfile(page), beforeInvalid, 'Occupied drop has no mutation or extra save');
  await dragTo(page, 'drag-sword', 9, 1); await expect(page.locator('.item-drop-preview')).toHaveAttribute('data-valid', 'false'); await page.mouse.up();
  assert.deepEqual(await savedProfile(page), beforeInvalid, 'Overflowing footprint stays in place');
  await start(page, 'drag-sword'); await page.mouse.move(5, 5, { steps: 5 }); await page.mouse.up();
  assert.deepEqual(await savedProfile(page), beforeInvalid); assert.equal(await page.getByRole('dialog', { name: '行囊' }).count(), 1, 'Outside drop does not dismiss the inventory');
  await dragTo(page, 'drag-sword', 0, 1); await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await savedProfile(page), beforeInvalid); assert.equal(await page.locator('.item-drop-preview').count(), 0);
  await dragTo(page, 'drag-sword', 0, 1); await page.locator('#overlay').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.up(); assert.deepEqual(await savedProfile(page), beforeInvalid);
  const source = page.locator('[data-item="drag-sword"]'); await source.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  assert.deepEqual(await position(page, 'inventory', 'drag-sword'), { x: 6, y: 1 }, 'Keyboard uses the same exact placement rules');
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Tab');
  assert.equal(await page.locator('.item-drop-preview').count(), 0); assert.deepEqual(await position(page, 'inventory', 'drag-sword'), { x: 6, y: 1 });
  await dragTo(page, 'drag-sword', 0, 1); await page.keyboard.press('c'); await page.mouse.up();
  assert.equal(await page.locator('.item-drag-ghost').count(), 0); assert.equal(await page.locator('.panel-character').count(), 1);
  assert.deepEqual(await position(page, 'inventory', 'drag-sword'), { x: 6, y: 1 }, 'Switching panels cancels a pending move');
  await page.keyboard.press('i');
  await page.locator('[data-bag-view="stash"]').click();
  await dragTo(page, 'drag-armor', 8, 7); await expect(page.locator('.item-drop-preview')).toHaveAttribute('data-valid', 'true'); await page.mouse.up();
  assert.deepEqual(await position(page, 'stash', 'drag-armor'), { x: 8, y: 7 });
  await page.screenshot({ path: '.verification/stash-drag-desktop.png' });
  await page.reload(); await enterGame(page); await page.keyboard.press('i');
  assert.deepEqual(await position(page, 'inventory', 'drag-sword'), { x: 6, y: 1 }); await page.locator('[data-bag-view="stash"]').click();
  assert.equal(await page.locator('[data-item="drag-armor"]').evaluate(el => el.style.gridRowStart), '8');
  assert.deepEqual(await position(page, 'stash', 'drag-armor'), { x: 8, y: 7 });
  await dragTo(page, 'drag-armor', 0, 0);
  const externalSave = await page.evaluate(({ last, prefix }) => {
    const key = prefix + localStorage.getItem(last), oldValue = localStorage.getItem(key), profile = JSON.parse(oldValue);
    profile.revision++; profile.hero.gold += 10;
    const newValue = JSON.stringify(profile); localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
    return profile;
  }, { last: LAST_PROFILE_KEY, prefix: PROFILE_PREFIX });
  await page.mouse.up(); await expect(page.getByRole('dialog', { name: '存档已变更' })).toBeVisible();
  assert.equal(await page.locator('.item-drag-ghost').count(), 0); assert.deepEqual(await savedProfile(page), externalSave, 'A conflict cancels the drag without overwriting the external save');
  await page.close(); console.log('Desktop drag, anchor, collision, bounds, cancel, keyboard, stash and persistence passed');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await open(mobile);
  const cdp = await mobile.context().newCDPSession(mobile);
  await mobile.locator('[data-item="drag-sword"]').scrollIntoViewIfNeeded();
  let g = await grid(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x + .5 * g.cell, y: g.y + .5 * g.row, id: 1 }] });
  for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + (.5 + 7 * step / 8) * g.cell, y: g.y + (.5 + step / 8) * g.row, id: 1 }] });
  await expect(mobile.locator('.item-drop-preview')).toHaveAttribute('data-valid', 'true'); await mobile.screenshot({ path: '.verification/inventory-drag-mobile.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await position(mobile, 'inventory', 'drag-sword'), { x: 7, y: 1 });
  await mobile.locator('[data-bag-view="stash"]').tap(); await mobile.locator('[data-item="drag-armor"]').scrollIntoViewIfNeeded();
  g = await grid(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x + .5 * g.cell, y: g.y + .5 * g.row, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + 6.5 * g.cell, y: g.y + 1.5 * g.row, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await position(mobile, 'stash', 'drag-armor'), { x: 6, y: 1 });
  const mobileBeforeCancel = await savedProfile(mobile); g = await grid(mobile);
  const armorRect = await mobile.locator('[data-item="drag-armor"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: armorRect.x + .5 * g.cell, y: armorRect.y + .5 * g.row, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + 3.5 * g.cell, y: armorRect.y + .5 * g.row, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.deepEqual(await savedProfile(mobile), mobileBeforeCancel); assert.equal(await mobile.locator('.item-drag-ghost').count(), 0);
  await mobile.locator('[data-item="drag-armor"]').scrollIntoViewIfNeeded();
  g = await grid(mobile);
  const scrollSource = await mobile.locator('[data-item="drag-armor"]').boundingBox();
  assert.equal(await mobile.locator('.inventory-grid-scroll').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'normal private stash fits without scrolling');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: scrollSource.x + .5 * g.cell, y: scrollSource.y + .5 * g.row, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + 8.5 * g.cell, y: g.y + 7.5 * g.row, id: 4 }] });
  await expect(mobile.locator('.item-drop-preview')).toHaveAttribute('data-valid', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(await position(mobile, 'stash', 'drag-armor'), { x: 8, y: 7 });
  assert.equal(await mobile.locator('.panel').evaluate(el => el.scrollTop), 0, 'header stays fixed when placing items');
  await mobile.screenshot({ path: '.verification/stash-drag-mobile.png' });
  assert.equal(await mobile.locator('.panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await mobile.close(); console.log('Real touch dragging, stash, cancellation, edge scrolling and mobile layout passed');
  const tall = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tallHero = structuredClone(hero); tallHero.stash.push({ ...makeItem(BASES.find(item => item.slot === 'ring'), 'deep-ring'), x: 9, y: 35 });
  await open(tall, tallHero); await tall.locator('[data-bag-view="stash"]').tap();
  const touch = await tall.context().newCDPSession(tall), origin = await tall.locator('[data-item="drag-armor"]').boundingBox();
  const scroller = await tall.locator('.inventory-grid-scroll').boundingBox(), cells = await grid(tall);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: origin.x + cells.cell * .5, y: origin.y + cells.row * .5, id: 8 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cells.x + cells.cell * 8.5, y: scroller.y + scroller.height - 8, id: 8 }] });
  await tall.waitForFunction(() => document.querySelector('.inventory-grid-scroll').scrollTop > 40);
  assert.equal(await tall.locator('.panel').evaluate(el => el.scrollTop), 0, 'only a long container scrolls at its edge');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.deepEqual(await position(tall, 'stash', 'drag-armor'), { x: 0, y: 0 });
  await tall.close();
  assert.deepEqual(errors, []);
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `.verification/inventory-drag-failure-${index}.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
