import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFFIX_DATA } from '../src/affix-data.ts';
import { BASE_CODES, CHARM_BASES, affixBase, affixLevel, eligibleAffixes, applyAffixes, affixById, affixRanges, affixSocketCap, rollAffix, elementalDamage, poisonDamage, type CharmSize } from '../src/affixes.ts';
import { BASES, makeItem, addMods, type Item, type Modifier } from '../src/items.ts';
import { rollCharm } from '../src/loot.ts';
import { newHero, stats, equipmentMods, parseSave, serializeSave, identifyItem, moveStorage, skillLevel } from '../src/model.ts';
import { itemModifierLines, itemWeaponDamage } from '../src/item-description.ts';
const seeded = (seed = 119) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const equipment = (name: string, level = 99, rarity: 'magic' | 'rare' = 'magic') => ({ ...makeItem(BASES.find(b => b.name === name)!), level, rarity });
const charm = (size: CharmSize, level = 99): Item => ({ id: `charm-${size}`, name: CHARM_BASES[size].name, base: CHARM_BASES[size].name, slot: 'amulet', rarity: 'magic', level, power: 0, value: 80, charm: true, charmSize: size, width: 1, height: CHARM_BASES[size].height, mods: {} });
const find = (item: Item, name: string, level?: number) => {
  const affix = eligibleAffixes(item).find(a => a.name === name && (level === undefined || a.level === level));
  assert.ok(affix, `${item.base}: ${name} ${level ?? ''}`); return affix;
};

test('all current bases map to original quality levels; charm levels use the nonlinear affix formula', () => {
  assert.ok(BASES.every(base => base.baseCode || BASE_CODES[base.name]));
  for (const base of BASES) { const profile = affixBase(makeItem(base)); assert.ok(profile.level > 0 && profile.type); }
  assert.equal(affixBase(equipment('幻化之刃')).level, 73);
  assert.equal(affixBase(equipment('饰金盾牌')).level, 51);
  assert.equal(affixLevel(60, 28), 46); assert.equal(affixLevel(61, 28), 47);
  assert.equal(affixLevel(93, 28), 87); assert.equal(affixLevel(94, 28), 89);
  assert.equal(affixLevel(1, 28), 14); assert.equal(affixLevel(99, 28), 99);
  assert.equal(affixLevel(50, 1), 50); assert.equal(affixLevel(30, 24, 3), 33);
});

test('every imported property is supported and rolls within its inclusive, unscaled range', () => {
  assert.ok(AFFIX_DATA.length >= 700); assert.equal(new Set(AFFIX_DATA.map(a => a.id)).size, AFFIX_DATA.length);
  const random = seeded();
  for (const affix of AFFIX_DATA) {
    const low = rollAffix(affix, () => 0), high = rollAffix(affix, () => 1);
    for (let i = 0; i < 8; i++) {
      const rolled = rollAffix(affix, random);
      for (const key of Object.keys(rolled.mods) as Modifier[]) {
        const value = rolled.mods[key]!;
        assert.ok(Number.isFinite(value) && value >= Math.min(low.mods[key]!, high.mods[key]!) && value <= Math.max(low.mods[key]!, high.mods[key]!), `${affix.id}: ${key}`);
      }
      assert.ok(rolled.sockets >= low.sockets && rolled.sockets <= high.sockets);
    }
  }
});

