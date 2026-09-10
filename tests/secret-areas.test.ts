import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIAL_LEVELS, levelLayout, levelTuning } from '../src/campaign.ts';
import { createWirtsLeg, isAnnihilus } from '../src/items.ts';
import { rollLoot } from '../src/loot.ts';
import { parseItem } from '../src/model.ts';

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

test('cow drops force socket bases and elevated rune rolls, while only uber Diablo creates Annihilus', () => {
  const cow = rollLoot({ rank: 'monster', act: 4, difficulty: 2, level: 96, cow: true }, () => 0);
  assert.ok(cow.items.some(item => item.rarity === 'common' && (item.sockets ?? 0) > 0)); assert.ok(cow.runes.length >= 2);
  const normal = rollLoot({ rank: 'actBoss', act: 3, difficulty: 2, level: 91, levelIndex: 19 }, () => 0);
  assert.equal(normal.items.some(isAnnihilus), false);
  const uber = rollLoot({ rank: 'miniboss', act: 4, difficulty: 2, level: 99, uberDiablo: true }, () => 0);
  assert.equal(uber.items.filter(isAnnihilus).length, 1);
});
