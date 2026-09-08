import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats, gainXp, equipItem, rollItem, parseSave, serializeSave } from '../src/model.ts';
import { makeItem, BASES } from '../src/items.ts';

test('level rewards cross multiple thresholds and fully recover resources', () => {
  const hero = newHero(); hero.hp = 1; hero.mana = 0;
  assert.equal(gainXp(hero, 1505), true);
  assert.equal(hero.level, 3); assert.equal(hero.xp, 5); assert.equal(hero.points, 10); assert.equal(hero.skillPoints, 2);
  assert.equal(hero.hp, stats(hero).maxHp); assert.equal(hero.mana, stats(hero).maxMana);
});
test('equipping swaps the previous item into the bag without deleting equipment', () => {
  const hero = newHero(); const item = makeItem(BASES[0], 'replacement');
  const old = hero.equipment.weapon;
  hero.inventory.push(item); assert.equal(equipItem(hero, item.id), true);
  assert.equal(hero.equipment.weapon?.id, item.id); assert.deepEqual(hero.inventory, [old]);
  assert.equal(equipItem(hero, 'missing'), false);
});
test('save round trip preserves progression and inventory', () => {
  const hero = newHero(); gainXp(hero, 100); hero.shrines = [0, 2]; hero.inventory = [rollItem(2, 1, true)]; hero.gold = 125;
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('invalid and malicious saves cannot inject item markup or invalid stats', () => {
  assert.equal(parseSave('broken'), null); assert.equal(parseSave('{"version":2}'), null);
  const hero = newHero();
  const loaded = parseSave(JSON.stringify({ version: 1, hero: { ...hero, level: -50, hp: -20, mana: null, shrines: [0, 0, 7], inventory: [{ id: 'bad', name: 'invalid', slot: 'script', power: 99 }], equipment: { weapon: { ...hero.equipment.weapon, power: 'oops' } } } }));
  assert.equal(loaded?.level, 1); assert.equal(loaded?.hp, 1); assert.equal(loaded?.mana, 15);
  assert.deepEqual(loaded?.shrines, [0]); assert.deepEqual(loaded?.inventory, []);
  assert.equal(loaded?.equipment.weapon?.id, 'starter-sword');
});
test('boss rewards always use unique rarity', () => {
  for (let i = 0; i < 20; i++) assert.equal(rollItem(4, 0, true).rarity, 'unique');
});
