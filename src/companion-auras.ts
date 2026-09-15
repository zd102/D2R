import type { HeroState } from './model.ts';
import type { SkillId, SkillValues } from './paladin.ts';

export type CompanionAura = SkillValues & { id:SkillId; rank:number; source:{x:number;z:number} };
const sources=new WeakMap<HeroState,CompanionAura[]>();
export const companionAuras=(hero:HeroState)=>sources.get(hero)??[];
export function setCompanionAuras(hero:HeroState,auras:CompanionAura[]){sources.set(hero,auras);}
