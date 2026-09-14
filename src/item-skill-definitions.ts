import { ITEM_SKILL_DATA } from './item-skill-data.ts';
import type { SkillDefinition, SkillValues } from './paladin.ts';

// Equipment can expose these skills even though their classes are not playable.
const rows = [
  ['fade',267,'Fade','消退','buff'], ['boneArmor',68,'Bone Armor','白骨装甲','buff'],
  ['mindBlast',273,'Mind Blast','心灵爆震','spell'], ['delirium',350,'Delerium Change','迪勒瑞姆变身','buff'],
  ['taunt',137,'Taunt','嘲弄','curse'], ['howl',130,'Howl','狂嗥','curse'],
  ['diabloFirestorm',197,'DiabWall','暗黑破坏神火风暴','spell'],
  ['amplifyDamage',66,'Amplify Damage','伤害加深','curse'], ['weaken',72,'Weaken','削弱','curse'],
  ['corpseExplosion',74,'Corpse Explosion','尸体爆炸','corpse'], ['poisonExplosion',83,'Poison Explosion','毒爆','corpse'],
  ['decrepify',87,'Decrepify','衰老','curse'], ['poisonNova',92,'Poison Nova','剧毒新星','spell'],
  ['lifeTap',82,'Life Tap','偷取生命','curse'], ['ironMaiden',76,'Iron Maiden','攻击反噬','curse'],
  ['attract',86,'Attract','吸引','curse'], ['bonePrison',88,'Bone Prison','骨牢','spell'],
  ['bloodGolem',85,'BloodGolem','鲜血石魔','summon'], ['ironGolem',90,'IronGolem','钢铁石魔','summon'],
  ['clayGolem',75,'Clay Golem','黏土石魔','summon'], ['revive',95,'Revive','重生','corpse'],
  ['grimWard',150,'Grim Ward','残酷吓阻','corpse'], ['battleCommand',155,'Battle Command','战斗指挥','buff'],
  ['battleOrders',149,'Battle Orders','战斗体制','buff'], ['battleCry',146,'Battle Cry','战斗狂嗥','curse'],
  ['berserk',152,'Berserk','狂战士','melee'], ['whirlwind',151,'Whirlwind','旋风','melee'],
  ['firestorm',225,'Firestorm','火风暴','spell'], ['twister',240,'Twister','小旋风','spell'],
  ['moltenBoulder',229,'Molten Boulder','熔浆巨岩','spell'], ['volcano',244,'Volcano','火山','spell'],
  ['arcticBlast',230,'Arctic Blast','极地风暴','spell'], ['cycloneArmor',235,'Cyclone Armor','飓风装甲','buff'],
  ['raven',221,'Raven','乌鸦','summon'], ['plaguePoppy',222,'Plague Poppy','猛毒花藤','summon'],
  ['oakSage',226,'Oak Sage','橡木智者','summon'], ['heartOfWolverine',236,'Heart of Wolverine','狼獾之心','summon'],
  ['spiritOfBarbs',246,'Spirit of Barbs','棘灵','summon'], ['summonSpiritWolf',227,'Summon Spirit Wolf','召唤灵狼','summon'],
  ['summonFenris',237,'Summon Fenris','召唤狂狼','summon'], ['summonGrizzly',247,'Summon Grizzly','召唤灰熊','summon'],
  ['wearwolf',223,'Wearwolf','狼人变化','buff'], ['wearbear',228,'Wearbear','熊人变化','buff'],
  ['shapeShifting',224,'Shape Shifting','变形术','passive'], ['feralRage',232,'Feral Rage','野性狂暴','melee'],
  ['cloakOfShadows',264,'Cloak of Shadows','魔影斗篷','curse'], ['venom',278,'Venom','毒牙','buff'],
  ['teeth',67,'Teeth','牙','spell'], ['poisonDagger',73,'Poison Dagger','淬毒匕首','melee'],
  ['boneSpear',84,'Bone Spear','骨矛','spell'], ['boneSpirit',93,'Bone Spirit','白骨之魂','spell'],
  ['dimVision',71,'Dim Vision','微暗灵视','curse'], ['terror',77,'Terror','恐惧','curse'],
  ['confuse',81,'Confuse','迷乱','curse'], ['lowerResist',91,'Lower Resist','降低抵抗','curse'],
  ['bash',126,'Bash','重击（野蛮人）','melee'], ['stun',139,'Stun','击晕','melee'],
  ['concentrate',144,'Concentrate','专心','melee'], ['fissure',234,'Fissure','地裂','spell'],
  ['tornado',245,'Tornado','龙卷风','spell'],
] as const;
export type ItemSkillId = typeof rows[number][0];
export const ITEM_SKILL_ROWS = rows;
export const ITEM_SKILLS: SkillDefinition[] = rows.map(([id,, ,name,kind]) => ({ id, name, tree: 'combat', level: ITEM_SKILL_DATA[id].level, column: 1, requires: [], icon: kind === 'summon' ? 'users' : kind === 'buff' ? 'shield' : 'sparkles', description: '由当前装备赋予的技能。', synergies: {}, itemOnly: true, ...(kind === 'buff' || kind === 'passive' ? { mode: kind } : {}) }));
export const itemSkillKind = (id: string) => rows.find(row => row[0] === id)?.[4];
export function itemSkillValues(id: ItemSkillId, rank: number): SkillValues {
  const n = Math.max(0, rank - 1), v: SkillValues = { cost: 0, damage: 0, min: 0, max: 0, attack: 0, hits: 1, duration: 0, radius: 0, type: 'physical', percent: 0, secondary: 0, healing: 0 };
  if (rank <= 0) return v;
  v.cost = 10; v.radius = 4 + n / 3; v.duration = 8 + n * 2;
  switch (id) {
    case 'fade': {
      const diminishing = Math.floor(110 * rank / (rank + 6));
      v.percent = 10 + Math.floor(65 * diminishing / 100);
      v.secondary = 40 + Math.floor(50 * diminishing / 100);
      v.duration = 120 + 12 * n; break;
    }
    case 'boneArmor': v.percent = 20 + 15 * n; v.duration = 3600; break; // D2R 2.4
    case 'delirium': v.duration = 60; v.percent = 33; break;
    case 'mindBlast': v.radius = 8 / 3; v.duration = Math.min(10, 2 + .2 * n); v.percent = 15 + Math.floor(25 * Math.floor(110 * rank / (rank + 6)) / 100); break;
    case 'taunt': v.percent = Math.min(95, 5 + 2 * n); v.radius = 14; break;
    case 'howl': v.duration = 3 + n; v.radius = 16 / 3 + n * 2 / 3; break;
    case 'fissure': v.duration = 3.2; v.radius = 14 / 3; break;
    case 'diabloFirestorm': v.duration = 3.2; v.radius = 1; v.hits = rank; break;
    case 'battleOrders': v.cost = 7; v.duration = 30 + n * 10; v.percent = 35 + n * 3; break;
    case 'battleCommand': v.cost = 11; v.duration = 5 + n * 10; v.percent = 1; break;
    case 'battleCry': v.cost = 5; v.duration = 12 + n * 2.4; v.percent = 25 + n; v.secondary = 50 + n * 2; break;
    case 'amplifyDamage': v.cost = 4; v.percent = 100; break;
    case 'decrepify': v.cost = 11; v.radius = 4; v.duration = 4 + n * .6; v.percent = 50; break;
    case 'weaken': v.cost = 4; v.percent = 33; break;
    case 'lifeTap': v.cost = 9; v.percent = 50; v.duration = 16 + n * 2.4; break;
    case 'ironMaiden': v.cost = 5; v.percent = 200 + n * 25; break;
    case 'corpseExplosion': v.cost = 15 + n; v.radius = 2.6 + n / 3; v.percent = 70; v.secondary = 120; break;
    case 'poisonExplosion': v.cost = 8; v.type = 'poison'; v.min = 25 + n * 20; v.max = 50 + n * 25; v.duration = 2 + n * .4; break;
    case 'poisonNova': v.cost = 20; v.type = 'poison'; v.min = 50 + n * 15; v.max = 90 + n * 15; v.duration = 2; v.radius = 10; break;
    case 'venom': v.cost = 12; v.duration = 120 + n * 4; v.type = 'poison'; v.min = 60 + n * 20; v.max = 80 + n * 20; break;
    case 'cycloneArmor': v.cost = 5 + n; v.percent = 40 + n * 12; v.duration = 3600; break;
    case 'wearwolf': case 'wearbear': v.duration = 40; v.percent = id === 'wearwolf' ? 25 : 75; break;
    case 'shapeShifting': v.percent = 20 + n * 5; v.duration = 40 + n * 20; break;
    case 'feralRage': v.cost = 3; v.damage = 50 + n * 5; v.attack = 20 + n * 10; v.percent = 4 + n * 4; v.duration = 20; break;
    case 'berserk': v.cost = 4; v.type = 'magic'; v.damage = 150 + n * 15; v.attack = 100 + n * 15; break;
    case 'whirlwind': v.cost = 25 + n; v.damage = -50 + n * 8; v.attack = n * 5; v.radius = 3; break;
    case 'oakSage': v.percent = 30 + n * 5; break;
    case 'heartOfWolverine': v.damage = 20 + n * 7; v.attack = 25 + n * 7; break;
    case 'spiritOfBarbs': v.percent = 50 + n * 20; break;
    case 'arcticBlast': v.type = 'cold'; v.min = 8 + n * 8; v.max = 15 + n * 8; v.duration = 4; break;
    case 'firestorm': case 'moltenBoulder': case 'volcano': v.type = 'fire'; v.min = 3 + n * 8; v.max = 7 + n * 10; v.duration = 3; break;
    case 'twister': v.min = 6 + n * 4; v.max = 8 + n * 4; v.duration = .4; break;
  }
  if (itemSkillKind(id) === 'summon') { v.healing = 100 + rank * 35; v.min = 8 + rank * 5; v.max = 15 + rank * 7; v.duration = 3600; }
  const source = ITEM_SKILL_DATA[id];
  v.cost = Math.max(source.minMana,(source.mana+source.manaStep*n)*2**(source.manaShift-8));
  const tier = (values: number[]) => { let value=values[0]; for(let i=2;i<=rank;i++) value+=values[i<=8?1:i<=16?2:i<=22?3:i<=28?4:5]; return value; };
  const element = ({pois:'poison',fire:'fire',cold:'cold',mag:'magic',ltng:'lightning'} as const)[source.element as 'pois'];
  if(element) { v.type=element; v.min=tier(source.min)*2**(source.shift-8); v.max=tier(source.max)*2**(source.shift-8); }
  else if(source.physicalMax.some(Boolean)) { v.min=tier(source.physicalMin)*2**(source.shift-8); v.max=tier(source.physicalMax)*2**(source.shift-8); }
  if (element==='poison') { const seconds=id==='venom'?.4:id==='poisonNova'?2:2+n*.4; v.min*=seconds*25; v.max*=seconds*25; if(id!=='venom')v.duration=seconds; }
  if(id==='firestorm'||id==='arcticBlast') { v.min*=25; v.max*=25; }
  if(id==='lowerResist')v.percent=25+Math.floor(45*Math.floor(110*rank/(rank+6))/100);
  if(id==='revive') { v.healing=100+rank*35; v.min=8+rank*5; v.max=15+rank*7; }
  return v;
}
