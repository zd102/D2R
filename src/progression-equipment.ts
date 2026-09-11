import { BASES, isAvailableItem, itemId, makeItem, packItems, placeItems, type Item } from './items.ts';
import { AREA_LEVELS } from './campaign.ts';
import type { HeroState } from './model.ts';

export type BaseOffer = { id: string; code: string; sockets: number; price: number; sold: boolean };
export type BaseStock = { difficulty: 0 | 1 | 2; offers: BaseOffer[] };
export function basePool(difficulty: 0 | 1 | 2) {
  const seen = new Set<string>();
  return BASES.filter(base => {
    if (!base.baseCode || seen.has(base.baseCode) || !isAvailableItem(base) || !base.sockets || (base.qualityLevel ?? base.level) > AREA_LEVELS[difficulty][24]) return false;
    seen.add(base.baseCode); return true;
  });
}
export function refreshBaseStock(hero: HeroState, random = Math.random) {
  const pool = basePool(hero.difficultyLevel);
  const offers: BaseOffer[] = [];
  for (let i = 0; i < 5 && pool.length; i++) {
    const base = pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0];
    const sockets = 1 + Math.min(base.sockets! - 1, Math.floor(random() * base.sockets!));
    offers.push({ id: itemId(), code: base.baseCode!, sockets, price: basePrice(base.qualityLevel ?? base.level, sockets), sold: false });
  }
  hero.baseStock = { difficulty: hero.difficultyLevel, offers };
}
function basePrice(level: number, sockets: number) { return 100 + level * 40 + sockets * 100; }
export function parseBaseStock(value: unknown): BaseStock {
  const empty: BaseStock = { difficulty: 0, offers: [] };
  if (!value || typeof value !== 'object') return empty;
  const stock = value as BaseStock;
  if (![0, 1, 2].includes(stock.difficulty) || !Array.isArray(stock.offers) || stock.offers.length !== 5) return empty;
  const pool = basePool(stock.difficulty), ids = new Set<string>(), codes = new Set<string>();
  const offers: BaseOffer[] = [];
  for (const offer of stock.offers) {
    if (!offer || typeof offer.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(offer.id) || ids.has(offer.id) || codes.has(offer.code)) return empty;
    const base = pool.find(base => base.baseCode === offer.code);
    if (!base || !Number.isInteger(offer.sockets) || offer.sockets < 1 || offer.sockets > base.sockets! || typeof offer.sold !== 'boolean') return empty;
    ids.add(offer.id); codes.add(offer.code);
    offers.push({ id: offer.id, code: offer.code, sockets: offer.sockets, price: basePrice(base.qualityLevel ?? base.level, offer.sockets), sold: offer.sold });
  }
  return { difficulty: stock.difficulty, offers };
}
export function buyProgressionBase(hero: HeroState, id: string): Item | undefined {
  const offer = hero.baseStock.offers.find(offer => offer.id === id);
  if (!offer || offer.sold || hero.gold < offer.price) return;
  const base = basePool(hero.baseStock.difficulty).find(base => base.baseCode === offer.code);
  if (!base || (base.sockets ?? 0) < offer.sockets) return;
  const item = makeItem(base); item.sockets = offer.sockets;
  if (!packItems([...hero.inventory, item])) return;
  hero.inventory.push(item); placeItems(hero.inventory); hero.gold -= offer.price; offer.sold = true;
  return item;
}
