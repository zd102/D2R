import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollLoot } from '../src/loot.ts';
import { BOSS_DROP_PROFILES } from '../src/boss-loot.ts';

const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const context = { level: 85, act: 4, difficulty: 0 };

test('elite and boss equipment quality improves by rank and stacks with player MF without changing other rewards', () => {
  const rates: number[] = [];
  for (const rank of ['monster', 'elite', 'miniboss', 'actBoss'] as const) {
    let equipment = 0, uncommon = 0, rareOrBetter = 0, mfUncommon = 0;
    for (let seed = 1; seed <= 2500; seed++) {
      const input = { ...context, rank, difficulty: 2 };
      const drop = rollLoot(input, seeded(seed * 7919));
      const mf = rollLoot({ ...input, magicFind: 300 }, seeded(seed * 7919));
      assert.deepEqual(drop.runes, mf.runes);
      assert.equal(drop.gold, mf.gold); assert.equal(drop.potion, mf.potion);
      const items = drop.items.filter(item => !item.charm), mfItems = mf.items.filter(item => !item.charm);
      assert.equal(items.length, mfItems.length);
      equipment += items.length;
      uncommon += items.filter(item => item.rarity !== 'common').length;
      rareOrBetter += items.filter(item => ['rare', 'set', 'unique'].includes(item.rarity)).length;
      mfUncommon += mfItems.filter(item => item.rarity !== 'common').length;
    }
    rates.push(uncommon / equipment);
    assert.ok(mfUncommon > uncommon, `${rank}: player MF still improves equipment`);
    assert.ok(rareOrBetter > 0, `${rank}: rare and special equipment remains available`);
  }
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] > rates[i - 1] + .03, JSON.stringify(rates));
});

test('regular equipment reaches the new caps and act bosses keep two guaranteed items at every difficulty and PP', () => {
  for (const difficulty of [0, 1, 2]) for (const players of [1, 8]) {
    for (const [rank, cap] of [['monster', 1], ['champion', 2], ['elite', 3], ['miniboss', 3], ['actBoss', 4]] as const) {
      const input = { ...context, rank, difficulty, players };
      const maximum = rollLoot(input, () => 0);
      assert.equal(maximum.items.filter(item => !item.charm).length, cap, rank);
      assert.equal(maximum.items.filter(item => item.charm).length, 1, 'charm remains an additional drop');
      assert.equal(rollLoot(input, () => .999999).items.length, rank === 'actBoss' ? 2 : 0);
      const seen = new Set<number>();
      for (let seed = 1; seed <= 150; seed++) {
        const items = rollLoot(input, seeded(seed * 7919)).items.filter(item => !item.charm);
        assert.ok(items.length <= cap && items.length >= (rank === 'actBoss' ? 2 : 0));
        seen.add(items.length);
      }
      if (rank === 'actBoss') assert.deepEqual([...seen].sort(), [2, 3, 4]);
    }
  }
});

test('boss bonus runes are rare while extra uniques and first-clear guarantees remain separate', () => {
  for (const profile of BOSS_DROP_PROFILES) {
    const rank = profile.levelIndex % 5 === 4 ? 'actBoss' : 'miniboss';
    const input = { ...context, rank, levelIndex: profile.levelIndex } as const;
    assert.equal(rollLoot(input, () => .08).runes.length, profile.levelIndex === 3 ? 1 : 0, `${profile.levelIndex}: only Countess guarantees repeat runes`);
    const maximum = rollLoot(input, () => 0);
    assert.equal(maximum.items.filter(item => !item.charm).length, rank === 'actBoss' ? 5 : 4);
    assert.equal(maximum.items.filter(item => item.rarity === 'unique').length, 1, 'extra boss unique remains');
    if (rank === 'actBoss') assert.equal(rollLoot({ ...input, firstClear: true }, () => .999999).runes.length, 1);
  }
});

test('cow bonuses can both miss, remain MF-independent and average 20% bases plus 20% runes', () => {
  const input = { ...context, rank: 'monster' as const, cow: true };
  const miss = rollLoot(input, () => .999999);
  assert.equal(miss.items.length, 0); assert.equal(miss.runes.length, 0);
  let bases = 0, runes = 0;
  for (let seed = 1; seed <= 5000; seed++) {
    // Skip the three base categories to measure only the independent cow bonuses.
    const bonusRandom = () => { let draws = 0; const random = seeded(seed * 7919); return () => draws++ < 3 ? .999999 : random(); };
    const normal = rollLoot(input, bonusRandom());
    const mf = rollLoot({ ...input, magicFind: 1000 }, bonusRandom());
    assert.deepEqual(normal.runes, mf.runes); assert.equal(normal.gold, mf.gold); assert.equal(normal.potion, mf.potion);
    assert.ok(normal.runes.length <= 1, 'at most one cow bonus rune');
    assert.equal(normal.items.length, mf.items.length);
    assert.ok(normal.items.every(item => item.rarity === 'common' && item.sockets! > 0));
    bases += normal.items.length;
    runes += normal.runes.length;
  }
  assert.ok(bases > 850 && bases < 1200, String(bases));
  assert.ok(runes > 850 && runes < 1200, String(runes));
  const both = rollLoot(input, () => .18);
  assert.equal(both.items.length, 1); assert.ok(both.items[0].sockets! > 0); assert.equal(both.runes.length, 1);
});
