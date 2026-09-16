import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_SPECIALS, CATALOG_RUNEWORDS } from '../src/item-catalog-current.ts';
import { catalogMods, catalogPropertyStatus } from '../src/item-catalog.ts';
import { catalogSkill } from '../src/item-effects.ts';
import { itemCharges, consumeCharge } from '../src/item-charges.ts';
import { BASES, makeItem, migrateCatalogItem, type Item } from '../src/items.ts';
import { newHero, activeEquipment, availableCharges, bindChargedSkill, bindSkill, skillLevel, equippedAuras, unequipItem, swapWeapons, parseSave, serializeSave, repairEquipment, repairCost, stats } from '../src/model.ts';
import { classFixture } from './class-fixture.ts';
import { itemModifierLines } from '../src/item-description.ts';
import { skillValues } from '../src/paladin.ts';
import { AFFIX_DATA } from '../src/affix-data.ts';
import { eligibleAffixes } from '../src/affixes.ts';

function charged(id: string, skill = 'teleport', rank?: number): Item {
  const entry = [...CATALOG_SPECIALS, ...CATALOG_RUNEWORDS].find(entry => entry.properties.some(([code,param,,level]) => code === 'charged' && catalogSkill(param) === skill && (rank === undefined || rank === level)))!;
  return { ...makeItem(BASES[0], id), slot: 'ring', catalogId: entry.id, mods: {}, requiredStrength: 0, requiredDexterity: 0, requiredLevel: 1 };
}
test('all catalog charges, oskills and equipment auras resolve and report active', () => {
  for (const entry of [...CATALOG_SPECIALS, ...CATALOG_RUNEWORDS]) for (const property of entry.properties) if (['charged','oskill','aura'].includes(property[0])) {
    assert.ok(catalogSkill(property[1]), `${entry.key}: ${property}`);
    assert.equal(catalogPropertyStatus(property), 'active', `${entry.key}: ${property}`);
  }
});
test('same-level charges pool uses without adding levels, different levels remain separate', () => {
  const h = newHero(); h.level = 99;
  h.equipment.ring = charged('one'); h.equipment.ring2 = charged('two');
  const original = itemCharges(h.equipment.ring).find(c => c.id === 'teleport')!;
  let group = availableCharges(h).find(c => c.id === 'teleport')!;
  assert.equal(group.maximum, original.maximum * 2); assert.equal(group.rank, original.rank);
  assert.equal(skillLevel(h, 'teleport'), 0);
  assert.ok(bindChargedSkill(h, 'dash', group.id, group.rank));
  assert.ok(consumeCharge(activeEquipment(h), group));
  assert.equal(itemCharges(h.equipment.ring)[0].remaining, original.maximum - 1);
  assert.equal(itemCharges(h.equipment.ring2)[0].remaining, original.maximum);
  assert.ok(unequipItem(h, 'ring')); assert.equal(h.bindings.dash, 'teleport');
  assert.ok(unequipItem(h, 'ring2')); assert.equal(h.bindings.dash, 'attack');
  h.equipment.ring = charged('low', 'teleport', 1); h.equipment.ring2 = charged('high', 'teleport', 11);
  assert.deepEqual(availableCharges(h).filter(c=>c.id==='teleport').map(c=>c.rank), [1,11]);
});
test('charges retain remaining uses and explicit bindings through saves; repair replenishes', () => {
  const h = newHero(); h.equipment.ring = charged('save');
  const group = availableCharges(h)[0]; bindChargedSkill(h, 'dash', group.id, group.rank);
  consumeCharge(activeEquipment(h), group);
  const restored = parseSave(serializeSave(h))!; assert.ok(restored);
  assert.deepEqual(restored.chargeBindings, h.chargeBindings);
  assert.equal(availableCharges(restored)[0].remaining, group.remaining - 1);
  assert.ok(repairCost(restored) > 0); restored.gold = 1e6; assert.ok(repairEquipment(restored));
  assert.equal(availableCharges(restored)[0].remaining, group.maximum);
  assert.match(itemModifierLines(restored.equipment.ring!).map(line=>line.text).join(), /聚气/);
});
test('unusable sources and alternate weapons do not grant charges or retain hotkeys', () => {
  const h = newHero(); const item = charged('swap'); item.slot = 'weapon'; h.equipment.weapon = item;
  const charge = availableCharges(h)[0]; bindChargedSkill(h, 'dash', charge.id, charge.rank); swapWeapons(h);
  assert.equal(h.bindings.dash, 'attack'); assert.equal(availableCharges(h).length, 0);
  const restored = parseSave(serializeSave(h))!; swapWeapons(restored);
  assert.equal(restored.bindings.dash, charge.id); assert.deepEqual(restored.chargeBindings?.dash, { id: charge.id, rank: charge.rank });
  swapWeapons(h); assert.equal(h.bindings.dash, charge.id); item.durability = 0; assert.equal(availableCharges(h).length, 0);
  item.durability = 1; item.identified = false; assert.equal(availableCharges(h).length, 0);
});
test('oskill bonuses stack, respect native +3 cap, and never grant another class staffmod', () => {
  const h = newHero('sorceress'); h.equipment.weapon!.mods = { oskill_teleport: 4 }; h.equipment.ring = { ...charged('bonus'), catalogId: undefined, mods: { oskill_teleport: 6, allSkills: 2, sorceressSkills: 1 } };
  assert.equal(skillLevel(h, 'teleport'), 6);
  h.skills.teleport = 5; assert.equal(skillLevel(h,'teleport'),11);
  const p = newHero(); p.equipment.weapon!.mods = { oskill_teleport: 4, allSkills: 2, sorceressSkills: 8, skill_teleport: 9 };
  assert.equal(skillLevel(p,'teleport'),6); assert.ok(bindSkill(p,'dash','teleport'));
  p.equipment.weapon!.mods = { skill_teleport: 9 }; assert.equal(skillLevel(p,'teleport'),0);
});
test('item aura levels and radial sources stack while all-skills and selected aura do not add', () => {
  const h = newHero(); h.equipment.weapon!.mods = { aura_holyShock: 15, allSkills: 8 };
  h.equipment.shield!.mods = { aura_holyShock: 15 };
  let aura = equippedAuras(h).find(aura=>aura.id==='holyShock')!;
  assert.equal(aura.rank,30); assert.equal(aura.pulses,2);
  h.skills.holyShock=1; h.activeAura='holyShock'; aura=equippedAuras(h).find(aura=>aura.id==='holyShock')!;
  assert.equal(aura.rank,30); assert.equal(aura.pulses,2);
  h.skills.holyShock=30; aura=equippedAuras(h).find(aura=>aura.id==='holyShock')!; assert.equal(aura.rank,38); assert.equal(aura.pulses,1);
});
test('charged teleport casts at zero mana, consumes once, and rejects failed casts and exhaustion', () => {
  const {hero,combat,game,tick} = classFixture('paladin',false);
  hero.equipment.ring=charged('cast'); const charge=availableCharges(hero)[0]; bindChargedSkill(hero,'dash',charge.id,charge.rank); hero.mana=0;
  assert.ok(combat.cast('dash',true)); assert.equal(game.position.z,6); assert.equal(hero.mana,0);
  assert.equal(availableCharges(hero)[0].remaining,charge.remaining-1);
  assert.equal(combat.cast('dash',true),false); assert.equal(availableCharges(hero)[0].remaining,charge.remaining-1);
  tick(1); for(let i=0;i<charge.maximum;i++)consumeCharge(activeEquipment(hero),charge);
  assert.equal(combat.cast('dash',true),false); assert.equal(hero.bindings.dash,'teleport');
});
test('charged curses and oskill warcries apply real combat effects', () => {
  const {hero,combat,enemy,game,tick}=classFixture('paladin',false); hero.equipment.ring=charged('curse','lifeTap');
  const c=availableCharges(hero).find(c=>c.id==='lifeTap')!, target=enemy(); bindChargedSkill(hero,'ward',c.id,c.rank); hero.mana=0;
  assert.ok(combat.cast('ward',true)); assert.equal(combat.itemCurses.get(target)?.kind,'lifeTap'); assert.equal(hero.mana,0);
  tick(1); hero.equipment.weapon!.mods={oskill_battleOrders:6,oskill_battleCommand:2}; hero.mana=200;
  assert.ok(bindSkill(hero,'nova','battleCommand')); assert.ok(combat.cast('nova')); assert.equal(skillLevel(hero,'battleOrders'),7);
  tick(1); assert.ok(bindSkill(hero,'nova','battleOrders')); const hp=stats(hero).maxHp; assert.ok(combat.cast('nova')); assert.ok(stats(hero).maxHp>hp);
  assert.equal(hero.buffs.battleOrders!.rank,7);
});
test('migration restores newly supported oskills without rerolling existing modifiers', () => {
  const entry=CATALOG_RUNEWORDS.find(entry=>entry.properties.some(([code,param])=>code==='oskill'&&param==='Teleport'))!;
  const item={...makeItem(BASES[0],'legacy'),catalogId:entry.id,catalogVersion:2,mods:{allSkills:9},catalogRolls:entry.properties.map(()=>.2)};
  migrateCatalogItem(item); assert.equal(item.mods.allSkills,9); assert.equal((item.mods as Record<string,number>).oskill_teleport,1);
});

