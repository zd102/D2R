import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateDuel } from './balance-duel.ts';
import { simulateProgression } from './balance-fixtures.ts';

test('real melee and spell controllers defeat representative bosses with legal builds and at most eight potions of each type', t => {
  let seed = 967;
  t.mock.method(Math, 'random', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  for (const [level, difficulty, index] of [[12, 0, 4], [41, 0, 24], [67, 1, 24], [89, 2, 24]] as const) for (const build of ['zeal', 'hammer'] as const) {
    const result = simulateDuel(level, difficulty, index, build); console.log('Balance duel:', result);
    assert.ok(result.won, JSON.stringify(result)); assert.ok(result.seconds < 150); assert.ok(result.healingPotions <= 8 && result.manaPotions <= 8);
  }
});

test('earned campaign levels support 1pp completion and high-PP Normal/Nightmare with bounded supplies', t => {
  let seed = 967;
  t.mock.method(Math, 'random', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  for (const players of [1, 5, 8] as const) for (const row of simulateProgression(.65, 20260910, { players }).filter(row => row.act === 4)) {
    if (players > 1 && row.difficulty === 2) continue; // Reported separately: moderate gear is not a high-PP Hell guarantee.
    for (const build of ['zeal', 'hammer'] as const) {
      seed = 967;
      const result = simulateDuel(row.level, row.difficulty as 0 | 1 | 2, 24, build, players);
      assert.ok(result.won, JSON.stringify({ players, ...result }));
      assert.ok(result.seconds < 150 && result.healingPotions <= 8 && result.manaPotions <= 8);
    }
  }
});
