import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { newHero, serializeSave } from '../src/model.ts';
import { createWirtsLeg, specialItem } from '../src/items.ts';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = '.verification/secret-areas';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];

function hellHero(catalysts) {
  const hero = newHero(); hero.level = 99; hero.campaign.cleared = [25, 25, 25]; hero.campaign.current = 24;
  hero.difficultyLevel = 2; hero.unlockedDifficulty = 2; hero.inventory = catalysts; return hero;
}
async function campPage(hero) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => localStorage.setItem('eclipse-ii-save-v1', save), serializeSave(hero));
  await page.goto(base); await page.getByRole('button', { name: '进入旅程', exact: true }).click();
  await page.waitForFunction(() => window.eclipseState?.inCamp && !window.eclipseState.paused);
  return { context, page };
}
async function canvasCheck(page, label) {
  const sample = await page.evaluate(() => {
    const source = document.getElementById('game-canvas'), canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0, 100, 100); const pixels = ctx.getImageData(0, 0, 100, 100).data;
    let lit = 0; const colors = new Set(); for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 100) lit++; colors.add(`${pixels[i] >> 3},${pixels[i + 1] >> 3},${pixels[i + 2] >> 3}`); }
    return { lit, colors: colors.size, overflow: document.documentElement.scrollWidth <= innerWidth };
  });
  assert.ok(sample.lit > 900 && sample.colors > 40 && sample.overflow, `${label}: ${JSON.stringify(sample)}`);
}

try {
  const leg = createWirtsLeg(1), cow = await campPage(hellHero([leg]));
  await cow.page.locator('[data-action="mystery-portal"]').click();
  await cow.page.locator(`[data-cow-entry="${leg.id}"]`).click();
  await cow.page.waitForFunction(() => window.eclipseState?.area.id === 'secret-cow-level' && !window.eclipseState.paused, undefined, { timeout: 60000 });
  const cowState = await cow.page.evaluate(() => window.eclipseState);
  assert.equal(cowState.difficulty, 1); assert.equal(cowState.inventory, 0); assert.ok(cowState.enemies.length >= 70); assert.ok(cowState.enemies.every(enemy => enemy.species === 'hellCow'));
  assert.ok(cowState.area.gridWidth > 200 && cowState.area.gridHeight > 200);
  await canvasCheck(cow.page, 'Cow level desktop'); await cow.page.screenshot({ path: `${output}/cow-level.png` });
  await cow.page.setViewportSize({ width: 390, height: 844 }); await cow.page.waitForTimeout(150); await canvasCheck(cow.page, 'Cow level mobile'); await cow.page.screenshot({ path: `${output}/cow-level-mobile.png` }); await cow.context.close();

  const soj = specialItem('unique-122', () => .5), uber = await campPage(hellHero([soj]));
  await uber.page.locator('[data-action="mystery-portal"]').click();
  await uber.page.locator(`[data-uber-entry="${soj.id}"]`).click();
  await uber.page.waitForFunction(() => window.eclipseState?.area.id === 'uber-diablo' && !window.eclipseState.paused, undefined, { timeout: 60000 });
  const uberState = await uber.page.evaluate(() => window.eclipseState);
  assert.equal(uberState.difficulty, 2); assert.equal(uberState.inventory, 0); assert.equal(uberState.enemies.length, 1); assert.equal(uberState.enemies[0].species, 'diablo'); assert.equal(uberState.enemies[0].maxHp, 900000);
  await canvasCheck(uber.page, 'Uber Diablo');
  const uniquePickup = await uber.page.evaluate(async () => {
    const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts'), { specialItem } = await import('/src/items.ts');
    const hero = newHero(); hero.inventory = [specialItem('unique-382', () => .5)];
    const ground = { id: 1, x: 0, z: 0, item: specialItem('unique-382', () => .5), mesh: {} }, notices = [];
    const game = { hero, paused: false, dead: false, loot: [ground], ui: { toast: notice => notices.push(notice) }, disposeObject() {}, audio: { play() {} }, save() {} };
    Game.prototype.collectLoot.call(game, ground); return { inventory: hero.inventory.length, ground: game.loot.length, notices };
  });
  assert.deepEqual(uniquePickup, { inventory: 1, ground: 1, notices: ['背包中已有毁灭'] });
  const corpseLeg = await uber.page.evaluate(async () => {
    const { Game } = await import('/src/game.ts'), { newHero } = await import('/src/model.ts');
    const hero = newHero(); hero.difficultyLevel = 2;
    const corpse = { x: 0, z: 0, opened: false, group: { getObjectByName() { return null; } } }, game = {
      hero, profile: {}, inCamp: false, paused: false, dead: false, position: { x: 0, z: 0 }, world: { mysteryCorpse: corpse },
      pendingMysteryCorpse: false, begin() {}, addLoot(drop) { game.drop = drop; }, audio: { play() {} }, ui: { toast() {} }, save() {},
    };
    Game.prototype.openMysteriousCorpse.call(game); return { opened: corpse.opened, name: game.drop.item.name, difficulty: game.drop.item.eventDifficulty };
  });
  assert.deepEqual(corpseLeg, { opened: true, name: '维特之腿 · 地狱', difficulty: 2 });
  await uber.page.screenshot({ path: `${output}/uber-diablo.png` }); await uber.context.close();
  assert.deepEqual(errors, []); console.log('Secret area portal, cow population, uber Diablo, and Annihilus uniqueness passed');
} finally { await browser.close(); }
