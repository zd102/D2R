import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PaladinCombat } from '../src/combat.ts';
import { MonsterCombat } from '../src/monster-combat.ts';
import { newHero, gainXp, learnSkill, stats } from '../src/model.ts';
import { EXPERIENCE, skillsForClass } from '../src/paladin.ts';
import { createActor } from '../src/world.ts';
import type { ClassId } from '../src/classes.ts';
import type { Game, Enemy } from '../src/game.ts';

export function classFixture(classId:ClassId, learnAll=true) {
  const hero=newHero(classId);gainXp(hero,EXPERIENCE[79]);
  if(learnAll)for(const skill of skillsForClass(classId).sort((a,b)=>a.level-b.level))if(!learnSkill(hero,skill.id))throw new Error(`Cannot learn ${skill.id}`);
  hero.hp=stats(hero).maxHp;hero.mana=stats(hero).maxMana;
  const game:any={hero,world:{scene:new THREE.Scene(),grid:{width:57,height:57,isWalkableAt:()=>true},path:(_from:THREE.Vector3,to:THREE.Vector3)=>[to.clone()]},position:new THREE.Vector3(),aim:new THREE.Vector3(0,0,6),actor:createActor('hero',classId),body:new CANNON.Body({mass:1}),enemies:[],effects:[],paused:false,dead:false,time:0,started:true,invincible:0,attackTime:0,target:undefined,path:[],marker:new THREE.Object3D(),cooldowns:{attack:0,cleave:0,ward:0,nova:0,dash:0,bolt:0},
    begin(){},save(){},releaseInput(){},burst(){},beam(){},audio:{play(){}},ui:{floatText(){},toast(){},flashDamage(){},openPanel(){}},killEnemy(e:Enemy){e.dead=true;},disposeObject(mesh:THREE.Object3D){mesh.removeFromParent();},nearestEnemy(range:number){return this.enemies.find((e:Enemy)=>!e.dead&&e.converted<=0&&e.actor.group.position.distanceTo(this.position)<range);}};
  const combat=new PaladinCombat(game as Game);game.combat=combat;game.monsterCombat=new MonsterCombat(game);
  const enemy=(z=6,x=0)=>{
    const actor=createActor('skeleton');actor.group.position.set(x,0,z);const body=new CANNON.Body({mass:1});body.position.set(x,.5,z);
    const e={id:game.enemies.length,name:'Target',actor,body,level:80,defense:1,attackRating:1e5,hp:1e6,maxHp:1e6,damage:10,speed:2,kind:'skeleton',resistances:{physical:0,magic:0,fire:0,cold:0,lightning:0,poison:0},active:true,dead:false,boss:false,converted:0,stunned:0,coldTime:0,bleed:0,redeemed:false,cooldown:0,attackTime:0,path:[],rethink:0} as Enemy;
    game.enemies.push(e);return e;
  };
  const tick=(seconds:number,monsters=false)=>{for(let t=0;t<seconds;t+=.04){game.time+=.04;game.invincible=Math.max(0,game.invincible-.04);combat.update(.04);if(monsters)game.monsterCombat.update(.04);}};
  return {hero,game,combat,enemy,tick};
}
