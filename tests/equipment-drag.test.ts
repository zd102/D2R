import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats, canUnequipToItems, unequipToItems, swapRingSlots } from '../src/model.ts';
import { BASES, makeItem, packItems, placeItems } from '../src/items.ts';
import { moveSharedItem } from '../src/shared-stash.ts';

const ring = (id: string) => makeItem(BASES.find(base => base.baseCode === 'rin')!, id);

test('equipment drops use the requested cells and preserve item identity and properties', () => {
  const hero = newHero(), weapon = hero.equipment.weapon!;
  hero.inventory = [{ ...ring('existing'), x: 0, y: 0 }];
  weapon.mods = { strength: 12, fireMinDamage: 3 }; weapon.sockets = 2; weapon.runes = ['El'];
  const before = structuredClone(hero);
  assert.ok(canUnequipToItems(hero, hero.inventory, 'weapon', 4, { x: 8, y: 1 })); assert.deepEqual(hero, before, 'preview does not mutate');
  assert.ok(unequipToItems(hero, hero.inventory, 'weapon', 4, { x: 8, y: 1 }));
  assert.equal(hero.equipment.weapon, null); assert.equal(hero.inventory[1], weapon);
  assert.deepEqual(hero.inventory[1], { ...before.equipment.weapon, x: 8, y: 1 });
  assert.deepEqual(hero.inventory[0], before.inventory[0]);
});

test('occupied, partially occupied, overflowing and noninteger drops do not search for another space', () => {
  const hero = newHero(); hero.inventory = [{ ...ring('occupied'), x: 2, y: 2 }];
  const before = structuredClone(hero);
  for (const position of [{ x: 2, y: 2 }, { x: 1, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 2 }, { x: -1, y: 0 }, { x: .5, y: 0 }, { x: NaN, y: 0 }]) {
    assert.equal(canUnequipToItems(hero, hero.inventory, 'weapon', 4, position), false);
    assert.equal(unequipToItems(hero, hero.inventory, 'weapon', 4, position), false); assert.deepEqual(hero, before);
  }
});

test('exact drops preserve the displayed layout of legacy items without saved coordinates', () => {
  const hero = newHero(); hero.inventory = [ring('legacy')]; const before = structuredClone(hero);
  assert.equal(unequipToItems(hero, hero.inventory, 'weapon', 4, { x: 0, y: 0 }), false); assert.deepEqual(hero, before);
  assert.ok(unequipToItems(hero, hero.inventory, 'weapon', 4, { x: 2, y: 1 }));
  assert.deepEqual(packItems(hero.inventory)?.get('legacy'), { x: 0, y: 0, width: 1, height: 1 });
});

test('private and shared destinations enforce capacity and reject duplicate identifiers', () => {
  const hero = newHero(); hero.stash = Array.from({ length: 200 }, (_, i) => ring(`stored-${i}`)); placeItems(hero.stash, 30);
  const before = structuredClone(hero);
  assert.equal(unequipToItems(hero, hero.stash, 'weapon', 30, { x: 0, y: 24 }), false); assert.deepEqual(hero, before);
  const shared = [{ ...ring('occupied'), x: 8, y: 8 }], sharedBefore = structuredClone(shared);
  assert.throws(() => moveSharedItem(hero, shared, { direction: 'unequip', slot: 'weapon', position: { x: 8, y: 7 } }), /空间不足/);
  assert.deepEqual(hero, before); assert.deepEqual(shared, sharedBefore);
  moveSharedItem(hero, shared, { direction: 'unequip', slot: 'weapon', position: { x: 5, y: 7 } });
  assert.equal(hero.equipment.weapon, null); assert.deepEqual({ x: shared[1].x, y: shared[1].y }, { x: 5, y: 7 });
  const other = newHero(); other.inventory = [ring('duplicate'), ring('duplicate')];
  assert.equal(unequipToItems(other, other.inventory, 'weapon'), false);
});

test('left and right rings exchange with full storage and preserve stats, resources and item references', () => {
  const hero = newHero(), left = ring('left'), right = ring('right');
  left.mods = { strength: 30, life: 20 }; right.mods = { dexterity: 15, mana: 10 };
  hero.equipment.ring = left; hero.equipment.ring2 = right;
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  hero.inventory = Array.from({ length: 40 }, (_, i) => ring(`full-${i}`)); placeItems(hero.inventory);
  const before = structuredClone(hero), attributes = stats(hero);
  assert.ok(swapRingSlots(hero, 'ring', 'ring2'));
  assert.equal(hero.equipment.ring, right); assert.equal(hero.equipment.ring2, left);
  assert.deepEqual(hero.inventory, before.inventory); assert.deepEqual(hero.stash, before.stash);
  assert.deepEqual(stats(hero), attributes); assert.equal(hero.hp, before.hp); assert.equal(hero.mana, before.mana);
  assert.ok(swapRingSlots(hero, 'ring2', 'ring')); assert.deepEqual(hero, before);
});

test('a worn ring moves into an empty opposite slot while invalid slot transfers do nothing', () => {
  const hero = newHero(), left = ring('left'); hero.equipment.ring = left;
  assert.ok(swapRingSlots(hero, 'ring', 'ring2')); assert.equal(hero.equipment.ring, null); assert.equal(hero.equipment.ring2, left);
  const before = structuredClone(hero);
  for (const [from, to] of [['ring', 'ring2'], ['ring2', 'ring2'], ['weapon', 'ring'], ['ring2', 'helm']] as const) assert.equal(swapRingSlots(hero, from, to), false);
  assert.deepEqual(hero, before);
});
