import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA_LEVELS, LEVELS, SPECIAL_LEVELS, levelTuning } from '../src/campaign.ts';
import { PLAYER_COUNTS, playerExperienceFactor, playerLifeFactor } from '../src/player-count.ts';
import { experienceFactor, monsterStats } from '../src/balance.ts';
import { BOSSES, ENCOUNTERS, MONSTERS } from '../src/bestiary.ts';
import { simulateProgression, referenceHero, referenceMetrics } from './balance-fixtures.ts';

test('all PP tiers retain useful difficulty-entry XP and bounded campaign/cow progression across map seeds', () => {
  for (const seed of [20260910, 20260911, 20260912]) for (const fraction of [.65, 1]) for (const cows of [false, true]) {
    let previous: ReturnType<typeof simulateProgression> | undefined;
    for (const players of PLAYER_COUNTS) {
      const rows = simulateProgression(fraction, seed, { players, cows });
      for (const [i, row] of rows.entries()) {
        const label = JSON.stringify({ seed, fraction, cows, players, difficulty: row.difficulty, act: row.act });
        assert.ok(row.level > row.entryLevel, label);
        if (previous) assert.ok(row.level >= previous[i].level, label);
        if (row.act === 0 && row.difficulty > 0) {
          const level = AREA_LEVELS[row.difficulty][0];
          const gapFactor = experienceFactor(row.entryLevel, level) / experienceFactor(row.entryLevel, row.entryLevel);
          assert.ok(gapFactor >= .8, `Difficulty entry XP dead zone: ${label}, entry ${row.entryLevel}, area ${level}`);
        }
        if (row.act === 4) {
          const [min, max] = [[36, 48], [64, 77], [88, 96]][row.difficulty];
          assert.ok(row.level >= min && row.level <= max, `${label}: level ${row.level}`);
          if (row.cowLevel !== undefined) {
            assert.ok(row.cowLevel >= row.level && row.cowLevel - row.level <= 5, label);
            assert.ok(row.cowLevel <= [50, 79, 97][row.difficulty], label);
          }
        }
      }
      previous = rows;
    }
  }
});

test('area levels and monster budgets increase through all difficulties, including cow-to-campaign transitions', () => {
  for (const players of PLAYER_COUNTS) {
    let previous: ReturnType<typeof monsterStats> | undefined;
    for (const diff of [0, 1, 2]) {
      for (const area of [...LEVELS, SPECIAL_LEVELS.cow]) {
        const tuning = levelTuning(area, diff);
        if (diff === 0) assert.equal(tuning.level, area.level);
        const enemy = monsterStats(MONSTERS.hellCow, area, diff, false, false, players);
        if (previous) {
          assert.ok(enemy.level >= previous.level);
          assert.ok(enemy.maxHp > previous.maxHp, `${players}pp difficulty ${diff}, ${area.id}`);
          assert.ok(enemy.damage >= previous.damage);
          assert.ok(enemy.attackRating >= previous.attackRating);
          assert.ok(enemy.defense >= previous.defense);
        }
        assert.ok(tuning.level <= 96);
        previous = enemy;
      }
      // The next opening shares the cow budget, so compare it against the last campaign map.
      previous = monsterStats(MONSTERS.hellCow, LEVELS[24], diff, false, false, players);
      if (diff < 2) {
        const cow = levelTuning(SPECIAL_LEVELS.cow, diff), next = levelTuning(LEVELS[0], diff + 1);
        assert.equal(next.hp, cow.hp); assert.equal(next.damage, cow.damage);
        assert.ok(next.level >= cow.level);
        assert.ok(next.defense >= cow.defense);
      }
    }
  }
});

test('PP XP gains diminish relative to life while every additional player still increases rewards', () => {
  for (const players of PLAYER_COUNTS.slice(1)) {
    assert.ok(playerExperienceFactor(players) > playerExperienceFactor(players - 1));
    assert.ok(playerExperienceFactor(players) < playerLifeFactor(players));
    assert.ok(playerExperienceFactor(players) / playerLifeFactor(players) < playerExperienceFactor(players - 1) / playerLifeFactor(players - 1));
  }
});

test('all PP tiers keep representative act combat within damage and time budgets at earned levels', () => {
  for (const players of PLAYER_COUNTS) for (const row of simulateProgression(.65, 20260910, { players })) for (const build of ['zeal', 'hammer'] as const) {
    const hero = referenceHero(row.level, row.difficulty as 0 | 1 | 2, build, row.act * 5 + 4); hero.playerCount = players;
    const index = row.act * 5 + 4, boss = referenceMetrics(hero, BOSSES[index], index, true);
    const label = JSON.stringify({ players, difficulty: row.difficulty, act: row.act, build });
    assert.ok(boss.seconds >= 2.5 && boss.seconds <= 210, `${label}: ${boss.seconds}s`);
    assert.ok(boss.maxHitPercent < 40, `${label}: hit ${boss.maxHitPercent}%`);
    assert.ok(boss.hitChance >= 55, label);
    for (const id of ENCOUNTERS[index]) assert.ok(referenceMetrics(hero, MONSTERS[id], index).seconds <= 12, `${label}: ${id}`);
  }
});
