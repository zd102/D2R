import { rangedBase, type Item } from './items.ts';
import type { HeroState } from './model.ts';
import { gridWalkable } from './world.ts';

// Legacy reserve/stack values remain in saves, but no longer gate attacks.
export function ammunition(_hero: HeroState, weapon = _hero.equipment.weapon) {
  return rangedBase(weapon) ? Infinity : 0;
}

// Sub-cell steps bound both wall tunneling and collisions along curved trajectories.
export function clearShot(grid: Parameters<typeof gridWalkable>[0], from: { x: number; z: number }, to: { x: number; z: number }) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2));
  for (let i = 0; i <= steps; i++) if (!gridWalkable(grid, { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps })) return false;
  return true;
}
