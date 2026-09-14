import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DROP_RATES, rollDropKinds } from '../src/items.ts';
import { rollLoot } from '../src/loot.ts';
import { monsterStats } from '../src/balance.ts';
import { LEVELS, SPECIAL_LEVELS } from '../src/campaign.ts';
import { BOSSES, MONSTERS } from '../src/bestiary.ts';

const seeded = (seed = 431) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

test('difficulty rewards increase for every rank and PP without multiplying guaranteed equipment', () => {
  const samples = 20000;
  for (const rank of Object.keys(DROP_RATES) as (keyof typeof DROP_RATES)[]) for (const players of [1, 8]) {
    let previous = { equipment: 0, rune: 0, charm: 0 };
    for (const difficulty of [0, 1, 2]) {
      const random = seeded(), counts = { equipment: 0, rune: 0, charm: 0 };
      for (let n = 0; n < samples; n++) {
        const flags = rollDropKinds(rank, random, players, difficulty);
        for (const key of ['equipment', 'rune', 'charm'] as const) counts[key] += Number(flags[key]);
      }
      for (const key of ['equipment', 'rune', 'charm'] as const) {
        assert.ok(counts[key] >= previous[key], `${rank}/${players}/${difficulty}/${key}`);
        assert.ok(counts[key] <= samples);
      }
      if (rank === 'actBoss') assert.equal(counts.equipment, samples);
      if (players === 1 && rank === 'monster') {
        assert.ok(Math.abs(counts.equipment / samples - [.16, .1888, .2301][difficulty]) < .01);
        assert.ok(Math.abs(counts.rune / samples - [.0035, .0042, .00525][difficulty]) < .0015);
      }
      previous = counts;
    }
  }
});

test('live loot generation applies difficulty bonuses and retains MF-independent currency and runes', () => {
  for (const difficulty of [0, 1, 2]) {
    const context = { level: 80, act: 4, difficulty, rank: 'monster' as const };
    // This roll lies between the normal and nightmare equipment thresholds.
    assert.equal(rollLoot(context, () => .18).items.length, difficulty ? 1 : 0);
    for (let seed = 1; seed <= 200; seed++) {
      const plain = rollLoot(context, seeded(seed)), mf = rollLoot({ ...context, magicFind: 500 }, seeded(seed));
      assert.deepEqual(plain.runes, mf.runes); assert.equal(plain.gold, mf.gold);
      assert.equal(plain.potion, mf.potion);
    }
  }
});

test('high difficulties strengthen regulars, elites, bosses and secret areas without changing levels', () => {
  for (const [definition, area, boss, elite] of [
    [MONSTERS.fallen, LEVELS[0], false, false],
    [MONSTERS.zombie, LEVELS[0], false, true],
    [BOSSES[24], LEVELS[24], true, false],
    [MONSTERS.hellCow, SPECIAL_LEVELS.cow, false, false],
    [BOSSES[19], SPECIAL_LEVELS.uberDiablo, true, false],
  ] as const) {
    let previous = monsterStats(definition, area, 0, boss, elite);
    for (const difficulty of [1, 2]) {
      const enemy = monsterStats(definition, area, difficulty, boss, elite);
      for (const key of ['maxHp', 'damage', 'defense', 'attackRating'] as const) assert.ok(enemy[key] > previous[key]);
      assert.ok(enemy.level >= previous.level); assert.ok(Object.values(enemy.resistances).every(value => value <= 85));
      previous = enemy;
    }
  }
});