test('random charged suffixes resolve and use original item-level charge formulas', () => {
  const suffixes=AFFIX_DATA.filter(a=>a.properties.some(p=>p[0]==='charged'));
  assert.equal(suffixes.length,104);
  for(const suffix of suffixes) {
    const item={...makeItem(BASES[0],'affix'),affixes:[suffix.id],level:99};
    assert.ok(itemCharges(item).length>0,suffix.id);
  }
  const wand={...makeItem(BASES.find(b=>b.baseCode==='wnd')!,'wand'),rarity:'magic' as const,level:99};
  const suffix=eligibleAffixes(wand).find(a=>a.properties.some(p=>p[0]==='charged'&&p[1]===91))!;
  assert.ok(suffix);
  for(const [level,rank] of [[53,1],[76,2],[99,3]]) {
    const charge=itemCharges({...wand,level,affixes:[suffix.id]})[0];
    assert.equal(charge.rank,rank);assert.equal(charge.maximum,Math.floor(60*(1+rank/8)));
  }
});

test('charged summons retain the charged rank and effects after the cast context ends', () => {
  const {hero,combat,game,tick}=classFixture('paladin',false);hero.equipment.ring=charged('hydra','hydra',30);
  const charge=availableCharges(hero).find(c=>c.id==='hydra')!;bindChargedSkill(hero,'ward',charge.id,charge.rank);hero.mana=0;
  assert.ok(combat.cast('ward',true));const summon=combat.classes.summons[0];
  assert.equal(summon.rank,30);assert.equal(summon.life,skillValues('hydra',30,hero.skills).duration);
  assert.equal(skillLevel(hero,'hydra'),0);assert.equal(hero.mana,0);
  assert.ok(unequipItem(hero,'ring'));assert.equal(hero.bindings.ward,'attack');assert.equal(combat.classes.summons.length,1);
});

