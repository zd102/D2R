import { CATALOG_SPECIALS, CATALOG_RUNEWORDS } from './item-catalog-current.ts';
import { catalogSkill } from './item-effects.ts';
import { affixById } from './affixes.ts';
import type { Item } from './items.ts';
import { skillById, type SkillId } from './paladin.ts';

const catalogEntries = new Map([...CATALOG_SPECIALS, ...CATALOG_RUNEWORDS].map(entry => [entry.id, entry]));

// Charges of different levels are separate skills; neither their level nor
// their pool is increased by +skills. Usage belongs to the physical item.
export function itemCharges(item: Item) {
  if (!item.catalogId && !item.affixes?.length) return [];
  const entry = item.catalogId ? catalogEntries.get(item.catalogId) : undefined;
  const properties = [...(entry?.properties ?? []), ...(item.affixes ?? []).flatMap(id => (affixById(id)?.properties ?? []).map(([code, param, min, max]) => [code, String(param), min, max] as const))];
  return properties.flatMap(([code, param, maximum, rank], index) => {
    const id = code === 'charged' ? catalogSkill(param) : undefined;
    if (!id) return [];
    if (rank < 0) rank = Math.max(1, Math.floor((Math.min(99,item.level) - skillById[id].level) / Math.max(1,Math.floor((99-skillById[id].level)/-rank))));
    if (maximum < 0) maximum = Math.floor(-maximum * (1 + rank / 8));
    if (maximum <= 0 || rank <= 0) return [];
    const key = `${index}:${id}:${rank}`;
    const used = Math.max(0, Math.min(maximum, Math.floor(item.chargesUsed?.[key] ?? 0)));
    return [{ id, rank, maximum, remaining: maximum - used, key, item }];
  });
}

export type ChargeBinding = { id: SkillId; rank: number };
export function chargeGroups(items: Item[]) {
  const groups = new Map<string, ChargeBinding & { remaining: number; maximum: number }>();
  for (const charge of items.flatMap(itemCharges)) {
    const key = `${charge.id}:${charge.rank}`, group = groups.get(key) ?? { id: charge.id, rank: charge.rank, remaining: 0, maximum: 0 };
    group.remaining += charge.remaining; group.maximum += charge.maximum; groups.set(key, group);
  }
  return [...groups.values()];
}

export function consumeCharge(items: Item[], binding: ChargeBinding) {
  const charge = items.flatMap(itemCharges).find(charge => charge.id === binding.id && charge.rank === binding.rank && charge.remaining > 0);
  if (!charge) return false;
  (charge.item.chargesUsed ??= {})[charge.key] = charge.maximum - charge.remaining + 1;
  return true;
}
