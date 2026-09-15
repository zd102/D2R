import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABLE_RUNEWORDS, BASES, makeItem, socketItem, runewordFits, type Item } from '../src/items.ts';
import { newHero, parseSave, serializeSave } from '../src/model.ts';
import { compatibleRunewords, socketRuneword } from '../src/runeword-crafting.ts';

const recipe = (name: string) => AVAILABLE_RUNEWORDS.find(word => word.name === name)!;
const baseFor = (name: string | typeof AVAILABLE_RUNEWORDS[number]) => {
  const word = typeof name === 'string' ? recipe(name) : name, base = BASES.find(base => (base.sockets ?? 0) >= word.runes.length && runewordFits({ ...makeItem(base, 'candidate'), sockets: word.runes.length }, word))!;
  return { ...makeItem(base, 'craft-base'), sockets: word.runes.length };
};

test('ready recipes come first and availability is recalculated without reordering the catalog', () => {
  const item = baseFor('隐密'), stealth = recipe('隐密'), before = JSON.stringify(AVAILABLE_RUNEWORDS);
  const ready = compatibleRunewords(item, stealth.runes);
  assert.equal(ready[0].word.catalogId, stealth.catalogId); assert.deepEqual(ready[0].missing, []);
  assert.ok(ready.slice(1).every(option => option.missing.length > 0));
  const depleted = compatibleRunewords(item, []);
  assert.ok(depleted.every(option => option.missing.length > 0));
  assert.equal(JSON.stringify(AVAILABLE_RUNEWORDS), before);
});

test('every craftable runeword matches manual socketing without consuming unrelated runes', () => {
  for (const word of AVAILABLE_RUNEWORDS) {
    const hero = newHero(), item = baseFor(word), manual = structuredClone(item);
    hero.inventory = [item]; hero.runes = [...word.runes, 'zod'];
    for (const rune of word.runes) assert.ok(socketItem(manual, rune, () => .25));
    assert.ok(socketRuneword(hero, item.id, word.catalogId!, () => .25), word.name);
    assert.deepEqual(item, manual, word.name); assert.deepEqual(hero.runes, ['zod']);
    const before = serializeSave(hero); assert.equal(socketRuneword(hero, item.id, word.catalogId!), false); assert.equal(serializeSave(hero), before);
  }
});

test('valid rune prefixes can be completed in inventory, private stash and cube and saved', () => {
  for (const container of ['inventory', 'stash', 'cube'] as const) {
    const hero = newHero(), item = baseFor('精神'), word = recipe('精神'); hero.cubeUnlocked = true;
    socketItem(item, word.runes[0]); hero[container] = [item]; hero.runes = word.runes.slice(1);
    assert.deepEqual(compatibleRunewords(item, hero.runes).find(r => r.word === word)!.remaining, word.runes.slice(1));
    assert.ok(socketRuneword(hero, item.id, word.catalogId!, () => .5)); assert.deepEqual(hero.runes, []);
    const loaded = parseSave(serializeSave(hero))!; assert.equal(loaded[container][0].catalogId, word.catalogId);
  }
});

test('duplicate rune requirements count missing copies and failure preserves everything', () => {
  const word = AVAILABLE_RUNEWORDS.find(word => new Set(word.runes).size < word.runes.length)!, hero = newHero(), item = baseFor(word);
  hero.inventory = [item]; hero.runes = [...new Set(word.runes)];
  const option = compatibleRunewords(item, hero.runes).find(option => option.word === word)!;
  assert.ok(option.missing.length > 0);
  const before = serializeSave(hero); assert.equal(socketRuneword(hero, item.id, word.catalogId!), false); assert.equal(serializeSave(hero), before);
});

test('wrong base, socket count, rune order, jewels, unidentified and magic equipment are rejected atomically', () => {
  const word = recipe('精神');
  const cases: ((item: Item) => void)[] = [
    item => { item.sockets = 3; }, item => { item.runes = ['el']; }, item => { item.identified = false; }, item => { item.rarity = 'magic'; },
    item => { item.slot = 'boots'; }, item => { item.socketedJewels = [{ name: 'jewel', mods: {} }]; },
  ];
  for (const mutate of cases) {
    const hero = newHero(), item = baseFor('精神'); mutate(item); hero.inventory = [item]; hero.runes = [...word.runes];
    const before = serializeSave(hero); assert.equal(socketRuneword(hero, item.id, word.catalogId!), false); assert.equal(serializeSave(hero), before);
  }
  const hero = newHero(); hero.cube = [baseFor('精神')]; hero.runes = [...word.runes];
  assert.equal(socketRuneword(hero, hero.cube[0].id, word.catalogId!), false);
  assert.equal(socketRuneword(hero, 'missing-item', word.catalogId!), false);
});
