import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, stats, gainXp, parseSave, serializeSave, emptyEquipment } from '../src/model.ts';
import { xpForLevel } from '../src/paladin.ts';
import { BASES, makeItem, packItems } from '../src/items.ts';
import { mercenaryUnlocked, mercenaryCost, hireMercenary, mercenaryStats, mercenaryBase, mercenaryAuras, selectMercenaryAura, equipMercenary, unequipMercenary, activeMercenaryEquipment, mercenaryEquipReason, setMercenaryDistance, MERCENARY_AURAS } from '../src/mercenary.ts';

const item = (code: string, id = code) => makeItem(BASES.find(base => base.baseCode === code)!, id);
function hero(level = 30) { const h = newHero(); h.level = level; h.campaign.cleared[0] = 5; h.gold = 100000; assert.ok(hireMercenary(h, true)); return h; }

test('hire requires first act completion, a nearby merchant, sufficient gold and no living guard', () => {
  const h = newHero(); h.level = 20; h.gold = 100000;
  for (const cleared of [0, 1, 4]) { h.campaign.cleared[0] = cleared; assert.equal(mercenaryUnlocked(h), false); assert.equal(hireMercenary(h, true), false); }
  h.campaign.cleared[0] = 5; const before = structuredClone(h);
  assert.equal(hireMercenary(h, false), false); assert.deepEqual(h, before);
  h.gold = mercenaryCost(h) - 1; assert.equal(hireMercenary(h, true), false);
  h.gold++; const price = h.gold; assert.equal(hireMercenary(h, true), true); assert.equal(h.gold, 0);
  assert.ok(price > 0); assert.equal(h.mercenary!.hp, mercenaryStats(h).maxHp);
  h.gold = 100000; const hired = structuredClone(h); assert.equal(hireMercenary(h, true), false); assert.deepEqual(h, hired);
});

test('mercenary stats grow with player level and living guards heal on level-up, dead guards stay dead', () => {
  const h = hero(15), before = mercenaryStats(h); h.mercenary!.hp = 1;
  gainXp(h, xpForLevel(h.level)); const after = mercenaryStats(h);
  assert.ok(after.maxHp > before.maxHp && after.attack > before.attack && after.defense > before.defense);
  assert.equal(h.mercenary!.hp, after.maxHp);
  h.mercenary!.status = 'dead'; h.mercenary!.hp = 0; gainXp(h, xpForLevel(h.level)); assert.equal(h.mercenary!.hp, 0); assert.equal(h.mercenary!.status, 'dead');
  assert.ok(mercenaryCost(hero(99)) <= 50000);
});

test('weapons and armor modify the guard without leaking attributes to the player', () => {
  const h = hero(), player = stats(h), before = mercenaryStats(h), spear = item('spr');
  spear.mods = { damage: 140, lifeSteal: 8, ias: 40, coldMinDamage: 10, coldMaxDamage: 20 };
  const armor = item('lea'); armor.mods = { life: 90, allRes: 20, damageReduction: 15, vitality: 50 };
  h.inventory = [spear, armor]; assert.ok(equipMercenary(h, spear.id)); assert.ok(equipMercenary(h, armor.id));
  const after = mercenaryStats(h);
  assert.ok(after.attack > before.attack); assert.ok(after.defense > before.defense); assert.equal(after.maxHp, before.maxHp + 90);
  assert.equal(after.mods.lifeSteal, 8); assert.ok(after.attackFrames < before.attackFrames); assert.ok(after.resistances.fire > before.resistances.fire);
  assert.equal(stats(h).attack, player.attack); assert.equal(stats(h).maxHp, player.maxHp); assert.equal(stats(h).mods.lifeSteal, player.mods.lifeSteal);
  assert.equal(after.ranged, undefined);
  assert.ok(unequipMercenary(h, 'weapon')); assert.ok(h.inventory.some(other => other.id === spear.id));
});

test('only permitted slots and non-class polearms, spears and javelins are accepted', () => {
  const h = hero(90);
  for (const code of ['spr', 'vou', 'jav', 'cap', 'lea']) { const gear = item(code); assert.equal(mercenaryEquipReason(h, gear), ''); }
  for (const code of ['ssd', 'sbw', 'sst', 'buc', 'rin', 'vgl', 'am1']) { const gear = item(code); h.inventory = [gear]; const before = structuredClone(h); assert.equal(equipMercenary(h, gear.id), false); assert.deepEqual(h, before); }
});

test('requirements cannot be met by the item itself; losing a strength item deactivates dependent equipment', () => {
  const h = hero(), spear = item('spr'), helm = item('cap'); spear.requiredStrength = mercenaryBase(h.level).strength + 10; spear.mods = { strength: 20 };
  h.inventory = [spear, helm]; assert.equal(equipMercenary(h, spear.id), false);
  helm.mods = { strength: 10 }; assert.ok(equipMercenary(h, helm.id)); assert.ok(equipMercenary(h, spear.id)); assert.equal(activeMercenaryEquipment(h).length, 2);
  assert.ok(unequipMercenary(h, 'helm')); assert.equal(activeMercenaryEquipment(h).length, 0);
  spear.requiredStrength = 1; spear.requiredLevel = h.level + 1; assert.ok(mercenaryEquipReason(h, spear));
  spear.requiredLevel = 1; spear.identified = false; assert.ok(mercenaryEquipReason(h, spear));
  spear.identified = true; spear.durability = 0; assert.ok(mercenaryEquipReason(h, spear));
});