test('blue-only high tiers and exact item-type exclusions are respected', () => {
  const magic = equipment('水晶剑'), rare = equipment('水晶剑', 99, 'rare');
  const cruel = find(magic, 'Cruel', 51); assert.deepEqual(rollAffix(cruel, () => 0).mods, { damage: 201 }); assert.deepEqual(rollAffix(cruel, () => 1).mods, { damage: 300 });
  assert.equal(find(rare, 'Cruel', 56).requiredLevel, 48);
  assert.ok(!eligibleAffixes(rare).some(a => a.name === "Grandmaster's" || a.name === "Jeweler's"));
  assert.ok(eligibleAffixes(magic).some(a => a.name === "Grandmaster's"));
  assert.equal(rollAffix(find(rare, 'Trump')).mods.attackRatingPerLevel, 16.5);
  assert.equal(rollAffix(find(rare, 'Trump')).mods.maxDamagePerLevel, .5);
  assert.equal(rollAffix(find(equipment('头盔'), 'Visionary')).mods.attackRatingPercentPerLevel, 1);
  for (const name of ['头盔', '皮帽', '军帽', '皮手套']) assert.ok(!eligibleAffixes(equipment(name)).some(a => a.properties.some(p => ['pal', 'cast1', 'cast3'].includes(p[0]))), name);
  assert.ok(!eligibleAffixes(equipment('戒指')).some(a => a.properties.some(p => ['pal', 'skilltab', 'swing1', 'swing2', 'swing3'].includes(p[0]))));
  assert.ok(!eligibleAffixes(equipment('项链')).some(a => a.properties.some(p => ['move1', 'move2', 'move3'].includes(p[0]))));
  assert.ok(!eligibleAffixes(equipment('水晶剑')).some(a => a.properties.some(p => ['cast1', 'cast3'].includes(p[0]))));
  assert.deepEqual(rollAffix(find(equipment('统治者大盾'), 'of Deflecting')).mods, { block: 20, fbr: 30 });
  assert.deepEqual(rollAffix(find(equipment('水晶剑'), 'of Ages')).mods, { indestructible: 1 });
  assert.ok(!eligibleAffixes(equipment('项链', 89)).some(a => a.name === "Priest's"));
  assert.equal(find(equipment('项链', 90), "Priest's").requiredLevel, 67);
});

test('magic counts use 50% suffix / 25% prefix / 25% both, while rares use original 3-6 weighting and 3/3 caps', () => {
  const counts = { prefix: 0, suffix: 0, both: 0 }, rareCounts = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 800; i++) {
    const first = (i + .5) / 800, random = seeded(i + 1); let initial = true;
    const rng = () => { if (initial) { initial = false; return first; } return random(); };
    const item = applyAffixes(equipment('戒指'), rng), affixes = item.affixes!.map(id => affixById(id)!);
    counts[affixes.length === 2 ? 'both' : affixes[0].kind]++;
    initial = true; const rare = applyAffixes(equipment('戒指', 99, 'rare'), rng); rareCounts[rare.affixes!.length]++;
  }
  assert.deepEqual(counts, { suffix: 400, prefix: 200, both: 200 });
  assert.deepEqual(rareCounts.slice(3), [100, 200, 300, 200]);
});

test('generated gear never duplicates groups, exceeds quality caps or scales values with area level', () => {
  const random = seeded();
  for (const base of BASES) for (const level of [1, 10, 30, 60, 99]) for (const rarity of ['magic', 'rare'] as const) {
    const item = applyAffixes({ ...makeItem(base), level, rarity }, random), allowed = new Set(eligibleAffixes(item).map(a => a.id)), affixes = item.affixes!.map(id => affixById(id)!);
    assert.ok(affixes.length > 0 && affixes.length <= (rarity === 'magic' ? 2 : 6));
    assert.equal(new Set(affixes.map(a => a.group)).size, affixes.length);
    for (const kind of ['prefix', 'suffix']) assert.ok(affixes.filter(a => a.kind === kind).length <= (rarity === 'magic' ? 1 : 3));
    assert.ok(affixes.every(a => allowed.has(a.id)));
    assert.equal(item.requiredLevel, Math.max(1, affixBase(item).requiredLevel, ...affixes.map(a => a.requiredLevel)));
    const ranges = affixRanges(item);
    for (const key of Object.keys(ranges) as Modifier[]) assert.ok(item.mods![key]! >= ranges[key]![0] && item.mods![key]! <= ranges[key]![1]);
    assert.ok((item.sockets ?? 0) <= affixSocketCap(item));
  }
});

