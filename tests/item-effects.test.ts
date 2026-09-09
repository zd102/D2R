import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogMods, catalogPropertyStatus, unappliedItemEffects } from '../src/item-catalog.ts';
import { CATALOG_BASES, CATALOG_SPECIALS, CATALOG_RUNEWORDS } from '../src/item-catalog-data.ts';
import { BASES, SPECIAL_ITEMS, RUNEWORDS, RUNES, makeItem, specialItem, socketItem, itemMods, type Item } from '../src/items.ts';
import { newHero, stats, equipmentMods, activeEquipment, parseSave, serializeSave, insertJewel, skillLevel, setAura, bindSkill } from '../src/model.ts';
import { itemDamage, absorbDamage, openWoundsDps } from '../src/item-effects.ts';
import { itemModifierLines } from '../src/item-description.ts';

const named = (key: string) => specialItem(CATALOG_SPECIALS.find(item => item.key.toLowerCase() === key.toLowerCase())!.id);
const wearable = (item: Item) => { item.identified = true; return item; };
const heroAt = (level: number) => Object.assign(newHero(), { level, strength: 300, dexterity: 200 });
function word(key: string, slot: 'weapon' | 'armor' | 'shield' | 'helm') {
  const recipe = RUNEWORDS.find(word => word.catalogId === CATALOG_RUNEWORDS.find(entry => entry.key === key)!.id)!;
  const base = BASES.find(base => base.slot === slot && recipe.bases!.includes(base.name))!, item = makeItem(base); item.sockets = recipe.runes.length;
  for (const rune of recipe.runes) assert.ok(socketItem(item, rune));
  return item;
}

test('all base combat values and every fixed equipment modifier come from the pinned catalog', () => {
  for (const base of BASES) {
    const original = CATALOG_BASES.find(entry => entry.code === base.baseCode)!;
    assert.equal(base.min, original.min, base.name); assert.equal(base.max, original.max, base.name);
    assert.equal(base.strength, original.strength, base.name); assert.equal(base.dexterity, original.dexterity, base.name);
    assert.equal(base.requiredLevel, Math.max(1, original.requiredLevel), base.name);
  }
  for (const item of SPECIAL_ITEMS) assert.deepEqual(item.mods, catalogMods(CATALOG_SPECIALS.find(entry => entry.id === item.catalogId)!.properties), item.name);
  assert.equal(named('Skin of the Vipermagi').mods!.fcr, 30);
  assert.equal(named('Griffon\'s Eye').mods!.fcr, 25);
  assert.equal(named('Griswold\'s Valor').mods!.coldAbsorbPerLevel, .25);
  const armor = named('Skin of the Vipermagi'); assert.equal(armor.power, CATALOG_BASES.find(base => base.code === armor.baseCode)!.defenseMax + 1);
});

test('rune bonuses apply once in both Spirit variants and poison keeps its original duration', () => {
  const sword = word('Spirit', 'weapon'), shield = word('Spirit', 'shield');
  assert.equal(sword.mods!.lifeSteal, 7); assert.equal(sword.mods!.lightningMaxDamage, 50);
  assert.equal(sword.mods!.poisonMinRate, 154); assert.equal(sword.mods!.poisonFrames, 125);
  assert.equal(shield.mods!.coldRes, 35); assert.equal(shield.mods!.reflectDamage, 14); assert.equal(shield.mods!.lifeSteal, undefined);
  assert.equal(RUNES.sol.weapon.minDamage, 9); assert.equal(RUNES.sol.weapon.damageFlat, undefined);
  assert.equal(RUNES.eld.armor.staminaDrain, 15);
});

test('item elemental pierce applies after immunity breaking, has a resistance floor and never affects other damage types', () => {
  const mods = { fireSkillDamage: 20, firePierce: 25 };
  assert.equal(itemDamage(100, 'fire', mods, 50), 90);
  assert.equal(itemDamage(100, 'fire', mods, 100), 0);
  assert.equal(itemDamage(100, 'fire', mods, 110, 50), 0);
  assert.ok(Math.abs(itemDamage(100, 'fire', mods, 110, 100) - 42) < 1e-9);
  assert.equal(itemDamage(100, 'fire', { firePierce: 1000 }, 0), 200);
  assert.equal(itemDamage(100, 'physical', mods, 50), 50);
  assert.equal(itemDamage(100, 'magic', mods, 50), 50);
  assert.equal(itemDamage(100, 'poison', { poisonSkillDamage: 25, poisonPierce: 20 }, 60), 75);
});

test('absorption caps percentage at forty and applies flat absorption after percentage', () => {
  assert.deepEqual(absorbDamage(100, 'fire', { fireAbsorb: 99, fireAbsorbFlat: 10 }), { damage: 50, healing: 50 });
  assert.deepEqual(absorbDamage(10, 'lightning', { lightningAbsorbFlat: 20 }), { damage: 0, healing: 10 });
  assert.deepEqual(absorbDamage(20, 'magic', { magicAbsorbFlat: 6 }), { damage: 14, healing: 6 });
  assert.deepEqual(absorbDamage(100, 'poison', { fireAbsorb: 99 }), { damage: 100, healing: 0 });
});

