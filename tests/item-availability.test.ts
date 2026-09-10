import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, SPECIAL_ITEMS, RUNEWORDS, AVAILABLE_RUNEWORDS, makeItem, rollItem, specialPool, runewordFits } from '../src/items.ts';
import { CHEST_MISC, CHEST_TREASURES } from '../src/chest-data.ts';
import { chestContext, chestTreasure, chestItem, rollChestCodes, rollChestLoot, type ChestContext } from '../src/chests.ts';
import { rollLoot } from '../src/loot.ts';
import { BOSS_DROP_PROFILES, bossSpecialPool } from '../src/boss-loot.ts';
import { LEVELS, AREA_LEVELS } from '../src/campaign.ts';
import { CLASS_IDS } from '../src/classes.ts';
import { ENCYCLOPEDIA_ITEMS, encyclopediaItem, itemDropSources, recipeBases } from '../src/encyclopedia.ts';
import { newHero, insertRune, parseSave, serializeSave } from '../src/model.ts';

const unsupportedClasses = new Set(['nec', 'bar', 'dru', 'ass']);
const removedMisc = CHEST_MISC.filter(item => !/^[hm]p[1-5]$/.test(item.code));
const rng = (seed = 921) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// Select a particular original treasure leaf, with NoDrop for the other three picks.
function drawsForCode(context: ChestContext, target: string): number[] | undefined {
  const path = (code: string): number[] | undefined => {
    if (code === target) return [];
    const table = CHEST_TREASURES.find(table => table.id === code);
    if (!table) return undefined;
    const total = table.noDrop + table.entries.reduce((sum, [, weight]) => sum + weight, 0);
    let start = table.noDrop;
    for (const [entry, weight] of table.entries) {
      const rest = path(entry);
      if (rest) return [(start + weight / 2) / total, ...rest];
      start += weight;
    }
  };
  const result = path(chestTreasure(context).id);
  return result ? [.5, ...result, 0, 0, 0] : undefined;
}

test('every removed miscellaneous item is unreachable even when its original chest branch is selected', () => {
  assert.equal(removedMisc.length, 43);
  const contexts = LEVELS.flatMap(level => [0, 1, 2].map(diff => chestContext(level, diff)));
  for (const misc of removedMisc) {
    const context = contexts.find(context => drawsForCode(context, misc.code));
    assert.ok(context, `${misc.name} had a reachable source`);
    const draws = drawsForCode(context, misc.code)!;
    let index = 0;
    assert.deepEqual(rollChestCodes(context, () => draws[index++] ?? 0), [], misc.name);
    index = 0;
    assert.deepEqual(rollChestLoot(context, () => draws[index++] ?? 0), [{ gold: 5 + context.level }, { potion: 0 }], misc.name);
  }
  for (const code of ['hp1', 'mp1', 'rin', 'amu', 'jew', 'cm1', 'gld']) {
    const draws = drawsForCode(contexts[0], code)!; let index = 0;
    assert.deepEqual(rollChestCodes(contexts[0], () => draws[index++] ?? 0), [code], code);
  }
});

test('unavailable class gear is excluded from all monster and boss pools across 75 encounters', () => {
  const removedBases = BASES.filter(base => unsupportedClasses.has(base.requiredClass ?? ''));
  const removedSpecials = SPECIAL_ITEMS.filter(item => unsupportedClasses.has(item.requiredClass ?? ''));
  assert.equal(removedBases.length, 66); assert.equal(removedSpecials.length, 19);
  for (const base of removedBases) assert.throws(() => chestItem(base, 99), /Unavailable chest base/);
  for (const rarity of ['unique', 'set'] as const) {
    assert.ok(specialPool(99, rarity).every(item => !unsupportedClasses.has(item.requiredClass ?? '')));
  }
  const random = rng(), seenClasses = new Set<string>();
  for (const profile of BOSS_DROP_PROFILES) for (const diff of [0, 1, 2]) {
    const area = LEVELS[profile.levelIndex], level = Math.min(99, AREA_LEVELS[diff][area.index] + 3);
    assert.ok(bossSpecialPool(profile, level, diff).every(item => !unsupportedClasses.has(item.requiredClass ?? '')));
    for (const rank of ['monster', 'elite', 'miniboss', 'actBoss'] as const) for (let i = 0; i < 12; i++) {
      const drops = rollLoot({ level, act: area.act, difficulty: diff, rank, levelIndex: area.index, firstClear: i === 0 }, random);
      for (const item of drops.items) {
        assert.ok(!item.misc && !unsupportedClasses.has(item.requiredClass ?? ''), item.name);
        if (item.requiredClass) seenClasses.add(item.requiredClass);
      }
    }
  }
  assert.deepEqual(seenClasses, new Set(['pal', 'ama', 'sor']));
});

