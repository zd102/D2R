import type { Item, RuneId } from './items.ts';

export type LootLabelMode = 'all' | 'focus';
export type LabeledLoot = { item?: Item; rune?: RuneId };
export const LOOT_LABEL_MODE_KEY = 'eclipse-ii-loot-labels-v1';
export const parseLootLabelMode = (value: unknown): LootLabelMode => value === 'focus' ? 'focus' : 'all';

/** Reserve crowded label space for valuable drops, using only visible item properties. */
export function lootLabelPriority(loot: LabeledLoot): number {
  const item = loot.item;
  if (item?.event) return 70;
  if (loot.rune) return 60;
  if (!item) return 0;
  if (['unique', 'runeword', 'legendary'].includes(item.rarity)) return 60;
  if (item.rarity === 'set') return 50;
  if (item.rarity === 'rare') return 40;
  if (item.charm || item.jewel || item.sockets || item.ethereal || item.baseQuality === 'superior'
    || item.staffMods?.length || item.autoMod) return 30;
  return item.rarity === 'magic' ? 20 : 10;
}

export function showLootLabel(loot: LabeledLoot, mode: LootLabelMode, reveal = false): boolean {
  return !!(loot.item || loot.rune) && (mode === 'all' || reveal || lootLabelPriority(loot) >= 30);
}
