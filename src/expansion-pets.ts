import { setCompanionAuras, type CompanionAura } from './companion-auras.ts';
import * as THREE from 'three';
import type { PaladinCombat, AttackSnapshot } from './combat.ts';
import type { Enemy } from './game.ts';
import type { ClassSummon } from './class-combat.ts';
import type { ExpansionSkillId } from './expansion-skills.ts';
import { skillValues, isAura, type SkillId, type SkillValues, type DamageType } from './paladin.ts';
import { skillLevel, stats, hitChance, equippedAuras } from './model.ts';
import { itemMods, type Item } from './items.ts';
import { createActor, animateActor } from './world.ts';
import { createMonsterActor } from './monster-models.ts';
import { MONSTERS } from './bestiary.ts';
import { createCompanionActor } from './expansion-models.ts';
import { clearShot } from './ranged.ts';

export type ExpansionPet = ClassSummon & { expansionId: ExpansionSkillId; values:SkillValues; resistance:Record<DamageType,number>; baseHp:number; shots?:number; metal?:Item; berserk?:number; buffs:Partial<Record<string,{rank:number;remaining:number}>>; ranged?:boolean; definitionId?:string; attackRating:number; defense:number };
export type SavedCompanion = { id:ExpansionSkillId; rank:number; hp:number; life:number; metal?:Item; monster?:string; damage?:number; maxHp?:number; shots?:number; resistance?:Record<DamageType,number> };
export const GOLEMS = ['clayGolem','bloodGolem','ironGolem','fireGolem'];
export const SPIRITS = ['oakSage','heartOfWolverine','spiritOfBarbs'];
export const VINES = ['plaguePoppy','carrionVine','solarCreeper'];
export const SHADOWS = ['shadowWarrior','shadowMaster'];
export const CORPSE_PETS = ['raiseSkeleton','raiseSkeletalMage','revive'];
export class ExpansionPets {
  readonly combat:PaladinCombat;
  pets:ExpansionPet[]=[];
  constructor(combat:PaladinCombat){this.combat=combat;}
  get game(){return this.combat.game;}
  values(id:ExpansionSkillId,rank:number){
    const h=this.game.hero,levels={...h.skills};
    for(const key of ['skeletonMastery','golemMastery','summonResist','summonSpiritWolf','summonFenris','summonGrizzly'] as const)levels[key]=skillLevel(h,key);
    return skillValues(id,rank,levels);
  }
  summon(id:ExpansionSkillId,rank:number,point:THREE.Vector3,corpse?:Enemy,metal?:Item){
    const g=this.game,v=this.values(id,rank),family=[GOLEMS,SPIRITS,VINES,SHADOWS].find(f=>f.includes(id));
    const existing=this.pets.filter(p=>family?family.includes(p.expansionId):p.expansionId===id);
    if(existing.length>=Math.max(1,v.hits))this.remove(existing[0]);
    if(this.pets.length>=64)return false;
    const definition=corpse?.definition;
    const actor=id==='revive'&&definition?createMonsterActor(definition):createCompanionActor(id);
    actor.group.position.copy(point).setY(0);actor.group.name=`companion-${id}`;g.world.scene.add(actor.group);
    const resist=skillValues('summonResist',skillLevel(g.hero,'summonResist')).percent;
    const nec=GOLEMS.includes(id)||id==='raiseSkeleton'||id==='raiseSkeletalMage';
    const resistance:Record<DamageType,number>={physical:SPIRITS.includes(id)?25:0,magic:0,fire:nec?resist:0,cold:nec?resist:0,lightning:nec?resist:0,poison:nec?resist:0};
    if(id==='fireGolem')resistance.fire=100;
    if(id==='ironGolem')resistance.poison=100;
    if(SHADOWS.includes(id))for(const type of ['fire','cold','lightning','poison'] as const)resistance[type]=v.percent;
    if(id==='revive'&&corpse){Object.assign(resistance,corpse.resistances);v.healing=corpse.maxHp/(corpse.playerCount?1+.5*(corpse.playerCount-1):1)*(1+v.percent/100);v.min=v.max=corpse.damage*(1+v.damage/100);}
    const mods=metal?itemMods(metal):{};
    if(metal){v.min=(metal.minDamage??v.min)*(1+(mods.damage??0)/100);v.max=(metal.maxDamage??v.max)*(1+(mods.damage??0)/100);v.healing+=mods.life??0;for(const type of ['fire','cold','lightning','poison'] as const)resistance[type]=Math.min(100,resistance[type]+(mods.allRes??0)+(mods[`${type}Res`]??0));}
    if(id==='raiseSkeletalMage'){v.type=(['fire','cold','lightning','poison'] as const)[this.pets.filter(p=>p.expansionId===id).length%4];if(v.type==='poison')v.duration=4;}
    const pet:ExpansionPet={id:'valkyrie',expansionId:id,actor,rank,values:v,hp:Math.max(1,v.healing),maxHp:Math.max(1,v.healing),baseHp:Math.max(1,v.healing),life:id==='revive'?180:3600,timer:.1,path:[],rethink:0,snapshot:this.combat.snapshot(),resistance,metal:metal?structuredClone(metal):undefined,buffs:{},attackRating:20+g.hero.level*12+rank*15,defense:20+g.hero.level*5,definitionId:definition?.id,ranged:id==='raiseSkeletalMage'||id==='revive'&&['archer','mage'].includes(definition?.model??''),...(id==='raven'?{shots:5}:{})};
    this.pets.push(pet);g.burst(point.clone().setY(.6),0x9bd0a5,12);return true;
  }
  remove(pet:ExpansionPet){pet.hp=0;this.game.disposeObject(pet.actor.group);const index=this.pets.indexOf(pet);if(index>=0)this.pets.splice(index,1);}
  corpse(point:THREE.Vector3,radius=4){return this.game.enemies.filter(e=>e.dead&&!e.redeemed&&(!e.summoned||e.corpseExplosionSource)&&!e.boss&&e.actor.group.position.distanceTo(point)<radius&&clearShot(this.game.world.grid,point,e.actor.group.position)).sort((a,b)=>a.actor.group.position.distanceToSquared(point)-b.actor.group.position.distanceToSquared(point))[0];}
  snapshot(pet:ExpansionPet):AttackSnapshot {
    const s=this.combat.snapshot();s.items=[];s.stats.mods=pet.metal?itemMods(pet.metal):{};s.stats.auras=[];
    s.origin=pet.actor.group.position.clone();return s;
  }
  hurt(pet:ExpansionPet,amount:number,type:DamageType,source?:Enemy,missile=false){
    if(pet.expansionId==='raven')return;
    const h=this.game.hero,shout=pet.buffs.shout,defense=pet.defense*(1+(shout?skillValues('shout',shout.rank).percent:0)/100);
    if(source&&type==='physical'&&Math.random()*100>=hitChance(source.attackRating,defense,source.level,h.level))return;
    const damage=amount*Math.max(0,1-pet.resistance[type]/100);pet.hp=Math.max(0,pet.hp-damage);
    if(source&&!missile&&type==='physical'){
      const curse=this.combat.itemCurses.get(source),thorns=equippedAuras(h).find(a=>a.id==='thorns');
      const reflected=(curse?.kind==='ironMaiden'?damage*skillValues('ironMaiden',curse.rank??1).percent/100:0)+(thorns?damage*thorns.percent/100+thorns.secondary:0)+(pet.expansionId==='ironGolem'?pet.values.percent:0);
      if(reflected)this.combat.damage(source,reflected,'physical',false,false,this.snapshot(pet));
      const spirit=this.pets.find(p=>p.expansionId==='spiritOfBarbs'&&p.hp>0&&p.actor.group.position.distanceTo(pet.actor.group.position)<20);
      if(spirit)this.combat.damage(source,spirit.values.percent,'physical',false,false,this.snapshot(pet));
    }
  }
  update(dt:number){
    const g=this.game,h=g.hero,c=this.combat;
    const auras:CompanionAura[]=[];for(const pet of this.pets)if(pet.hp>0&&pet.metal){const mods=itemMods(pet.metal);for(const [key,rank] of Object.entries(mods)){if(!key.startsWith('aura_')||!rank)continue;const id=key.slice(5) as SkillId;if(!isAura(id))continue;const values=skillValues(id,rank);if(pet.actor.group.position.distanceTo(g.position)<=values.radius)auras.push({id,rank,...values,source:{x:pet.actor.group.position.x,z:pet.actor.group.position.z}});}}setCompanionAuras(h,auras);
    for(const id of SPIRITS){delete h.buffs[id as ExpansionSkillId];if(h.mercenary?.buffs)delete h.mercenary.buffs[id as ExpansionSkillId];}
    const guard=g.mercenary?.ally;if(guard&&h.mercenary?.status==='alive')for(const spirit of this.pets)if(spirit.hp>0&&SPIRITS.includes(spirit.expansionId)&&spirit.actor.group.position.distanceTo(guard.actor.group.position)<20)(h.mercenary.buffs??={})[spirit.expansionId]={rank:spirit.rank,remaining:.2};
    for(const spirit of this.pets)if(spirit.hp>0&&SPIRITS.includes(spirit.expansionId)&&spirit.actor.group.position.distanceTo(g.position)<20)h.buffs[spirit.expansionId]={rank:spirit.rank,remaining:.2};
    for(const pet of [...this.pets]){
      pet.life-=dt;pet.timer-=dt;pet.berserk=Math.max(0,(pet.berserk??0)-dt);
      for(const [id,buff] of Object.entries(pet.buffs))if(buff&&(buff.remaining-=dt)<=0)delete pet.buffs[id];
      if(pet.hp<=0||pet.life<=0||pet.shots===0){this.remove(pet);continue;}
      const point=pet.actor.group.position,id=pet.expansionId,v=pet.values;
      const oak=this.pets.find(p=>p.expansionId==='oakSage'&&p.hp>0&&p.actor.group.position.distanceTo(point)<20);
      const max=pet.baseHp*(1+((oak?.values.percent??0)+(pet.buffs.battleOrders?skillValues('battleOrders',pet.buffs.battleOrders.rank).percent:0))/100);
      if(max!==pet.maxHp){pet.hp=pet.hp/pet.maxHp*max;pet.maxHp=max;}
      if(point.distanceTo(g.position)>24){const destination=this.arrival();if(destination){point.copy(destination);pet.path=[];}}
      const passive=SPIRITS.includes(id)||['carrionVine','solarCreeper'].includes(id);
      const target=passive?undefined:g.enemies.filter(e=>c.hostile(e)&&e.actor.group.position.distanceTo(point)<14&&clearShot(g.world.grid,point,e.actor.group.position)).sort((a,b)=>a.actor.group.position.distanceToSquared(point)-b.actor.group.position.distanceToSquared(point))[0];
      const destination=target?.actor.group.position??g.position;
      const spacing=target?(pet.ranged?7:id==='raven'?2:1.8):2+this.pets.indexOf(pet)%4*.65;
      let moving=false;
      if(point.distanceTo(destination)>spacing){
        pet.rethink-=dt;if(pet.rethink<=0){pet.path=g.world.path(point,destination);pet.rethink=.6+this.pets.indexOf(pet)%5*.09;}
        const next=pet.path[0];if(next){const dir=next.clone().sub(point).setY(0).normalize(),end=point.clone().addScaledVector(dir,Math.min(next.distanceTo(point),dt*(id==='raven'?7:4.3)));
          if(clearShot(g.world.grid,point,end)){point.copy(end);moving=true;pet.actor.group.rotation.y=Math.atan2(dir.x,dir.z);}if(point.distanceTo(next)<.3)pet.path.shift();}
      }
      if(pet.timer<=0){
        pet.timer=id==='raven'?.6:pet.ranged?1.3:1;
        if(['carrionVine','solarCreeper','summonFenris'].includes(id)){
          const corpse=this.corpse(point,5);const s=stats(h),needs=id==='carrionVine'?h.hp<s.maxHp:id==='solarCreeper'?h.mana<s.maxMana:!pet.berserk;
          if(corpse&&needs){corpse.redeemed=true;corpse.actor.group.visible=false;if(id==='carrionVine')h.hp=Math.min(s.maxHp,h.hp+s.maxHp*v.percent/100);else if(id==='solarCreeper')h.mana=Math.min(s.maxMana,h.mana+s.maxMana*v.percent/100);else pet.berserk=20;}
        }
        if(target&&point.distanceTo(target.actor.group.position)<(pet.ranged?12:3)){
          const wolf=this.pets.find(p=>p.expansionId==='heartOfWolverine'&&p.hp>0&&p.actor.group.position.distanceTo(point)<20);
          const auras=equippedAuras(h),bonus=(wolf?.values.damage??0)+auras.reduce((sum,a)=>sum+(['might','concentration','fanaticism'].includes(a.id)?a.damage:0),0)+(pet.berserk?100:0);
          const attack=pet.attackRating*(1+((wolf?.values.attack??0)+auras.reduce((sum,a)=>sum+a.attack,0))/100);
          if(pet.ranged||id==='raven'||Math.random()*100<hitChance(attack,target.defense,h.level,target.level)){
            const values={...v,min:v.min*(1+bonus/100),max:v.max*(1+bonus/100)};
            if(pet.ranged)c.expansion.projectile(id,point,target.actor.group.position.clone().sub(point).normalize(),values,this.snapshot(pet),target);
            else {const before=target.hp;c.expansion.hit(target,id,values,this.snapshot(pet));if(pet.metal){const mods=itemMods(pet.metal);for(const type of ['fire','cold','lightning'] as const){const amount=((mods[`${type}MinDamage`]??0)+(mods[`${type}MaxDamage`]??0))/2;if(amount)c.damage(target,amount,type,false,false,this.snapshot(pet));}if(Math.random()*100<(mods.crushingBlow??0))c.damage(target,target.hp/(1+.5*((target.playerCount??1)-1))*(target.boss?.125:.25),'physical',false,false,this.snapshot(pet));pet.hp=Math.min(pet.maxHp,pet.hp+Math.max(0,before-target.hp)*(mods.lifeSteal??0)/100);c.triggerItems('hit-skill',target,[pet.metal],true);}if(id==='bloodGolem'){const healed=Math.max(0,before-target.hp)*v.percent/100;pet.hp=Math.min(pet.maxHp,pet.hp+healed*.7);h.hp=Math.min(stats(h).maxHp,h.hp+healed*.3);}if(id==='clayGolem')target.slow={percent:v.percent,remaining:4};if(id==='raven'){pet.shots!--;if(!target.boss)target.blind=4;}}
            if(SHADOWS.includes(id)){
              const selected=id==='shadowWarrior'?Object.values(h.bindings).find(skill=>['fireBlast','shockWeb','mindBlast','lightningSentry'].includes(skill)):['fireBlast','mindBlast','lightningSentry'][Math.floor(g.time)%3];
              if(selected){const power=Math.max(1,Math.floor((pet.rank+skillLevel(h,selected as ExpansionSkillId))/3)),value=skillValues(selected as ExpansionSkillId,power,h.skills);if(selected==='mindBlast'){c.expansion.hit(target,'mindBlast',value,this.snapshot(pet));if(!target.boss)target.stunned=Math.max(target.stunned,1);}else c.expansion.projectile(selected as ExpansionSkillId,point,target.actor.group.position.clone().sub(point).normalize(),value,this.snapshot(pet),target);}
            }
          }
        }
        if(id==='plaguePoppy'||id==='fireGolem')for(const enemy of g.enemies)if(c.hostile(enemy)&&enemy.actor.group.position.distanceTo(point)<3&&clearShot(g.world.grid,point,enemy.actor.group.position))c.expansion.hit(enemy,id,{...v,min:v.min*(id==='fireGolem'?.2:1),max:v.max*(id==='fireGolem'?.2:1)},this.snapshot(pet));
      }
      animateActor(pet.actor,g.time,moving,pet.timer>.8?.5:0);
    }
  }
  export():SavedCompanion[]{return this.pets.filter(p=>p.hp>0).map(p=>({id:p.expansionId,rank:p.rank,hp:p.hp/p.maxHp,life:p.life,metal:p.metal,monster:p.definitionId,...(p.expansionId==='revive'?{damage:p.values.min,maxHp:p.baseHp,resistance:{...p.resistance}}:{}),shots:p.shots}));}
  arrival(){for(let i=0;i<12;i++){const a=(i+this.pets.length*5)*Math.PI/6,point=this.game.position.clone().add(new THREE.Vector3(Math.sin(a)*2,0,Math.cos(a)*2)),destination=this.combat.classes.destination(point,false);if(destination)return destination;}return undefined;}
  restore(saved:SavedCompanion[]){for(const entry of saved){const point=this.arrival();if(!point)continue;let corpse:Enemy|undefined;
    if(entry.id==='revive'&&entry.monster&&MONSTERS[entry.monster])corpse={definition:MONSTERS[entry.monster],maxHp:(entry.maxHp??100)/(1+skillValues('revive',entry.rank,this.game.hero.skills).percent/100),damage:(entry.damage??10)/(1+skillValues('revive',entry.rank,this.game.hero.skills).damage/100),resistances:entry.resistance??{physical:0,magic:0,fire:0,cold:0,lightning:0,poison:0}} as Enemy;
    if(this.summon(entry.id,entry.rank,point,corpse,entry.metal)){const pet=this.pets.at(-1)!;pet.hp=pet.maxHp*entry.hp;pet.life=entry.life;if(entry.shots!==undefined)pet.shots=entry.shots;}}
  }
  clear(){setCompanionAuras(this.game.hero,[]);for(const pet of [...this.pets])this.remove(pet);}
}
