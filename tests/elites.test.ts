import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, eliteCount } from '../src/campaign.ts';
import { ENCOUNTERS, MONSTERS, BOSSES } from '../src/bestiary.ts';
import { monsterStats, monsterExperience } from '../src/balance.ts';
import { DROP_RATES, rollDropKinds } from '../src/items.ts';
import { rollLoot, runePool } from '../src/loot.ts';

function rng(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

test('every stage gains 1-6 elites, with strictly increasing counts at higher difficulty', () => {
  for (const area of LEVELS) {
    const counts = [0, 1, 2].map(diff => eliteCount(area, diff));
    assert.ok(counts[0] >= 1 && counts[0] <= 2);
    assert.ok(counts[1] >= 3 && counts[1] <= 4);
    assert.ok(counts[2] >= 5 && counts[2] <= 6);
    assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
    for (const diff of [0, 1, 2]) for (const id of ENCOUNTERS[area.index]) {
      const normal = monsterStats(MONSTERS[id], area, diff), elite = monsterStats(MONSTERS[id], area, diff, false, true);
      assert.equal(elite.level, Math.min(99, normal.level + 2));
      assert.ok(elite.maxHp >= normal.maxHp * 2.4 && elite.maxHp <= normal.maxHp * 3.6);
      assert.ok(elite.damage > normal.damage && elite.defense > normal.defense);
      assert.deepEqual(elite.resistances, normal.resistances);
    }
    assert.deepEqual(monsterStats(BOSSES[area.index], area, 0, true, true), monsterStats(BOSSES[area.index], area, 0, true));
  }
});

test('elite equipment and rune odds are elevated but remain below guardian odds', () => {
  for (const kind of ['equipment', 'rune'] as const) {
    assert.ok(DROP_RATES.elite[kind] > DROP_RATES.monster[kind]);
    assert.ok(DROP_RATES.elite[kind] < DROP_RATES.miniboss[kind]);
  }
  const random = rng(221), counts = { equipment: 0, rune: 0 };
  for (let i = 0; i < 20000; i++) { const drop = rollDropKinds('elite', random); counts.equipment += Number(drop.equipment); counts.rune += Number(drop.rune); }
  assert.ok(Math.abs(counts.equipment / 20000 - .55) < .015);
  assert.ok(Math.abs(counts.rune / 20000 - .15) < .012);
});

test('elites use their own loot and cannot gain Countess, Hellforge, event charm or first-clear rewards', () => {
  for (const index of [3, 17, 19, 24]) for (const difficulty of [0, 1, 2]) {
    const context = { level: 85, act: LEVELS[index].act, difficulty, levelIndex: index, rank: 'elite' as const, countess: true, firstClear: true };
    const drop = rollLoot(context, () => 0);
    assert.equal(drop.runes.length, 1); assert.equal(drop.items.length, 2);
    assert.ok(drop.items.every(item => !['unique-382', 'unique-401'].includes(item.catalogId ?? '')));
    assert.ok(drop.runes.every(rune => runePool(context.level, difficulty, context.act).includes(rune)));
    assert.equal(drop.items[0].rarity, 'magic');
    assert.equal(rollLoot(context, () => .99).items.length, 0);
    assert.equal(rollLoot(context, () => .99).runes.length, 0);
    const before = rollLoot(context, rng(18)), after = rollLoot({ ...context, magicFind: 500 }, rng(18));
    assert.deepEqual(before.runes, after.runes); assert.equal(before.gold, after.gold); assert.equal(before.potion, after.potion);
  }
  const context = { difficulty: 1, act: 2 }, xp = monsterExperience(50, 50, 'elite', context);
  assert.ok(xp > monsterExperience(50, 50, 'monster', context));
  assert.equal(monsterExperience(50, 50, 'elite', { ...context, firstClear: true }), xp);
  assert.equal(monsterExperience(50, 50, 'elite', { ...context, summoned: true }), 0);
});