test('socket affixes respect original base and item-level caps, with at most two rare sockets', () => {
  assert.equal(affixSocketCap(equipment('圆盾')), 1); assert.equal(affixSocketCap(equipment('头盔')), 2);
  assert.equal(affixSocketCap(equipment('统治者大盾', 25)), 3); assert.equal(affixSocketCap(equipment('统治者大盾', 41)), 4);
  assert.equal(affixSocketCap(equipment('巨战权杖', 25)), 3); assert.equal(affixSocketCap(equipment('巨战权杖', 26)), 5);
  for (const base of BASES) for (const a of eligibleAffixes({ ...makeItem(base), rarity: 'rare', level: 99 })) assert.ok(rollAffix(a, () => 1).sockets <= 2);
});

test('small charms allow 3/20/20 and 5 all-res / 7 MF with accurate level gates, but never skill bonuses', () => {
  const small = charm('small');
  assert.deepEqual(rollAffix(find(small, 'Fine'), () => 1).mods, { attackRating: 20, maxDamage: 3 });
  assert.deepEqual(rollAffix(find(small, 'of Vita'), () => 0).mods, { life: 16 });
  assert.deepEqual(rollAffix(find(small, 'of Vita'), () => 1).mods, { life: 20 });
  assert.equal(find(small, 'of Vita').requiredLevel, 39);
  assert.deepEqual(rollAffix(find(small, 'Shimmering'), () => 1).mods, { allRes: 5 });
  assert.deepEqual(rollAffix(find(small, 'of Good Luck'), () => 1).mods, { magicFind: 7 });
  assert.ok(!eligibleAffixes(charm('small', 60)).some(a => a.name === 'of Vita'));
  assert.ok(eligibleAffixes(charm('small', 61)).some(a => a.name === 'of Vita'));
  assert.ok(!eligibleAffixes(charm('small', 46)).some(a => a.name === 'Shimmering'));
  assert.ok(eligibleAffixes(charm('small', 47)).some(a => a.name === 'Shimmering'));
  assert.ok(!eligibleAffixes(small).some(a => a.properties.some(p => ['pal', 'skilltab'].includes(p[0]))));
});

test('large and grand charms have separate maxima; 45-life skillers require ilvl 91 and cannot roll 50 life', () => {
  assert.equal(rollAffix(find(charm('large'), 'of Vita', 74), () => 1).mods.life, 35);
  assert.equal(rollAffix(find(charm('grand'), 'of Vita', 91), () => 1).mods.life, 45);
  assert.ok(!eligibleAffixes(charm('grand', 90)).some(a => a.name === 'of Vita' && a.level === 91));
  assert.ok(!eligibleAffixes(charm('grand', 49)).some(a => a.properties.some(p => p[0] === 'skilltab')));
  assert.equal(find(charm('grand', 50), 'Lion Branded').requiredLevel, 42);
  assert.ok(!eligibleAffixes(charm('large')).some(a => a.properties.some(p => p[0] === 'skilltab')));
  for (const a of eligibleAffixes(charm('grand'))) assert.ok((rollAffix(a, () => 1).mods.life ?? 0) <= 45);
  assert.equal(find(charm('grand'), 'Lion Branded').group, find(charm('grand'), "Captain's").group);
});