test('random jewelry always has properties while common weapons and socket bases remain available', () => {
  const random = rng(), seen = new Set<string>(); let common = 0, socketed = 0;
  for (let i = 0; i < 6000; i++) {
    const item = rollItem(99, 0, false, 0, random);
    if (['rin', 'amu', 'jew'].includes(item.baseCode ?? '')) {
      seen.add(item.baseCode!); assert.equal(item.rarity, 'magic');
      assert.ok(Object.values(item.mods ?? {}).some(value => value !== 0), item.name);
    } else { common += Number(item.rarity === 'common'); socketed += Number((item.sockets ?? 0) > 0); }
  }
  assert.deepEqual(seen, new Set(['rin', 'amu', 'jew'])); assert.ok(common > 0 && socketed > 0);
});

test('unavailable recipes and sources disappear and legacy claws cannot consume crafting runes', () => {
  const chaos = RUNEWORDS.find(word => word.catalogId === 'Runeword16')!;
  assert.ok(chaos); assert.ok(!AVAILABLE_RUNEWORDS.includes(chaos));
  assert.deepEqual(recipeBases(chaos), []); assert.equal(encyclopediaItem('word-Runeword16'), undefined);
  for (const base of BASES.filter(base => unsupportedClasses.has(base.requiredClass ?? ''))) {
    assert.ok(!ENCYCLOPEDIA_ITEMS.some(entry => entry.base === base));
    const item = makeItem(base); item.sockets = 3;
    assert.equal(runewordFits(item, chaos), false);
    const hero = newHero(); hero.stash = [item]; hero.runes = [...chaos.runes];
    const before = serializeSave(hero);
    assert.equal(insertRune(hero, item.id, chaos.runes[0]), false);
    assert.equal(serializeSave(hero), before); assert.deepEqual(parseSave(before)!.stash, hero.stash);
  }
  for (const special of SPECIAL_ITEMS.filter(item => unsupportedClasses.has(item.requiredClass ?? ''))) {
    assert.equal(encyclopediaItem(special.catalogId!), undefined);
    for (const diff of [0, 1, 2]) assert.deepEqual(itemDropSources({ id: special.catalogId!, name: special.name, english: '', kind: special.rarity, level: special.level, icon: '', special }, diff), []);
  }
  // Base IDs remain stable after filtering, so links to existing equipment still work.
  for (const entry of ENCYCLOPEDIA_ITEMS) if (entry.base) assert.equal(entry.id, `base-${BASES.indexOf(entry.base)}`);
});

test('new characters and missing legacy fields receive no unused scrolls or ammo; owned counts persist', () => {
  for (const classId of CLASS_IDS) {
    const hero = newHero(classId); assert.equal(hero.identifyScrolls, 0); assert.deepEqual(hero.ammo, { arrows: 0, bolts: 0 });
    const save = JSON.parse(serializeSave(hero)); delete save.hero.identifyScrolls; delete save.hero.ammo;
    assert.equal(parseSave(JSON.stringify(save))!.identifyScrolls, 0);
    assert.deepEqual(parseSave(JSON.stringify(save))!.ammo, { arrows: 0, bolts: 0 });
    hero.identifyScrolls = 5; hero.ammo = { arrows: 60, bolts: 7 };
    assert.equal(parseSave(serializeSave(hero))!.identifyScrolls, 5);
    assert.deepEqual(parseSave(serializeSave(hero))!.ammo, hero.ammo);
  }
});
