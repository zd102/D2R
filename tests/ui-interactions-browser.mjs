import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { newHero, gainXp, learnSkill, stats, serializeSave } from '../src/model.ts';
import { BASES, makeItem, specialItem, SPECIAL_ITEMS, RUNE_ORDER, placeItems } from '../src/items.ts';
import { skillsForClass, EXPERIENCE } from '../src/paladin.ts';

const output = process.env.OUTPUT_DIR || '.verification/ui-interactions';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), errors = [], statusLayouts = [];
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch(), body = await response.text();
      await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.uiGame = game;') });
    });
    const hero = newHero(); gainXp(hero, EXPERIENCE[98]);
    for (const skill of skillsForClass('paladin')) learnSkill(hero, skill.id);
    hero.strength = hero.dexterity = 999; hero.gold = 999999; hero.runes = [...RUNE_ORDER, 'el', 'el'];
    const detailed = [...SPECIAL_ITEMS].sort((a, b) => Object.keys(b.mods).length - Object.keys(a.mods).length)[0];
    hero.inventory = [{ ...specialItem(detailed.name, () => .8), id: 'ui-detailed', identified: true }, makeItem(BASES.find(b => b.baseCode === 'rin'), 'ui-ring'), { ...makeItem(BASES.find(b => b.baseCode === 'crs'), 'ui-unidentified'), rarity: 'rare', identified: false }];
    assert.ok(placeItems(hero.inventory)); hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
    await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.uiGame && !window.uiGame.paused);
    await page.evaluate(() => cancelAnimationFrame(window.uiGame.frameId));
    const paint = () => page.evaluate(() => window.uiGame.ui.update(0));
    const chooseItems = async () => { const button = page.locator('button[data-inventory-pane="items"]'); if (await button.isVisible()) await button.click(); };
    const chooseShared = async side => { const button = page.locator(`[data-shared-pane="${side}"]`); if (await button.isVisible()) await button.click(); };
    const clickability = async selector => {
      assert.deepEqual(await page.locator(selector).evaluateAll(nodes => nodes.filter(node => !node.disabled && node.getClientRects().length).filter(node => {
        const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth || !node.contains(target);
      }).map(node => node.textContent.trim())), [], `unobstructed actions at ${viewport.width}`);
    };
    await page.keyboard.press('i');
    const equipmentPane = page.locator('button[data-inventory-pane="equipment"]');
    if (await equipmentPane.isVisible()) {
      await equipmentPane.click(); await expect(page.locator('.gear-weapon')).toBeVisible();
      await clickability('.gear-slot,.equipment-heading button'); await chooseItems();
    }
    await page.locator('[data-item="ui-detailed"]').click();
    await clickability('.item-actions button');
    await page.locator('[data-item-tab="overview"]').click(); await expect(page.locator('.item-basics')).toBeVisible();
    await page.locator('[data-item-tab="affixes"]').click();
    assert.ok(await page.locator('.item-affixes li:visible').count() <= 6);
    const firstAffixes = await page.locator('.item-affixes li:visible').allTextContents();
    await page.locator('[data-affix-page="1"]').click();
    assert.notDeepEqual(await page.locator('.item-affixes li:visible').allTextContents(), firstAffixes);
    await page.locator('[data-affix-ranges]').check();
    await page.screenshot({ path: `${output}/item-details-${viewport.width}.png` });
    await page.locator('[data-equip="ui-detailed"]').click();
    assert.equal(await page.evaluate(() => window.uiGame.hero.equipment.weapon.id), 'ui-detailed');
    await clickability('.item-actions button'); await page.locator('[data-unequip="weapon"]').click();
    await page.locator('[data-stash="ui-detailed"]').click();
    assert.ok(await page.evaluate(() => window.uiGame.hero.stash.some(item => item.id === 'ui-detailed')));
    await page.locator('[data-withdraw="ui-detailed"]').click();
    assert.ok(await page.evaluate(() => window.uiGame.hero.inventory.some(item => item.id === 'ui-detailed')));
    await chooseItems(); await page.locator('[data-item="ui-unidentified"]').click();
    await clickability('.item-actions button');
    await expect(page.locator('.item-actions [data-identify="ui-unidentified"]')).toBeVisible();
    await page.locator('[data-identify="ui-unidentified"]').click();
    assert.ok(await page.evaluate(() => window.uiGame.hero.inventory.find(item => item.id === 'ui-unidentified').identified));
    await chooseItems(); await page.locator('[data-bag-view="runes"]').click();
    await page.locator('[data-upgrade-rune="el"]').click();
    assert.equal(await page.evaluate(() => window.uiGame.hero.runes.filter(id => id === 'el').length), 0);
    if (await page.locator('button[data-rune-pane="recipes"]').isVisible()) await page.locator('button[data-rune-pane="recipes"]').click();
    assert.equal(await page.locator('.runeword-list > div:visible').count(), 4);
    const recipe = await page.locator('.runeword-list > div:visible strong').first().textContent();
    await page.locator('[data-recipe-page="1"]').click();
    assert.notEqual(await page.locator('.runeword-list > div:visible strong').first().textContent(), recipe);
    await clickability('.recipe-pagination button');
    await page.screenshot({ path: `${output}/recipes-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const g = window.uiGame, point = g.world.sharedStash.position;
      g.position.set(point.x, 0, point.z); g.body.position.set(point.x, .5, point.z); g.useSharedStash();
    });
    await chooseShared('personal'); await page.locator('[data-shared-side="personal"][data-shared-item="ui-ring"]').click();
    await clickability('.shared-actions button'); await page.locator('[data-shared-transfer="inventory"]').click();
    await page.waitForFunction(() => !window.uiGame.ui.sharedStashScreen.busy);
    await chooseShared('shared'); await page.locator('[data-shared-side="shared"][data-shared-item="ui-ring"]').click();
    await clickability('.shared-actions button');
    await page.screenshot({ path: `${output}/shared-details-${viewport.width}.png` });
    await page.locator('[data-shared-transfer="inventory"]').click();
    await page.waitForFunction(() => window.uiGame.hero.inventory.some(item => item.id === 'ui-ring'));
    await page.keyboard.press('Escape'); await page.keyboard.press('t');
    if (viewport.width <= 700) {
      await page.locator('[data-select-skill="holyBolt"]').click();
      await expect(page.locator('.skill-inspector')).toBeVisible();
      await expect(page.locator('.skill-tree')).toBeHidden();
      await page.locator('button[data-skill-pane="bindings"]').click();
    }
    await page.locator('[data-binding="cleave"]').selectOption('holyBolt');
    await clickability('.panel-header button');
    await page.keyboard.press('Escape'); await page.keyboard.press('c');
    if (viewport.width <= 700) {
      await page.locator('button[data-sheet-tab="combat"]').click();
      await expect(page.locator('.breakpoint-list')).toBeVisible();
      await page.locator('button[data-sheet-tab="attributes"]').click();
    }
    const strength = await page.evaluate(() => window.uiGame.hero.strength);
    await page.locator('[data-allocate="strength"]').first().click();
    assert.equal(await page.evaluate(() => window.uiGame.hero.strength), strength + 1);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const g = window.uiGame;
      g.hero.holyShield = 60; g.hero.holyShieldLevel = 1; g.hero.activeAura = 'prayer';
      g.hero.poison = 8; g.hero.curse = 12; g.hero.cold = 4; g.ui.update(0);
    });
    await expect(page.locator('[data-status="holyShield"]')).toBeVisible();
    for (const id of ['poison', 'curse', 'cold']) await expect(page.locator(`[data-status="${id}"]`)).toBeVisible();
    await page.locator('[data-status="curse"]').hover();
    await expect(page.locator('#ui-tooltip')).toContainText('受到的物理伤害提高');
    assert.ok(await page.locator('#ui-tooltip').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    await page.mouse.move(650, 450); await paint();
    statusLayouts.push(await page.evaluate(() => {
      const root = document.getElementById('combat-status').getBoundingClientRect();
      const overlaps = [...document.querySelectorAll('.hud,.world-info,.topbar,#boss-bar,#joystick,#mobile-attack')].filter(node => node.getClientRects().length).filter(node => { const r = node.getBoundingClientRect(); return root.right > r.left && root.left < r.right && root.bottom > r.top && root.top < r.bottom; }).map(node => node.id || node.className);
      return { width: innerWidth, height: innerHeight, overlaps };
    }));
    await page.screenshot({ path: `${output}/buffs-debuffs-${viewport.width}.png` });
    await page.evaluate(() => { const g = window.uiGame; g.combat.update(3); g.ui.update(0); });
    await expect(page.locator('[data-status="poison"] b')).toHaveText('5秒');
    await page.evaluate(() => { const g = window.uiGame; g.combat.update(6); g.ui.update(0); });
    await expect(page.locator('[data-status="poison"]')).toHaveCount(0);
    await expect(page.locator('[data-status="holyShield"]')).toBeVisible();
    await page.evaluate(async () => {
      const g = window.uiGame, { newHero, stats } = await import('/src/model.ts');
      g.hero = newHero('sorceress'); g.hero.level = 99; g.hero.energy = 999;
      for (const id of ['frozenArmor', 'enchant', 'energyShield', 'blaze', 'thunderStorm']) g.hero.skills[id] = 20;
      g.hero.mana = stats(g.hero).maxMana; g.loadArea(true);
      for (const id of ['frozenArmor', 'enchant', 'energyShield', 'blaze', 'thunderStorm']) if (!g.combat.castAction(id)) throw new Error(`Cannot apply buff ${id}`);
      g.hero.poison = 8; g.hero.cold = 4; g.hero.curse = 12; g.ui.update(0);
    });
    await expect(page.locator('.status-chip')).toHaveCount(8);
    const stress = await page.evaluate(() => {
      const root = document.getElementById('combat-status').getBoundingClientRect();
      const overlaps = [...document.querySelectorAll('.hud,.world-info,.topbar,#boss-bar,#joystick,#mobile-attack')].filter(node => node.getClientRects().length).filter(node => { const r = node.getBoundingClientRect(); return root.right > r.left && root.left < r.right && root.bottom > r.top && root.top < r.bottom; }).map(node => node.id || node.className);
      return { width: innerWidth, height: innerHeight, overlaps, classId: 'sorceress' };
    });
    statusLayouts.push(stress);
    await page.screenshot({ path: `${output}/sorceress-statuses-${viewport.width}.png` });
    await page.keyboard.press('Escape'); await paint(); await expect(page.locator('#combat-status')).toBeHidden();
    await page.close();
  }
  await writeFile(`${output}/status-layouts.json`, JSON.stringify(statusLayouts, null, 2));
  assert.ok(statusLayouts.every(layout => !layout.overlaps.length), JSON.stringify(statusLayouts));
  assert.deepEqual(errors, []);
  console.log('Item tabs/pages, equipment, rune upgrades, shared transfers, mobile panes, skill bindings, stat allocation, buff/debuff timers and tooltips passed', statusLayouts);
} finally { await browser.close(); }
