import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats, parseSave, serializeSave, createCorpse } from '../src/model.ts';
import { useUtilityPotion, tickPotionTimers } from '../src/potions.ts';
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
  assert.deepEqual(migrated.potions, [3, 2, 0, 0, 0]); assert.deepEqual(migrated.potionTimers, [0, 0, 0]);
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