test('three charm footprints and independent affixes survive identification, storage and saving without rerolls', () => {
  const random = seeded(), hero = newHero(); hero.level = 99; hero.gold = 10000;
  const sizes = new Set<CharmSize>();
  for (let i = 0; i < 1000; i++) {
    const item = rollCharm(99, random); sizes.add(item.charmSize!);
    assert.equal(item.height, CHARM_BASES[item.charmSize!].height); assert.equal(item.width, 1);
    assert.ok(item.affixes!.length >= 1 && item.affixes!.length <= 2);
    if (item.charmSize === 'small') assert.ok(!((item.mods?.life ?? 0) && (item.mods?.magicFind ?? 0)), 'small charm life and MF are both suffixes');
    if (hero.inventory.length < 3 && !hero.inventory.some(i => i.charmSize === item.charmSize)) hero.inventory.push(item);
  }
  assert.equal(sizes.size, 3);
  for (const item of hero.inventory) { const before = structuredClone(item.mods); identifyItem(hero, item.id); assert.deepEqual(item.mods, before); }
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
  const legacy = { ...makeItem(BASES[0]), rarity: 'magic' as const, mods: { strength: 16, fireDamage: 32 } }; hero.stash.push(legacy);
  assert.deepEqual(parseSave(serializeSave(hero))!.stash[0], legacy);
  const id = hero.inventory[0].id; assert.equal(moveStorage(hero, id, true), true);
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
});

test('poison uses original fixed point rates, adds lengths within one item and averages lengths across items', () => {
  const small = charm('small'); addMods(small.mods!, rollAffix(find(small, 'Pestilent')).mods); addMods(small.mods!, rollAffix(find(small, 'of Anthrax')).mods);
  const poison = poisonDamage(small.mods!); assert.equal(Math.floor(poison.max), 451); assert.equal(poison.seconds, 12);
  assert.ok(!eligibleAffixes(charm('small', 93)).some(a => a.name === 'Pestilent'));
  assert.ok(eligibleAffixes(charm('small', 94)).some(a => a.name === 'Pestilent'));
  const hero = newHero(); hero.level = 99; hero.inventory = [small];
  assert.deepEqual(poisonDamage(equipmentMods(hero)), poison);
  const second = charm('small'); second.mods = rollAffix(find(second, 'of Anthrax')).mods; hero.inventory.push(second);
  const combined = equipmentMods(hero); assert.equal(combined.poisonFrames, 225); assert.equal(combined.poisonMaxRate, 471);
  second.identified = false; assert.equal(equipmentMods(hero).poisonFrames, 300);
  hero.stash = [small]; hero.inventory = []; assert.equal(poisonDamage(equipmentMods(hero)).seconds, 0);
});

test('per-level affixes and Paladin bonuses affect actual stats, and descriptions expose exact variable bounds', () => {
  const hero = newHero(); hero.level = 80;
  const before = stats(hero); hero.equipment.weapon!.mods = { maxDamagePerLevel: .5, attackRatingPerLevel: 16.5, paladinSkills: 2 };
  assert.equal(stats(hero).weaponMax - before.weaponMax, 40); assert.equal(stats(hero).baseAttackRating - before.baseAttackRating, 1320);
  hero.skills.sacrifice = 1; assert.equal(skillLevel(hero, 'sacrifice'), 3);
  const item = equipment('水晶剑'), cruel = find(item, 'Cruel', 51); item.affixes = [cruel.id]; item.mods = rollAffix(cruel, () => 1).mods;
  assert.deepEqual(itemModifierLines(item), [{ text: '+300 增强伤害 %', range: '201 - 300' }]);
  assert.equal(itemWeaponDamage(item, 80, { damage: 300, minDamage: 1, maxDamage: 3, maxDamagePerLevel: .5 }), '21 - 103');
  assert.equal(elementalDamage({ fireMinDamage: 5, fireMaxDamage: 10 }, 'fire', () => 0), 5);
  assert.equal(elementalDamage({ fireMinDamage: 5, fireMaxDamage: 10 }, 'fire', () => 1), 10);
  const forged = JSON.parse(serializeSave(hero)); forged.hero.equipment.weapon.affixes = ['bad', null, cruel.id, cruel.id];
  assert.deepEqual(parseSave(JSON.stringify(forged))!.equipment.weapon!.affixes, [cruel.id]);
});
