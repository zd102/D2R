import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, AVAILABLE_RUNEWORDS as RUNEWORDS, RUNES, makeItem, specialItem, socketItem, rollItem, itemMods, isAvailableItem, type RuneWord } from '../src/items.ts';
import { CATALOG_BASES, CATALOG_SPECIALS, CATALOG_RUNEWORDS } from '../src/item-catalog-data.ts';
import { catalogMods, catalogModifierRanges } from '../src/item-catalog.ts';
import { newHero, identifyItem, serializeSave, parseSave, insertJewel, stats } from '../src/model.ts';
import { encyclopediaItemPreview, ENCYCLOPEDIA_ITEMS } from '../src/encyclopedia.ts';
import { itemModifierLines } from '../src/item-description.ts';
import { chestItem } from '../src/chests.ts';
import { rollBossSpecial, BOSS_DROP_PROFILES } from '../src/boss-loot.ts';
import { rollLoot } from '../src/loot.ts';
import { SaveStore } from '../src/saves.ts';

const seeded = (seed = 90210) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const special = (key: string, random = seeded()) => specialItem(CATALOG_SPECIALS.find(entry => entry.key === key)!.id, random);
const recipe = (key: string) => RUNEWORDS.find(word => word.catalogId === CATALOG_RUNEWORDS.find(entry => entry.key === key)!.id)!;
function craft(word: RuneWord, random: () => number, slot = 'weapon') {
  const base = BASES.find(base => isAvailableItem(base) && base.slot === slot && word.bases!.includes(base.name) && base.sockets! >= word.runes.length)
    ?? BASES.find(base => isAvailableItem(base) && word.bases!.includes(base.name) && base.sockets! >= word.runes.length)!;
  const item = makeItem(base); item.sockets = word.runes.length;
  for (const rune of word.runes) assert.ok(socketItem(item, rune, random));
  assert.equal(item.rarity, 'runeword'); return item;
}

test('every unique and set rolls supported variables to both endpoints and persists the exact results', () => {
  let variableItems = 0;
  for (const entry of CATALOG_SPECIALS) {
    const low = specialItem(entry.id, () => 0), high = specialItem(entry.id, () => 1);
    assert.deepEqual(low.mods, catalogMods(entry.properties, () => 0), entry.key);
    assert.deepEqual(high.mods, catalogMods(entry.properties, () => 1), entry.key);
    if (JSON.stringify(low.mods) !== JSON.stringify(high.mods)) variableItems++;
    for (const item of [low, high, specialItem(entry.id, seeded())]) {
      assert.equal(item.catalogVersion, 2); assert.equal(item.catalogRolls!.length, entry.properties.length);
      const hero = newHero(); hero.stash = [item];
      assert.deepEqual(parseSave(serializeSave(hero))!.stash[0], item, entry.key);
      const bounds = catalogModifierRanges(item);
      for (const [key, range] of Object.entries(bounds)) assert.ok(item.mods![key as keyof typeof item.mods]! >= range[0] && item.mods![key as keyof typeof item.mods]! <= range[1], `${entry.key}:${key}`);
    }
  }
  assert.ok(variableItems > 300);
});

test('all 77 available recipes roll only on completion and include rune bonuses exactly once on every supported slot', () => {
  for (const word of RUNEWORDS) for (const slot of word.slots) {
    const entry = CATALOG_RUNEWORDS.find(entry => entry.id === word.catalogId)!;
    for (const endpoint of [0, 1]) {
      let draws = 0; const item = craft(word, () => { draws++; return endpoint; }, slot);
      assert.equal(draws, entry.properties.length, word.name);
      const expected = catalogMods(entry.properties, () => endpoint);
      for (const rune of word.runes) for (const [key, value] of Object.entries(RUNES[rune][item.slot === 'weapon' ? 'weapon' : item.slot === 'shield' ? 'shield' : 'armor'])) expected[key as keyof typeof expected] = (expected[key as keyof typeof expected] ?? 0) + value!;
      const base = makeItem(BASES.find(base => base.name === item.base)!);
      for (const [key, value] of Object.entries(base.mods ?? {})) expected[key as keyof typeof expected] = (expected[key as keyof typeof expected] ?? 0) + value!;
      assert.deepEqual(item.mods, expected, word.name); assert.deepEqual(itemMods(item), expected, word.name);
      const hero = newHero(); hero.stash = [item]; assert.deepEqual(parseSave(serializeSave(hero))!.stash[0], item, word.name);
    }
  }
  const spirit = recipe('Spirit'), item = makeItem(BASES.find(base => base.baseCode === 'crs')!); item.sockets = 4;
  const fail = () => { throw new Error('Premature property roll'); };
  for (const rune of spirit.runes.slice(0, -1)) assert.ok(socketItem(item, rune, fail));
  assert.equal(item.catalogRolls, undefined);
  socketItem(item, spirit.runes.at(-1)!, () => 1); const before = structuredClone(item);
  assert.equal(socketItem(item, 'el', fail), false); assert.deepEqual(item, before);
});

