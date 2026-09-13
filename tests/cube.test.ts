import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, hasCube, activateQuestObject, selectCampaignLevel, transferItem, stats, activeCharms, parseSave, serializeSave, equipItem, unequipItem, identifyItem, sellItem } from '../src/model.ts';
import { BASES, makeItem, packItems, placeItems, moveItem } from '../src/items.ts';

const item = (id: string, code = 'rin') => makeItem(BASES.find(base => base.baseCode === code)!, id);
const unlocked = () => { const hero = newHero(); hero.cubeUnlocked = true; return hero; };

test('the Halls cube objective permanently unlocks storage without requiring its boss', () => {
  const hero = newHero(); hero.campaign.cleared = [6, 0, 0]; hero.campaign.current = 6;
  hero.inventory = [item('ring')];
  assert.equal(hasCube(hero), false); assert.equal(transferItem(hero, 'ring', 'cube'), false);
  assert.equal(activateQuestObject(hero, 1), false);
  assert.ok(activateQuestObject(hero, 0)); assert.ok(hasCube(hero)); assert.equal(hero.bossDefeated, false);
  assert.ok(transferItem(hero, 'ring', 'cube'));
  assert.ok(selectCampaignLevel(hero, 0)); assert.ok(hasCube(hero));
  assert.ok(parseSave(serializeSave(hero))!.cubeUnlocked);
  const other = newHero(); other.campaign.current = 2;
  activateQuestObject(other, 0); assert.equal(hasCube(other), false);
});

test('cube has exactly 3 by 4 cells; failed deposits and withdrawals are atomic', () => {
  const hero = unlocked(); hero.inventory = Array.from({ length: 13 }, (_, i) => item(`r${i}`));
  for (let i = 0; i < 12; i++) assert.ok(transferItem(hero, `r${i}`, 'cube'));
  const before = serializeSave(hero); assert.equal(transferItem(hero, 'r12', 'cube'), false); assert.equal(serializeSave(hero), before);
  assert.ok(packItems(hero.cube, 4, 3));
  hero.inventory = Array.from({ length: 40 }, (_, i) => item(`full${i}`)); placeItems(hero.inventory);
  const full = serializeSave(hero); assert.equal(transferItem(hero, 'r0', 'inventory'), false); assert.equal(serializeSave(hero), full);
});

test('cross-container swaps work even when both containers are full and previews never mutate', () => {
  const hero = unlocked(); hero.inventory = Array.from({ length: 40 }, (_, i) => item(`bag${i}`));
  hero.cube = Array.from({ length: 12 }, (_, i) => item(`cube${i}`)); placeItems(hero.inventory); placeItems(hero.cube, 4, 3);
  const before = serializeSave(hero);
  assert.ok(transferItem(hero, 'bag0', 'cube', { x: 2, y: 3 }, true)); assert.equal(serializeSave(hero), before);
  assert.ok(transferItem(hero, 'bag0', 'cube', { x: 2, y: 3 }));
  assert.equal(hero.inventory.find(i => i.x === 0 && i.y === 0)!.id, 'cube11');
  assert.equal(hero.cube.find(i => i.x === 2 && i.y === 3)!.id, 'bag0');
  assert.ok(transferItem(hero, 'bag0', 'inventory', { x: 0, y: 0 }));
  const original = JSON.parse(before).hero;
  const byId = (items: typeof hero.inventory) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(hero.inventory), byId(original.inventory)); assert.deepEqual(byId(hero.cube), byId(original.cube));
});

test('large items exchange only fully covered items, and reject out-of-bounds cube moves', () => {
  const hero = unlocked(); hero.inventory = [item('armor', 'qui')]; hero.cube = [item('a'), item('b'), item('large', 'qui')];
  placeItems(hero.inventory); placeItems(hero.cube, 4, 3);
  const before = serializeSave(hero);
  assert.equal(transferItem(hero, 'armor', 'cube', { x: 2, y: 0 }), false);
  assert.equal(transferItem(hero, 'a', 'inventory', { x: 0, y: 0 }), false);
  assert.equal(serializeSave(hero), before);
  hero.cube = [item('a'), item('b')]; placeItems(hero.cube, 4, 3);
  assert.ok(transferItem(hero, 'armor', 'cube', { x: 0, y: 0 }));
  assert.deepEqual(new Set(hero.inventory.map(i => i.id)), new Set(['a', 'b']));
  assert.equal(moveItem(hero.cube, 'armor', 2, 0, 4, 3), false);
});

test('cube charms grant no life, attributes, skills or other bonuses; returning restores them', () => {
  const hero = unlocked(), base = stats(hero);
  const charm = { ...item('charm'), charm: true, identified: true, mods: { life: 50, strength: 20, allSkills: 1, runWalk: 15 } };
  hero.inventory.push(charm); const carrying = stats(hero); hero.hp = carrying.maxHp;
  assert.equal(carrying.maxHp, base.maxHp + 50); assert.equal(activeCharms(hero).length, 1);
  assert.ok(transferItem(hero, charm.id, 'cube'));
  assert.equal(activeCharms(hero).length, 0); assert.deepEqual(stats(hero), base); assert.equal(hero.hp, base.maxHp);
  assert.ok(transferItem(hero, charm.id, 'inventory')); assert.deepEqual(stats(hero), carrying);
});

test('old saves receive a cube; contents survive save/load and duplicate or overflowing items are recovered', () => {
  const hero = unlocked(); hero.campaign.cleared = [7, 0, 0]; hero.cube = [item('saved')]; placeItems(hero.cube, 4, 3);
  assert.deepEqual(parseSave(serializeSave(hero))!.cube, hero.cube);
  const old = JSON.parse(serializeSave(hero)); delete old.hero.cube; delete old.hero.cubeUnlocked;
  const migrated = parseSave(JSON.stringify(old))!; assert.ok(migrated.cubeUnlocked); assert.deepEqual(migrated.cube, []);
  hero.inventory = [item('duplicate')]; hero.cube = [item('duplicate'), ...Array.from({ length: 13 }, (_, i) => item(`overflow${i}`))];
  const loaded = parseSave(serializeSave(hero))!;
  assert.equal(loaded.cube.length, 12); assert.equal(loaded.stash.length, 1);
  assert.equal(new Set([...loaded.inventory, ...loaded.stash, ...loaded.cube].map(i => i.id)).size, 14);
});

test('cube equipment swaps honor its smaller layout and support identification and selling', () => {
  const hero = unlocked(); hero.level = 99; hero.strength = hero.dexterity = 200;
  hero.cube = [item('sword', 'crs')]; const previous = hero.equipment.weapon!.id;
  assert.ok(equipItem(hero, 'sword', 'weapon', 'cube')); assert.equal(hero.cube[0].id, previous);
  assert.equal(unequipItem(hero, 'weapon', 'cube'), false, 'two 2x3 swords cannot fit in 3x4');
  hero.cube[0].identified = false; hero.gold = 100;
  assert.ok(identifyItem(hero, previous)); assert.ok(sellItem(hero, previous)); assert.equal(hero.cube.some(i => i.id === previous), false);
  assert.ok(unequipItem(hero, 'weapon', 'cube')); assert.ok(packItems(hero.cube, 4, 3));
});
