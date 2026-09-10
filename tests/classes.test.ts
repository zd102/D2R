import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newHero,stats,skillLevel,learnSkill,learnReason,allocateAttribute,gainXp,swapWeapons,serializeSave,parseSave,bindSkill,equipReason,respec} from '../src/model.ts';
import {CLASS_IDS,CLASSES} from '../src/classes.ts';
import {EXPERIENCE,skillsForClass,skillValues,isPassive,skillById,type SkillId} from '../src/paladin.ts';
import {CLASS_SKILLS,classSkillMode} from '../src/class-skills.ts';
import {BASES,makeItem,specialItem,itemMods,migrateCatalogItem} from '../src/items.ts';
import {eligibleAffixes} from '../src/affixes.ts';
import {CATALOG_SPECIALS} from '../src/item-catalog-data.ts';
import {SaveStore} from '../src/saves.ts';
import {classFixture} from './class-fixture.ts';
import {ATTACKS} from '../src/monster-combat.ts';

test('Amazon and Sorceress use original starting attributes, level gains and attribute gains',()=>{
  for(const [id,hp,mp,stamina,attrs,hp2,mp2] of [['amazon',50,15,84,[20,25,20,15],52,16.5],['sorceress',40,35,74,[10,25,10,35],41,37]] as const){
    const h=newHero(id);assert.deepEqual([h.strength,h.dexterity,h.vitality,h.energy],attrs);assert.deepEqual([stats(h).maxHp,stats(h).maxMana,stats(h).maxStamina],[hp,mp,stamina]);
    gainXp(h,EXPERIENCE[1]);assert.deepEqual([stats(h).maxHp,stats(h).maxMana],[hp2,mp2]);
    allocateAttribute(h,'vitality',2);allocateAttribute(h,'energy',2);assert.equal(stats(h).maxHp,hp2+2*CLASSES[id].lifePerVitality);assert.equal(stats(h).maxMana,mp2+2*CLASSES[id].manaPerEnergy);
    assert.ok(stats(h).weapon);if(id==='amazon'){swapWeapons(h);assert.equal(stats(h).ranged?.kind,'bow');}else assert.equal(skillLevel(h,h.bindings.bolt),1);
  }
});
test('all three classes have 30 reachable skills, three non-overlapping trees and independent caps',()=>{
  for(const id of CLASS_IDS){const h=newHero(id);gainXp(h,EXPERIENCE[98]);const skills=skillsForClass(id);assert.equal(skills.length,30);const positions=new Set();
    for(const s of skills.sort((a,b)=>a.level-b.level)){assert.equal(learnReason(h,s.id),'');assert.ok(learnSkill(h,s.id));const position=`${s.tree}:${s.level}:${s.column}`;assert.ok(!positions.has(position),position);positions.add(position);if(isPassive(s.id))assert.equal(bindSkill(h,'ward',s.id),false);}
    for(const tree of CLASSES[id].trees)assert.equal(skills.filter(s=>s.tree===tree).length,10);
    for(const other of CLASS_IDS.filter(c=>c!==id))assert.equal(learnSkill(h,skillsForClass(other)[0].id),false);
    const first=skills[0].id;while(learnSkill(h,first)){}assert.equal(h.skills[first],20);
    const reset=structuredClone(h);reset.questRewards.push('0:shrine0');assert.ok(respec(reset));assert.deepEqual([reset.strength,reset.dexterity,reset.vitality,reset.energy],Object.values(CLASSES[id].attributes));assert.equal(reset.classId,id);
  }
});
test('canonical skill costs, synergies and masteries agree with the original tables',()=>{
  const h=newHero('sorceress');assert.equal(skillValues('fireBolt',1,h.skills).cost,2.5);assert.equal(skillValues('teleport',20,h.skills).cost,5);
  assert.equal(skillValues('fireMastery',20,h.skills).percent,163);assert.equal(skillValues('lightningMastery',20,h.skills).percent,278);assert.equal(skillValues('coldMastery',20,h.skills).percent,115);
  assert.equal(Math.floor(skillValues('fireWall',20,h.skills).max),1307);assert.equal(Math.floor(skillValues('blaze',20,h.skills).max),290);
  h.skills.fireBall=1;h.skills.fireBolt=1;const v=skillValues('fireBall',20,h.skills);assert.equal(Math.floor(v.max),258);
  h.skills.fireMastery=20;h.skills.warmth=20;assert.equal(stats(h).mods.fireSkillDamage,163);assert.ok(stats(h).manaRegen>stats(newHero('sorceress')).manaRegen*3.5);
  h.equipment.weapon!.mods={allSkills:3};assert.equal(skillValues('fireBall',20,h.skills).max,v.max,'equipment does not supply hard-point synergy');
  const a=newHero('amazon');a.skills.pierce=20;a.skills.criticalStrike=20;assert.equal(stats(a).mods.pierceChance,85);assert.equal(stats(a).criticalStrike,68);
});
test('new class equipment, class skills and staffmods work and are restricted to the owner class',()=>{
  for(const [id,key,skill] of [['amazon',"Titan's Revenge",'chargedStrike'],['sorceress','The Oculus','fireBall']] as const){
    const h=newHero(id);h.level=80;h.strength=h.dexterity=200;h.skills[skill]=1;
    const item=specialItem(CATALOG_SPECIALS.find(s=>s.key===key)!.id);item.identified=true;
    assert.equal(equipReason(h,item),'');h.equipment.weapon=item;assert.ok(skillLevel(h,skill)>=3,`${key} skill bonus`);
    assert.match(equipReason(newHero(id==='amazon'?'sorceress':'amazon'),item),/仅限/);
  }
  const h=newHero('sorceress');h.equipment.weapon!.mods={skill_fireBall:3};assert.equal(skillLevel(h,'fireBall'),3);assert.ok(bindSkill(h,'cleave','fireBall'));
  const round= parseSave(serializeSave(h))!;assert.equal(round.bindings.cleave,'fireBall');assert.equal(skillLevel(round,'fireBall'),3);
  h.equipment.weapon=null;assert.equal(skillLevel(h,'fireBall'),0);assert.equal(skillLevel(newHero('amazon'),'fireBall',{skill_fireBall:3}),0);
});
test('new class affixes can drop and existing rolled items recover missing class modifiers without rerolls',()=>{
  const amulet=makeItem(BASES.find(b=>b.baseCode==='amu')!);amulet.level=99;amulet.rarity='magic';const pool=eligibleAffixes(amulet);for(const code of ['ama','sor'])assert.ok(pool.some(a=>a.properties.some(p=>p[0]===code)));
  const charm=makeItem(BASES.find(b=>b.baseCode==='cm3')!);charm.level=99;charm.rarity='magic';for(const tab of [0,1,2,3,4,5])assert.ok(eligibleAffixes(charm).some(a=>a.properties.some(p=>p[0]==='skilltab'&&p[1]===tab)));
  const item=specialItem(CATALOG_SPECIALS.find(s=>s.key==="Titan's Revenge")!.id,()=>.1),before=structuredClone(item);delete item.mods!.amazonSkills;delete item.mods!.javelinSkills;migrateCatalogItem(item);assert.equal(item.mods!.amazonSkills,2);assert.equal(item.mods!.javelinSkills,2);assert.deepEqual(item.catalogRolls,before.catalogRolls);assert.equal(item.mods!.damage,before.mods!.damage);const restored=structuredClone(item);migrateCatalogItem(item);assert.deepEqual(item,restored);
});
test('independent class progress and buffs survive export/import while older Paladin saves remain valid',()=>{
  const data=new Map<string,string>(), storage={get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>{data.delete(k);}},store=new SaveStore(storage);
  const a=store.create('Amazon','amazon'),s=store.create('Sorceress','sorceress');a.hero.campaign.kills=3;store.save(a.id,a.hero,a.revision);
  assert.equal(store.read(s.id).hero.campaign.kills,0);
  for(const p of [a,s]){const file=store.exportCharacter(p.id);const copy=store.importCharacter(file.content,`${p.name} copy`);assert.equal(copy.hero.classId,p.hero.classId);assert.equal(copy.hero.campaign.kills,store.read(p.id).hero.campaign.kills);assert.notEqual(copy.id,p.id);}
  const {hero}=classFixture('sorceress');hero.buffs.energyShield={rank:1,remaining:50};const loaded=parseSave(serializeSave(hero))!;assert.deepEqual(loaded.buffs,hero.buffs);
  const old=JSON.parse(serializeSave(newHero()));delete old.hero.classId;delete old.hero.buffs;assert.equal(parseSave(JSON.stringify(old))!.classId,'paladin');
  old.hero.classId='unknown';assert.equal(parseSave(JSON.stringify(old)),null);
});
test('all active Amazon and Sorceress skills produce damage, movement, summons or real buffs',t=>{
  t.mock.method(Math,'random',()=>.4);
  for(const skill of CLASS_SKILLS.filter(s=>!isPassive(s.id))){const {hero,game,combat,enemy,tick}=classFixture(skill.classId!);const mode=classSkillMode(skill.id);
    if(mode==='bow')swapWeapons(hero);const target=enemy(mode==='spear'?2:6);game.target=target;game.aim.copy(target.actor.group.position);if(['nova','frostNova','innerSight','slowMissiles','staticField'].includes(skill.id))target.actor.group.position.z=2;
    if(skill.id==='fireWall'||skill.id==='meteor'||skill.id==='blizzard')game.aim.copy(target.actor.group.position);
    const mana=hero.mana;combat.castAction(skill.id,true);assert.ok(hero.mana<mana||skillValues(skill.id,skillLevel(hero,skill.id),hero.skills).cost===0,skill.id+' spends mana');
    if(mode==='buff'){assert.ok(hero.buffs[skill.id],skill.id);continue;}if(mode==='summon'){assert.ok(combat.classes.summons.length,skill.id);tick(2);if(skill.id!=='dopplezon')assert.ok(target.hp<target.maxHp,skill.id+' attacks');continue;}
    if(skill.id==='teleport'){assert.ok(game.position.z>2);continue;}
    if(skill.id==='innerSight'){assert.ok(combat.classes.defenseReduction(target)>0);continue;}
    if(skill.id==='slowMissiles'){assert.equal(combat.classes.missileSpeed(target),.33);continue;}
    if(skill.id==='inferno')target.actor.group.position.z=2;
    tick(3);assert.ok(target.hp<target.maxHp||target.poison,`${skill.id} must hurt its target`);
  }
});
test('multi-shot uses unlimited arrows and never shotguns a single body, magic arrow needs no ammo',t=>{
  t.mock.method(Math,'random',()=>.4);const {hero,combat,enemy,tick}=classFixture('amazon');swapWeapons(hero);hero.skills.multipleShot=20;const target=enemy(2),ammo=hero.ammo.arrows;
  const initial=target.hp;combat.castAction('multipleShot');assert.equal(hero.ammo.arrows,ammo);assert.equal(combat.classes.missiles.length,21);tick(1);
  const multi=initial-target.hp;combat.lock=0;target.hp=initial;combat.castAction('attack');tick(1);assert.ok(Math.abs(multi-(initial-target.hp)*.75)<2);
  combat.lock=0;hero.ammo.arrows=0;combat.castAction('magicArrow');assert.equal(combat.classes.missiles.length,1);tick(1);assert.ok(target.hp<initial);
});

