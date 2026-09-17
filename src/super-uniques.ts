import { encounterPool, MONSTERS } from './bestiary.ts';
import type { Level } from './campaign.ts';

// Budgets relative to the strongest un-affixed elite in each area, per stat.
// Fixed affixes and skills supply burst/control, so do not multiply them here.
// D2 identities: https://classic.battle.net/diablo2exp/monsters/super.shtml
export type SuperUniqueBudget = { life: number; damage: number; defense: number; accuracy: number };
const budget = (life: number, damage: number, defense = 1, accuracy = 1.1): SuperUniqueBudget => ({ life, damage, defense, accuracy });
export const SUPER_UNIQUE_BUDGETS: Readonly<Record<string, SuperUniqueBudget>> = {
  corpsefire: budget(1.7, 1.1, 1),
  bloodRaven: budget(1.5, 1.05, .85, 1.25),
  griswold: budget(2.2, 1.2, 1.3),
  countess: budget(1.6, 1.1, .9),
  radament: budget(1.8, 1.05, 1),
  bloodwitch: budget(1.6, 1.05, 1, 1.2),
  coldworm: budget(2.4, 1, 1.2),
  summoner: budget(1.5, 1.2, .65),
  szzark: budget(1.8, 1.05, 1),
  endugu: budget(1.6, 1.05, .85),
  sarina: budget(1.6, 1.05, .9, 1.25),
  ismail: budget(1.8, 1, 1),
  abyssVanguard: budget(2, 1.1, 1.15), // Project-specific encounter.
  izual: budget(2.8, 1, 1.2),
  hephasto: budget(2, 1.15, 1.2, 1.2),
  deSeis: budget(1.6, 1, .95),
  shenk: budget(2, 1.05, 1.1),
  eldritch: budget(1.7, 1.1, 1, 1.2),
  frozenstein: budget(2.1, 1.15, 1.15),
  talic: budget(2.1, 1.1, 1.25, 1.2),
  pindleskin: budget(1.7, 1.25, 1.1, 1.2),
  nihlathak: budget(1.5, 1, .75),
  hellCow: budget(2.2, 1.3, 1.2, 1.2),
};

export function superUniqueComparisonPool(area: Level, difficulty: number) {
  const ids = area.special === 'cow' ? ['hellCow'] : area.special === 'nihlathak' ? ['reanimated', 'minion'] : encounterPool(area.index, difficulty);
  return ids.map(id => MONSTERS[id]);
}
