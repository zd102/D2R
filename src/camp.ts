import type { HeroState } from './model.ts';

export const CAMP = {
  id: 'camp', name: '罗格营地', english: 'ROGUE ENCAMPMENT',
  spawn: { x: 0, z: 11 },
  // Arrival plaza: travel to the north/west, services around the south/east.
  portal: { x: -4, z: 8 }, mysteryPortal: { x: -11, z: 7 }, returnPortal: { x: 3, z: 4 },
  supply: { x: 7, z: 11 }, baseMerchant: { x: -7, z: 14 }, mercenaryMerchant: { x: -6, z: -2 }, stash: { x: 1, z: 16 },
};

export function prepareCampArrival(hero: HeroState) {
  hero.poison = hero.curse = hero.cold = 0;
  if (hero.mercenary?.status === 'alive') hero.mercenary.cold = hero.mercenary.poison = 0;
  if (hero.corpse) {
    hero.corpse.x = CAMP.spawn.x; hero.corpse.z = CAMP.spawn.z; hero.corpse.xpLost = 0;
  }
}
