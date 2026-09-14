import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, groundItemName, itemMods, socketItem, RUNEWORDS, type Item } from '../src/items.ts';
import { baseQualityChance, rollBaseProperties, rollBaseQuality } from '../src/base-properties.ts';
import { BASE_AUTO_MODS } from '../src/base-property-data.ts';
import { newHero, parseItem, repairCost, repairEquipment } from '../src/model.ts';
import { itemModifierLines } from '../src/item-description.ts';
const base = (code: string, level = 90) => { const item = makeItem(BASES.find(base => base.baseCode === code)!); item.level = level; return item; };
const sequence = (...numbers: number[]) => { let n = 0; return () => numbers[n++] ?? .5; };
const seeded = (seed = 731) => () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };

test('superior probability uses expansion ItemRatio, qlvl, ilvl and class-specific rows', () => {
  for (const [code, expected] of [['crs', 1 / 12], ['pa1', 1 / 9]] as const) {
    const template = BASES.find(base => base.baseCode === code)!;
    assert.equal(baseQualityChance(template, template.level, 'HiQuality', 9999), expected);
    assert.equal(baseQualityChance(template, template.level + 8, 'HiQuality'), 1 / (1 / expected - 1));
  }
  const item = base('crs', 11), template = BASES.find(base => base.baseCode === 'crs')!;
  rollBaseQuality(item, template, sequence(1 / 12 - .000001)); assert.equal(item.baseQuality, 'superior');
  const normal = base('crs', 11); rollBaseQuality(normal, template, sequence(1 / 12, 0)); assert.equal(normal.baseQuality, undefined);
});

test('paladin shields roll exactly one automod and rare shields exclude magic-only tiers', () => {
  const random = seeded(), seen = new Set<string>();
  for (let n = 0; n < 1000; n++) {
    const item = base('pa1'); if (n % 2) item.rarity = 'rare';
    rollBaseProperties(item, random);
    assert.ok(item.autoMod); seen.add(item.autoMod);
    assert.notEqual(!!item.mods?.allRes, !!item.mods?.damage);
    if (item.rarity === 'rare') assert.ok(BASE_AUTO_MODS.find(row => row.id === item.autoMod)!.rare);
    assert.deepEqual(parseItem(item), item);
  }
  assert.equal(seen.size, 10);
});

test('staffmod count boundaries, skill rank boundaries and D2R forbidden skill exclusion', () => {
  for (const [roll, count] of [[.30, 0], [.31, 1], [.70, 1], [.71, 2], [.90, 2], [.91, 3]]) {
    const item = base('sst', 1);
    rollBaseProperties(item, sequence(roll, .5, 0, .59, .5, .2, .6, .5, .4, .9), { ethereal: false });
    assert.equal(item.staffMods?.length ?? 0, count);
    if (count === 3) assert.deepEqual(item.staffMods!.map(skill => skill.level), [1, 2, 3]);
  }
  // Tier five, Holy Shield selected on every retry: do not leak a forbidden skill.
  const scepter = base('scp'); rollBaseProperties(scepter, sequence(.5, .5, .2, .2, .2, .2, .2, .2), { ethereal: false });
  assert.equal(scepter.staffMods?.length ?? 0, 0);
});

test('Amazon skills and orb automods use their own groups; natural sockets obey difficulty caps', () => {
  const random = seeded(821), bows = new Set<number>(), orbs = new Set<string>();
  for (let n = 0; n < 1500; n++) {
    const bow = rollBaseProperties(base('am1'), random); bows.add(bow.mods!.bowSkills!);
    assert.ok(!bow.ethereal); assert.ok(!bow.staffMods);
    const spear = rollBaseProperties(base('am3'), random); assert.ok(spear.mods!.javelinSkills! >= 1 && spear.mods!.javelinSkills! <= 3);
    const orb = rollBaseProperties(base('ob1'), random); orbs.add(orb.mods!.life ? 'life' : 'mana');
    assert.notEqual(!!orb.mods!.life, !!orb.mods!.mana);
    for (const difficulty of [0, 1, 2]) {
      const item = rollBaseProperties(base('crs'), random, { sockets: true, difficulty });
      assert.ok((item.sockets ?? 0) <= [3, 4, 6][difficulty]);
    }
  }
  assert.deepEqual([...bows].sort(), [1, 2, 3]); assert.equal(orbs.size, 2);
  const blade = rollBaseProperties(base('dgr'), () => .99); assert.ok(!blade.staffMods, 'No unopened Warlock skills');
});

test('ethereal is 5% for eligible items and excluded from low, set and indestructible bases', () => {
  for (const [roll, expected] of [[.049999, true], [.05, false]] as const) assert.equal(!!rollBaseProperties(base('crs'), () => roll).ethereal, expected);
  for (const code of ['7cr', 'sbw', 'lxb']) assert.ok(!rollBaseProperties(base(code), () => 0).ethereal);
  for (const kind of ['low', 'set', 'indestructible']) {
    const item = base('crs'); if (kind === 'low') item.baseQuality = 'low'; else if (kind === 'set') item.rarity = 'set'; else item.mods = { indestructible: 1 };
    assert.ok(!rollBaseProperties(item, () => 0).ethereal);
  }
  const random = seeded(); let count = 0;
  for (let n = 0; n < 10000; n++) count += Number(!!rollBaseProperties(base('crs'), random).ethereal);
  assert.ok(count > 430 && count < 570, String(count));
});

test('superior ethereal armor uses max defense plus one, integer rounding and reduced durability', () => {
  const item = base('uit'); item.baseQuality = 'superior';
  // defense roll, select defense+durability group, 15 ED, 15 durability, ethereal roll
  rollBaseProperties(item, sequence(0, .99, .999, .999, 0));
  assert.equal(item.power, Math.floor(149 * 1.5));
  assert.equal(item.mods?.enhancedDefense, 15); assert.equal(item.mods?.maxDurabilityPercent, 15);
  assert.equal(item.maxDurability, 50); assert.equal(item.requiredStrength, 146);
  assert.match(groundItemName(item), /超强.*无形/);
  item.durability = 1;
  const hero = newHero(); hero.inventory = [item]; hero.gold = 10000;
  assert.equal(repairCost(hero), 0); repairEquipment(hero); assert.equal(item.durability, 1);
});

test('native mods stay visible before identification and survive runewords and saves without rerolling', () => {
  const item = base('pa1'); rollBaseProperties(item, sequence(0, 0, 0, .5)); item.identified = false;
  item.mods!.magicFind = 99;
  const html = itemModifierLines({ ...item, mods: item.baseMods }).map(line => line.text).join();
  assert.match(html, /\+5 所有抗性/); assert.ok(!html.includes('+99'));
  item.identified = true; delete item.mods!.magicFind; item.sockets = 4;
  const before = structuredClone(item.baseMods);
  const spirit = RUNEWORDS.find(word => word.name === '精神')!;
  for (const rune of spirit.runes) assert.ok(socketItem(item, rune, () => .5));
  assert.equal(item.rarity, 'runeword'); assert.equal(item.mods!.allRes, 5);
  assert.deepEqual(item.baseMods, before); assert.deepEqual(parseItem(item), item);
  assert.deepEqual(rollBaseProperties(item, () => { throw Error('reroll'); }), item);
  assert.equal(itemMods(base('scp')).damageUndead, 50);
});