test('double equipment aura pulses deal combined-rank damage once per source', () => {
  const {hero,combat,enemy}=classFixture('paladin',false);
  hero.equipment.weapon!.mods={aura_holyFire:14};hero.equipment.shield!.mods={aura_holyFire:16};
  const target=enemy(2), before=target.hp, aura=equippedAuras(hero).find(a=>a.id==='holyFire')!;
  combat.pulse(); const damage=before-target.hp;
  assert.ok(damage>=Math.floor(aura.min*2)&&damage<=Math.ceil(aura.max*2));
});

test('elemental armor absorbs only its finite pool and survives reload without refilling', () => {
  const {hero,combat}=classFixture('paladin',false);hero.buffs.cycloneArmor={rank:3,remaining:3600};
  const before=hero.hp;combat.hurt(20,'fire');assert.equal(hero.hp,before);
  assert.equal(hero.buffs.cycloneArmor.absorb,skillValues('cycloneArmor',3).percent-20);
  const restored=parseSave(serializeSave(hero))!;assert.deepEqual(restored.buffs.cycloneArmor,hero.buffs.cycloneArmor);
});

test('missing charged source never silently changes saved binding into learned same-name skill', () => {
  const h=newHero('sorceress');h.skills.teleport=1;h.bindings.dash='teleport';h.chargeBindings={dash:{id:'teleport',rank:1}};
  const restored=parseSave(serializeSave(h))!;assert.equal(restored.bindings.dash,'attack');
});

test('Ormus rolls one original Sorceress skill and Torch rolls one class without rerolling', () => {
  assert.deepEqual(catalogMods([['skill-rand','3',36,60]],()=>0),{skill_fireBolt:3});
  assert.deepEqual(catalogMods([['skill-rand','3',36,60]],()=>1),{skill_chillingArmor:3});
  const classes=new Set(Array.from({length:7},(_,i)=>Object.keys(catalogMods([['randclassskill','',0,6]],()=>i/7+.001))[0]));
  assert.equal(classes.size,7);assert.ok(classes.has('paladinSkills'));assert.ok(classes.has('sorceressSkills'));
});
