import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMonsterAffixes, monsterAffixCount, rollMonsterAffixes } from '../src/monster-affixes.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { monsterStats } from '../src/balance.ts';

function rng(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

test('elite and non-chapter boss affixes are one-per-difficulty and never stack competing effects', () => {
  assert.deepEqual([0, 1, 2].map(monsterAffixCount), [1, 2, 3]);
  for (const difficulty of [0, 1, 2]) for (let seed = 0; seed < 200; seed++) {
    const affixes = rollMonsterAffixes(difficulty, rng(seed));
    assert.equal(affixes.length, difficulty + 1);
    assert.equal(new Set(affixes.map(affix => affix.id)).size, affixes.length);
    assert.equal(new Set(affixes.map(affix => affix.group)).size, affixes.length);
  }
  for (let seed = 0; seed < 100; seed++) assert.ok(!rollMonsterAffixes(2, rng(seed), false).some(affix => affix.id === 'swift'));
});

test('affix caps retain room below legacy elite and boss combat budgets', () => {
  for (const difficulty of [0, 1, 2]) for (const area of LEVELS) for (const definition of Object.values(MONSTERS)) {
    const base = monsterStats(definition, area, difficulty, false, true);
    for (let seed = 0; seed < 100; seed++) {
      const tuned = applyMonsterAffixes({ ...base, speed: definition.speed * 1.1 }, rollMonsterAffixes(difficulty, rng(seed), definition.speed > 0));
      assert.ok(tuned.maxHp <= base.maxHp * 1.18);
      assert.ok(tuned.damage <= base.damage * 1.12);
      assert.ok(tuned.defense <= base.defense * 1.19);
      assert.ok(tuned.speed <= definition.speed * 1.1 * 1.12);
      assert.ok(Object.values(tuned.resistances).every(value => value <= 80));
    }
  }
});
