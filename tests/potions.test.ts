import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats, parseSave, serializeSave, createCorpse } from '../src/model.ts';
import { POTIONS, potionIndex, potionAmount, rollPotion, useRecoveryPotion, tickRecoveryPotions, useUtilityPotion, tickPotionTimers } from '../src/potions.ts';
import { rollChestLoot, chestContext } from '../src/chests.ts';
import { rollLoot } from '../src/loot.ts';
import { LEVELS } from '../src/campaign.ts';

test('utility potions cure immediately, stack duration and expire independently', () => {
  const hero = newHero(); hero.potions = [6, 4, 2, 2, 2]; hero.stamina = 0; hero.poison = hero.cold = 6;
  for (const index of [2, 3, 4]) assert.ok(useUtilityPotion(hero, index, stats(hero).maxStamina));
  assert.equal(hero.stamina, stats(hero).maxStamina); assert.equal(hero.poison, 0); assert.equal(hero.cold, 0);
  assert.equal(stats(hero).resistances.poison, 50); assert.equal(stats(hero).maxResistances.cold, 85);
  tickPotionTimers(hero, 10); useUtilityPotion(hero, 3, stats(hero).maxStamina);
  assert.deepEqual(hero.potionTimers, [20, 50, 20]); assert.equal(stats(hero).resistances.poison, 50);
  tickPotionTimers(hero, 20); assert.equal(stats(hero).maxResistances.cold, 75); assert.equal(stats(hero).resistances.cold, 0);
  tickPotionTimers(hero, 30); assert.equal(stats(hero).resistances.poison, 0);
  assert.equal(useUtilityPotion(hero, 3, stats(hero).maxStamina), false);
});

test('potion resistance respects difficulty and the absolute 95 percent cap', () => {
  const hero = newHero(); hero.potions[3] = 2;
  hero.equipment.weapon!.mods = { poisonRes: 200, maxPoisonRes: 20 };
  useUtilityPotion(hero, 3, stats(hero).maxStamina); useUtilityPotion(hero, 3, stats(hero).maxStamina);
  assert.equal(stats(hero).maxResistances.poison, 95); assert.equal(stats(hero).resistances.poison, 95);
  hero.equipment.weapon!.mods = {}; hero.difficultyLevel = 2;
  assert.equal(stats(hero).resistances.poison, -50);
});

test('old saves migrate and utility counts and durations survive a round trip', () => {
  const hero = newHero(); hero.potions = [3, 2];
  const old = JSON.parse(serializeSave(hero)); delete old.hero.potionTimers;
  const migrated = parseSave(JSON.stringify(old))!;
  assert.deepEqual(migrated.potions, [3, 2, ...Array(13).fill(0)]); assert.deepEqual(migrated.potionTimers, [0, 0, 0]);
  migrated.potions[2] = 3; useUtilityPotion(migrated, 2, stats(migrated).maxStamina);
  const restored = parseSave(serializeSave(migrated))!;
  assert.equal(restored.potions[2], 2); assert.equal(restored.potionTimers[0], 30);
  createCorpse(restored, 0, 0); assert.deepEqual(restored.potionTimers, [0, 0, 0]);
});

test('monster and original chest treasure rolls can produce all utility potions', () => {
  let seed = 815; const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const monsters = new Set<number>(), chests = new Set<number>();
  for (let i = 0; i < 4000; i++) {
    const drop = rollLoot({ level: 12, act: 1, rank: 'monster', difficulty: 0 }, random);
    if (drop.potion !== undefined) monsters.add(drop.potion);
    for (const chest of rollChestLoot(chestContext(LEVELS[7], 0), random)) if (chest.potion !== undefined) chests.add(chest.potion);
  }
  for (const index of [2, 3, 4]) { assert.ok(monsters.has(index)); assert.ok(chests.has(index)); }
});

test('all ten original recovery tiers remain distinct with class-specific amounts', () => {
  assert.equal(POTIONS.length, 15);
  assert.equal(new Set(POTIONS.map(p => p.code)).size, 15);
  for (const [kind, expected] of [['hp', [30, 60, 100, 180, 320]], ['mp', [40, 80, 160, 300, 500]]] as const) {
    for (let tier = 1; tier <= 5; tier++) {
      const index = potionIndex(`${kind}${tier}`)!;
      assert.equal(POTIONS[index].tier, tier);
      assert.equal(potionAmount(index, 'sorceress'), expected[tier - 1]);
      assert.equal(potionAmount(index, 'paladin'), expected[tier - 1] * (kind === 'hp' ? 1.5 : .75));
    }
  }
});

