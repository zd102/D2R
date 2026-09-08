import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateDuel } from './balance-duel.ts';

test('real melee and spell controllers defeat representative bosses with legal builds and at most eight potions of each type', t => {
  let seed = 967;
  t.mock.method(Math, 'random', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  for (const [level, difficulty, index] of [[12, 0, 4], [41, 0, 24], [67, 1, 24], [89, 2, 24]] as const) for (const build of ['zeal', 'hammer'] as const) {
    const result = simulateDuel(level, difficulty, index, build); console.log('Balance duel:', result);
    assert.ok(result.won, JSON.stringify(result)); assert.ok(result.seconds < 150); assert.ok(result.healingPotions <= 8 && result.manaPotions <= 8);
  }
});
