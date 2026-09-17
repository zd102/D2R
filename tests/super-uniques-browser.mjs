import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173/?mode=local');
  const result = await page.evaluate(async () => {
    const [{ Game }, { MONSTERS, BOSSES, encounterPool }, { LEVELS, SPECIAL_LEVELS }, { newHero }, { monsterStats }, aff] = await Promise.all([
      import('/src/game.ts'), import('/src/bestiary.ts'), import('/src/campaign.ts'), import('/src/model.ts'), import('/src/balance.ts'), import('/src/monster-affixes.ts'),
    ]);
    const encounters = LEVELS.filter(area => !area.actBoss).map(area => ({ area, definition: BOSSES[area.index] }));
    encounters.push(...['pindleskin', 'nihlathak'].map(id => ({ area: SPECIAL_LEVELS.nihlathak, definition: MONSTERS[id] })), { area: SPECIAL_LEVELS.cow, definition: MONSTERS.hellCow });
    let count = 0;
    const failures = [], original = Math.random;
    try {
      for (const { area, definition } of encounters) for (const difficulty of [0, 1, 2]) for (const players of [1, 8]) {
        const hero = newHero(); hero.difficultyLevel = difficulty; hero.playerCount = players;
        // Exercise production actor/stat/affix generation without constructing 138 maps.
        const game = { hero, level: area, specialArea: area.special, enemies: [], nextId: 1, world: { scene: { add() {} }, body() { return { position: {} }; } }, monsterBatches: { add() {} } };
        let seed = 24671;
        Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32;
        const spawn = (def, boss = false, elite = false) => Game.prototype.spawnEnemy.call(game, 0, 0, boss ? 'boss' : 'demon', def, elite);
        const boss = spawn(definition, true), expected = monsterStats(definition, area, difficulty, true, false, players);
        const label = `${definition.id}/${difficulty}/${players}`;
        if (!boss.superUnique || boss.maxHp !== expected.maxHp || boss.damage !== expected.damage || boss.affixes.length !== aff.SUPER_UNIQUE_AFFIXES[definition.id].length + difficulty) failures.push(label);
        count++;
        const pool = area.special === 'cow' ? ['hellCow'] : area.special === 'nihlathak' ? ['reanimated', 'minion'] : encounterPool(area.index, difficulty);
        for (const id of pool) {
          const elite = spawn(MONSTERS[id], false, true); count++;
          if (boss.maxHp <= elite.maxHp || boss.damage + 1e-8 < elite.damage) failures.push(`${label}/elite/${id}`);
          for (let i = 0; i < 5; i++) {
            const champion = spawn(MONSTERS[id]); Math.random = () => (i + .1) / 5;
            Game.prototype.makeChampion.call(game, champion); count++;
            if (boss.maxHp <= champion.maxHp || champion.champion.id !== 'berserker' && boss.damage <= champion.damage) failures.push(`${label}/champion/${id}/${i}`);
          }
        }
        for (const enemy of game.enemies) {
          if (Object.values(enemy.resistances).some(r => r > 85)) failures.push(`${label}/resistance`);
          enemy.actor.group.traverse(object => {
            object.geometry?.dispose();
            for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) material.dispose();
          });
        }
      }
    } finally { Math.random = original; }
    return { count, failures };
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(errors, []);
  console.log(`Super uniques: 23 encounters, 3 difficulties, 1/8 players, ${result.count} production spawns passed`);
} finally { await browser.close(); }
