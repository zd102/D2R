import { weaponType, type Item } from './items.ts';
import type { ClassId } from './classes.ts';
import { ONE_HANDED_SWORDS, BOOT_KICKS } from './expansion-equipment-data.ts';

export function usesBothHands(classId:ClassId,item:Item|null|undefined) {
  return !!item?.twoHanded && !(classId==='barbarian'&&weaponType(item)==='sword');
}
export function canOffhand(classId:ClassId,item:Item|null|undefined) {
  if(!item||item.slot!=='weapon')return false;
  return classId==='assassin'?weaponType(item)==='claw':classId==='barbarian'&&!usesBothHands(classId,item);
}
export function weaponBaseDamage(classId:ClassId,item:Item|undefined,offhand:Item|null|undefined) {
  const one=classId==='barbarian'&&offhand&&item?.twoHanded?ONE_HANDED_SWORDS[item.baseCode??'']:undefined;
  const scale=(item?.ethereal?1.5:1)*(item?.baseQuality==='low'?.75:1);
  return one?[Math.floor(one[0]*scale),Math.floor(one[1]*scale)]:[item?.minDamage??(item?item.power*.65:1),item?.maxDamage??item?.power??2];
}
export function kickBaseDamage(strength:number,dexterity:number,boots:Item|undefined,bonus=0) {
  const base=BOOT_KICKS[boots?.baseCode??'']??[0,0];
  return [Math.max(0,(strength+dexterity-20)/4)*(1+bonus/100)+base[0]*(1+(strength*1.2+bonus)/100),Math.max(0,(strength+dexterity-20)/3)*(1+bonus/100)+base[1]*(1+(strength*1.2+bonus)/100)];
}
// These properties only affect the weapon that carries them. Other equipment
// and weapon-wide skill/aura/attribute bonuses continue to apply to both hands.
export const WEAPON_LOCAL_MODS = ['damage','damagePercentPerLevel','minDamage','maxDamage','damageFlat','maxDamagePerLevel','ias','attackRating','attackRatingPercent','attackRatingPerLevel','attackRatingPercentPerLevel','crushingBlow','deadlyStrike','openWounds','lifeSteal','manaSteal','ignoreDefense','targetDefense','targetDefenseFlat','damageDemons','damageUndead','attackDemons','attackUndead','fireMinDamage','fireMaxDamage','coldMinDamage','coldMaxDamage','lightningMinDamage','lightningMaxDamage','magicMinDamage','magicMaxDamage','poisonMinRate','poisonMaxRate','poisonFrames','knockback','slowTarget','freezeTarget','blindTarget','flee','preventHeal','pierceChance'] as const;
