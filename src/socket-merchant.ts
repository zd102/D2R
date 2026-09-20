import { affixSocketCap } from './affixes.ts';
import { filledSockets, isAvailableItem, type Item } from './items.ts';
import { LEVELS } from './campaign.ts';
import { vendorPrice, type HeroState } from './model.ts';

export const socketMerchantUnlocked = (hero: HeroState) => hero.campaign.cleared[0] >= LEVELS.length;

// Larzuk uses ilvl/type caps, without the difficulty cap applied to random drops.
// https://classic.battle.net/diablo2exp/quests/rewards.shtml
export function socketQuestRange(item: Item): [number, number] | undefined {
  if (!isAvailableItem(item) || item.misc || item.event || item.charm || item.jewel ||
      !['weapon', 'shield', 'armor', 'helm'].includes(item.slot) ||
      !['common', 'magic', 'rare', 'set', 'unique', 'legendary'].includes(item.rarity) ||
      (item.sockets ?? 0) > 0 || filledSockets(item) > 0) return;
  let cap: number;
  try { cap = affixSocketCap(item); } catch { return; }
  if (cap < 1) return;
  if (item.rarity === 'common') return [cap, cap];
  return [1, item.rarity === 'magic' ? Math.min(2, cap) : 1];
}

export function socketMerchantReason(item: Item) {
  if ((item.sockets ?? 0) > 0 || filledSockets(item) > 0) return '已有孔位，不能再次打孔';
  if (item.identified === false) return '请先鉴定装备';
  return socketQuestRange(item) ? '' : '此物品不能打孔';
}

export const socketMerchantPrice = (hero: HeroState, item: Item) => vendorPrice(hero, 1000 + Math.max(1, Math.floor(item.level)) * 100);

export function buySocketing(hero: HeroState, id: string, random = Math.random): Item | undefined {
  if (!socketMerchantUnlocked(hero)) return;
  const item = hero.inventory.find(item => item.id === id);
  if (!item || socketMerchantReason(item)) return;
  const range = socketQuestRange(item)!, price = socketMerchantPrice(hero, item);
  if (hero.gold < price) return;
  const sockets = range[0] === range[1] ? range[0] : random() < .5 ? 1 : 2;
  item.sockets = sockets;
  hero.gold -= price;
  return item;
}
