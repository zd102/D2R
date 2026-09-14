import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const width of [1440, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch(); const body = await response.text();
      assert.ok(body.includes('const game = new Game();'));
      await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.potionGame = game;') });
    });
    const hero = newHero(); hero.gold = 1000;
    await page.addInitScript(save => { localStorage.setItem('eclipse-ii-save-v1', save); }, serializeSave(hero));
    await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5173'}?mode=local`);
    await page.getByRole('button', { name: '进入旅程', exact: true }).click();
    await page.waitForFunction(() => window.potionGame && !window.potionGame.paused);
    await page.evaluate(() => { const g = window.potionGame; cancelAnimationFrame(g.frameId); g.ui.togglePanel('shop'); });
    for (const index of [2, 3, 4]) await page.locator(`[data-buy="${index}"]`).click();
    assert.deepEqual(await page.evaluate(() => ({ gold: window.potionGame.hero.gold, potions: window.potionGame.hero.potions })), { gold: 910, potions: [6, 4, 1, 1, 1] });
    await page.evaluate(() => { window.potionGame.ui.closePanel(); window.potionGame.ui.update(); });
    for (const index of [2, 3, 4]) {
      await expect(page.locator(`#utility-potions-${index}`)).toHaveText('1');
      await expect(page.locator(`.potion-group [data-potion="${index}"]`)).toBeEnabled();
    }
    assert.equal(await page.locator('.action-row button').evaluateAll(buttons => buttons.every(button => {
      const r = button.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })), true, 'all belt buttons fit and remain clickable');
    await page.evaluate(() => { const g = window.potionGame; g.hero.poison = g.hero.cold = 6; g.hero.stamina = 0; g.ui.togglePanel('inventory'); });
    for (const index of [2, 3, 4]) {
      const button = page.locator(`.utility-potions [data-potion="${index}"]`);
      await expect(button).toBeVisible(); await button.click(); await expect(button).toBeDisabled();
      assert.ok((await button.boundingBox()).height <= 32, 'inventory potion stays compact');
      await page.evaluate(() => window.potionGame.ui.update());
      await expect(page.locator(`#utility-potions-${index}`)).toHaveText('0');
      await expect(page.locator(`.potion-group [data-potion="${index}"]`)).toBeDisabled();
    }
    const used = await page.evaluate(async () => {
      const g = window.potionGame, { stats } = await import('/src/model.ts');
      return { timers: g.hero.potionTimers, poison: g.hero.poison, cold: g.hero.cold, stamina: g.hero.stamina, maxStamina: stats(g.hero).maxStamina, resistance: stats(g.hero).resistances.poison };
    });
    assert.deepEqual(used.timers, [30, 30, 30]); assert.equal(used.poison, 0); assert.equal(used.cold, 0); assert.equal(used.stamina, used.maxStamina); assert.equal(used.resistance, 50);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(async () => {
      const g = window.potionGame, { Group } = await import('/node_modules/three/build/three.module.js');
      g.ui.closePanel();
      for (const potion of [2, 3, 4]) {
        const loot = { id: g.nextId++, x: g.position.x, z: g.position.z, potion, mesh: new Group() };
        g.addLoot(loot); g.collectLoot(loot);
      }
    });
    for (const key of ['3', '4', '5']) await page.keyboard.press(key);
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potionTimers), [60, 60, 60]);
    await page.evaluate(() => { const g = window.potionGame; g.hero.potions.splice(2, 3, 2, 2, 2); g.ui.update(); });
    for (const index of [2, 3, 4]) {
      await page.locator(`.potion-group [data-potion="${index}"]`).click();
      await page.evaluate(() => window.potionGame.ui.update());
      await expect(page.locator(`#utility-potions-${index}`)).toHaveText('1');
    }
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potionTimers), [90, 90, 90]);
    const running = await page.evaluate(async () => {
      const g = window.potionGame, { stats } = await import('/src/model.ts');
      g.combat.moving = true; g.hero.running = true; g.combat.update(1); g.ui.update();
      const protectedStamina = g.hero.stamina;
      g.hero.potionTimers = [0, 0, 0]; g.combat.update(1);
      return { protectedStamina, max: stats(g.hero).maxStamina, drained: g.hero.stamina };
    });
    assert.equal(running.protectedStamina, running.max); assert.ok(running.drained < running.max);
    const capacity = await page.evaluate(async () => {
      const g = window.potionGame, { Group } = await import('/node_modules/three/build/three.module.js');
      g.hero.potions[3] = 99;
      const gold = g.hero.gold, loot = { id: g.nextId++, x: g.position.x, z: g.position.z, potion: 3, mesh: new Group() };
      g.addLoot(loot); g.collectLoot(loot); g.buy(3);
      return { count: g.hero.potions[3], retained: g.loot.includes(loot), unchangedGold: g.hero.gold === gold };
    });
    assert.deepEqual(capacity, { count: 99, retained: true, unchangedGold: true });
    await page.evaluate(() => { const g = window.potionGame; g.hero.gold = 0; g.ui.togglePanel('shop'); });
    for (const index of [2, 3, 4]) await expect(page.locator(`[data-buy="${index}"]`)).toBeDisabled();
    await page.close(); console.log(`Utility potion purchase, pickup, inventory use, hotkeys and stamina passed at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