test('recovery persists across saves, higher tiers take priority, full resources clear effects', () => {
  let hero = newHero(); hero.vitality = 300; hero.energy = 200; hero.hp = 1; hero.mana = 0;
  const hp5 = potionIndex('hp5')!, mp5 = potionIndex('mp5')!;
  hero.potions[hp5] = 3; hero.potions[mp5] = 1;
  let s = stats(hero);
  assert.equal(useRecoveryPotion(hero, 0, s.maxHp, s.maxMana), null);
  assert.equal(useRecoveryPotion(hero, hp5, s.maxHp, s.maxMana), null);
  assert.ok(useRecoveryPotion(hero, hp5, s.maxHp, s.maxMana)); assert.equal(hero.potions[hp5], 2);
  assert.equal(useRecoveryPotion(hero, mp5, s.maxHp, s.maxMana), null);
  tickRecoveryPotions(hero, 1, s.maxHp, s.maxMana);
  assert.equal(hero.hp, 81); assert.equal(hero.mana, 125);
  hero = parseSave(serializeSave(hero))!; s = stats(hero);
  assert.deepEqual(hero.potionRecovery.map(p => p.remaining), [45, 400, 250]);
  tickRecoveryPotions(hero, 5, s.maxHp, s.maxMana); assert.equal(hero.hp, 481);
  tickRecoveryPotions(hero, 6, s.maxHp, s.maxMana); assert.equal(hero.hp, 526);
  assert.equal(hero.potionRecovery.length, 0);
  hero.hp = s.maxHp - 1; useRecoveryPotion(hero, hp5, s.maxHp, s.maxMana);
  tickRecoveryPotions(hero, 1, s.maxHp, s.maxMana); assert.equal(hero.potionRecovery.length, 0);
  const count = hero.potions[hp5]; assert.ok(useRecoveryPotion(hero, hp5, s.maxHp, s.maxMana)); assert.equal(hero.potions[hp5], count);
  hero.hp = 1; useRecoveryPotion(hero, hp5, s.maxHp, s.maxMana); createCorpse(hero, 0, 0); assert.deepEqual(hero.potionRecovery, []);
});

test('rejuvenation instantly restores percentages and never wastes a bottle at full resources', () => {
  const hero = newHero(); hero.potions[13] = hero.potions[14] = 2; hero.hp = 1; hero.mana = 0;
  const s = stats(hero);
  assert.equal(useRecoveryPotion(hero, 13, s.maxHp, s.maxMana), null);
  assert.equal(hero.hp, 1 + s.maxHp * .35); assert.equal(hero.mana, s.maxMana * .35);
  assert.equal(useRecoveryPotion(hero, 14, s.maxHp, s.maxMana), null);
  assert.equal(hero.hp, s.maxHp); assert.equal(hero.mana, s.maxMana);
  assert.ok(useRecoveryPotion(hero, 14, s.maxHp, s.maxMana)); assert.equal(hero.potions[14], 1);
  hero.mana = 0; assert.equal(useRecoveryPotion(hero, 13, s.maxHp, s.maxMana), null);
});

test('drop distribution keeps rejuvenation rare and all tiers attainable by area progression', () => {
  let seed = 319; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const counts = Array(15).fill(0);
  for (let i = 0; i < 100000; i++) counts[rollPotion(random, i % 5, 0)]++;
  assert.ok(counts.every(count => count > 0));
  assert.ok(counts[13] > 1700 && counts[13] < 2300);
  assert.ok(counts[14] > 350 && counts[14] < 650);
  for (const difficulty of [0, 1, 2]) for (let act = 0; act < 5; act++) {
    const potion = POTIONS[rollPotion(() => .5, act, difficulty)];
    assert.equal(potion.tier, difficulty === 2 ? 5 : difficulty === 1 ? act < 2 ? 4 : 5 : act + 1);
  }
});

test('both level boss ranks drop rejuvenation more often without changing the total potion chance', () => {
  for (const rank of ['miniboss', 'actBoss'] as const) {
    let seed = 916; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const counts = Array(15).fill(0); let total = 0;
    for (let i = 0; i < 10000; i++) {
      const drop = rollLoot({ level: 40, act: 4, rank, difficulty: 0, players: 1 }, random);
      if (drop.potion !== undefined) { total++; counts[drop.potion]++; }
    }
    assert.ok(total > 7700 && total < 8300, `${rank}: overall potion chance`);
    assert.ok(counts[13] > 1400 && counts[13] < 1800, `${rank}: rejuvenation 16% per kill`);
    assert.ok(counts[14] > 650 && counts[14] < 950, `${rank}: full rejuvenation 8% per kill`);
    assert.ok(counts[2] + counts[3] + counts[4] > 1400 && counts[2] + counts[3] + counts[4] < 1800, `${rank}: utility share`);
  }
});