test('independent rolls cover the inclusive distribution while fixed stats and combat damage ranges stay intact', () => {
  const random = seeded(), counts = new Map<number, number>();
  for (let i = 0; i < 8000; i++) {
    const item = special('Skin of the Vipermagi', random), resistance = item.mods!.allRes!;
    counts.set(resistance, (counts.get(resistance) ?? 0) + 1); assert.equal(item.mods!.fcr, 30);
  }
  assert.equal(counts.size, 16); for (const count of counts.values()) assert.ok(count > 390 && count < 610, String(count));
  let i = 0;
  assert.deepEqual(catalogMods([['res-all', '', 20, 35], ['vit', '', 10, 20]], () => [0, 1][i++]), { allRes: 20, vitality: 20 });
  assert.equal(i, 2);
  assert.deepEqual(catalogMods([['dmg-fire', '', 5, 30], ['all-stats', '', 10, 20]], () => 0), { fireMinDamage: 5, fireMaxDamage: 30, strength: 10, dexterity: 10, vitality: 10, energy: 10 });
});

test('random sockets use legal base caps, including Natalya, Aldur and Griswold set items', () => {
  for (const entry of CATALOG_SPECIALS) {
    const property = entry.properties.find(([code]) => code === 'sock'); if (!property) continue;
    const [, param, min, max] = property, cap = CATALOG_BASES.find(base => base.code === entry.code)!.sockets;
    assert.equal(specialItem(entry.id, () => 0).sockets, Math.min(cap, Number(param) || min), entry.key);
    assert.equal(specialItem(entry.id, () => 1).sockets, Math.min(cap, Number(param) || max), entry.key);
    if (min !== max) {
      const seen = new Set(Array.from({ length: 100 }, (_, i) => specialItem(entry.id, () => i / 100).sockets));
      assert.equal(seen.size, Math.min(max, cap) - Math.min(min, cap) + 1, entry.key);
    }
  }
});

test('recipe ranges do not shift with rolled values, socket runes or inherited base modifiers', () => {
  for (const endpoint of [0, 1]) {
    const spirit = craft(recipe('Spirit'), () => endpoint), bounds = catalogModifierRanges(spirit);
    assert.deepEqual(bounds.fcr, [25, 35]); assert.deepEqual(bounds.mana, [89, 112]);
    const insight = craft(recipe('Insight'), () => endpoint);
    assert.equal(insight.mods!.minDamage, 9); assert.deepEqual(catalogModifierRanges(insight).damage, [200, 260]);
    assert.ok(itemModifierLines(spirit).some(line => line.range === '25 - 35'));
  }
  const word = recipe('Spirit'), base = makeItem(BASES.find(base => base.baseCode === 'crs')!); base.sockets = 4; base.mods = { mana: 17 };
  for (const rune of word.runes) socketItem(base, rune, () => 1);
  assert.equal(base.mods.mana, 129); assert.deepEqual(catalogModifierRanges(base).mana, [106, 129]);
});

test('identification, equipment stats, previews and repeated reloads never reroll owned items or socketed facets', () => {
  const hero = newHero(); hero.gold = 1000; hero.level = 90; hero.strength = 200;
  const armor = special('Skin of the Vipermagi', () => 0), facet = specialItem(CATALOG_SPECIALS.find(entry => entry.code === 'jew')!.id, () => 1);
  const before = structuredClone(armor); hero.inventory = [armor]; assert.ok(identifyItem(hero, armor.id)); assert.deepEqual(armor.mods, before.mods);
  const target = craft(recipe('Spirit'), () => 0); hero.stash = [target];
  const common = makeItem(BASES.find(base => base.slot === 'helm')!); common.sockets = 1; facet.identified = true; hero.inventory.push(common, facet);
  assert.ok(insertJewel(hero, common.id, facet.id)); assert.equal(common.socketedJewels![0].catalogVersion, 2);
  assert.deepEqual(common.socketedJewels![0].mods, facet.mods);
  hero.equipment.armor = armor; hero.inventory = hero.inventory.filter(item => item !== armor);
  for (let i = 0; i < 3; i++) {
    const saved = serializeSave(hero); assert.deepEqual(parseSave(saved), hero); assert.deepEqual(parseSave(serializeSave(parseSave(saved)!)), hero);
    const state = stats(hero); assert.equal(state.mods.allRes, 20); assert.deepEqual(armor.mods, before.mods);
    for (const entry of ENCYCLOPEDIA_ITEMS.filter(entry => entry.special || entry.word)) assert.deepEqual(encyclopediaItemPreview(entry), encyclopediaItemPreview(entry));
    assert.equal(serializeSave(hero), saved);
  }
});

