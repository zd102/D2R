import type { HeroState } from './model.ts';

export const CAMP = {
  id: 'camp', name: '罗格营地', english: 'ROGUE ENCAMPMENT',
  spawn: { x: 0, z: 11 },
  // Keep the arrival plaza open, with services spaced around its perimeter.
  portal: { x: -4, z: 8 }, mysteryPortal: { x: -11, z: 7 }, returnPortal: { x: 0, z: 2 },
  supply: { x: 9, z: 8 }, baseMerchant: { x: -8, z: 15 },
  mercenaryMerchant: { x: -6, z: -2 }, gamblingMerchant: { x: 6, z: 3 },
  socketMerchant: { x: 8, z: 16 }, stash: { x: 0, z: 16 },
};

export function prepareCampArrival(hero: HeroState) {
  hero.poison = hero.curse = hero.cold = 0;
  if (hero.mercenary?.status === 'alive') hero.mercenary.cold = hero.mercenary.poison = 0;
  if (hero.corpse) {
    hero.corpse.x = CAMP.spawn.x; hero.corpse.z = CAMP.spawn.z; hero.corpse.xpLost = 0;
  }
}
