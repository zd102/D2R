import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats, gainXp, skillLevel, learnSkill, learnReason, bindSkill, setAura, allocateAttribute, equipItem, unequipItem, activeEquipment, swapWeapons, moveStorage, identifyItem, insertRune, repairEquipment, grantQuestReward, respec, hitChance, resistedDamage, createCorpse, recoverCorpse, serializeSave, parseSave } from '../src/model.ts';
import { BASE_ATTRIBUTES, EXPERIENCE, SKILLS, skillValues, xpForLevel } from '../src/paladin.ts';
import { BASES, makeItem, specialItem, packItems, placeItems, socketItem, type Item } from '../src/items.ts';
import { SaveStore, PROFILE_PREFIX, RULES_BACKUP_PREFIX } from '../src/saves.ts';
const heroAt = (level: number) => { const hero = newHero(); gainXp(hero, EXPERIENCE[level - 1]); return hero; };
const base = (name: string) => makeItem(BASES.find(item => item.name === name)!);

test('paladin starts with canonical attributes and per-level resource growth', () => {
  const hero = newHero(), s = stats(hero);
  for (const key of Object.keys(BASE_ATTRIBUTES) as (keyof typeof BASE_ATTRIBUTES)[]) assert.equal(hero[key], BASE_ATTRIBUTES[key]);
  assert.equal(s.maxHp, 55); assert.equal(s.maxMana, 15); assert.equal(s.maxStamina, 89);
  gainXp(hero, 500); assert.equal(stats(hero).maxHp, 57); assert.equal(stats(hero).maxMana, 16.5); assert.equal(stats(hero).maxStamina, 90);
  allocateAttribute(hero, 'vitality'); allocateAttribute(hero, 'energy'); assert.equal(stats(hero).maxHp, 60); assert.equal(stats(hero).maxMana, 18);
  assert.equal(allocateAttribute(hero, 'strength', 10), false); assert.equal(hero.points, 3);
});
test('experience reaches exactly 99 with 490 attributes and 98 skills and never overflows', () => {
  assert.equal(EXPERIENCE.length, 99); assert.equal(xpForLevel(98), 291058498);
  const hero = heroAt(99); assert.equal(hero.level, 99); assert.equal(hero.points, 490); assert.equal(hero.skillPoints, 98); assert.equal(hero.xp, 0);
  assert.equal(gainXp(hero, 100000), false); assert.equal(gainXp(hero, NaN), false);
});
test('all 30 skills have reachable prerequisites, level gates, rank gates and 20 hard-point caps', () => {
  assert.equal(SKILLS.length, 30);
  for (const tree of ['combat', 'offensive', 'defensive']) assert.equal(SKILLS.filter(skill => skill.tree === tree).length, 10);
  const low = heroAt(5); assert.equal(learnSkill(low, 'holyBolt'), false); assert.match(learnReason(low, 'holyBolt'), /6/);
  const hero = heroAt(99);
  assert.equal(learnSkill(hero, 'zeal'), false);
  for (const skill of SKILLS) assert.equal(learnSkill(hero, skill.id), true, skill.id);
  for (let i = 1; i < 20; i++) assert.equal(learnSkill(hero, 'zeal'), true);
  assert.equal(learnSkill(hero, 'zeal'), false);
  const gate = heroAt(12); learnSkill(gate, 'sacrifice'); assert.equal(learnSkill(gate, 'zeal'), true); assert.equal(learnSkill(gate, 'zeal'), false);
});
test('skill bonuses improve trained skills while synergies use only hard points', () => {
  const hero = heroAt(40); for (const id of ['holyBolt', 'blessedHammer', 'might', 'blessedAim'] as const) learnSkill(hero, id);
  const ring = base('戒指'); ring.mods = { allSkills: 2 }; hero.equipment.ring = ring;
  assert.equal(skillLevel(hero, 'blessedHammer'), 3); assert.equal(skillLevel(hero, 'holyShield'), 0);
  assert.ok(Math.abs(skillValues('blessedHammer', 1, hero.skills).min - 12 * 1.14) < 1e-10);
  assert.equal(hero.skills.blessedAim, 1);
});
test('only one learned aura is active and switching does not unlearn or stack it', () => {
  const hero = heroAt(20); learnSkill(hero, 'might'); learnSkill(hero, 'prayer'); learnSkill(hero, 'defiance');
  const attack = stats(hero).attack, defense = stats(hero).defense;
  assert.equal(setAura(hero, 'might'), true); assert.ok(stats(hero).attack > attack);
  setAura(hero, 'defiance'); assert.equal(stats(hero).attack, attack); assert.ok(stats(hero).defense > defense);
  assert.equal(setAura(hero, 'salvation'), false); assert.equal(setAura(hero, 'smite'), false);
  assert.equal(bindSkill(hero, 'cleave', 'zeal'), false); assert.equal(bindSkill(hero, 'cleave', 'might'), true);
});
test('resist caps, passive resistance bonuses and difficulty penalties are separate', () => {
  const hero = heroAt(50), ring = base('戒指'); ring.mods = { allRes: 200 }; hero.equipment.ring = ring;
  for (let i = 0; i < 20; i++) learnSkill(hero, 'resistFire');
  assert.equal(stats(hero).resistances.fire, 85); setAura(hero, 'resistFire'); assert.equal(stats(hero).resistances.fire, 95);
  hero.equipment.ring = null; setAura(hero, null); hero.difficultyLevel = 2; assert.equal(stats(hero).resistances.fire, -100); assert.equal(stats(hero).maxResistances.fire, 85);
});
test('accuracy has 5/95 bounds; conviction breaks immunities at one fifth and never reduces magic', () => {
  assert.equal(hitChance(1, 100000, 1, 99), 5); assert.equal(hitChance(100000, 1, 99, 1), 95);
  assert.equal(hitChance(100, 100, 10, 10), 50);
  assert.equal(resistedDamage(100, 110, 50), 0); assert.ok(Math.abs(resistedDamage(100, 110, 100) - 10) < .001);
  assert.equal(resistedDamage(100, -200), 200);
});
test('holy shield contributes block, defense and smite damage and expires without leaving bonuses', () => {
  const hero = heroAt(40); for (const id of ['smite', 'charge', 'holyBolt', 'blessedHammer', 'holyShield'] as const) learnSkill(hero, id);
  hero.dexterity = 100; const before = stats(hero); hero.holyShield = 30;
  const after = stats(hero); assert.ok(after.block > before.block); assert.ok(after.defense > before.defense); assert.ok(after.smiteMin > before.smiteMin); assert.equal(after.blockFrames, 2);
  hero.holyShield = 0; assert.equal(stats(hero).block, before.block); assert.equal(stats(hero).smiteMin, before.smiteMin);
});
test('cast rate changes at exact thresholds, not continuously', () => {
  const hero = newHero(), ring = base('戒指'); hero.equipment.ring = ring;
  for (const [fcr, frames] of [[0,15],[8,15],[9,14],[74,11],[75,10],[124,10],[125,9]]) { ring.mods = { fcr }; assert.equal(stats(hero).castFrames, frames); }
});
test('item requirements exclude self-granted attributes and inactive equipment contributes nothing', () => {
  const hero = heroAt(30), sword = base('水晶剑'); sword.mods = { strength: 100 }; hero.inventory.push(sword);
  assert.equal(equipItem(hero, sword.id), false); assert.equal(hero.inventory.length, 1);
  const ring = base('戒指'); ring.mods = { strength: 20 }; hero.equipment.ring = ring;
  assert.equal(equipItem(hero, sword.id), true); assert.ok(activeEquipment(hero).includes(sword));
  hero.equipment.ring = null; assert.equal(activeEquipment(hero).includes(sword), false); assert.equal(stats(hero).strength, 25);
});
test('two-handed weapons return shields and weapon swaps preserve both sets', () => {
  const hero = heroAt(30); hero.strength = 40; hero.dexterity = 30;
  const sword = base('双手剑'), oldShield = hero.equipment.shield; hero.inventory.push(sword);
  assert.equal(equipItem(hero, sword.id), true); assert.equal(hero.equipment.shield, null); assert.ok(hero.inventory.includes(oldShield!));
  swapWeapons(hero); assert.equal(hero.equipment.weapon, null); assert.equal(hero.alternate.weapon, sword); swapWeapons(hero); assert.equal(hero.equipment.weapon, sword);
});
test('inventory uses real footprints and failed moves never lose or duplicate items', () => {
  const hero = newHero();
  const small = (id: string): Item => ({ id, name: '戒指', slot: 'ring', rarity: 'common', power: 0, level: 1, value: 1 });
  hero.inventory = Array.from({ length: 40 }, (_, i) => small(String(i))); assert.ok(packItems(hero.inventory)); assert.equal(unequipItem(hero, 'weapon'), false);
  const stored = small('stored'); hero.stash.push(stored); assert.equal(moveStorage(hero, stored.id, false), false); assert.equal(hero.stash[0], stored);
  assert.equal(moveStorage(hero, '0', true), true); assert.equal(moveStorage(hero, 'stored', false), true); assert.equal(hero.inventory.length, 40);
  const equipment = JSON.stringify(hero.equipment); assert.equal(equipItem(hero, 'missing'), false); assert.equal(JSON.stringify(hero.equipment), equipment);
});
test('identification, repair, charms, socket order and exact socket counts affect usable stats', () => {
  const hero = heroAt(40); const armor = base('布甲'); armor.sockets = 2; hero.inventory.push(armor); hero.runes = ['tal', 'eth'];
  assert.equal(insertRune(hero, armor.id, 'tal'), true); assert.equal(insertRune(hero, armor.id, 'eth'), true); assert.equal(armor.name, '隐密');
  assert.equal(equipItem(hero, armor.id), true); assert.equal(stats(hero).mods.fcr, 25);
  armor.durability = 0; assert.equal(stats(hero).mods.fcr, undefined); hero.gold = 1000; assert.equal(repairEquipment(hero), true); assert.equal(stats(hero).mods.fcr, 25);
  const wrong = base('布甲'); wrong.sockets = 3; socketItem(wrong, 'tal'); socketItem(wrong, 'eth'); assert.equal(wrong.rarity, 'common');
  const reversed = base('布甲'); reversed.sockets = 2; socketItem(reversed, 'eth'); socketItem(reversed, 'tal'); assert.equal(reversed.rarity, 'common');
  const charm = { ...base('项链'), charm: true, identified: false, mods: { life: 20 } }; hero.inventory.push(charm); const hp = stats(hero).maxHp;
  assert.equal(identifyItem(hero, charm.id), true); assert.equal(stats(hero).maxHp, hp + 20); moveStorage(hero, charm.id, true); assert.equal(stats(hero).maxHp, hp);
});
test('quest rewards are once per difficulty and respec preserves total earned points', () => {
  const hero = heroAt(30); learnSkill(hero, 'sacrifice'); allocateAttribute(hero, 'vitality', 5);
  for (const diff of [0,1,2] as const) { hero.difficultyLevel = diff; for (const event of ['shrine0','shrine1','shrine2','boss'] as const) { assert.equal(grantQuestReward(hero, event), true); assert.equal(grantQuestReward(hero, event), false); } }
  assert.equal(hero.bonusLife, 60); assert.equal(hero.bonusResist, 30);
  assert.equal(respec(hero), true); assert.equal(hero.points, 29 * 5 + 15); assert.equal(hero.skillPoints, 29 + 12); assert.equal(respec(hero), false); assert.equal(hero.vitality, 25);
});
test('death stores equipment once, loses difficulty XP without level loss, and corpse recovery restores 75 percent', () => {
  const hero = heroAt(40); hero.difficultyLevel = 2; hero.xp = 500000; hero.gold = 1000; const sword = hero.equipment.weapon;
  createCorpse(hero, 2, 3); const xpLost = hero.corpse!.xpLost;
  assert.equal(hero.equipment.weapon, null); assert.equal(hero.corpse?.equipment.weapon, sword); assert.equal(hero.level, 40); assert.equal(hero.gold, 800);
  const xp = hero.xp; assert.equal(recoverCorpse(hero), true); assert.equal(hero.equipment.weapon, sword); assert.equal(hero.xp, xp + Math.floor(xpLost * .75)); assert.equal(hero.gold, 1000); assert.equal(recoverCorpse(hero), false);
});
test('old three-attribute saves migrate to an unspent paladin without losing items or quest progress', () => {
  const legacy = { level: 8, xp: 267, gold: 1500, kills: 32, points: 2, strength: 20, vitality: 17, spirit: 14, hp: 200, mana: 120, equipment: { weapon: { id: 'old', name: '旧剑', slot: 'weapon', rarity: 'legendary', power: 35, level: 5, value: 200 }, armor: null, ring: null }, inventory: [], stage: 2, shrines: [0,1], bossDefeated: false };
  const hero = parseSave(JSON.stringify({ version: 1, hero: legacy }))!; assert.ok(hero);
  assert.equal(hero.points, 35); assert.equal(hero.skillPoints, 7); assert.equal(hero.equipment.weapon?.id, 'old'); assert.equal(hero.gold, 1500); assert.deepEqual(hero.shrines, [0,1]); assert.equal(hero.strength, 25); assert.equal(hero.difficultyLevel, 0); assert.deepEqual(hero.campaign.cleared, [0, 0, 0]);
});
test('save roundtrip preserves fractional resources, bindings, rune words, alternate gear and corpses', () => {
  const hero = heroAt(40); learnSkill(hero, 'might'); setAura(hero, 'might'); bindSkill(hero, 'bolt', 'might'); hero.mana = 12.375;
  hero.alternate.weapon = base('权杖'); hero.inventory.push(base('皮甲')); placeItems(hero.inventory); hero.runes = ['tal', 'eth']; createCorpse(hero, 4, 5);
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('profile rules migration creates an exact pre-paladin backup before overwriting', () => {
  const data = new Map<string,string>();
  const storage = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const store = new SaveStore(storage), profile = store.create('旧角色'); const legacy = JSON.parse(data.get(PROFILE_PREFIX + profile.id)!); delete legacy.hero.rulesVersion; const raw = JSON.stringify(legacy); data.set(PROFILE_PREFIX + profile.id, raw);
  const loaded = store.read(profile.id); store.save(loaded.id, loaded.hero, loaded.revision); assert.equal(data.get(RULES_BACKUP_PREFIX + loaded.id), raw);
});

test('a second death preserves both equipment sets and corpse recovery cannot duplicate them', () => {
  const hero = heroAt(20), first = hero.equipment.weapon!, second = base('短剑');
  createCorpse(hero, 1, 2); hero.equipment.weapon = second; createCorpse(hero, 3, 4);
  assert.equal(hero.equipment.weapon, null); assert.equal(hero.corpse?.equipment.weapon, first); assert.deepEqual(hero.corpse?.extras, [second]);
  const loaded = parseSave(serializeSave(hero))!; assert.equal(recoverCorpse(loaded), true); assert.equal(loaded.equipment.weapon?.id, first.id); assert.deepEqual(loaded.inventory.map(item => item.id), [second.id]); assert.equal(recoverCorpse(loaded), false);
});
test('future rules versions are rejected and aura bindings cannot become weapon attacks', () => {
  const hero = heroAt(10); learnSkill(hero, 'might'); assert.equal(bindSkill(hero, 'attack', 'might'), false);
  assert.equal(parseSave(JSON.stringify({ version: 2, hero: { ...hero, rulesVersion: 3 } })), null);
  const loaded = parseSave(JSON.stringify({ version: 2, hero: { ...hero, bindings: { ...hero.bindings, attack: 'might' } } }))!; assert.equal(loaded.bindings.attack, 'attack');
});
test('classic iconic equipment supplies skill tiers, per-level life, mana scaling and melee modifiers', () => {
  const hero = heroAt(70); hero.strength = 100; learnSkill(hero, 'smite');
  const herald = specialItem('撒卡兰姆使者'); herald.identified = true; hero.equipment.shield = herald; assert.equal(skillLevel(hero, 'smite'), 5); assert.equal(stats(hero).mods.allRes, 50);
  const shako = specialItem('谐角之冠'); shako.identified = true; hero.equipment.helm = shako;
  assert.equal(stats(hero).mods.lifePerLevel, 1.5); assert.equal(parseSave(serializeSave(hero))?.equipment.helm?.mods?.lifePerLevel, 1.5);
  const ring = specialItem('乔丹之石'); ring.identified = true; const mana = stats(hero).maxMana; hero.equipment.ring = ring; assert.ok(stats(hero).maxMana > mana + 20);
  const boots = specialItem('蚀肉骑士'); boots.identified = true; hero.equipment.boots = boots; assert.equal(stats(hero).mods.crushingBlow, 15); assert.equal(stats(hero).mods.deadlyStrike, 15);
});
