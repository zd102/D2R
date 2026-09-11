import { playerNoDrop } from './player-count.ts';
import { CHEST_TREASURES, CHEST_MISC, CHEST_RATIOS, type ChestTreasure } from './chest-data.ts';
import { CATALOG_BASES } from './item-catalog-data.ts';
import { BASES, SPECIAL_ITEMS, RUNE_ORDER, makeItem, specialItem, weightedChoice, isAvailableItem, type Item, type RuneId, type ItemBase } from './items.ts';
import { applyAffixes } from './affixes.ts';
import { AREA_LEVELS, type Level } from './campaign.ts';

const tables = new Map(CHEST_TREASURES.map(table => [table.id, table]));
// Only life/mana potions have a use in the imported miscellaneous item table.
const unavailableCodes = new Set([
  ...CHEST_MISC.filter(item => !/^[hm]p[1-5]$/.test(item.code)).map(item => item.code),
  ...BASES.filter(base => !isAvailableItem(base)).map(base => base.baseCode!),
]);
const availableBaseCodes = new Set(BASES.filter(isAvailableItem).map(base => base.baseCode));
export type ChestContext = { players?: number; level: number; act: number; difficulty: number; magicFind?: number; goldFind?: number };
export type ChestDrop = { item?: Item; rune?: RuneId; gold?: number; potion?: 0 | 1 };
const integerRoll = (max: number, random: () => number) => Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * max);

export function chestTreasure(context: ChestContext): ChestTreasure {
  const { act, difficulty, level } = context;
  const actLevels = AREA_LEVELS[difficulty].slice(act * 5, act * 5 + 5);
  const interval = Math.max(1, Math.floor((actLevels[4] - actLevels[0] + 1) / 3));
  const tier = level < actLevels[0] + interval ? 0 : level < actLevels[0] + 2 * interval ? 1 : 2;
  return tables.get(`Act ${act + 1}${['', ' (N)', ' (H)'][difficulty]} Chest ${['A', 'B', 'C'][tier]}`)!;
}

export function rollChestCodes(context: ChestContext, random = Math.random): string[] {
  const codes: string[] = [];
  // Preserve the original bonus table rolls; rollChestLoot adds guaranteed supplies.
  if (integerRoll(100, random) < 25) return codes;
  const resolve = (code: string, depth = 0) => {
    if (depth > tables.size) throw new Error('Chest treasure recursion exceeded');
    const table = tables.get(code);
    // Removed leaves become empty picks without rerolling equipment or runes.
    if (!table) { if (!unavailableCodes.has(code)) codes.push(code); return; }
    const weight = table.entries.reduce((sum, [, weight]) => sum + weight, 0);
    const noDrop = playerNoDrop(table.noDrop, weight, context.players), total = noDrop + weight;
    for (let pick = 0; pick < table.picks; pick++) {
      let roll = integerRoll(total, random) - noDrop;
      if (roll < 0) continue;
      for (const [entry, weight] of table.entries) { roll -= weight; if (roll < 0) { resolve(entry, depth + 1); break; } }
    }
  };
  resolve(chestTreasure(context).id); return codes;
}

export function chestQualityChance(base: ItemBase, level: number, quality: 'unique' | 'set' | 'rare' | 'magic', mf: number) {
  const ratio = CHEST_RATIOS.find(row => row.classSpecific === !!base.requiredClass)![quality];
  const diminish = { unique: 250, set: 500, rare: 600, magic: Infinity }[quality];
  const effective = quality === 'magic' ? Math.max(0, mf) : Math.floor(Math.max(0, mf) * diminish / (Math.max(0, mf) + diminish));
  const chance = Math.max(ratio[2], Math.floor((ratio[0] - Math.trunc((level - (base.qualityLevel ?? base.level)) / ratio[1])) * 128 * 100 / (100 + effective)));
  return Math.min(1, 128 / Math.max(1, chance));
}

export function chestItem(base: ItemBase, level: number, mf = 0, random = Math.random): Item {
  if (!isAvailableItem(base)) throw new Error(`Unavailable chest base: ${base.name}`);
  const item = makeItem(base); item.level = level;
  for (const quality of ['unique', 'set', 'rare', 'magic'] as const) {
    if (base.charm && (quality === 'set' || quality === 'rare')) continue;
    if (random() >= chestQualityChance(base, level, quality, mf) && !(quality === 'magic' && (base.charm || base.jewel || ['rin', 'amu'].includes(base.baseCode ?? '')))) continue;
    if (quality === 'unique' || quality === 'set') {
      const candidates = SPECIAL_ITEMS.filter(entry => isAvailableItem(entry) && entry.baseCode === base.baseCode && entry.rarity === quality && !entry.eventOnly && (entry.qualityLevel ?? entry.level) <= level);
      if (candidates.length) { const special = specialItem(weightedChoice(candidates, entry => entry.dropWeight ?? 1, random).name, random); special.level = level; return special; }
      item.rarity = quality === 'unique' && !base.charm ? 'rare' : 'magic';
      if (item.maxDurability) item.durability = item.maxDurability *= quality === 'unique' ? 3 : 2;
    } else item.rarity = quality;
    return applyAffixes(item, random);
  }
  // Low/superior/ethereal quality is not represented by the current equipment model.
  item.identified = true; return item;
}

export function rollChestLoot(context: ChestContext, random = Math.random): ChestDrop[] {
  const codes = rollChestCodes(context, random);
  // Freeze base and currency draws before MF-dependent quality/affix draws.
  const selected = codes.map(code => {
    if (code === 'gld') return { gold: Math.max(1, Math.floor((context.level + integerRoll(context.level * 5, random)) * (1 + Math.max(0, context.goldFind ?? 0) / 100))) };
    if (/^r\d{2}$/.test(code)) return { rune: RUNE_ORDER[Number(code.slice(1)) - 1] };
    if (/^[hm]p[1-5]$/.test(code)) return { potion: (code[0] === 'h' ? 0 : 1) as 0 | 1 };
    const equipment = /^(weap|armo)(\d+)$/.exec(code);
    if (equipment) {
      const pool = CATALOG_BASES.filter(base => availableBaseCodes.has(base.code) && base.weapon === (equipment[1] === 'weap') && !['rin', 'amu', 'jew', 'cm1', 'cm2', 'cm3'].includes(base.code) && Math.ceil(base.level / 3) * 3 === Number(equipment[2]));
      if (!pool.length) throw new Error(`Unknown chest equipment TC: ${code}`);
      const entry = weightedChoice(pool, base => Math.max(1, base.rarity), random);
      return { base: BASES.find(base => base.baseCode === entry.code)! };
    }
    const base = BASES.find(base => base.baseCode === code);
    if (base) return { base };
    throw new Error(`Unknown chest item: ${code}`);
  });
  const supplies: ChestDrop[] = [];
  const minimumGold = Math.ceil((5 + context.level) * (1 + Math.max(0, context.goldFind ?? 0) / 100));
  const gold = selected.reduce((sum, entry) => sum + ('gold' in entry ? entry.gold! : 0), 0);
  if (gold < minimumGold) supplies.push({ gold: minimumGold - gold });
  if (!selected.some(entry => 'potion' in entry)) supplies.push({ potion: integerRoll(2, random) as 0 | 1 });
  return [...selected.map(entry => 'base' in entry ? { item: chestItem(entry.base!, context.level, context.magicFind, random) } : entry), ...supplies];
}

export function chestContext(level: Level, difficulty: number, magicFind = 0, goldFind = 0): ChestContext {
  return { level: AREA_LEVELS[difficulty][level.index], act: level.act, difficulty, magicFind, goldFind };
}