test('existing catalog-v1 values and ranged modifiers are preserved; legacy facets only gain missing mappings', () => {
  const hero = newHero(), bow = special('Buriza-Do Kyanon', () => 0); bow.catalogVersion = 1; delete bow.catalogRolls;
  bow.mods!.pierceChance = 87; bow.quantity = 0;
  const spirit = craft(recipe('Spirit'), () => .5); spirit.catalogVersion = 1; delete spirit.catalogRolls;
  hero.stash = [bow, spirit]; assert.deepEqual(parseSave(serializeSave(hero))!.stash, hero.stash);
  const facet = specialItem(CATALOG_SPECIALS.find(entry => entry.code === 'jew')!.id, () => 1);
  const host = makeItem(BASES.find(base => base.slot === 'armor')!); host.sockets = 1;
  host.socketedJewels = [{ name: facet.name, catalogId: facet.catalogId, mods: { ...facet.mods } }]; hero.stash = [host];
  const restored = parseSave(serializeSave(hero))!; assert.deepEqual(restored.stash[0].socketedJewels![0].mods, facet.mods);
  assert.deepEqual(parseSave(serializeSave(restored)), restored);
});

test('monster, chest, boss-special and event-charm drops receive the supplied random stream', () => {
  const afterSelection = () => { let n = 0; return () => n++ < 2 ? 0 : 1; };
  const normal = rollItem(99, 1, true, 0, afterSelection());
  const chest = chestItem(BASES.find(base => base.baseCode === 'rin')!, 99, 0, afterSelection());
  const boss = rollBossSpecial(BOSS_DROP_PROFILES[24], 99, 2, 0, afterSelection())!;
  for (const item of [normal, chest, boss]) {
    const entry = CATALOG_SPECIALS.find(entry => entry.id === item.catalogId)!;
    assert.deepEqual(item.mods, catalogMods(entry.properties, () => 1));
  }
  const loot = rollLoot({ rank: 'miniboss', act: 4, difficulty: 2, level: 99, uberDiablo: true }, () => 0);
  const annihilus = loot.items.find(item => item.catalogId === 'unique-382')!; assert.ok(annihilus);
  assert.equal(annihilus.mods!.allRes, 10); assert.equal(annihilus.mods!.strength, 10);
});

test('default runtime RNG varies item rolls and malformed saved roll metadata is bounded', t => {
  const id = CATALOG_SPECIALS.find(entry => entry.key === 'Skin of the Vipermagi')!.id;
  t.mock.method(Math, 'random', () => 0); const low = specialItem(id);
  t.mock.method(Math, 'random', () => .999999); const high = specialItem(id);
  assert.notDeepEqual(low.mods, high.mods);
  const hero = newHero(); hero.stash = [low]; const raw = JSON.parse(serializeSave(hero));
  raw.hero.stash[0].catalogRolls = [null, -1, 10, 'invalid', ...Array(100).fill(.25)];
  const restored = parseSave(JSON.stringify(raw))!.stash[0]; assert.equal(restored.catalogRolls!.length, 64);
  assert.ok(restored.catalogRolls!.every(value => Number.isFinite(value) && value >= 0 && value < 1));
  assert.deepEqual(restored.mods, low.mods);
});

test('character export/import preserves randomized equipment, stored items and recipe ranges', () => {
  const data = new Map<string, string>(), store = new SaveStore({
    get length() { return data.size; }, key(index: number) { return [...data.keys()][index] ?? null; },
    getItem(key: string) { return data.get(key) ?? null; }, setItem(key: string, value: string) { data.set(key, value); }, removeItem(key: string) { data.delete(key); },
  });
  const profile = store.create('Original');
  profile.hero.inventory = [special('Skin of the Vipermagi', () => 0), special("Tal Rasha's Fire-Spun Cloth", () => 1)];
  profile.hero.stash = [craft(recipe('Spirit'), () => 1)];
  store.save(profile.id, profile.hero, profile.revision);
  const copy = store.importCharacter(store.exportCharacter(profile.id).content, 'Imported');
  assert.notEqual(copy.id, profile.id); assert.deepEqual(copy.hero.inventory, profile.hero.inventory); assert.deepEqual(copy.hero.stash, profile.hero.stash);
  assert.deepEqual(catalogModifierRanges(copy.hero.stash[0]).fcr, [25, 35]);
});
