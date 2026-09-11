export type PlayerCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const PLAYER_COUNTS: readonly PlayerCount[] = [1, 2, 3, 4, 5, 6, 7, 8];
export function parsePlayerCount(value: unknown): PlayerCount {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8 ? value as PlayerCount : 1;
}
export const playerLifeFactor = (players: number = 1) => (parsePlayerCount(players) + 1) / 2;
// LoD applies the damage/to-hit bonus only in Nightmare and Hell.
export const playerDamageFactor = (players: number = 1, difficulty = 0) => difficulty > 0 ? 1 + (parsePlayerCount(players) - 1) / 16 : 1;
export const playerDropExponent = (players: number = 1) => Math.floor((parsePlayerCount(players) + 1) / 2);

/** Solo /players: every simulated companion counts as an unpartied player. */
export function playerNoDrop(noDrop: number, itemWeight: number, players = 1) {
  const exponent = playerDropExponent(players);
  if (exponent === 1 || noDrop <= 0 || itemWeight <= 0) return noDrop;
  const chance = (noDrop / (noDrop + itemWeight)) ** exponent;
  return Math.floor(itemWeight * chance / (1 - chance));
}
/** Adapt the existing independent drop categories to integer NoDrop weights. */
export function playerDropChance(chance: number, players = 1) {
  if (playerDropExponent(players) === 1 || chance <= 0 || chance >= 1) return chance;
  const weight = Math.round(chance * 1000);
  return weight / (weight + playerNoDrop(1000 - weight, weight, players));
}
