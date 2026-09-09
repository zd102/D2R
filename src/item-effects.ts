import { ALL_SKILLS as SKILLS, isAura, type SkillId, type DamageType } from './paladin.ts';
import { ORIGINAL_CLASS_SKILLS } from './class-skill-data.ts';
import { CLASSES } from './classes.ts';
import type { Mods, Modifier } from './items.ts';
import type { CatalogProperty } from './item-catalog-data.ts';

const skillNames = Object.fromEntries(SKILLS.map(skill => [`skill_${skill.id}`, `${skill.name}（${CLASSES[skill.classId ?? 'paladin'].name}）`])) as Record<`skill_${SkillId}`, string>;
const auraNames = Object.fromEntries(SKILLS.filter(skill=>isAura(skill.id)).map(skill => [`aura_${skill.id}`, `${skill.name}灵气等级（装备赋予）`])) as Record<`aura_${SkillId}`, string>;
export const EFFECT_MOD_NAMES = {
  ...skillNames, ...auraNames,
  pierceChance: '投射物穿透几率 %', magicArrowLevel: '魔法箭等级', explosiveArrowLevel: '爆炸箭等级', replenishQuantity: '每秒恢复投掷数量', extraQuantity: '投掷数量上限增加',
  fireSkillDamage: '火焰技能伤害 %', coldSkillDamage: '冰冷技能伤害 %', lightningSkillDamage: '闪电技能伤害 %', poisonSkillDamage: '毒素技能伤害 %',
  firePierce: '降低敌人火焰抗性 %', coldPierce: '降低敌人冰冷抗性 %', lightningPierce: '降低敌人闪电抗性 %', poisonPierce: '降低敌人毒素抗性 %',
  fireAbsorb: '火焰吸收 %', lightningAbsorb: '闪电吸收 %', fireAbsorbFlat: '火焰吸收', coldAbsorbFlat: '冰冷吸收', lightningAbsorbFlat: '闪电吸收', magicAbsorbFlat: '魔法吸收',
  magicMinDamage: '最小魔法伤害', magicMaxDamage: '最大魔法伤害', magicDamage: '魔法伤害',
  strengthPerLevel: '每级力量', dexterityPerLevel: '每级敏捷', vitalityPerLevel: '每级体力', staminaPerLevel: '每级耐力',
  magicFindPerLevel: '每级寻获魔法装备 %', goldFindPerLevel: '每级额外金币 %', deadlyStrikePerLevel: '每级致命攻击 %', damagePercentPerLevel: '每级最大伤害加成 %',
  damageDemonsPerLevel: '每级对恶魔伤害 %', damageUndeadPerLevel: '每级对不死生物伤害 %', attackDemonsPerLevel: '每级对恶魔准确率', attackUndeadPerLevel: '每级对不死生物准确率',
  lightningResPerLevel: '每级闪电抗性', coldAbsorbPerLevel: '每级冰冷吸收', fireAbsorbPerLevel: '每级火焰吸收', reflectDamagePerLevel: '每级反弹伤害', staminaRegenPerLevel: '每级耐力恢复 %',
  lifeOnKill: '击杀恢复生命', lifeOnDemonKill: '击杀恶魔恢复生命', experienceBonus: '获得经验 %', slowTarget: '减慢目标 %', fireSkills: '火焰技能',
  defenseMelee: '对近战防御', defenseMissile: '对远程防御', lightningReflect: '攻击者受到闪电伤害', targetDefenseFlat: '每次命中降低目标防御',
  restInPeace: '杀死怪物回复平静', repairDurability: '每秒恢复耐久', extraDurability: '耐久上限增加',
};

