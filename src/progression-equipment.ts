import { BASES, makeItem, packItems, placeItems, type Item } from './items.ts';
import type { HeroState } from './model.ts';

// Modest socket bases, never completed runewords. Gold earned while farming
// provides a deterministic fallback to the existing random base drops.
export const BASE_OFFERS = [
  { id: 'edge-bow', code: 'hbw', sockets: 3, level: 15, cleared: 5, price: 900, purpose: '边缘 · 三孔弓' },
  { id: 'stealth-armor', code: 'lea', sockets: 2, level: 17, cleared: 5, price: 700, purpose: '隐密 / 烟雾 · 两孔护甲' },
  { id: 'lore-helm', code: 'cap', sockets: 2, level: 20, cleared: 5, price: 700, purpose: '知识 · 两孔头盔' },
  { id: 'insight-bow', code: '8hb', sockets: 4, level: 27, cleared: 10, price: 2400, purpose: '眼光 / 和谐 · 四孔剃刀之弓' },
  { id: 'utility-helm', code: 'msk', sockets: 3, level: 35, cleared: 15, price: 1600, purpose: '功能符文之语 · 三孔面具' },
  { id: 'hustle-armor', code: 'brs', sockets: 3, level: 39, cleared: 15, price: 1800, purpose: '躁动 · 三孔胸甲' },
  { id: 'elite-bow', code: '6hb', sockets: 4, level: 65, cleared: 45, price: 8000, purpose: '眼光 / 和谐 · 四孔刀锋弓' },
] as const;
export function unlockedBaseOffers(hero: HeroState) {
  const progress = hero.campaign.cleared.reduce((sum, count) => sum + count, 0);
  return BASE_OFFERS.filter(offer => hero.level >= offer.level && progress >= offer.cleared);
}
export function buyProgressionBase(hero: HeroState, id: string): Item | undefined {
  const offer = unlockedBaseOffers(hero).find(offer => offer.id === id);
  if (!offer || hero.gold < offer.price) return;
  const base = BASES.find(base => base.baseCode === offer.code);
  if (!base || (base.sockets ?? 0) < offer.sockets) return;
  const item = makeItem(base); item.sockets = offer.sockets;
  if (!packItems([...hero.inventory, item])) return;
  hero.inventory.push(item); placeItems(hero.inventory); hero.gold -= offer.price;
  return item;
}
