import type { HeroState } from './model.ts';

export const CAMP = {
  id: 'camp', name: '罗格营地', english: 'ROGUE ENCAMPMENT',
  spawn: { x: 0, z: 11 }, portal: { x: -4, z: 8 }, mysteryPortal: { x: -10, z: 8 }, supply: { x: 6, z: 11 }, baseMerchant: { x: -3, z: 12 }, mercenaryMerchant: { x: -6, z: 7 }, stash: { x: 2, z: 15 },
};

export function prepareCampArrival(hero: HeroState) {
  hero.poison = hero.curse = hero.cold = 0;
  if (hero.mercenary?.status === 'alive') hero.mercenary.cold = hero.mercenary.poison = 0;
  if (hero.corpse) {
    hero.corpse.x = CAMP.spawn.x; hero.corpse.z = CAMP.spawn.z; hero.corpse.xpLost = 0;
  }
}