test('inventory exchanges are atomic when replacing or removing equipment with no room', () => {
  const h = hero(), spear = item('spr'); h.inventory = [spear]; assert.ok(equipMercenary(h, spear.id));
  h.inventory = Array.from({ length: 40 }, (_, i) => ({ ...item('rin', `ring-${i}`), width: 1, height: 1 }));
  assert.ok(packItems(h.inventory)); const before = structuredClone(h); assert.equal(unequipMercenary(h, 'weapon'), false); assert.deepEqual(h, before);
  h.inventory[0] = { ...item('jav'), width: 1, height: 1 }; const swapped = structuredClone(h);
  assert.equal(equipMercenary(h, 'jav'), false); assert.deepEqual(h, swapped);
});

test('all six auras are selectable; party buffs have range, stop on death and do not stack identical auras', () => {
  const h = hero(); h.equipment.armor = item('lea'); const noMerc = stats({ ...h, mercenary: null });
  for (const aura of MERCENARY_AURAS) { assert.ok(selectMercenaryAura(h, aura)); assert.equal(mercenaryAuras(h)[0].id, aura); }
  const before = h.mercenary!.aura; assert.equal(selectMercenaryAura(h, 'invalid'), false); assert.equal(h.mercenary!.aura, before);
  selectMercenaryAura(h, 'might'); assert.ok(stats(h).attack > noMerc.attack);
  h.skills.might = 20; h.activeAura = 'might'; assert.equal(stats(h).auras.filter(aura => aura.id === 'might').length, 1); assert.equal(stats(h).auras.find(aura => aura.id === 'might')!.rank, 20);
  h.skills.might = 0; h.activeAura = null;
  setMercenaryDistance(h, 100); assert.equal(stats(h).attack, noMerc.attack); setMercenaryDistance(h, 0);
  selectMercenaryAura(h, 'blessedAim'); assert.ok(stats(h).attackRating > noMerc.attackRating);
  selectMercenaryAura(h, 'defiance'); assert.ok(stats(h).defense > noMerc.defense);
  h.mercenary!.hp = 0; h.mercenary!.status = 'dead'; assert.deepEqual(mercenaryAuras(h), []); assert.equal(stats(h).defense, noMerc.defense);
});

test('equipment auras support the party, survive gear swaps, and use the highest rank', () => {
  const h = hero(), weapon = item('vou'); weapon.mods = { aura_meditation: 15, allSkills: 2 }; h.inventory = [weapon]; assert.ok(equipMercenary(h, weapon.id));
  assert.equal(mercenaryAuras(h).find(aura => aura.id === 'meditation')!.rank, 15);
  assert.ok(stats(h).manaRegen > stats({ ...h, mercenary: null }).manaRegen);
  assert.ok(unequipMercenary(h, 'weapon')); assert.equal(stats(h).auras.some(aura => aura.id === 'meditation'), false);
});

test('save migration, death, rehire and item de-duplication preserve guard possessions', () => {
  const legacy = newHero(); delete (legacy as Partial<typeof legacy>).mercenary; assert.equal(parseSave(serializeSave(legacy))!.mercenary, null);
  const h = hero(), spear = item('spr'); h.inventory = [spear]; assert.ok(equipMercenary(h, spear.id)); selectMercenaryAura(h, 'holyFreeze');
  h.mercenary!.hp = 0; h.mercenary!.status = 'dead'; const loaded = parseSave(serializeSave(h))!;
  assert.equal(loaded.mercenary!.hp, 0); assert.equal(loaded.mercenary!.status, 'dead'); assert.equal(loaded.mercenary!.equipment.weapon!.id, spear.id);
  const gold = loaded.gold; assert.ok(hireMercenary(loaded, true)); assert.equal(loaded.gold, gold - mercenaryCost(loaded)); assert.equal(loaded.mercenary!.aura, 'holyFreeze'); assert.equal(loaded.mercenary!.equipment.weapon!.id, spear.id);
  loaded.inventory.push(structuredClone(spear)); const duplicate = parseSave(serializeSave(loaded))!; assert.equal(duplicate.mercenary!.equipment.weapon, null); assert.equal(duplicate.inventory.filter(item => item.id === spear.id).length, 1);
  loaded.inventory = []; loaded.corpse = { equipment: { ...emptyEquipment(), weapon: spear }, extras: [], gold: 0, xpLost: 0, x: 0, z: 0 };
  assert.equal(parseSave(serializeSave(loaded))!.mercenary!.equipment.weapon, null);
});

test('malformed guard resources and aura values are sanitized without corrupting the character', () => {
  const h = hero(), data = JSON.parse(serializeSave(h)); data.hero.mercenary.hp = -1; data.hero.mercenary.aura = 'constructor'; data.hero.mercenary.poison = 'bad';
  const loaded = parseSave(JSON.stringify(data))!; assert.equal(loaded.mercenary!.status, 'dead'); assert.equal(loaded.mercenary!.aura, 'prayer'); assert.equal(loaded.mercenary!.poison, 0);
});
