import { ORIGINAL_CLASS_SKILLS } from './class-skill-data.ts';
import type { SkillDefinition, SkillValues, SkillId, DamageType } from './paladin.ts';

export type ClassSkillMode = 'bow' | 'javelin' | 'spear' | 'spell' | 'buff' | 'passive' | 'summon';
export type ExtraSkillTree = 'javelin' | 'passive' | 'bow' | 'cold' | 'lightning' | 'fire';
const rows = [
  ['jab','戳刺','javelin',1,'spear','快速连续刺击三次，需要长矛或标枪。'],
  ['powerStrike','威力一击','javelin',2,'spear','刺击附加闪电伤害并提高准确率。'],
  ['poisonJavelin','毒枪','javelin',3,'javelin','投掷标枪并留下毒云，毒素持续伤害不重复叠加。'],
  ['impale','刺爆','javelin',1,'spear','缓慢而强力的刺击，有概率额外损耗武器耐久。'],
  ['lightningBolt','闪电球','javelin',3,'javelin','标枪的物理伤害转为闪电，并附加闪电伤害。'],
  ['chargedStrike','充能一击','javelin',2,'spear','刺击时释放多枚充能弹，需要长矛或标枪。'],
  ['plagueJavelin','瘟疫标枪','javelin',3,'javelin','标枪落点形成毒云，毒素伤害持续生效。'],
  ['fend','击退','javelin',1,'spear','连续刺击身边不同敌人，每个目标最多命中一次。'],
  ['lightningStrike','闪电攻击','javelin',2,'spear','刺击触发连锁闪电，沿附近敌人传播。'],
  ['lightningFury','闪电之怒','javelin',3,'javelin','标枪命中后分裂闪电，追击周围不同目标。'],
  ['innerSight','内视','passive',1,'spell','照亮附近敌人并暂时降低固定防御值。'],
  ['criticalStrike','双倍打击','passive',3,'passive','物理攻击有概率造成双倍伤害，与致命攻击依次判定。'],
  ['dodge','闪躲','passive',2,'passive','站立或攻击时，有概率躲避近战攻击。'],
  ['slowMissiles','慢速箭','passive',1,'spell','暂时降低附近敌人的远程投射物速度。'],
  ['avoid','躲避','passive',2,'passive','站立或攻击时，有概率躲避远程攻击。'],
  ['penetrate','刺入','passive',3,'passive','被动增加武器攻击准确率。'],
  ['dopplezon','诱饵','passive',1,'summon','在指定位置召唤诱饵吸引敌人攻击，同时只能存在一个。'],
  ['evade','回避','passive',2,'passive','移动时有概率躲避近战和远程攻击。'],
  ['valkyrie','女武神','passive',1,'summon','召唤持矛女武神协助战斗，同时只能存在一个。'],
  ['pierce','穿透','passive',3,'passive','箭矢与投掷武器有概率穿透敌人；引导箭不穿透。'],
  ['magicArrow','魔法箭','bow',2,'bow','将部分物理伤害转成魔法，不消耗箭矢。'],
  ['fireArrow','火焰箭','bow',3,'bow','箭矢附加火焰伤害，并转换部分物理伤害。'],
  ['coldArrow','冰箭','bow',1,'bow','箭矢附加冰冷伤害并减速，转换部分物理伤害。'],
  ['multipleShot','多重箭','bow',2,'bow','扇形发射多支箭，造成 75% 武器伤害；同次齐射每个目标只命中一次。'],
  ['explodingArrow','爆裂箭','bow',3,'bow','箭矢命中后爆炸，造成范围火焰伤害。'],
  ['iceArrow','急冻箭','bow',1,'bow','箭矢冻结普通敌人，首领仅减速。'],
  ['guidedArrow','引导箭','bow',2,'bow','箭矢追踪目标并必定命中，不能穿透墙壁。'],
  ['immolationArrow','牺牲之箭','bow',3,'bow','命中爆炸并留下燃烧区域，具有施放间隔。'],
  ['strafe','炮轰','bow',2,'bow','连续自动射击附近敌人，施放期间站定并逐箭消耗弹药。'],
  ['freezingArrow','冻结之箭','bow',1,'bow','箭矢造成范围冰冷伤害，冻结普通敌人。'],
  ['iceBolt','冰弹','cold',2,'spell','发射冰弹，造成冰冷伤害并减速。'],
  ['frozenArmor','冰封装甲','cold',3,'buff','增加防御；受到近战攻击后冻结攻击者。三种冰甲互相替换。'],
  ['frostNova','霜之新星','cold',1,'spell','释放冰冷圆环，伤害并减速附近敌人。'],
  ['iceBlast','冰风暴','cold',2,'spell','发射冰球冻结单个普通敌人，首领仅减速。'],
  ['shiverArmor','碎冰甲','cold',3,'buff','增加防御，受到近战攻击后反击冰冷伤害并减速。'],
  ['glacialSpike','冰尖柱','cold',2,'spell','冰柱命中后造成范围冰冷伤害和冻结。'],
  ['blizzard','暴风雪','cold',1,'spell','指定区域持续落下冰雪，同一目标每秒受到一次伤害。'],
  ['chillingArmor','寒冰装甲','cold',3,'buff','增加防御，受到远程攻击后向攻击者发射冰弹。'],
  ['frozenOrb','冰封球','cold',1,'spell','移动的冰球沿途放出冰弹，终点向四周爆散。'],
  ['coldMastery','支配冰冷','cold',2,'passive','降低敌人的冰冷抗性，无法单独破除冰冷免疫。'],
  ['chargedBolt','充能弹','lightning',2,'spell','向前释放多枚电弧，命中时造成闪电伤害。'],
  ['staticField','静态力场','lightning',1,'spell','削减附近敌人当前生命的 25%，受闪电抗性影响。噩梦保留至少 33% 生命，地狱保留至少 50%。'],
  ['telekinesis','心灵传动','lightning',3,'spell','隔空开启箱子、拾取金币和补给，或打击并击退普通敌人。投入点数降低能量护盾耗蓝。'],
  ['nova','新星','lightning',1,'spell','释放闪电圆环，打击附近敌人。'],
  ['lightning','闪电','lightning',2,'spell','发射贯穿直线目标的闪电，伤害波动较大。'],
  ['chainLightning','连锁闪电','lightning',2,'spell','闪电从鼠标方向的目标跳向附近敌人，同次施法不重复命中。'],
  ['teleport','传送','lightning',3,'spell','传送到鼠标方向的可站立位置，最远 12 码；无法落入障碍。'],
  ['thunderStorm','雷云风暴','lightning',1,'buff','一段时间内自动以闪电打击附近单个敌人。'],
  ['energyShield','能量护盾','lightning',3,'buff','将部分伤害转由法力承担，毒素和生命反噬不受保护。'],
  ['lightningMastery','支配闪电','lightning',2,'passive','提高所有闪电技能伤害。'],
  ['fireBolt','火弹','fire',2,'spell','发射一枚火弹，命中造成火焰伤害。'],
  ['warmth','暖气','fire',3,'passive','被动提高法力回复速度。'],
  ['inferno','地狱之火','fire',1,'spell','向鼠标方向喷射短时火焰，每次施放造成一段持续伤害。'],
  ['blaze','烈焰之径','fire',1,'buff','移动时在脚下留下燃烧轨迹。'],
  ['fireBall','火球','fire',2,'spell','发射火球，命中爆炸并伤害附近敌人。'],
  ['fireWall','火墙','fire',1,'spell','在指定位置生成横向火墙，持续灼烧穿过的敌人。'],
  ['enchant','强化','fire',3,'buff','暂时提高自身武器的准确率及火焰伤害，切换武器后仍然有效。'],
  ['meteor','陨石','fire',2,'spell','短暂预警后陨石砸向指定位置，造成爆炸并留下火焰。'],
  ['fireMastery','支配火焰','fire',1,'passive','提高所有火焰技能伤害。'],
  ['hydra','九头海蛇','fire',3,'summon','召唤三头火蛇射击附近敌人，最多同时存在三组，持续 10 秒。'],
] as const;
export type ExtraSkillId = typeof rows[number][0];
const names = new Map(rows.map(row => [row[0],row[1]]));
const originalNames = new Map(Object.entries(ORIGINAL_CLASS_SKILLS).map(([id,row])=>[row.name,id as ExtraSkillId]));
export const classSkillMode = (id: string) => rows.find(row=>row[0]===id)?.[4];
export const classSkillSynergies = (id: ExtraSkillId): Partial<Record<SkillId, number>> => {
  if(id==='blaze') return { warmth:4,fireWall:1 };
  if(id==='fireWall') return { warmth:4,inferno:1 };
  const source=ORIGINAL_CLASS_SKILLS[id];
  return Object.fromEntries([...source.synergy.matchAll(/skill\('([^']+)'\.blvl\)/g)].flatMap(match=>originalNames.has(match[1])?[[originalNames.get(match[1])!,source.params[7]]]:[]));
};
const skillIcons:Partial<Record<ExtraSkillId,string>>={jab:'sword',powerStrike:'zap',poisonJavelin:'skull',impale:'swords',lightningBolt:'zap',chargedStrike:'sparkles',plagueJavelin:'wind',fend:'rotate-ccw',lightningStrike:'focus',lightningFury:'sun',innerSight:'scan-eye',criticalStrike:'swords',dodge:'footprints',slowMissiles:'wind',avoid:'shield',penetrate:'crosshair',dopplezon:'user-round',evade:'arrow-left-right',valkyrie:'crown',pierce:'arrow-up',magicArrow:'sparkles',fireArrow:'flame',coldArrow:'snowflake',multipleShot:'arrow-up',explodingArrow:'sun',iceArrow:'gem',guidedArrow:'crosshair',immolationArrow:'flame',strafe:'focus',freezingArrow:'snowflake',iceBolt:'snowflake',frozenArmor:'shield',frostNova:'circle',iceBlast:'wind',shiverArmor:'shirt',glacialSpike:'gem',blizzard:'wind',chillingArmor:'shield-check',frozenOrb:'focus',coldMastery:'snowflake',chargedBolt:'sparkles',staticField:'focus',telekinesis:'hand',nova:'sun',lightning:'zap',chainLightning:'arrow-left-right',teleport:'footprints',thunderStorm:'wind',energyShield:'shield-check',lightningMastery:'zap',fireBolt:'flame',warmth:'heart-pulse',inferno:'wind',blaze:'footprints',fireBall:'circle',fireWall:'rectangle-ellipsis',enchant:'sword',meteor:'arrow-down',fireMastery:'sun',hydra:'flame'};
export const CLASS_SKILLS: SkillDefinition[] = rows.map(([id,name,tree,column,mode,description])=>({
  id,name,tree,column,mode,description,classId: ORIGINAL_CLASS_SKILLS[id].classId as 'amazon'|'sorceress',
  level: ORIGINAL_CLASS_SKILLS[id].level, requires: ORIGINAL_CLASS_SKILLS[id].requires as SkillId[],
  icon:skillIcons[id]??'sparkles',
  synergies: Object.fromEntries(Object.entries(classSkillSynergies(id)).map(([key,value])=>[key,`+${value}% 伤害 / 点`])),
}));
export const extraSkillName = (id: ExtraSkillId) => names.get(id)!;
const tier = (rank: number, values: number[]) => { let value=values[0]; for(let level=2;level<=rank;level++) value+=values[level<=8?1:level<=16?2:level<=22?3:level<=28?4:5]??values.at(-1)!; return value; };
const diminishing = (rank:number,min:number,max:number)=>min+Math.floor((max-min)*Math.floor(110*rank/(rank+6))/100);
export function extraSkillValues(id: ExtraSkillId, rank: number, hard: Partial<Record<SkillId,number>>): SkillValues {
  const source=ORIGINAL_CLASS_SKILLS[id], p=(id:SkillId)=>hard[id]??0, n=rank-1;
  const multiplier=1+Object.entries(classSkillSynergies(id)).reduce((sum,[key,value])=>sum+p(key as SkillId)*value!,0)/100;
  const v:SkillValues={cost:0,damage:0,min:0,max:0,attack:0,hits:1,duration:0,radius:0,type:'physical',percent:0,secondary:0,healing:0};
  if(rank<=0) return v;
  v.cost=Math.max(source.minMana,(source.mana+source.manaStep*n)*2**(source.manaShift-8));
  v.type=({ltng:'lightning',pois:'poison',fire:'fire',cold:'cold',mag:'magic'} as Record<string,DamageType>)[source.element]??'physical';
  if(source.element) { v.min=tier(rank,source.min)*2**(source.shift-8)*multiplier; v.max=tier(rank,source.max)*2**(source.shift-8)*multiplier; }
  v.duration=tier(rank,[...source.length,source.length[3],source.length[3]])/25;
  if(v.type==='poison') { v.min*=v.duration*25; v.max*=v.duration*25; }
  // Ground fire combines the three overlapping fire missiles used by LoD.
  if(['inferno','blaze','fireWall'].includes(id)) { const frames=id==='inferno'?25:75;v.min*=frames; v.max*=frames; }
  switch(id) {
    case 'jab': v.hits=3; v.damage=-15+3*n;v.attack=10+9*n;break;
    case 'powerStrike':v.attack=20+12*n;break;
    case 'impale':v.damage=300+25*n;v.attack=100+25*n;v.percent=50-diminishing(rank,0,30);break;
    case 'fend':v.damage=70+10*n;v.attack=40+10*n;v.hits=10;break;
    case 'chargedStrike':v.hits=3+Math.floor(rank/5);break;
    case 'lightningStrike':v.hits=Math.min(20,2+rank);break;
    case 'lightningFury':v.hits=Math.min(24,rank+1);v.radius=10;break;
    case 'plagueJavelin':v.radius=3;break;
    case 'lightningBolt':v.percent=100;break;
    case 'magicArrow':v.damage=rank;v.percent=rank;v.attack=10+9*n;break;
    case 'fireArrow':case 'coldArrow':v.percent=Math.min(100,3+2*n);v.attack=10+9*n;break;
    case 'multipleShot':v.hits=Math.min(24,rank+1);break;
    case 'guidedArrow':v.damage=5*n;break;
    case 'strafe':v.damage=5*rank;v.hits=Math.min(10,rank+4);v.secondary=2+Math.floor(rank/4);break;
    case 'explodingArrow':case 'immolationArrow':case 'freezingArrow':v.radius=2.5;v.attack=20+9*n;break;
    case 'iceArrow':v.attack=20+9*n;v.duration*=1+.05*p('freezingArrow');break;
    case 'innerSight':v.secondary=tier(rank,source.min);v.duration=8+4*n;v.radius=12;break;
    case 'slowMissiles':v.percent=67;v.duration=12+6*n;v.radius=12;break;
    case 'criticalStrike':case 'dodge':case 'avoid':case 'evade':case 'pierce':v.percent=diminishing(rank,source.params[0],source.params[1]);break;
    case 'penetrate':v.attack=35+10*n;break;
    case 'dopplezon':v.duration=10+5*n;v.percent=50+10*n;break;
    case 'valkyrie':v.healing=(400+80*n)*(1+.2*p('dopplezon'));v.min=12+10*rank;v.max=20+15*rank;v.duration=0;break;
    case 'warmth':v.percent=30+12*n;break;
    case 'fireMastery':v.percent=30+7*n;break;
    case 'lightningMastery':v.percent=50+12*n;break;
    case 'coldMastery':v.percent=20+5*n;break;
    case 'frozenArmor':case 'shiverArmor':case 'chillingArmor':v.percent=source.params[0]+source.params[1]*n;v.duration=(source.params[2]+source.params[3]*n)/25+10*(p('frozenArmor')+p('shiverArmor')+p('chillingArmor')-p(id));break;
    case 'staticField':v.percent=25;v.radius=Math.min(14,3.3+n*2/3);break;
    case 'telekinesis':v.duration=.4;v.radius=12;break;
    case 'teleport':v.radius=12;break;
    case 'energyShield':v.percent=Math.min(95,tier(rank,source.min));v.secondary=Math.max(.75,2-p('telekinesis')/16);v.duration=144+60*n;break;
    case 'enchant':v.attack=20+9*n;v.duration=144+24*n;break;
    case 'blaze':v.duration=4.6+n;break;
    case 'inferno':v.radius=Math.min(8,3+rank*.2);v.cost=Math.max(1,v.cost*8);v.duration=.6;break;
    case 'thunderStorm':v.duration=32+8*n;v.radius=11;v.secondary=Math.max(.8,3.5-rank*.1);break;
    case 'hydra':v.duration=10;v.hits=3;v.radius=12;break;
    case 'blizzard':v.duration=4;v.radius=3.5;break;
    case 'meteor':v.duration=4;v.radius=3;break;
    case 'fireWall':v.duration=3.6;v.radius=Math.min(7,3+rank*.15);break;
    case 'nova':case 'frostNova':v.radius=6;break;
    case 'chargedBolt':v.hits=Math.min(24,rank+2);break;
    case 'chainLightning':v.hits=Math.min(12,5+Math.floor(rank/5));break;
    case 'fireBall':v.radius=2.2;break;
    case 'glacialSpike':v.radius=2.2;v.duration=(2+n*.12)*(1+.03*p('blizzard'));break;
    case 'frozenOrb':v.radius=9;break;
  }
  return v;
}
