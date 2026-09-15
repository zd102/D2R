import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import PF from 'pathfinding';
import * as CANNON from 'cannon-es';
import { classFixture } from './class-fixture.ts';
import { CLASS_IDS, CLASSES, SKILL_TAB_MODS } from '../src/classes.ts';
import { EXPANSION_SKILLS, expansionMode } from '../src/expansion-skills.ts';
import { EXPANSION_SKILL_DATA } from '../src/expansion-skill-data.ts';
import { ALL_SKILLS, skillsForClass, skillValues, type SkillId } from '../src/paladin.ts';
import { newHero, stats, skillLevel, equipItem, equipReason, parseSave, serializeSave, allocateAttribute } from '../src/model.ts';
import { BASES, makeItem, isAvailableItem, AVAILABLE_RUNEWORDS, type Item } from '../src/items.ts';
import { catalogMods, catalogPropertyStatus } from '../src/item-catalog.ts';
import { eligibleAffixes } from '../src/affixes.ts';
import { canOffhand, kickBaseDamage } from '../src/equipment-hands.ts';
import { GameWorld, gridWalkable } from '../src/world.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { mercenaryStats } from '../src/mercenary.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';
import { socketItem, RUNEWORDS } from '../src/items.ts';
import { validateHero } from '../server/validation.ts';

