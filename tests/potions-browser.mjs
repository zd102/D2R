import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { newHero, serializeSave } from '../src/model.ts';
import { POTIONS } from '../src/potions.ts';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.OUTPUT_DIR || '.verification/potions-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
async function expose(page) {
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch(); const body = await response.text();
    assert.ok(body.includes('const game = new Game();'));
    await route.fulfill({ response, body: body.replace('const game = new Game();', 'const game = new Game(); window.potionGame = game;') });
  });
}
async function settle(page) {
  await page.evaluate(async () => { const g = window.potionGame; if (!await g.flushSave()) throw new Error('save failed'); g.ui.update(0); });
}
async function enter(page, name) {
  if (name) await page.getByRole('option', { name, exact: true }).click();
  await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.potionGame?.profile && !window.potionGame.paused);
  await page.evaluate(() => cancelAnimationFrame(window.potionGame.frameId));
}
try {
  for (const width of [1440, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 });
    const page = await context.newPage(); await expose(page);
    const hero = newHero(); hero.gold = 10000;
    await page.addInitScript(save => { if (!localStorage.getItem('potion-fixture')) { localStorage.setItem('eclipse-ii-save-v1', save); localStorage.setItem('potion-fixture', '1'); } }, serializeSave(hero));
    await page.goto(`${base}?mode=local`); await enter(page);
    await page.evaluate(() => window.potionGame.ui.togglePanel('shop'));
    await expect(page.locator('[data-buy]')).toHaveCount(13);
    for (let index = 0; index < 13; index++) { await page.locator(`[data-buy="${index}"]`).click(); await settle(page); }
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potions), [7, 5, ...Array(11).fill(1), 0, 0]);
    assert.equal(await page.evaluate(() => { const g = window.potionGame, before = g.hero.gold; g.buy(13); g.buy(14); return before === g.hero.gold && !g.hero.potions[13] && !g.hero.potions[14]; }), true);
    await page.evaluate(async () => {
      const g = window.potionGame, { Group } = await import('/node_modules/three/build/three.module.js'); g.ui.closePanel();
      for (let potion = 0; potion < 15; potion++) {
        const loot = { id: g.nextId++, x: g.position.x, z: g.position.z, potion, mesh: new Group() };
        g.addLoot(loot); g.collectLoot(loot);
      }
    }); await settle(page);
    await page.keyboard.press('i'); await page.getByRole('tab', { name: '药水', exact: true }).click();
    await expect(page.locator('[data-potion-code]')).toHaveCount(15);
    for (const potion of POTIONS) await expect(page.locator(`[data-potion-code="${potion.code}"] b`)).toHaveText(potion.code === 'hp1' ? '8' : potion.code === 'mp1' ? '6' : potion.kind === 'rejuvenation' ? '1' : '2');
    for (const [slot, index] of [11, 12, 13, 14].entries()) { await page.locator(`[data-potion-binding="${slot}"]`).selectOption(String(index)); await settle(page); }
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potionBindings), [11, 12, 13, 14]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/potions-${width}.png` });
    await page.evaluate(() => { const g = window.potionGame; g.ui.closePanel(); g.hero.hp = 1; g.hero.mana = 0; });
    for (const key of ['1', '2']) await page.keyboard.press(key);
    await settle(page);
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potionRecovery.map(p => p.index)), [11, 12]);
    await page.keyboard.press('3'); await settle(page);
    assert.equal(await page.evaluate(async () => { const { stats } = await import('/src/model.ts'); const h = window.potionGame.hero; return h.hp === 1 + stats(h).maxHp * .35 && h.mana === stats(h).maxMana * .35; }), true);
    await page.locator('[data-potion-slot="3"]').click(); await settle(page);
    assert.equal(await page.evaluate(async () => { const { stats } = await import('/src/model.ts'); const h = window.potionGame.hero; return h.hp === stats(h).maxHp && h.mana === stats(h).maxMana && h.potionRecovery.length === 0; }), true);
    assert.equal(await page.locator('[data-potion-slot]').evaluateAll(buttons => buttons.every(button => { const r = button.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })), true);
    // Utility potions are still usable directly and can occupy any hotkey.
    await page.keyboard.press('i'); await page.getByRole('tab', { name: '药水', exact: true }).click();
    await page.evaluate(() => { const h = window.potionGame.hero; h.poison = h.cold = 6; h.stamina = 0; });
    for (const index of [2, 3, 4]) { await page.locator(`[data-potion="${index}"]`).click(); await settle(page); }
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potionTimers), [30, 30, 30]);
    await page.locator('[data-potion-binding="0"]').selectOption('3'); await settle(page);
    await page.evaluate(() => window.potionGame.ui.closePanel()); await page.keyboard.press('1'); await settle(page);
    assert.equal(await page.evaluate(() => window.potionGame.hero.potionTimers[1]), 60);
    const before = await page.evaluate(() => [...window.potionGame.hero.potions]);
    await page.evaluate(async () => { const g = window.potionGame; g.saves.create('共享药水角色'); await g.saves.initializeResources(); });
    await page.reload(); await enter(page, '共享药水角色');
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potions), before);
    assert.deepEqual(await page.evaluate(() => window.potionGame.hero.potionBindings), [0, 1, 13, 14]);
    await page.evaluate(() => { const g = window.potionGame; g.hero.hp = 1; g.drink(11); }); await settle(page);
    // Another tab uses the same IndexedDB wallet; a stale character cannot restore the bottle.
    const second = await context.newPage(); await expose(second); await second.goto(`${base}?mode=local`); await enter(second, '灰烬行者');
    assert.equal(await second.evaluate(() => window.potionGame.hero.potions[11]), before[11] - 1);
    assert.deepEqual(await second.evaluate(() => window.potionGame.hero.potionBindings), [3, 12, 13, 14]);
    await context.close(); console.log(`Potion purchase, all drops, 15-kind inventory, four bindings and shared persistence passed at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
