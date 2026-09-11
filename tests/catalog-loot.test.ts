import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, SPECIAL_ITEMS, RUNEWORDS, RUNE_ORDER, MOD_NAMES, makeItem, specialItem, specialPool, runewordFits, socketItem, itemMods, filledSockets } from '../src/items.ts';
import { CATALOG_BASES, CATALOG_SPECIALS, CATALOG_RUNEWORDS, CATALOG_SETS, EXCLUDED_QUEST_ITEMS } from '../src/item-catalog-current.ts';
import { BOSS_DROP_PROFILES, bossSpecialPool } from '../src/boss-loot.ts';
import { AREA_LEVELS } from '../src/campaign.ts';
import { runeDistribution, rollLoot } from '../src/loot.ts';
import { newHero, parseSave, serializeSave, equipReason, insertJewel, activeCharms, equipmentMods } from '../src/model.ts';
import { itemModifierLines } from '../src/item-description.ts';
const seeded = (seed = 431) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

test('the complete enabled LoD catalog is linked by stable IDs, with no missing bases, sets or recipes', () => {
  assert.equal(CATALOG_BASES.length, 499); assert.equal(new Set(BASES.map(base => base.baseCode)).size, 499);
  assert.ok(BASES.every(base => base.itemType !== 'tpot'));
  assert.equal(SPECIAL_ITEMS.filter(item => item.rarity === 'unique').length, 379);
  assert.equal(SPECIAL_ITEMS.filter(item => item.rarity === 'set').length, 127);
  assert.equal(CATALOG_SETS.length, 32); assert.equal(EXCLUDED_QUEST_ITEMS.length, 6);
  assert.deepEqual(new Set(SPECIAL_ITEMS.map(item => item.catalogId)), new Set(CATALOG_SPECIALS.map(item => item.id)));
  assert.deepEqual(new Set(RUNEWORDS.map(item => item.catalogId)), new Set(CATALOG_RUNEWORDS.map(item => item.id)));
  assert.equal(new Set(SPECIAL_ITEMS.map(item => item.name)).size, SPECIAL_ITEMS.length);
  for (const item of SPECIAL_ITEMS) {
    assert.ok(BASES.some(base => base.name === item.base && base.baseCode === item.baseCode), item.name);
    for (const [key, value] of Object.entries(item.mods)) assert.ok(Object.hasOwn(MOD_NAMES, key) && Number.isFinite(value), `${item.name}: ${key}`);
  }
});
test('new item kinds and every named special survive saves, including all eight distinct facets', () => {
  for (const template of SPECIAL_ITEMS) {
    const hero = newHero(), item = specialItem(template.catalogId!); hero.stash = [item];
    assert.deepEqual(parseSave(serializeSave(hero))?.stash, [item], template.name);
  }
  const facets = SPECIAL_ITEMS.filter(item => item.baseCode === 'jew'); assert.equal(facets.length, 8);
  assert.equal(new Set(facets.map(item => item.name)).size, 8);
  const orb = makeItem(BASES.find(base => base.itemType === 'orb')!); orb.identified = true;
  assert.equal(equipReason(newHero(), orb), '仅限法师');
});
test('unique drop eligibility uses qlvl and treasure class, never equip requirements or event-only entries', () => {
  const soj = SPECIAL_ITEMS.find(item => item.name === '乔丹之石')!;
  assert.equal(soj.level, 29); assert.equal(soj.qualityLevel, 39); assert.equal(soj.dropWeight, 1);
  assert.equal(SPECIAL_ITEMS.find(item => item.name === '拿各的戒指')!.dropWeight, 15);
  assert.ok(!specialPool(38, 'unique').includes(soj)); assert.ok(specialPool(39, 'unique').includes(soj));
  const grandfather = SPECIAL_ITEMS.find(item => item.catalogId === CATALOG_SPECIALS.find(item => item.key === 'The Grandfather')!.id)!;
  assert.ok(!specialPool(99, 'unique', 78).includes(grandfather)); assert.ok(specialPool(99, 'unique', 87).includes(grandfather));
  assert.ok(specialPool(99, 'unique').every(item => !item.eventOnly));
  assert.equal(SPECIAL_ITEMS.filter(item => item.eventOnly).length, 2);
});
test('all 25 bosses have valid preferred items and eligible special loot in all three difficulties', () => {
  assert.equal(BOSS_DROP_PROFILES.length, 25);
  for (const profile of BOSS_DROP_PROFILES) {
    for (const name of profile.featured) assert.ok(CATALOG_SPECIALS.some(item => item.key === name && item.rarity === 'unique'), name);
    for (let diff = 0; diff < 3; diff++) {
      const level = Math.min(99, AREA_LEVELS[diff][profile.levelIndex] + 3);
      const pool = bossSpecialPool(profile, level, diff); assert.ok(pool.length, `${profile.levelIndex}:${diff}`);
      const result = rollLoot({ level, act: Math.floor(profile.levelIndex / 5), difficulty: diff, rank: profile.levelIndex % 5 === 4 ? 'actBoss' : 'miniboss', levelIndex: profile.levelIndex }, () => 0);
      for (const item of result.items.filter(item => item.rarity === 'unique' && !['unique-382', 'unique-401'].includes(item.catalogId!))) {
        const template = SPECIAL_ITEMS.find(entry => entry.catalogId === item.catalogId)!;
        assert.ok(template.qualityLevel! <= level && template.treasureClass! <= profile.maxTC[diff], `${item.name}:${profile.levelIndex}:${diff}`);
      }
    }
  }
});
test('rune treasure recursion preserves original probabilities and the rarity of high runes', () => {
  const low = runeDistribution(1); assert.deepEqual(low, [{ rune: 'el', weight: .6 }, { rune: 'eld', weight: .4 }]);
  const high = runeDistribution(17); assert.equal(high.length, 33);
  assert.ok(Math.abs(high.reduce((sum, rune) => sum + rune.weight, 0) - 1) < 1e-12);
  assert.equal(high.find(rune => rune.rune === 'zod')!.weight, 1 / 5171);
  assert.ok(high.find(rune => rune.rune === 'el')!.weight > high.find(rune => rune.rune === 'ber')!.weight * 10);
});
test('MF leaves rune quantities and identities unchanged, including Countess and all act bosses', () => {
  for (const index of [3, 4, 9, 14, 19, 24]) {
    const low = seeded();
    for (let n = 0; n < 100; n++) {
      // Each kill has its own random stream; equipment quality consumes a variable number of draws.
      const seed = Math.floor(low() * 1e8);
      const context = { level: 90, act: Math.floor(index / 5), difficulty: 2, rank: index === 3 ? 'miniboss' as const : 'actBoss' as const, levelIndex: index };
      const plain = rollLoot(context, seeded(seed)), mf = rollLoot({ ...context, magicFind: 1000 }, seeded(seed));
      assert.deepEqual(plain.runes, mf.runes); assert.equal(plain.gold, mf.gold);
    }
  }
});
test('Countess special runes stop at Ral/Io/Ist, while Hellforge first clears use the exact eleven-rune ranges', () => {
  for (let difficulty = 0; difficulty < 3; difficulty++) {
    const countess = { level: 99, act: 0, difficulty, rank: 'miniboss' as const, levelIndex: 3 };
    const random = seeded(52 + difficulty), maxima = [7, 15, 23];
    let total = 0;
    for (let n = 0; n < 1000; n++) {
      const result = rollLoot(countess, random); assert.ok(result.runes.length <= 4); total += result.runes.length;
      assert.ok(result.runes.slice(1).every(rune => RUNE_ORDER.indexOf(rune) <= maxima[difficulty]));
    }
    assert.ok(total > 2300 && total < 2800);
    const forge = { level: 99, act: 3, difficulty, rank: 'miniboss' as const, levelIndex: 17 };
    const first = rollLoot({ ...forge, firstClear: true }, () => .999999), repeat = rollLoot(forge, () => .999999);
    assert.equal(first.runes.length, 1); assert.equal(first.runes[0], ['amn', 'um', 'gul'][difficulty]); assert.deepEqual(repeat.runes, []);
  }
});
test('ordinary monsters cannot acquire boss, event-charm or Hellforge reward rolls', () => {
  const ordinary = { level: 99, act: 4, difficulty: 2, rank: 'monster' as const, firstClear: true };
  const expected = rollLoot(ordinary, seeded());
  for (const levelIndex of [3, 17, 19, 24]) {
    const result = rollLoot({ ...ordinary, levelIndex, countess: true }, seeded());
    assert.deepEqual(result.runes, expected.runes); assert.deepEqual(result.items.map(i => i.name), expected.items.map(i => i.name));
  }
});
test('jewels share socket capacity, cannot form runewords and retain their stats through saves', () => {
  const hero = newHero(), target = makeItem(BASES.find(base => base.name === '水晶剑')!); target.sockets = 4;
  const jewel = specialItem(SPECIAL_ITEMS.find(item => item.baseCode === 'jew')!.catalogId!); jewel.identified = true;
  hero.inventory = [target, jewel]; assert.equal(insertJewel(hero, target.id, jewel.id), true);
  assert.equal(hero.inventory.length, 1); assert.equal(filledSockets(target), 1); assert.equal(insertJewel(hero, target.id, jewel.id), false);
  for (const rune of ['tal', 'thul', 'ort'] as const) assert.equal(socketItem(target, rune), true);
  assert.equal(socketItem(target, 'amn'), false); assert.equal(target.rarity, 'common');
  assert.equal(runewordFits(target, RUNEWORDS.find(word => word.name === '精神')!), false);
  assert.ok(itemMods(target).lightningMaxDamage! > 0); assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('unique charms apply once per identity and non-Sigon sets never receive Sigon bonuses', () => {
  const hero = newHero(); hero.level = 99;
  const charm = specialItem('unique-382'); charm.identified = true; hero.inventory = [charm, { ...charm, id: 'duplicate' }];
  assert.equal(activeCharms(hero).length, 1); assert.equal(equipmentMods(hero).allSkills, 1);
  hero.inventory = [];
  const cathan = SPECIAL_ITEMS.filter(item => item.setId?.startsWith('Cathan') && ['ring', 'amulet'].includes(item.slot));
  assert.equal(cathan.length, 2);
  for (const template of cathan) { const item = specialItem(template.catalogId!); item.identified = true; hero.equipment[item.slot] = item; }
  assert.equal(equipmentMods(hero).lifeSteal, 6);
});
test('target-defense reduction has the beneficial sign and negative equipment penalties display and persist', () => {
  assert.equal(RUNEWORDS.find(word => word.name === '执法者')!.mods.targetDefense, 50);
  const entry = CATALOG_SPECIALS.find(item => item.key === "Andariel's Visage")!;
  const item = specialItem(entry.id), hero = newHero(); hero.stash = [item];
  assert.equal(item.mods?.fireRes, -30);
  assert.ok(itemModifierLines(item).some(line => line.text === '-30 火焰抗性'));
  assert.equal(parseSave(serializeSave(hero))?.stash[0].mods?.fireRes, -30);
});
