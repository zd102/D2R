import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave, stats } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { SHARED_STASH_KEY } from '../src/shared-stash.ts';

const output = '.verification/drag-exchange'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
const item = (slot, id, x, y) => ({ ...makeItem(BASES.find(base => base.slot === slot), id), x, y });
const region = prefix => [item('weapon', `${prefix}-large`, 0, 0), item('ring', `${prefix}-a`, 6, 0), item('ring', `${prefix}-b`, 7, 2), item('shield', `${prefix}-partial`, 4, 0)];
const positions = items => Object.fromEntries(items.map(({ id, x, y }) => [id, [x, y]]));
const hero = newHero(); hero.level = 99; hero.strength = hero.dexterity = 999;
hero.inventory = [...region('bag'), item('ring', 'right-ring', 8, 3), { ...item('ring', 'unidentified', 9, 3), identified: false }];
hero.stash = [{ ...makeItem(BASES.find(base => base.twoHanded), 'two-hander'), x: 0, y: 0 }, item('armor', 'stash-armor', 3, 0)];
hero.hp = stats(hero).maxHp;
const sharedItems = region('shared');

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const touch = viewport.width === 390;
    const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch }); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.dragGame = game;') }); });
    await page.addInitScript(({ save, key, items }) => {
      if (sessionStorage.getItem('exchange-seeded')) return;
      localStorage.setItem('eclipse-ii-save-v1', save);
      localStorage.setItem(key, JSON.stringify({ version: 1, revision: 0, checkpoints: {}, items }));
      sessionStorage.setItem('exchange-seeded', 'yes');
    }, { save: serializeSave(hero), key: SHARED_STASH_KEY, items: sharedItems });
    const enter = async () => { await page.getByRole('button', { name: '进入旅程', exact: true }).click(); await page.waitForFunction(() => window.dragGame && !window.dragGame.paused); await page.evaluate(() => cancelAnimationFrame(window.dragGame.frameId)); };
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173'); await enter();
    const state = () => page.evaluate(() => ({ hero: structuredClone(window.dragGame.hero), shared: window.dragGame.saves.readShared(), revision: window.dragGame.profile.revision }));
    const pane = async (kind, value) => { const button = page.locator(`button[data-${kind}-pane="${value}"]`); if (await button.isVisible() && await button.getAttribute('aria-pressed') !== 'true') await button.click(); };
    const cdp = touch ? await page.context().newCDPSession(page) : null;
    const hintFits = async () => {
      await expect(page.locator('.item-drag-hint')).toBeVisible();
      assert.ok(await page.locator('.item-drag-hint').evaluate(el => { const r = el.getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 'drag hint stays inside the viewport');
    };
    const pointer = async (type, x, y) => {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[type], touchPoints: type === 'up' ? [] : [{ x, y, id: 1 }] });
      else if (type === 'down') { await page.mouse.move(x, y); await page.mouse.down(); }
      else if (type === 'move') await page.mouse.move(x, y, { steps: 6 });
      else await page.mouse.up();
    };
    const start = async (container, id) => {
      if (await page.locator('.panel-inventory').count()) await pane('inventory', 'items');
      else await pane('shared', container === 'shared' ? 'shared' : 'personal');
      const grid = page.locator(`.diablo-grid[data-container="${container}"]`), source = grid.locator(`.bag-item[data-item="${id}"],.bag-item[data-shared-item="${id}"]`);
      await source.scrollIntoViewIfNeeded();
      const rect = await source.boundingBox(), cell = await grid.evaluate(el => ({ w: el.clientWidth / 10, h: el.clientHeight / Number(el.dataset.rows) }));
      const x = rect.x + cell.w / 2, y = rect.y + cell.h / 2;
      await pointer('down', x, y); await pointer('move', x + 8, y + 8); return { grid, cell };
    };
    const dropRegion = async (container, id, x, y, valid, count = 0) => {
      const { grid, cell } = await start(container, id), rect = await grid.boundingBox();
      await pointer('move', rect.x + (x + .5) * cell.w, rect.y + (y + .5) * cell.h);
      await expect(page.locator('.item-drop-preview')).toHaveAttribute('data-valid', String(valid));
      if (valid && count) {
        await expect(page.locator('.item-swap-preview')).toBeVisible();
        await expect(page.locator('.item-drag-ghost')).toHaveAttribute('data-hint', `交换 ${count} 件物品`);
        await expect(page.locator('.item-drag-hint')).toHaveText(`交换 ${count} 件物品`); await hintFits();
        await page.screenshot({ path: `${output}/${container}-swap-${viewport.width}.png` });
      }
      await pointer('up'); await page.waitForFunction(() => !window.dragGame.ui.sharedStashScreen.busy);
      await expect(page.locator('.item-drag-ghost,.item-drag-hint,.drag-equipment-dock')).toHaveCount(0);
    };
    const dropSlot = async (container, id, slot, valid) => {
      await start(container, id);
      const dock = await page.locator('.drag-equipment-dock').count();
      const target = page.locator(`${dock ? '.drag-equipment-dock' : '#overlay'} [data-equipment-slot="${slot}"]`);
      const rect = await target.boundingBox(); assert.ok(rect && rect.width > 0);
      await pointer('move', rect.x + rect.width / 2, rect.y + rect.height / 2);
      await expect(target).toHaveAttribute('data-drop-valid', String(valid));
      await hintFits();
      if (valid) await page.screenshot({ path: `${output}/${container}-equip-${slot}-${viewport.width}.png` });
      await pointer('up'); await page.waitForFunction(() => !window.dragGame.ui.sharedStashScreen.busy);
      await expect(page.locator('.item-drag-ghost,.item-drag-hint,.drag-equipment-dock')).toHaveCount(0);
    };
    await page.keyboard.press('i');
    let before = await state();
    await dropRegion('inventory', 'bag-large', 3, 0, false); assert.deepEqual(await state(), before, 'partial items prevent the entire swap without saving');
    await dropRegion('inventory', 'bag-large', 6, 0, true, 2);
    assert.deepEqual(positions((await state()).hero.inventory), { ...positions(hero.inventory), 'bag-large': [6, 0], 'bag-a': [0, 0], 'bag-b': [1, 2] });
    await dropRegion('inventory', 'bag-large', 0, 0, true, 2); assert.deepEqual((await state()).hero.inventory, hero.inventory, 'swapping back preserves every item property and relative position');
    before = await state(); await dropSlot('inventory', 'bag-large', 'armor', false); assert.deepEqual(await state(), before, 'wrong equipment slot does not mutate or save');
    await dropSlot('inventory', 'unidentified', 'ring2', false); assert.deepEqual(await state(), before, 'unidentified equipment stays in place');
    await dropSlot('inventory', 'right-ring', 'ring2', true); assert.equal((await state()).hero.equipment.ring2.id, 'right-ring', 'an empty disabled slot accepts a drop, including real touch');
    const oldWeapon = (await state()).hero.equipment.weapon.id;
    await dropSlot('inventory', 'bag-large', 'weapon', true); assert.equal((await state()).hero.equipment.weapon.id, 'bag-large'); assert.ok((await state()).hero.inventory.some(item => item.id === oldWeapon));

    // A full backpack must not prevent equipment coming directly from the private stash.
    const fullBag = Array.from({ length: 40 }, (_, i) => item('ring', `full-${i}`, i % 10, Math.floor(i / 10))); assert.ok(placeItems(fullBag));
    await page.evaluate(items => { const g = window.dragGame; g.hero.inventory = items; g.save(false); g.ui.renderPanel(); }, fullBag);
    await pane('inventory', 'items'); await page.locator('[data-bag-view="stash"]').click();
    const oldShield = (await state()).hero.equipment.shield.id;
    await dropSlot('stash', 'two-hander', 'weapon', true);
    let saved = await state(); assert.equal(saved.hero.equipment.weapon.id, 'two-hander'); assert.equal(saved.hero.equipment.shield, null); assert.deepEqual(saved.hero.inventory, fullBag);
    assert.ok(saved.hero.stash.some(item => item.id === 'bag-large') && saved.hero.stash.some(item => item.id === oldShield), 'both displaced hand slots return to the source stash');

    await page.keyboard.press('Escape');
    const openShared = async () => { await page.evaluate(() => { const g = window.dragGame, p = g.world.sharedStash.position; g.position.set(p.x, 0, p.z); g.body.position.set(p.x, .5, p.z); g.useSharedStash(); }); await expect(page.locator('.panel-shared-stash')).toBeVisible(); };
    await openShared();
    before = await state(); await dropRegion('shared', 'shared-large', 3, 0, false); assert.deepEqual(await state(), before);
    // Simulate an actual database failure on release; both regions must retain their positions.
    await page.evaluate(() => { window.originalExchangePut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'shared') throw new DOMException('Full', 'QuotaExceededError'); return window.originalExchangePut.call(this, value, key); }; });
    await dropRegion('shared', 'shared-large', 6, 0, true, 2); await expect(page.locator('.shared-error')).toBeVisible(); assert.deepEqual(await state(), before);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalExchangePut; });
    await dropRegion('shared', 'shared-large', 6, 0, true, 2);
    assert.deepEqual(positions((await state()).shared.items), { ...positions(sharedItems), 'shared-large': [6, 0], 'shared-a': [0, 0], 'shared-b': [1, 2] });
    await dropSlot('shared', 'shared-large', 'weapon', true);
    saved = await state(); assert.equal(saved.hero.equipment.weapon.id, 'shared-large'); assert.ok(saved.shared.items.some(item => item.id === 'two-hander')); assert.deepEqual(saved.hero.inventory, fullBag);
    // Personal items can also be dragged while the shared warehouse is open.
    await pane('shared', 'personal'); await page.locator('[data-shared-view="stash"]').click();
    await dropSlot('stash', 'stash-armor', 'armor', true); assert.equal((await state()).hero.equipment.armor.id, 'stash-armor');
    const expected = await state(); await page.reload(); await enter(); const reloaded = await state();
    assert.deepEqual(reloaded.hero.equipment, expected.hero.equipment); assert.deepEqual(reloaded.hero.stash, expected.hero.stash); assert.deepEqual(reloaded.hero.inventory, fullBag); assert.deepEqual(reloaded.shared.items, expected.shared.items);
    const all = [...reloaded.hero.inventory, ...reloaded.hero.stash, ...Object.values(reloaded.hero.equipment), ...Object.values(reloaded.hero.alternate), ...reloaded.shared.items].filter(Boolean);
    assert.equal(new Set(all.map(item => item.id)).size, all.length, 'no item duplicated across storage and equipment');
    await page.close(); console.log(`Region exchange, invalid drop, direct equip, two-hand replacement, full bag, shared rollback and reload passed: ${viewport.width}x${viewport.height}${touch ? ' (real touch)' : ''}`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure-${index}.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
