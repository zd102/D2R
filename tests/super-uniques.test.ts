import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monsterStats } from '../src/balance.ts';
import { BOSSES, MONSTERS, encounterPool } from '../src/bestiary.ts';
import { LEVELS, SPECIAL_LEVELS } from '../src/campaign.ts';
import { SUPER_UNIQUE_BUDGETS } from '../src/super-uniques.ts';
import { applyMonsterAffixes, CHAMPION_VARIANTS, SUPER_UNIQUE_AFFIXES, SUPER_UNIQUE_AURAS, rollMonsterAffixes } from '../src/monster-affixes.ts';
import { playerLifeFactor, playerDamageFactor } from '../src/player-count.ts';

const encounters = [
  ...LEVELS.filter(area => !area.actBoss).map(area => ({ area, definition: BOSSES[area.index] })),
  ...['pindleskin', 'nihlathak'].map(id => ({ area: SPECIAL_LEVELS.nihlathak, definition: MONSTERS[id] })),
  { area: SPECIAL_LEVELS.cow, definition: MONSTERS.hellCow },
];
const rng = (seed: number) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32;

test('all 23 super uniques beat field elite life and ordinary champion offense without erasing berserker specialization', () => {
  assert.equal(encounters.length, 23);
  assert.deepEqual(Object.keys(SUPER_UNIQUE_BUDGETS).sort(), encounters.map(e => e.definition.id).sort());
  for (const { area, definition } of encounters) for (const difficulty of [0, 1, 2]) for (let players = 1; players <= 8; players++) {
    const ids = area.special === 'cow' ? ['hellCow'] : area.special === 'nihlathak' ? ['reanimated', 'minion'] : encounterPool(area.index, difficulty);
    const elites = ids.map(id => monsterStats(MONSTERS[id], area, difficulty, false, true, players));
    const champions = ids.flatMap(id => CHAMPION_VARIANTS.map(variant => ({
      ...applyMonsterAffixes({ ...monsterStats(MONSTERS[id], area, difficulty, false, false, players), speed: 1 }, [], variant), variant: variant.id,
    })));
    const boss = monsterStats(definition, area, difficulty, true, false, players), label = `${definition.id}/${difficulty}/${players}`;
    const lifeRatio = boss.maxHp / Math.max(...elites.map(e => e.maxHp));
    assert.ok(lifeRatio >= 1.49 && lifeRatio <= 2.81, label);
    assert.ok(boss.maxHp > Math.max(...champions.map(c => c.maxHp)), `${label}: possessed life`);
    assert.ok(boss.damage >= Math.max(...elites.map(e => e.damage)) - 1e-8, label);
    assert.ok(boss.damage > Math.max(...champions.filter(c => c.variant !== 'berserker').map(c => c.damage)), label);
    assert.ok(boss.damage < Math.max(...champions.map(c => c.damage)), `${label}: berserker burst niche`);
    assert.ok(boss.attackRating >= Math.max(...elites.map(e => e.attackRating)) - 1, label);
    const single = monsterStats(definition, area, difficulty, true);
    assert.equal(boss.maxHp, Math.floor(single.maxHp * playerLifeFactor(players)), label);
    assert.ok(Math.abs(boss.damage - single.damage * playerDamageFactor(players, difficulty)) < 1e-8, label);
    assert.equal(boss.defense, single.defense);
    assert.deepEqual(boss.resistances, single.resistances);
    for (const seed of [7, 91, 2026]) {
      const affixes = rollMonsterAffixes(difficulty, rng(seed), definition.speed > 0, definition, SUPER_UNIQUE_AFFIXES[definition.id], SUPER_UNIQUE_AURAS[definition.id]);
      const tuned = applyMonsterAffixes({ ...boss, speed: definition.speed }, affixes);
      assert.equal(affixes.length, SUPER_UNIQUE_AFFIXES[definition.id].length + difficulty, label);
      assert.equal(tuned.maxHp, boss.maxHp, label);
      assert.ok(Object.values(tuned.resistances).every(r => r <= 85), label);
    }
  }
});

test('tank, caster and cow king identities remain distinct and chapter/uber bosses keep their own budgets', () => {
  for (const difficulty of [0, 1, 2]) {
    const area = LEVELS[16];
    const tank = monsterStats(BOSSES[16], area, difficulty, true), caster = monsterStats(BOSSES[8], area, difficulty, true);
    assert.ok(tank.maxHp > caster.maxHp * 1.8);
    assert.ok(tank.defense > caster.defense * 1.7);
    assert.ok(caster.damage > tank.damage);
    const cow = monsterStats(MONSTERS.hellCow, SPECIAL_LEVELS.cow, difficulty, true);
    const elite = monsterStats(MONSTERS.hellCow, SPECIAL_LEVELS.cow, difficulty, false, true);
    assert.ok(cow.maxHp >= elite.maxHp * 2.19 && cow.maxHp <= elite.maxHp * 2.21);
    assert.ok(Math.abs(cow.damage / elite.damage - 1.3) < 1e-8);
    for (const index of [4, 9, 14, 19, 24]) {
      const boss = monsterStats(BOSSES[index], LEVELS[index], difficulty, true);
      assert.equal(boss.maxHp, Math.floor(BOSSES[index].hpByDifficulty![difficulty] * [1, 1.3, 2][difficulty]));
    }
    assert.equal(monsterStats(BOSSES[19], SPECIAL_LEVELS.uberDiablo, difficulty, true).maxHp, 900000 * [1, 1.3, 2][difficulty]);
  }
});