test('Amazon bow and javelin skills including strafe work with empty legacy ammunition', () => {
  for (const id of ['strafe', 'multipleShot', 'guidedArrow', 'lightningFury', 'poisonJavelin'] as const) {
    const { hero, combat, enemy, tick } = classFixture('amazon');
    if (['strafe', 'multipleShot', 'guidedArrow'].includes(id)) swapWeapons(hero);
    hero.ammo = { arrows: 0, bolts: 0 }; hero.equipment.weapon!.quantity = 0; const target = enemy();
    assert.equal(combat.castAction(id), true, id);
    tick(.3); assert.ok(combat.classes.missiles.length || combat.classes.fields.length || target.hp < target.maxHp, id);
    assert.equal(hero.ammo.arrows, 0); assert.equal(hero.equipment.weapon!.quantity, 0);
  }
});
test('static field respects immunity and nightmare/hell floors; mastery does not multiply it',()=>{
  for(const diff of [0,1,2] as const){const {hero,combat,enemy}=classFixture('sorceress');hero.difficultyLevel=diff;hero.skills.lightningMastery=20;hero.equipment.weapon!.mods={aura_conviction:20,lightningPierce:50,lightningSkillDamage:50};const target=enemy(2);target.hp=target.maxHp=1000;
    combat.castAction('staticField');assert.equal(target.hp,750);
    for(let i=0;i<24;i++){hero.mana=100;combat.lock=0;combat.castAction('staticField');}assert.ok(target.hp>=[0,330,500][diff]);if(diff)assert.equal(target.hp,[0,330,500][diff]);
    target.hp=1000;target.resistances.lightning=100;hero.mana=100;combat.lock=0;combat.castAction('staticField');assert.equal(target.hp,1000);
  }
});
test('energy shield drains before resistance, uses hard Telekinesis points, excludes poison and expires',()=>{
  const {hero,game,combat}=classFixture('sorceress');hero.skills.telekinesis=20;hero.buffs.energyShield={remaining:5,rank:1};hero.mana=100;hero.hp=100;
  combat.hurt(100,'fire');assert.equal(hero.mana,85);assert.equal(hero.hp,20);
  hero.hp=100;hero.mana=2;game.invincible=0;combat.hurt(10,'fire');assert.equal(hero.mana,.5);assert.equal(hero.hp,92);
  game.invincible=0;combat.hurt(10,'poison');assert.equal(hero.mana,.5);game.invincible=0;combat.hurt(10,'fire');assert.equal(hero.buffs.energyShield,undefined);
});
test('cold mastery cannot break immunity, poison clouds refresh without additive stacks, and walls stop spells',t=>{
  t.mock.method(Math,'random',()=>.4);const {hero,combat,enemy,tick,game}=classFixture('sorceress');hero.skills.coldMastery=20;const target=enemy(6);target.resistances.cold=100;
  combat.castAction('iceBolt');tick(1);assert.equal(target.hp,target.maxHp);assert.equal(target.coldTime,0);
  combat.lock=0;game.world.grid.isWalkableAt=(x:number,z:number)=>z!==31;combat.castAction('fireBall');tick(1);assert.equal(target.hp,target.maxHp);
  const a=classFixture('amazon'),e=a.enemy(4);a.combat.castAction('plagueJavelin');a.tick(.3);assert.ok(e.poison);const dps=e.poison!.dps;a.tick(.5);assert.equal(e.poison!.dps,dps);
});
test('teleport rejects fully blocked landings without charging mana and can cross an intervening wall',()=>{
  const {hero,game,combat}=classFixture('sorceress');game.world.grid.isWalkableAt=()=>false;const mana=hero.mana;combat.castAction('teleport',true);assert.equal(hero.mana,mana);assert.equal(game.position.z,0);
  game.world.grid.isWalkableAt=(_x:number,z:number)=>z!==31;combat.castAction('teleport',true);assert.ok(game.position.z>4);assert.ok(hero.mana<mana);
});
test('telekinesis retrieves supplies or opens chests at the cursor and never picks up equipment or crosses walls',()=>{
  const f=classFixture('sorceress');f.game.loot=[{id:1,x:0,z:6,gold:10}];let collected=0,opened=0;f.game.collectLoot=()=>collected++;f.game.openChest=()=>opened++;f.combat.castAction('telekinesis',true);assert.equal(collected,1);
  f.combat.lock=0;f.game.loot=[{id:2,x:0,z:6,item:f.hero.equipment.weapon}];const mana=f.hero.mana;f.combat.castAction('telekinesis',true);assert.equal(collected,1);assert.equal(f.hero.mana,mana);
  f.game.loot=[];f.game.world.chests=[{id:0,x:0,z:6,opened:false}];f.combat.castAction('telekinesis',true);assert.equal(opened,1);
  f.combat.lock=0;f.game.world.grid.isWalkableAt=(_x:number,z:number)=>z!==31;f.combat.castAction('telekinesis',true);assert.equal(opened,1);
});
test('ice armor variants replace one another, enchant affects real weapon hits and timed buffs expire',t=>{
  t.mock.method(Math,'random',()=>.4);const {hero,game,combat,enemy,tick}=classFixture('sorceress');hero.equipment.armor=makeItem(BASES.find(b=>b.baseCode==='qui')!);const base=stats(hero).defense;
  for(const id of ['frozenArmor','shiverArmor','chillingArmor'] as const){combat.lock=0;hero.mana=100;combat.castAction(id);assert.ok(stats(hero).defense>base);assert.equal(Object.keys(hero.buffs).filter(k=>k.endsWith('Armor')).length,1);}
  hero.buffs.chillingArmor!.remaining=.08;tick(.12);assert.equal(hero.buffs.chillingArmor,undefined);assert.equal(stats(hero).defense,base);
  const target=enemy(2);target.resistances.physical=100;combat.weaponHit(target,'attack');assert.equal(target.hp,target.maxHp);
  combat.lock=0;hero.mana=100;combat.castAction('enchant');combat.weaponHit(target,'attack');assert.ok(target.hp<target.maxHp);const bonus=stats(hero).mods.fireMinDamage!;swapWeapons(hero);assert.equal(stats(hero).mods.fireMinDamage,bonus);
  combat.lock=0;hero.mana=100;combat.castAction('thunderStorm');const hp=target.hp;tick(1);assert.ok(target.hp<hp);
});
test('charged strike has a bounded per-target burst even against a large nearby boss',t=>{
  t.mock.method(Math,'random',()=>.4);const {hero,combat,enemy,tick}=classFixture('amazon');hero.skills.chargedStrike=20;const target=enemy(2);target.boss=true;combat.hostile=e=>!e.dead;combat.castAction('chargedStrike');const cluster=combat.classes.missiles[0].targetHits!;assert.ok(combat.classes.missiles.length>3);tick(1);assert.equal(cluster.get(target.id),3);
});
test('decoy draws melee attacks, intercepts missiles and cannot multiply; Hydra has three heads and a cap',()=>{
  const {hero,game,combat,enemy,tick}=classFixture('amazon'),e=enemy(6);combat.castAction('dopplezon',true);const summon=combat.classes.summons[0],hp=hero.hp;
  game.monsterCombat.startCast(e,'strike');game.monsterCombat.update(.8);assert.ok(summon.hp<summon.maxHp);assert.equal(hero.hp,hp);
  e.actor.group.position.z=9;game.monsterCombat.fire(e,ATTACKS.arrow,e.actor.group.position,new (game.position.constructor)(0,0,-1));game.monsterCombat.update(.7);assert.ok(summon.hp<summon.maxHp-1);assert.equal(hero.hp,hp);
  combat.lock=0;combat.castAction('dopplezon',true);assert.equal(combat.classes.summons.length,1);assert.equal(summon.actor.group.parent,null);
  const s=classFixture('sorceress');for(let i=0;i<5;i++){s.hero.mana=100;s.combat.lock=0;s.combat.classes.delays={};s.combat.castAction('hydra',true);}assert.equal(s.combat.classes.summons.length,3);assert.equal(s.combat.classes.summons[0].actor.group.children.length,3);s.tick(11);assert.equal(s.combat.classes.summons.length,0);
});
