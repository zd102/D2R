import { clampResources, parseItem, type HeroState } from './model.ts';
import { packItems, placeItems, stashRows, type Item } from './items.ts';
import { sharedTransaction } from './shared-storage.ts';

export const SHARED_STASH_KEY = 'eclipse-ii-shared-stash-v1';
export const SHARED_STASH_ROWS = 10;
export type PersonalContainer = 'inventory' | 'stash';
export type SharedTransfer = { itemId: string; container: PersonalContainer; direction: 'deposit' | 'withdraw' };
export function parseSharedItems(value: unknown): Item[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid shared items');
  const items = value.map(parseItem);
  if (items.some(item => !item) || new Set(items.map(item => item!.id)).size !== items.length || !packItems(items as Item[], SHARED_STASH_ROWS)) throw new Error('Invalid shared items');
  return items as Item[];
}
export function moveSharedItem(hero: HeroState, shared: Item[], request: SharedTransfer) {
  if (!['inventory', 'stash'].includes(request.container) || !['deposit', 'withdraw'].includes(request.direction)) throw new Error('无效的存取操作');
  const depositing = request.direction === 'deposit', from = depositing ? hero[request.container] : shared, to = depositing ? shared : hero[request.container];
  const item = from.find(item => item.id === request.itemId);
  if (!item) throw new Error('物品已被移动，请重新选择');
  const personal = [...hero.inventory, ...hero.stash, ...Object.values(hero.equipment), ...Object.values(hero.alternate), ...Object.values(hero.corpse?.equipment ?? {}), ...(hero.corpse?.extras ?? [])];
  if (depositing ? shared.some(other => other.id === item.id) : personal.some(other => other?.id === item.id)) throw new Error('目标已有相同标识的物品，无法重复转移');
  if (!depositing && request.container === 'stash' && to.length >= 200) throw new Error('个人仓库已满');
  const rows = depositing ? SHARED_STASH_ROWS : request.container === 'inventory' ? 4 : stashRows([...to, item]);
  const moved = { ...item }; delete moved.x; delete moved.y;
  if (!packItems([...to, moved], rows)) throw new Error(depositing ? '共享仓库空间不足' : request.container === 'inventory' ? '背包空间不足' : '个人仓库空间不足');
  from.splice(from.indexOf(item), 1); to.push(moved); placeItems(to, rows); clampResources(hero);
}
export type SharedLock = <T>(operation: () => T) => Promise<T>;
export const browserSharedLock: SharedLock = sharedTransaction;
