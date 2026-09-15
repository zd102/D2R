import * as THREE from 'three';
import type { PaladinCombat, AttackSnapshot, ItemCastTarget, Projectile } from './combat.ts';
import type { Enemy } from './game.ts';
import type { ClassSummon } from './class-combat.ts';
import { expansionMode, isExpansionSkill, type ExpansionSkillId } from './expansion-skills.ts';
import { skillValues, type SkillId, type ActionId, type SkillValues, type DamageType } from './paladin.ts';
import { stats, skillLevel, castingSkillLevel, castingSkillCost, clampResources } from './model.ts';
import { weaponType, itemMods, type Item } from './items.ts';
import { itemDamage, type ItemCurse } from './item-effects.ts';
import { clearShot } from './ranged.ts';
import { gridWalkable, makeRing } from './world.ts';
import { kickBaseDamage } from './equipment-hands.ts';
import { playHeroAction } from './hero-models.ts';
import { updateItemForm } from './item-form.ts';
import { trapModel } from './expansion-models.ts';
import { ExpansionPets, type ExpansionPet } from './expansion-pets.ts';
import { controllableMonster } from './item-special-effects.ts';
import { POTIONS, POTION_LIMIT } from './potions.ts';
import { leechEffectiveness } from './bestiary.ts';

type Missile={id:ExpansionSkillId;mesh:THREE.Mesh;direction:THREE.Vector3;origin:THREE.Vector3;values:SkillValues;snapshot:AttackSnapshot;target?:Enemy;life:number;age:number;hit:Set<number>;speed:number;shared?:Set<number>;weapon?:boolean;returning?:boolean};
type Field={id:ExpansionSkillId;mesh:THREE.Object3D;point:THREE.Vector3;direction?:THREE.Vector3;values:SkillValues;snapshot:AttackSnapshot;life:number;timer:number;delay:number};
type Trap={id:ExpansionSkillId;mesh:THREE.Group;rank:number;values:SkillValues;snapshot:AttackSnapshot;shots:number;timer:number;life:number};
type Motion={id:ExpansionSkillId;start:THREE.Vector3;destination:THREE.Vector3;duration:number;age:number;timer:number;target?:Enemy;rank:number};
type Combo={id:ExpansionSkillId;remaining:number;timer:number;hand:number;target:Enemy;rank:number};
type BoneWall={ally:ClassSummon;release:()=>void;life:number};
const COLORS:Record<DamageType,number>={physical:0xc9c0ad,magic:0xb5e2d3,poison:0x89b33b,fire:0xf79c44,cold:0x91ceeb,lightning:0xc1dafa};
export const MARTIAL_CHARGES=['tigerStrike','cobraStrike','fistsOfFire','clawsOfThunder','bladesOfIce','phoenixStrike'] as const;
const FORM_MELEE=['feralRage','maul','rabies','fireClaws','hunger','fury'];
const CAST_DELAYS:Partial<Record<ExpansionSkillId,number>>={firestorm:.6,moltenBoulder:1,fissure:2,volcano:4,shockWeb:.6,bladeSentinel:1,shadowMaster:.6,shadowWarrior:.6};

