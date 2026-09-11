import { newHero, stats, emptyEquipment, equippedAuras, type HeroState } from './model.ts';
import { addMods, itemMods, itemRequirements, weaponType, packItems, type Item, type Mods } from './items.ts';
import { levelMods } from './item-effects.ts';
import { catalogItemSetBonuses, catalogSetBonuses } from './item-catalog.ts';
import { emptySkills, isAura, isSkill, skillValues, type SkillId } from './paladin.ts';

export const MERCENARY_SLOTS = ['weapon', 'helm', 'armor'] as const;
export type MercenarySlot = typeof MERCENARY_SLOTS[number];
export const MERCENARY_AURAS = ['prayer', 'defiance', 'blessedAim', 'might', 'holyFreeze', 'thorns'] as const;
export type MercenaryAura = typeof MERCENARY_AURAS[number];
export type MercenaryState = { status: 'alive' | 'dead'; hp: number; aura: MercenaryAura; equipment: Record<MercenarySlot, Item | null>; cold: number; poison: number; potionHealing?: number };
export const MERCENARY_POTION = { healing: 160, perSecond: 30 } as const;
export function mercenaryPotionReason(hero: HeroState) {
  const merc = hero.mercenary;
  if (!merc) return '尚未雇佣米山';
  if (merc.status !== 'alive' || merc.hp <= 0) return '米山已阵亡，需要重新雇佣';
  if (merc.hp >= mercenaryStats(hero).maxHp) return '米山生命值已满';
  return hero.potions[0] > 0 ? '' : '生命药剂已用尽';
}
export function feedMercenaryPotion(hero: HeroState) {
  if (mercenaryPotionReason(hero)) return false;
  hero.potions[0]--; hero.mercenary!.potionHealing = (hero.mercenary!.potionHealing ?? 0) + MERCENARY_POTION.healing; return true;
}
export function updateMercenaryPotion(hero: HeroState, dt: number, maxHp = mercenaryStats(hero).maxHp) {
  const merc = hero.mercenary;
  if (!merc || merc.status !== 'alive' || merc.hp <= 0 || !Number.isFinite(dt) || dt <= 0) return;
  const restored = Math.min(merc.potionHealing ?? 0, MERCENARY_POTION.perSecond * dt);
  merc.potionHealing = Math.max(0, (merc.potionHealing ?? 0) - restored); merc.hp = Math.min(maxHp, merc.hp + restored);
}
export const mercenaryUnlocked = (hero: HeroState) => hero.campaign.cleared.some(count => count >= 5);
export const mercenaryCost = (hero: HeroState) => Math.min(50000, 300 + hero.level * 80 + hero.level * hero.level * 5);
export const mercenaryBase = (level: number) => ({ strength: 40 + level * 2, dexterity: 25 + Math.floor(level * 1.5), life: 100 + level * 18, resistance: Math.min(70, 10 + level) });
export const mercenaryAuraRank = (level: number) => Math.min(20, 1 + Math.floor((level - 1) / 4));
export const isMercenaryAura = (value: unknown): value is MercenaryAura => MERCENARY_AURAS.includes(value as MercenaryAura);
export function mercenaryItemAllowed(item: Item, slot: string = item.slot) {
  return MERCENARY_SLOTS.includes(slot as MercenarySlot) && item.slot === slot && !item.requiredClass && !item.misc && !item.charm && !item.jewel
    && (slot !== 'weapon' || ['polearm', 'spear', 'javelin'].includes(weaponType(item) ?? ''));
}
export function activeMercenaryEquipment(hero: HeroState, gear = hero.mercenary?.equipment): Item[] {
  if (!gear) return [];
  const accepted: Item[] = [], base = mercenaryBase(hero.level);
  let strength = base.strength, dexterity = base.dexterity;
  for (let pass = 0; pass < 3; pass++) for (const slot of MERCENARY_SLOTS) {
    const item = gear[slot];
    if (!item || accepted.includes(item) || !mercenaryItemAllowed(item, slot) || item.identified === false || item.durability === 0 || (item.requiredLevel ?? 1) > hero.level) continue;
    const req = itemRequirements(item);
    if (req.strength > strength || req.dexterity > dexterity) continue;
    accepted.push(item); const mods = levelMods(itemMods(item), hero.level); strength += mods.strength ?? 0; dexterity += mods.dexterity ?? 0;
  }
  return accepted;
}
export function mercenaryMods(hero: HeroState): Mods {
  const active = activeMercenaryEquipment(hero), mods: Mods = {};
  for (const item of active) addMods(mods, addMods(itemMods(item), catalogItemSetBonuses(item, active)));
  addMods(mods, catalogSetBonuses(active)); return levelMods(mods, hero.level);
}
// Distance is runtime state, deliberately excluded from saves and character exports.
const distances = new WeakMap<HeroState, number>();
export function setMercenaryDistance(hero: HeroState, distance: number) { distances.set(hero, distance); }
export function mercenaryAuras(hero: HeroState, includeInactive = false) {
  const merc = hero.mercenary;
  if (!merc || !includeInactive && (merc.status !== 'alive' || merc.hp <= 0)) return [];
  const mods = mercenaryMods(hero), ranks = new Map<SkillId, number>([[merc.aura, mercenaryAuraRank(hero.level) + (mods.allSkills ?? 0)]]);
  for (const [key, rank] of Object.entries(mods)) if (key.startsWith('aura_') && isSkill(key.slice(5)) && isAura(key.slice(5) as SkillId)) {
    const id = key.slice(5) as SkillId; ranks.set(id, Math.max(rank, ranks.get(id) ?? 0));
  }
  return [...ranks].map(([id, rank]) => ({ id, rank, ...skillValues(id, rank, emptySkills()), mercenary: true }));
}
export const isPartyAura = (id: SkillId) => !['holyFire', 'holyFreeze', 'holyShock', 'sanctuary', 'conviction', 'redemption'].includes(id);
export function mercenaryPartyAuras(hero: HeroState) { return mercenaryAuras(hero).filter(aura => isPartyAura(aura.id) && (distances.get(hero) ?? 0) <= aura.radius); }
export function mercenaryStats(hero: HeroState) {
  const proxy = newHero(), base = mercenaryBase(hero.level), merc = hero.mercenary;
  proxy.level = hero.level; proxy.difficultyLevel = hero.difficultyLevel; proxy.strength = base.strength; proxy.dexterity = base.dexterity;
  proxy.bonusLife = base.life - (55 + (hero.level - 1) * 2); proxy.bonusResist = base.resistance;
  proxy.equipment = emptyEquipment();
  for (const item of activeMercenaryEquipment(hero)) proxy.equipment[item.slot] = item;
  if (merc) { proxy.skills[merc.aura] = mercenaryAuraRank(hero.level); proxy.activeAura = merc.aura; proxy.cold = merc.cold; }
  const auras = mercenaryAuras(hero, true).map(aura => ({ ...aura, mercenary: false }));
  for (const aura of equippedAuras({ ...hero, mercenary: null }).filter(aura => isPartyAura(aura.id) && (distances.get(hero) ?? 0) <= aura.radius)) {
    const index = auras.findIndex(other => other.id === aura.id);
    if (index < 0) auras.push(aura); else if (auras[index].rank < aura.rank) auras[index] = aura;
  }
  const result = stats(proxy, auras);
  // D2 hirelings gain life directly; item vitality and mana are not useful to them.
  result.maxHp -= (result.vitality - proxy.vitality) * 3;
  result.defense += Math.floor((20 + hero.level * 6) * (1 + (auras.find(aura => aura.id === 'defiance')?.percent ?? 0) / 100)); result.armor = result.defense;
  // Desert guards jab in melee, including when holding a javelin. Base damage is
  // added after weapon scaling, following D2's hireling damage formula.
  result.ranged = undefined;
  const bonus = result.strength + (result.mods.damage ?? 0) - (result.weapon ? itemMods(result.weapon).damage ?? 0 : 0) + result.auras.reduce((sum, aura) => sum + (['might', 'concentration', 'fanaticism'].includes(aura.id) ? aura.damage : 0), 0);
  result.damageBonus = bonus;
  result.attackMin = result.weaponMin * (1 + bonus / 100) + 3 + hero.level * 1.1;
  result.attackMax = result.weaponMax * (1 + bonus / 100) + 6 + hero.level * 1.7;
  result.attack = (result.attackMin + result.attackMax) / 2;
  result.baseAttackRating += hero.level * 12; result.attackRating = Math.floor(result.baseAttackRating * (1 + result.attackRatingBonus / 100));
  return result;
}
export function hireMercenary(hero: HeroState, inReach: boolean) {
  if (!inReach || !mercenaryUnlocked(hero) || hero.mercenary?.status === 'alive' || hero.gold < mercenaryCost(hero)) return false;
  hero.gold -= mercenaryCost(hero);
  hero.mercenary = { status: 'alive', hp: 1, aura: hero.mercenary?.aura ?? 'prayer', equipment: hero.mercenary?.equipment ?? { weapon: null, helm: null, armor: null }, cold: 0, poison: 0 };
  hero.mercenary.hp = mercenaryStats(hero).maxHp; setMercenaryDistance(hero, 0); return true;
}
export function selectMercenaryAura(hero: HeroState, aura: unknown) {
  if (!hero.mercenary || !isMercenaryAura(aura)) return false;
  hero.mercenary.aura = aura; return true;
}
export function mercenaryEquipReason(hero: HeroState, item: Item) {
  if (!hero.mercenary) return '请先雇佣米山';
  if (!mercenaryItemAllowed(item)) return '仅可使用非职业专属的长柄武器、长矛、标枪、头盔和铠甲';
  if (item.identified === false) return '需要先鉴定';
  if (item.durability === 0) return '装备已损坏';
  if ((item.requiredLevel ?? 1) > hero.level) return `需要等级 ${item.requiredLevel}`;
  const gear = { ...hero.mercenary.equipment, [item.slot]: null }, base = mercenaryBase(hero.level), mods: Mods = {};
  for (const other of activeMercenaryEquipment(hero, gear)) addMods(mods, levelMods(itemMods(other), hero.level));
  const req = itemRequirements(item);
  if (req.strength > base.strength + (mods.strength ?? 0)) return `需要力量 ${req.strength}`;
  if (req.dexterity > base.dexterity + (mods.dexterity ?? 0)) return `需要敏捷 ${req.dexterity}`;
  return '';
}
export function equipMercenary(hero: HeroState, id: string) {
  const merc = hero.mercenary, item = hero.inventory.find(item => item.id === id);
  if (!merc || !item || mercenaryEquipReason(hero, item)) return false;
  const slot = item.slot as MercenarySlot, replaced = merc.equipment[slot];
  const remaining = hero.inventory.filter(other => other !== item), layout = remaining.map(other => ({ ...other }));
  if (replaced) { remaining.push(replaced); const copy = { ...replaced }; delete copy.x; delete copy.y; layout.push(copy); }
  const positions = packItems(layout); if (!positions) return false;
  for (const other of remaining) Object.assign(other, positions.get(other.id));
  delete item.x; delete item.y; merc.equipment[slot] = item; hero.inventory = remaining;
  merc.hp = Math.min(merc.hp, mercenaryStats(hero).maxHp); return true;
}
export function unequipMercenary(hero: HeroState, slot: string) {
  if (!MERCENARY_SLOTS.includes(slot as MercenarySlot)) return false;
  const merc = hero.mercenary, item = merc?.equipment[slot as MercenarySlot]; if (!merc || !item) return false;
  const copy = { ...item }; delete copy.x; delete copy.y;
  const positions = packItems([...hero.inventory.map(other => ({ ...other })), copy]); if (!positions) return false;
  hero.inventory.push(item); for (const other of hero.inventory) Object.assign(other, positions.get(other.id));
  merc.equipment[slot as MercenarySlot] = null; merc.hp = Math.min(merc.hp, mercenaryStats(hero).maxHp); return true;
}
export function parseMercenary(hero: HeroState, value: unknown, parseItem: (value: unknown) => Item | null) {
  if (!value || typeof value !== 'object') return;
  const data = value as Partial<MercenaryState>;
  if (data.status !== 'alive' && data.status !== 'dead') return;
  const merc: MercenaryState = { status: data.status, hp: 0, aura: isMercenaryAura(data.aura) ? data.aura : 'prayer', equipment: { weapon: null, helm: null, armor: null }, cold: 0, poison: 0 };
  for (const slot of MERCENARY_SLOTS) { const item = parseItem(data.equipment?.[slot]); if (item && mercenaryItemAllowed(item, slot)) merc.equipment[slot] = item; }
  hero.mercenary = merc;
  merc.hp = Math.max(0, Math.min(mercenaryStats(hero).maxHp, typeof data.hp === 'number' && Number.isFinite(data.hp) ? data.hp : 0));
  if (merc.status === 'dead' || !merc.hp) { merc.status = 'dead'; merc.hp = 0; }
  merc.potionHealing = merc.status === 'alive' && typeof data.potionHealing === 'number' && Number.isFinite(data.potionHealing) ? Math.max(0, Math.min(1000000, data.potionHealing)) : 0;
  for (const key of ['cold', 'poison'] as const) merc[key] = typeof data[key] === 'number' && Number.isFinite(data[key]) ? Math.max(0, Math.min(120, data[key]!)) : 0;
}
