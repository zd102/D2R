import { BASE_PROPERTY_BASES, BASE_AUTO_MODS, BASE_SUPERIOR_MODS, BASE_QUALITY_RATIOS, BASE_STAFF_SKILLS, BASE_PROPERTY_TYPES } from './base-property-data.ts';
import { affixBase, affixLevel, affixSocketCap } from './affixes.ts';
import { catalogMods } from './item-catalog.ts';
import { catalogSkill } from './item-effects.ts';
import { addMods, itemMods, type Item, type ItemBase } from './items.ts';
import { CATALOG_BASES, CATALOG_SPECIALS } from './item-catalog-current.ts';

const draw = (random: () => number, size: number) => Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * size);
export function baseHasType(type: string, expected: string): boolean {
  return type === expected || (BASE_PROPERTY_TYPES[type]?.parents ?? []).some(parent => baseHasType(parent, expected));
}
export function baseQualityChance(base: ItemBase, level: number, quality: 'HiQuality' | 'Normal' | 'Unique' | 'Set' | 'Rare' | 'Magic', mf = 0) {
  const data = BASE_PROPERTY_BASES[base.baseCode ?? ''];
  const row = BASE_QUALITY_RATIOS.find(row => !!row.Uber === !!data?.uber && !!row['Class Specific'] === !!base.requiredClass)!;
  const divisor = row[`${quality}Divisor`];
  let denominator = (row[quality] - Math.trunc((level - (base.qualityLevel ?? base.level)) / divisor)) * 128;
  if (quality !== 'HiQuality' && quality !== 'Normal') {
    const factor = { Unique: 250, Set: 500, Rare: 600, Magic: Infinity }[quality];
    const effective = quality === 'Magic' ? Math.max(0, mf) : Math.floor(Math.max(0, mf) * factor / (Math.max(0, mf) + factor));
    denominator = Math.max(row[`${quality}Min`], Math.floor(denominator * 100 / (100 + effective)));
  }
  return denominator <= 128 ? 1 : 128 / denominator;
}

export function rollBaseQuality(item: Item, base: ItemBase, random = Math.random, allowLow = true) {
  if (item.rarity !== 'common' || !BASE_PROPERTY_BASES[item.baseCode ?? ''] || item.event) return;
  if (random() < baseQualityChance(base, item.level, 'HiQuality')) item.baseQuality = 'superior';
  else if (allowLow && random() >= baseQualityChance(base, item.level, 'Normal')) item.baseQuality = 'low';
}

