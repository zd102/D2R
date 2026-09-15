import { clampResources, equipFromItems, equipReason, unequipToItems, parseItem, type HeroState } from './model.ts';
import { SLOTS, transferItems, organizeItems, moveItem, packItems, stashRows, type Item, type Slot } from './items.ts';

export const SHARED_STASH_KEY = 'eclipse-ii-shared-stash-v1';
export const SHARED_STASH_ROWS = 50;
export type PersonalContainer = 'inventory' | 'stash';
export type SharedTransfer = { itemId: string; container: PersonalContainer; position?: { x: number; y: number }; direction: 'deposit' | 'withdraw' }
  | { direction: 'sort'; container: 'shared' | 'stash' }
  | { itemId: string; target?: Slot; direction: 'equip' }
  | { itemId: string; x: number; y: number; direction: 'move' }
  | { slot: Slot; position?: { x: number; y: number }; direction: 'unequip' };
export function parseSharedItems(value: unknown): Item[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('Invalid shared items');
  const items = value.map(parseItem);
  if (items.some(item => !item) || new Set(items.map(item => item!.id)).size !== items.length || !packItems(items as Item[], SHARED_STASH_ROWS)) throw new Error('Invalid shared items');
  return items as Item[];
}
export function moveSharedItem(hero: HeroState, shared: Item[], request: SharedTransfer) {
  if (request.direction === 'sort') {
    if (!['shared', 'stash'].includes(request.container)) throw new Error('无效的整理目标');
    if (!organizeItems(request.container === 'shared' ? shared : hero.stash, request.container === 'shared' ? SHARED_STASH_ROWS : stashRows(hero.stash))) throw new Error('仓库空间不足');
    return;
  }
  if (request.direction === 'move') {
    if (!moveItem(shared, request.itemId, request.x, request.y, SHARED_STASH_ROWS)) throw new Error('目标区域必须完整容纳交换物品');
    return;
  }
  if (request.direction === 'equip') {
    const item = shared.find(item => item.id === request.itemId); if (!item) throw new Error('物品已被移动，请重新选择');
    const personal = [...hero.inventory, ...hero.stash, ...hero.cube, ...Object.values(hero.equipment), ...Object.values(hero.alternate), ...Object.values(hero.corpse?.equipment ?? {}), ...(hero.corpse?.extras ?? [])];
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
  const personal = [...hero.inventory, ...hero.stash, ...hero.cube, ...Object.values(hero.equipment), ...Object.values(hero.alternate), ...Object.values(hero.corpse?.equipment ?? {}), ...(hero.corpse?.extras ?? [])];
  if (depositing ? shared.some(other => other.id === item.id) : personal.some(other => other?.id === item.id)) throw new Error('目标已有相同标识的物品，无法重复转移');
  const personalRows = request.container === 'inventory' ? 4 : stashRows(hero.stash);
  // A returned item must not duplicate equipment in another personal container.
  if (depositing && request.position) {
    const proposedFrom = structuredClone(from), proposedTo = structuredClone(to);
    if (transferItems(proposedFrom, proposedTo, item.id, personalRows, SHARED_STASH_ROWS, request.position)
      && proposedFrom.some(returned => shared.some(other => other.id === returned.id) && personal.some(other => other?.id === returned.id))) throw new Error('角色已有相同标识的物品，无法重复交换');
  }
  if (!transferItems(from, to, item.id, depositing ? personalRows : SHARED_STASH_ROWS, depositing ? SHARED_STASH_ROWS : personalRows, request.position)) throw new Error('目标空间不足或未完整覆盖交换物品');
  clampResources(hero);
}
export type SharedLock = <T>(operation: () => T) => Promise<T>;