const weapon=(code:string,id=code)=>makeItem(BASES.find(b=>b.baseCode===code)!,id);
function fixture(id:'necromancer'|'barbarian'|'druid'|'assassin'){
  const f=classFixture(id);f.hero.energy+=300;f.hero.strength+=150;f.hero.dexterity+=150;f.hero.mana=stats(f.hero).maxMana;
  f.game.loot=[];
  const cast=(id:SkillId)=>{f.combat.actionCooldowns={};f.combat.stagger=0;f.hero.mana=stats(f.hero).maxMana;return f.combat.castAction(id);};
  return {...f,cast};
}
test('seven classes expose 210 unique learnable skills and all 120 imported IDs resolve',()=>{
  assert.equal(CLASS_IDS.length,7);assert.equal(ALL_SKILLS.filter(s=>!s.itemOnly).length,210);assert.equal(new Set(ALL_SKILLS.map(s=>s.id)).size,ALL_SKILLS.length);
  for(const id of CLASS_IDS){const skills=skillsForClass(id);assert.equal(skills.length,30);for(const tree of CLASSES[id].trees)assert.equal(skills.filter(s=>s.tree===tree).length,10);}
  assert.equal(EXPANSION_SKILLS.length,120);for(const skill of EXPANSION_SKILLS){assert.equal(skill.classId,EXPANSION_SKILL_DATA[skill.id as keyof typeof EXPANSION_SKILL_DATA].classId);assert.ok(ALL_SKILLS.some(s=>s.id===skill.id&&!s.itemOnly));}
});
test('new class growth and Assassin stamina use the original class attributes',()=>{
  for(const id of ['necromancer','barbarian','druid','assassin'] as const){const h=newHero(id),base=stats(h);h.points=2;allocateAttribute(h,'vitality');assert.equal(stats(h).maxHp-base.maxHp,CLASSES[id].lifePerVitality);assert.equal(stats(h).maxStamina-base.maxStamina,id==='assassin'?1.25:1);}
});
test('all class-specific bases, Chaos and all 21 skill-tab affixes are available',()=>{
  for(const code of ['nec','bar','dru','ass']){const bases=BASES.filter(b=>b.requiredClass===code);assert.ok(bases.length);assert.ok(bases.every(isAvailableItem));assert.equal(catalogPropertyStatus([code,'',2,2]),'active');}
  assert.ok(AVAILABLE_RUNEWORDS.some(w=>w.name==='沌顿'||w.catalogId?.includes('Chaos')));
  const charm=weapon('cm3');charm.level=99;charm.rarity='magic';const affixes=eligibleAffixes(charm);
  for(let tab=0;tab<21;tab++){assert.equal(catalogMods([['skilltab',String(tab),1,1]])[SKILL_TAB_MODS[tab]],1);assert.ok(affixes.some(a=>a.properties.some(p=>p[0]==='skilltab'&&p[1]===tab)),String(tab));}
});
test('dual wield preserves weapon-local damage and allows Barbarian swords in one hand',()=>{
  const {hero}=fixture('barbarian');const right=weapon('hax','right'),left=weapon('hax','left');right.mods={damage:100,fireMinDamage:3,fireMaxDamage:3};left.mods={damage:200,fireMinDamage:9,fireMaxDamage:9};hero.equipment.weapon=right;hero.equipment.shield=left;
  const a=stats(hero),b=stats(hero,undefined,'shield');assert.equal(a.mods.fireMinDamage,3);assert.equal(b.mods.fireMinDamage,9);assert.equal(a.weaponMin,Math.floor(right.minDamage!*2));assert.equal(b.weaponMin,Math.floor(left.minDamage!*3));assert.equal(a.block,0);
  hero.inventory=[weapon('2hs','two')];assert.ok(equipItem(hero,'two'));assert.equal(hero.equipment.shield?.id,'left');assert.equal(stats(hero).weaponMin,2);
  const copy=parseSave(serializeSave(hero))!;assert.equal(copy.equipment.shield?.id,'left');assert.equal(validateHero(hero).equipment.shield?.id,'left');
});
test('only the appropriate classes accept weapons in the offhand',()=>{
  const claw=weapon('ktr'),axe=weapon('hax');assert.ok(canOffhand('assassin',claw));assert.equal(canOffhand('assassin',axe),false);assert.equal(equipReason(newHero('paladin'),axe,'shield'),'不匹配的装备栏');
  const {hero}=fixture('assassin');hero.inventory=[claw];assert.ok(equipItem(hero,claw.id,'shield'));assert.ok(stats(hero).weaponBlock>0);
});
test('kick damage depends on boots and attributes rather than weapon base damage',()=>{
  const low=kickBaseDamage(100,100,weapon('lbt')),high=kickBaseDamage(100,100,weapon('uhb'));assert.ok(high[0]>low[1]);assert.ok(high[1]>high[0]);
});
test('skeletons consume corpses, attack targets and respect their skill-dependent cap',t=>{
  t.mock.method(Math,'random',()=>.2);const f=fixture('necromancer');f.hero.skills.raiseSkeleton=6;const target=f.enemy(3);f.game.target=target;
  for(let i=0;i<5;i++){const corpse=f.enemy(2);corpse.dead=true;corpse.hp=0;f.game.aim.set(0,0,2);f.game.target=undefined;assert.ok(f.cast('raiseSkeleton'));assert.ok(corpse.redeemed);}
  assert.equal(f.combat.expansion.pets.pets.length,4);const before=target.hp;f.tick(4);assert.ok(target.hp<before);
  const life=f.combat.expansion.pets.pets[0].hp;f.combat.expansion.pets.hurt(f.combat.expansion.pets.pets[0],10,'magic');assert.ok(f.combat.expansion.pets.pets[0].hp<life);
});
test('corpse explosion uses unscaled corpse life, consumes once and respects walls',t=>{
  t.mock.method(Math,'random',()=>0);const f=fixture('necromancer'),target=f.enemy(3),corpse=f.enemy(2);corpse.dead=true;corpse.maxHp=4500;corpse.playerCount=8;f.game.aim.set(0,0,2);assert.ok(f.cast('corpseExplosion'));assert.equal(1e6-target.hp,700);assert.equal(f.cast('corpseExplosion'),false);
});
test('curses replace one another, Attract persists and immunity reduction is penalized',()=>{
  const f=fixture('necromancer'),target=f.enemy(3),other=f.enemy(4);f.game.target=target;
  assert.ok(f.cast('amplifyDamage'));assert.equal(f.combat.physicalResistance(target),-100);assert.ok(f.cast('decrepify'));assert.equal(f.combat.physicalResistance(target),-50);
  assert.ok(f.cast('attract'));assert.ok(f.cast('lowerResist'));assert.equal(f.combat.expansion.control.get(target)?.kind,'attract');assert.equal(f.combat.expansion.target(other)?.enemyTarget,target);
});
test('bone walls block collision and restore the original grid after expiry',()=>{
  const f=fixture('necromancer'),grid=new PF.Grid(57,57),physics=new CANNON.World();Object.assign(f.game.world,{grid,physics,obstacles:[],gridOffset:28,gridOffsetZ:28,navigationGrid:undefined,temporaryCollider:GameWorld.prototype.temporaryCollider});
  f.game.aim.set(0,0,5);assert.ok(f.cast('boneWall'));assert.ok(f.combat.expansion.walls.length>0);const wall=f.combat.expansion.walls[0];assert.equal(gridWalkable(grid,wall.ally.actor.group.position),false);wall.ally.hp=0;f.tick(.1);assert.equal(gridWalkable(grid,wall.ally.actor.group.position),true);f.combat.expansion.clear();assert.equal(physics.bodies.length,0);
});
test('Iron Golem consumes only eligible ground equipment and its saved item remains unique',()=>{
  const f=fixture('necromancer'),metal=weapon('hax','golem-metal');metal.mods={fireMinDamage:10,fireMaxDamage:10,allRes:20};const mesh=new THREE.Group();mesh.position.set(0,0,2);f.game.loot=[{item:metal,mesh}];f.game.aim.copy(mesh.position);assert.ok(f.cast('ironGolem'));assert.equal(f.game.loot.length,0);const pet=f.combat.expansion.pets.pets[0];assert.equal(pet.metal?.id,metal.id);
  f.hero.companions=f.combat.expansion.pets.export();const copy=parseSave(serializeSave(f.hero))!;assert.equal(copy.companions?.[0].metal?.id,metal.id);assert.equal(validateHero(f.hero).companions?.[0].metal?.id,metal.id);
  f.combat.expansion.pets.clear();f.combat.expansion.pets.restore(copy.companions!);assert.equal(f.combat.expansion.pets.pets[0].metal?.id,metal.id);
});
test('D2R wolves and bear coexist while spirits and vines replace only their own family',()=>{
  const f=fixture('druid');for(const id of ['summonSpiritWolf','summonFenris','summonGrizzly','oakSage','plaguePoppy'] as const)assert.ok(f.cast(id));
  assert.equal(f.combat.expansion.pets.pets.length,5);assert.ok(f.cast('heartOfWolverine'));assert.ok(f.cast('carrionVine'));assert.equal(f.combat.expansion.pets.pets.length,5);assert.ok(f.combat.expansion.pets.pets.some(p=>p.expansionId==='summonGrizzly'));assert.ok(!f.combat.expansion.pets.pets.some(p=>p.expansionId==='oakSage'));
  assert.equal(f.combat.expansion.pets.pets.find(p=>p.expansionId==='summonSpiritWolf')?.values.type,'cold');
});
test('shapeshifting changes the model and allows defensive buffs but restricts human attacks',()=>{
  const f=fixture('druid');assert.ok(f.cast('wearwolf'));assert.ok(f.game.actor.group.getObjectByName('hero-werewolf').visible);assert.equal(f.cast('tornado'),false);assert.ok(f.cast('cycloneArmor'));assert.ok(f.cast('hurricane'));assert.ok(f.cast('wearbear'));assert.equal(f.game.actor.group.getObjectByName('hero-werewolf').visible,false);assert.ok(f.game.actor.group.getObjectByName('hero-werebear').visible);assert.ok(f.cast('wearbear'));assert.ok(f.game.actor.group.getObjectByName('hero-rig').visible);
});
test('Frenzy uses both hands and ramps attack speed; Whirlwind advances along its original destination',t=>{
  t.mock.method(Math,'random',()=>.2);const f=fixture('barbarian');f.hero.equipment.weapon=weapon('hax','r');f.hero.equipment.shield=weapon('hax','l');const target=f.enemy(2);f.game.target=target;f.game.aim.set(0,0,8);const speed=stats(f.hero).runSpeed;
  assert.ok(f.cast('frenzy'));f.tick(1);assert.equal(f.hero.buffs.frenzy?.stacks,2);assert.ok(stats(f.hero).runSpeed>speed);
  assert.ok(f.cast('whirlwind'));const end=f.combat.expansion.motion!.destination.clone();target.actor.group.position.x=8;f.tick(2);assert.ok(f.game.position.distanceTo(end)<.01);assert.equal(f.combat.expansion.motion,undefined);
});
test('Find Item can produce additional loot without awarding kills or experience and cannot repeat',t=>{
  t.mock.method(Math,'random',()=>0);const f=fixture('barbarian'),corpse=f.enemy(2);corpse.dead=true;f.game.aim.set(0,0,2);let drops=0;f.game.dropLoot=()=>drops++;const xp=f.hero.xp,kills=f.hero.kills;assert.ok(f.cast('findItem'));assert.equal(drops,1);assert.equal(f.cast('findItem'),false);assert.equal(f.hero.xp,xp);assert.equal(f.hero.kills,kills);
});
test('martial finishers spend one layer from each charge, misses cannot build charges',t=>{
  t.mock.method(Math,'random',()=>.2);const f=fixture('assassin'),target=f.enemy(2);f.game.target=target;for(let i=0;i<3;i++)assert.ok(f.cast('tigerStrike'));assert.equal(f.combat.expansion.charges.tigerStrike?.stacks,3);assert.ok(f.cast('dragonClaw')===false);assert.ok(f.cast('dragonTail'));assert.equal(f.combat.expansion.charges.tigerStrike?.stacks,2);
  t.mock.restoreAll();t.mock.method(Math,'random',()=>.999);assert.ok(f.cast('cobraStrike'));assert.equal(f.combat.expansion.charges.cobraStrike,undefined);
});
test('five shared sentries replace oldest traps, shoot and use elemental gear bonuses',()=>{
  const f=fixture('assassin'),target=f.enemy(6);f.game.target=target;f.hero.equipment.weapon!.mods={lightningSkillDamage:50,lightningPierce:25};for(let i=0;i<6;i++)assert.ok(f.cast('lightningSentry'));assert.equal(f.combat.expansion.traps.length,5);const before=target.hp;f.tick(3);assert.ok(target.hp<before);assert.equal(f.combat.expansion.traps[0].snapshot.stats.mods.lightningPierce,25);
});
test('Death Sentry consumes corpses and Burst of Speed is mutually exclusive with Fade',t=>{
  t.mock.method(Math,'random',()=>0);const f=fixture('assassin'),target=f.enemy(3),corpse=f.enemy(2);corpse.dead=true;corpse.maxHp=1000;f.game.aim.set(0,0,2);assert.ok(f.cast('deathSentry'));f.tick(1);assert.ok(corpse.redeemed);assert.ok(target.hp<1e6);assert.ok(f.cast('burstOfSpeed'));assert.ok(f.cast('fade'));assert.equal(f.hero.buffs.burstOfSpeed,undefined);assert.ok(f.hero.buffs.fade);
});
test('new spell projectiles deal their own damage and stop at blocking terrain',t=>{
  t.mock.method(Math,'random',()=>.2);for(const id of ['boneSpear','boneSpirit','teeth'] as const){const f=fixture('necromancer'),target=f.enemy(4);f.game.target=target;assert.ok(f.cast(id));f.tick(1);assert.ok(target.hp<1e6,id);}
  const f=fixture('druid'),target=f.enemy(5);f.game.target=target;assert.ok(f.cast('tornado'));f.game.world.grid.isWalkableAt=(x:number,z:number)=>z!==30;f.tick(2);assert.equal(target.hp,1e6);
});
test('active skill definitions use combat modes and finite nonnegative resource costs',()=>{
  for(const skill of EXPANSION_SKILLS)for(const rank of [1,20,40]){const v=skillValues(skill.id,rank,{});assert.ok(Number.isFinite(v.cost)&&v.cost>=0,skill.id);assert.ok(Number.isFinite(v.min)&&Number.isFinite(v.max),skill.id);assert.equal(expansionMode(skill.id),skill.mode);}
});
test('every new active skill produces its advertised combat state or a real hit',t=>{
  t.mock.method(Math,'random',()=>.1);
  for(const skill of EXPANSION_SKILLS.filter(s=>s.mode!=='passive')){
    const f=fixture(skill.classId as 'necromancer'|'barbarian'|'druid'|'assassin'),target=f.enemy(2),corpse=f.enemy(2);
    corpse.dead=true;corpse.hp=0;corpse.maxHp=100;f.game.aim.set(0,0,2);f.game.target=target;
    f.combat.itemRandom=()=>0;let drops=0;f.game.dropLoot=()=>drops++;
    if(['doubleSwing','frenzy'].includes(skill.id))f.hero.equipment.shield=weapon('hax','left');
    if(skill.id==='doubleThrow'){f.hero.equipment.weapon=weapon('tkf','right');f.hero.equipment.shield=weapon('tkf','left');}
    if(skill.id==='dragonClaw')f.hero.equipment.shield=weapon('ktr','left');
    if(skill.id==='poisonDagger')f.hero.equipment.weapon=weapon('dgr');
    if(['feralRage','rabies','fireClaws','hunger','fury'].includes(skill.id))f.hero.buffs.wearwolf={rank:1,remaining:60};
    if(['maul','shockWave'].includes(skill.id))f.hero.buffs.wearbear={rank:1,remaining:60};
    if(skill.id==='ironGolem'){const mesh=new THREE.Group();mesh.position.set(0,0,2);f.game.loot=[{item:weapon('hax'),mesh}];}
    const potions=f.hero.potions.reduce((a,b)=>a+b,0);
    assert.ok(f.cast(skill.id),`${skill.name} can be cast with valid resources`);
    f.tick(2.5);
    const e=f.combat.expansion;
    assert.ok(target.hp<1e6||target.poison||target.blind||target.flee||target.stunned||target.converted||f.combat.itemCurses.has(target)||f.combat.specialItems.taunts.has(target)||e.control.has(target)||f.hero.buffs[skill.id]||e.pets.pets.length||e.walls.length||e.traps.length||Object.keys(e.charges).length||drops||f.hero.potions.reduce((a,b)=>a+b,0)>potions||f.game.position.length()>.1,`${skill.name} has a real effect`);
    e.clear();
  }
});
test('Mosaic preserves and refreshes charges and Metamorphosis marks survive a save',t=>{
  t.mock.method(Math,'random',()=>.2);const f=fixture('assassin'),target=f.enemy(2);f.game.target=target;f.hero.equipment.weapon!.mods={preserveCharges:100};for(let i=0;i<3;i++)f.cast('tigerStrike');f.tick(1);f.cast('dragonTail');assert.equal(f.combat.expansion.charges.tigerStrike?.stacks,3);assert.equal(f.combat.expansion.charges.tigerStrike?.remaining,15);
  const druid=fixture('druid'),victim=druid.enemy(2);druid.game.target=victim;druid.hero.equipment.weapon!.mods={metamorphosis:1};druid.cast('wearwolf');const hp=stats(druid.hero).maxHp;druid.cast('feralRage');assert.equal(druid.hero.marks?.wolf,180);assert.ok(stats(druid.hero).maxHp>hp);assert.equal(parseSave(serializeSave(druid.hero))?.marks?.wolf,180);
});
test('Iron Golem equipment aura supplies its owner only while alive and in range',()=>{
  const f=fixture('necromancer'),item=weapon('hax');item.mods={aura_meditation:12};f.combat.expansion.pets.summon('ironGolem',1,new THREE.Vector3(0,0,2),undefined,item);f.tick(.1);assert.equal(stats(f.hero).auras.find(a=>a.id==='meditation')?.rank,12);f.combat.expansion.pets.pets[0].hp=0;f.tick(.1);assert.equal(stats(f.hero).auras.some(a=>a.id==='meditation'),false);
});

