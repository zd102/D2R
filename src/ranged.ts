import { rangedBase, quantityLeft, type Item } from './items.ts';
import type { HeroState } from './model.ts';
import { gridWalkable } from './world.ts';

export type AmmoKind = 'arrows' | 'bolts';
export const AMMO_NAMES: Record<AmmoKind, string> = { arrows: '箭矢', bolts: '弩矢' };
export const AMMO_BUNDLE = 60;
export const AMMO_LIMIT = 600;
export const AMMO_COST = 25;
export function ammoKind(item: Item | null | undefined): AmmoKind | undefined {
  const kind = rangedBase(item)?.kind;
  return kind === 'bow' ? 'arrows' : kind === 'crossbow' ? 'bolts' : undefined;
}
export function ammunition(hero: HeroState, weapon = hero.equipment.weapon) {
  const kind = ammoKind(weapon);
  return kind ? hero.ammo[kind] : weapon ? quantityLeft(weapon) : 0;
}
export function buyAmmo(hero: HeroState, kind: AmmoKind) {
  if (!Object.hasOwn(AMMO_NAMES, kind) || hero.gold < AMMO_COST || hero.ammo[kind] >= AMMO_LIMIT) return false;
  hero.gold -= AMMO_COST; hero.ammo[kind] = Math.min(AMMO_LIMIT, hero.ammo[kind] + AMMO_BUNDLE); return true;
}
export function useAmmoBundle(hero: HeroState, id: string) {
  const container = [hero.inventory, hero.stash].find(items => items.some(item => item.id === id));
  const item = container?.find(item => item.id === id), kind = item?.misc && (item.baseCode === 'aqv' ? 'arrows' : item.baseCode === 'cqv' ? 'bolts' : undefined);
  if (!container || !item || !kind || hero.ammo[kind] >= AMMO_LIMIT) return false;
  hero.ammo[kind] = Math.min(AMMO_LIMIT, hero.ammo[kind] + AMMO_BUNDLE); container.splice(container.indexOf(item), 1); return true;
}
export function consumeAmmo(hero: HeroState, weapon: Item, magicArrow = false) {
  if (magicArrow && ammoKind(weapon)) return true;
  if (ammunition(hero, weapon) <= 0) return false;
  const kind = ammoKind(weapon);
  if (kind) hero.ammo[kind]--; else weapon.quantity = quantityLeft(weapon) - 1;
  return true;
}

// Sub-cell steps bound both wall tunneling and collisions along curved trajectories.
export function clearShot(grid: Parameters<typeof gridWalkable>[0], from: { x: number; z: number }, to: { x: number; z: number }) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2));
  for (let i = 0; i <= steps; i++) if (!gridWalkable(grid, { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps })) return false;
  return true;
}
