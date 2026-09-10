import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, gainXp, stats, serializeSave } from '../src/model.ts';
import { BASES, makeItem, specialItem, placeItems, RUNE_ORDER } from '../src/items.ts';
import { EXPERIENCE } from '../src/paladin.ts';
import { itemModifierLines } from '../src/item-description.ts';

const output = process.env.OUTPUT_DIR || '.verification/inventory-details';
await mkdir(output, { recursive: true });
const hero = newHero(); gainXp(hero, EXPERIENCE[98]);
hero.strength = hero.dexterity = 999; hero.gold = 99999; hero.runes = [...RUNE_ORDER, 'el', 'el'];
const detailed = { ...specialItem('青色忿怒', () => .8), id: 'hover-detailed', identified: true };
const hidden = { ...makeItem(BASES.find(base => base.baseCode === 'rin'), 'hover-hidden'), name: 'SECRET AFFIX NAME', rarity: 'rare', identified: false, mods: { strength: 99 } };
hero.inventory = [detailed, hidden]; assert.ok(placeItems(hero.inventory));
hero.stash = Array.from({ length: 40 }, (_, i) => makeItem(BASES.find(base => base.baseCode === 'qui'), `long-stash-${i}`));
assert.ok(placeItems(hero.stash, 60));
hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 800, height: 700 }, { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('const game = new Game();', 'const game = new Game(); window.inventoryGame = game;') });
    });
    await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.inventoryGame?.profile && !window.inventoryGame.paused);
    await page.evaluate(() => cancelAnimationFrame(window.inventoryGame.frameId));
    await page.keyboard.press('i');
    const nav = page.locator('.inventory-primary-tabs'), anchor = await nav.boundingBox();
    const gridWidth = await page.locator('.diablo-grid').evaluate(el => el.clientWidth);
    for (const view of ['stash', 'runes', 'inventory']) {
      await page.locator(`[data-bag-view=${view}]`).click();
      await expect(page.locator(`[data-bag-view=${view}]`)).toHaveAttribute('aria-selected', 'true');
      assert.deepEqual(await nav.boundingBox(), anchor, 'main navigation does not jump between inventory pages');
      await expect(page.locator('.inventory-footer .inventory-gold')).toBeVisible();
      if (view === 'stash') {
        if (viewport.width >= 961 && viewport.height > 580) assert.ok(Math.abs(await page.locator('.diablo-grid').evaluate(el => el.clientWidth) - gridWidth) <= 1, 'storage uses the same item scale as the backpack');
        assert.ok(await page.locator('.inventory-grid-scroll').evaluate(el => el.scrollHeight > el.clientHeight), 'long storage scrolls within its workspace');
      }
      if (view === 'runes') {
        await expect(page.locator('.inventory-pane-tabs')).toBeHidden();
        await expect(page.locator('[data-action=repair]')).toHaveCount(0);
        const overlap = await page.locator('.rune-entry').evaluateAll(nodes => nodes.filter(node => {
          const name = node.querySelector('strong').getBoundingClientRect(), count = node.querySelector('b').getBoundingClientRect();
          return node.querySelector('strong').scrollWidth > node.querySelector('strong').clientWidth + 1 || name.right > count.left + 1;
        }).map(node => node.dataset.rune));
        assert.deepEqual(overlap, [], 'rune names and quantities have their own space');
      }
      await page.screenshot({ path: `${output}/${view}-${viewport.width}.png` });
    }
    const item = page.locator('#overlay [data-item=hover-detailed]'), tooltip = page.locator('#ui-tooltip');
    const saved = await page.evaluate(() => JSON.stringify(window.inventoryGame.hero));
    await item.hover();
    await expect(tooltip.locator('h3')).toHaveText(detailed.name);
    await expect(tooltip).toContainText('需要等级');
    await expect(tooltip.locator('.item-affixes li')).toHaveCount(itemModifierLines(detailed).length);
    await expect(tooltip.locator('input,button,select')).toHaveCount(0);
    await expect(item).toHaveAttribute('aria-describedby', 'ui-tooltip');
    assert.ok(await tooltip.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 'full tooltip stays inside the viewport');
    assert.equal(await page.evaluate(() => JSON.stringify(window.inventoryGame.hero)), saved, 'hovering never changes equipment or save data');
    await tooltip.hover();
    if (await tooltip.evaluate(el => el.scrollHeight > el.clientHeight)) {
      await page.mouse.wheel(0, 180);
      await expect.poll(() => tooltip.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `${output}/hover-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(page.locator('.panel-inventory')).toBeHidden();
    await page.keyboard.press('i');
    await page.locator('#overlay [data-item=hover-hidden]').hover();
    await expect(tooltip).toContainText('未鉴定');
    await expect(tooltip).not.toContainText('SECRET');
    await expect(tooltip.locator('.item-affixes li')).toHaveCount(0);
    await page.mouse.move(2, 2);
    await expect(tooltip).toBeHidden();
    await page.keyboard.press('Tab');
    await item.focus();
    await expect(tooltip.locator('h3')).toHaveText(detailed.name);
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(page.locator('.panel-inventory')).toBeHidden();
    await page.keyboard.press('i');
    const equipment = page.locator('button[data-inventory-pane=equipment]');
    if (await equipment.isVisible()) await equipment.click();
    await page.locator('.gear-weapon [data-item]').hover();
    await expect(tooltip.locator('h3')).toHaveText(hero.equipment.weapon.name);
    await expect(tooltip).toContainText('单手伤害');
    if (viewport.width >= 961) {
      assert.ok(await page.locator('.paperdoll').evaluate(el => {
        const gear = el.getBoundingClientRect(), tip = document.getElementById('ui-tooltip').getBoundingClientRect();
        return tip.left >= gear.right || tip.right <= gear.left;
      }), 'equipment tooltip keeps adjacent equipment slots clear');
    }
    await page.evaluate(() => window.inventoryGame.ui.closePanel());
    await page.evaluate(() => {
      const g = window.inventoryGame, point = g.world.sharedStash.position;
      g.position.set(point.x, 0, point.z); g.body.position.set(point.x, .5, point.z); g.useSharedStash();
    });
    const personal = page.locator('button[data-shared-pane=personal]');
    if (await personal.isVisible()) await personal.click();
    await page.locator('[data-shared-side=personal][data-shared-item=hover-detailed]').hover();
    await expect(tooltip.locator('h3')).toHaveText(detailed.name);
    await page.evaluate(async () => {
      const g = window.inventoryGame;
      await g.ui.sharedStashScreen.transfer({ direction: 'deposit', itemId: 'hover-detailed', container: 'inventory' });
      g.ui.sharedStashScreen.pane = 'shared'; g.ui.renderPanel();
    });
    await page.locator('[data-shared-side=shared][data-shared-item=hover-detailed]').hover();
    await expect(tooltip.locator('h3')).toHaveText(detailed.name);
    await page.evaluate(() => window.inventoryGame.ui.closePanel());
    await expect(tooltip).toBeHidden();
    if (viewport.width === 1440) {
      const lootId = await page.evaluate(item => {
        const g = window.inventoryGame;
        g.dropLoot(g.position, 'actBoss', 99);
        const loot = g.loot.find(entry => entry.item);
        loot.item = item; g.ui.update(0);
        return loot.id;
      }, detailed);
      await page.locator(`[data-loot="${lootId}"]`).hover();
      await expect(tooltip.locator('h3')).toHaveText(detailed.name);
      await expect(tooltip.locator('.item-affixes li')).toHaveCount(itemModifierLines(detailed).length);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: stable inventory navigation, consistent grid scale, long storage, readable rune cards, complete read-only item hover, unidentified secrecy, keyboard dismissal and both sides of shared storage at six viewport sizes');
} finally { await browser.close(); }
