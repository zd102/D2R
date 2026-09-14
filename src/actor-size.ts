import type { BodyPlan, MonsterDef } from './bestiary.ts';

// Art tuning relative to the original meshes, not collision or combat radii.
// Small demons stay below human height; heavy beasts and act bosses dominate.
const FAMILY_SIZE: Record<BodyPlan, number> = {
  fallen: .92, shaman: .95, zombie: 1, skeleton: 1, archer: 1, mage: 1,
  goat: 1.08, ghost: 1, mummy: 1.05, beetle: 1.08, maggot: 1.12,
  viper: 1.12, spider: 1.12, flayer: .9, council: 1.05, knight: 1.05,
  mauler: 1.18, venom: 1.16, imp: .9, succubus: 1.05, frozen: 1.18,
  lord: 1.18, cow: 1.12, andariel: 1.12, duriel: 1.18,
  mephisto: 1.12, diablo: 1.18, baal: 1.14,
};

export function monsterVisualScale(definition: MonsterDef): number {
  return 1.35 * definition.scale * FAMILY_SIZE[definition.model];
}
