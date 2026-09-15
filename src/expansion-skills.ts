import { EXPANSION_SKILL_DATA, type ExpansionSkillId } from './expansion-skill-data.ts';
import type { SkillDefinition, SkillId, SkillValues, DamageType } from './paladin.ts';
import { CLASSES, type ClassId } from './classes.ts';

export type { ExpansionSkillId } from './expansion-skill-data.ts';
export type ExpansionSkillTree = 'curses' | 'poisonBone' | 'necromancy' | 'barbarianCombat' | 'masteries' | 'warcries' | 'natureSummoning' | 'shapeshifting' | 'elemental' | 'traps' | 'shadow' | 'martialArts';
export type ExpansionSkillMode = 'curse' | 'corpse' | 'melee' | 'motion' | 'trap' | 'chargeUp' | 'finisher' | 'spell' | 'buff' | 'passive' | 'summon';
type Row = [string, ExpansionSkillMode, string];
const rows: Record<ExpansionSkillId, Row> = {
  amplifyDamage:['伤害加深','curse','降低范围内敌人的物理抗性；与大多数诅咒互相覆盖。'],
  teeth:['牙','spell','扇形发射骨牙，造成魔法伤害；同次施法每个目标只中一枚。'],
  boneArmor:['白骨装甲','buff','吸收物理伤害；重新施放恢复吸收量。'],
  skeletonMastery:['支配骷髅','passive','提高骷髅战士、骷髅法师与重生怪物的生命和伤害。'],
  raiseSkeleton:['骷髅复苏','corpse','消耗尸体召唤骷髅战士；技能等级提高数量上限。'],
  dimVision:['微暗灵视','curse','使范围内普通敌人失明，停止远距离索敌。'],
  weaken:['削弱','curse','降低敌人的物理伤害，减伤随技能等级提高。'],
  poisonDagger:['淬毒匕首','melee','需要匕首；刺击附加持续毒素伤害和准确率。'],
  corpseExplosion:['尸体爆炸','corpse','消耗尸体，以其基础生命造成各半的物理和火焰范围伤害。'],
  clayGolem:['黏土石魔','summon','召唤能减速敌人的石魔；四种石魔只能存在一种。'],
  ironMaiden:['攻击反噬','curse','敌人近战攻击时受到物理反噬。'],
  terror:['恐惧','curse','驱散附近普通敌人；首领不受恐惧影响。'],
  boneWall:['骨墙','spell','生成可被敌人击碎的骨墙，阻挡移动和投射物。'],
  golemMastery:['支配石魔','passive','提高石魔生命、移动速度与准确率。'],
  raiseSkeletalMage:['骷髅法师','corpse','消耗尸体召唤火、冰、电或毒系骷髅法师。'],
  confuse:['迷乱','curse','使普通敌人暂时相互攻击，仍可能攻击你。'],
  lifeTap:['偷取生命','curse','攻击被诅咒敌人时，按实际物理伤害恢复生命。'],
  poisonExplosion:['毒爆','corpse','消耗尸体生成持续毒云，毒素不重复叠加。'],
  boneSpear:['骨矛','spell','发射贯穿敌人的骨矛，造成魔法伤害。'],
  bloodGolem:['鲜血石魔','summon','召唤通过攻击吸血并治疗主人的石魔。'],
  attract:['吸引','curse','使普通敌人成为周围怪物的攻击目标；其他诅咒不能覆盖。'],
  decrepify:['衰老','curse','降低物理抗性、伤害和行动速度。'],
  bonePrison:['骨牢','spell','以可被击碎的骨柱围困目标。'],
  summonResist:['召唤抵抗','passive','提高骷髅与石魔的元素抗性。'],
  ironGolem:['钢铁石魔','summon','消耗地上的金属装备，召唤继承装备属性的石魔。'],
  lowerResist:['降低抵抗','curse','降低火、冰、电、毒抗性；破免时效果为五分之一。'],
  poisonNova:['剧毒新星','spell','释放向外扩散的毒环，持续两秒造成毒伤。'],
  boneSpirit:['白骨之魂','spell','发射追踪单个敌人的魔法骨魂。'],
  fireGolem:['火焰石魔','summon','召唤火焰石魔，以火焰攻击和周期火焰脉冲伤敌。'],
  revive:['重生','corpse','复活普通怪物为你作战三分钟，保留其外形与战斗特征。'],
  bash:['重击','melee','以武器重击并击退敌人。'],
  swordMastery:['利刃专精','passive','提高剑与匕首的伤害、准确率和双倍伤害概率。'],
  axeMastery:['斧专精','passive','提高斧类近战伤害、准确率和双倍伤害概率。'],
  maceMastery:['钉锤专精','passive','提高钉锤类伤害、准确率和双倍伤害概率。'],
  howl:['狂嗥','curse','吓退等级允许的普通怪物。'],
  findPotion:['寻找药剂','corpse','搜索尸体，有概率找到生命、法力或恢复药剂；每具尸体只能搜索一次。'],
  leap:['跳跃','motion','跳到指定可站立位置，落地击退附近敌人。'],
  doubleSwing:['双手挥击','melee','需要双持，左右手分别快速攻击。'],
  poleArmMastery:['长柄专精','passive','提高长柄武器伤害、准确率和双倍伤害概率。'],
  throwingMastery:['投掷专精','passive','提高投掷伤害、准确率、穿透和双倍伤害概率。'],
  spearMastery:['长矛专精','passive','提高长矛伤害、准确率和双倍伤害概率。'],
  taunt:['嘲弄','curse','迫使普通敌人接近，降低其伤害和准确率。'],
  shout:['大叫','buff','提高自身、佣兵和召唤物防御。'],
  stun:['击晕','melee','武器命中后击晕普通敌人。'],
  doubleThrow:['双手投掷','melee','需要两把投掷武器，分别发射真实投射物。'],
  increasedStamina:['增加耐力','passive','提高耐力上限；硬点延长狂乱持续时间。'],
  findItem:['寻找物品','corpse','搜索尸体，有概率再次掉落物品；不能反复搜索同一尸体。'],
  leapAttack:['跳跃攻击','motion','跳向指定位置，以武器攻击目标并造成独立落地范围伤害。'],
  concentrate:['专心','melee','进行不可被打断的攻击，攻击期间提高防御。'],
  ironSkin:['铁布衫','passive','被动提高防御。'],
  battleCry:['战斗狂嗥','curse','降低近处敌人的防御与物理伤害。'],
  frenzy:['狂乱','melee','双持连续命中逐步提高攻速与移动速度。'],
  increasedSpeed:['加速','passive','被动提高行走与跑步速度。'],
  battleOrders:['战斗体制','buff','提高自身和附近友军的生命、法力与耐力上限。'],
  grimWard:['残酷吓阻','corpse','以尸体建立图腾，持续恐吓、减速附近普通敌人并降低物理抗性。'],
  whirlwind:['旋风','motion','沿施放时确定的路线旋转前进，两手武器分别连续判定命中。'],
  berserk:['狂战士','melee','把武器物理伤害转为魔法伤害，暂时失去防御。'],
  naturalResistance:['自然抵抗','passive','被动提高四种元素抗性。'],
  warCry:['战嗥','spell','对附近敌人造成物理伤害并击晕普通敌人。'],
  battleCommand:['战斗指挥','buff','暂时提高自身和附近友军技能等级。'],
  raven:['乌鸦','summon','召唤最多五只乌鸦，攻击并致盲敌人；每只攻击五次。'],
  plaguePoppy:['猛毒花藤','summon','召唤在敌人周围释放毒素的藤蔓。三种藤蔓互斥。'],
  wearwolf:['狼人变化','buff','变为狼人，提高生命、准确率和攻击速度；再次施放恢复人形。'],
  shapeShifting:['变形术','passive','提高变形生命加成和持续时间。'],
  firestorm:['火风暴','spell','释放三道向前延伸的火焰，持续灼烧沿途敌人。'],
  oakSage:['橡木智者','summon','召唤提高附近友军生命上限的灵；三种灵互斥。'],
  summonSpiritWolf:['召唤灵狼','summon','召唤最多五只造成冰冷伤害的灵狼，可与狂狼和灰熊共存。'],
  wearbear:['熊人变化','buff','变为熊人，提高生命、伤害和防御，攻击不被受击打断。'],
  moltenBoulder:['熔浆巨岩','spell','滚动的巨岩造成物理与火焰伤害，击退沿途普通敌人。'],
  arcticBlast:['极地风暴','spell','向鼠标方向喷射冰风，持续伤害并减速敌人。'],
  carrionVine:['食尸藤','summon','吞噬尸体，为主人恢复一定比例生命。'],
  feralRage:['野性狂暴','melee','狼人攻击逐步增强移动速度和吸血效果。'],
  maul:['撞槌','melee','熊人攻击累积伤害与攻速，并击晕敌人。'],
  fissure:['地裂','spell','地面裂隙持续喷出火焰，灼烧指定区域。'],
  cycloneArmor:['飓风装甲','buff','吸收火焰、冰冷和闪电伤害，变形状态也可施放。'],
  heartOfWolverine:['狼獾之心','summon','召唤提高附近友军物理伤害与准确率的灵。'],
  summonFenris:['召唤狂狼','summon','召唤最多三只狂狼，吞食尸体后增强攻击，可与灵狼、灰熊共存。'],
  rabies:['狂犬病','melee','狼人咬击传播持续毒伤，附近敌人可被感染。'],
  fireClaws:['焰爪','melee','狼人或熊人近战攻击附加大量火焰伤害。'],
  twister:['小旋风','spell','释放三股小旋风，造成物理伤害并短暂击晕。'],
  solarCreeper:['太阳藤','summon','吞噬尸体，为主人恢复一定比例法力。'],
  hunger:['饥饿','melee','狼人或熊人咬击，降低物理伤害并大量吸取生命和法力。'],
  shockWave:['震波','spell','熊人释放扇形震波，对普通敌人造成伤害并击晕。'],
  volcano:['火山','spell','在指定位置持续喷发，造成物理和火焰伤害。'],
  tornado:['龙卷风','spell','释放沿不规则轨迹前进的贯穿龙卷风，造成物理伤害。'],
  spiritOfBarbs:['棘灵','summon','召唤使附近友军受到近战攻击时反击固定物理伤害的灵。'],
  summonGrizzly:['召唤灰熊','summon','召唤一只强壮灰熊，可与两种狼群同时存在。'],
  fury:['狂怒','melee','狼人快速连续攻击，最多五次。'],
  armageddon:['毁天灭地','buff','持续在自身附近降下陨石，造成火焰与物理伤害；变形可用。'],
  hurricane:['暴风','buff','随自身移动的冰冷风暴，持续伤害并减速；变形可用。'],
  fireBlast:['火焰爆震','spell','投掷爆炸火瓶，对落点附近造成火焰伤害。'],
  clawMastery:['利爪专精','passive','提高爪类伤害、准确率和双倍伤害概率。'],
  psychicHammer:['心灵战槌','spell','以心灵力量击退敌人，造成物理和魔法伤害。'],
  tigerStrike:['虎击','chargeUp','命中积累最多三层聚气，终结技获得物理伤害加成。'],
  dragonTalon:['龙爪','finisher','连续踢击，伤害取决于属性与靴子；终结技消耗每种聚气一层。'],
  shockWeb:['雷电网','spell','在目标地面布置持续放电的电网。'],
  bladeSentinel:['刃之守卫','spell','放出沿往返路线切割的刀刃，附加武器伤害。'],
  burstOfSpeed:['速度爆发','buff','提高攻速和移动速度，与消退互斥。'],
  fistsOfFire:['焰拳','chargeUp','爪击积累火焰聚气：火伤、爆炸、持续地火。'],
  dragonClaw:['双龙爪','finisher','需要双爪，左右爪分别攻击并释放聚气。'],
  chargedBoltSentry:['电能守卫','trap','放置自动索敌并发射多枚充能弹的陷阱。'],
  wakeOfFire:['火焰复苏','trap','放置向前发射扇形火浪的陷阱。'],
  weaponBlock:['武器格挡','passive','双爪站立或攻击时可格挡攻击与部分法术。'],
  cloakOfShadows:['魔影斗篷','curse','使普通敌人失明，降低敌人防御并提高自身防御。'],
  cobraStrike:['眼镜蛇攻击','chargeUp','聚气使终结技吸取生命，二层起也吸取法力。'],
  bladeFury:['刃之怒','spell','连续投射飞刃，造成技能伤害与部分武器伤害。'],
  fade:['消退','buff','提高元素抗性、物理减伤并缩短诅咒，与速度爆发互斥。'],
  shadowWarrior:['影子战士','summon','召唤使用你所配置技能的影子战士，与影子大师互斥。'],
  clawsOfThunder:['雷电爪','chargeUp','爪击积累闪电聚气：电伤、新星、充能弹。'],
  dragonTail:['神龙摆尾','finisher','踢击产生火焰爆炸，伤害基于实际物理踢击伤害。'],
  lightningSentry:['雷光守卫','trap','放置发射贯穿闪电的陷阱；最多五个守卫共存。'],
  wakeOfInferno:['复苏狱火','trap','放置持续向目标喷射火焰的陷阱。'],
  mindBlast:['心灵爆震','spell','造成物理伤害、击晕并有概率暂时转化普通怪物。'],
  bladesOfIce:['寒冰刃','chargeUp','爪击积累冰冷聚气：冰伤、爆炸、冻结。'],
  dragonFlight:['飞龙在天','finisher','传送至目标身旁，以踢击释放聚气。'],
  deathSentry:['亡者守卫','trap','优先引爆附近尸体，否则发射闪电；与其他守卫共享五个上限。'],
  bladeShield:['刀刃之盾','buff','环绕自身的刀刃周期伤害近处敌人，附加武器伤害。'],
  venom:['毒牙','buff','武器攻击附加在短时间内生效的毒素伤害。'],
  shadowMaster:['影子大师','summon','召唤自主使用多种刺客技能的影子大师。'],
  phoenixStrike:['凤凰攻击','chargeUp','按当前聚气层数释放陨石、连锁闪电或冰弹。'],
};
export const isExpansionSkill = (id: string): id is ExpansionSkillId => Object.hasOwn(rows,id);
export const expansionMode = (id: string) => isExpansionSkill(id) ? rows[id][1] : undefined;
const depth=(id:ExpansionSkillId):number=>1+Math.max(0,...EXPANSION_SKILL_DATA[id].requires.filter(isExpansionSkill).map(id=>depth(id as ExpansionSkillId)));
const originalNames = new Map(Object.entries(EXPANSION_SKILL_DATA).map(([id,s])=>[s.name,id as ExpansionSkillId]));
originalNames.set('Eruption','fissure');
const overrides: Partial<Record<ExpansionSkillId, Partial<Record<SkillId,number>>>> = {
  boneSpear:{teeth:8,boneWall:8,bonePrison:8,boneSpirit:8},boneSpirit:{teeth:8,boneWall:8,bonePrison:8,boneSpear:8},
  shockWeb:{chargedBoltSentry:17,lightningSentry:17},chargedBoltSentry:{fireBlast:9,lightningSentry:9},lightningSentry:{shockWeb:18,chargedBoltSentry:18},
  wakeOfFire:{fireBlast:10,wakeOfInferno:10},wakeOfInferno:{fireBlast:18,wakeOfFire:18},
  bladeSentinel:{bladeFury:10,bladeShield:10},bladeFury:{bladeSentinel:10,bladeShield:10},bladeShield:{bladeSentinel:10,bladeFury:10},
  raven:{summonSpiritWolf:12,summonFenris:12,summonGrizzly:12},plaguePoppy:{rabies:10},arcticBlast:{cycloneArmor:15},
  fireClaws:{firestorm:22,moltenBoulder:22},shockWave:{maul:10},armageddon:{firestorm:14,moltenBoulder:14},
};
export function expansionSynergies(id:ExpansionSkillId,physical=false):Partial<Record<SkillId,number>> {
  if(!physical&&overrides[id])return overrides[id]!;
  const s=EXPANSION_SKILL_DATA[id], formula=physical?s.physicalSynergy:s.synergy||s.physicalSynergy;
  return Object.fromEntries([...formula.matchAll(/skill\('([^']+)'\.blvl\)/g)].flatMap(match=>originalNames.has(match[1])?[[originalNames.get(match[1])!,s.params[7]||s.params[6]]]:[]));
}
export const EXPANSION_SKILLS:SkillDefinition[]=Object.entries(rows).map(([key,[name,mode,description]])=>{
  const id=key as ExpansionSkillId,s=EXPANSION_SKILL_DATA[id],classId=s.classId as ClassId;
  return {id,name,mode,description,classId,tree:CLASSES[classId].trees[s.page-1],column:s.column,level:s.level,
    requires:(id==='armageddon'?s.requires.filter(id=>id!=='hurricane'):s.requires) as SkillId[],
    icon:mode==='passive'?'shield-check':mode==='summon'||mode==='corpse'?'users':mode==='trap'?'crosshair':mode==='chargeUp'?'sparkles':mode==='curse'?'eye':s.element==='fire'?'flame':s.element==='cold'?'snowflake':s.element==='ltng'?'zap':mode==='motion'?'footprints':'swords',
    synergies:Object.fromEntries(Object.entries(expansionSynergies(id)).map(([id,percent])=>[id,`+${percent}% 伤害 / 点`]))};
}).sort((a,b)=>a.level-b.level||depth(a.id as ExpansionSkillId)-depth(b.id as ExpansionSkillId));
const tier=(rank:number,values:number[])=>{let value=values[0];for(let i=2;i<=rank;i++)value+=values[i<=8?1:i<=16?2:i<=22?3:i<=28?4:5]??values.at(-1)!;return value;};
const diminishing=(rank:number,min:number,max:number)=>min+Math.floor((max-min)*Math.floor(110*rank/(rank+6))/100);
export function expansionValues(id:ExpansionSkillId,rank:number,hard:Partial<Record<SkillId,number>>={}):SkillValues {
  const s=EXPANSION_SKILL_DATA[id],n=Math.max(0,rank-1),p=(id:SkillId)=>hard[id]??0;
  const v:SkillValues={cost:0,damage:0,min:0,max:0,attack:0,hits:1,duration:0,radius:0,type:'physical',percent:0,secondary:0,healing:0};
  if(rank<=0)return v;
  const factor=(physical=false)=>1+Object.entries(expansionSynergies(id,physical)).reduce((sum,[id,percent])=>sum+p(id as SkillId)*percent!,0)/100;
  v.cost=Math.max(s.minMana,(s.mana+s.manaStep*n)*2**(s.manaShift-8));
  v.type=({ltng:'lightning',pois:'poison',mag:'magic',fire:'fire',cold:'cold'} as Record<string,DamageType>)[s.element]??'physical';
  const elemental=['ltng','pois','mag','fire','cold'].includes(s.element);
  v.min=tier(rank,elemental?s.min:s.physicalMin)*2**(s.shift-8)*factor();
  v.max=tier(rank,elemental?s.max:s.physicalMax)*2**(s.shift-8)*factor();
  v.physicalMin=elemental?tier(rank,s.physicalMin)*2**(s.shift-8)*factor(true):0;
  v.physicalMax=elemental?tier(rank,s.physicalMax)*2**(s.shift-8)*factor(true):0;
  v.duration=tier(rank,[...s.length,s.length[3],s.length[3]])/25;
  if(v.type==='poison'){v.min*=v.duration*25;v.max*=v.duration*25;}
  v.radius=expansionMode(id)==='passive'?0:4;
  switch(id){
    case 'amplifyDamage':case 'dimVision':case 'weaken':case 'ironMaiden':case 'terror':case 'confuse':case 'lifeTap':case 'attract':case 'decrepify':case 'lowerResist':
      v.radius=(s.params[0]+s.params[1]*n)*2/3;v.duration=(s.params[2]+s.params[3]*n)/25;
      v.percent=id==='lowerResist'?diminishing(rank,25,70):id==='weaken'?33+n:id==='decrepify'?50:s.params[4]+s.params[5]*n;break;
    case 'boneArmor':v.percent=20+15*n+15*(p('boneWall')+p('bonePrison'));v.duration=3600;break;
    case 'teeth':v.hits=Math.min(24,rank+1);break;
    case 'boneSpear':v.radius=.35;break;
    case 'boneSpirit':v.radius=.45;break;
    case 'poisonNova':v.radius=10;v.duration=2;break;
    case 'poisonDagger':v.attack=30+20*n;break;
    case 'poisonExplosion':v.radius=3;break;
    case 'corpseExplosion':v.radius=(8+n)/3;v.percent=70;v.secondary=120;break;
    case 'boneWall':case 'bonePrison':v.healing=80*(1+.25*n+.1*(p('boneArmor')+p(id==='boneWall'?'bonePrison':'boneWall')));v.duration=24;v.radius=id==='boneWall'?3:2;break;
    case 'skeletonMastery':v.healing=8*rank;v.damage=2*rank;v.percent=10*rank;break;
    case 'golemMastery':v.percent=20*rank;v.attack=25*rank;v.secondary=diminishing(rank,0,40);break;
    case 'summonResist':v.percent=diminishing(rank,20,75);break;
    case 'raiseSkeleton':case 'raiseSkeletalMage':v.hits=rank<=3?rank:3+Math.floor((rank-3)/3);v.healing=(id==='raiseSkeleton'?21:61)*(1+(id==='raiseSkeleton'?.5:.1)*Math.max(0,rank-3))+8*p('skeletonMastery');v.min=(id==='raiseSkeleton'?1+tier(rank,s.min):5+rank*3)+2*p('skeletonMastery');v.max=v.min+(id==='raiseSkeleton'?1:rank*2);v.min*=1+.07*n;v.max*=1+.07*n;break;
    case 'clayGolem':case 'bloodGolem':case 'ironGolem':case 'fireGolem':{
      v.healing=(id==='clayGolem'?100:id==='bloodGolem'?201:306)*(1+.2*p('golemMastery')+.05*p('bloodGolem'))*(1+(id==='clayGolem'?.35:.1)*n);
      if(id!=='fireGolem'){v.min=(id==='bloodGolem'?9:7)+rank*2;v.max=v.min+12;}
      v.min*=1+.06*p('fireGolem');v.max*=1+.06*p('fireGolem');
      v.percent=id==='clayGolem'?diminishing(rank,0,75):id==='bloodGolem'?diminishing(rank,30,135):id==='ironGolem'?150+15*n:0;
      if(id==='fireGolem'){v.min*=1.3;v.max*=1.3;v.type='fire';}break;
    }
    case 'revive':v.hits=rank;v.duration=180;v.percent=200+5*p('skeletonMastery');v.damage=10*p('skeletonMastery');break;
    case 'swordMastery':case 'axeMastery':case 'maceMastery':case 'poleArmMastery':case 'spearMastery':case 'throwingMastery':
      v.damage=28+5*n;v.attack=(id==='throwingMastery'?44:40)+8*n;v.percent=diminishing(rank,0,35);v.secondary=id==='throwingMastery'?diminishing(rank,10,75):0;break;
    case 'clawMastery':v.damage=35+4*n;v.attack=30+10*n;v.percent=diminishing(rank,0,25);break;
    case 'increasedStamina':v.percent=30+15*n;break;
    case 'increasedSpeed':v.percent=diminishing(rank,7,50);break;
    case 'naturalResistance':v.percent=diminishing(rank,0,80);break;
    case 'ironSkin':v.percent=30+10*n;break;
    case 'bash':v.damage=50+5*n+5*p('stun');v.attack=20+5*n+5*p('concentrate');v.secondary=rank;break;
    case 'doubleSwing':v.damage=10*p('bash');v.attack=15+5*n;v.hits=2;break;
    case 'doubleThrow':v.damage=16+8*n+8*p('doubleSwing');v.attack=20+10*n;v.hits=2;break;
    case 'stun':v.damage=8*p('bash');v.attack=15+5*n+5*p('concentrate');v.duration=Math.min(10,v.duration*(1+.05*p('warCry')));break;
    case 'concentrate':v.damage=70+5*n+5*p('bash')+10*p('battleOrders');v.attack=60+10*n;v.percent=100+10*n;v.duration=.8;break;
    case 'berserk':v.damage=150+15*n+10*(p('howl')+p('battleOrders'));v.attack=100+15*n;v.duration=Math.max(1,3-rank*.08);break;
    case 'whirlwind':v.damage=-50+8*n;v.attack=5*n;v.radius=2.6;break;
    case 'frenzy':v.damage=90+5*n+8*(p('doubleSwing')+p('taunt'));v.attack=100+7*n;v.hits=2;v.percent=diminishing(rank,0,50);v.secondary=diminishing(rank,20,200);v.duration=6+.4*p('increasedStamina');break;
    case 'leap':v.radius=Math.min(14,diminishing(rank,4,30)*2/3);v.secondary=(4+n)*2/3;break;
    case 'leapAttack':v.cost=10;v.damage=200+30*n+10*p('leap');v.attack=100+20*n;v.radius=14;v.min=(100+rank*20)*(1+.1*p('leap'));v.max=v.min*1.4;break;
    case 'findPotion':v.percent=diminishing(rank,0,100);break;
    case 'findItem':v.percent=Math.min(100,diminishing(rank,5,60)+p('findPotion'));break;
    case 'grimWard':v.radius=4+2*n/3;v.duration=40;v.percent=20+5*p('findPotion');v.secondary=50;break;
    case 'howl':v.radius=16/3+2*n/3;v.duration=3+n;break;
    case 'taunt':v.radius=14;v.percent=Math.min(95,5+2*n);v.duration=20;break;
    case 'battleCry':v.radius=4;v.duration=12+2.4*n;v.percent=25+n;v.secondary=50+2*n;break;
    case 'shout':case 'battleOrders':case 'battleCommand':v.radius=20;v.duration=30+10*n+5*(['shout','battleOrders','battleCommand'] as const).filter(other=>other!==id).reduce((sum,other)=>sum+p(other),0);v.percent=id==='shout'?100+10*n:id==='battleOrders'?35+3*n:1;break;
    case 'warCry':v.cost=10+.75*n;v.min*=1.3;v.max*=1.3;v.radius=4;v.duration=Math.min(10,1+.2*n);break;
    case 'wearwolf':v.duration=40;v.percent=25;v.attack=50+15*n;v.secondary=diminishing(rank,10,80);break;
    case 'wearbear':v.duration=40;v.percent=75;v.damage=55+15*n;v.secondary=25+10*n;break;
    case 'shapeShifting':v.percent=20+5*n;v.duration=40+20*n;break;
    case 'feralRage':v.damage=50+5*n;v.attack=20+10*n;v.percent=4*rank;v.secondary=diminishing(rank,10,70);v.hits=3+Math.floor(rank/2);v.duration=20;break;
    case 'maul':v.damage=30;v.attack=40+15*n;v.hits=3+Math.floor(rank/2);v.duration=20;v.percent=Math.min(10,diminishing(rank,10,100)/25);break;
    case 'rabies':v.attack=50+7*n;v.radius=3;break;
    case 'fireClaws':v.min*=1.75;v.max*=1.75;v.attack=50+15*n;break;
    case 'hunger':v.damage=-75;v.percent=diminishing(rank,50,200);v.attack=50+10*n;break;
    case 'fury':v.damage=100+17*n;v.attack=50+7*n;v.hits=Math.min(5,2+n);break;
    case 'shockWave':v.duration=Math.min(10,1.6+.6*n);v.radius=7;break;
    case 'firestorm':v.min*=75;v.max*=75;v.duration=.6;v.hits=3;v.radius=7;break;
    case 'arcticBlast':v.min*=50;v.max*=50;v.duration=.6;v.radius=Math.min(9,4+.2*rank);break;
    case 'moltenBoulder':v.radius=1;v.physicalMin=tier(rank,s.physicalMin)*2**(s.shift-8)*(1+.12*p('volcano'));v.physicalMax=tier(rank,s.physicalMax)*2**(s.shift-8)*(1+.12*p('volcano'));break;
    case 'fissure':v.duration=3.2;v.radius=4.6;break;
    case 'volcano':v.duration=6;v.radius=3;v.physicalMin=tier(rank,s.physicalMin)*2**(s.shift-8)*(1+.16*p('moltenBoulder'));v.physicalMax=tier(rank,s.physicalMax)*2**(s.shift-8)*(1+.16*p('moltenBoulder'));break;
    case 'cycloneArmor':v.percent=(40+12*n)*(1+.07*(p('twister')+p('tornado')+p('hurricane')));v.duration=3600;break;
    case 'twister':v.min*=1.5;v.max*=1.5;v.hits=3;v.duration=.4*(1+.2*p('arcticBlast'));v.radius=.5;break;
    case 'tornado':v.radius=.7;break;
    case 'hurricane':v.duration=10+2*p('cycloneArmor');v.radius=6;break;
    case 'armageddon':v.duration=10+2*p('fissure');v.radius=6;v.physicalMin=(25+15*n)*(1+.18*p('volcano'));v.physicalMax=(75+25*n)*(1+.18*p('volcano'));break;
    case 'oakSage':v.percent=30+5*n;v.healing=60*(1+.3*n);v.radius=20;break;
    case 'heartOfWolverine':v.damage=20+7*n;v.attack=25+7*n;v.healing=136*(1+.25*n);v.radius=20;break;
    case 'spiritOfBarbs':v.percent=50+20*n;v.healing=213*(1+.25*n);v.radius=20;break;
    case 'raven':v.hits=Math.min(5,rank);v.min=(2+8*n)*factor();v.max=(4+8*n)*factor();v.healing=1;v.secondary=5;break;
    case 'plaguePoppy':v.healing=50*(1+.5*n);v.min*=4;v.max*=4;v.radius=3;break;
    case 'carrionVine':case 'solarCreeper':v.healing=80*(1+.25*n);v.percent=id==='carrionVine'?rank:rank+2;break;
    case 'summonSpiritWolf':case 'summonFenris':case 'summonGrizzly':v.hits=id==='summonSpiritWolf'?Math.min(5,rank):id==='summonFenris'?Math.min(3,rank):1;v.healing=(id==='summonSpiritWolf'?80:id==='summonFenris'?150:650)*(1+.1*n)*(1+(p('summonFenris')?35+15*p('summonFenris'):0)/100);v.min*=1+(p('summonGrizzly')?15+10*p('summonGrizzly'):0)/100;v.max*=1+(p('summonGrizzly')?15+10*p('summonGrizzly'):0)/100;if(id==='summonSpiritWolf'){v.type='cold';v.min*=1.1;v.max*=1.1;}if(id==='summonFenris'){v.min*=1.3;v.max*=1.3;}break;
    case 'fireBlast':v.radius=2.7;break;
    case 'shockWeb':v.radius=3;v.duration=3.6;break;
    case 'bladeSentinel':v.duration=4+.5*n;v.radius=.55;v.percent=75;break;
    case 'bladeFury':v.attack=10*rank;v.percent=75;v.radius=.3;break;
    case 'bladeShield':v.duration=120+12*n;v.radius=2;v.percent=75;break;
    case 'psychicHammer':v.radius=1;break;
    case 'burstOfSpeed':v.percent=diminishing(rank,15,70);v.secondary=diminishing(rank,15,60);v.duration=120+12*n;break;
    case 'fade':v.percent=diminishing(rank,10,75);v.secondary=diminishing(rank,40,90);v.duration=120+12*n;break;
    case 'venom':v.duration=120+12*n;break;
    case 'weaponBlock':v.percent=diminishing(rank,20,65);break;
    case 'cloakOfShadows':v.duration=8+n;v.radius=20;v.percent=10+3*n;v.secondary=Math.min(95,15+3*n);break;
    case 'mindBlast':v.duration=Math.min(10,2+.2*n);v.percent=diminishing(rank,15,40);v.radius=8/3;break;
    case 'shadowWarrior':case 'shadowMaster':v.healing=376*(1+.15*n);v.min=12+6*rank;v.max=20+9*rank;v.percent=id==='shadowMaster'?diminishing(rank,5,90):Math.min(75,rank*4);break;
    case 'tigerStrike':v.percent=100+20*n;v.attack=25+10*n;v.duration=15;break;
    case 'cobraStrike':v.percent=40+5*n;v.attack=25+10*n;v.duration=15;break;
    case 'fistsOfFire':case 'clawsOfThunder':case 'bladesOfIce':case 'phoenixStrike':v.attack=25+10*n;v.duration=15;v.radius=3;break;
    case 'dragonTalon':v.damage=5+7*n;v.attack=20+35*n;v.hits=1+Math.floor(rank/6);break;
    case 'dragonClaw':v.damage=50+15*n+4*p('clawMastery');v.attack=40+25*n;v.hits=2;break;
    case 'dragonTail':v.percent=50+20*n;v.attack=20+15*n;v.radius=4;break;
    case 'dragonFlight':v.damage=100+35*n;v.attack=60+25*n;v.radius=14;break;
    case 'chargedBoltSentry':v.hits=5+Math.floor(p('lightningSentry')/4);v.secondary=5+Math.floor(p('shockWeb')/3);v.radius=12;break;
    case 'wakeOfFire':v.hits=5;v.radius=10;break;
    case 'lightningSentry':v.hits=10;v.radius=14;break;
    case 'wakeOfInferno':v.hits=10;v.radius=8;v.min*=25;v.max*=25;break;
    case 'deathSentry':v.hits=5+Math.floor(p('fireBlast')/3);v.radius=10;v.percent=40;v.secondary=80;break;
  }
  return v;
}
