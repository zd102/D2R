import * as THREE from 'three';
import { newHero, gainXp, allocateAttribute, learnSkill, stats, skillLevel, activeEquipment } from '../src/model.ts';
import { EXPERIENCE, skillById, type SkillId } from '../src/paladin.ts';
import { BASES, RUNEWORDS, makeItem, socketItem, itemRequirements, type Item } from '../src/items.ts';
import { BOSSES, MONSTERS, ENCOUNTERS, type MonsterDef } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { monsterStats } from '../src/balance.ts';
import { referenceHero } from './balance-fixtures.ts';
import { classFixture } from './class-fixture.ts';

export type ModernBuild = 'bow' | 'foh' | 'nova' | 'hydra';
export function modernHero(level: number, difficulty: 0|1|2, build: ModernBuild) {
  const classId=build==='bow'?'amazon':build==='foh'?'paladin':'sorceress';
  const hero=newHero(classId); gainXp(hero,EXPERIENCE[level-1]); hero.difficultyLevel=difficulty;
  const gear=referenceHero(level,difficulty,'hammer'); hero.equipment=gear.equipment;
  hero.bonusLife=gear.bonusLife; hero.bonusResist=gear.bonusResist;
  hero.skillPoints=gear.skillPoints+Object.values(gear.skills).reduce((sum,n)=>sum+n,0);
  hero.points+=difficulty*5+(level>=27?5:0);
  if (hero.equipment.amulet?.mods) { delete hero.equipment.amulet.mods.paladinSkills; hero.equipment.amulet.mods[`${classId}Skills`]=1; }
  if(build==='bow') {
    const weapon=makeItem(BASES.find(base=>base.baseCode===(level>=65?'6hb':level>=27?'8hb':'hbw'))!);
    const word=RUNEWORDS.find(word=>word.catalogId===(level>=27?'Runeword62':'Runeword31'))!;
    if(level>=15){weapon.sockets=word.runes.length;for(const rune of word.runes)socketItem(weapon,rune,()=>.5);}
    else weapon.mods={damage:30,ias:10};
    hero.equipment.weapon=weapon; hero.equipment.shield=null;
  }
  const items=Object.values(hero.equipment).filter((item):item is Item=>!!item);
  allocateAttribute(hero,'strength',Math.max(0,...items.map(item=>itemRequirements(item).strength-hero.strength)));
  allocateAttribute(hero,'dexterity',Math.max(0,...items.map(item=>itemRequirements(item).dexterity-hero.dexterity)));
  if(build==='bow')allocateAttribute(hero,'dexterity',Math.min(hero.points,level));
  allocateAttribute(hero,'vitality',hero.points);
  const learn=(id:SkillId,rank=1)=>{
    if(level<skillById[id].level)return;
    for(const required of skillById[id].requires)if(!hero.skills[required])learn(required);
    while(hero.skills[id]<rank&&learnSkill(hero,id)) { /* legal earned points only */ }
  };
  if(build==='bow') {
    learn('criticalStrike'); learn('dodge'); learn('avoid'); learn('evade');
    learn(level>=24?'strafe':'magicArrow',20); learn('penetrate',3); learn('guidedArrow',20); learn('multipleShot',20); learn('penetrate',10);
  } else if(build==='foh') {
    learn('holyShield');learn('holyBolt',20);learn('fistOfHeavens',20);learn('holyShock',20);learn('conviction',10);
    hero.activeAura=hero.skills.conviction?'conviction':null;
  } else if(build==='nova') {
    learn('warmth');learn('frozenArmor');learn('nova',20);learn('lightningMastery',20);learn('staticField',20);learn('thunderStorm',20);
  } else {
    learn('warmth');learn('frozenArmor');learn('hydra',20);learn('fireMastery',20);learn('fireBall',20);learn('fireBolt',20);
  }
  if(activeEquipment(hero).length!==items.length)throw new Error(`Unusable modern ${build} fixture at ${level}`);
  hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;
  return hero;
}