test('normal dual-wield attacks alternate hands and normal finishers include Tiger Strike damage',t=>{
  t.mock.method(Math,'random',()=>.2);const f=fixture('barbarian'),target=f.enemy(2);f.game.target=target;
  f.hero.equipment.weapon=weapon('hax','r');f.hero.equipment.shield=weapon('hax','l');f.hero.equipment.shield.mods={damage:500};
  const before=target.hp;f.combat.melee('attack',new THREE.Vector3(0,0,1));const first=before-target.hp;
  const middle=target.hp;f.combat.melee('attack',new THREE.Vector3(0,0,1));assert.ok(middle-target.hp>first*3);
  const a=fixture('assassin'),victim=a.enemy(2);a.game.target=victim;
  const initial=victim.hp;a.combat.melee('attack',new THREE.Vector3(0,0,1));const normal=initial-victim.hp;
  a.combat.expansion.charges.tigerStrike={rank:20,stacks:3,remaining:15};const charged=victim.hp;
  a.combat.melee('attack',new THREE.Vector3(0,0,1));assert.ok(charged-victim.hp>normal*2);assert.equal(a.combat.expansion.charges.tigerStrike?.stacks,2);
});

test('Spirit of Barbs returns fixed damage and revived resistance survives serialization',t=>{
  t.mock.method(Math,'random',()=>.2);const f=fixture('druid'),target=f.enemy(2);f.hero.buffs.spiritOfBarbs={rank:1,remaining:10};
  const before=target.hp;f.combat.hurt(3,'physical',target);assert.equal(before-target.hp,50);
  const n=fixture('necromancer'),corpse=n.enemy(2);corpse.dead=true;corpse.definition=MONSTERS.skeleton;corpse.resistances.fire=110;n.game.aim.set(0,0,2);assert.ok(n.cast('revive'));
  n.hero.companions=n.combat.expansion.pets.export();const restored=parseSave(serializeSave(n.hero))!;
  n.combat.expansion.pets.clear();n.combat.expansion.pets.restore(restored.companions!);assert.equal(n.combat.expansion.pets.pets[0].resistance.fire,110);
});

