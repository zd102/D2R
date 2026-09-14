import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
  const results = await page.evaluate(async () => {
    const { Game } = await import('/src/game.ts');
    const { newHero } = await import('/src/model.ts');
    const { LEVELS, SPECIAL_LEVELS } = await import('/src/campaign.ts');
    const hero = newHero(); hero.level = 99; hero.campaign.cleared = [25, 25, 25];
    const rows = [], original = Math.random;
    try {
      for (const [rank, level, specialArea] of [
        ['elite', LEVELS[0]], ['miniboss', LEVELS[0]], ['actBoss', LEVELS[24]],
        ['monster', SPECIAL_LEVELS.cow, 'cow'], ['miniboss', SPECIAL_LEVELS.uberDiablo, 'uberDiablo'],
      ]) for (const roll of [0, .999999]) {
        const loot = [], game = { hero, level, specialArea, nextId: 1, addLoot(drop) { loot.push(drop); } };
        Math.random = () => roll;
        Game.prototype.dropLoot.call(game, { x: 0, z: 0 }, rank, 99);
        rows.push({ rank, specialArea, roll, equipment: loot.filter(drop => drop.item && !drop.item.charm).length,
          runes: loot.filter(drop => drop.rune).length, gold: loot.filter(drop => drop.gold).length,
          annihilus: loot.filter(drop => drop.item?.catalogId === 'unique-382').length });
      }
    } finally { Math.random = original; }
    return rows;
  });
  assert.deepEqual(results.map(row => row.equipment), [3, 0, 4, 0, 5, 2, 2, 0, 3, 0]);
  assert.deepEqual(results.map(row => row.runes), [1, 0, 2, 0, 2, 0, 2, 0, 1, 0]);
  assert.ok(results.every(row => row.gold === 1));
  assert.deepEqual(results.map(row => row.annihilus), [0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual(errors, []);
  console.log('Live loot generation: equipment caps, boss extras, optional cow loot and guaranteed Annihilus passed');
} finally { await browser.close(); }