// Real controllers and projectiles, open arena without map collisions. The
// scripted player spends 2/3 of its time attacking and 1/3 repositioning.
export function modernEncounter(level:number,difficulty:0|1|2,index:number,build:ModernBuild,players=1,pack=false) {
  const hero=modernHero(level,difficulty,build), f=classFixture(hero.classId,false);
  hero.campaign.current=index;hero.campaign.kills=LEVELS[index].quest.count;
  hero.campaign.objects=Array.from({length:LEVELS[index].quest.count},(_,i)=>i);
  Object.assign(f.hero,hero);
  const spawn=(x:number,z:number,_kind:string,definition:MonsterDef,boss=false)=>{
    const enemy=f.enemy(z,x);Object.assign(enemy,monsterStats(definition,LEVELS[index],difficulty,boss,false,players));
    enemy.hp=enemy.maxHp;enemy.definition=definition;enemy.boss=boss;enemy.speed=definition.speed;enemy.cooldown=1;return enemy;
  };
  f.game.spawnEnemy=spawn;
  const targets=pack?ENCOUNTERS[index].slice(0,3).map((id,i)=>spawn((i-1)*2,5+i,'demon',MONSTERS[id])):[spawn(0,5,'boss',BOSSES[index],true)];
  const primary:SkillId=build==='bow'?(level>=24?'strafe':'magicArrow'):build==='foh'?'holyBolt':build==='nova'?'nova':'hydra';
  const potions=[0,0];let seconds=0,minHp=hero.hp;
  const dt=.04;
  try {
    while(seconds<150&&!f.game.dead&&targets.some(enemy=>!enemy.dead)) {
      seconds+=dt;
      const s=stats(f.hero),target=targets.find(enemy=>!enemy.dead)!;f.game.target=target;f.game.aim.copy(target.actor.group.position);
      const delta=target.actor.group.position.clone().sub(f.game.position),distance=delta.length();
      const reach=build==='nova'?5:9;
      f.combat.moving=false;f.combat.running=false;
      if(!f.combat.movementLocked&&(distance>reach||seconds%3>=2)) {
        f.combat.moving=true;f.combat.running=f.hero.running&&f.hero.stamina>0;
        const direction=distance>reach?delta.normalize():new THREE.Vector3(delta.z,0,-delta.x).normalize();
        f.game.position.addScaledVector(direction,dt*3*s.runSpeed);f.game.body.position.set(f.game.position.x,.5,f.game.position.z);
        f.game.actor.group.position.copy(f.game.position);
      } else if(seconds%3<2) {
        if(build==='foh'&&f.hero.skills.holyShield&&!f.hero.holyShield)f.combat.castAction('holyShield');
        else if(f.hero.skills.frozenArmor&&!f.hero.buffs.frozenArmor)f.combat.castAction('frozenArmor');
        else if(build==='nova'&&f.hero.skills.thunderStorm&&!f.hero.buffs.thunderStorm)f.combat.castAction('thunderStorm');
        else if(build==='foh'&&targets.filter(enemy=>!enemy.dead).length>1&&f.combat.readyIn('fistOfHeavens')<=0)f.combat.castAction('fistOfHeavens',true);
        else f.combat.castAction(build==='foh'&&target.definition?.race==='beast'?'fistOfHeavens':primary,true);
      }
      for(const i of [0,1] as const) {
        const key=i?'mana':'hp',max=i?s.maxMana:s.maxHp;
        if(f.hero[key]<max*.55&&f.combat.regen[i]<(i?15:30)&&potions[i]<8){f.combat.regen[i]+=i?80:160;potions[i]++;}
      }
      f.tick(dt,true);
      for(const enemy of f.game.enemies)if(!enemy.dead){enemy.body.position.x+=enemy.body.velocity.x*dt;enemy.body.position.z+=enemy.body.velocity.z*dt;enemy.actor.group.position.set(enemy.body.position.x,0,enemy.body.position.z);}
      minHp=Math.min(minHp,f.hero.hp);
      for(const effect of f.game.effects)f.game.disposeObject(effect.mesh);f.game.effects=[];
    }
    return {level,difficulty,act:Math.floor(index/5)+1,build,players,pack,won:!f.game.dead&&targets.every(enemy=>enemy.dead),seconds:Math.round(seconds*10)/10,remaining:Math.round(targets.reduce((sum,e)=>sum+Math.max(0,e.hp),0)/targets.reduce((sum,e)=>sum+e.maxHp,0)*100),minLife:Math.round(minHp/stats(f.hero).maxHp*100),hpPotions:potions[0],manaPotions:potions[1],rank:skillLevel(f.hero,primary)};
  } finally {f.combat.classes.clear();}
}
