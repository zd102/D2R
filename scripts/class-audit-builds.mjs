import assert from 'node:assert/strict';
import { newHero, gainXp, learnSkill, allocateAttribute, stats, activeEquipment, skillLevel } from '../src/model.ts';
import { EXPERIENCE, skillById, skillValues } from '../src/paladin.ts';
import { BASES, RUNEWORDS, makeItem, socketItem, runewordFits, itemRequirements, specialItem } from '../src/items.ts';
import { eligibleAffixes, rollAffix } from '../src/affixes.ts';
import { AREA_LEVELS } from '../src/campaign.ts';

// Mainline 1PP, 65% clearing, no cow runs: measured by simulateProgression(.65).
export const AUDIT_STAGES = [
  {id:'start',name:'初期开荒',level:6,difficulty:0,index:1},
  {id:'normal1',name:'普通第一幕',level:12,difficulty:0,index:4},
  {id:'normal3',name:'普通第三幕',level:26,difficulty:0,index:14},
  {id:'normal5',name:'普通通关',level:36,difficulty:0,index:24},
  {id:'nightmare2',name:'噩梦第二幕',level:47,difficulty:1,index:9},
  {id:'nightmare5',name:'噩梦通关',level:65,difficulty:1,index:24},
  {id:'hell2',name:'地狱第二幕',level:75,difficulty:2,index:9},
  {id:'hell5',name:'地狱通关',level:86,difficulty:2,index:24},
];
const b=(id,classId,name,gear,main,synergies=[],options={})=>({id,classId,name,gear,main,synergies,...options});
export const AUDIT_BUILDS=[
  b('zeal','paladin','双热','melee',['sacrifice','zeal'],['fanaticism','sacrifice','zeal'],{aura:'fanaticism'}),
  b('hammer','paladin','祝福之锤','caster',['holyBolt','blessedHammer'],['vigor','blessedAim','concentration'],{aura:'concentration',range:3.3}),
  b('foh','paladin','天堂之拳／圣光弹','caster',['holyBolt','fistOfHeavens'],['holyBolt','holyShock','conviction'],{aura:'conviction',range:8}),
  b('vengeance','paladin','复仇','melee',['sacrifice','vengeance'],['resistFire','resistCold','resistLightning'],{aura:'conviction'}),
  b('holyfire','paladin','圣火热诚','melee',['sacrifice','zeal'],['holyFire','resistFire','salvation'],{aura:'holyFire',mainRank:4}),
  b('holyshock','paladin','圣冲热诚','melee',['sacrifice','zeal'],['holyShock','resistLightning','salvation'],{aura:'holyShock',mainRank:4}),
  b('smite','paladin','盾击','melee',['smite'],['fanaticism','holyShield','defiance'],{aura:'fanaticism'}),
  b('bow','amazon','物理弓','bow',['magicArrow','strafe'],['guidedArrow','multipleShot','penetrate'],{range:8}),
  b('coldbow','amazon','冰箭弓','bow',['coldArrow','iceArrow','freezingArrow'],['coldArrow','iceArrow','penetrate'],{range:8}),
  b('firebow','amazon','火箭弓','bow',['fireArrow','explodingArrow','immolationArrow'],['explodingArrow','fireArrow','penetrate'],{range:8}),
  b('javazon','amazon','电标／充能一击','javelin',['jab','powerStrike','chargedStrike'],['lightningFury','powerStrike','lightningStrike'],{aoe:'lightningFury'}),
  b('poisonjav','amazon','毒标枪','javelin',['jab','poisonJavelin','plagueJavelin'],['poisonJavelin','chargedStrike','powerStrike'],{range:8}),
  b('fireball','sorceress','火球／陨石','caster',['fireBolt','fireBall'],['fireMastery','fireBolt','meteor'],{aoe:'meteor',range:8}),
  b('hydra','sorceress','九头海蛇','caster',['fireBolt','fireBall','hydra'],['fireMastery','fireBall','fireBolt'],{range:8}),
  b('blizzard','sorceress','暴风雪','caster',['iceBolt','iceBlast','blizzard'],['coldMastery','iceBlast','glacialSpike','iceBolt'],{range:8}),
  b('orb','sorceress','冰封球／火球双修','caster',['iceBolt','iceBlast','frozenOrb'],['coldMastery','fireBall','fireMastery','fireBolt','iceBolt'],{range:7.5}),
  b('lightning','sorceress','闪电／连锁闪电','caster',['chargedBolt','lightning'],['lightningMastery','chainLightning','chargedBolt','nova'],{aoe:'chainLightning',range:8}),
  b('nova','sorceress','新星','caster',['chargedBolt','nova'],['lightningMastery','staticField','thunderStorm'],{range:4}),
  b('summonnec','necromancer','骷髅尸爆','caster',['teeth'],['raiseSkeleton','skeletonMastery','corpseExplosion','raiseSkeletalMage'],{mainRank:1,pets:['raiseSkeleton','raiseSkeletalMage','clayGolem'],curse:'amplifyDamage',corpseExplosion:true,range:8}),
  b('bone','necromancer','白骨','caster',['teeth','boneSpear'],['teeth','boneWall','bonePrison','boneSpirit'],{range:8}),
  b('poisonnec','necromancer','毒素尸爆','dagger',['poisonDagger','poisonNova'],['poisonDagger','poisonExplosion','corpseExplosion'],{curse:'lowerResist',corpseExplosion:true,pets:['clayGolem'],range:5}),
  b('frenzy','barbarian','狂乱双持','dual',['bash','doubleSwing','frenzy'],['doubleSwing','taunt','axeMastery','battleOrders']),
  b('whirlwind','barbarian','旋风','dual',['bash','doubleSwing','whirlwind'],['axeMastery','battleOrders','shout']),
  b('berserk','barbarian','狂战士','melee',['bash','concentrate','berserk'],['battleOrders','howl','swordMastery']),
  b('throw','barbarian','双投','throw',['bash','doubleThrow'],['throwingMastery','doubleSwing','battleOrders'],{range:8}),
  b('warcry','barbarian','战斗狂嗥','caster',['bash','warCry'],['battleCry','taunt','howl','battleOrders'],{range:3.3}),
  b('firedruid','druid','火系元素','caster',['firestorm','fissure'],['firestorm','volcano','moltenBoulder','armageddon'],{pets:['oakSage'],aoe:'volcano',range:7}),
  b('wind','druid','风系','caster',['arcticBlast','twister','tornado'],['hurricane','cycloneArmor','twister'],{pets:['oakSage'],range:4.5}),
  b('fury','druid','狂怒狼人','twohand',['feralRage','fury'],['shapeShifting','wearwolf','feralRage','summonGrizzly'],{form:'wearwolf',pets:['heartOfWolverine']}),
  b('maul','druid','撞槌熊人','twohand',['maul'],['shapeShifting','wearbear','summonGrizzly','heartOfWolverine'],{form:'wearbear',pets:['heartOfWolverine']}),
  b('fireclaws','druid','焰爪熊人','twohand',['maul','fireClaws'],['firestorm','moltenBoulder','shapeShifting'],{form:'wearbear',pets:['oakSage']}),
  b('summondruid','druid','动物园召唤','caster',['raven'],['summonGrizzly','summonFenris','summonSpiritWolf','raven'],{pets:['summonSpiritWolf','summonFenris','summonGrizzly','heartOfWolverine','raven'],range:8}),
  b('lighttraps','assassin','雷光／亡者守卫','claw',['fireBlast','chargedBoltSentry','lightningSentry'],['deathSentry','shockWeb','chargedBoltSentry','fireBlast'],{traps:true,range:8}),
  b('firetraps','assassin','火焰陷阱','claw',['fireBlast','wakeOfFire'],['fireBlast','wakeOfInferno','deathSentry'],{traps:true,range:8}),
  b('martial','assassin','聚气武学','claw',['tigerStrike','fistsOfFire','clawsOfThunder','phoenixStrike'],['clawsOfThunder','fistsOfFire','bladesOfIce','clawMastery'],{finisher:'dragonClaw'}),
  b('kicks','assassin','踢击','kick',['dragonTalon'],['venom','deathSentry','clawMastery','shadowMaster'],{pets:['shadowMaster']}),
  b('blades','assassin','刃之怒','claw',['fireBlast','bladeFury'],['bladeSentinel','bladeShield','clawMastery'],{range:8}),
];
const make=code=>{const base=BASES.find(b=>b.baseCode===code);assert.ok(base,code);return makeItem(base,`audit-${code}`);};
function word(code,id){const item=make(code),recipe=RUNEWORDS.find(w=>w.catalogId===id||w.name===id);assert.ok(recipe,id);assert.ok((BASES.find(b=>b.baseCode===code).sockets??0)>=recipe.runes.length,`${code}: socket cap`);item.sockets=recipe.runes.length;assert.ok(runewordFits(item,recipe),`${code}/${id}`);for(const rune of recipe.runes)assert.ok(socketItem(item,rune,()=>.5));assert.equal(item.catalogId,recipe.catalogId);return item;}
// Select up to four existing legal affixes, with median rolls and no duplicate
// groups. This is a controlled moderate equipment budget, not a drop simulation.
function rare(code,stage,wants){
  const item=make(code);item.rarity='rare';item.level=AREA_LEVELS[stage.difficulty][stage.index];item.mods={};item.affixes=[];
  const pool=eligibleAffixes(item).filter(a=>a.requiredLevel<=stage.level),selected=[];
  for(const key of wants){
    const candidates=pool.filter(a=>!selected.some(s=>s.group===a.group)&&selected.filter(s=>s.kind===a.kind).length<3&&rollAffix(a,()=>.5).mods[key]);
    candidates.sort((a,b)=>rollAffix(b,()=>.5).mods[key]-rollAffix(a,()=>.5).mods[key]);
    // Avoid turning a moderate reference into a collection of perfect high tiers.
    const affix=candidates[Math.min(candidates.length-1,Math.floor(candidates.length/3))];
    if(!affix||selected.length>=4)continue;selected.push(affix);item.affixes.push(affix.id);
    for(const [mod,value] of Object.entries(rollAffix(affix,()=>.5).mods))item.mods[mod]=(item.mods[mod]??0)+value;
  }
  item.requiredLevel=Math.max(item.requiredLevel??1,...selected.map(a=>a.requiredLevel));item.name=`审计样本 ${item.name}`;return item;
}
export function auditHero(build,stage,{poor=false,mosaic=false,combatGear=false,white=false}={}){
  const h=newHero(build.classId),l=stage.level;gainXp(h,EXPERIENCE[l-1]);h.difficultyLevel=stage.difficulty;h.campaign.current=stage.index;h.campaign.cleared=[25,25,25];h.unlockedDifficulty=2;
  h.skillPoints=l-1+stage.difficulty*4+(stage.index>=5?2:0)+(stage.index>=16?2:0);const skillBudget=h.skillPoints;
  h.points=(l-1)*5;for(const key of ['strength','dexterity','vitality','energy'])h[key]+=(stage.difficulty+Number(stage.index>=11))*5;
  h.bonusResist=(stage.difficulty+Number(stage.index>=22))*5;
  const caster=build.gear==='caster'||build.id==='poisonnec'&&l>=30,early=l<27,late=l>=60;
  let weapon;
  if(caster)weapon=l>=25?word('crs','精神'):make(build.classId==='necromancer'?'wnd':'sst');
  else if(build.gear==='bow')weapon=l>=27?word(late?'6hb':'8hb','Runeword62'):l>=15?word('hbw','Runeword31'):rare('hbw',stage,['damage','ias','attackRating']);
  else if(build.gear==='javelin')weapon=rare(early?'jav':late?'7ja':'9ja',stage,['damage','ias','attackRating','manaSteal']);
  else if(build.gear==='throw')weapon=rare(early?'tax':late?'7ta':'9ta',stage,['damage','ias','attackRating','lifeSteal']);
  else if(['claw','kick'].includes(build.gear))weapon=rare(early?'ktr':late?'7ar':'9ar',stage,[`${build.classId}Skills`,'damage','ias','lifeSteal']);
  else if(build.gear==='dagger')weapon=rare(early?'dgr':late?'7dg':'9dg',stage,['damage','ias','lifeSteal','attackRating']);
  else if(build.gear==='twohand')weapon=l>=27?word(late?'7ba':l>=47?'9m9':'mau','荣耀'):l>=13?word('btx','钢铁'):make('lax');
  else weapon=l>=27?word(build.gear==='dual'?(l>=72?'7ax':'92a'):(l>=72?'7cr':'9cr'),l>=72?'誓约':'荣耀'):l>=13?word('hax','钢铁'):make('hax');
  if(white&&['bone','poisonnec'].includes(build.id)&&l>=35)weapon=word('bwn','白色');
  if(mosaic&&build.id==='martial'&&l>=53)weapon=word('9tw','d2r-Mosaic');
  if(poor&&l>=27){weapon=structuredClone(weapon);if(weapon.rarity==='runeword')weapon=make(weapon.baseCode);else{weapon.mods={};weapon.affixes=[];weapon.rarity='common';}}
  h.equipment.weapon=weapon;
  h.equipment.shield=['dual','throw','claw'].includes(build.gear)?{...structuredClone(weapon),id:'audit-offhand'}:['bow','twohand'].includes(build.gear)||weapon.twoHanded?null:l>=21?word('lrg','先祖之誓'):make('buc');
  h.equipment.armor=l>=37&&!poor?word('xui','烟雾'):l>=17?word('lea','隐密'):make('lea');
  h.equipment.helm=l>=27?word('hlm','知识'):make('cap');
  if(l>=12)h.equipment.gloves=rare('lgl',stage,['ias','fireRes','lightningRes']);
  if(l>=12)h.equipment.boots=rare(build.gear==='kick'?(l>=80?'uhb':l>=60?'xhb':l>=36?'xlb':l>=20?'tbt':'mbt'):'lbt',stage,['runWalk','coldRes','lightningRes']);
  if(l>=20)h.equipment.belt=rare('lbl',stage,['life','fhr','fireRes']);
  if(l>=20)h.equipment.ring=rare('rin',stage,[caster?'fcr':'attackRating',caster?'mana':'lifeSteal','lightningRes','life']);
  if(l>=30)h.equipment.ring2={...rare('rin',stage,[caster?'fcr':'manaSteal','fireRes','life']),id:'audit-ring2'};
  if(l>=30)h.equipment.amulet=rare('amu',stage,[`${build.classId}Skills`,'allRes','life',caster?'fcr':'attackRating']);
  if(poor){h.equipment.ring2=null;h.equipment.amulet=null;}
  if(combatGear&&l>=50){for(const id of ['set-105','unique-242','unique-276']){const item=specialItem(id,()=>.5);item.identified=true;h.equipment[item.slot]=item;}}
  const gear=Object.values(h.equipment).filter(Boolean);
  for(const key of ['strength','dexterity']){const need=Math.max(0,...gear.map(i=>itemRequirements(i)[key]-h[key]));assert.ok(!need||allocateAttribute(h,key,need),`${build.id}/${l}/${key}`);}
  if(build.gear==='bow')allocateAttribute(h,'dexterity',Math.min(h.points,l*2));
  else if(!caster&&!['claw','kick'].includes(build.gear))allocateAttribute(h,'dexterity',Math.min(h.points,Math.max(0,20+l-h.dexterity)));
  if(caster&&l<=26)allocateAttribute(h,'energy',Math.min(h.points,20));
  if(h.points)allocateAttribute(h,'vitality',h.points);
  const learn=(id,rank=1)=>{if(!id||l<skillById[id].level)return;for(const req of skillById[id].requires)if(!h.skills[req])learn(req);while(h.skills[id]<rank&&learnSkill(h,id)){};};
  const unlocked=build.main.filter(id=>skillById[id].level<=l);let primary=unlocked.at(-1)??'attack';
  const utility=build.classId==='sorceress'?['warmth','frozenArmor','staticField']:build.classId==='paladin'?['holyShield']:build.classId==='barbarian'?['battleOrders','shout','battleCommand','naturalResistance']:build.classId==='amazon'?['criticalStrike','dodge','avoid','penetrate','pierce']:build.classId==='necromancer'?['boneArmor',...(build.pets?.length?['golemMastery','summonResist']:[])]:build.classId==='assassin'?['clawMastery','burstOfSpeed','fade','weaponBlock']:[];
  for(const id of [build.form,build.curse,build.finisher,...utility,...(build.pets??[])])learn(id);
  if(mosaic&&build.id==='martial'){learn('cobraStrike');learn('dragonTalon',6);}
  if(build.corpseExplosion)learn('corpseExplosion');if(build.aura)learn(build.aura,1);
  if(primary!=='attack')learn(primary,build.mainRank??20);
  for(const id of build.synergies)learn(id,id==='coldMastery'?10:20);
  for(const id of [...build.main,build.aura,...utility])learn(id,20);
  if(build.aura)h.activeAura=h.skills[build.aura]?build.aura:(h.skills.might?'might':null);
  h.bindings.attack=primary;h.bindings.cleave=primary;if(build.finisher&&h.skills[build.finisher])h.bindings.ward=build.finisher;
  assert.ok(Object.values(h.skills).reduce((a,n)=>a+n,0)<=skillBudget);
  assert.equal(activeEquipment(h).length,gear.length,`${build.id}/${l}: unusable gear`);
  for(const item of gear){assert.ok((item.requiredLevel??1)<=l,`${build.id}/${l}/${item.name}: level ${item.requiredLevel}`);assert.ok((BASES.find(b=>b.baseCode===item.baseCode)?.qualityLevel??1)<=AREA_LEVELS[stage.difficulty][stage.index]+3,`${build.id}/${l}/${item.name}: base too advanced`);}
  if(primary!=='attack'&&!skillLevel(h,primary))primary='attack';h.bindings.attack=primary;
  const s=stats(h);h.hp=s.maxHp;h.mana=s.maxMana;h.stamina=s.maxStamina;
  return {hero:h,primary,skillBudget};
}
export function buildMetrics(build,stage,options){const {hero:h,primary,skillBudget}=auditHero(build,stage,options),s=stats(h),v=skillValues(primary,skillLevel(h,primary),h.skills);return {id:build.id,classId:h.classId,stage:stage.id,primary,rank:skillLevel(h,primary),skillBudget,life:Math.round(s.maxHp),mana:Math.round(s.maxMana),attack:Math.round(s.attack),attackRating:s.attackRating,defense:s.defense,resists:s.resistances,cost:v.cost,skills:Object.fromEntries(Object.entries(h.skills).filter(([,n])=>n)),gear:Object.entries(h.equipment).filter(([,i])=>i).map(([slot,i])=>({slot,base:i.baseCode,name:i.name,mods:i.mods,affixes:i.affixes,requiredLevel:i.requiredLevel}))};}