export function rollBaseProperties(item: Item, random = Math.random, options: { ethereal?: boolean; sockets?: boolean; difficulty?: number } = {}): Item {
  if (item.basePropertiesVersion) return item;
  const data = BASE_PROPERTY_BASES[item.baseCode ?? ''], raw = CATALOG_BASES.find(base => base.code === item.baseCode);
  if (!data || !raw || data.quest || item.event) return item;
  item.basePropertiesVersion = 1;
  item.mods ??= {};
  const previousMods = { ...item.mods };
  const common = item.rarity === 'common', special = item.rarity === 'set' || item.rarity === 'unique';
  if (!common) delete item.baseQuality;
  // Defense is rolled once, before local ED and ethereality are applied.
  if (!raw.weapon) item.power = raw.defenseMin + draw(random, raw.defenseMax - raw.defenseMin + 1);
  let durabilityPercent = 0;
  if (common && item.baseQuality === 'superior') {
    const groups = BASE_SUPERIOR_MODS.filter((row, index) => (raw.weapon ? row.weapon : row.armor) && (!(data.noDurability || data.throwable) || index < 4));
    const group = groups[draw(random, groups.length)];
    for (const property of group.properties) {
      const [code, , min, max] = property, value = min + draw(random, max - min + 1);
      if (code === 'dur%') { durabilityPercent = value; item.mods.maxDurabilityPercent = value; }
      else if (code === 'dmg%' && Math.floor((item.maxDamage ?? 0) * value / 100) < 1) addMods(item.mods, { maxDamage: 1 });
      else addMods(item.mods, catalogMods([[code, '', value, value]]));
    }
    item.name = `超强的${item.base ?? item.name}`;
  }
  if (common && item.baseQuality === 'low') {
    item.name = `${['劣质的', '破裂的', '损坏的', '粗糙的'][draw(random, 4)]}${item.base ?? item.name}`;
    if (raw.weapon) {
      item.minDamage = Math.max(1, Math.floor((item.minDamage ?? 0) * .75));
      item.maxDamage = Math.max(1, Math.floor((item.maxDamage ?? 0) * .75));
    } else item.power = Math.floor(item.power * .75);
    if (item.maxDurability) item.durability = item.maxDurability = Math.max(1, Math.floor((item.maxDurability - 1) / 3));
  }
  if (!special) {
    const base = affixBase(item), alvl = affixLevel(item.level, base.level, base.magicLevel);
    const autos = BASE_AUTO_MODS.filter(row => row.group === data.auto && row.level <= alvl && (!row.maxLevel || row.maxLevel >= alvl) && (item.rarity !== 'rare' || row.rare));
    const weight = (row: typeof autos[number]) => row.frequency * (base.magicLevel ? row.level : 1);
    if (autos.length) {
      let roll = draw(random, autos.reduce((sum, row) => sum + weight(row), 0));
      const auto = autos.find(row => (roll -= weight(row)) < 0)!;
      item.autoMod = auto.id; addMods(item.mods, catalogMods(auto.properties, random));
      if (!common) item.requiredLevel = Math.max(item.requiredLevel ?? 1, auto.requiredLevel);
    }
    rollStaffMods(item, data.type, data.staff, random);
  }
  if (!raw.weapon && item.mods.enhancedDefense) item.power = raw.defenseMax + 1;
  const forcedEthereal = CATALOG_SPECIALS.find(row => row.id === item.catalogId)?.properties.some(([code]) => code === 'ethereal');
  const eligible = item.baseQuality !== 'low' && item.rarity !== 'set' && !data.noDurability && !!item.maxDurability && !itemMods(item).indestructible;
  if (options.ethereal !== false && (forcedEthereal || eligible && draw(random, 100) < 5)) {
    item.ethereal = true;
    if (raw.weapon) {
      item.minDamage = Math.floor((item.minDamage ?? 0) * 1.5);
      item.maxDamage = Math.floor((item.maxDamage ?? 0) * 1.5);
    } else item.power = Math.floor(item.power * 1.5);
    item.requiredStrength = Math.max(0, (item.requiredStrength ?? 0) - 10);
    item.requiredDexterity = Math.max(0, (item.requiredDexterity ?? 0) - 10);
    const extra = item.mods.extraDurability ?? 0;
    item.maxDurability = Math.min(333, Math.floor(Math.floor(((item.maxDurability ?? raw.durability) - extra) / 2) * (100 + durabilityPercent) / 100) + 1 + extra);
    item.durability = item.maxDurability;
  } else if (durabilityPercent && item.maxDurability) item.durability = item.maxDurability = Math.min(333, Math.floor(item.maxDurability * (100 + durabilityPercent) / 100));
  if (options.sockets && common && item.baseQuality !== 'low' && !data.throwable) {
    const cap = Math.min(affixSocketCap(item), [3, 4, 6][Math.max(0, Math.min(2, options.difficulty ?? 2))]);
    if (cap && draw(random, 100) < 33) item.sockets = 1 + draw(random, cap);
  }
  item.baseMods = Object.fromEntries(Object.entries(item.mods).map(([key, value]) => [key, value! - (previousMods[key as keyof typeof previousMods] ?? 0)]).filter(([, value]) => value !== 0));
  return item;
}

function rollStaffMods(item: Item, type: string, staffClass: string, random: () => number) {
  // This project has not opened the D2R 3.0 Warlock class.
  if (!staffClass || staffClass === 'war') return;
  const skills = BASE_STAFF_SKILLS.filter(skill => skill.class === staffClass).sort((a, b) => a.id - b.id);
  if (!skills.length) return;
  const countRoll = draw(random, 100), count = countRoll > 90 ? 3 : countRoll > 70 ? 2 : countRoll > 30 ? 1 : 0;
  const baseTier = item.level > 36 ? 5 : item.level > 24 ? 4 : item.level > 18 ? 3 : item.level > 11 ? 2 : 1;
  const selected = new Set<number>();
  for (let n = 0; n < count; n++) {
    const tierRoll = draw(random, 100);
    let tier = Math.max(1, baseTier + (tierRoll > 80 ? 1 : tierRoll > 30 ? 0 : tierRoll > 10 ? -1 : -2));
    if (item.baseQuality === 'low') tier = Math.min(tier, 4);
    // D2R rejects forbidden staffmods instead of leaking the sixth failed attempt.
    let chosen: typeof skills[number] | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      const skill = skills[(tier - 1) * 5 + draw(random, 5)];
      if (skill && !selected.has(skill.id) && (!skill.itemType || baseHasType(type, skill.itemType))) { chosen = skill; break; }
    }
    if (!chosen) continue;
    selected.add(chosen.id);
    const valueRoll = item.baseQuality === 'low' ? 0 : draw(random, 100), value = valueRoll >= 90 ? 3 : valueRoll >= 60 ? 2 : 1;
    (item.staffMods ??= []).push({ skill: chosen.id, level: value });
    const id = catalogSkill(String(chosen.id));
    if (id) addMods(item.mods!, { [`skill_${id}`]: value });
    item.requiredLevel = Math.max(item.requiredLevel ?? 1, chosen.level);
  }
}