export class ExpansionCombat {
  readonly combat:PaladinCombat;
  readonly owner:import('./model.ts').HeroState;
  readonly pets:ExpansionPets;
  missiles:Missile[]=[];
  fields:Field[]=[];
  traps:Trap[]=[];
  walls:BoneWall[]=[];
  motion?:Motion;
  combo?:Combo;
  pulse=0;
  private attackHand=0;
  charges:Partial<Record<typeof MARTIAL_CHARGES[number],{stacks:number;rank:number;remaining:number}>>={};
  control=new Map<Enemy,{kind:'attract'|'confuse';remaining:number}>();
  grim=new WeakMap<Enemy,{percent:number;remaining:number}>();
  constructor(combat:PaladinCombat){this.combat=combat;this.owner=combat.game.hero;this.pets=new ExpansionPets(combat);}
  get game(){return this.combat.game;}
  get moving(){return !!this.motion;}
  get jumpHeight(){const m=this.motion;return m&&m.id!=='whirlwind'?Math.sin(Math.min(1,m.age/m.duration)*Math.PI)*2.5:0;}
  get locked(){return !!this.motion||!!this.combo;}
  near(point:THREE.Vector3,radius:number){return this.game.enemies.filter(e=>this.combat.hostile(e)&&e.actor.group.position.distanceTo(point)<=radius&&clearShot(this.game.world.grid,point,e.actor.group.position));}
  reach(id:ActionId){const mode=expansionMode(id);return mode?['melee','chargeUp','finisher'].includes(mode)&&!['doubleThrow','dragonFlight'].includes(id)?2.6:14:undefined;}
  formAllows(id:ActionId){
    const h=this.game.hero;if(!h.buffs.wearwolf&&!h.buffs.wearbear)return true;
    return id==='attack'||['wearwolf','wearbear','armageddon','hurricane','cycloneArmor'].includes(id)||FORM_MELEE.includes(id)||id==='shockWave'||expansionMode(id)==='summon';
  }
  cast(id:ExpansionSkillId,aimed=false,triggered?:ItemCastTarget):boolean {
    const g=this.game,h=g.hero,c=this.combat,mode=expansionMode(id)!,s=stats(h),rank=castingSkillLevel(h,id,s.mods),v=skillValues(id,rank,h.skills);
    if(!rank||mode==='passive'||!triggered&&!this.formAllows(id))return false;
    if(id==='whirlwind'&&(!s.weapon||s.ranged&&!s.ranged.stack)){g.ui.toast('需要近战武器');return false;}
    if(!triggered&&this.motion)return false;
    const origin=g.position.clone(),point=(triggered?.point??(aimed?g.aim:g.target?.actor.group.position??g.aim)).clone().setY(0);
    const target=triggered?.target??(aimed?c.pointedEnemy():g.target&&c.hostile(g.target)?g.target:this.near(origin,14)[0]);
    const direction=point.clone().sub(origin).setY(0).normalize();if(!direction.lengthSq())direction.set(Math.sin(g.actor.group.rotation.y),0,Math.cos(g.actor.group.rotation.y));
    if(point.distanceTo(origin)>14&&mode!=='buff')point.copy(origin).addScaledVector(direction,14);
    const melee=['melee','chargeUp','finisher'].includes(mode);
    if(melee){
      if(!s.weapon||id!=='doubleThrow'&&s.ranged&&!s.ranged.stack){g.ui.toast('需要可用的近战武器');return false;}
      if(['doubleSwing','doubleThrow','frenzy','dragonClaw'].includes(id)&&!s.offhand){g.ui.toast('需要双持武器');return false;}
      if(['fistsOfFire','clawsOfThunder','bladesOfIce','dragonClaw'].includes(id)&&weaponType(s.weapon)!=='claw'||id==='dragonClaw'&&weaponType(s.offhand!)!=='claw'){g.ui.toast('需要爪类武器');return false;}
      if(id==='poisonDagger'&&weaponType(s.weapon)!=='dagger'){g.ui.toast('需要匕首');return false;}
      if(id==='doubleThrow'&&(!s.ranged?.stack||!stats(h,undefined,'shield').ranged?.stack)){g.ui.toast('需要两把投掷武器');return false;}
      if(FORM_MELEE.includes(id)&&(!h.buffs.wearwolf&&!h.buffs.wearbear)||['feralRage','rabies','fury'].includes(id)&&!h.buffs.wearwolf||id==='maul'&&!h.buffs.wearbear){g.ui.toast('需要对应的变形状态');return false;}
      if(!target||!c.hostile(target)||target.actor.group.position.distanceTo(origin)>(['doubleThrow','dragonFlight'].includes(id)?14:2.8)||!clearShot(g.world.grid,origin,target.actor.group.position))return false;
    }
    if(id==='shockWave'&&!h.buffs.wearbear){g.ui.toast('需要熊人形态');return false;}
    const corpse=mode==='corpse'?this.pets.corpse(point,4):undefined;
    if(mode==='corpse'&&(!corpse||id==='revive'&&(corpse.elite||corpse.champion))){g.ui.toast('需要可用的怪物尸体');return false;}
    const destination=['summon','trap','motion'].includes(mode)||id==='dragonFlight'?c.classes.destination(id==='dragonFlight'&&target?target.actor.group.position:point,mode==='motion'):undefined;
    if((['summon','trap','motion'].includes(mode)||id==='dragonFlight')&&!destination)return false;
    if(!['motion','buff'].includes(mode)&&!clearShot(g.world.grid,origin,point))return false;
    const metal=id==='ironGolem'?g.loot?.find(l=>l.item&&this.metalItem(l.item)&&l.mesh.position.distanceTo(point)<3):undefined;
    if(id==='ironGolem'&&!metal){g.ui.toast('需要地上的金属装备');return false;}
    const cost=castingSkillCost(h,id,v.cost);if(!triggered&&h.mana<cost){g.ui.toast('法力不足');return false;}
    if(!triggered){
      c.startAction(id,(melee||mode==='trap'?s.attackFrames:s.castFrames)/25);h.mana-=cost;g.monsterCombat?.castCost?.(cost);if(g.dead)return false;
      c.actionCooldowns[id]=Math.max(c.actionCooldowns[id]??0,CAST_DELAYS[id]??0);g.attackTime=1;g.actor.group.rotation.y=Math.atan2(direction.x,direction.z);
    }
    g.audio.play(melee?'swing':'spell',{nativeKey:`cast:${id}`});
    const snap=c.snapshot();
    if(mode==='buff'){
      if(id==='wearwolf'||id==='wearbear'){
        const reverting=!!h.buffs[id];delete h.buffs.wearwolf;delete h.buffs.wearbear;delete h.buffs.feralRage;delete h.buffs.maul;delete h.buffs.delirium;
        if(!reverting)h.buffs[id]={rank,remaining:v.duration+skillValues('shapeShifting',skillLevel(h,'shapeShifting')).duration};
      }else{
        if(id==='fade')delete h.buffs.burstOfSpeed;if(id==='burstOfSpeed')delete h.buffs.fade;
        h.buffs[id]={rank,remaining:v.duration,...(['boneArmor','cycloneArmor'].includes(id)?{absorb:v.percent}:{})};
        if(['shout','battleOrders','battleCommand'].includes(id))this.partyBuff(id,rank,v.duration);
      }
      clampResources(h);updateItemForm(g.actor,h.buffs,g.time);this.ring(origin,1.3,COLORS[v.type]);g.save(false);return true;
    }
    if(mode==='summon'||['raiseSkeleton','raiseSkeletalMage','revive'].includes(id)){
      if(!this.pets.summon(id,rank,destination??corpse!.actor.group.position.clone().setY(0),corpse,metal?.item))return false;
      if(corpse)this.consume(corpse);if(metal){g.disposeObject(metal.mesh);g.loot.splice(g.loot.indexOf(metal),1);}return true;
    }
    if(mode==='corpse'){
      const center=corpse!.actor.group.position.clone().setY(0);this.consume(corpse!);
      if(id==='corpseExplosion')this.explodeCorpse(corpse!,v,snap);
      else if(id==='poisonExplosion')this.field(id,center,{...v,duration:3},snap);
      else if(id==='grimWard')this.field(id,center,v,snap);
      else if(Math.random()*100<v.percent){
        if(id==='findItem')g.dropLoot?.(center,corpse!.elite?'elite':corpse!.champion?'champion':'monster',corpse!.level,undefined,true);
        else {const roll=Math.random(),kind=roll<.6?'health':roll<.9?'mana':'rejuvenation';const options=POTIONS.map((p,index)=>({...p,index})).filter(p=>p.kind===kind);const potion=options[Math.min(options.length-1,Math.floor(h.difficultyLevel*1.5+h.level/30))];if(potion&&h.potions[potion.index]<POTION_LIMIT){h.potions[potion.index]++;g.ui.floatText(`+1 ${potion.name}`,origin.clone().setY(2),'gold');}}
      }
      return true;
    }
    if(mode==='curse'){this.curse(id,rank,['howl','battleCry','cloakOfShadows'].includes(id)?origin:point);return true;}
    if(mode==='motion'){
      const distance=origin.distanceTo(destination!);if(id!=='whirlwind')g.body.collisionResponse=false;this.motion={id,rank,start:origin,destination:destination!,duration:Math.max(.35,distance/(id==='whirlwind'?7:12)),age:0,timer:0,target};g.path=[];return true;
    }
    if(mode==='trap'){
      if(this.traps.length>=5){const old=this.traps.shift()!;g.disposeObject(old.mesh);}
      const mesh=trapModel(id);mesh.position.copy(destination!);g.world.scene.add(mesh);this.traps.push({id,mesh,rank,values:v,snapshot:snap,shots:v.hits,timer:.3,life:120});return true;
    }
    if(melee){
      if(id==='dragonFlight'){g.position.copy(destination!);g.body.position.set(destination!.x,.5,destination!.z);g.path=[];this.pets.update(0);}
      if(id==='doubleThrow'){this.throwHand('weapon',id,direction);this.throwHand('shield',id,direction);return true;}
      this.strike(id,target!,rank,0);
      if(v.hits>1){this.combo={id,target:target!,rank,remaining:Math.min(8,v.hits)-1,timer:this.comboInterval(id),hand:1};c.actionCooldowns[id]=this.comboInterval(id)*Math.min(8,v.hits);}
      return true;
    }
    if(id==='boneWall'||id==='bonePrison'){this.boneWall(id,point,direction,v);return true;}
    if(id==='mindBlast'){
      for(const enemy of this.near(point,v.radius)){this.hit(enemy,id,v,snap);if(controllableMonster(enemy)){enemy.stunned=Math.max(enemy.stunned,v.duration);if(c.itemRandom()*100<v.percent)c.specialItems.convert(enemy,6+c.itemRandom()*4);}}this.ring(point,v.radius,0xb099d0);return true;
    }
    if(id==='psychicHammer'){if(target){this.hit(target,id,v,snap);c.knockback(target,1.4);}return true;}
    if(id==='fissure'){c.specialItems.cast(id,rank,point);return true;}
    if(['volcano','shockWeb','arcticBlast','firestorm'].includes(id)){
      this.field(id,['arcticBlast','firestorm'].includes(id)?origin:point,v,snap,direction);return true;
    }
    if(id==='poisonNova'||id==='warCry'||id==='shockWave'){
      for(const enemy of this.near(origin,v.radius)){if(id==='shockWave'&&enemy.actor.group.position.clone().sub(origin).normalize().dot(direction)<.5)continue;this.hit(enemy,id,v,snap);if(id!=='poisonNova'&&!enemy.boss)enemy.stunned=Math.max(enemy.stunned,v.duration);}
      this.ring(origin,v.radius,COLORS[v.type]);return true;
    }
    const shared=id==='teeth'?new Set<number>():undefined,count=['teeth','twister'].includes(id)?v.hits:1;
    for(let i=0;i<count;i++){const dir=direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(i-(count-1)/2)*(id==='teeth'?.07:.2));this.projectile(id,origin,dir,v,snap,target,shared);}
    return true;
  }
  metalItem(item:Item){return ['weapon','armor','helm','shield'].includes(item.slot)&&!['bow','crossbow','staff','wand','orb'].includes(weaponType(item)??'')&&!['cap','qui','lea','buc','lrg','sml'].includes(item.baseCode??'');}
  consume(corpse:Enemy){corpse.redeemed=true;corpse.actor.group.visible=false;}
  explodeCorpse(corpse:Enemy,v:SkillValues,snapshot:AttackSnapshot){
    const base=corpse.maxHp/(1+.5*((corpse.playerCount??1)-1)),amount=base*(v.percent+Math.random()*(v.secondary-v.percent))/200,point=corpse.actor.group.position.clone().setY(0);
    for(const enemy of this.near(point,v.radius)){this.combat.damage(enemy,amount,'physical',false,false,snapshot);this.combat.damage(enemy,amount,'fire',false,false,snapshot);}this.ring(point,v.radius,0xe8a17a);
  }
  partyBuff(id:ExpansionSkillId,rank:number,duration:number){
    const g=this.game;for(const pet of this.pets.pets)if(pet.actor.group.position.distanceTo(g.position)<20)pet.buffs[id]={rank,remaining:duration};
    if(g.hero.mercenary?.status==='alive'&&(!g.mercenary?.ally||g.mercenary.ally.actor.group.position.distanceTo(g.position)<20)){g.hero.mercenary.buffs??={};g.hero.mercenary.buffs[id]={rank,remaining:duration};}
  }
  curse(id:ExpansionSkillId,rank:number,point:THREE.Vector3){
    const g=this.game,c=this.combat,v=skillValues(id,rank,g.hero.skills),targets=this.near(point,v.radius);
    for(const enemy of id==='attract'||id==='taunt'?targets.sort((a,b)=>a.actor.group.position.distanceToSquared(point)-b.actor.group.position.distanceToSquared(point)).slice(0,1):targets){
      if(enemy.champion?.id==='possessed'||this.control.get(enemy)?.kind==='attract')continue;
      if(['attract','confuse','terror','dimVision','taunt','howl'].includes(id)&&!controllableMonster(enemy))continue;
      if(id==='howl'&&g.hero.level+rank+1<=enemy.level)continue;
      c.itemCurses.delete(enemy);this.control.delete(enemy);c.specialItems.taunts.delete(enemy);enemy.blind=0;enemy.flee=0;
      if(id==='attract'||id==='confuse')this.control.set(enemy,{kind:id,remaining:v.duration});
      else if(id==='terror'||id==='howl')enemy.flee=v.duration;
      else if(id==='dimVision'||id==='cloakOfShadows'){if(!enemy.boss)enemy.blind=v.duration;if(id==='cloakOfShadows')c.itemCurses.set(enemy,{kind:'battleCry',rank,remaining:v.duration});}
      else if(id==='taunt')c.specialItems.taunts.set(enemy,v.percent);
      else c.itemCurses.set(enemy,{kind:id==='amplifyDamage'?'amplify':id as ItemCurse,rank,remaining:v.duration});
      g.monsterCombat?.cancel(enemy);enemy.path=[];
    }
    if(id==='cloakOfShadows'){g.hero.buffs.cloakOfShadows={rank,remaining:v.duration};c.actionCooldowns[id]=v.duration;}
    this.ring(point,v.radius,0xa694a9);
  }
  target(enemy:Enemy):ClassSummon|undefined {
    const confused=this.control.get(enemy)?.kind==='confuse';
    const candidates=[...this.control].filter(([target,control])=>target!==enemy&&!target.dead&&control.kind==='attract').map(([target])=>target);
    const target=(confused?this.game.enemies.filter(target=>target!==enemy&&!target.dead):candidates).filter(target=>target.actor.group.position.distanceTo(enemy.actor.group.position)<10&&clearShot(this.game.world.grid,enemy.actor.group.position,target.actor.group.position)).sort((a,b)=>a.actor.group.position.distanceToSquared(enemy.actor.group.position)-b.actor.group.position.distanceToSquared(enemy.actor.group.position))[0];
    if(!target)return undefined;
    return {id:'valkyrie',enemyTarget:target,actor:target.actor,get hp(){return target.dead?0:target.hp;},set hp(v){target.hp=v;},maxHp:target.maxHp,life:1,timer:0,rank:1,snapshot:this.combat.snapshot(),path:[],rethink:0};
  }
  hit(enemy:Enemy,id:ExpansionSkillId,v:SkillValues,snapshot:AttackSnapshot,factor=1){
    const c=this.combat,amount=(v.min+Math.random()*(v.max-v.min))*factor;
    if(v.type==='poison'){
      const lower=c.itemCurses.get(enemy),reduction=lower?.kind==='lowerResist'?skillValues('lowerResist',lower.rank??1).percent:0;
      const resistance=enemy.resistances.poison-reduction/(enemy.resistances.poison>=100?5:1);
      const duration=id==='venom'?.4:Math.max(.4,v.duration),dps=itemDamage(amount/duration,'poison',snapshot.stats.mods,resistance);
      if(dps>0&&(!enemy.poison||enemy.poison.dps<=dps))enemy.poison={dps,remaining:duration,snapshot};
    }else{const dealt=c.damage(enemy,amount,v.type,false,false,snapshot,true);if(dealt&&v.type==='cold')enemy.coldTime=Math.max(enemy.coldTime,2);}
    if(v.physicalMax)c.damage(enemy,((v.physicalMin??0)+Math.random()*(v.physicalMax-(v.physicalMin??0)))*factor,'physical',false,false,snapshot);
    if(id==='twister'&&!enemy.boss)enemy.stunned=Math.max(enemy.stunned,v.duration);
    if(id==='moltenBoulder')c.knockback(enemy,.5,snapshot.origin);
  }
  ring(point:THREE.Vector3,radius:number,color:number){const mesh=makeRing(Math.max(.2,radius),color,.7);mesh.position.copy(point).setY(.15);this.game.world.scene.add(mesh);this.game.effects.push({mesh,life:.25,duration:.25,type:'ring'});}
  projectile(id:ExpansionSkillId,origin:THREE.Vector3,direction:THREE.Vector3,values:SkillValues,snapshot:AttackSnapshot,target?:Enemy,shared?:Set<number>){
    if(this.missiles.length>=160){const oldest=this.missiles.shift()!;this.game.disposeObject(oldest.mesh);}
    const material=new THREE.MeshBasicMaterial({color:COLORS[values.type],transparent:true,opacity:.9}),geometry=id==='boneSpear'?new THREE.ConeGeometry(.10,1.3,6):id==='moltenBoulder'?new THREE.DodecahedronGeometry(.5):new THREE.OctahedronGeometry(id==='tornado'?.3:.14);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(origin).setY(.8);if(id==='boneSpear')mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);this.game.world.scene.add(mesh);
    this.missiles.push({id,mesh,direction:direction.clone(),origin:origin.clone(),values:{...values},snapshot,target,life:id==='bladeSentinel'?values.duration:2,age:0,hit:new Set(),speed:id==='boneSpirit'?9:id==='moltenBoulder'?7:id==='tornado'?9:18,shared});
  }
  field(id:ExpansionSkillId,point:THREE.Vector3,values:SkillValues,snapshot:AttackSnapshot,direction?:THREE.Vector3,delay=0){
    if(this.fields.length>=48){const old=this.fields.shift()!;this.game.disposeObject(old.mesh);}
    const mesh=makeRing(values.radius||3,COLORS[values.type],.45);mesh.position.copy(point).setY(.08);this.game.world.scene.add(mesh);this.fields.push({id,mesh,point:point.clone(),direction:direction?.clone(),values:{...values},snapshot,life:values.duration||3,timer:0,delay});
  }
  nextAttackHand():'weapon'|'shield'{return this.game.hero.equipment.shield?.slot==='weapon'&&this.attackHand++%2?'shield':'weapon';}
  handSnapshot(hand:'weapon'|'shield'){const snap=this.combat.snapshot();snap.stats=stats(this.game.hero,undefined,hand);const other=this.game.hero.equipment[hand==='weapon'?'shield':'weapon'];snap.items=snap.items.filter(item=>item.id!==other?.id||other.slot!=='weapon');return snap;}
  throwHand(hand:'weapon'|'shield',id:ExpansionSkillId,direction:THREE.Vector3){
    const snap=this.handSnapshot(hand),v=skillValues(id,castingSkillLevel(this.game.hero,id),this.game.hero.skills);this.projectile(id,this.game.position,direction,{...v,radius:.35},snap);this.missiles.at(-1)!.weapon=true;
  }
  comboInterval(id:ExpansionSkillId){return Math.max(id==='fury'?.12:.16,stats(this.game.hero).attackFrames/25*(id==='dragonTalon'?.25:.5));}
  strike(id:ExpansionSkillId,enemy:Enemy,rank:number,index:number){
    const c=this.combat,g=this.game,h=g.hero,v=skillValues(id,rank,h.skills),mode=expansionMode(id),hand=['doubleSwing','frenzy','dragonClaw'].includes(id)&&index%2?'shield':'weapon',snapshot=this.handSnapshot(hand);
    const kicking=['dragonTalon','dragonTail','dragonFlight'].includes(id),finishing=mode==='finisher';
    let tiger=0;const tigerCharge=this.charges.tigerStrike;if(finishing&&tigerCharge)tiger=skillValues('tigerStrike',tigerCharge.rank).percent*tigerCharge.stacks;
    if(kicking){const boots=Object.values(h.equipment).find(i=>i?.slot==='boots')??undefined,[min,max]=kickBaseDamage(snapshot.stats.strength,snapshot.stats.dexterity,boots,v.damage+tiger);snapshot.stats.weaponMin=min;snapshot.stats.weaponMax=max;snapshot.stats.damageBonus=0;snapshot.stats.criticalStrike=0;snapshot.stats.mods.deadlyStrike=0;snapshot.stats.mods.minDamage=0;snapshot.stats.mods.maxDamage=0;}
    else snapshot.stats.damageBonus+=tiger;
    if(id==='hunger'){snapshot.stats.mods.lifeSteal=(snapshot.stats.mods.lifeSteal??0)+v.percent;snapshot.stats.mods.manaSteal=(snapshot.stats.mods.manaSteal??0)+v.percent;}
    snapshot.skillRanks={...snapshot.skillRanks,[id]:rank};
    const before=enemy.hp,hit=c.weaponHit(enemy,id,undefined,snapshot,finishing&&Object.values(this.charges).some(Boolean),kicking);
    playHeroAction(g.actor,kicking?'kick':'swing',g.time,this.comboInterval(id));
    if(!hit)return;
    if(mode==='chargeUp'){
      const key=id as typeof MARTIAL_CHARGES[number];this.charges[key]={stacks:Math.min(3,(this.charges[key]?.stacks??0)+1),rank,remaining:15};this.ring(g.position,.65,0xe9b767);
    }else if(finishing){this.finish(enemy,snapshot,Math.max(0,before-enemy.hp));}
    if(id==='dragonTail'){const amount=Math.max(0,before-enemy.hp)*v.percent/100;for(const target of this.near(enemy.actor.group.position,v.radius))c.damage(target,amount,'fire',false,false,snapshot);}
    if(['fireClaws','rabies','poisonDagger'].includes(id))this.hit(enemy,id,v,snapshot);
    if(id==='rabies')for(const target of this.near(enemy.actor.group.position,3))this.hit(target,id,v,snapshot);
    if(['frenzy','feralRage','maul'].includes(id))h.buffs[id]={rank,remaining:v.duration,stacks:Math.min(id==='frenzy'?5:v.hits,(h.buffs[id]?.stacks??0)+1)};
    if(id==='berserk'||id==='concentrate')h.buffs[id]={rank,remaining:v.duration};
    if(id==='stun'||id==='maul')if(!enemy.boss)enemy.stunned=Math.max(enemy.stunned,id==='stun'?v.duration:v.percent);
    if(id==='bash')c.knockback(enemy,1.1);
  }
  finish(enemy:Enemy,snapshot:AttackSnapshot,physical:number){
    const g=this.game,h=g.hero,c=this.combat,point=enemy.actor.group.position.clone().setY(0),preserve=Math.random()*100<Math.min(100,snapshot.stats.mods.preserveCharges??0);
    for(const id of MARTIAL_CHARGES){const charge=this.charges[id];if(!charge)continue;const v=skillValues(id,charge.rank,h.skills),count=charge.stacks;
      if(id==='cobraStrike'){const amount=physical*v.percent/100*(count===3?2:1)*leechEffectiveness(enemy,snapshot.difficulty);h.hp=Math.min(stats(h).maxHp,h.hp+amount);if(count>=2)h.mana=Math.min(stats(h).maxMana,h.mana+amount);}
      if(['fistsOfFire','clawsOfThunder','bladesOfIce'].includes(id)){
        const targets=count>=2?this.near(point,count===3?5:3):[enemy];for(const target of targets){this.hit(target,id,v,snapshot);if(id==='bladesOfIce'&&count===3&&!target.boss)target.stunned=Math.max(target.stunned,2);}
        if(id==='fistsOfFire'&&count===3)this.field(id,point,{...v,duration:3,radius:3,min:v.min/3,max:v.max/3},snapshot);
        if(id==='clawsOfThunder'&&count===3)for(let i=0;i<8;i++)this.projectile(id,point,new THREE.Vector3(Math.sin(i*Math.PI/4),0,Math.cos(i*Math.PI/4)),v,snapshot);
      }
      if(id==='phoenixStrike'){
        const n=charge.rank-1;
        if(count===1)this.field(id,point,{...v,type:'fire',min:(20+15*n)*(1+.1*h.skills.fistsOfFire),max:(40+20*n)*(1+.1*h.skills.fistsOfFire),duration:.3,radius:3},snapshot,undefined,.7);
        else if(count===2){let previous=point;for(const target of this.near(point,10).slice(0,12)){g.beam(previous.clone().setY(1),target.actor.group.position.clone().setY(1));c.damage(target,(1+Math.random()*(40+25*n))*(1+.13*h.skills.clawsOfThunder),'lightning',false,false,snapshot);previous=target.actor.group.position;}}
        else for(let i=0;i<12;i++)this.projectile(id,point,new THREE.Vector3(Math.sin(i*Math.PI/6),0,Math.cos(i*Math.PI/6)),{...v,type:'cold',min:(16+10*n)*(1+.1*h.skills.bladesOfIce),max:(32+12*n)*(1+.1*h.skills.bladesOfIce)},snapshot);
      }
      if(preserve)charge.remaining=15;else if(--charge.stacks<=0)delete this.charges[id];
    }
  }
  boneWall(id:ExpansionSkillId,point:THREE.Vector3,direction:THREE.Vector3,v:SkillValues){
    const g=this.game;for(let i=0;i<(id==='boneWall'?5:8);i++){
      const position=id==='boneWall'?point.clone().add(new THREE.Vector3(direction.z,0,-direction.x).multiplyScalar(i-2)):point.clone().add(new THREE.Vector3(Math.sin(i*Math.PI/4)*2,0,Math.cos(i*Math.PI/4)*2));position.x=Math.round(position.x);position.z=Math.round(position.z);
      if(!gridWalkable(g.world.grid,position)||position.distanceTo(g.position)<1||this.walls.some(w=>w.ally.actor.group.position.distanceTo(position)<.5))continue;
      const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0xd0c6a9});for(let j=0;j<3;j++){const bone=new THREE.Mesh(new THREE.CylinderGeometry(.06,.13,1.7+j*.12,5),material);bone.position.set((j-1)*.27,.85,0);bone.rotation.z=(j-1)*.12;group.add(bone);}group.position.copy(position);g.world.scene.add(group);
      const limb=()=>new THREE.Group(),actor={group,leftArm:limb(),rightArm:limb(),leftLeg:limb(),rightLeg:limb(),kind:'boneWall'};
      const ally:ClassSummon={id:'valkyrie',boneWall:true,actor,hp:v.healing,maxHp:v.healing,life:v.duration,timer:0,rank:1,snapshot:this.combat.snapshot(),path:[],rethink:0};
      const release=g.world.temporaryCollider?.(position.x,position.z,.85,.85)??(()=>{});this.walls.push({ally,release,life:v.duration});
    }
  }
  update(dt:number){
    const g=this.game,c=this.combat,h=g.hero;
    for(const id of MARTIAL_CHARGES){const charge=this.charges[id];if(charge&&(charge.remaining-=dt)<=0)delete this.charges[id];}
    for(const [enemy,control] of this.control)if(enemy.dead||(control.remaining-=dt)<=0)this.control.delete(enemy);
    for(const enemy of g.enemies){const debuff=this.grim.get(enemy);if(debuff&&(debuff.remaining-=dt)<=0)this.grim.delete(enemy);}
    this.pets.update(dt);
    for(let i=this.walls.length-1;i>=0;i--){const wall=this.walls[i];wall.life-=dt;if(wall.life<=0||wall.ally.hp<=0){wall.release();g.disposeObject(wall.ally.actor.group);this.walls.splice(i,1);}}
    if(this.combo){const combo=this.combo;combo.timer-=dt;if(combo.timer<=0){let target=combo.target;if(!c.hostile(target))target=this.near(g.position,2.8)[0];if(!target||target.actor.group.position.distanceTo(g.position)>2.8)this.combo=undefined;else{this.strike(combo.id,target,combo.rank,combo.hand++);combo.timer+=this.comboInterval(combo.id);if(--combo.remaining<=0)this.combo=undefined;}}}
    if(this.motion){const m=this.motion;m.age+=dt;m.timer-=dt;const t=Math.min(1,m.age/m.duration),next=m.start.clone().lerp(m.destination,t);
      if(m.id==='whirlwind'&&!clearShot(g.world.grid,g.position,next)){this.motion=undefined;}else{g.position.copy(next);g.body.position.set(next.x,.5,next.z);g.actor.group.position.copy(next);g.path=[];if(m.id==='whirlwind'){g.actor.group.rotation.y+=dt*17;if(m.timer<=0){for(const hand of ['weapon','shield'] as const){if(hand==='shield'&&!stats(h).offhand)continue;const target=this.near(next,2.6)[0];if(target)c.weaponHit(target,'whirlwind',undefined,this.handSnapshot(hand));}m.timer+=Math.max(.16,stats(h).attackFrames/25*.4);}}else g.actor.group.position.y=Math.sin(t*Math.PI)*2.5;
        if(t>=1){const v=skillValues(m.id,m.rank,h.skills);if(m.id!=='whirlwind'){for(const enemy of this.near(next,m.id==='leapAttack'?4.6:v.secondary)){if(m.id==='leapAttack')this.hit(enemy,m.id,v,c.snapshot());c.knockback(enemy,1.5);}if(m.id==='leapAttack'&&m.target&&c.hostile(m.target)&&m.target.actor.group.position.distanceTo(next)<3)c.weaponHit(m.target,m.id);this.ring(next,3,0xceb08b);}g.actor.group.position.y=0;g.body.collisionResponse=true;this.motion=undefined;}}
    }
    for(let i=this.missiles.length-1;i>=0;i--){const m=this.missiles[i];m.life-=dt;m.age+=dt;
      if(m.id==='boneSpirit'&&m.target&&!m.target.dead)m.direction.copy(m.target.actor.group.position).setY(.8).sub(m.mesh.position).normalize();
      if(m.id==='bladeSentinel'&&m.age>.6){m.returning=!m.returning;m.age=0;m.direction.negate();m.hit.clear();}
      if(m.id==='tornado')m.direction.applyAxisAngle(new THREE.Vector3(0,1,0),Math.sin(m.age*12)*dt*.6);
      const previous=m.mesh.position.clone(),next=previous.clone().addScaledVector(m.direction,m.speed*dt);m.mesh.position.copy(next);m.mesh.rotation.z+=dt*9;
      if(!clearShot(g.world.grid,previous,next))m.life=0;
      const line=new THREE.Line3(previous,next);
      if(m.life>0)for(const enemy of g.enemies){if(!c.hostile(enemy)||m.hit.has(enemy.id)||m.shared?.has(enemy.id))continue;const center=enemy.actor.group.position.clone().setY(.8);if(line.closestPointToPoint(center,true,new THREE.Vector3()).distanceTo(center)>(enemy.boss?1:.6)+(m.id==='moltenBoulder'?.5:0))continue;
        m.hit.add(enemy.id);m.shared?.add(enemy.id);
        if(m.weapon){const projectile={snapshot:m.snapshot,magicArrow:0} as Projectile;c.weaponHit(enemy,m.id,projectile);}
        else{if(m.id==='bladeFury'||m.id==='bladeSentinel'){const fraction=m.snapshot.stats.weapon?.twoHanded?.375:.75;c.damage(enemy,m.snapshot.stats.attack*fraction,'physical',false,false,m.snapshot);}this.hit(enemy,m.id,m.values,m.snapshot);}
        if(m.id==='fireBlast')for(const target of this.near(enemy.actor.group.position,m.values.radius))if(target!==enemy)this.hit(target,m.id,m.values,m.snapshot);
        if(!['boneSpear','tornado','twister','moltenBoulder','bladeSentinel','lightningSentry'].includes(m.id)&&(!m.weapon||Math.random()*100>=(m.snapshot.stats.mods.pierceChance??0))){m.life=0;break;}
      }
      if(m.life<=0){if(m.id==='fireBlast'&&!m.hit.size){const point=m.target?.actor.group.position??next;for(const enemy of this.near(point,m.values.radius))this.hit(enemy,m.id,m.values,m.snapshot);}g.disposeObject(m.mesh);this.missiles.splice(i,1);}
    }
    for(let i=this.fields.length-1;i>=0;i--){const f=this.fields[i];if(f.delay>0){f.delay-=dt;continue;}f.life-=dt;f.timer-=dt;f.mesh.rotation.z+=dt*.3;
      if(f.timer<=0){f.timer=.25;const v=f.values;
        for(const enemy of this.near(f.point,v.radius)){
          if(f.direction&&['firestorm','arcticBlast'].includes(f.id)&&enemy.actor.group.position.clone().sub(f.point).normalize().dot(f.direction)<.65)continue;
          if(f.id==='grimWard'){if(controllableMonster(enemy)){enemy.flee=Math.max(enemy.flee??0,.5);enemy.slow={percent:v.secondary,remaining:.5};this.grim.set(enemy,{percent:v.percent,remaining:.5});}}
          else this.hit(enemy,f.id,v,f.snapshot,['fissure','volcano'].includes(f.id)?.5:v.type==='poison'?1:.25);
        }
      }
      if(f.life<=0){g.disposeObject(f.mesh);this.fields.splice(i,1);}
    }
    for(let i=this.traps.length-1;i>=0;i--){const trap=this.traps[i];trap.timer-=dt;trap.life-=dt;const point=trap.mesh.position;
      if(trap.timer<=0){const v=trap.values,target=this.near(point,v.radius)[0],corpse=trap.id==='deathSentry'?this.pets.corpse(point,10):undefined;
        if(corpse){this.consume(corpse);this.explodeCorpse(corpse,{...v,radius:3+trap.rank*.2},trap.snapshot);trap.shots--;trap.timer=1.2;}
        else if(target){const direction=target.actor.group.position.clone().sub(point).normalize();trap.mesh.rotation.y=Math.atan2(direction.x,direction.z);
          if(trap.id==='wakeOfFire'||trap.id==='wakeOfInferno')for(const enemy of this.near(point,v.radius)){if(enemy.actor.group.position.clone().sub(point).normalize().dot(direction)>.65)this.hit(enemy,trap.id,v,trap.snapshot,trap.id==='wakeOfInferno'?.6:1);}else{const count=trap.id==='chargedBoltSentry'?v.secondary:1;for(let j=0;j<count;j++)this.projectile(trap.id,point,direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(j-(count-1)/2)*.12),v,trap.snapshot,target);}
          trap.shots--;trap.timer=trap.id==='wakeOfInferno'?.6:1.2;
        }
      }
      if(trap.shots<=0||trap.life<=0){g.disposeObject(trap.mesh);this.traps.splice(i,1);}
    }
    this.pulse-=dt;if(this.pulse<=0){this.pulse=.5;for(const id of ['hurricane','armageddon','bladeShield'] as const){const buff=h.buffs[id];if(!buff)continue;const v=skillValues(id,buff.rank,h.skills),snap=c.snapshot();
      if(id==='armageddon'){const target=this.near(g.position,v.radius)[0];if(target)this.field(id,target.actor.group.position.clone().setY(0),{...v,duration:.3,radius:2},snap,undefined,.4);}
      else{for(const enemy of this.near(g.position,v.radius)){this.hit(enemy,id,v,snap,.5);if(id==='bladeShield')c.damage(enemy,snap.stats.attack*.375,'physical',false,false,snap);}this.ring(g.position,v.radius,COLORS[v.type]);}
    }}
  }
  clear(){this.pets.clear();for(const m of this.missiles)this.game.disposeObject(m.mesh);for(const f of this.fields)this.game.disposeObject(f.mesh);for(const t of this.traps)this.game.disposeObject(t.mesh);for(const w of this.walls){w.release();this.game.disposeObject(w.ally.actor.group);}this.missiles=[];this.fields=[];this.traps=[];this.walls=[];this.motion=undefined;this.combo=undefined;this.charges={};this.control.clear();this.game.actor.group.position.y=0;this.game.body.collisionResponse=true;}
}
