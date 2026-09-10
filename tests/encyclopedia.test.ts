import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENCYCLOPEDIA_ITEMS, ENCYCLOPEDIA_MONSTERS, filterEncyclopediaItems, filterEncyclopediaMonsters, encyclopediaItemPreview, itemDropSources } from '../src/encyclopedia.ts';
import { BASES, SPECIAL_ITEMS, AVAILABLE_RUNEWORDS, RUNE_ORDER, itemMods, isAvailableItem } from '../src/items.ts';
import { MONSTERS, BOSSES, ENCOUNTERS } from '../src/bestiary.ts';
import { newHero, serializeSave } from '../src/model.ts';

test('encyclopedia covers every current item, rune, recipe, supply and all campaign monsters', () => {
  assert.equal(ENCYCLOPEDIA_ITEMS.length, BASES.filter(isAvailableItem).length + SPECIAL_ITEMS.filter(isAvailableItem).length + AVAILABLE_RUNEWORDS.length + RUNE_ORDER.length + 2);
  assert.equal(new Set(ENCYCLOPEDIA_ITEMS.map(item => item.id)).size, ENCYCLOPEDIA_ITEMS.length);
  assert.equal(ENCYCLOPEDIA_MONSTERS.length, Object.keys(MONSTERS).length + BOSSES.length);
  assert.equal(new Set(ENCYCLOPEDIA_MONSTERS.map(item => item.id)).size, ENCYCLOPEDIA_MONSTERS.length);
  for (const entry of ENCYCLOPEDIA_MONSTERS) {
    assert.ok(entry.areas.length, entry.name);
    if (entry.rank === 'monster') for (const area of entry.areas) assert.ok(ENCOUNTERS[area].includes(entry.id));
  }
});
test('item search combines localized and English names, rune recipes, categories and equipment slots', () => {
  assert.equal(filterEncyclopediaItems('乔丹').length, 1);
  assert.equal(filterEncyclopediaItems('  stone OF jordan  ')[0].name, '乔丹之石');
  assert.equal(filterEncyclopediaItems('乔丹', 'set').length, 0);
  assert.equal(filterEncyclopediaItems('乔丹', 'unique', 'ring').length, 1);
  assert.equal(filterEncyclopediaItems('乔丹', 'unique', 'weapon').length, 0);
  assert.ok(filterEncyclopediaItems('tal thul ort amn', 'runeword').some(item => item.name === '精神'));
  const sorted = filterEncyclopediaItems('', 'unique', 'all', 'level');
  assert.ok(sorted.every((item, index) => !index || item.level >= sorted[index - 1].level));
  assert.equal(filterEncyclopediaItems('<not-an-item>').length, 0);
});
test('monster filtering uses encounter locations, rank and race including all five act bosses', () => {
  assert.equal(filterEncyclopediaMonsters('', 'actBoss').length, 5);
  assert.equal(filterEncyclopediaMonsters('', 'miniboss').length, 20);
  assert.deepEqual(filterEncyclopediaMonsters('baal').map(item => item.name), ['巴尔']);
  assert.equal(filterEncyclopediaMonsters('巴尔', 'all', '0').length, 0);
  assert.equal(filterEncyclopediaMonsters('巴尔', 'actBoss', '4', 'demon').length, 1);
  assert.ok(filterEncyclopediaMonsters('遗忘之塔').some(item => item.id === 'countess'));
  for (const entry of filterEncyclopediaMonsters('', 'monster', 'all', 'undead')) assert.equal(entry.definition.race, 'undead');
});
test('encyclopedia previews are independent and crafting reflects the selected base and actual rune bonuses', () => {
  const hero = newHero(), before = serializeSave(hero);
  const unique = ENCYCLOPEDIA_ITEMS.find(item => item.name === '乔丹之石')!;
  const preview = encyclopediaItemPreview(unique)!; preview.mods!.allSkills = 900;
  assert.equal(encyclopediaItemPreview(unique)!.mods!.allSkills, 1);
  const spirit = ENCYCLOPEDIA_ITEMS.find(item => item.name === '精神' && item.kind === 'runeword')!;
  const sword = encyclopediaItemPreview(spirit, '水晶剑')!, shield = encyclopediaItemPreview(spirit, '统治者大盾')!;
  assert.equal(sword.rarity, 'runeword'); assert.equal(shield.rarity, 'runeword');
  assert.equal(itemMods(shield).coldRes, 35); assert.equal(itemMods(sword).coldRes, undefined);
  assert.equal(serializeSave(hero), before);
});
test('drop links respect actual difficulty, unique quality gates, special charms, Countess and forge exceptions', () => {
  const soj = ENCYCLOPEDIA_ITEMS.find(item => item.name === '乔丹之石')!;
  assert.ok(!itemDropSources(soj, 0).some(source => source.area === 4));
  assert.ok(itemDropSources(soj, 1).some(source => source.area === 4 && source.kind === 'favored'));
  const annihilus = ENCYCLOPEDIA_ITEMS.find(item => item.id === 'unique-382')!;
  assert.deepEqual(itemDropSources(annihilus, 1), []);
  assert.deepEqual(itemDropSources(annihilus, 2), [{ monsterId: 'diablo', area: 19, kind: 'event' }]);
  const ist = ENCYCLOPEDIA_ITEMS.find(item => item.rune === 'ist')!;
  assert.ok(itemDropSources(ist, 2).some(source => source.area === 3 && source.kind === 'countess'));
  const amn = ENCYCLOPEDIA_ITEMS.find(item => item.rune === 'amn')!;
  assert.ok(itemDropSources(amn, 0).some(source => source.area === 17 && source.kind === 'forge'));
});
