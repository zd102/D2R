import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIAL_LEVELS, levelLayout, levelTuning } from '../src/campaign.ts';
import { createWirtsLeg, isAnnihilus } from '../src/items.ts';
import { rollLoot } from '../src/loot.ts';
import { newHero, activateQuestObject, nihlathakUnlocked, parseSave, serializeSave, parseItem } from '../src/model.ts';

test('hidden areas have independent layouts and tuning without extending the campaign', () => {
  const cows = levelLayout(SPECIAL_LEVELS.cow, 19), uber = levelLayout(SPECIAL_LEVELS.uberDiablo, 19);
  assert.ok(cows.width > 200 && cows.height > 200); assert.ok(cows.rooms.length >= 9); assert.ok(cows.chests.length >= 4);
  assert.ok(uber.width < 100 && uber.height < 100); assert.equal(uber.rooms.length, 2); assert.equal(uber.chests.length, 0);
  assert.equal(levelTuning(SPECIAL_LEVELS.cow, 2).level, 96); assert.equal(levelTuning(SPECIAL_LEVELS.uberDiablo, 2).level, 99);
});

test('mysterious corpse leg persists its difficulty marker', () => {
  const leg = createWirtsLeg(1); assert.deepEqual(parseItem(structuredClone(leg)), leg);
  assert.equal(leg.name, '维特之腿 · 噩梦');
});

test('cow drops can add socket bases and runes, while only uber Diablo creates Annihilus', () => {
  const cow = rollLoot({ rank: 'monster', act: 4, difficulty: 2, level: 96, cow: true }, () => 0);
  assert.ok(cow.items.some(item => item.rarity === 'common' && (item.sockets ?? 0) > 0)); assert.ok(cow.runes.length >= 2);
  const normal = rollLoot({ rank: 'actBoss', act: 3, difficulty: 2, level: 91, levelIndex: 19 }, () => 0);
  assert.equal(normal.items.some(isAnnihilus), false);
  const uber = rollLoot({ rank: 'miniboss', act: 4, difficulty: 2, level: 99, uberDiablo: true }, () => 0);
  assert.equal(uber.items.filter(isAnnihilus).length, 1);
});


test('Anya rescue unlocks only its difficulty and survives save reload and travel', () => {
  for (const diff of [0, 1, 2] as const) {
    const hero = newHero(); hero.difficultyLevel = diff; hero.unlockedDifficulty = diff;
    hero.campaign.cleared = diff === 0 ? [22,0,0] : diff === 1 ? [25,22,0] : [25,25,22];
    hero.campaign.current = 22;
    assert.equal(nihlathakUnlocked(hero, diff), false);
    assert.equal(activateQuestObject(hero, 0), true);
    assert.equal(nihlathakUnlocked(hero, diff), true);
    hero.campaign.current = 0; hero.campaign.objects = [];
    const restored = parseSave(serializeSave(hero))!;
    assert.equal(nihlathakUnlocked(restored, diff), true);
    if (diff < 2) assert.equal(nihlathakUnlocked(restored, diff + 1), false);
  }
  const traveler = newHero(); traveler.campaign.current = 22; traveler.campaign.objects = [0]; traveler.questRewards = ['0:anya']; traveler.difficultyLevel = 1;
  assert.equal(nihlathakUnlocked(traveler, 1), false, 'entering a different-difficulty special area must not reinterpret campaign objectives');
  const old = newHero(); old.campaign.cleared[0] = 23;
  assert.equal(nihlathakUnlocked(old, 0), true);
  for (const invalid of [-1, 3, NaN, .5]) assert.equal(nihlathakUnlocked(old, invalid), false);
});

test('Pindleskin adds two equipment picks and improves unique and rare quality over ordinary super uniques', () => {
  const sample = (pindleskin: boolean) => {
    let seed = 19, count = 0, unique = 0, rare = 0;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 4000; i++) {
      const drop = rollLoot({ rank: 'miniboss', act: 4, difficulty: 2, level: 96, levelIndex: 27, pindleskin }, random);
      count += drop.items.length;
      unique += drop.items.filter(item => item.rarity === 'unique').length;
      rare += drop.items.filter(item => item.rarity === 'rare').length;
    }
    return { count, unique, rare };
  };
  const normal = sample(false), boosted = sample(true);
  assert.ok(boosted.count > normal.count + 7000);
  assert.ok(boosted.unique / boosted.count > normal.unique / normal.count);
  assert.ok(boosted.rare / boosted.count > normal.rare / normal.count);
});
