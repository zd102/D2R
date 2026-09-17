import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PaladinCombat } from '../src/combat.ts';
import { MonsterCombat } from '../src/monster-combat.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';
import { stats, skillLevel, swapWeapons } from '../src/model.ts';
import { skillValues } from '../src/paladin.ts';
import { expansionMode } from '../src/expansion-skills.ts';
import { classSkillMode } from '../src/class-skills.ts';
import { monsterStats } from '../src/balance.ts';
import { BOSSES, ENCOUNTERS, MONSTERS } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { POTIONS, potionIndex, potionTier, useRecoveryPotion } from '../src/potions.ts';
import { BASES, makeItem, RUNEWORDS, socketItem } from '../src/items.ts';
import { activeMercenaryEquipment, mercenaryStats, feedMercenaryPotion } from '../src/mercenary.ts';
import { applyMonsterAffixes, rollMonsterAffixes, SUPER_UNIQUE_AFFIXES, SUPER_UNIQUE_AURAS } from '../src/monster-affixes.ts';
import { auditHero } from './class-audit-builds.mjs';

const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const actor=kind=>{const group=new THREE.Group(),limbs=Array.from({length:4},()=>new THREE.Group());group.add(...limbs);return {group,kind,leftArm:limbs[0],rightArm:limbs[1],leftLeg:limbs[2],rightLeg:limbs[3]};};
const round=n=>Math.round(n*10)/10;

