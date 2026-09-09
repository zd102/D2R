import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, stats, serializeSave } from '../src/model.ts';
import { enterGame, savedProfile } from './browser-helpers.mjs';

await mkdir('.verification', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); page.on('pageerror', error => errors.push(error.message));
const state = () => page.evaluate(() => window.eclipseState);
try {
  const hero = newHero(); hero.level = 60; hero.vitality = 300; hero.hp = stats(hero).maxHp; hero.strength = 100; hero.equipment.weapon.minDamage = hero.equipment.weapon.maxDamage = 1500;
  await page.addInitScript(save => { localStorage.setItem('eclipse-ii-save-v1', save); Math.random = () => .1; }, serializeSave(hero));
  await page.goto(base); await enterGame(page);
  for (let tries = 0; tries < 80 && (await state()).kills < 6; tries++) {
    const s = await state(), target = s.enemies.filter(enemy => !enemy.boss).sort((a, b) => Math.hypot(a.x - s.position.x, a.z - s.position.z) - Math.hypot(b.x - s.position.x, b.z - s.position.z))[0];
    if (target && target.screen.x > 120 && target.screen.x < 1180 && target.screen.y > 120 && target.screen.y < 730) await page.mouse.click(target.screen.x, target.screen.y);
    else {
      const next = s.objectives.find(point => point.kind === 'boss').route[0];
      assert.ok(next, 'A route to the next monster pack exists');
      const dx = next.screen.x - 720, dy = next.screen.y - 480, factor = Math.min(1, 320 / Math.max(1, Math.abs(dx)), 200 / Math.max(1, Math.abs(dy)));
      await page.mouse.click(720 + dx * factor, 480 + dy * factor);
    }
    await page.waitForTimeout(250);
  }
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1000); await page.keyboard.up('ArrowDown');
  const s = await state(); assert.ok(s.kills >= 6); assert.ok(s.loot.some(loot => loot.item)); assert.equal(s.inventory, 0, 'Combat and proximity never collect equipment');
  const distant = s.loot.filter(loot => loot.item && Math.hypot(loot.x - s.position.x, loot.z - s.position.z) > 3.5 && loot.screen.x > 180 && loot.screen.x < 1100 && loot.screen.y > 160 && loot.screen.y < 690)[0];
  assert.ok(distant, 'A distant equipment label is available');
  const rects = await page.locator('.loot-label:visible').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(rects[i].right <= rects[j].left || rects[j].right <= rects[i].left || rects[i].bottom <= rects[j].top || rects[j].bottom <= rects[i].top, 'Equipment labels do not overlap');
  await page.locator(`[data-loot="${distant.id}"]`).click();
  await page.waitForFunction(id => !window.eclipseState.loot.some(loot => loot.id === id), distant.id);
  assert.equal((await state()).inventory, 1, 'A distant click collects only the selected equipment');
  assert.equal((await savedProfile(page)).hero.inventory.length, 1);
  await page.screenshot({ path: '.verification/click-pickup-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await expect(page.locator('.loot-label:visible').first()).toBeVisible();
  const touchRect = await page.locator('.loot-label:visible').first().boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchRect.x + touchRect.width / 2, y: touchRect.y + touchRect.height / 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.eclipseState.inventory === 2);
  await page.screenshot({ path: '.verification/click-pickup-mobile.png' });

  // Exercise the actual game methods with a controlled world to cover rare movement/storage boundaries.
  const checks = await page.evaluate(async () => {
    const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts'), { BASES, makeItem, placeItems } = await import('/src/items.ts'), { LEVELS } = await import('/src/campaign.ts'), { makeRing } = await import('/src/world.ts');
    const resource = makeRing(.1, 0), position = resource.position; position.set(0, 0, 0);
    const notes = [], check = (condition, message) => { if (!condition) throw new Error(message); notes.push(message); };
    const game = { hero: newHero(), position, level: LEVELS[0], loot: [], path: [], paused: false, dead: false, pendingPickup: undefined, target: undefined, heldAttack: false, keys: new Set(), joystick: { set() {} }, body: { velocity: { set() {} } }, marker: { position: { set() {} } }, world: { path: (_from, to) => [to.clone()] }, ui: { toast() {}, floatText() {} }, audio: { play() {} }, begin() {}, save() {}, disposeObject() {}, combat: { cast() { return true; } } };
    for (const method of ['pickup', 'collectLoot', 'updateLootPickup', 'moveTo', 'releaseInput', 'useSkill', 'contextAction', 'interact']) game[method] = Game.prototype[method];
    const item = id => ({ id, x: id === 1 ? 0 : 8, z: 0, item: makeItem(BASES[0], `ground-${id}`), mesh: {} });
    game.loot = [item(1), item(2), { id: 3, x: 0, z: 0, rune: 'el' }, { id: 4, x: 0, z: 0, gold: 10 }, { id: 5, x: 0, z: 0, potion: 0 }];
    game.updateLootPickup(); check(game.loot.length === 2 && game.hero.inventory.length === 0, 'Touching equipment does not collect it');
    check(game.hero.gold === 10 && game.hero.runes[0] === 'el' && game.hero.potions[0] === 7, 'Gold, runes and potions keep auto pickup');
    game.loot.push({ id: 6, x: 2.5, z: 0, gold: 5 }); game.interact(); check(game.hero.gold === 15 && game.hero.inventory.length === 0, 'Bulk interaction excludes equipment');
    position.x = 8; game.updateLootPickup(); check(game.hero.inventory.length === 0, 'Walking onto another equipment item still does not collect it');
    game.pickup(1); check(game.pendingPickup === 1 && game.path.length === 1, 'A distant click queues the selected item');
    position.x = 4; game.updateLootPickup(); check(game.hero.inventory.length === 0, 'Queued pickup waits until within range');
    position.x = 2; game.updateLootPickup(); check(game.hero.inventory[0]?.id === 'ground-1' && game.loot[0].id === 2, 'Arrival collects only the selected item');
    game.pickup(2); game.releaseInput(); position.x = 8; game.updateLootPickup(); check(game.hero.inventory.length === 1 && game.loot.length === 1, 'Pausing or releasing input cancels queued pickup');
    position.x = 0; game.pickup(2); game.moveTo(position.clone().set(0, 0, 4)); check(game.pendingPickup === undefined, 'A new movement command cancels pickup');
    game.pickup(2); game.useSkill('attack'); check(game.pendingPickup === undefined && !game.path.length, 'A new attack cancels pickup');
    game.hero.inventory = Array.from({ length: 40 }, (_, id) => ({ ...makeItem(BASES.find(base => base.slot === 'ring'), `full-${id}`), width: 1, height: 1 })); placeItems(game.hero.inventory);
    game.pickup(2); check(game.pendingPickup === undefined && game.loot.length === 1 && game.hero.inventory.length === 40, 'Full backpack rejects a click without removing equipment');
    game.hero.inventory = []; game.pickup(2); game.hero.inventory = Array.from({ length: 40 }, (_, id) => ({ ...makeItem(BASES.find(base => base.slot === 'ring'), `filled-${id}`), width: 1, height: 1 })); position.x = 8; game.updateLootPickup();
    check(game.loot.length === 1 && game.pendingPickup === undefined, 'Capacity is checked again at arrival');
    game.hero.inventory = []; position.x = 0; game.world.path = () => []; game.pickup(2); check(game.pendingPickup === undefined && game.loot.length === 1, 'Unreachable loot stays on the ground');
    resource.geometry.dispose(); resource.material.dispose(); return notes;
  });
  console.log('Click pickup and boundary checks:', checks);
  assert.deepEqual(errors, []);
} catch (error) { console.log('Failure state:', JSON.stringify(await state())); await page.screenshot({ path: '.verification/loot-pickup-failure.png' }); throw error; }
finally { await browser.close(); }
