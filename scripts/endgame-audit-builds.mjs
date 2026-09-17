import assert from 'node:assert/strict';
import { AUDIT_BUILDS, auditHero } from './class-audit-builds.mjs';
import { BASES, RUNEWORDS, makeItem, socketItem, specialItem, itemMods, itemRequirements, placeItems } from '../src/items.ts';
import { eligibleAffixes, rollAffix } from '../src/affixes.ts';
import { CLASSES } from '../src/classes.ts';
import { activeEquipment, allocateAttribute, stats, skillLevel } from '../src/model.ts';
import { activeMercenaryEquipment, mercenaryStats } from '../src/mercenary.ts';
import { skillById } from '../src/paladin.ts';

export const ENDGAME_STAGE = { id: 'endgame', name: '99级成型', level: 99, difficulty: 2, index: 24 };
export const ENDGAME_BUILDS = ['smite','hammer','javazon','bow','blizzard','lightning','summonnec','bone','frenzy','whirlwind','fury','summondruid','martial','lighttraps'].map(id => {
  const b = structuredClone(AUDIT_BUILDS.find(b => b.id === id));
  if (['frenzy','whirlwind'].includes(id)) b.synergies = b.synergies.map(id => id === 'axeMastery' ? 'swordMastery' : id);
  if (id === 'summonnec') b.curse = 'decrepify';
  return b;
});
// All rolls use the 80th percentile of the actual catalog/affix ranges.
export function endgameWord(code, name) {
  const base = BASES.find(b => b.baseCode === code), recipe = RUNEWORDS.find(w => w.name === name || w.catalogId === name);
  assert.ok(base && recipe, `${code}/${name}`); assert.ok(base.sockets >= recipe.runes.length);
  const item = makeItem(base); item.sockets = recipe.runes.length;
  for (const rune of recipe.runes) assert.ok(socketItem(item, rune, () => .8), `${code}/${name}`);
  assert.equal(item.catalogId, recipe.catalogId); return item;
}
const unique = id => { const item = specialItem(id, () => .8); item.identified = true; return item; };
function magic(code, wants) {
  const item = makeItem(BASES.find(b => b.baseCode === code)); item.level = 99; item.rarity = 'magic'; item.identified = true; item.affixes = []; item.mods = {};
  const pool = eligibleAffixes(item), used = [];
  for (const key of wants) {
    const candidates = pool.filter(a => !used.some(b => b.kind === a.kind || b.group === a.group) && rollAffix(a, () => .8).mods[key]);
    candidates.sort((a,b) => rollAffix(b, () => .8).mods[key] - rollAffix(a, () => .8).mods[key]);
    const affix = candidates[0]; assert.ok(affix, `${code}/${key}`); used.push(affix); item.affixes.push(affix.id);
    for (const [key,value] of Object.entries(rollAffix(affix, () => .8).mods)) item.mods[key] = (item.mods[key] ?? 0) + value;
  }
  item.requiredLevel = Math.max(item.requiredLevel ?? 1, ...used.map(a => a.requiredLevel)); return item;
}
export function endgameHero(build, { mercenary = true } = {}) {
  const { hero: h, primary, skillBudget } = auditHero(build, ENDGAME_STAGE, { mosaic: build.id === 'martial' });
  const melee = ['smite','frenzy','whirlwind','fury','bow'].includes(build.id), w = endgameWord, u = unique;
  h.equipment = {
    weapon: w('fla','橡树之心'), shield: w('uit','精神'), armor: w('utp','荣耀之链'),
    helm: u('unique-249'), gloves: u('unique-105'), boots: u('unique-370'), belt: u('unique-374'),
    amulet: u('unique-273'), ring: u('unique-122'), ring2: u('unique-122'),
  };
  if (melee) Object.assign(h.equipment, { helm: u('set-105'), gloves: u('unique-365'), boots: u('unique-242'), belt: u('unique-377'), amulet: u('unique-277'), ring: u('unique-276'), ring2: u('unique-269') });
  if (build.id === 'smite') Object.assign(h.equipment, { weapon: w('7cr','悔恨'), shield: w('pab','流亡') });
  if (build.id === 'hammer') h.equipment.shield = w('pab','精神');
  if (build.id === 'javazon') Object.assign(h.equipment, { weapon: u('unique-339'), shield: u('unique-254'), helm: u('unique-337'), gloves: magic('lgl',['javelinSkills','ias']), belt: u('unique-247'), amulet: u('unique-277'), ring: u('unique-276') });
  if (build.id === 'bow') Object.assign(h.equipment, { weapon: w('amc','信心'), shield: null, armor: w('utp','刚毅'), gloves: u('set-97') });
  if (build.id === 'blizzard') h.equipment.weapon = u('unique-355');
  if (build.id === 'lightning') Object.assign(h.equipment, { weapon: w('crs','新月'), helm: u('unique-337') });
  if (build.id === 'summonnec') h.equipment.weapon = w('7wa','野兽');
  if (build.id === 'bone') h.equipment.weapon = w('bwn','白色');
  if (['frenzy','whirlwind'].includes(build.id)) Object.assign(h.equipment, { weapon: w('7cr','悔恨'), shield: w('7cr','悔恨'), armor: w('utp','刚毅') });
  if (build.id === 'fury') Object.assign(h.equipment, { weapon: w('7gi','死亡呼吸'), shield: null, helm: u('unique-288'), armor: w('utp','刚毅') });
  if (build.id === 'martial') Object.assign(h.equipment, { weapon: w('9tw','d2r-Mosaic'), shield: w('9tw','d2r-Mosaic'), helm: u('unique-337'), gloves: magic('lgl',['martialArtsSkills','ias']), boots: u('unique-242') });
  if (build.id === 'lighttraps') Object.assign(h.equipment, { weapon: w('crs','新月'), helm: u('unique-337') });
  const tab = { smite:'combatSkills', hammer:'combatSkills', javazon:'javelinSkills', bow:null, blizzard:'coldSkills', lightning:'lightningSkills', summonnec:'necromancySkills', bone:'poisonBoneSkills', frenzy:null, whirlwind:null, fury:'shapeshiftingSkills', summondruid:'natureSummoningSkills', martial:'martialArtsSkills', lighttraps:'trapsSkills' }[build.id];
  h.inventory = [u('unique-382'), ...Array.from({length:8}, () => magic('cm3', tab ? [tab,'life'] : ['attackRating','life'])), ...Array.from({length:10}, () => magic('cm1',['allRes','life']))];
  const resistanceCharms = {smite:2,javazon:2,bow:4,frenzy:2,whirlwind:2,fury:3}[build.id] ?? 0;
  for(let i=0;i<resistanceCharms;i++) h.inventory[1+i] = magic('cm3',['allRes','life']);
  assert.ok(placeItems(h.inventory), 'Charms fit the real backpack');
  // Start from the class bases + completed Lam Esen rewards; spend earned points.
  for (const key of ['strength','dexterity','vitality','energy']) h[key] = CLASSES[h.classId].attributes[key] + 15;
  h.points = 98 * 5;
  const gear = Object.values(h.equipment).filter(Boolean);
  for (const key of ['strength','dexterity']) {
    const requirement = Math.max(0, ...gear.map(item => itemRequirements(item)[key]));
    // Conservative requirements: no circular item-stat dependency.
    const need = Math.max(0, requirement - h[key]); if (need) assert.ok(allocateAttribute(h,key,need));
  }
  if (['smite','javazon'].includes(build.id)) {
    h.holyShield = build.id === 'smite' ? 100 : 0;
    while (stats(h).block < 75 && h.points > 0) allocateAttribute(h,'dexterity',1);
    h.holyShield = 0;
  }
  if (build.id === 'bow') allocateAttribute(h,'dexterity',Math.min(h.points,150));
  if (h.points) allocateAttribute(h,'vitality',h.points);
  h.alternate = { weapon: w('crs','战争召唤'), shield: w('uit','精神') };
  // CTA's switch shield must also be equipable without the main weapon's stats.
  if (h.strength < 156) { const n = 156-h.strength; assert.ok(h.vitality-n >= CLASSES[h.classId].attributes.vitality+15); h.vitality-=n; h.strength+=n; }
  h.weaponSet = 0;
  assert.equal(activeEquipment(h).length,gear.length,`${build.id}: inactive equipment`);
  for (const item of gear) assert.ok((item.requiredLevel ?? 1) <= h.level);
  assert.ok(Object.values(h.skills).reduce((a,b)=>a+b,0) <= skillBudget);
  for (const [id,rank] of Object.entries(h.skills)) if (rank) { assert.ok(rank<=20); for (const req of skillById[id].requires) assert.ok(h.skills[req]); }
  if (mercenary) {
    h.mercenary = { status:'alive', hp:1, aura:'might', cold:0, poison:0, equipment:{weapon:w('7s8', ['hammer','bone'].includes(build.id) ? '眼光' : '无限'), armor:w('utp','刚毅'), helm:u('unique-346')} };
    assert.equal(activeMercenaryEquipment(h).length,3,`${build.id}: unusable mercenary gear`); h.mercenary.hp=mercenaryStats(h).maxHp;
  } else h.mercenary = null;
  const s=stats(h);h.hp=s.maxHp;h.mana=s.maxMana;h.stamina=s.maxStamina;
  return { hero:h, primary, skillBudget };
}
export function endgameMetrics(build) {
  const {hero,primary,skillBudget}=endgameHero(build),s=stats(hero);
  return {build:build.id,name:build.name,classId:build.classId,primary,rank:skillLevel(hero,primary),skillBudget,
    attributes:Object.fromEntries(['strength','dexterity','vitality','energy'].map(k=>[k,hero[k]])),life:s.maxHp,mana:s.maxMana,block:s.block,resists:s.resistances,
    skills:Object.fromEntries(Object.entries(hero.skills).filter(([,v])=>v)),
    gear:Object.fromEntries(Object.entries(hero.equipment).map(([k,v])=>[k,v&&{name:v.name,base:v.baseCode,mods:itemMods(v)}])),
    charms:hero.inventory.map(v=>({name:v.name,affixes:v.affixes,mods:itemMods(v)})),mercenary:hero.mercenary};
}
