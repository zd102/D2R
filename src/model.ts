import { BASE_ATTRIBUTES, PALADIN_BALANCE, SKILLS, skillById, emptySkills, isSkill, isAura, skillValues, xpForLevel, EXPERIENCE, breakpointFrames, FCR, FHR, FBR, type SkillId, type ActionId, type Attribute, type DamageType } from './paladin.ts';
import { SLOTS, BASES, MOD_NAMES, RUNES, makeItem, addMods, itemMods, itemRequirements, packItems, placeItems, stashRows, socketItem, type Mods, type Modifier, type Slot, type Item, type RuneId } from './items.ts';
import { levelMods } from './item-effects.ts';
import { migrateCatalogItem } from './items.ts';
import { catalogItemSetBonuses } from './item-catalog.ts';
import { LEVELS, FIELD_BOUND, newCampaign, parseCampaign, canEnterLevel, questComplete, unlockedCampaignDifficulty, type CampaignState } from './campaign.ts';
import { affixById } from './affixes.ts';
import { catalogSetBonuses, CLASS_NAMES } from './item-catalog.ts';
import { filledSockets } from './items.ts';
import type { SkillSlot } from './controls.ts';
import { rangedBase } from './items.ts';
import { CLASSES, isClassId, type ClassId } from './classes.ts';
import { skillsForClass, isPassive } from './paladin.ts';
export { rarityNames, slotNames, rollItem, SLOTS } from './items.ts';
export type { Slot, Item, Rarity } from './items.ts';
export type HeroState = {
  rulesVersion: 2; classId: ClassId; level: number; xp: number; gold: number; kills: number; points: number;
  strength: number; dexterity: number; vitality: number; energy: number;
  skillPoints: number; skills: Record<SkillId, number>; activeAura: SkillId | null;
  bindings: Record<SkillSlot, ActionId>;
  buffs: Partial<Record<SkillId, { remaining: number; rank: number }>>;
  hp: number; mana: number; stamina: number; running: boolean; potions: [number, number];
  ammo: { arrows: number; bolts: number };
  equipment: Record<Slot, Item | null>; alternate: { weapon: Item | null; shield: Item | null }; weaponSet: 0 | 1;
  inventory: Item[]; stash: Item[]; runes: RuneId[]; identifyScrolls: number;
  campaign: CampaignState;
  stage: number; difficultyLevel: 0 | 1 | 2; unlockedDifficulty: 0 | 1 | 2; shrines: number[]; bossDefeated: boolean; questRewards: string[]; respecUsed: number[];
  bonusLife: number; bonusResist: number; holyShield: number; holyShieldLevel: number; poison: number; curse: number; cold: number;
  corpse: { equipment: Record<Slot, Item | null>; extras: Item[]; x: number; z: number; xpLost: number; gold: number } | null;
};
export const SAVE_KEY = 'eclipse-ii-save-v1';
export const emptyEquipment = () => Object.fromEntries(SLOTS.map(slot => [slot, null])) as Record<Slot, Item | null>;
export const difficulty = (hero: HeroState) => hero.difficultyLevel;
export const difficultyNames = ['普通', '噩梦', '地狱'];
export const newHero = (classId: ClassId = 'paladin'): HeroState => ({
  rulesVersion: 2, classId, level: 1, xp: 0, gold: 0, kills: 0, points: 0, ...CLASSES[classId].attributes,
  skillPoints: 0, skills: emptySkills(), activeAura: null,
  bindings: { attack: 'attack', cleave: 'attack', ward: 'attack', nova: 'attack', dash: 'attack', bolt: classId === 'sorceress' ? 'fireBolt' : 'attack' },
  buffs: {},
  hp: CLASSES[classId].life, mana: CLASSES[classId].mana, stamina: CLASSES[classId].stamina, running: true, potions: [6, 4], stage: 1, difficultyLevel: 0, unlockedDifficulty: 0, shrines: [], bossDefeated: false,
  ammo: { arrows: 0, bolts: 0 },
  equipment: { ...emptyEquipment(), weapon: classId === 'paladin' ? makeItem(BASES[0], 'starter-sword') : classId === 'amazon' ? makeItem(BASES.find(base=>base.baseCode==='jav')!, 'starter-javelin') : { ...makeItem(BASES.find(base=>base.baseCode==='sst')!, 'starter-staff'), mods: { skill_fireBolt: 1 } }, shield: classId === 'sorceress' ? null : makeItem(BASES.find(base => base.name === '圆盾')!, 'starter-shield') },
  alternate: { weapon: classId === 'amazon' ? makeItem(BASES.find(base=>base.baseCode==='sbw')!,'starter-bow') : null, shield: null }, weaponSet: 0, inventory: [], stash: [], runes: [], identifyScrolls: 0,
  campaign: newCampaign(),
  questRewards: [], respecUsed: [], bonusLife: 0, bonusResist: 0, holyShield: 0, holyShieldLevel: 0, poison: 0, curse: 0, cold: 0, corpse: null,
});
export function activeEquipment(hero: HeroState, equipment = hero.equipment): Item[] {
  // Resolve requirements from independently wearable items; an item cannot qualify itself.
  const accepted: Item[] = [], pending = Object.values(equipment).filter((item): item is Item => !!item && !item.misc && !item.jewel && !item.charm && (!item.requiredClass || item.requiredClass === CLASSES[hero.classId].code) && item.identified !== false && item.durability !== 0 && (item.requiredLevel ?? 1) <= hero.level);
  const charms: Mods = {}; for (const item of activeCharms(hero)) addMods(charms, levelMods(itemMods(item), hero.level));
  let str = hero.strength + (charms.strength ?? 0), dex = hero.dexterity + (charms.dexterity ?? 0);
  for (let pass = 0; pass < SLOTS.length; pass++) {
    let changed = false;
    for (const item of pending) {
      if (accepted.includes(item) || itemRequirements(item).strength > str || itemRequirements(item).dexterity > dex) continue;
      if (item.slot === 'shield' && equipment.weapon?.twoHanded) continue;
      accepted.push(item); const mods = levelMods(itemMods(item), hero.level); str += mods.strength ?? 0; dex += mods.dexterity ?? 0; changed = true;
    }
    if (!changed) break;
  }
  return accepted;
}
export function activeCharms(hero: HeroState) {
  const unique = new Set<string>();
  return hero.inventory.filter(item => {
    if (!item.charm || item.identified === false || (item.requiredLevel ?? 1) > hero.level) return false;
    if (item.rarity !== 'unique') return true;
    const key = item.catalogId ?? item.name; if (unique.has(key)) return false; unique.add(key); return true;
  });
}
export function equipmentMods(hero: HeroState): Mods {
  const result: Mods = {}, active = activeEquipment(hero);
  let poisonSources = 0;
  for (const item of [...active, ...activeCharms(hero)]) {
    const mods = addMods(itemMods(item), catalogItemSetBonuses(item, active)); addMods(result, mods);
    if (mods.poisonFrames && mods.poisonMaxRate) poisonSources++;
  }
  // Poison lengths add within one item, but average across distinct equipped sources.
  if (poisonSources) result.poisonFrames = Math.floor((result.poisonFrames ?? 0) / poisonSources);
  addMods(result, catalogSetBonuses(active));
  return levelMods(result, hero.level);
}
export function skillLevel(hero: HeroState, id: ActionId, mods = equipmentMods(hero)) {
  if (id === 'attack' || (skillById[id].classId ?? 'paladin') !== hero.classId || !hero.skills[id] && !mods[`skill_${id}`]) return 0;
  return hero.skills[id] + (mods[`skill_${id}`] ?? 0) + (id === 'holyFire' || skillById[id].tree === 'fire' || ['fireArrow','explodingArrow','immolationArrow'].includes(id) ? mods.fireSkills ?? 0 : 0) + (mods.allSkills ?? 0) + (mods[`${hero.classId}Skills`] ?? 0) + (mods[skillById[id].tree === 'fire' ? 'fireSkillsTab' : `${skillById[id].tree}Skills` as Modifier] ?? 0);
}
export function auraValues(hero: HeroState, mods = equipmentMods(hero)) {
  const id = hero.activeAura, rank = id ? skillLevel(hero, id, mods) : 0;
  return { id: rank ? id : null, rank, ...skillValues(id ?? 'attack', rank, hero.skills) };
}
export function equippedAuras(hero: HeroState, mods = equipmentMods(hero)) {
  const selected = auraValues(hero, mods), ranks = new Map<SkillId, number>();
  for (const id of Object.keys(hero.skills) as SkillId[]) if (isAura(id) && mods[`aura_${id}`]) ranks.set(id, mods[`aura_${id}`]!);
  if (selected.id) ranks.set(selected.id, Math.max(ranks.get(selected.id) ?? 0, selected.rank));
  return [...ranks].map(([id, rank]) => ({ id, rank, ...skillValues(id, rank, hero.skills) }));
}
export function stats(hero: HeroState) {
  const mods = equipmentMods(hero), active = activeEquipment(hero), aura = auraValues(hero, mods), auras = equippedAuras(hero, mods);
  const character = CLASSES[hero.classId], passive = (id: SkillId) => skillValues(id, skillLevel(hero,id,mods),hero.skills);
  const buffs = hero.buffs ?? {}, buff = (id: SkillId) => skillValues(id, buffs[id]?.remaining ? buffs[id]!.rank : 0,hero.skills);
  mods.fireSkillDamage = (mods.fireSkillDamage ?? 0) + passive('fireMastery').percent;
  mods.lightningSkillDamage = (mods.lightningSkillDamage ?? 0) + passive('lightningMastery').percent;
  mods.coldPierce = (mods.coldPierce ?? 0) + passive('coldMastery').percent;
  const enchant = buff('enchant');
  if(enchant.min) { mods.fireMinDamage=(mods.fireMinDamage??0)+enchant.min; mods.fireMaxDamage=(mods.fireMaxDamage??0)+enchant.max; }
  mods.pierceChance = Math.min(100,(mods.pierceChance??0)+passive('pierce').percent);
  const classDefense = Math.max(...(['frozenArmor','shiverArmor','chillingArmor'] as const).map(id=>buff(id).percent));
  const auraStat = (id: SkillId, key: 'percent' | 'damage' | 'attack' | 'secondary') => auras.find(aura => aura.id === id)?.[key] ?? 0;
  const attributes = Object.fromEntries(Object.entries(BASE_ATTRIBUTES).map(([key]) => [key, hero[key as Attribute] + (mods[key as Modifier] ?? 0)])) as Record<Attribute, number>;
  const weapon = active.find(item => item === hero.equipment.weapon), shield = active.find(item => item === hero.equipment.shield);
  const holy = hero.holyShield > 0 && shield ? skillValues('holyShield', hero.holyShieldLevel || skillLevel(hero, 'holyShield', mods), hero.skills) : null;
  const maxHp = Math.max(1, (character.life + (hero.vitality - character.attributes.vitality) * character.lifePerVitality + (hero.level - 1) * character.lifePerLevel + (mods.life ?? 0) + hero.bonusLife) * (1 + (mods.maxLifePercent ?? 0) / 100) + (attributes.vitality - hero.vitality) * character.lifePerVitality + Math.floor((mods.lifePerLevel ?? 0) * hero.level));
  const maxMana = Math.max(1, (character.mana + (hero.energy - character.attributes.energy) * character.manaPerEnergy + (hero.level - 1) * character.manaPerLevel + (mods.mana ?? 0)) * (1 + (mods.maxManaPercent ?? 0) / 100) + (attributes.energy - hero.energy) * character.manaPerEnergy + Math.floor((mods.manaPerLevel ?? 0) * hero.level));
  const maxStamina = (character.stamina + attributes.vitality - character.attributes.vitality + hero.level - 1 + (mods.stamina ?? 0)) * (1 + auraStat('vigor', 'secondary') / 100);
  const weaponMods = weapon ? addMods(itemMods(weapon), catalogItemSetBonuses(weapon, active)) : {}, weaponED = weaponMods.damage ?? 0;
  const weaponMin = Math.floor((weapon?.minDamage ?? (weapon ? weapon.power * .65 : 1)) * (1 + weaponED / 100)) + (mods.damageFlat ?? 0) + (mods.minDamage ?? 0);
  const weaponMax = Math.max(weaponMin + 1, Math.floor((weapon?.maxDamage ?? weapon?.power ?? 2) * (1 + (weaponED + Math.floor((weaponMods.damagePercentPerLevel ?? 0) * hero.level)) / 100)) + (mods.damageFlat ?? 0) + (mods.maxDamage ?? 0) + Math.floor((mods.maxDamagePerLevel ?? 0) * hero.level));
  const ranged = rangedBase(weapon);
  const rangedMin = ranged ? Math.floor(ranged.min * (1 + weaponED / 100)) + (mods.damageFlat ?? 0) + (mods.minDamage ?? 0) : weaponMin;
  const rangedMax = ranged ? Math.max(rangedMin, Math.floor(ranged.max * (1 + (weaponED + Math.floor((weaponMods.damagePercentPerLevel ?? 0) * hero.level)) / 100)) + (mods.damageFlat ?? 0) + (mods.maxDamage ?? 0) + Math.floor((mods.maxDamagePerLevel ?? 0) * hero.level)) : weaponMax;
  const attributeDamage = ranged ? (attributes.strength * ranged.strength + attributes.dexterity * ranged.dexterity) / 100 : attributes.strength;
  const damageBonus = attributeDamage + (mods.damage ?? 0) - weaponED + auraStat('might', 'damage') + auraStat('concentration', 'damage') + auraStat('fanaticism', 'damage');
  const attackMin = (ranged ? rangedMin : weaponMin) * (1 + damageBonus / 100), attackMax = (ranged ? rangedMax : weaponMax) * (1 + damageBonus / 100);
  const baseAttackRating = Math.max(1, attributes.dexterity * 5 - 15 + (mods.attackRating ?? 0) + Math.floor((mods.attackRatingPerLevel ?? 0) * hero.level)), attackRatingBonus = auras.reduce((sum, aura) => sum + aura.attack, 0) + (auras.some(aura => aura.id === 'blessedAim') ? 0 : hero.skills.blessedAim * 5) + (mods.attackRatingPercent ?? 0) + Math.floor((mods.attackRatingPercentPerLevel ?? 0) * hero.level);
  const classAttack = passive('penetrate').attack + enchant.attack;
  const attackRating = Math.floor(baseAttackRating * (1 + (attackRatingBonus + classAttack) / 100));
  const armorItems = active.filter(item => item.slot !== 'weapon'), localED = (item: Item) => (itemMods(item).enhancedDefense ?? 0) + (catalogItemSetBonuses(item, active).enhancedDefense ?? 0);
  const globalED = (mods.enhancedDefense ?? 0) - armorItems.reduce((sum, item) => sum + localED(item), 0);
  const defense = Math.floor((attributes.dexterity / 4 + armorItems.reduce((total, item) => total + Math.floor(item.power * (1 + localED(item) / 100)), 0) + (mods.defense ?? 0) + Math.floor((mods.defensePerLevel ?? 0) * hero.level)) * (1 + (globalED + auraStat('defiance', 'percent') + classDefense + (holy?.percent ?? 0)) / 100));
  const block = shield ? Math.min(75, Math.max(0, Math.floor(((shield.block ?? 30) + character.blockBonus + (holy?.secondary ?? 0) + (mods.block ?? 0)) * (attributes.dexterity - 15) / (hero.level * 2)))) : 0;
  const resistances = {} as Record<'fire' | 'cold' | 'lightning' | 'poison', number>, maxResistances = { fire: 75, cold: 75, lightning: 75, poison: 75 };
  const penalty = [0, 40, 100][difficulty(hero)];
  for (const element of ['fire', 'cold', 'lightning', 'poison'] as const) {
    const resistSkill = ({ fire: 'resistFire', cold: 'resistCold', lightning: 'resistLightning', poison: null } as const)[element];
    const enabled = !!resistSkill && auras.some(aura => aura.id === resistSkill);
    const maxMod = ({ fire: 'maxFireRes', cold: 'maxColdRes', lightning: 'maxLightningRes', poison: 'maxPoisonRes' } as const)[element];
    maxResistances[element] = Math.min(95, (mods[maxMod] ?? 0) + (resistSkill ? 75 + (enabled ? hero.skills[resistSkill] : Math.floor(hero.skills[resistSkill] / 2)) : 75));
    resistances[element] = Math.max(-100, Math.min(maxResistances[element], (mods.allRes ?? 0) + (mods[`${element}Res`] ?? 0) + hero.bonusResist - penalty + (resistSkill ? auraStat(resistSkill, 'percent') : 0) + (element !== 'poison' ? auraStat('salvation', 'percent') : 0)));
  }
  const frozen = hero.cold > 0 && !mods.cannotBeFrozen;
  const effectiveIAS = Math.max(-50, Math.min(75, Math.floor(120 * (mods.ias ?? 0) / (120 + (mods.ias ?? 0))) + auraStat('fanaticism', 'percent') - (weapon?.speed ?? 0) - (frozen ? 50 : 0)));
  return { ...attributes, weapon, ranged, rangedMin, rangedMax, maxHp, maxMana, maxStamina, weaponMin, weaponMax, damageBonus, smiteDamageBonus: damageBonus - attributeDamage + attributes.strength, attackMin, attackMax, attack: (attackMin + attackMax) / 2, baseAttackRating, attackRatingBonus: attackRatingBonus + classAttack, attackRating, defense, armor: defense,
    criticalStrike: passive('criticalStrike').percent, dodge: passive('dodge').percent, avoid: passive('avoid').percent, evade: passive('evade').percent,
    magic: skillValues('blessedHammer', skillLevel(hero, 'blessedHammer', mods), hero.skills).max, xpNeeded: xpForLevel(hero.level), block, resistances, maxResistances,
    smiteMin: (shield?.smiteMin ?? 0) + (holy?.min ?? 0) + (mods.damageFlat ?? 0), smiteMax: (shield?.smiteMax ?? 0) + (holy?.max ?? 0) + (mods.damageFlat ?? 0), hasShield: !!shield,
    castFrames: breakpointFrames(mods.fcr ?? 0, [...character.fcr], character.cast), recoveryFrames: breakpointFrames(mods.fhr ?? 0, [...character.fhr], character.recovery), blockFrames: holy ? ((mods.fbr ?? 0) >= 86 ? 1 : 2) : breakpointFrames(mods.fbr ?? 0, [...character.fbr], character.block),
    lightningFrames: breakpointFrames(mods.fcr ?? 0, [0,7,15,23,35,52,78,117,194],19),
    attackFrames: Math.max(7, Math.ceil(15 * 100 / (100 + effectiveIAS))), zealFrames: Math.max(4, Math.ceil(7 * 100 / (100 + effectiveIAS))),
    rangedFrames: Math.max(7, Math.ceil((ranged?.kind === 'crossbow' ? 19 : 16) * 100 / (100 + effectiveIAS))),
    runSpeed: (1 + (mods.runWalk ?? 0) / 100 + auraStat('vigor', 'percent') / 100) * (frozen ? .5 : 1),
    manaRegen: maxMana / PALADIN_BALANCE.manaRecoverySeconds * (1 + ((mods.manaRegen ?? 0) + passive('warmth').percent + auraStat('meditation', 'percent')) / 100), lifeRegen: (mods.replenishLife ?? 0) * 25 / 256, mods, aura, auras,
  };
}
export function clampResources(hero: HeroState) { const s = stats(hero); hero.hp = Math.min(hero.hp, s.maxHp); hero.mana = Math.min(hero.mana, s.maxMana); hero.stamina = Math.min(hero.stamina, s.maxStamina); }
export function gainXp(hero: HeroState, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0 || hero.level >= 99) return false;
  hero.xp += Math.floor(amount); let leveled = false;
  while (hero.level < 99 && hero.xp >= xpForLevel(hero.level)) { hero.xp -= xpForLevel(hero.level); hero.level++; hero.points += 5; hero.skillPoints++; leveled = true; }
  if (hero.level === 99) hero.xp = 0;
  if (leveled) { const s = stats(hero); hero.hp = s.maxHp; hero.mana = s.maxMana; hero.stamina = s.maxStamina; }
  return leveled;
}
export function learnReason(hero: HeroState, id: SkillId): string {
  const skill = skillById[id], rank = hero.skills[id];
  if ((skill.classId ?? 'paladin') !== hero.classId) return '其他职业的技能';
  if (rank >= 20) return '已达到 20 点投入上限';
  if (hero.level < skill.level + rank) return `需要角色等级 ${skill.level + rank}`;
  const missing = skill.requires.filter(prerequisite => !hero.skills[prerequisite]);
  if (missing.length) return `需要 ${missing.map(key => skillById[key].name).join('、')}`;
  return hero.skillPoints ? '' : '没有可用技能点';
}
export function learnSkill(hero: HeroState, id: SkillId) { if (!isSkill(id) || learnReason(hero, id)) return false; hero.skillPoints--; hero.skills[id]++; return true; }
export function bindSkill(hero: HeroState, key: keyof HeroState['bindings'], id: ActionId) { if (id !== 'attack' && (!isSkill(id) || isPassive(id) || !skillLevel(hero, id)) || !Object.hasOwn(hero.bindings, key) || key === 'attack' && isAura(id)) return false; hero.bindings[key] = id; return true; }
export function setAura(hero: HeroState, id: SkillId | null) { if (id && (!isSkill(id) || !isAura(id) || !skillLevel(hero, id))) return false; hero.activeAura = id; clampResources(hero); return true; }
export function allocateAttribute(hero: HeroState, key: Attribute, count = 1) {
  if (!Object.hasOwn(BASE_ATTRIBUTES, key) || !Number.isSafeInteger(count) || count < 1 || hero.points < count) return false;
  hero.points -= count; hero[key] += count;
  if (key === 'vitality') { hero.hp += count * CLASSES[hero.classId].lifePerVitality; hero.stamina += count; }
  if (key === 'energy') hero.mana += count * CLASSES[hero.classId].manaPerEnergy; return true;
}
export function equipReason(hero: HeroState, item: Item, target: Slot = item.slot) {
  if (item.misc) return '杂物无法装备';
  if (item.jewel) return '珠宝用于镶嵌';
  if (item.requiredClass && item.requiredClass !== CLASSES[hero.classId].code) return `仅限${CLASS_NAMES[item.requiredClass] ?? item.requiredClass}`;
  if (item.charm) return '护身符在背包中生效'; if (item.identified === false) return '需要先鉴定'; if (item.durability === 0) return '装备已损坏';
  if (item.slot !== target && !(item.slot === 'ring' && target === 'ring2')) return '不匹配的装备栏';
  if ((item.requiredLevel ?? 1) > hero.level) return `需要等级 ${item.requiredLevel}`;
  const gear = { ...hero.equipment, [target]: null }; if (item.twoHanded) gear.shield = null; if (target === 'shield' && gear.weapon?.twoHanded) gear.weapon = null;
  const mods: Mods = {}; activeEquipment(hero, gear).forEach(gear => addMods(mods, levelMods(itemMods(gear), hero.level))); for (const charm of activeCharms(hero)) addMods(mods, levelMods(itemMods(charm), hero.level));
  if (hero.strength + (mods.strength ?? 0) < itemRequirements(item).strength) return `需要力量 ${itemRequirements(item).strength}`;
  if (hero.dexterity + (mods.dexterity ?? 0) < itemRequirements(item).dexterity) return `需要敏捷 ${itemRequirements(item).dexterity}`; return '';
}
export function equipFromItems(hero: HeroState, items: Item[], id: string, target?: Slot, rows = 4): boolean {
  const item = items.find(item => item.id === id); if (!item) return false;
  const slot = target ?? (item.slot === 'ring' && hero.equipment.ring && !hero.equipment.ring2 ? 'ring2' : item.slot);
  if (equipReason(hero, item, slot)) return false;
  const equipment = { ...hero.equipment }, remaining = items.filter(other => other.id !== id), removed = new Set<Item>();
  const remove = (key: Slot) => { if (equipment[key]) { remaining.push(equipment[key]!); removed.add(equipment[key]!); } equipment[key] = null; };
  remove(slot); if (item.twoHanded) remove('shield'); if (slot === 'shield' && equipment.weapon?.twoHanded) remove('weapon');
  const layout = remaining.map(item => { const copy = { ...item }; if (removed.has(item)) { delete copy.x; delete copy.y; } return copy; });
  const positions = packItems(layout, rows);
  if (items === hero.stash && remaining.length > 200 || new Set(remaining.map(item => item.id)).size !== remaining.length || !positions) return false;
  for (const item of remaining) { const position = positions.get(item.id)!; item.x = position.x; item.y = position.y; }
  equipment[slot] = item; delete item.x; delete item.y;
  hero.equipment = equipment; items.splice(0, items.length, ...remaining); clampResources(hero); return true;
}
export function equipItem(hero: HeroState, id: string, target?: Slot, container: 'inventory' | 'stash' = 'inventory'): boolean {
  const items = hero[container];
  return equipFromItems(hero, items, id, target, container === 'inventory' ? 4 : stashRows(items));
}
function unequipLayout(hero: HeroState, items: Item[], slot: Slot, rows: number, position?: { x: number; y: number }) {
  const item = hero.equipment[slot];
  if (!item || items.some(other => other.id === item.id) || new Set(items.map(other => other.id)).size !== items.length || items === hero.stash && items.length >= 200) return null;
  if (position && (!Number.isInteger(position.x) || !Number.isInteger(position.y))) return null;
  const existing = packItems(items, rows); if (!existing) return null;
  const layout = items.map(other => ({ ...other, x: existing.get(other.id)!.x, y: existing.get(other.id)!.y }));
  const moved = { ...item }; delete moved.x; delete moved.y;
  if (position) { moved.x = position.x; moved.y = position.y; }
  const positions = packItems([...layout, moved], rows), placed = positions?.get(item.id);
  if (!positions || position && (placed?.x !== position.x || placed?.y !== position.y)) return null;
  return positions;
}
export function canUnequipToItems(hero: HeroState, items: Item[], slot: Slot, rows = 4, position?: { x: number; y: number }) {
  return unequipLayout(hero, items, slot, rows, position) !== null;
}
export function unequipToItems(hero: HeroState, items: Item[], slot: Slot, rows = 4, position?: { x: number; y: number }) {
  const positions = unequipLayout(hero, items, slot, rows, position); if (!positions) return false;
  const item = hero.equipment[slot]!;
  items.push(item); for (const entry of items) { const position = positions.get(entry.id)!; entry.x = position.x; entry.y = position.y; }
  hero.equipment[slot] = null; clampResources(hero); return true;
}
export function swapRingSlots(hero: HeroState, from: Slot, to: Slot) {
  if (from === to || !['ring', 'ring2'].includes(from) || !['ring', 'ring2'].includes(to) || !hero.equipment[from]) return false;
  [hero.equipment[from], hero.equipment[to]] = [hero.equipment[to], hero.equipment[from]];
  clampResources(hero); return true;
}
export function unequipItem(hero: HeroState, slot: Slot, container: 'inventory' | 'stash' = 'inventory') {
  if (container === 'stash' && hero.stash.length >= 200) return false;
  return unequipToItems(hero, hero[container], slot, container === 'inventory' ? 4 : stashRows([...hero.stash, ...(hero.equipment[slot] ? [hero.equipment[slot]!] : [])]));
}
export function swapWeapons(hero: HeroState) { [hero.equipment.weapon, hero.alternate.weapon] = [hero.alternate.weapon, hero.equipment.weapon]; [hero.equipment.shield, hero.alternate.shield] = [hero.alternate.shield, hero.equipment.shield]; hero.weaponSet = hero.weaponSet ? 0 : 1; clampResources(hero); }
export function moveStorage(hero: HeroState, id: string, toStash: boolean) {
  const from = toStash ? hero.inventory : hero.stash, to = toStash ? hero.stash : hero.inventory, item = from.find(item => item.id === id);
  const rows = toStash ? stashRows(to) : 4;
  if (!item || !packItems([...to, item], rows)) return false;
  from.splice(from.indexOf(item), 1); to.push(item); placeItems(to, rows); clampResources(hero); return true;
}
export function insertRune(hero: HeroState, id: string, rune: RuneId) { const index = hero.runes.indexOf(rune), item = [...hero.inventory, ...hero.stash].find(item => item.id === id); if (index < 0 || !item || !socketItem(item, rune)) return false; hero.runes.splice(index, 1); return true; }
export function insertJewel(hero: HeroState, targetId: string, jewelId: string) {
  const items = [...hero.inventory, ...hero.stash], target = items.find(item => item.id === targetId), jewel = items.find(item => item.id === jewelId);
  if (!target || !jewel?.jewel || target === jewel || target.identified === false || jewel.identified === false || !target.sockets || filledSockets(target) >= target.sockets) return false;
  (target.socketedJewels ??= []).push({ name: jewel.name, mods: { ...jewel.mods }, ...(jewel.catalogId ? { catalogId: jewel.catalogId } : {}), ...(jewel.catalogVersion ? { catalogVersion: jewel.catalogVersion } : {}), ...(jewel.catalogRolls ? { catalogRolls: [...jewel.catalogRolls] } : {}) });
  target.requiredLevel = Math.max(target.requiredLevel ?? 1, jewel.requiredLevel ?? 1);
  hero.inventory = hero.inventory.filter(item => item !== jewel); hero.stash = hero.stash.filter(item => item !== jewel); return true;
}
export const IDENTIFY_COST = 80;
export function identifyItem(hero: HeroState, id: string) {
  const item = [...hero.inventory, ...hero.stash].find(item => item.id === id);
  if (!item || item.identified !== false || hero.gold < IDENTIFY_COST) return false;
  hero.gold -= IDENTIFY_COST; item.identified = true; return true;
}
export function sellItem(hero: HeroState, id: string) {
  const container = [hero.inventory, hero.stash].find(items => items.some(item => item.id === id));
  if (!container) return false;
  const index = container.findIndex(item => item.id === id);
  hero.gold += container[index].value; container.splice(index, 1); clampResources(hero); return true;
}
export function repairCost(hero: HeroState) { return [...Object.values(hero.equipment), ...Object.values(hero.alternate), ...hero.inventory].reduce((sum, item) => sum + (item?.maxDurability ? Math.max(0, Math.ceil((item.maxDurability - (item.durability ?? item.maxDurability)) * Math.max(1, item.level / 3))) : 0), 0); }
export function repairEquipment(hero: HeroState) { const cost = repairCost(hero); if (hero.gold < cost) return false; hero.gold -= cost; for (const item of [...Object.values(hero.equipment), ...Object.values(hero.alternate), ...hero.inventory]) if (item) { if (item.maxDurability) item.durability = item.maxDurability; } return true; }
export function respec(hero: HeroState) {
  const diff = difficulty(hero); if (hero.respecUsed.includes(diff) || !hero.questRewards.includes(`${diff}:shrine0`)) return false;
  const base = CLASSES[hero.classId].attributes;
  hero.respecUsed.push(diff); hero.points += Object.keys(base).reduce((sum, key) => sum + hero[key as Attribute] - base[key as Attribute], 0);
  Object.assign(hero, base); hero.skillPoints += Object.values(hero.skills).reduce((sum, rank) => sum + rank, 0); hero.skills = emptySkills(); hero.activeAura = null; hero.holyShield = 0; hero.holyShieldLevel = 0; hero.buffs = {};
  for (const key of Object.keys(hero.bindings) as (keyof HeroState['bindings'])[]) hero.bindings[key] = 'attack'; clampResources(hero); return true;
}
export function grantQuestReward(hero: HeroState, event: 'shrine0' | 'shrine1' | 'shrine2' | 'boss') {
  const key = `${difficulty(hero)}:${event}`; if (hero.questRewards.includes(key)) return false; hero.questRewards.push(key);
  if (event === 'shrine0' || event === 'shrine1') hero.skillPoints++;
  if (event === 'shrine2') { hero.points += 5; hero.bonusLife += 20; hero.bonusResist += 10; }
  if (event === 'boss') hero.skillPoints += 2; return true;
}
export function prepareCampaignReplay(hero: HeroState): boolean {
  const { campaign, difficultyLevel: diff } = hero, index = campaign.current;
  if (!canEnterLevel(campaign, index, diff) || index >= campaign.cleared[diff]) return false;
  const quest = LEVELS[index].quest;
  campaign.kills = quest.kind === 'kill' ? quest.count : 0;
  campaign.objects = quest.kind === 'interact' ? Array.from({ length: quest.count }, (_, i) => i) : [];
  hero.bossDefeated = false;
  return true;
}
export function selectCampaignLevel(hero: HeroState, index: number, diff = hero.difficultyLevel, preserveProgress = false): boolean {
  if (!canEnterLevel(hero.campaign, index, diff)) return false;
  const resume = preserveProgress && index === hero.campaign.current && diff === hero.difficultyLevel && index >= hero.campaign.cleared[diff];
  hero.difficultyLevel = diff; hero.unlockedDifficulty = unlockedCampaignDifficulty(hero.campaign);
  hero.campaign.current = index;
  if (!resume) { hero.campaign.kills = 0; hero.campaign.objects = []; }
  hero.stage = index + 1; hero.shrines = []; hero.bossDefeated = false;
  prepareCampaignReplay(hero);
  if (!resume) { hero.holyShield = 0; hero.holyShieldLevel = 0; hero.poison = hero.curse = hero.cold = 0; }
  if (hero.corpse) { hero.corpse.x = 0; hero.corpse.z = 11; hero.corpse.xpLost = 0; }
  if (!resume) { const s = stats(hero); hero.hp = s.maxHp; hero.mana = s.maxMana; hero.stamina = s.maxStamina; }
  return true;
}
export function recordQuestKill(hero: HeroState) {
  const quest = LEVELS[hero.campaign.current].quest;
  if (hero.bossDefeated || quest.kind !== 'kill' || hero.campaign.kills >= quest.count) return false;
  hero.campaign.kills++; return true;
}
export function activateQuestObject(hero: HeroState, index: number) {
  const quest = LEVELS[hero.campaign.current].quest;
  if (hero.bossDefeated || quest.kind !== 'interact' || !Number.isInteger(index) || index < 0 || index >= quest.count || hero.campaign.objects.includes(index)) return false;
  hero.campaign.objects.push(index); return true;
}
export function completeCampaignLevel(hero: HeroState) {
  const { campaign } = hero, index = campaign.current, diff = difficulty(hero);
  if (hero.bossDefeated || !questComplete(campaign) || !canEnterLevel(campaign, index, diff)) return false;
  hero.bossDefeated = true;
  if (index === campaign.cleared[diff]) {
    campaign.cleared[diff]++;
    hero.gold += 100 + index * 35 + diff * 250;
    if (index === 0) grantQuestReward(hero, 'shrine0');
    if (index === 5) grantQuestReward(hero, 'shrine1');
    if (index === 16) grantQuestReward(hero, 'boss');
    const reward = index === 10 ? 'life' : index === 12 ? 'attributes' : index === 22 ? 'resistance' : null;
    if (reward && !hero.questRewards.includes(`${diff}:${reward}`) && !hero.questRewards.includes(`${diff}:shrine2`)) {
      hero.questRewards.push(`${diff}:${reward}`);
      if (reward === 'life') hero.bonusLife += 20;
      if (reward === 'attributes') hero.points += 5;
      if (reward === 'resistance') hero.bonusResist += 10;
    }
  }
  hero.unlockedDifficulty = unlockedCampaignDifficulty(campaign);
  return true;
}
export function hitChance(attack: number, defense: number, attackerLevel: number, defenderLevel: number) { return Math.max(5, Math.min(95, 200 * attack / Math.max(1, attack + defense) * attackerLevel / Math.max(1, attackerLevel + defenderLevel))); }
export function resistedDamage(amount: number, resistance: number, reduction = 0) { const resist = resistance - (resistance >= 100 ? reduction / 5 : reduction); return resist >= 100 ? 0 : Math.max(0, amount * (1 - Math.max(-100, resist) / 100)); }
export function createCorpse(hero: HeroState, x: number, z: number) {
  const loss = Math.min(hero.xp, Math.floor(xpForLevel(hero.level) * [0, .05, .1][difficulty(hero)])); hero.xp -= loss;
  const gold = Math.floor(hero.gold * Math.min(.2, hero.level / 100)); hero.gold -= gold;
  if (!hero.corpse) hero.corpse = { equipment: hero.equipment, extras: [], x, z, xpLost: loss, gold };
  else { hero.corpse.xpLost += loss; hero.corpse.gold += gold; for (const slot of SLOTS) { const item = hero.equipment[slot]; if (item) { if (hero.corpse.equipment[slot]) hero.corpse.extras.push(item); else hero.corpse.equipment[slot] = item; } } }
  hero.equipment = emptyEquipment();
  hero.holyShield = 0; hero.holyShieldLevel = 0; hero.poison = 0; hero.curse = 0; hero.cold = 0;
}
export function recoverCorpse(hero: HeroState, inField = true) {
  const corpse = hero.corpse; if (!corpse) return false;
  const inventory = [...hero.inventory, ...corpse.extras], equipment = { ...hero.equipment };
  for (const slot of SLOTS) { const item = corpse.equipment[slot]; if (!item) continue; if (equipment[slot]) inventory.push(equipment[slot]!); equipment[slot] = item; }
  if (!placeItems(inventory)) return false;
  hero.equipment = equipment; hero.inventory = inventory; hero.gold += corpse.gold; if (inField) hero.xp += Math.floor(corpse.xpLost * .75); hero.corpse = null; clampResources(hero); return true;
}
const integer = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
const decimal = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const parseCatalogRolls = (value: unknown) => Array.isArray(value) ? value.slice(0, 64).map(roll => decimal(roll, .5, 0, 1 - Number.EPSILON)) : undefined;
export function parseItem(value: unknown): Item | null {
  if (!value || typeof value !== 'object') return null; const item = value as Record<string, any>;
  if (typeof item.id !== 'string' || item.id.length > 80 || !item.id || typeof item.name !== 'string' || item.name.length > 60 || !SLOTS.includes(item.slot) || !['common', 'magic', 'rare', 'set', 'unique', 'runeword', 'legendary'].includes(item.rarity)) return null;
  if (!['power', 'level', 'value'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0 && item[key] <= 1000000)) return null;
  const result: Item = { id: item.id, name: item.name, slot: item.slot, rarity: item.rarity, power: item.power, level: item.level, value: item.value };
  for (const key of ['base', 'setId', 'baseCode', 'catalogId'] as const) if (typeof item[key] === 'string' && item[key].length <= 60) result[key] = item[key];
  if (typeof item.requiredClass === 'string' && Object.hasOwn(CLASS_NAMES, item.requiredClass)) result.requiredClass = item.requiredClass;
  for (const key of ['minDamage', 'maxDamage', 'smiteMin', 'smiteMax', 'block', 'requiredLevel', 'requiredStrength', 'requiredDexterity', 'durability', 'maxDurability'] as const) if (item[key] !== undefined) result[key] = decimal(item[key], 0, 0, 10000);
  if (item.speed !== undefined) result.speed = integer(item.speed, 0, -60, 100);
  if (item.quantity !== undefined) result.quantity = integer(item.quantity, 0, 0, 10000);
  if (result.maxDurability !== undefined && result.durability !== undefined) result.durability = Math.min(result.maxDurability, result.durability);
  for (const key of ['identified', 'twoHanded', 'charm', 'jewel', 'misc'] as const) if (typeof item[key] === 'boolean') result[key] = item[key];
  if (result.misc && item.event === 'wirts-leg' && [0, 1, 2].includes(item.eventDifficulty) && item.name === `维特之腿 · ${['普通', '噩梦', '地狱'][item.eventDifficulty]}`) {
    result.event = 'wirts-leg'; result.eventDifficulty = item.eventDifficulty;
  }
  if (['small', 'large', 'grand'].includes(item.charmSize) && result.charm) result.charmSize = item.charmSize;
  if (Array.isArray(item.affixes)) result.affixes = [...new Set<string>(item.affixes.filter((id: unknown) => typeof id === 'string' && !!affixById(id)))].slice(0, 6);
  if (item.catalogVersion === 1 || item.catalogVersion === 2) result.catalogVersion = item.catalogVersion;
  if (Array.isArray(item.catalogRolls)) result.catalogRolls = parseCatalogRolls(item.catalogRolls);
  if (item.mods && typeof item.mods === 'object') { result.mods = {}; for (const key of Object.keys(MOD_NAMES) as Modifier[]) if (item.mods[key] !== undefined) result.mods[key] = decimal(item.mods[key], 0, -1000, ['poisonMinRate', 'poisonMaxRate', 'poisonFrames'].includes(key) ? 65535 : 1000); }
  if (item.sockets !== undefined) result.sockets = integer(item.sockets, 0, 0, 6);
  if (Array.isArray(item.runes)) result.runes = item.runes.filter((rune: unknown): rune is RuneId => typeof rune === 'string' && Object.hasOwn(RUNES, rune)).slice(0, result.sockets ?? 0);
  if (Array.isArray(item.socketedJewels)) result.socketedJewels = item.socketedJewels.filter((jewel: any) => jewel && typeof jewel.name === 'string' && jewel.name.length <= 60 && jewel.mods && typeof jewel.mods === 'object').slice(0, Math.max(0, (result.sockets ?? 0) - (result.runes?.length ?? 0))).map((jewel: any) => {
    const mods: Mods = {}; for (const key of Object.keys(MOD_NAMES) as Modifier[]) if (jewel.mods[key] !== undefined) mods[key] = decimal(jewel.mods[key], 0, -1000, ['poisonMinRate', 'poisonMaxRate', 'poisonFrames'].includes(key) ? 65535 : 1000);
    return { name: jewel.name, mods, ...(typeof jewel.catalogId === 'string' && jewel.catalogId.length <= 60 ? { catalogId: jewel.catalogId } : {}), ...([1, 2].includes(jewel.catalogVersion) ? { catalogVersion: jewel.catalogVersion } : {}), ...(Array.isArray(jewel.catalogRolls) ? { catalogRolls: parseCatalogRolls(jewel.catalogRolls) } : {}) };
  });
  if (item.width !== undefined) result.width = integer(item.width, 1, 1, 2); if (item.height !== undefined) result.height = integer(item.height, 1, 1, 4);
  if (item.x !== undefined) result.x = integer(item.x, 0, 0, 9); if (item.y !== undefined) result.y = integer(item.y, 0, 0, 99); return migrateCatalogItem(result);
}
export function parseSave(raw: string | null): HeroState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw); if (![1, 2].includes(data.version) || !data.hero || typeof data.hero !== 'object' || Array.isArray(data.hero)) return null;
    const h = data.hero;
    if(h.classId !== undefined && !isClassId(h.classId)) return null;
    const hero = newHero(h.classId ?? 'paladin'), legacy = h.rulesVersion !== 2, base = CLASSES[hero.classId].attributes; hero.level = integer(h.level, 1, 1, 99);
    if (h.rulesVersion !== undefined && h.rulesVersion !== 2) return null;
    for (const key of ['gold', 'kills', 'points', 'skillPoints'] as const) hero[key] = integer(h[key], key === 'skillPoints' ? hero.level - 1 : 0, 0, 10000000);
    hero.xp = decimal(h.xp, 0, 0, hero.level === 99 ? 0 : xpForLevel(hero.level) - 1);
    for (const key of Object.keys(base) as Attribute[]) hero[key] = integer(h[key], base[key], base[key], 10000);
    if (legacy) {
      Object.assign(hero, base); hero.points = (hero.level - 1) * 5; hero.skillPoints = hero.level - 1;
      hero.xp = Math.floor(Math.min(.999, Math.max(0, Number(h.xp) || 0) / (80 + (hero.level - 1) * 65)) * xpForLevel(hero.level));
    } else {
      const available = skillsForClass(hero.classId).sort((a,b)=>a.level-b.level);
      for (const skill of available) hero.skills[skill.id] = integer(h.skills?.[skill.id], 0, 0, Math.min(20, Math.max(0, hero.level - skill.level + 1)));
      for (const skill of available) if (hero.skills[skill.id] && skill.requires.some(id => !hero.skills[id])) { hero.skillPoints += hero.skills[skill.id]; hero.skills[skill.id] = 0; }
      for (const key of Object.keys(hero.bindings) as (keyof HeroState['bindings'])[]) { const id = h.bindings?.[key]; if (id === 'attack' || isSkill(id) && !isPassive(id) && hero.skills[id] && !(key === 'attack' && isAura(id))) hero.bindings[key] = id; }
      const aura = h.activeAura; if (isSkill(aura) && isAura(aura) && hero.skills[aura]) hero.activeAura = aura;
    }
    hero.stage = integer(h.stage, 1, 1, 100); hero.shrines = Array.isArray(h.shrines) ? [...new Set<number>(h.shrines.filter((id: unknown) => typeof id === 'number' && [0, 1, 2].includes(id)))] : []; hero.bossDefeated = h.bossDefeated === true;
    hero.difficultyLevel = integer(h.difficultyLevel, legacy ? Math.min(2, hero.stage - 1) : 0, 0, 2) as 0 | 1 | 2;
    hero.unlockedDifficulty = integer(h.unlockedDifficulty, hero.difficultyLevel, hero.difficultyLevel, 2) as 0 | 1 | 2;
    if (h.campaign !== undefined && (!h.campaign || h.campaign.version !== 1)) return null;
    hero.campaign = parseCampaign(h.campaign);
    hero.unlockedDifficulty = unlockedCampaignDifficulty(hero.campaign);
    hero.difficultyLevel = Math.min(hero.difficultyLevel, hero.unlockedDifficulty) as 0 | 1 | 2;
    if (!h.campaign || !canEnterLevel(hero.campaign, hero.campaign.current, hero.difficultyLevel)) {
      hero.campaign.current = Math.min(24, hero.campaign.cleared[hero.difficultyLevel]); hero.campaign.kills = 0; hero.campaign.objects = []; hero.bossDefeated = false;
    }
    if (hero.bossDefeated && (hero.campaign.current >= hero.campaign.cleared[hero.difficultyLevel] || !questComplete(hero.campaign))) hero.bossDefeated = false;
    hero.stage = hero.campaign.current + 1;
    if (Array.isArray(h.potions)) hero.potions = [integer(h.potions[0], 6, 0, 99), integer(h.potions[1], 4, 0, 99)];
    if (h.ammo && typeof h.ammo === 'object') hero.ammo = { arrows: integer(h.ammo.arrows, 0, 0, 600), bolts: integer(h.ammo.bolts, 0, 0, 600) };
    const seen = new Set<string>(); const uniqueItem = (value: unknown) => { const item = parseItem(value); if (!item || seen.has(item.id)) return null; seen.add(item.id); return item; };
    if (h.equipment && typeof h.equipment === 'object') for (const slot of SLOTS) {
      if (h.equipment[slot] === null || legacy && !Object.hasOwn(h.equipment, slot)) hero.equipment[slot] = null;
      else if (h.equipment[slot]) { const item = uniqueItem(h.equipment[slot]); if (item && (item.slot === slot || slot === 'ring2' && item.slot === 'ring')) hero.equipment[slot] = item; }
    }
    for (const slot of ['weapon', 'shield'] as const) { const item = uniqueItem(h.alternate?.[slot]); if (item?.slot === slot) hero.alternate[slot] = item; } hero.weaponSet = h.weaponSet === 1 ? 1 : 0;
    hero.inventory = Array.isArray(h.inventory) ? h.inventory.map(uniqueItem).filter((item: Item | null): item is Item => !!item).slice(0, 200) : [];
    hero.stash = Array.isArray(h.stash) ? h.stash.map(uniqueItem).filter((item: Item | null): item is Item => !!item).slice(0, 200) : [];
    if (!packItems(hero.inventory)) { const items = hero.inventory; hero.inventory = []; for (const item of items) { if (packItems([...hero.inventory, item])) hero.inventory.push(item); else hero.stash.push(item); } placeItems(hero.inventory); }
    hero.runes = Array.isArray(h.runes) ? h.runes.filter((rune: unknown): rune is RuneId => typeof rune === 'string' && Object.hasOwn(RUNES, rune)).slice(0, 1000) : []; hero.identifyScrolls = integer(h.identifyScrolls, 0, 0, 99);
    hero.questRewards = Array.isArray(h.questRewards) ? [...new Set<string>(h.questRewards.filter((key: unknown) => typeof key === 'string' && /^[0-2]:(shrine[0-2]|boss|life|attributes|resistance)$/.test(key)))] : [];
    hero.respecUsed = Array.isArray(h.respecUsed) ? [...new Set<number>(h.respecUsed.filter((value: unknown) => value === 0 || value === 1 || value === 2))] : [];
    hero.bonusLife = integer(h.bonusLife, 0, 0, 60); hero.bonusResist = integer(h.bonusResist, 0, 0, 30); hero.holyShield = decimal(h.holyShield, 0, 0, 3600); hero.poison = decimal(h.poison, 0, 0, 120); hero.curse = decimal(h.curse, 0, 0, 120); hero.cold = decimal(h.cold, 0, 0, 120); hero.running = h.running !== false;
    hero.holyShieldLevel = integer(h.holyShieldLevel, 0, 0, 100);
    if (h.corpse && typeof h.corpse === 'object') {
      const equipment = emptyEquipment(); for (const slot of SLOTS) { const item = uniqueItem(h.corpse.equipment?.[slot]); if (item && (item.slot === slot || slot === 'ring2' && item.slot === 'ring')) equipment[slot] = item; }
      const extras = Array.isArray(h.corpse.extras) ? h.corpse.extras.map(uniqueItem).filter((item: Item | null): item is Item => !!item).slice(0, 200) : [];
      hero.corpse = { equipment, extras, x: decimal(h.corpse.x, 0, -FIELD_BOUND, FIELD_BOUND), z: decimal(h.corpse.z, 11, -FIELD_BOUND, FIELD_BOUND), xpLost: integer(h.corpse.xpLost, 0, 0, 1000000000), gold: integer(h.corpse.gold, 0, 0, 10000000) };
    }
    for (const key of Object.keys(hero.bindings) as (keyof HeroState['bindings'])[]) { const id = h.bindings?.[key]; if (isSkill(id) && !isPassive(id) && skillLevel(hero, id) && !(key === 'attack' && isAura(id))) hero.bindings[key] = id; }
    for(const skill of skillsForClass(hero.classId)) if(skill.mode === 'buff' && h.buffs?.[skill.id]) {
      const buff=h.buffs[skill.id]; hero.buffs[skill.id]={remaining:decimal(buff.remaining,0,0,3600),rank:integer(buff.rank,0,0,100)};
    }
    if (isSkill(h.activeAura) && isAura(h.activeAura) && skillLevel(hero, h.activeAura)) hero.activeAura = h.activeAura;
    const s = stats(hero); hero.hp = decimal(h.hp, s.maxHp, 1, s.maxHp); hero.mana = decimal(h.mana, s.maxMana, 0, s.maxMana); hero.stamina = decimal(h.stamina, s.maxStamina, 0, s.maxStamina); return hero;
  } catch { return null; }
}
export function serializeSave(hero: HeroState) { return JSON.stringify({ version: 2, hero }); }
export const totalExperience = (hero: HeroState) => EXPERIENCE[hero.level - 1] + hero.xp;
export const damageTypeNames: Record<DamageType, string> = { physical: '物理', magic: '魔法', fire: '火焰', cold: '冰冷', lightning: '闪电', poison: '毒素' };
