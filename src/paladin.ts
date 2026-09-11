import { CLASS_SKILLS, extraSkillValues, type ExtraSkillId, type ExtraSkillTree, type ClassSkillMode } from './class-skills.ts';
import { ORIGINAL_CLASS_SKILLS } from './class-skill-data.ts';
import type { ClassId } from './classes.ts';
export type SkillTree = 'combat' | 'offensive' | 'defensive' | ExtraSkillTree;
export type SkillId = ExtraSkillId | 'sacrifice' | 'smite' | 'holyBolt' | 'zeal' | 'charge' | 'vengeance' | 'blessedHammer' | 'conversion' | 'holyShield' | 'fistOfHeavens' | 'might' | 'holyFire' | 'thorns' | 'blessedAim' | 'concentration' | 'holyFreeze' | 'holyShock' | 'sanctuary' | 'fanaticism' | 'conviction' | 'prayer' | 'resistFire' | 'resistCold' | 'defiance' | 'resistLightning' | 'cleansing' | 'vigor' | 'meditation' | 'redemption' | 'salvation';
export type ActionId = SkillId | 'attack';
export type DamageType = 'physical' | 'magic' | 'fire' | 'cold' | 'lightning' | 'poison';
export type SkillDefinition = { id: SkillId; name: string; tree: SkillTree; level: number; column: number; requires: SkillId[]; icon: string; description: string; synergies: Partial<Record<SkillId, string>>; classId?: ClassId; mode?: ClassSkillMode };
export const treeNames: Record<SkillTree, string> = { combat: '战斗技能', offensive: '攻击灵气', defensive: '防御灵气', javelin: '标枪与长矛', passive: '被动与魔法', bow: '弓与弩', cold: '冰冷法术', lightning: '闪电法术', fire: '火焰法术' };
const define = (id: SkillId, name: string, tree: SkillTree, level: number, column: number, requires: SkillId[], icon: string, description: string, synergies: SkillDefinition['synergies'] = {}): SkillDefinition => ({ id, name, tree, level, column, requires, icon, description, synergies });
export const SKILLS: SkillDefinition[] = [
  define('sacrifice', '牺牲', 'combat', 1, 1, [], 'sword', '以生命强化单次近战攻击，承受物理伤害的 5% 反噬。', { redemption: '+15% 伤害 / 点', fanaticism: '+5% 伤害 / 点' }),
  define('smite', '重击', 'combat', 1, 3, [], 'shield', '盾击必定命中，击退并击晕敌人。需要盾牌，不附带元素伤害或吸取。'),
  define('holyBolt', '圣光弹', 'combat', 6, 2, [], 'sparkles', '穿透恶魔与不死生物，治疗沿途被转化的盟友。', { fistOfHeavens: '+50% 魔法伤害 / 点', prayer: '+20% 治疗 / 点' }),
  define('zeal', '热诚', 'combat', 12, 1, ['sacrifice'], 'swords', '连续攻击附近敌人，最高五次，提升准确率。', { sacrifice: '+12% 伤害 / 点' }),
  define('charge', '冲锋', 'combat', 12, 3, ['smite'], 'footprints', '冲向远处目标并施以强力打击。', { vigor: '+20% 伤害 / 点', might: '+20% 伤害 / 点' }),
  define('vengeance', '复仇', 'combat', 18, 1, ['zeal'], 'flame', '武器同时附加火焰、冰冷与闪电伤害。', { resistFire: '+10% 火焰伤害 / 点', resistCold: '+10% 冰冷伤害 / 点', resistLightning: '+10% 闪电伤害 / 点', salvation: '+2% 三系伤害 / 点' }),
  define('blessedHammer', '祝福之锤', 'combat', 18, 2, ['holyBolt'], 'hammer', '召唤向外盘旋的圣锤，沿轨迹造成魔法伤害。', { blessedAim: '+14% 魔法伤害 / 点', vigor: '+14% 魔法伤害 / 点', concentration: '激活时获得一半灵气伤害加成' }),
  define('conversion', '转化', 'combat', 24, 1, ['vengeance'], 'users', '近战命中有概率使普通敌人为你战斗 16 秒。'),
  define('holyShield', '神圣之盾', 'combat', 24, 3, ['charge', 'blessedHammer'], 'shield-check', '暂时强化防御、格挡和重击伤害。需要盾牌。', { defiance: '+15% 防御 / 点' }),
  define('fistOfHeavens', '天堂之拳', 'combat', 30, 2, ['conversion', 'blessedHammer'], 'zap', '天雷击中目标，放出穿透恶魔与不死生物的圣光弹，施放延迟 0.4 秒。', { holyBolt: '+15% 圣光弹伤害 / 点', holyShock: '+7% 闪电伤害 / 点' }),
  define('might', '力量', 'offensive', 1, 1, [], 'sword', '提高自身与附近盟友的物理伤害。'),
  define('holyFire', '圣火', 'offensive', 6, 2, ['might'], 'flame', '武器附加火焰伤害，每两秒灼烧附近敌人。', { resistFire: '+18% 火焰伤害 / 点', salvation: '+6% 火焰伤害 / 点' }),
  define('thorns', '荆棘', 'offensive', 6, 3, [], 'sun', '将受到的近战物理伤害反弹给攻击者。'),
  define('blessedAim', '祝福瞄准', 'offensive', 12, 1, ['might'], 'crosshair', '提高准确率；每个投入点数被动增加 5% 准确率。'),
  define('concentration', '专注', 'offensive', 18, 1, ['blessedAim'], 'focus', '提高物理伤害，有 20% 概率避免攻击被打断。强化祝福之锤。'),
  define('holyFreeze', '神圣冰冻', 'offensive', 18, 2, ['holyFire'], 'snowflake', '减缓附近敌人，附加冰冷攻击和冰冷脉冲。', { resistCold: '+15% 冰冷伤害 / 点', salvation: '+7% 冰冷伤害 / 点' }),
  define('holyShock', '神圣冲击', 'offensive', 24, 2, ['holyFreeze'], 'zap', '武器附加闪电伤害，每两秒电击附近敌人。', { resistLightning: '+12% 闪电伤害 / 点', salvation: '+4% 闪电伤害 / 点' }),
  define('sanctuary', '庇护所', 'offensive', 24, 3, ['thorns', 'holyFreeze'], 'church', '击退附近不死生物；对其近战攻击忽略物理抗性。', { cleansing: '+7% 魔法脉冲伤害 / 点' }),
  define('fanaticism', '狂热', 'offensive', 30, 1, ['concentration'], 'swords', '提高自身与盟友的伤害、攻击速度及准确率。'),
  define('conviction', '审判', 'offensive', 30, 3, ['sanctuary'], 'eye', '降低敌人的防御及火、冰、电抗性；破除免疫时效果为五分之一。'),
  define('prayer', '祈祷', 'defensive', 1, 1, [], 'heart', '每两秒消耗法力，恢复自身及盟友生命。'),
  define('resistFire', '抵抗火焰', 'defensive', 1, 3, [], 'flame', '提高火焰抗性及上限；未激活时每两点投入提高 1% 抗性上限。'),
  define('defiance', '反抗', 'defensive', 6, 2, [], 'shield', '提高自身和附近盟友的防御。'),
  define('resistCold', '抵抗冰冷', 'defensive', 6, 3, [], 'snowflake', '提高冰冷抗性及上限；未激活时每两点投入提高 1% 抗性上限。'),
  define('cleansing', '净化', 'defensive', 12, 1, ['prayer'], 'sparkles', '缩短中毒与诅咒持续时间。继承祈祷治疗且不消耗法力。', { prayer: '继承祈祷治疗' }),
  define('resistLightning', '抵抗闪电', 'defensive', 12, 3, [], 'zap', '提高闪电抗性及上限；未激活时每两点投入提高 1% 抗性上限。'),
  define('vigor', '活力', 'defensive', 18, 2, ['cleansing', 'defiance'], 'footprints', '提高移动速度、耐力上限及耐力恢复。'),
  define('meditation', '冥思', 'defensive', 24, 1, ['cleansing'], 'droplets', '加快法力恢复，并继承祈祷治疗。', { prayer: '继承祈祷治疗' }),
  define('redemption', '救赎', 'defensive', 30, 2, ['vigor'], 'heart-pulse', '每两秒尝试消耗附近尸体，恢复自身生命和法力。'),
  define('salvation', '救助', 'defensive', 30, 3, [], 'shield-check', '同时提高火焰、冰冷与闪电抗性。'),
];
export const ALL_SKILLS = [...SKILLS, ...CLASS_SKILLS];
export const skillsForClass = (classId: ClassId) => ALL_SKILLS.filter(skill => (skill.classId ?? 'paladin') === classId);
export const skillById = Object.fromEntries(ALL_SKILLS.map(skill => [skill.id, skill])) as Record<SkillId, SkillDefinition>;
export const isSkill = (id: unknown): id is SkillId => typeof id === 'string' && Object.hasOwn(skillById, id);
export const isAura = (id: ActionId) => id !== 'attack' && ['offensive','defensive'].includes(skillById[id].tree);
export const isPassive = (id: ActionId) => id !== 'attack' && skillById[id].mode === 'passive';
export const skillName = (id: ActionId) => id === 'attack' ? '普通攻击' : skillById[id].name;
export const skillIcon = (id: ActionId) => id === 'attack' ? 'sword' : skillById[id].icon;
export const BASE_ATTRIBUTES = { strength: 25, dexterity: 20, vitality: 25, energy: 15 };
export const PALADIN_BALANCE = { manaRecoverySeconds: 90, sacrificeRecoil: .05, hitGraceSeconds: .2 } as const;
export type Attribute = keyof typeof BASE_ATTRIBUTES;
export const attributeNames: Record<Attribute, string> = { strength: '力量', dexterity: '敏捷', vitality: '体力', energy: '精力' };
export const emptySkills = () => Object.fromEntries(ALL_SKILLS.map(skill => [skill.id, 0])) as Record<SkillId, number>;
export const diminishing = (rank: number, min: number, max: number) => min + Math.floor((max - min) * Math.floor(110 * rank / (rank + 6)) / 100);
export const tierValue = (rank: number, initial: number, increments: number[]) => {
  let result = initial;
  for (let level = 2; level <= rank; level++) result += increments[level <= 8 ? 0 : level <= 16 ? 1 : level <= 22 ? 2 : level <= 28 ? 3 : 4] ?? increments[increments.length - 1];
  return result;
};
export type SkillValues = { cost: number; damage: number; min: number; max: number; attack: number; hits: number; duration: number; radius: number; type: DamageType; percent: number; secondary: number; healing: number };
export function skillValues(id: ActionId, rank: number, hard: Partial<Record<SkillId, number>> = {}): SkillValues {
  if (Object.hasOwn(ORIGINAL_CLASS_SKILLS, id)) return extraSkillValues(id as ExtraSkillId, rank, hard);
  const p = (key: SkillId) => hard[key] ?? 0;
  const v: SkillValues = { cost: 0, damage: 0, min: 0, max: 0, attack: 0, hits: 1, duration: 0, radius: 10.6 + (rank - 1) * 4 / 3, type: 'physical', percent: 0, secondary: 0, healing: 0 };
  if (id === 'attack' || rank <= 0) return v;
  switch (id) {
    case 'sacrifice': v.damage = 180 + 15 * (rank - 1) + 15 * p('redemption') + 5 * p('fanaticism'); v.attack = 20 + 7 * (rank - 1); break;
    case 'smite': v.cost = 2; v.damage = 15 * rank; v.duration = .4 + .2 * rank; break;
    case 'holyBolt': v.cost = 2 + Math.floor((rank - 1) / 2) / 8; v.type = 'magic'; v.min = tierValue(rank, 8, [8, 10, 13, 16, 20]); v.max = tierValue(rank, 16, [8, 11, 15, 18, 23]); v.min *= 1.5; v.max *= 1.5; v.damage = 50 * p('fistOfHeavens'); v.healing = (3.5 + 3 * (rank - 1)) * (1 + .20 * p('prayer')); break;
    case 'zeal': v.cost = 2; v.hits = Math.min(5, rank + 1); v.attack = 10 * rank; v.damage = Math.max(0, rank - 4) * 6 + 12 * p('sacrifice'); break;
    case 'charge': v.cost = 7; v.damage = 100 + 25 * (rank - 1) + 20 * (p('might') + p('vigor')); v.attack = 50 + 15 * (rank - 1); break;
    case 'vengeance': v.cost = 3 + .1875 * (rank - 1); v.percent = 70 + 6 * (rank - 1) + 2 * p('salvation'); v.attack = 20 + 10 * (rank - 1); v.duration = 1.2 + .6 * (rank - 1); break;
    case 'blessedHammer': v.cost = 4.5 + .2 * (rank - 1); v.type = 'magic'; v.min = tierValue(rank, 12, [8, 10, 12, 13, 14]); v.max = v.min + 4; v.damage = 14 * (p('blessedAim') + p('vigor')); break;
    case 'conversion': v.cost = 4; v.percent = diminishing(rank, 0, 50); v.duration = 16; break;
    case 'holyShield': v.cost = 25; v.duration = 60 + 25 * (rank - 1); v.percent = 25 + 15 * (rank - 1) + 15 * p('defiance'); v.secondary = diminishing(rank, 10, 40); v.min = tierValue(rank, 3, [2, 3, 4, 5, 6]); v.max = v.min + 3; break;
    case 'fistOfHeavens': v.cost = 18; v.type = 'lightning'; v.min = tierValue(rank, 150, [15, 30, 45, 55, 65]); v.max = v.min + 50; v.damage = 7 * p('holyShock'); v.secondary = (tierValue(rank, 40, [6, 10, 16, 20, 24]) + 5) * (1 + .15 * p('holyBolt')); break;
    case 'might': v.damage = 40 + 10 * (rank - 1); break;
    case 'thorns': v.percent = 250 + 40 * (rank - 1); break;
    case 'blessedAim': v.attack = 75 + 15 * (rank - 1); break;
    case 'concentration': v.damage = 60 + 15 * (rank - 1); break;
    case 'fanaticism': v.damage = 50 + 17 * (rank - 1); v.attack = 40 + 5 * (rank - 1); v.percent = diminishing(rank, 10, 40); v.radius = 7.3 + (rank - 1) * 2 / 3; break;
    case 'holyFire': v.type = 'fire'; v.min = rank <= 20 ? [1,1.5,2.5,3,4,4.5,5.5,6,7,8.5,9,10,11,12,13,14,15,16,17,18][rank - 1] : 18 + (rank - 20) * 2; v.max = v.min + (rank > 18 ? 3 : 2); v.damage = 18 * p('resistFire') + 6 * p('salvation'); v.secondary = 6; break;
    case 'holyFreeze': v.type = 'cold'; v.min = tierValue(rank, 2, [1, 2, 3, 4, 5]); v.max = v.min + 1; v.percent = diminishing(rank, 25, 60); v.damage = 15 * p('resistCold') + 7 * p('salvation'); v.secondary = 5; break;
    case 'holyShock': v.type = 'lightning'; v.min = 1; v.max = tierValue(rank, 10, [6, 8, 10, 12, 15]); v.damage = 12 * p('resistLightning') + 4 * p('salvation'); v.secondary = 6; break;
    case 'sanctuary': v.type = 'magic'; v.min = tierValue(rank, 8, [4, 4, 5, 6, 7]); v.max = tierValue(rank, 16, [4, 5, 6, 7, 8]); v.damage = 7 * p('cleansing'); v.radius = 3.3 + (rank - 1) * 2 / 3; break;
    case 'conviction': v.percent = Math.min(150, 30 + 5 * (rank - 1)); v.secondary = diminishing(rank, 40, 95); v.radius = 13.3; break;
    case 'prayer': v.cost = 1 + (rank - 1) * .1875; v.healing = tierValue(rank, 2, [1, 1, 2, 3, 5]); break;
    case 'resistFire': case 'resistCold': case 'resistLightning': v.percent = diminishing(rank, 35, 150); break;
    case 'defiance': v.percent = 70 + 10 * (rank - 1); break;
    case 'cleansing': v.percent = diminishing(rank, 30, 90); break;
    case 'vigor': v.percent = diminishing(rank, 7, 50); v.secondary = 50 + 25 * (rank - 1); break;
    case 'meditation': v.percent = 300 + 25 * (rank - 1); break;
    case 'redemption': v.percent = diminishing(rank, 10, 100); v.healing = 25 + 5 * (rank - 1); v.radius = 10.6; break;
    case 'salvation': v.percent = diminishing(rank, 50, 120); break;
  }
  if (['holyFire', 'holyFreeze', 'holyShock'].includes(id)) v.radius = 4 + (rank - 1) * 2 / 3;
  if (v.min || v.max) { v.min *= 1 + v.damage / 100; v.max *= 1 + v.damage / 100; }
  return v;
}
export const EXPERIENCE = [0,500,1500,3750,7875,14175,22680,32886,44396,57715,72144,90180,112725,140906,176132,220165,275207,344008,430010,537513,671891,839864,1049830,1312287,1640359,2050449,2563061,3203826,3902260,4663553,5493363,6397855,7383752,8458379,9629723,10906488,12298162,13815086,15468534,17270791,19235252,21376515,23710491,26254525,29027522,32050088,35344686,38935798,42850109,47116709,51767302,56836449,62361819,68384473,74949165,82104680,89904191,98405658,107672256,117772849,128782495,140783010,153863570,168121381,183662396,200602101,219066380,239192444,261129853,285041630,311105466,339515048,370481492,404234916,441026148,481128591,524840254,572485967,624419793,681027665,742730244,809986056,883294891,963201521,1050299747,1145236814,1248718217,1361512946,1484459201,1618470619,1764543065,1923762030,2097310703,2286478756,2492671933,2717422497,2962400612,3229426756,3520485254];
export const xpForLevel = (level: number) => level >= 99 ? 0 : EXPERIENCE[level] - EXPERIENCE[level - 1];
export const FCR = [0, 9, 18, 30, 48, 75, 125];
export const FHR = [0, 7, 15, 27, 48, 86, 200];
export const FBR = [0, 13, 32, 86, 600];
export const breakpointFrames = (value: number, thresholds: number[], base: number) => base - Math.max(0, thresholds.filter(threshold => value >= threshold).length - 1);
