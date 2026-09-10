import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave, stats } from '../src/model.ts';
import { BASES, makeItem, specialItem, SPECIAL_ITEMS, placeItems } from '../src/items.ts';
import { itemModifierLines } from '../src/item-description.ts';

const output = '.verification/storage-equipment'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport }); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.storageGame = game;') }); });
    const hero = newHero(); hero.level = 99; hero.strength = hero.dexterity = 999;
    const item = { ...specialItem([...SPECIAL_ITEMS].sort((a, b) => Object.keys(b.mods).length - Object.keys(a.mods).length)[0].name, () => .8), id: 'warehouse-gear', identified: true };
    hero.stash = [item]; hero.inventory = Array.from({ length: 40 }, (_, i) => makeItem(BASES.find(base => base.baseCode === 'rin'), `full-${i}`));
    assert.ok(placeItems(hero.inventory)); assert.ok(placeItems(hero.stash, 10)); hero.hp = stats(hero).maxHp;
    const backpack = structuredClone(hero.inventory);
    await page.addInitScript(save => { if (!sessionStorage.getItem('warehouse-seeded')) { localStorage.setItem('eclipse-ii-save-v1', save); sessionStorage.setItem('warehouse-seeded', 'yes'); } }, serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.storageGame && !window.storageGame.paused);
    await page.evaluate(() => cancelAnimationFrame(window.storageGame.frameId));
    const state = () => page.evaluate(() => structuredClone(window.storageGame.hero));
    const pane = async (kind, value) => { const button = page.locator(`button[data-${kind}-pane="${value}"]`); if (await button.isVisible()) await button.click(); };
    const actionsFit = async () => assert.deepEqual(await page.locator('.item-actions button,.shared-actions button').evaluateAll(nodes => nodes.filter(node => !node.disabled && node.getClientRects().length).filter(node => { const r = node.getBoundingClientRect(); return !node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }).map(node => node.textContent)), []);
    await page.keyboard.press('i'); await page.locator('[data-bag-view="stash"]').click(); await page.locator('[data-item="warehouse-gear"]').click();
    await expect(page.locator('[data-item-tab],[data-affix-page]')).toHaveCount(0);
    assert.equal(await page.locator('.item-affixes li:visible').count(), itemModifierLines(item).length);
    await expect(page.locator('.item-basics')).toBeVisible(); await actionsFit();
    await page.screenshot({ path: `${output}/full-details-${viewport.width}.png` });
    await page.locator('[data-equip="warehouse-gear"]').click();
    assert.equal((await state()).equipment.weapon.id, item.id); assert.deepEqual((await state()).inventory, backpack);
    assert.ok((await state()).stash.some(item => item.id === hero.equipment.weapon.id));
    await pane('inventory', 'equipment'); await page.locator('.gear-slot[data-item="warehouse-gear"]').click();
    await actionsFit(); await page.locator('[data-unequip="weapon"][data-unequip-to="stash"]').click();
    assert.equal((await state()).equipment.weapon, null); assert.ok((await state()).stash.some(item => item.id === 'warehouse-gear'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const g = window.storageGame, point = g.world.sharedStash.position; g.position.set(point.x, 0, point.z); g.body.position.set(point.x, .5, point.z); g.useSharedStash(); });
    await pane('shared', 'personal'); await page.locator('[data-shared-view="stash"]').click();
    await page.locator('[data-shared-side="personal"][data-shared-item="warehouse-gear"]').click();
    await page.locator('[data-shared-transfer="stash"]').click(); await page.waitForFunction(() => !window.storageGame.ui.sharedStashScreen.busy);
    await pane('shared', 'shared'); await page.locator('[data-shared-side="shared"][data-shared-item="warehouse-gear"]').click();
    assert.equal(await page.locator('.item-affixes li:visible').count(), itemModifierLines(item).length);
    await actionsFit(); await page.locator('[data-shared-equip="warehouse-gear"]').click(); await page.waitForFunction(() => !window.storageGame.ui.sharedStashScreen.busy);
    assert.equal((await state()).equipment.weapon.id, item.id); assert.deepEqual((await state()).inventory, backpack);
    await pane('shared', 'equipment'); await page.locator('.gear-slot[data-shared-item="warehouse-gear"]').click();
    await actionsFit(); await page.screenshot({ path: `${output}/shared-loadout-${viewport.width}.png` });
    await page.locator('[data-shared-unequip="weapon"]').click(); await page.waitForFunction(() => !window.storageGame.ui.sharedStashScreen.busy);
    assert.equal((await state()).equipment.weapon, null);
    await pane('shared', 'shared'); await page.locator('[data-shared-side="shared"][data-shared-item="warehouse-gear"]').click();
    await page.locator('[data-shared-equip="warehouse-gear"]').click(); await page.waitForFunction(() => !window.storageGame.ui.sharedStashScreen.busy);
    await page.reload(); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.storageGame && !window.storageGame.paused);
    assert.equal((await state()).equipment.weapon.id, item.id); assert.deepEqual((await state()).inventory, backpack);
    await page.close(); console.log(`Single-page attributes, full-backpack private/shared equip and unequip, equipment slots and reload passed: ${viewport.width}x${viewport.height}`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