test('Hustle triggers Burst of Speed on its wielder and warcries preserve mercenary buffs',()=>{
  const f=fixture('barbarian'),target=f.enemy(2),item=weapon('crs');item.sockets=3;
  for(const rune of RUNEWORDS.find(w=>w.catalogId==='d2r-Hustle-weapon')!.runes)assert.ok(socketItem(item,rune));
  f.hero.equipment.weapon=item;f.combat.itemRandom=()=>0;f.combat.triggerItems('hit-skill',target,[item]);assert.equal(f.hero.buffs.burstOfSpeed?.rank,1);
  delete f.hero.buffs.burstOfSpeed;f.hero.mercenary={status:'alive',hp:100,aura:'prayer',equipment:{weapon:{...structuredClone(item),id:'guard-hustle'},helm:null,armor:null},cold:0,poison:0};
  f.game.mercenary=new MercenaryCombat(f.game);f.combat.triggerItems('hit-skill',target,[item],true);
  assert.equal(f.hero.buffs.burstOfSpeed,undefined);assert.equal(f.hero.mercenary.buffs?.burstOfSpeed?.rank,1);
  const before=mercenaryStats(f.hero).maxHp;f.cast('battleOrders');assert.ok(mercenaryStats(f.hero).maxHp>before);
  const restored=parseSave(serializeSave(f.hero))!;assert.equal(restored.mercenary?.buffs?.battleOrders?.rank,1);assert.equal(restored.mercenary?.buffs?.burstOfSpeed?.rank,1);
});