export const EFFECT_PROPERTIES: Record<string, Modifier> = {
  pierce: 'pierceChance', magicarrow: 'magicArrowLevel', explosivearrow: 'explosiveArrowLevel', stack: 'extraQuantity',
  'extra-fire': 'fireSkillDamage', 'extra-cold': 'coldSkillDamage', 'extra-ltng': 'lightningSkillDamage', 'extra-pois': 'poisonSkillDamage',
  'pierce-fire': 'firePierce', 'pierce-cold': 'coldPierce', 'pierce-ltng': 'lightningPierce', 'pierce-pois': 'poisonPierce',
  'abs-fire%': 'fireAbsorb', 'abs-ltng%': 'lightningAbsorb', 'abs-fire': 'fireAbsorbFlat', 'abs-cold': 'coldAbsorbFlat', 'abs-ltng': 'lightningAbsorbFlat', 'abs-mag': 'magicAbsorbFlat',
  'heal-kill': 'lifeOnKill', 'demon-heal': 'lifeOnDemonKill', addxp: 'experienceBonus', slow: 'slowTarget', fireskill: 'fireSkills',
  'ac-hth': 'defenseMelee', 'ac-miss': 'defenseMissile', 'light-thorns': 'lightningReflect', 'dmg-ac': 'targetDefenseFlat', rip: 'restInPeace',
  cast2: 'fcr', block3: 'fbr', stupidity: 'blindTarget', freeze: 'freezeTarget', dur: 'extraDurability',
  'pois-min': 'poisonMinRate', 'pois-max': 'poisonMaxRate', 'pois-len': 'poisonFrames',
};
export const LEVEL_PROPERTIES: Record<string, [Modifier, number]> = {
  'str/lvl': ['strengthPerLevel', 8], 'dex/lvl': ['dexterityPerLevel', 8], 'vit/lvl': ['vitalityPerLevel', 8], 'stam/lvl': ['staminaPerLevel', 8],
  'mag%/lvl': ['magicFindPerLevel', 8], 'gold%/lvl': ['goldFindPerLevel', 8], 'deadly/lvl': ['deadlyStrikePerLevel', 8], 'dmg%/lvl': ['damagePercentPerLevel', 8],
  'dmg-dem/lvl': ['damageDemonsPerLevel', 8], 'dmg-und/lvl': ['damageUndeadPerLevel', 8], 'att-dem/lvl': ['attackDemonsPerLevel', 2], 'att-und/lvl': ['attackUndeadPerLevel', 2],
  'res-ltng/lvl': ['lightningResPerLevel', 8], 'abs-cold/lvl': ['coldAbsorbPerLevel', 8], 'abs-fire/lvl': ['fireAbsorbPerLevel', 8],
  'thorns/lvl': ['reflectDamagePerLevel', 8], 'regen-stam/lvl': ['staminaRegenPerLevel', 8],
};
const levelTargets: Partial<Record<Modifier, Modifier>> = {
  strengthPerLevel: 'strength', dexterityPerLevel: 'dexterity', vitalityPerLevel: 'vitality', staminaPerLevel: 'stamina', magicFindPerLevel: 'magicFind', goldFindPerLevel: 'goldFind', deadlyStrikePerLevel: 'deadlyStrike',
  damageDemonsPerLevel: 'damageDemons', damageUndeadPerLevel: 'damageUndead', attackDemonsPerLevel: 'attackDemons', attackUndeadPerLevel: 'attackUndead',
  lightningResPerLevel: 'lightningRes', coldAbsorbPerLevel: 'coldAbsorbFlat', fireAbsorbPerLevel: 'fireAbsorbFlat', reflectDamagePerLevel: 'reflectDamage', staminaRegenPerLevel: 'staminaRegen',
};
export function levelMods(mods: Mods, level: number): Mods {
  const result = { ...mods };
  for (const [source, target] of Object.entries(levelTargets) as [Modifier, Modifier][]) if (mods[source]) result[target] = (result[target] ?? 0) + Math.floor(mods[source]! * level);
  return result;
}
const originalSkills: SkillId[] = ['sacrifice', 'smite', 'might', 'prayer', 'resistFire', 'holyBolt', 'holyFire', 'thorns', 'defiance', 'resistCold', 'zeal', 'charge', 'blessedAim', 'cleansing', 'resistLightning', 'vengeance', 'blessedHammer', 'concentration', 'holyFreeze', 'vigor', 'conversion', 'holyShield', 'holyShock', 'sanctuary', 'meditation', 'fistOfHeavens', 'fanaticism', 'conviction', 'redemption', 'salvation'];
export function catalogSkill(param: string) { return originalSkills[Number(param) - 96] ?? (Object.entries(ORIGINAL_CLASS_SKILLS).find(([,skill])=>skill.number===Number(param))?.[0] as SkillId | undefined) ?? SKILLS.find(skill => skill.id.toLowerCase() === param.replaceAll(' ', '').toLowerCase())?.id; }

export function itemDamage(amount: number, type: DamageType, mods: Mods, resistance: number, conviction = 0) {
  const elemental = type !== 'physical' && type !== 'magic';
  const bonus = elemental ? mods[`${type}SkillDamage`] ?? 0 : 0;
  const reduction = elemental ? mods[`${type}Pierce`] ?? 0 : 0;
  // Item pierce cannot break immunity. Conviction is penalized before that decision.
  let effective = resistance - (resistance >= 100 ? Math.floor(conviction / 5) : conviction);
  if (effective >= 100) return 0;
  effective = Math.max(-100, effective - reduction);
  return Math.max(0, amount * (100 + bonus) * (100 - effective) / 10000);
}
export function absorbDamage(amount: number, type: DamageType, mods: Mods) {
  if (type === 'physical' || type === 'poison') return { damage: amount, healing: 0 };
  const percent = type === 'magic' ? 0 : Math.max(0, Math.min(40, mods[`${type}Absorb`] ?? 0));
  const proportional = amount * percent / 100;
  const flat = Math.min(amount - proportional, Math.max(0, mods[`${type}AbsorbFlat`] ?? 0));
  return { damage: Math.max(0, amount - proportional - flat), healing: proportional + flat };
}
export function openWoundsDps(level: number, boss = false) {
  const [slope, offset] = level <= 15 ? [9, 31] : level <= 30 ? [18, -104] : level <= 45 ? [27, -374] : level <= 60 ? [36, -779] : [45, -1319];
  return (slope * level + offset) * 25 / 256 / (boss ? 2 : 1);
}
export type ItemCurse = 'amplify' | 'decrepify' | 'lifeTap' | 'weaken';
export const CURSE_NAMES: Record<ItemCurse, string> = { amplify: '伤害加深', decrepify: '衰老', lifeTap: '偷取生命', weaken: '削弱' };
export function itemTrigger([event, param, chance, level]: CatalogProperty) {
  if (!['hit-skill', 'gethit-skill', 'att-skill'].includes(event)) return undefined;
  const name = param.toLowerCase().replaceAll(' ', '');
  const kind = ({ '66': 'amplify', amplifydamage: 'amplify', '87': 'decrepify', decrepify: 'decrepify', '82': 'lifeTap', lifetap: 'lifeTap', '72': 'weaken', weaken: 'weaken' } as Record<string, ItemCurse>)[name];
  return kind ? { event, kind, chance, level } : undefined;
}
