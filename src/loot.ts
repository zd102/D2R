import { RUNE_ORDER, rollDropKinds, rollItem, itemId, weightedChoice, type DropRank, type Item, type RuneId } from './items.ts';
import { applyAffixes, CHARM_BASES, type CharmSize } from './affixes.ts';

export type LootContext = { level: number; act: number; difficulty: number; rank: DropRank; firstClear?: boolean; countess?: boolean; magicFind?: number; goldFind?: number };
const RUNE_MIN_LEVEL = [1, 1, 3, 4, 6, 8, 10, 12, 14, 17, 20, 24, 27, 30, 32, 34, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 80, 81];
const RUNE_WEIGHTS = [100, 90, 100, 85, 85, 80, 90, 80, 75, 65, 55, 48, 42, 35, 30, 26, 22, 18, 15, 12, 9, 7, 5, 4, 3, 2.4, 1.8, 1.4, 1, .8, .6, .4, .25];
export function runePool(level: number, diff: number, act: number) {
  const cap = [[7, 10, 12, 14, 16], [18, 20, 22, 24, 26], [28, 30, 31, 32, 33]][Math.max(0, Math.min(2, diff))][Math.max(0, Math.min(4, act))];
  return RUNE_ORDER.filter((_, i) => i < cap && RUNE_MIN_LEVEL[i] <= level + 5);
}
export function rollRune(level: number, diff: number, act: number, boss = false, random = Math.random): RuneId {
  return weightedChoice(runePool(level, diff, act), id => {
    const index = RUNE_ORDER.indexOf(id);
    // Higher difficulties reduce low-rune dominance; high runes remain rare.
    return RUNE_WEIGHTS[index] * (index < 10 ? [1, .5, .2][diff] : boss && index >= 16 ? 1.8 : 1);
  }, random);
}
export function rollCharm(level: number, random = Math.random): Item {
  const roll = random(), size: CharmSize = roll < .25 ? 'grand' : roll < .5 ? 'large' : 'small', base = CHARM_BASES[size];
  level = Math.max(1, Math.min(99, Math.floor(level)));
  return applyAffixes({ id: itemId(), name: base.name, base: base.name, slot: 'amulet', rarity: 'magic', power: 0, level, value: 80 + level * 8, mods: {}, identified: false, width: 1, height: base.height, charm: true, charmSize: size }, random);
}
export function rollLoot(context: LootContext, random = Math.random) {
  const { level, rank, difficulty, act } = context, flags = rollDropKinds(rank, random), items: Item[] = [], runes: RuneId[] = [];
  const boss = rank !== 'monster';
  if (flags.equipment) {
    const roll = random(), quality = rank === 'actBoss' ? .72 + roll * .28 : rank === 'miniboss' ? .33 + roll * .67 : roll;
    items.push(rollItem(level, quality, rank === 'actBoss' && !!context.firstClear, context.magicFind ?? 0, random));
  }
  if (rank === 'actBoss') items.push(rollItem(level, .72 + random() * .28, false, context.magicFind ?? 0, random));
  if (flags.charm) items.push(rollCharm(level, random));
  const runeCount = context.countess && boss ? 2 + Number(random() < .35) : Number(flags.rune || rank === 'actBoss' && !!context.firstClear);
  for (let i = 0; i < runeCount; i++) runes.push(rollRune(level, difficulty, act, boss, random));
  return { items, runes, gold: Math.round((10 + level * 2 + random() * 14) * (boss ? 4 : 1) * (1 + (context.goldFind ?? 0) / 100)), potion: random() < (boss ? .8 : .30) ? random() > .4 ? 0 : 1 : undefined };
}
export function runeUpgradeCost(id: RuneId) { const index = RUNE_ORDER.indexOf(id); return index < 0 || index === RUNE_ORDER.length - 1 ? null : { next: RUNE_ORDER[index + 1], count: index >= 20 ? 2 : 3 }; }
export function upgradeRune(runes: RuneId[], id: RuneId) {
  const recipe = runeUpgradeCost(id); if (!recipe || runes.filter(r => r === id).length < recipe.count) return false;
  for (let i = 0; i < recipe.count; i++) runes.splice(runes.indexOf(id), 1);
  runes.push(recipe.next); return true;
}