// An openly documented arena, not an accelerated damage formula: actual cast
// costs/cadence, missiles, monster AI, summons, curses, durability and potion queues.
export function auditEncounter(build,stage,{kind='pack',seed=239,poor=false,mercenary=false,coldStart=false,stationary=false,affixes=false,mosaic=false,combatGear=false,white=false,charged=false,seconds:limit=kind==='pack'?90:180,hero:providedHero, encounters, cta=false, rejuvs=0, mercPotions=0}={}){
  const {hero:built,primary}=auditHero(build,stage,{poor,mosaic,combatGear,white}),h=providedHero?structuredClone(providedHero):built; let area=encounters?.[0]?.area??LEVELS[stage.index];
  h.campaign.kills=area.quest.count;h.campaign.objects=Array.from({length:area.quest.count},(_,i)=>i);
  const random=Math.random;Math.random=rng(seed);const scene=new THREE.Scene(),enemies=[],casts={},potions=[0,0];let nextId=1,phase='prepare',firstKill=null,minLife=1,incoming=0,blockedCasts=0,damageDealt=0;
  const dispose=object=>{object.traverse(node=>{if(node.isMesh||node.isPoints||node.isLine){node.geometry?.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])m?.dispose();}});object.removeFromParent();};
  const game={hero:h,enemies,get level(){return area;},get specialArea(){return area.special;},world:{scene,grid:{width:513,height:513,isWalkableAt:(x,z)=>x>=0&&z>=0&&x<513&&z<513},path:(_from,to)=>[to.clone()],canWalk:()=>true},time:0,started:true,paused:false,dead:false,inCamp:false,invincible:0,position:new THREE.Vector3(),aim:new THREE.Vector3(0,0,6),actor:actor('hero'),body:new CANNON.Body({mass:1}),path:[],effects:[],loot:[],attackTime:0,cooldowns:{attack:0,cleave:0,ward:0,nova:0,dash:0,bolt:0},audio:{play(){}},ui:{floatText(){},toast(){},flashDamage(){},openPanel(){}},burst(){},beam(){},save(){},begin(){},releaseInput(){},disposeObject:dispose,dropLoot(){},
    nearestEnemy(range){return enemies.filter(e=>game.combat.hostile(e)&&e.actor.group.position.distanceTo(game.position)<range).sort((a,b)=>a.actor.group.position.distanceToSquared(game.position)-b.actor.group.position.distanceToSquared(game.position))[0];},
    killEnemy(e,rewardMods,mercenaryKill=false){if(e.dead)return;e.dead=true;e.hp=0;game.monsterCombat.cancel(e);game.monsterCombat.onDeath(e);if(e.summoned)e.redeemed=true;const s=stats(h),mods=rewardMods??s.mods;if(!mercenaryKill){h.mana=Math.min(s.maxMana,h.mana+(mods.manaOnKill??0));h.hp=Math.min(s.maxHp,h.hp+(mods.lifeOnKill??0)+(e.definition.race==='demon'?mods.lifeOnDemonKill??0:0));}if(phase==='fight'&&firstKill===null&&!e.summoned)firstKill=game.time;},
  };
  const spawn=(x,z,kind='skeleton',definition,boss=false,elite=false)=>{
    definition??=MONSTERS[kind]??MONSTERS.skeleton;const a=actor(definition.id),body=new CANNON.Body({mass:1}),tuning=monsterStats(definition,area,stage.difficulty,boss,elite,1);a.group.position.set(x,0,z);body.position.set(x,.5,z);scene.add(a.group);
    const superUnique=boss&&!area.actBoss&&!area.special;
    const rolled=affixes&&(elite||superUnique)?rollMonsterAffixes(stage.difficulty,rng(seed+71),definition.speed>0,definition,superUnique?SUPER_UNIQUE_AFFIXES[definition.id]??['extraStrong']:[],SUPER_UNIQUE_AURAS[definition.id]):[];
    const adjusted=applyMonsterAffixes({...tuning,speed:definition.speed*(elite?1.1:1)},rolled);
    const e={id:nextId++,playerCount:1,name:definition.name,definition,actor:a,body,...(affixes?adjusted:tuning),hp:tuning.maxHp,boss,elite,affixes:rolled,dead:false,active:true,kind:boss?'boss':definition.race==='undead'?'skeleton':'demon',speed:affixes?adjusted.speed:definition.speed,cooldown:1,attackTime:0,path:[],rethink:0,stunned:0,coldTime:0,converted:0,bleed:0,redeemed:false};enemies.push(e);return e;
  };game.spawnEnemy=spawn;
  const c=game.combat=new PaladinCombat(game),m=game.monsterCombat=new MonsterCombat(game);game.mercenary=new MercenaryCombat(game);scene.add(game.actor.group);c.itemRandom=rng(seed+1);
  const originalDamage=c.damage.bind(c);c.damage=(e,...args)=>{const before=e.hp,result=originalDamage(e,...args);if(phase==='fight')damageDealt+=Math.max(0,before-Math.max(0,e.hp));return result;};
  const originalHurt=c.hurt.bind(c);c.hurt=(...args)=>{const before=h.hp,result=originalHurt(...args);if(phase==='fight'){incoming+=Math.max(0,before-h.hp);minLife=Math.min(minLife,h.hp/stats(h).maxHp);}return result;};
  const dt=.04;
  const tick=(fighting=true)=>{
    game.time+=dt;game.invincible=Math.max(0,game.invincible-dt);game.mercenary.update(dt);c.update(dt);if(fighting&&!game.dead)m.update(dt);
    for(const e of enemies)if(!e.dead){e.body.position.x+=e.body.velocity.x*dt;e.body.position.z+=e.body.velocity.z*dt;e.actor.group.position.set(e.body.position.x,0,e.body.position.z);}
    game.actor.group.position.copy(game.position);for(const effect of game.effects)dispose(effect.mesh);game.effects=[];
  };
  const cast=id=>{if(id!=='attack'&&!skillLevel(h,id))return false;const result=c.castAction(id);if(phase==='fight'){if(result)casts[id]=(casts[id]??0)+1;else blockedCasts++;}return result;};
  const buffs=[...(build.form?[build.form]:[]),...(h.classId==='paladin'?['holyShield']:h.classId==='barbarian'?['battleCommand','battleOrders','shout']:h.classId==='sorceress'?['frozenArmor','thunderStorm']:h.classId==='necromancer'?['boneArmor']:h.classId==='assassin'?[stage.difficulty?'fade':'burstOfSpeed','venom']:h.classId==='druid'?['cycloneArmor','hurricane']:[])].filter(id=>skillLevel(h,id));
  const prep=id=>{const v=skillValues(id,skillLevel(h,id),h.skills);h.mana=Math.max(h.mana,v.cost);c.actionCooldowns={};c.lock=0;game.aim.set(0,0,2.5);cast(id);for(let i=0;i<Math.ceil(Math.max(.6,c.lock)/dt);i++)tick(false);};
  const pets=[...(build.pets??[])];
  // Warcry/summon support is prepared before the fight, with its setup cost
  // recorded separately. No corpses appear during a boss encounter for free.
  let preparationMana=0;
  try{
    if(cta && h.classId !== 'barbarian'){swapWeapons(h);for(const id of ['battleCommand','battleOrders']){if(!skillLevel(h,id))throw Error(`CTA missing ${id}`);preparationMana+=skillValues(id,skillLevel(h,id),h.skills).cost;prep(id);}swapWeapons(h);}
    if(!coldStart){
      for(const id of buffs){preparationMana+=skillValues(id,skillLevel(h,id),h.skills).cost;prep(id);}
      for(const id of pets)if(skillLevel(h,id)){
        const count=Math.min(24,skillValues(id,skillLevel(h,id),h.skills).hits);
        for(let n=0;n<count;n++){
          if(['raiseSkeleton','raiseSkeletalMage','revive'].includes(id)){const corpse=spawn(0,2.5);corpse.dead=true;corpse.hp=0;}
          preparationMana+=skillValues(id,skillLevel(h,id),h.skills).cost;prep(id);
        }
      }
    }
    if(charged&&mosaic){const dummy=spawn(0,2.5);dummy.hp=dummy.maxHp=1e8;game.target=dummy;
      for(const id of ['clawsOfThunder','bladesOfIce','cobraStrike','tigerStrike',primary])if(skillLevel(h,id)){const desired=id==='phoenixStrike'?2:3;let attempts=0;while((c.expansion.charges[id]?.stacks??0)<desired&&attempts++<30){preparationMana+=skillValues(id,skillLevel(h,id),h.skills).cost;prep(id);}if((c.expansion.charges[id]?.stacks??0)!==desired)throw Error(`Cannot prepare charge ${id}`);}
      dummy.dead=true;game.target=undefined;
    }
    // Travelling/resting restores resources before an encounter, for every build.
    const prepared=stats(h);h.hp=prepared.maxHp;h.mana=prepared.maxMana;h.stamina=prepared.maxStamina;h.potionRecovery=[];c.actionCooldowns={};c.lock=0;
    for(const corpse of enemies.filter(e=>e.dead)){dispose(corpse.actor.group);enemies.splice(enemies.indexOf(corpse),1);}
    if(mercenary&&stage.difficulty>=1&&!h.mercenary){
      const weapon=makeItem(BASES.find(b=>b.baseCode===(stage.level>=70?'7s8':'9vo')));const recipe=RUNEWORDS.find(w=>w.name==='眼光');weapon.sockets=4;for(const rune of recipe.runes)socketItem(weapon,rune,()=>.5);
      h.mercenary={status:'alive',hp:1,aura:'might',equipment:{weapon,armor:{...structuredClone(h.equipment.armor),id:'audit-merc-armor'},helm:{...structuredClone(h.equipment.helm),id:'audit-merc-helm'}},cold:0,poison:0};h.mercenary.hp=mercenaryStats(h).maxHp;game.mercenary.sync();if(activeMercenaryEquipment(h).length!==3)throw Error('Unusable audit mercenary gear');
    }
    if(h.mercenary){h.mercenary.hp=mercenaryStats(h).maxHp;game.mercenary.sync();}
    const spawnEncounter = entry => { area=entry.area; const e=spawn(0,5,'boss',entry.definition,true);if(area.special==='pandemonium')e.cooldown=3;if(entry.aura)e.affixes=[{id:'auraEnchanted',name:entry.aura,description:'Boss aura',aura:entry.aura}];return e; };
    const targets=encounters?[spawnEncounter(encounters[0])]:kind==='boss'?[spawn(0,5,'boss',BOSSES[stage.index],true)]:Array.from({length:6},(_,i)=>spawn((i%3-1)*2.2,4+Math.floor(i/3)*3,'skeleton',MONSTERS[ENCOUNTERS[stage.index][i%ENCOUNTERS[stage.index].length]],false,i===0&&stage.level>=26));
    game.time=0;phase='fight';Math.random=rng(seed);c.itemRandom=rng(seed+1);
    const rounds=[];let roundStart=0,roundPotions=[0,0],rejuvsUsed=0,mercPotionsUsed=0,roundRejuvs=0,roundMercPotions=0,roundIncoming=0;
    const initialStats=stats(h);
    const recordRound=()=>{const e=targets.at(-1);rounds.push({id:encounters[rounds.length].id,won:e.dead,seconds:round(game.time-roundStart),remaining:round(Math.max(0,e.hp)/e.maxHp*100),hp:e.maxHp,hpPotions:potions[0]-roundPotions[0],manaPotions:potions[1]-roundPotions[1],rejuvs:rejuvsUsed-roundRejuvs,mercPotions:mercPotionsUsed-roundMercPotions,incoming:Math.round(incoming-roundIncoming),heroLife:round(h.hp/stats(h).maxHp*100),mercenaryAlive:h.mercenary?.status==='alive'});roundStart=game.time;roundPotions=[...potions];roundRejuvs=rejuvsUsed;roundMercPotions=mercPotionsUsed;roundIncoming=incoming;};
    while(game.time-roundStart<limit&&!game.dead&&(targets.some(e=>!e.dead)||encounters&&targets.length<encounters.length)){
      if(encounters&&targets.at(-1).dead){recordRound();targets.push(spawnEncounter(encounters[targets.length]));}
      const living=enemies.filter(e=>c.hostile(e)),target=living.sort((a,b)=>a.actor.group.position.distanceToSquared(game.position)-b.actor.group.position.distanceToSquared(game.position))[0];
      if(!target){tick();continue;}game.target=target;game.aim.copy(target.actor.group.position).setY(0);
      const s=stats(h),delta=target.actor.group.position.clone().sub(game.position).setY(0),distance=delta.length();
      const rangedFury=build.aoe==='lightningFury'&&living.length>1&&skillLevel(h,'lightningFury');
      const mode=expansionMode(primary)??classSkillMode(primary),melee=!rangedFury&&(['melee','chargeUp','finisher','spear'].includes(mode)||['sacrifice','zeal','smite','vengeance','bash','attack'].includes(primary));
      let reach=melee?2.2:build.range??8;
      if(primary==='arcticBlast'||primary==='firestorm')reach=3.5;
      const staticUseful=h.classId==='sorceress'&&skillLevel(h,'staticField')&&target.boss&&target.hp/target.maxHp>[.30,.38,.55][stage.difficulty];
      if(staticUseful)reach=Math.max(2.2,skillValues('staticField',skillLevel(h,'staticField'),h.skills).radius*.85);
      c.moving=false;c.running=false;
      if(!stationary&&!c.movementLocked&&(distance>reach+.2||!melee&&game.time%3>=2)){
        const direction=distance>reach?delta.normalize():distance<reach*.5?delta.normalize().negate():new THREE.Vector3(delta.z,0,-delta.x).normalize();
        game.position.addScaledVector(direction,dt*(encounters?(m.imprisoned(game.position)?0:4.5*m.heroSpeed()):3)*s.runSpeed);game.body.position.set(game.position.x,.5,game.position.z);c.moving=true;c.running=false;
      }else if(c.lock<=0&&!c.expansion.locked&&!c.zeal&&!c.classes.sequence&&(game.time%3<2||stationary)){
        let acted=false;
        for(const id of buffs){const expired=id==='holyShield'?h.holyShield<=0:!h.buffs[id]||(h.buffs[id].remaining<1&&!['boneArmor','cycloneArmor'].includes(id));if(expired&&cast(id)){acted=true;break;}}
        if(!acted&&build.curse&&skillLevel(h,build.curse)&&!c.itemCurses.has(target))acted=cast(build.curse);
        if(!acted&&build.corpseExplosion&&skillLevel(h,'corpseExplosion')){const corpse=c.expansion.pets.corpse(target.actor.group.position,5);if(corpse){game.aim.copy(corpse.actor.group.position).setY(0);const old=game.target;game.target=undefined;acted=cast('corpseExplosion');game.target=old;}}
        if(!acted)for(const id of pets){if(!skillLevel(h,id))continue;const max=Math.min(24,skillValues(id,skillLevel(h,id),h.skills).hits),owned=c.expansion.pets.pets.filter(p=>p.expansionId===id).length;if(owned>=max)continue;
          const old=game.target;game.target=undefined;const corpse=['raiseSkeleton','raiseSkeletalMage','revive'].includes(id)?c.expansion.pets.corpse(game.position,14):undefined;
          if(['raiseSkeleton','raiseSkeletalMage','revive'].includes(id)&&!corpse){game.target=old;continue;}game.aim.copy(corpse?.actor.group.position??game.position.clone().add(new THREE.Vector3(0,0,2.5))).setY(0);acted=cast(id);game.target=old;if(acted)break;
        }
        game.aim.copy(target.actor.group.position).setY(0);
        if(!acted&&staticUseful&&distance<=skillValues('staticField',skillLevel(h,'staticField'),h.skills).radius)acted=cast('staticField');
        if(!acted&&build.traps){const sentry=primary;if(expansionMode(sentry)==='trap'){
          const desired=skillLevel(h,'deathSentry')&&primary!=='deathSentry'?'deathSentry':null;
          const id=desired&&!c.expansion.traps.some(t=>t.id===desired)&&enemies.some(e=>e.dead&&!e.redeemed)?desired:sentry;
          if(c.expansion.traps.length<5||id===desired)acted=cast(id);else if(skillLevel(h,'fireBlast'))acted=cast('fireBlast');else acted=true;
        }}
        if(!acted&&build.finisher){if(mosaic){const charges=['clawsOfThunder','bladesOfIce','cobraStrike','tigerStrike',primary].filter(id=>skillLevel(h,id));const next=charges.find(id=>(c.expansion.charges[id]?.stacks??0)<(id==='phoenixStrike'?2:3));acted=cast(next??'dragonTalon');}else{const charge=c.expansion.charges[primary];acted=cast(charge?.stacks>=3?build.finisher:primary);}}
        if(!acted&&primary==='whirlwind'){
          const old=game.target;game.target=undefined;game.aim.copy(target.actor.group.position).add(delta.normalize().multiplyScalar(2.5));acted=cast(primary);game.target=old;
        }
        if(!acted&&primary==='hydra'&&c.classes.summons.filter(s=>s.id==='hydra').length>=6)acted=cast('fireBall');
        if(!acted&&build.id==='foh'&&target.definition.race!=='beast'&&(living.length===1||c.readyIn('fistOfHeavens')>0))acted=cast('holyBolt');
        if(!acted&&build.id==='orb'&&c.readyIn('frozenOrb')>0&&skillLevel(h,'fireBall'))acted=cast('fireBall');
        if(!acted&&['blizzard','firebow','poisonjav'].includes(build.id)&&c.readyIn(primary)>0){const fallback=build.id==='blizzard'?'iceBlast':build.id==='firebow'?'explodingArrow':'lightningBolt';if(skillLevel(h,fallback))acted=cast(fallback);}
        if(!acted&&build.aoe&&living.length>1&&skillLevel(h,build.aoe)&&c.readyIn(build.aoe)<=0)acted=cast(build.aoe);
        if(!acted)cast(primary);
      }
      if(h.hp<s.maxHp*.35&&rejuvsUsed<rejuvs){const index=potionIndex('rvl');h.potions[index]=1;if(!useRecoveryPotion(h,index,s.maxHp,s.maxMana))rejuvsUsed++;}
      if(h.mercenary?.status==='alive'&&h.mercenary.hp<mercenaryStats(h).maxHp*.5&&mercPotionsUsed<mercPotions&&!h.mercenary.potionHealing){const index=potionIndex('hp5');h.potions[index]=1;if(feedMercenaryPotion(h))mercPotionsUsed++;}
      for(let i=0;i<2;i++){
        const key=i?'mana':'hp',maximum=i?s.maxMana:s.maxHp,potion=potionIndex(`${i?'mp':'hp'}${potionTier(area.act,stage.difficulty)}`);
        if(h[key]<maximum*.55&&!h.potionRecovery.some(e=>POTIONS[e.index].kind===(i?'mana':'health'))&&potions[i]<8){h.potions[potion]=1;if(!useRecoveryPotion(h,potion,s.maxHp,s.maxMana))potions[i]++;}
      }
      tick();minLife=Math.min(minLife,h.hp/stats(h).maxHp);
    }
    if(encounters)recordRound();
    const clearTime=game.time;
    if(affixes&&targets.every(e=>e.dead))for(let t=0;t<1&&!game.dead;t+=dt)tick();
    const won=!game.dead&&targets.every(e=>e.dead)&&(!encounters||targets.length===encounters.length),remaining=targets.reduce((a,e)=>a+Math.max(0,e.hp),0)/targets.reduce((sum,e)=>sum+e.maxHp,0);
    return {rounds,initialStats:{life:initialStats.maxHp,mana:initialStats.maxMana,resists:initialStats.resistances,block:initialStats.block},rejuvsUsed,mercPotionsUsed,build:build.id,stage:stage.id,kind,seed,poor,mercenary,coldStart,stationary,affixes,mosaic,combatGear,white,charged,won,dead:game.dead,seconds:round(clearTime),remaining:round(remaining*100),minLife:round(minLife*100),firstKill:firstKill===null?null:round(firstKill),hpPotions:potions[0],manaPotions:potions[1],incoming:Math.round(incoming),damage:Math.round(damageDealt),casts,blockedCasts,preparedPets:pets.length,preparationMana:round(preparationMana),survivingPets:c.expansion.pets.pets.length,mercenaryAlive:h.mercenary?.status==='alive',broken:Object.values(h.equipment).filter(i=>i?.durability===0).map(i=>i.name)};
  }finally{c.classes.clear();game.mercenary.clear();for(const object of [...scene.children])dispose(object);Math.random=random;}
}