test('equipped auras add between items, compete with the selected same aura and retain hard-point synergies', () => {
  const hero = heroAt(90); hero.equipment.helm = word('Dream', 'helm'); hero.equipment.shield = word('Dream', 'shield');
  hero.skills.holyShock = 20; hero.skills.holyFire = 1; hero.skills.holyFreeze = 1; hero.skills.might = 1;
  setAura(hero, 'holyShock'); assert.equal(stats(hero).auras.find(aura => aura.id === 'holyShock')!.rank, 30);
  hero.equipment.amulet = wearable(named('Mara\'s Kaleidoscope')); assert.equal(stats(hero).auras[0].rank, 30);
  hero.equipment.weapon = word('Infinity', 'weapon'); hero.equipment.shield = null;
  assert.ok(stats(hero).auras.some(aura => aura.id === 'conviction' && aura.rank === 12));
  hero.equipment.weapon!.durability = 0; assert.ok(stats(hero).auras.every(aura => aura.id !== 'conviction'));
  const meditation = heroAt(90); const before = stats(meditation).manaRegen; meditation.equipment.weapon = word('Insight', 'weapon');
  assert.ok(stats(meditation).manaRegen > before * 5);
});

test('staffmods enable skills without spending points and survive bindings, saves and removing the item', () => {
  const hero = heroAt(50); hero.equipment.weapon!.mods = { skill_zeal: 3, allSkills: 1, fireSkills: 2, skill_holyFire: 1 };
  assert.equal(skillLevel(hero, 'zeal'), 4); assert.equal(skillLevel(hero, 'holyFire'), 4); assert.equal(hero.skills.zeal, 0);
  assert.ok(bindSkill(hero, 'cleave', 'zeal')); assert.ok(setAura(hero, 'holyFire'));
  const loaded = parseSave(serializeSave(hero))!; assert.equal(loaded.bindings.cleave, 'zeal'); assert.equal(loaded.activeAura, 'holyFire');
  loaded.equipment.weapon = null; assert.equal(skillLevel(loaded, 'zeal'), 0); assert.equal(stats(loaded).aura.id, null);
});

test('per-level attributes, deadly strike, absorption and magic find affect stats without self-qualifying equipment', () => {
  const hero = heroAt(80); hero.equipment.amulet = wearable(named('Highlord\'s Wrath'));
  assert.equal(equipmentMods(hero).deadlyStrike, 30);
  hero.equipment.weapon = wearable(named('Blade Of Ali Baba')); assert.equal(equipmentMods(hero).magicFind, 80); assert.equal(equipmentMods(hero).goldFind, 200);
  hero.equipment.shield = wearable(named('Blackoak Shield')); assert.equal(equipmentMods(hero).coldAbsorbFlat, 50);
  const weak = newHero(); weak.level = 80; weak.equipment.armor = makeItem(BASES.find(base => base.slot === 'armor')!);
  weak.equipment.armor.requiredStrength = 100; weak.equipment.armor.mods = { strengthPerLevel: 2 };
  assert.ok(!activeEquipment(weak).includes(weak.equipment.armor));
});

test('old fixed equipment and socketed facets migrate once without losing identities, placement or runes', () => {
  const hero = heroAt(90), spirit = word('Spirit', 'shield'); delete spirit.catalogVersion; spirit.mods = { allSkills: 2, coldRes: 35 };
  const facet = wearable(specialItem(CATALOG_SPECIALS.find(entry => entry.code === 'jew' && entry.properties.some(([code]) => code === 'extra-fire'))!.id));
  const armor = makeItem(BASES.find(base => base.slot === 'armor')!); armor.sockets = 2; hero.inventory = [armor, facet];
  assert.ok(insertJewel(hero, armor.id, facet.id)); armor.socketedJewels![0].mods = { fireMinDamage: 17 }; delete armor.socketedJewels![0].catalogId;
  hero.stash = [spirit]; const restored = parseSave(serializeSave(hero))!;
  assert.deepEqual(restored.stash[0].runes, spirit.runes); assert.equal(restored.stash[0].id, spirit.id); assert.equal(restored.stash[0].mods!.reflectDamage, 14);
  assert.equal(itemMods(restored.inventory[0]).firePierce, 4); assert.equal(itemMods(restored.inventory[0]).fireSkillDamage, 4);
  assert.deepEqual(parseSave(serializeSave(restored)), restored);
});

test('unsupported original effects are visible and never claimed to be functional', () => {
  const facet = specialItem(CATALOG_SPECIALS.find(entry => entry.code === 'jew')!.id);
  assert.ok(itemModifierLines(facet).some(line => line.text.includes('降低敌人')));
  assert.ok(unappliedItemEffects(facet).some(line => line.includes('触发')));
  assert.equal(catalogPropertyStatus(['aura', 'Conviction', 12, 12]), 'active');
  assert.equal(catalogPropertyStatus(['hit-skill', 'Life Tap', 5, 10]), 'active');
  assert.equal(catalogPropertyStatus(['hit-skill', 'Frozen Orb', 5, 10]), 'inactive');
  assert.equal(catalogPropertyStatus(['skilltab', '8', 2, 2]), 'other-class');
  assert.equal(catalogPropertyStatus(['*hp', '', -10, -10]), 'unused');
});

test('open wounds uses the five original level bands and halves boss damage', () => {
  for (const [level, expected] of [[10, 121], [30, 436], [45, 841], [60, 1381], [90, 2731]]) {
    assert.equal(openWoundsDps(level), expected * 25 / 256); assert.equal(openWoundsDps(level, true), openWoundsDps(level) / 2);
  }
});
