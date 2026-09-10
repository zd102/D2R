import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, equipItem, unequipItem } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { moveSharedItem } from '../src/shared-stash.ts';

const item = (code: string, id: string) => makeItem(BASES.find(base => base.baseCode === code)!, id);
function fixture() {
  const hero = newHero(); hero.level = 99; hero.strength = hero.dexterity = 200;
  hero.inventory = Array.from({ length: 40 }, (_, i) => item('rin', `bag-${i}`)); placeItems(hero.inventory);
  return hero;
}
test('private stash swaps directly with equipment while the backpack is full', () => {
  const hero = fixture(), backpack = structuredClone(hero.inventory), previous = hero.equipment.weapon!;
  hero.stash = [item('crs', 'from-stash')]; placeItems(hero.stash, 10);
  assert.ok(equipItem(hero, 'from-stash', undefined, 'stash'));
  assert.equal(hero.equipment.weapon?.id, 'from-stash');
  assert.deepEqual(hero.inventory, backpack);
  assert.deepEqual(hero.stash.map(item => item.id), [previous.id]);
  assert.ok(unequipItem(hero, 'weapon', 'stash'));
  assert.equal(hero.equipment.weapon, null); assert.equal(hero.stash.length, 2);
});
test('two-handed weapons return both displaced items to their source', () => {
  const hero = fixture(), previous = [hero.equipment.weapon!.id, hero.equipment.shield!.id];
  hero.stash = [item('2hs', 'two-hands')];
  assert.ok(equipItem(hero, 'two-hands', undefined, 'stash'));
  assert.equal(hero.equipment.shield, null);
  assert.deepEqual(hero.stash.map(item => item.id).sort(), previous.sort());
  const shield = hero.stash.find(item => item.slot === 'shield')!;
  assert.ok(equipItem(hero, shield.id, undefined, 'stash'));
  assert.equal(hero.equipment.weapon, null); assert.ok(hero.stash.some(item => item.id === 'two-hands'));
});
test('requirements and failed backpack unequips never mutate item coordinates or resources', () => {
  const hero = fixture(); hero.stash = [{ ...item('crs', 'unidentified'), identified: false, x: 7, y: 4 }];
  const before = structuredClone(hero);
  assert.equal(equipItem(hero, 'unidentified', undefined, 'stash'), false);
  assert.equal(unequipItem(hero, 'weapon'), false);
  assert.deepEqual(hero, before);
});
test('shared equipment swaps reuse the released space and support a chosen ring slot', () => {
  const hero = fixture(); hero.equipment.ring2 = item('rin', 'old-right');
  const shared = Array.from({ length: 100 }, (_, i) => item('rin', `shared-${i}`)); placeItems(shared, 10);
  const backpack = structuredClone(hero.inventory);
  moveSharedItem(hero, shared, { direction: 'equip', itemId: 'shared-0', target: 'ring2' });
  assert.equal(hero.equipment.ring2?.id, 'shared-0'); assert.equal(shared.length, 100);
  assert.ok(shared.some(item => item.id === 'old-right')); assert.deepEqual(hero.inventory, backpack);
  const before = structuredClone({ hero, shared });
  assert.throws(() => moveSharedItem(hero, shared, { direction: 'unequip', slot: 'weapon' }), /空间不足/);
  assert.deepEqual({ hero, shared }, before);
});
test('a shared swap that cannot fit displaced sword and shield preserves both sides', () => {
  const hero = fixture(), shared = [item('2hs', 'incoming'), ...Array.from({ length: 94 }, (_, i) => item('rin', `full-${i}`))];
  assert.ok(placeItems(shared, 10));
  const before = structuredClone({ hero, shared });
  assert.throws(() => moveSharedItem(hero, shared, { direction: 'equip', itemId: 'incoming' }), /空间不足/);
  assert.deepEqual({ hero, shared }, before);
});
test('shared unequip preserves item data without requiring backpack space', () => {
  const hero = fixture(), old = structuredClone(hero.equipment.weapon!);
  const shared: typeof hero.stash = [];
  moveSharedItem(hero, shared, { direction: 'unequip', slot: 'weapon' });
  const moved = { ...shared[0] }; delete moved.x; delete moved.y;
  assert.deepEqual(moved, old); assert.equal(hero.equipment.weapon, null);
});
