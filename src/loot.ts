import { playerDropChance } from './player-count.ts';
import { BASES, RUNE_ORDER, isAvailableItem, makeItem, rollDropKinds, rollItem, specialItem, itemId, weightedChoice, type DropRank, type Item, type RuneId } from './items.ts';
import { applyAffixes, CHARM_BASES, type CharmSize } from './affixes.ts';
import { RUNE_TREASURES } from './item-catalog-data.ts';
import { bossDropProfile, rollBossSpecial } from './boss-loot.ts';

export type LootContext = { players?: number; level: number; act: number; difficulty: number; rank: DropRank; levelIndex?: number; firstClear?: boolean; countess?: boolean; magicFind?: number; goldFind?: number; cow?: boolean; uberDiablo?: boolean };
const RUNE_MIN_LEVEL = [1, 1, 3, 4, 6, 8, 10, 12, 14, 17, 20, 24, 27, 30, 32, 34, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 80, 81];
const runeDistributions = new Map<number, { rune: RuneId; weight: number }[]>();
export function runeDistribution(tier: number): { rune: RuneId; weight: number }[] {
  tier = Math.max(1, Math.min(17, Math.floor(tier)));
  const cached = runeDistributions.get(tier); if (cached) return cached;
  const table = RUNE_TREASURES.find(table => table.id === `Runes ${tier}`)!;
  const total = table.entries.reduce((sum, [, weight]) => sum + weight, 0), entries: { rune: RuneId; weight: number }[] = [];
  for (const [id, weight] of table.entries) {
    if (id.startsWith('Runes ')) entries.push(...runeDistribution(Number(id.slice(6))).map(entry => ({ rune: entry.rune, weight: entry.weight * weight / total })));
    else entries.push({ rune: RUNE_ORDER[Number(id.slice(1)) - 1], weight: weight / total });
  }
  entries.sort((a, b) => RUNE_ORDER.indexOf(a.rune) - RUNE_ORDER.indexOf(b.rune));
  runeDistributions.set(tier, entries); return entries;
}
export function rollRuneTreasure(tier: number, random = Math.random) { return weightedChoice(runeDistribution(tier), entry => entry.weight, random).rune; }
export function runePool(level: number, diff: number, act: number) {
  const cap = [[7, 10, 12, 14, 16], [18, 20, 22, 24, 26], [28, 30, 31, 32, 33]][Math.max(0, Math.min(2, diff))][Math.max(0, Math.min(4, act))];
  return RUNE_ORDER.filter((_, i) => i < cap && RUNE_MIN_LEVEL[i] <= level + 5);
}
export function rollRune(level: number, diff: number, act: number, boss = false, random = Math.random): RuneId {
  const pool = runePool(level, diff, act), weights = runeDistribution(Math.ceil(pool.length / 2));
  return weightedChoice(pool, id => weights.find(entry => entry.rune === id)?.weight ?? 0, random);
}
export function rollCharm(level: number, random = Math.random): Item {
  const roll = random(), size: CharmSize = roll < .25 ? 'grand' : roll < .5 ? 'large' : 'small', base = CHARM_BASES[size];
  level = Math.max(1, Math.min(99, Math.floor(level)));
  return applyAffixes({ id: itemId(), name: base.name, base: base.name, slot: 'amulet', rarity: 'magic', power: 0, level, value: 80 + level * 8, mods: {}, identified: false, width: 1, height: base.height, charm: true, charmSize: size }, random);
}
export function rollSocketBase(level: number, random = Math.random): Item {
  level = Math.max(1, Math.min(99, Math.floor(level)));
  const bases = BASES.filter(base => isAvailableItem(base) && !base.charm && !base.jewel && !!base.sockets && (base.qualityLevel ?? base.level) <= level + 3);
  const base = weightedChoice(bases, entry => 1 + (entry.qualityLevel ?? entry.level) / Math.max(1, level), random);
  const item = makeItem(base); item.level = level; item.identified = true;
  const cap = Math.min(base.sockets!, level < 12 ? 2 : level < 26 ? 3 : level < 41 ? 4 : 6);
  item.sockets = Math.max(1, 1 + Math.floor(random() * cap));
  return item;
}
export function rollLoot(context: LootContext, random = Math.random) {
  const { rank } = context, difficulty = Math.max(0, Math.min(2, Math.floor(context.difficulty))), act = Math.max(0, Math.min(4, Math.floor(context.act)));
  const level = Math.max(1, Math.min(99, Math.floor(context.level))), flags = rollDropKinds(rank, random, context.players), items: Item[] = [], runes: RuneId[] = [];
  const boss = rank === 'miniboss' || rank === 'actBoss', elite = rank === 'elite';
  const profile = boss ? bossDropProfile(context.levelIndex) : undefined, countess = boss && (context.countess || context.levelIndex === 3);
  // Resolve rune and currency rolls before quality-dependent draws: MF cannot change them.
  if (flags.rune || rank === 'actBoss' && context.firstClear) runes.push(rollRune(level, difficulty, act, boss, random));
  if (countess) {
    const table = RUNE_TREASURES.find(table => table.id === `Countess Rune${['', ' (N)', ' (H)'][difficulty]}`)!;
    const weight = table.entries[0][1], tier = Number(table.entries[0][0].slice(6));
    for (let i = 0; i < table.picks; i++) if (random() < weight / (weight + table.noDrop)) runes.push(rollRuneTreasure(tier, random));
  } else if (profile && random() < profile.runeChance) {
    // The boss's treasure tier is also bounded by encounter progression.
    const pool = new Set(runePool(level, difficulty, act));
    runes.push(weightedChoice(runeDistribution(profile.runeTC[difficulty]).filter(entry => pool.has(entry.rune)), entry => entry.weight, random).rune);
  }
  if (profile?.levelIndex === 17 && context.firstClear) {
    const start = [0, 11, 14][difficulty];
    runes.push(RUNE_ORDER[start + Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, random())) * 11)]);
  }
  const gold = Math.round((10 + level * 2 + random() * 14) * (boss ? 4 : elite ? 2 : 1) * (1 + (context.goldFind ?? 0) / 100));
  const potion = random() < playerDropChance(boss ? .8 : elite ? .6 : .30, rank === 'elite' || rank === 'miniboss' ? 1 : context.players) ? random() > .4 ? 0 : 1 : undefined;
  const treasureClass = profile?.maxTC[difficulty] ?? Math.min(87, Math.ceil((level + 3) / 3) * 3);
  if (flags.equipment) {
    const roll = random(), quality = rank === 'actBoss' ? .72 + roll * .28 : rank === 'miniboss' || elite ? .33 + roll * .67 : roll;
    items.push(rollItem(level, quality, rank === 'actBoss' && !!context.firstClear, context.magicFind ?? 0, random, treasureClass));
  }
  if (rank === 'actBoss') items.push(rollItem(level, .72 + random() * .28, false, context.magicFind ?? 0, random, treasureClass));
  if (flags.charm) items.push(rollCharm(level, random));
  if (profile) { const special = rollBossSpecial(profile, level, difficulty, context.magicFind ?? 0, random); if (special) items.push(special); }
  if (context.cow) {
    items.push(rollSocketBase(level, random));
    runes.push(rollRune(level, difficulty, act, false, random));
    if (random() < .42) runes.push(rollRune(level, difficulty, act, false, random));
  }
  if (context.uberDiablo) { const item = specialItem('unique-382', random); item.level = level; items.push(item); }
  return { items, runes, gold, potion };
}
export function runeUpgradeCost(id: RuneId) { const index = RUNE_ORDER.indexOf(id); return index < 0 || index === RUNE_ORDER.length - 1 ? null : { next: RUNE_ORDER[index + 1], count: index >= 20 ? 2 : 3 }; }
export function upgradeRune(runes: RuneId[], id: RuneId) {
  const recipe = runeUpgradeCost(id); if (!recipe || runes.filter(r => r === id).length < recipe.count) return false;
  for (let i = 0; i < recipe.count; i++) runes.splice(runes.indexOf(id), 1);
  runes.push(recipe.next); return true;
}
