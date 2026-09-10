import { clampResources, equipFromItems, equipReason, unequipToItems, parseItem, type HeroState } from './model.ts';
import { SLOTS, moveItem, packItems, placeItems, stashRows, type Item, type Slot } from './items.ts';
import { sharedTransaction } from './shared-storage.ts';

export const SHARED_STASH_KEY = 'eclipse-ii-shared-stash-v1';
export const SHARED_STASH_ROWS = 10;
export type PersonalContainer = 'inventory' | 'stash';
export type SharedTransfer = { itemId: string; container: PersonalContainer; direction: 'deposit' | 'withdraw' }
  | { itemId: string; target?: Slot; direction: 'equip' }
  | { itemId: string; x: number; y: number; direction: 'move' }
  | { slot: Slot; position?: { x: number; y: number }; direction: 'unequip' };
export function parseSharedItems(value: unknown): Item[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid shared items');
  const items = value.map(parseItem);
  if (items.some(item => !item) || new Set(items.map(item => item!.id)).size !== items.length || !packItems(items as Item[], SHARED_STASH_ROWS)) throw new Error('Invalid shared items');
  return items as Item[];
}
export function moveSharedItem(hero: HeroState, shared: Item[], request: SharedTransfer) {
  if (request.direction === 'move') {
    if (!moveItem(shared, request.itemId, request.x, request.y, SHARED_STASH_ROWS)) throw new Error('目标区域必须完整容纳交换物品');
    return;
  }
  if (request.direction === 'equip') {
    const item = shared.find(item => item.id === request.itemId); if (!item) throw new Error('物品已被移动，请重新选择');
    const personal = [...hero.inventory, ...hero.stash, ...Object.values(hero.equipment), ...Object.values(hero.alternate), ...Object.values(hero.corpse?.equipment ?? {}), ...(hero.corpse?.extras ?? [])];
    if (personal.some(other => other?.id === item.id)) throw new Error('角色已有相同标识的物品，无法重复装备');
    if (request.target && !SLOTS.includes(request.target)) throw new Error('无效的装备栏');
    if (!equipFromItems(hero, shared, item.id, request.target, SHARED_STASH_ROWS)) throw new Error(equipReason(hero, item, request.target) || '共享仓库空间不足，无法放回替换装备');
    return;
  }
  if (request.direction === 'unequip') {
    if (!SLOTS.includes(request.slot)) throw new Error('无效的装备栏');
    if (!unequipToItems(hero, shared, request.slot, SHARED_STASH_ROWS, request.position)) throw new Error('共享仓库目标空间不足或装备已被移动');
    return;
  }
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
