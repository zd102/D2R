import { BASE_ATTRIBUTES, PALADIN_BALANCE, SKILLS, skillById, emptySkills, isSkill, isAura, skillValues, xpForLevel, EXPERIENCE, breakpointFrames, FCR, FHR, FBR, type SkillId, type ActionId, type Attribute, type DamageType } from './paladin.ts';
import { SLOTS, BASES, MOD_NAMES, RUNES, makeItem, addMods, itemMods, itemRequirements, packItems, placeItems, stashRows, socketItem, type Mods, type Modifier, type Slot, type Item, type RuneId } from './items.ts';
import { LEVELS, newCampaign, parseCampaign, canEnterLevel, questComplete, unlockedCampaignDifficulty, type CampaignState } from './campaign.ts';
import { affixById } from './affixes.ts';
export { rarityNames, slotNames, rollItem, SLOTS } from './items.ts';
export type { Slot, Item, Rarity } from './items.ts';
export type HeroState = {
  rulesVersion: 2; classId: 'paladin'; level: number; xp: number; gold: number; kills: number; points: number;
  strength: number; dexterity: number; vitality: number; energy: number;
  skillPoints: number; skills: Record<SkillId, number>; activeAura: SkillId | null;
  bindings: Record<'attack' | 'cleave' | 'nova' | 'dash' | 'bolt', ActionId>;
  hp: number; mana: number; stamina: number; running: boolean; potions: [number, number];
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
export const newHero = (): HeroState => ({
  rulesVersion: 2, classId: 'paladin', level: 1, xp: 0, gold: 0, kills: 0, points: 0, ...BASE_ATTRIBUTES,
  skillPoints: 0, skills: emptySkills(), activeAura: null,
  bindings: { attack: 'attack', cleave: 'attack', nova: 'attack', dash: 'attack', bolt: 'attack' },
  hp: 55, mana: 15, stamina: 89, running: true, potions: [6, 4], stage: 1, difficultyLevel: 0, unlockedDifficulty: 0, shrines: [], bossDefeated: false,
  equipment: { ...emptyEquipment(), weapon: makeItem(BASES[0], 'starter-sword'), shield: makeItem(BASES.find(base => base.name === '圆盾')!, 'starter-shield') },
  alternate: { weapon: null, shield: null }, weaponSet: 0, inventory: [], stash: [], runes: [], identifyScrolls: 5,
  campaign: newCampaign(),
  questRewards: [], respecUsed: [], bonusLife: 0, bonusResist: 0, holyShield: 0, holyShieldLevel: 0, poison: 0, curse: 0, cold: 0, corpse: null,
});
export function activeEquipment(hero: HeroState, equipment = hero.equipment): Item[] {
  // Resolve requirements from independently wearable items; an item cannot qualify itself.
  const accepted: Item[] = [], pending = Object.values(equipment).filter((item): item is Item => !!item && item.identified !== false && item.durability !== 0 && (item.requiredLevel ?? 1) <= hero.level);
  const charms: Mods = {}; for (const item of hero.inventory) if (item.charm && item.identified !== false && (item.requiredLevel ?? 1) <= hero.level) addMods(charms, itemMods(item));
  let str = hero.strength + (charms.strength ?? 0), dex = hero.dexterity + (charms.dexterity ?? 0);
  for (let pass = 0; pass < SLOTS.length; pass++) {
    let changed = false;
    for (const item of pending) {
      if (accepted.includes(item) || itemRequirements(item).strength > str || itemRequirements(item).dexterity > dex) continue;
      if (item.slot === 'shield' && equipment.weapon?.twoHanded) continue;
      accepted.push(item); const mods = itemMods(item); str += mods.strength ?? 0; dex += mods.dexterity ?? 0; changed = true;
    }
    if (!changed) break;
  }
  return accepted;
}
export function equipmentMods(hero: HeroState): Mods {
  const result: Mods = {}, active = activeEquipment(hero);
  let poisonSources = 0;
  for (const item of [...active, ...hero.inventory.filter(item => item.charm && item.identified !== false && (item.requiredLevel ?? 1) <= hero.level)]) {
    const mods = itemMods(item); addMods(result, mods);
    if (mods.poisonFrames && mods.poisonMaxRate) poisonSources++;
  }
  // Poison lengths add within one item, but average across distinct equipped sources.
  if (poisonSources) result.poisonFrames = Math.floor((result.poisonFrames ?? 0) / poisonSources);
  const setCount = new Set(active.filter(item => item.setId === 'sigon').map(item => item.slot)).size;
  if (setCount >= 2) addMods(result, { lifeSteal: 10 });
  if (setCount >= 3) addMods(result, { defense: 100 });
  const setSlots = new Set(active.filter(item => item.setId === 'sigon').map(item => item.slot));
  if (setCount >= 2) { if (setSlots.has('helm')) addMods(result, { attackRating: hero.level * 8 }); if (setSlots.has('gloves')) addMods(result, { ias: 30 }); if (setSlots.has('belt')) addMods(result, { defense: hero.level * 2 }); if (setSlots.has('boots')) addMods(result, { attackRating: 50 }); if (setSlots.has('armor')) addMods(result, { reflectDamage: 20 }); }
  if (setCount >= 3 && setSlots.has('boots')) addMods(result, { magicFind: 50 });
  if (setCount >= 6) addMods(result, { mana: 20, fireRes: 12, fireDamage: 12, reflectDamage: 12, damageReductionFlat: 7 });
  return result;
}
export function skillLevel(hero: HeroState, id: ActionId, mods = equipmentMods(hero)) {
  if (id === 'attack' || !hero.skills[id]) return 0;
  return hero.skills[id] + (mods.allSkills ?? 0) + (mods.paladinSkills ?? 0) + (mods[`${skillById[id].tree}Skills` as Modifier] ?? 0);
}
export function auraValues(hero: HeroState, mods = equipmentMods(hero)) {
  const id = hero.activeAura, rank = id ? skillLevel(hero, id, mods) : 0;
  return { id: rank ? id : null, rank, ...skillValues(id ?? 'attack', rank, hero.skills) };
}
export function stats(hero: HeroState) {
  const mods = equipmentMods(hero), active = activeEquipment(hero), aura = auraValues(hero, mods);
  const attributes = Object.fromEntries(Object.entries(BASE_ATTRIBUTES).map(([key]) => [key, hero[key as Attribute] + (mods[key as Modifier] ?? 0)])) as Record<Attribute, number>;
  const weapon = active.find(item => item === hero.equipment.weapon), shield = active.find(item => item === hero.equipment.shield);
  const holy = hero.holyShield > 0 && shield ? skillValues('holyShield', hero.holyShieldLevel || skillLevel(hero, 'holyShield', mods), hero.skills) : null;
  const maxHp = Math.max(1, (55 + (attributes.vitality - 25) * 3 + (hero.level - 1) * 2 + (mods.life ?? 0) + Math.floor((mods.lifePerLevel ?? 0) * hero.level) + hero.bonusLife) * (1 + (mods.maxLifePercent ?? 0) / 100));
  const maxMana = Math.max(1, (15 + (attributes.energy - 15) * 1.5 + (hero.level - 1) * 1.5 + (mods.mana ?? 0)) * (1 + (mods.maxManaPercent ?? 0) / 100) + Math.floor((mods.manaPerLevel ?? 0) * hero.level));
  const maxStamina = (89 + attributes.vitality - 25 + hero.level - 1 + (mods.stamina ?? 0)) * (1 + (aura.id === 'vigor' ? aura.secondary : 0) / 100);
  const weaponMods = weapon ? itemMods(weapon) : {}, weaponED = weaponMods.damage ?? 0;
  const weaponMin = Math.floor((weapon?.minDamage ?? (weapon ? weapon.power * .65 : 1)) * (1 + weaponED / 100)) + (mods.damageFlat ?? 0) + (mods.minDamage ?? 0);
  const weaponMax = Math.max(weaponMin + 1, Math.floor((weapon?.maxDamage ?? weapon?.power ?? 2) * (1 + weaponED / 100)) + (mods.damageFlat ?? 0) + (mods.maxDamage ?? 0) + Math.floor((mods.maxDamagePerLevel ?? 0) * hero.level));
  const damageBonus = attributes.strength + (mods.damage ?? 0) - weaponED + (aura.id && ['might', 'concentration', 'fanaticism'].includes(aura.id) ? aura.damage : 0);
  const attackMin = weaponMin * (1 + damageBonus / 100), attackMax = weaponMax * (1 + damageBonus / 100);
  const baseAttackRating = Math.max(1, attributes.dexterity * 5 - 15 + (mods.attackRating ?? 0) + Math.floor((mods.attackRatingPerLevel ?? 0) * hero.level)), attackRatingBonus = aura.attack + (aura.id === 'blessedAim' ? 0 : hero.skills.blessedAim * 5) + (mods.attackRatingPercent ?? 0) + Math.floor((mods.attackRatingPercentPerLevel ?? 0) * hero.level);
  const attackRating = Math.floor(baseAttackRating * (1 + attackRatingBonus / 100));
  const defense = Math.floor((attributes.dexterity / 4 + active.filter(item => item.slot !== 'weapon').reduce((total, item) => total + item.power * (1 + (itemMods(item).enhancedDefense ?? 0) / 100), 0) + (mods.defense ?? 0) + (mods.defensePerLevel ?? 0) * hero.level) * (1 + ((aura.id === 'defiance' ? aura.percent : 0) + (holy?.percent ?? 0)) / 100));
  const block = shield ? Math.min(75, Math.max(0, Math.floor(((shield.block ?? 30) + (holy?.secondary ?? 0) + (mods.block ?? 0)) * (attributes.dexterity - 15) / (hero.level * 2)))) : 0;
  const resistances = {} as Record<'fire' | 'cold' | 'lightning' | 'poison', number>, maxResistances = { fire: 75, cold: 75, lightning: 75, poison: 75 };
  const penalty = [0, 40, 100][difficulty(hero)];
  for (const element of ['fire', 'cold', 'lightning', 'poison'] as const) {
    const resistSkill = ({ fire: 'resistFire', cold: 'resistCold', lightning: 'resistLightning', poison: null } as const)[element];
    const enabled = !!resistSkill && aura.id === resistSkill;
    const maxMod = ({ fire: 'maxFireRes', cold: 'maxColdRes', lightning: 'maxLightningRes', poison: 'maxPoisonRes' } as const)[element];
    maxResistances[element] = Math.min(95, (mods[maxMod] ?? 0) + (resistSkill ? 75 + (enabled ? hero.skills[resistSkill] : Math.floor(hero.skills[resistSkill] / 2)) : 75));
    resistances[element] = Math.max(-100, Math.min(maxResistances[element], (mods.allRes ?? 0) + (mods[`${element}Res`] ?? 0) + hero.bonusResist - penalty + (enabled || (aura.id === 'salvation' && element !== 'poison') ? aura.percent : 0)));
  }
  const frozen = hero.cold > 0 && !mods.cannotBeFrozen;
  const effectiveIAS = Math.max(-50, Math.min(75, Math.floor(120 * (mods.ias ?? 0) / (120 + (mods.ias ?? 0))) + (aura.id === 'fanaticism' ? aura.percent : 0) - (weapon?.speed ?? 0) - (frozen ? 50 : 0)));
  return { ...attributes, maxHp, maxMana, maxStamina, weaponMin, weaponMax, damageBonus, attackMin, attackMax, attack: (attackMin + attackMax) / 2, baseAttackRating, attackRatingBonus, attackRating, defense, armor: defense,
    magic: skillValues('blessedHammer', skillLevel(hero, 'blessedHammer', mods), hero.skills).max, xpNeeded: xpForLevel(hero.level), block, resistances, maxResistances,
    smiteMin: (shield?.smiteMin ?? 0) + (holy?.min ?? 0) + (mods.damageFlat ?? 0), smiteMax: (shield?.smiteMax ?? 0) + (holy?.max ?? 0) + (mods.damageFlat ?? 0), hasShield: !!shield,
    castFrames: breakpointFrames(mods.fcr ?? 0, FCR, 15), recoveryFrames: breakpointFrames(mods.fhr ?? 0, FHR, 9), blockFrames: holy ? ((mods.fbr ?? 0) >= 86 ? 1 : 2) : breakpointFrames(mods.fbr ?? 0, FBR, 5),
    attackFrames: Math.max(7, Math.ceil(15 * 100 / (100 + effectiveIAS))), zealFrames: Math.max(4, Math.ceil(7 * 100 / (100 + effectiveIAS))),
    runSpeed: (1 + (mods.runWalk ?? 0) / 100 + (aura.id === 'vigor' ? aura.percent / 100 : 0)) * (frozen ? .5 : 1),
    manaRegen: maxMana / PALADIN_BALANCE.manaRecoverySeconds * (1 + ((mods.manaRegen ?? 0) + (aura.id === 'meditation' ? aura.percent : 0)) / 100), lifeRegen: (mods.replenishLife ?? 0) * 25 / 256, mods, aura,
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
  if (rank >= 20) return '已达到 20 点投入上限';
  if (hero.level < skill.level + rank) return `需要角色等级 ${skill.level + rank}`;
  const missing = skill.requires.filter(prerequisite => !hero.skills[prerequisite]);
  if (missing.length) return `需要 ${missing.map(key => skillById[key].name).join('、')}`;
  return hero.skillPoints ? '' : '没有可用技能点';
}
export function learnSkill(hero: HeroState, id: SkillId) { if (!isSkill(id) || learnReason(hero, id)) return false; hero.skillPoints--; hero.skills[id]++; return true; }
export function bindSkill(hero: HeroState, key: keyof HeroState['bindings'], id: ActionId) { if (id !== 'attack' && (!isSkill(id) || !hero.skills[id]) || !Object.hasOwn(hero.bindings, key) || key === 'attack' && isAura(id)) return false; hero.bindings[key] = id; return true; }
export function setAura(hero: HeroState, id: SkillId | null) { if (id && (!isSkill(id) || !isAura(id) || !hero.skills[id])) return false; hero.activeAura = id; clampResources(hero); return true; }
export function allocateAttribute(hero: HeroState, key: Attribute, count = 1) {
  if (!Object.hasOwn(BASE_ATTRIBUTES, key) || !Number.isSafeInteger(count) || count < 1 || hero.points < count) return false;
  hero.points -= count; hero[key] += count;
  if (key === 'vitality') { hero.hp += count * 3; hero.stamina += count; }
  if (key === 'energy') hero.mana += count * 1.5; return true;
}
export function equipReason(hero: HeroState, item: Item, target: Slot = item.slot) {
  if (item.charm) return '护身符在背包中生效'; if (item.identified === false) return '需要先鉴定'; if (item.durability === 0) return '装备已损坏';
  if (item.slot !== target && !(item.slot === 'ring' && target === 'ring2')) return '不匹配的装备栏';
  if ((item.requiredLevel ?? 1) > hero.level) return `需要等级 ${item.requiredLevel}`;
  const gear = { ...hero.equipment, [target]: null }; if (item.twoHanded) gear.shield = null; if (target === 'shield' && gear.weapon?.twoHanded) gear.weapon = null;
  const mods: Mods = {}; activeEquipment(hero, gear).forEach(gear => addMods(mods, itemMods(gear))); for (const charm of hero.inventory) if (charm.charm && charm.identified !== false && (charm.requiredLevel ?? 1) <= hero.level) addMods(mods, itemMods(charm));
  if (hero.strength + (mods.strength ?? 0) < itemRequirements(item).strength) return `需要力量 ${itemRequirements(item).strength}`;
  if (hero.dexterity + (mods.dexterity ?? 0) < itemRequirements(item).dexterity) return `需要敏捷 ${itemRequirements(item).dexterity}`; return '';
}
export function equipItem(hero: HeroState, id: string, target?: Slot): boolean {
  const item = hero.inventory.find(item => item.id === id); if (!item) return false;
  const slot = target ?? (item.slot === 'ring' && hero.equipment.ring && !hero.equipment.ring2 ? 'ring2' : item.slot);
  if (equipReason(hero, item, slot)) return false;
  const equipment = { ...hero.equipment }, inventory = hero.inventory.filter(other => other.id !== id);
  const remove = (key: Slot) => { if (equipment[key]) inventory.push(equipment[key]!); equipment[key] = null; };
  remove(slot); if (item.twoHanded) remove('shield'); if (slot === 'shield' && equipment.weapon?.twoHanded) remove('weapon');
  if (!placeItems(inventory)) return false;
  equipment[slot] = item; delete item.x; delete item.y; hero.equipment = equipment; hero.inventory = inventory; clampResources(hero); return true;
}
export function unequipItem(hero: HeroState, slot: Slot) { const item = hero.equipment[slot]; if (!item || !packItems([...hero.inventory, item])) return false; hero.inventory.push(item); placeItems(hero.inventory); hero.equipment[slot] = null; clampResources(hero); return true; }
export function swapWeapons(hero: HeroState) { [hero.equipment.weapon, hero.alternate.weapon] = [hero.alternate.weapon, hero.equipment.weapon]; [hero.equipment.shield, hero.alternate.shield] = [hero.alternate.shield, hero.equipment.shield]; hero.weaponSet = hero.weaponSet ? 0 : 1; clampResources(hero); }
export function moveStorage(hero: HeroState, id: string, toStash: boolean) {
  const from = toStash ? hero.inventory : hero.stash, to = toStash ? hero.stash : hero.inventory, item = from.find(item => item.id === id);
  const rows = toStash ? stashRows(to) : 4;
  if (!item || !packItems([...to, item], rows)) return false;
  from.splice(from.indexOf(item), 1); to.push(item); placeItems(to, rows); clampResources(hero); return true;
}
export function insertRune(hero: HeroState, id: string, rune: RuneId) { const index = hero.runes.indexOf(rune), item = [...hero.inventory, ...hero.stash].find(item => item.id === id); if (index < 0 || !item || !socketItem(item, rune)) return false; hero.runes.splice(index, 1); return true; }
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
export function repairEquipment(hero: HeroState) { const cost = repairCost(hero); if (hero.gold < cost) return false; hero.gold -= cost; for (const item of [...Object.values(hero.equipment), ...Object.values(hero.alternate), ...hero.inventory]) if (item?.maxDurability) item.durability = item.maxDurability; return true; }
export function respec(hero: HeroState) {
  const diff = difficulty(hero); if (hero.respecUsed.includes(diff) || !hero.questRewards.includes(`${diff}:shrine0`)) return false;
  hero.respecUsed.push(diff); hero.points += Object.keys(BASE_ATTRIBUTES).reduce((sum, key) => sum + hero[key as Attribute] - BASE_ATTRIBUTES[key as Attribute], 0);
  Object.assign(hero, BASE_ATTRIBUTES); hero.skillPoints += Object.values(hero.skills).reduce((sum, rank) => sum + rank, 0); hero.skills = emptySkills(); hero.activeAura = null; hero.holyShield = 0; hero.holyShieldLevel = 0;
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
export function selectCampaignLevel(hero: HeroState, index: number, diff = hero.difficultyLevel): boolean {
  if (!canEnterLevel(hero.campaign, index, diff)) return false;
  hero.difficultyLevel = diff; hero.unlockedDifficulty = unlockedCampaignDifficulty(hero.campaign);
  hero.campaign.current = index; hero.campaign.kills = 0; hero.campaign.objects = [];
  hero.stage = index + 1; hero.shrines = []; hero.bossDefeated = false;
  prepareCampaignReplay(hero);
  hero.holyShield = 0; hero.holyShieldLevel = 0; hero.poison = hero.curse = hero.cold = 0;
  if (hero.corpse) { hero.corpse.x = 0; hero.corpse.z = 11; hero.corpse.xpLost = 0; }
  const s = stats(hero); hero.hp = s.maxHp; hero.mana = s.maxMana; hero.stamina = s.maxStamina;
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
function parseItem(value: unknown): Item | null {
  if (!value || typeof value !== 'object') return null; const item = value as Record<string, any>;
  if (typeof item.id !== 'string' || item.id.length > 80 || !item.id || typeof item.name !== 'string' || item.name.length > 60 || !SLOTS.includes(item.slot) || !['common', 'magic', 'rare', 'set', 'unique', 'runeword', 'legendary'].includes(item.rarity)) return null;
  if (!['power', 'level', 'value'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0 && item[key] <= 1000000)) return null;
  const result: Item = { id: item.id, name: item.name, slot: item.slot, rarity: item.rarity, power: item.power, level: item.level, value: item.value };
  for (const key of ['base', 'setId'] as const) if (typeof item[key] === 'string' && item[key].length <= 60) result[key] = item[key];
  for (const key of ['minDamage', 'maxDamage', 'smiteMin', 'smiteMax', 'block', 'requiredLevel', 'requiredStrength', 'requiredDexterity', 'durability', 'maxDurability'] as const) if (item[key] !== undefined) result[key] = decimal(item[key], 0, 0, 10000);
  if (item.speed !== undefined) result.speed = integer(item.speed, 0, -60, 100);
  if (result.maxDurability !== undefined && result.durability !== undefined) result.durability = Math.min(result.maxDurability, result.durability);
  for (const key of ['identified', 'twoHanded', 'charm'] as const) if (typeof item[key] === 'boolean') result[key] = item[key];
  if (['small', 'large', 'grand'].includes(item.charmSize) && result.charm) result.charmSize = item.charmSize;
  if (Array.isArray(item.affixes)) result.affixes = [...new Set<string>(item.affixes.filter((id: unknown) => typeof id === 'string' && !!affixById(id)))].slice(0, 6);
  if (item.mods && typeof item.mods === 'object') { result.mods = {}; for (const key of Object.keys(MOD_NAMES) as Modifier[]) if (item.mods[key] !== undefined) result.mods[key] = decimal(item.mods[key], 0, 0, 1000); }
  if (item.sockets !== undefined) result.sockets = integer(item.sockets, 0, 0, 6);
  if (Array.isArray(item.runes)) result.runes = item.runes.filter((rune: unknown): rune is RuneId => typeof rune === 'string' && Object.hasOwn(RUNES, rune)).slice(0, result.sockets ?? 0);
  if (item.width !== undefined) result.width = integer(item.width, 1, 1, 2); if (item.height !== undefined) result.height = integer(item.height, 1, 1, 4);
  if (item.x !== undefined) result.x = integer(item.x, 0, 0, 9); if (item.y !== undefined) result.y = integer(item.y, 0, 0, 99); return result;
}
export function parseSave(raw: string | null): HeroState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw); if (![1, 2].includes(data.version) || !data.hero || typeof data.hero !== 'object' || Array.isArray(data.hero)) return null;
    const h = data.hero, hero = newHero(), legacy = h.rulesVersion !== 2; hero.level = integer(h.level, 1, 1, 99);
    if (h.rulesVersion !== undefined && h.rulesVersion !== 2) return null;
    for (const key of ['gold', 'kills', 'points', 'skillPoints'] as const) hero[key] = integer(h[key], key === 'skillPoints' ? hero.level - 1 : 0, 0, 10000000);
    hero.xp = decimal(h.xp, 0, 0, hero.level === 99 ? 0 : xpForLevel(hero.level) - 1);
    for (const key of Object.keys(BASE_ATTRIBUTES) as Attribute[]) hero[key] = integer(h[key], BASE_ATTRIBUTES[key], BASE_ATTRIBUTES[key], 10000);
    if (legacy) {
      Object.assign(hero, BASE_ATTRIBUTES); hero.points = (hero.level - 1) * 5; hero.skillPoints = hero.level - 1;
      hero.xp = Math.floor(Math.min(.999, Math.max(0, Number(h.xp) || 0) / (80 + (hero.level - 1) * 65)) * xpForLevel(hero.level));
    } else {
      for (const skill of SKILLS) hero.skills[skill.id] = integer(h.skills?.[skill.id], 0, 0, Math.min(20, Math.max(0, hero.level - skill.level + 1)));
      for (const skill of SKILLS) if (hero.skills[skill.id] && skill.requires.some(id => !hero.skills[id])) { hero.skillPoints += hero.skills[skill.id]; hero.skills[skill.id] = 0; }
      for (const key of Object.keys(hero.bindings) as (keyof HeroState['bindings'])[]) { const id = h.bindings?.[key]; if (id === 'attack' || isSkill(id) && hero.skills[id] && !(key === 'attack' && isAura(id))) hero.bindings[key] = id; }
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
    const seen = new Set<string>(); const uniqueItem = (value: unknown) => { const item = parseItem(value); if (!item || seen.has(item.id)) return null; seen.add(item.id); return item; };
    if (h.equipment && typeof h.equipment === 'object') for (const slot of SLOTS) {
      if (h.equipment[slot] === null || legacy && !Object.hasOwn(h.equipment, slot)) hero.equipment[slot] = null;
      else if (h.equipment[slot]) { const item = uniqueItem(h.equipment[slot]); if (item && (item.slot === slot || slot === 'ring2' && item.slot === 'ring')) hero.equipment[slot] = item; }
    }
    for (const slot of ['weapon', 'shield'] as const) { const item = uniqueItem(h.alternate?.[slot]); if (item?.slot === slot) hero.alternate[slot] = item; } hero.weaponSet = h.weaponSet === 1 ? 1 : 0;
    hero.inventory = Array.isArray(h.inventory) ? h.inventory.map(uniqueItem).filter((item: Item | null): item is Item => !!item).slice(0, 200) : [];
    hero.stash = Array.isArray(h.stash) ? h.stash.map(uniqueItem).filter((item: Item | null): item is Item => !!item).slice(0, 200) : [];
    if (!packItems(hero.inventory)) { const items = hero.inventory; hero.inventory = []; for (const item of items) { if (packItems([...hero.inventory, item])) hero.inventory.push(item); else hero.stash.push(item); } placeItems(hero.inventory); }
    hero.runes = Array.isArray(h.runes) ? h.runes.filter((rune: unknown): rune is RuneId => typeof rune === 'string' && Object.hasOwn(RUNES, rune)).slice(0, 1000) : []; hero.identifyScrolls = integer(h.identifyScrolls, 5, 0, 99);
    hero.questRewards = Array.isArray(h.questRewards) ? [...new Set<string>(h.questRewards.filter((key: unknown) => typeof key === 'string' && /^[0-2]:(shrine[0-2]|boss|life|attributes|resistance)$/.test(key)))] : [];
    hero.respecUsed = Array.isArray(h.respecUsed) ? [...new Set<number>(h.respecUsed.filter((value: unknown) => value === 0 || value === 1 || value === 2))] : [];
    hero.bonusLife = integer(h.bonusLife, 0, 0, 60); hero.bonusResist = integer(h.bonusResist, 0, 0, 30); hero.holyShield = decimal(h.holyShield, 0, 0, 3600); hero.poison = decimal(h.poison, 0, 0, 120); hero.curse = decimal(h.curse, 0, 0, 120); hero.cold = decimal(h.cold, 0, 0, 120); hero.running = h.running !== false;
    hero.holyShieldLevel = integer(h.holyShieldLevel, 0, 0, 100);
    if (h.corpse && typeof h.corpse === 'object') {
      const equipment = emptyEquipment(); for (const slot of SLOTS) { const item = uniqueItem(h.corpse.equipment?.[slot]); if (item && (item.slot === slot || slot === 'ring2' && item.slot === 'ring')) equipment[slot] = item; }
      const extras = Array.isArray(h.corpse.extras) ? h.corpse.extras.map(uniqueItem).filter((item: Item | null): item is Item => !!item).slice(0, 200) : [];
      hero.corpse = { equipment, extras, x: decimal(h.corpse.x, 0, -27, 27), z: decimal(h.corpse.z, 11, -27, 27), xpLost: integer(h.corpse.xpLost, 0, 0, 1000000000), gold: integer(h.corpse.gold, 0, 0, 10000000) };
    }
    const s = stats(hero); hero.hp = decimal(h.hp, s.maxHp, 1, s.maxHp); hero.mana = decimal(h.mana, s.maxMana, 0, s.maxMana); hero.stamina = decimal(h.stamina, s.maxStamina, 0, s.maxStamina); return hero;
  } catch { return null; }
}
export function serializeSave(hero: HeroState) { return JSON.stringify({ version: 2, hero }); }
export const totalExperience = (hero: HeroState) => EXPERIENCE[hero.level - 1] + hero.xp;
export const damageTypeNames: Record<DamageType, string> = { physical: '物理', magic: '魔法', fire: '火焰', cold: '冰冷', lightning: '闪电', poison: '毒素' };
