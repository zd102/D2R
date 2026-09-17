import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_KEYS, createChallengeKey, createClassTorch, isHellfireTorch, itemMods, placeItems } from '../src/items.ts';
import { newHero, parseSave, serializeSave, transferItem } from '../src/model.ts';
import { moveSharedItem } from '../src/shared-stash.ts';
import { rollLoot } from '../src/loot.ts';
import { PANDEMONIUM_BOSSES } from '../src/pandemonium.ts';
import { monsterStats } from '../src/balance.ts';
import { BOSSES } from '../src/bestiary.ts';
import { SPECIAL_LEVELS } from '../src/campaign.ts';

test('keys require their living Hell boss and survive saves; chance is independent of MF', () => {
  for (const key of CHALLENGE_KEYS) {
    const context = { level: 99, act: 4, difficulty: 2, rank: 'miniboss' as const, levelIndex: key.levelIndex, keyEligible: true };
    assert.equal(rollLoot(context, () => 0).items.filter(item => item.event === key.event).length, 1);
    for (const override of [{ difficulty: 0 }, { difficulty: 1 }, { keyEligible: false }, { rank: 'monster' as const }, { levelIndex: 24 }]) {
      assert.equal(rollLoot({ ...context, ...override }, () => 0).items.some(item => item.event), false);
    }
    for (const magicFind of [0, 10000]) assert.equal(rollLoot({ ...context, magicFind }, () => .999).items.some(item => item.event), false);
  }
  const hero = newHero(); hero.inventory = CHALLENGE_KEYS.map(key => createChallengeKey(key.event));
  assert.deepEqual(parseSave(serializeSave(hero))!.inventory.map(item => item.event), CHALLENGE_KEYS.map(key => key.event));
});

test('all six bosses exceed Uber Diablo and have distinct independent high-tier reward pools', () => {
  const base = monsterStats(BOSSES[19], SPECIAL_LEVELS.uberDiablo, 2, true);
  for (const [stage, entry] of PANDEMONIUM_BOSSES.entries()) {
    const stats = monsterStats(entry.definition, SPECIAL_LEVELS.pandemonium, 2, true);
    assert.ok(stats.maxHp > base.maxHp && stats.damage > base.damage && stats.defense > base.defense && stats.attackRating > base.attackRating);
    const drop = rollLoot({ level: 99, act: 4, difficulty: 2, rank: 'miniboss', challengeStage: stage }, () => 0);
    assert.ok(drop.items.some(item => item.rarity === 'unique'));
    assert.equal(drop.items.some(isHellfireTorch), false);
    assert.ok(entry.loot.uniqueChance >= .45 && entry.loot.maxTC[2] === 87);
  }
});

test('guaranteed torch keeps exactly the winning class skills through identification and save round trips', () => {
  for (const classId of ['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin'] as const) {
    const hero = newHero(classId); const torch = createClassTorch(classId, () => .9); torch.identified = true;
    hero.inventory = [torch];
    const restored = parseSave(serializeSave(hero))!.inventory[0], mods = itemMods(restored);
    assert.equal(mods[`${classId}Skills`], 3);
    assert.equal(Object.entries(mods).filter(([key]) => key.endsWith('Skills')).length, 1);
    assert.ok(mods.allRes! >= 10 && mods.allRes! <= 20);
  }
});

test('torch uniqueness covers personal and shared withdrawals, exchanges and legacy migration without losing items', () => {
  const hero = newHero(); hero.inventory = [createClassTorch('paladin')]; hero.stash = [createClassTorch('amazon')];
  placeItems(hero.inventory); placeItems(hero.stash, 30);
  assert.equal(transferItem(hero, hero.stash[0].id, 'inventory'), false);
  const shared = [createClassTorch('sorceress')];
  assert.throws(() => moveSharedItem(hero, shared, { direction: 'withdraw', container: 'inventory', itemId: shared[0].id }));
  assert.equal(shared.length, 1);
  // A torch-for-torch swap still leaves one in the backpack and is valid.
  assert.equal(transferItem(hero, hero.stash[0].id, 'inventory', { x: 0, y: 0 }), true);
  assert.equal(hero.inventory.filter(isHellfireTorch).length, 1);
  hero.inventory.push(createClassTorch('druid'));
  const restored = parseSave(serializeSave(hero))!;
  assert.equal(restored.inventory.filter(isHellfireTorch).length, 1);
  assert.equal(restored.stash.filter(isHellfireTorch).length, 2);
});
