import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classFixture} from './class-fixture.ts';
import {referenceHero} from './balance-fixtures.ts';
import {newHero,gainXp,allocateAttribute,learnSkill,stats,skillLevel} from '../src/model.ts';
import {EXPERIENCE,skillById,type SkillId} from '../src/paladin.ts';
import {BASES,makeItem,itemRequirements,type Item} from '../src/items.ts';
import {monsterStats} from '../src/balance.ts';
import {BOSSES} from '../src/bestiary.ts';
import {LEVELS} from '../src/campaign.ts';

function duel(level:number,difficulty:0|1|2,index:number,build:'fire'|'cold'|'lightning'|'bow'|'javelin'){
  const amazon=['bow','javelin'].includes(build),f=classFixture(amazon?'amazon':'sorceress',false),h=newHero(amazon?'amazon':'sorceress');gainXp(h,EXPERIENCE[level-1]);
  const gear=referenceHero(level,difficulty,amazon?'zeal':'hammer');h.equipment=gear.equipment;h.bonusLife=gear.bonusLife;h.bonusResist=gear.bonusResist;h.skillPoints+=4*(difficulty+Number(level>=34));h.difficultyLevel=difficulty;h.campaign.current=index;h.campaign.kills=LEVELS[index].quest.count;h.campaign.objects=Array.from({length:LEVELS[index].quest.count},(_,i)=>i);h.campaign.cleared=[25,25,25];h.unlockedDifficulty=2;
  if(amazon){h.equipment.weapon=makeItem(BASES.find(b=>b.baseCode===(build==='bow'?level<30?'hbw':level<65?'8hb':'6hb':level<30?'jav':level<65?'9ja':'7ja'))!);h.equipment.weapon.mods={damage:level<30?30:level<65?100:200,ias:level<30?10:20};if(build==='bow')h.equipment.shield=null;}
  if(h.equipment.amulet?.mods){delete h.equipment.amulet.mods.paladinSkills;h.equipment.amulet.mods[amazon?'amazonSkills':'sorceressSkills']=1;}
  const items=Object.values(h.equipment).filter((i):i is Item=>!!i);allocateAttribute(h,'strength',Math.max(0,...items.map(i=>itemRequirements(i).strength-h.strength)));allocateAttribute(h,'dexterity',Math.max(0,...items.map(i=>itemRequirements(i).dexterity-h.dexterity)));
  if(!amazon)allocateAttribute(h,'energy',Math.min(h.points,Math.floor(level/2)));else if(build==='bow')allocateAttribute(h,'dexterity',Math.min(h.points,level));allocateAttribute(h,'vitality',h.points);
  const learn=(id:SkillId,rank=1)=>{if(level<skillById[id].level)return;for(const req of skillById[id].requires)if(!h.skills[req])learn(req);while(h.skills[id]<rank&&learnSkill(h,id)){};};
  let primary:SkillId;
  if(build==='fire'){primary=level<12?'fireBolt':'fireBall';learn('warmth');learn(primary,20);learn('fireMastery',Math.min(20,Math.max(1,level-45)));learn('fireBolt',20);learn('meteor',20);learn('fireMastery',20);}
  else if(build==='cold'){primary=level<30?'iceBlast':'frozenOrb';learn('warmth');learn(primary,20);learn('coldMastery',10);learn('iceBolt',20);learn('coldMastery',20);}
  else if(build==='lightning'){primary='lightning';learn('warmth');learn(primary,20);learn('lightningMastery',20);learn('chargedBolt',20);learn('nova',20);learn('chainLightning',20);}
  else if(build==='bow'){primary=level<24?'magicArrow':'strafe';learn('criticalStrike',5);learn(primary,20);learn('penetrate',10);learn('criticalStrike',20);learn('penetrate',20);}
  else{primary=level<18?'powerStrike':'chargedStrike';learn('criticalStrike');learn(primary,20);learn('powerStrike',20);learn('lightningFury',20);learn('lightningStrike',20);}
  h.ammo.arrows=600;Object.assign(f.hero,h);f.hero.hp=stats(h).maxHp;f.hero.mana=stats(h).maxMana;const boss=f.enemy(amazon&&build==='javelin'?2:6);Object.assign(boss,monsterStats(BOSSES[index],LEVELS[index],difficulty,true));boss.hp=boss.maxHp;boss.boss=true;boss.definition=BOSSES[index];f.game.target=boss;
  let seconds=0,potions=0;while(seconds<120&&!boss.dead){if(f.hero.mana<stats(h).maxMana*.25&&f.combat.regen[1]<15&&potions<8){f.combat.regen[1]+=80;potions++;}f.game.aim.copy(boss.actor.group.position);if(seconds%3<2)f.combat.castAction(primary,true);f.tick(.04);seconds+=.04;}
  f.combat.classes.clear();return{level,difficulty,build,seconds:Math.round(seconds*10)/10,manaPotions:potions,arrows:600-h.ammo.arrows,won:boss.dead,remaining:Math.round(boss.hp/boss.maxHp*100),rank:skillLevel(h,primary)};
}
test('legal Amazon and Sorceress builds can damage and defeat representative chapter bosses within bounded mana budgets',t=>{
  let seed=99;t.mock.method(Math,'random',()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;});const rows=[];
  for(const [level,diff,index] of [[12,0,4],[41,0,24],[67,1,24],[89,2,24]] as const)for(const build of ['fire','cold','lightning','bow','javelin'] as const){const r=duel(level,diff,index,build);rows.push(r);}
  console.table(rows);
  for(const row of rows){assert.ok(row.won,JSON.stringify(row));assert.ok(row.seconds>=2,`boss burst is excessive: ${JSON.stringify(row)}`);assert.ok(row.manaPotions<=8);}
});
