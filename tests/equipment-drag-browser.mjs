import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave, stats } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { SHARED_STASH_KEY } from '../src/shared-stash.ts';

const output = '.verification/equipment-drag'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
const ring = id => makeItem(BASES.find(base => base.baseCode === 'rin'), id);
const hero = newHero(); hero.level = 99; hero.strength = hero.dexterity = 999;
hero.equipment.ring = { ...ring('left-ring'), mods: { life: 20, strength: 10 } };
hero.equipment.ring2 = { ...ring('right-ring'), mods: { mana: 20, dexterity: 10 } };
hero.inventory = [{ ...ring('bag-blocker'), x: 2, y: 2 }]; hero.stash = [{ ...ring('stash-blocker'), x: 8, y: 8 }];
hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
const shared = [{ ...ring('shared-blocker'), x: 8, y: 8 }];
const full = Array.from({ length: 40 }, (_, i) => ring(`full-${i}`)); assert.ok(placeItems(full));

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }].filter(viewport => !process.env.VERIFY_WIDTH || viewport.width === Number(process.env.VERIFY_WIDTH))) {
    const touch = viewport.width === 390, exactGrid = viewport.width >= 1000;
    const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch }); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.equipmentDragGame = game;') }); });
    await page.addInitScript(({ save, key, items }) => {
      if (sessionStorage.getItem('equipment-drag-seeded')) return;
      localStorage.setItem('eclipse-ii-save-v1', save); localStorage.setItem(key, JSON.stringify({ version: 1, revision: 0, checkpoints: {}, items }));
      sessionStorage.setItem('equipment-drag-seeded', 'yes');
    }, { save: serializeSave(hero), key: SHARED_STASH_KEY, items: shared });
    const enter = async () => { await page.getByRole('button', { name: '进入旅程', exact: true }).click(); await page.waitForFunction(() => window.equipmentDragGame && !window.equipmentDragGame.paused); await page.evaluate(() => cancelAnimationFrame(window.equipmentDragGame.frameId)); };
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173'); await enter();
    const state = () => page.evaluate(() => { const g = window.equipmentDragGame; return { hero: structuredClone(g.hero), shared: g.saves.readShared(), revision: g.profile.revision }; });
    const pane = async (kind, value) => { const button = page.locator(`button[data-${kind}-pane="${value}"]`); if (await button.isVisible() && await button.getAttribute('aria-pressed') !== 'true') await button.click(); };
    const cdp = touch ? await page.context().newCDPSession(page) : null;
    const pointer = async (type, x, y) => {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd', cancel: 'touchCancel' }[type], touchPoints: type === 'up' || type === 'cancel' ? [] : [{ x, y, id: 1 }] });
      else if (type === 'down') { await page.mouse.move(x, y); await page.mouse.down(); }
      else if (type === 'move') await page.mouse.move(x, y, { steps: 6 });
      else if (type === 'cancel') { await page.locator('#overlay').evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))); await page.mouse.up(); }
      else await page.mouse.up();
    };
    const cleanup = async () => { await page.waitForFunction(() => !window.equipmentDragGame.ui.sharedStashScreen.busy); await expect(page.locator('.item-drag-ghost,.item-drag-hint,.drag-storage-dock,.item-drop-preview,.item-swap-preview,.gear-slot.is-dragging')).toHaveCount(0); };
    const start = async slot => {
      await pane(await page.locator('.panel-shared-stash').count() ? 'shared' : 'inventory', 'equipment');
      const source = page.locator(`#overlay [data-equipment-slot="${slot}"]`); await source.scrollIntoViewIfNeeded();
      const rect = await source.boundingBox(); await pointer('down', rect.x + rect.width * .2, rect.y + rect.height * .2);
      await pointer('move', rect.x + rect.width * .2 + 10, rect.y + rect.height * .2 + 10);
      await expect(page.locator('.drag-storage-dock')).toBeVisible();
    };
    const target = async (selector, valid) => {
      const node = page.locator(selector), rect = await node.boundingBox(); assert.ok(rect && rect.width > 0, selector);
      await pointer('move', rect.x + rect.width / 2, rect.y + rect.height / 2); await expect(node).toHaveAttribute('data-drop-valid', String(valid));
      await expect(page.locator('.item-drag-hint')).toBeVisible();
    };
    const slotDrop = async (from, to, valid = true) => { await start(from); await target(`#overlay [data-equipment-slot="${to}"]`, valid); if (valid) await page.screenshot({ path: `${output}/rings-${viewport.width}.png` }); await pointer('up'); await cleanup(); };
    const storageDrop = async (slot, container, valid = true) => { await start(slot); await target(`[data-drop-container="${container}"]`, valid); if (valid) await page.screenshot({ path: `${output}/${container}-${viewport.width}.png` }); await pointer('up'); await cleanup(); };
    const gridDrop = async (slot, container, x, y, valid = true) => {
      await start(slot);
      const grid = page.locator(`.diablo-grid[data-container="${container}"]`), rect = await grid.boundingBox(); assert.ok(rect && rect.width > 0);
      const cell = await grid.evaluate(el => ({ w: el.clientWidth / 10, h: el.clientHeight / Number(el.dataset.rows) }));
      await pointer('move', rect.x + (x + .5) * cell.w, rect.y + (y + .5) * cell.h);
      await expect(page.locator('.item-drop-preview')).toHaveAttribute('data-valid', String(valid));
      if (valid) await page.screenshot({ path: `${output}/${container}-exact-${viewport.width}.png` });
      await pointer('up'); await cleanup();
    };
    await page.keyboard.press('i'); let before = await state();
    await slotDrop('weapon', 'helm', false); assert.deepEqual(await state(), before);
    await start('weapon'); await target('[data-drop-container="stash"]', true); await page.keyboard.press('Escape'); await pointer('up'); await cleanup(); assert.deepEqual(await state(), before);
    await start('weapon'); await target('[data-drop-container="stash"]', true); await pointer('cancel'); await cleanup(); assert.deepEqual(await state(), before);
    await start('weapon'); await target('[data-drop-container="stash"]', true); await page.keyboard.press('c'); await pointer('up'); await cleanup(); assert.deepEqual(await state(), before); await page.keyboard.press('i');
    if (exactGrid) { await gridDrop('weapon', 'inventory', 1, 0, false); assert.deepEqual(await state(), before); await gridDrop('weapon', 'inventory', 9, 1, false); assert.deepEqual(await state(), before); await gridDrop('weapon', 'inventory', 8, 1); }
    else await storageDrop('weapon', 'inventory');
    let current = await state(); assert.equal(current.hero.equipment.weapon, null);
    const stored = current.hero.inventory.find(item => item.id === hero.equipment.weapon.id); assert.ok(stored);
    if (exactGrid) assert.deepEqual({ x: stored.x, y: stored.y }, { x: 8, y: 1 });
    await page.evaluate(id => window.equipmentDragGame.equip(id, 'weapon'), hero.equipment.weapon.id);

    await page.evaluate(items => { const g = window.equipmentDragGame; g.hero.inventory = items; g.save(false); g.ui.renderPanel(); }, full);
    before = await state(); await storageDrop('weapon', 'inventory', false); assert.deepEqual(await state(), before);
    await slotDrop('ring', 'ring2'); current = await state();
    assert.equal(current.hero.equipment.ring.id, 'right-ring'); assert.equal(current.hero.equipment.ring2.id, 'left-ring'); assert.deepEqual(current.hero.inventory, full);
    await slotDrop('ring2', 'ring'); assert.deepEqual((await state()).hero.equipment, before.hero.equipment);
    for (let i = 0; i < 3; i++) { await slotDrop('ring', 'ring2'); await slotDrop('ring2', 'ring'); }
    await storageDrop('ring2', 'stash'); assert.equal((await state()).hero.equipment.ring2, null);
    await slotDrop('ring', 'ring2'); assert.equal((await state()).hero.equipment.ring2.id, 'left-ring'); assert.equal((await state()).hero.equipment.ring, null);
    await slotDrop('ring2', 'ring');
    await storageDrop('weapon', 'stash'); assert.equal((await state()).hero.equipment.weapon, null); assert.deepEqual((await state()).hero.inventory, full);
    await page.evaluate(id => window.equipmentDragGame.equip(id, 'weapon'), hero.equipment.weapon.id);

    await page.keyboard.press('Escape');
    await page.evaluate(() => { const g = window.equipmentDragGame, p = g.world.sharedStash.position; g.position.set(p.x, 0, p.z); g.body.position.set(p.x, .5, p.z); g.useSharedStash(); });
    await expect(page.locator('.panel-shared-stash')).toBeVisible();
    before = await state();
    if (exactGrid && viewport.width > 1150) { await gridDrop('weapon', 'shared', 8, 7, false); assert.deepEqual(await state(), before); }
    await page.evaluate(() => { window.originalGearPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'shared') throw new DOMException('Full', 'QuotaExceededError'); return window.originalGearPut.call(this, value, key); }; });
    await storageDrop('weapon', 'shared'); await expect(page.locator('.shared-error')).toBeVisible(); assert.deepEqual(await state(), before, 'database failure leaves the equipment and shared grid intact');
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalGearPut; });
    if (exactGrid && viewport.width > 1150) await gridDrop('weapon', 'shared', 3, 6); else await storageDrop('weapon', 'shared');
    current = await state(); assert.equal(current.hero.equipment.weapon, null); assert.deepEqual(current.hero.inventory, full);
    assert.ok(current.shared.items.some(item => item.id === hero.equipment.weapon.id));
    if (exactGrid && viewport.width > 1150) { const entry = current.shared.items.find(item => item.id === hero.equipment.weapon.id); assert.deepEqual({ x: entry.x, y: entry.y }, { x: 3, y: 6 }); }
    await slotDrop('ring', 'ring2'); await slotDrop('ring2', 'ring');
    await storageDrop('shield', 'stash'); assert.equal((await state()).hero.equipment.shield, null);
    const expected = await state(); await page.reload(); await enter(); const reloaded = await state();
    assert.deepEqual(reloaded.hero.equipment, expected.hero.equipment); assert.deepEqual(reloaded.hero.inventory, expected.hero.inventory); assert.deepEqual(reloaded.hero.stash, expected.hero.stash); assert.deepEqual(reloaded.shared.items, expected.shared.items);
    const all = [...reloaded.hero.inventory, ...reloaded.hero.stash, ...Object.values(reloaded.hero.equipment), ...reloaded.shared.items].filter(Boolean);
    assert.equal(new Set(all.map(item => item.id)).size, all.length);
    for (const id of ['starter-sword', 'starter-shield', 'left-ring', 'right-ring']) assert.equal(all.filter(item => item.id === id).length, 1, id);
    await page.close(); console.log(`Equipment to inventory/private/shared storage, exact positions, ring exchanges, full bags, cancellation, rollback and reload passed: ${viewport.width}x${viewport.height}${touch ? ' (real touch)' : ''}`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${index}.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
