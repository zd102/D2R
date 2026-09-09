import { AFFIX_DATA, AFFIX_BASES, AFFIX_TYPES, type AffixDefinition } from './affix-data.ts';
import type { Item, Modifier, Mods } from './items.ts';
import { CATALOG_BASES } from './item-catalog-data.ts';

export const AFFIX_MOD_NAMES = {
  amazonSkills: '亚马逊技能', sorceressSkills: '法师技能', bowSkills: '弓与弩技能', passiveSkills: '被动与魔法技能', javelinSkills: '标枪与长矛技能', fireSkillsTab: '火焰法术技能', lightningSkills: '闪电法术技能', coldSkills: '冰冷法术技能',
  paladinSkills: '圣骑士技能', attackRatingPerLevel: '每级准确率', attackRatingPercentPerLevel: '每级准确率加成 %', maxDamagePerLevel: '每级最大伤害',
  fireMinDamage: '最小火焰伤害', fireMaxDamage: '最大火焰伤害', coldMinDamage: '最小冰冷伤害', coldMaxDamage: '最大冰冷伤害',
  lightningMinDamage: '最小闪电伤害', lightningMaxDamage: '最大闪电伤害', coldDuration: '冰冷持续秒数',
  poisonMinRate: '最小毒素速率', poisonMaxRate: '最大毒素速率', poisonFrames: '毒素持续帧数',
  halfFreeze: '冰冻时间减半', staminaRegen: '耐力恢复 %', staminaDrain: '耐力消耗降低 %',
};
export type CharmSize = 'small' | 'large' | 'grand';
export const CHARM_BASES = { small: { code: 'cm1', name: '小护身符', height: 1 }, large: { code: 'cm2', name: '大型护身符', height: 2 }, grand: { code: 'cm3', name: '超大型护身符', height: 3 } } as const;
// Legacy display names map to original base codes without changing saved base damage.
export const BASE_CODES: Record<string, string> = {
  '短剑': 'ssd', '权杖': 'scp', '弯刀': 'scm', '水晶剑': 'crs', '连枷': 'fla', '双手剑': '2hs', '战斗权杖': 'wsp', '符文剑': '9ls', '幻化之刃': '7cr',
  '圆盾': 'buc', '轻圆盾': 'sml', '轻盾': 'pa1', '皇冠之盾': 'pa5', '神圣小盾': 'pab',
  '布甲': 'qui', '皮甲': 'lea', '锁子甲': 'chn', '法师铠甲': 'xtp', '海蛇皮甲': 'xea', '执政官铠甲': 'utp',
  '皮帽': 'cap', '头盔': 'hlm', '军帽': 'uap', '皮手套': 'lgl', '铁手套': 'hgl', '饰带': 'lbl', '重扣带': 'mbl', '轻扣带': 'zlb',
  '皮靴': 'lbt', '锁链靴': 'mbt', '战场之靴': 'xtb', '戒指': 'rin', '项链': 'amu',
  '巨战权杖': 'wsp', '雄伟权杖': 'gsc', '神圣权杖': '9sc', '神属权杖': '9ws', '炽天使之杖': '7qs', '神使之杖': '7ws',
  '长剑': 'lsd', '阔剑': 'bsd', '巨剑': 'gsd', '空间之刃': '9cr', '战斗剑': '9bs', '秘仪之剑': '7ls', '巨神之刃': '7gd',
  '手斧': 'hax', '双刃斧': '2ax', '纳卡': '9wa', '狂战士斧': '7wa', '钉头锤': 'mac', '巨战之锤': 'whm', '铁皮鞭': '9fl', '天罚之锤': '7wh',
  '锐利之斧': 'pax', '战戟': 'hal', '锐利之柱': '7vo', '巨长斧': '7h7',
  '塔盾': 'tow', '歌德盾牌': 'gts', '白骨盾牌': 'bsh', '饰金盾牌': 'pa9', '皇家盾牌': 'paa', '统治者大盾': 'uit', '旋风盾': 'paf',
  '胸甲': 'brs', '哥德战甲': 'gth', '鬼魂战甲': 'xui', '织网战甲': 'xhn', '圣堂武士外袍': 'xlt', '灰暮寿衣': 'uui', '巨大鳞铠胸甲': 'ucl',
  '皇冠': 'crn', '翼盔': 'xhm', '恶魔头盖骨面具': 'usk', '骸骨面罩': 'uh9', '轻型铁手套': 'tgl', '战场手套': 'xtg', '吸血鬼骸骨手套': 'uvg',
  '吸血鬼獠牙腰带': 'uvc', '蛛网腰带': 'ulc', '巨战之靴': 'xhb', '圣甲虫壳靴': 'uvb',
};
export function affixLevel(itemLevel: number, qualityLevel: number, magicLevel = 0) {
  const level = Math.max(Math.min(99, Math.max(1, Math.floor(itemLevel))), qualityLevel), half = Math.floor(qualityLevel / 2);
  return Math.max(1, Math.min(99, magicLevel ? level + magicLevel : level < 99 - half ? level - half : 2 * level - 99));
}
export function affixBase(item: Item) {
  const code = item.baseCode ?? (item.charm ? CHARM_BASES[item.charmSize ?? (item.height === 3 ? 'grand' : item.height === 2 ? 'large' : 'small')].code : BASE_CODES[item.base ?? item.name]);
  const base = AFFIX_BASES[code] ?? CATALOG_BASES.find(base => base.code === code);
  if (!base) throw new Error(`Missing affix base: ${item.base ?? item.name}`);
  return base;
}
function itemTypes(type: string, seen = new Set<string>()) {
  if (!seen.has(type)) { seen.add(type); for (const parent of AFFIX_TYPES[type]?.parents ?? []) itemTypes(parent, seen); }
  return seen;
}
const byId = new Map(AFFIX_DATA.map(affix => [affix.id, affix]));
export const affixById = (id: string) => byId.get(id);
export function eligibleAffixes(item: Item, kind?: AffixDefinition['kind']) {
  const base = affixBase(item), level = affixLevel(item.level, base.level, base.magicLevel), types = itemTypes(base.type);
  return AFFIX_DATA.filter(affix => (!kind || affix.kind === kind) && (item.rarity !== 'rare' || affix.rare) && affix.level <= level && (!affix.maxLevel || level <= affix.maxLevel) && affix.include.some(type => types.has(type)) && !affix.exclude.some(type => types.has(type)));
}
export function affixSocketCap(item: Item) {
  const base = affixBase(item), caps = AFFIX_TYPES[base.type]?.sockets ?? [0, 0, 0];
  return Math.min(base.sockets, caps[item.level <= 25 ? 0 : item.level <= 40 ? 1 : 2]);
}
const PROPERTY_MODS: Record<string, Modifier> = {
  ac: 'defense', 'ac%': 'enhancedDefense', att: 'attackRating', 'att%': 'attackRatingPercent', 'dmg%': 'damage', 'dmg-min': 'minDamage', 'dmg-max': 'maxDamage',
  str: 'strength', dex: 'dexterity', enr: 'energy', hp: 'life', mana: 'mana', stam: 'stamina',
  'res-all': 'allRes', 'res-fire': 'fireRes', 'res-cold': 'coldRes', 'res-ltng': 'lightningRes', 'res-pois': 'poisonRes', 'res-pois-len': 'poisonLength',
  balance1: 'fhr', balance2: 'fhr', balance3: 'fhr', block: 'block', block2: 'fbr', cast1: 'fcr', cast3: 'fcr',
  swing1: 'ias', swing2: 'ias', swing3: 'ias', move1: 'runWalk', move2: 'runWalk', move3: 'runWalk',
  lifesteal: 'lifeSteal', manasteal: 'manaSteal', 'mag%': 'magicFind', 'gold%': 'goldFind', regen: 'replenishLife', 'mana-kill': 'manaOnKill',
  'red-dmg': 'damageReductionFlat', 'red-mag': 'magicReduction', thorns: 'reflectDamage', knock: 'knockback', noheal: 'preventHeal',
  'ignore-ac': 'ignoreDefense', 'half-freeze': 'halfFreeze', 'regen-stam': 'staminaRegen', stamdrain: 'staminaDrain',
  'dmg-demon': 'damageDemons', 'dmg-undead': 'damageUndead', 'att-demon': 'attackDemons', 'att-undead': 'attackUndead', 'dmg-to-mana': 'damageToMana', pal: 'paladinSkills', ama: 'amazonSkills', sor: 'sorceressSkills',
  'fire-min': 'fireMinDamage', 'fire-max': 'fireMaxDamage', 'cold-min': 'coldMinDamage', 'cold-max': 'coldMaxDamage', 'ltng-min': 'lightningMinDamage', 'ltng-max': 'lightningMaxDamage',
};
const PER_LEVEL: Record<string, [Modifier, number]> = { 'ac/lvl': ['defensePerLevel', 8], 'hp/lvl': ['lifePerLevel', 8], 'mana/lvl': ['manaPerLevel', 8], 'dmg/lvl': ['maxDamagePerLevel', 8], 'att/lvl': ['attackRatingPerLevel', 2], 'att%/lvl': ['attackRatingPercentPerLevel', 2] };
export function supportsAffixProperty(code: string) {
  return Object.hasOwn(PROPERTY_MODS, code) || Object.hasOwn(PER_LEVEL, code) || ['indestruct', 'skilltab', 'ease', 'cold-len', 'sock', 'dmg-pois', 'dmg-fire', 'dmg-cold', 'dmg-ltng'].includes(code);
}
const unitRandom = (random: () => number) => Math.max(0, Math.min(1 - Number.EPSILON, random()));
const integerRoll = (min: number, max: number, random: () => number) => min + Math.floor(unitRandom(random) * (max - min + 1));
export function rollAffix(affix: AffixDefinition, random = Math.random): { mods: Mods; sockets: number } {
  const mods: Mods = {}; let sockets = 0;
  const add = (mod: Modifier, value: number) => { mods[mod] = (mods[mod] ?? 0) + value; };
  for (const [code, param, min, max] of affix.properties) {
    if (PROPERTY_MODS[code]) add(PROPERTY_MODS[code], integerRoll(min, max, random));
    else if (code === 'indestruct') add('indestructible', 1);
    else if (PER_LEVEL[code]) { const [mod, divisor] = PER_LEVEL[code]; add(mod, param / divisor); }
    else if (code === 'skilltab') { const key = ({ 0: 'bowSkills', 1: 'passiveSkills', 2: 'javelinSkills', 3: 'fireSkillsTab', 4: 'lightningSkills', 5: 'coldSkills', 9: 'combatSkills', 10: 'offensiveSkills', 11: 'defensiveSkills' } as Partial<Record<number, Modifier>>)[param]; if(key) add(key, integerRoll(min, max, random)); }
    else if (code === 'ease') add('requirementReduction', -integerRoll(min, max, random));
    else if (code === 'cold-len') add('coldDuration', integerRoll(min, max, random) / 25);
    else if (code === 'sock') sockets = param || integerRoll(min, max, random);
    else if (code === 'dmg-pois') { add('poisonMinRate', min); add('poisonMaxRate', max); add('poisonFrames', param); }
    else if (['dmg-fire', 'dmg-cold', 'dmg-ltng'].includes(code)) {
      const type = code === 'dmg-fire' ? 'fire' : code === 'dmg-cold' ? 'cold' : 'lightning';
      add(`${type}MinDamage`, min); add(`${type}MaxDamage`, max);
      if (type === 'cold') add('coldDuration', param / 25);
    } else throw new Error(`Unsupported affix property: ${code}`);
  }
  return { mods, sockets };
}
const NAMES: Record<string, string> = {
  Cruel: '残酷', Ferocious: '凶猛', Merciless: '无情', Savage: '野蛮', Massive: '巨大', Brutal: '残忍', Vicious: '恶毒', Deadly: '致命', Jagged: '锯齿', Fine: '精良', Sharp: '锋利',
  "Warrior's": '勇士', "Soldier's": '士兵', "Knight's": '骑士', "Lord's": '领主', "King's": '国王', "Master's": '大师', "Grandmaster's": '宗师', Trump: '愚人', Gritty: '磨砺', Hawkeye: '鹰眼', Visionary: '远见',
  "Mechanist's": '技工', "Artificer's": '工匠', "Jeweler's": '珠宝匠', Shimmering: '闪耀', Rainbow: '彩虹', Scintillating: '闪光', Prismatic: '棱镜', Chromatic: '色彩',
  'Lion Branded': '狮印', 'Hawk Branded': '鹰印', 'Rose Branded': '玫瑰印', "Captain's": '队长', "Commander's": '指挥官', "Marshal's": '元帅', "Preserver's": '守护者', "Warder's": '守望者', "Guardian's": '保护者', "Monk's": '修士', "Priest's": '牧师',
  'of Vita': '活力', 'of Substinence': '生命', 'of Balance': '平衡', 'of Stability': '稳定', 'of Equilibrium': '均衡', 'of Inertia': '惯性', 'of Deflecting': '偏向', 'of Blocking': '格挡',
  'of the Apprentice': '学徒', 'of the Magus': '法师', 'of Quickness': '快速', 'of Alacrity': '敏捷', 'of Readiness': '准备', 'of Swiftness': '迅速',
  'of Good Luck': '好运', 'of Luck': '幸运', 'of Fortune': '财富', 'of Chance': '机运', 'of Anthrax': '炭疽', Pestilent: '瘟疫', Toxic: '剧毒', Septic: '腐败', Envenomed: '毒液',
  Hibernal: '凛冬', Boreal: '北风', Shivering: '寒颤', Snowflake: '雪花', Flaming: '烈焰', Smoking: '烟熏', Smoldering: '闷烧', Ember: '余烬', Shocking: '雷暴', Arcing: '电弧', Buzzing: '嗡鸣', Glowing: '电光', Static: '静电',
};
const MOD_LABELS: Partial<Record<Modifier, string>> = { strength: '力量', dexterity: '灵巧', energy: '精力', life: '生命', mana: '法力', defense: '坚固', enhancedDefense: '守御', attackRating: '精准', minDamage: '猛击', maxDamage: '利刃', magicFind: '寻宝', goldFind: '黄金', lifeSteal: '吸血', manaSteal: '汲取', fireRes: '红玉', coldRes: '蓝玉', lightningRes: '琥珀', poisonRes: '翡翠', runWalk: '疾行', replenishLife: '复苏', stamina: '坚韧', poisonLength: '解毒', damageReductionFlat: '防护', magicReduction: '结界', reflectDamage: '荆棘', fireMinDamage: '火焰', coldMinDamage: '冰霜', lightningMinDamage: '闪电', poisonMinRate: '毒素', knockback: '击退', preventHeal: '恶意', requirementReduction: '简易' };
export function affixName(affix: AffixDefinition) { const mod=Object.keys(rollAffix(affix, () => 0).mods)[0] as Modifier;return NAMES[affix.name] ?? ({amazonSkills:'女武神',sorceressSkills:'术士',bowSkills:'弓术',javelinSkills:'枪术',passiveSkills:'猎手',fireSkillsTab:'火焰',coldSkills:'冰霜',lightningSkills:'闪电'} as Partial<Record<Modifier,string>>)[mod]?? MOD_LABELS[mod] ?? '秘法'; }
export function applyAffixes(item: Item, random = Math.random) {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') return item;
  const pool = eligibleAffixes(item), chosen: AffixDefinition[] = [], groups = new Set<number>();
  const magicLevel = affixBase(item).magicLevel, weight = (affix: AffixDefinition) => affix.frequency * (magicLevel ? affix.level : 1);
  const select = (kind: AffixDefinition['kind']) => {
    const candidates = pool.filter(a => a.kind === kind && !groups.has(a.group));
    let roll = unitRandom(random) * candidates.reduce((sum, a) => sum + weight(a), 0);
    const affix = candidates.find(a => (roll -= weight(a)) < 0);
    if (affix) { chosen.push(affix); groups.add(affix.group); }
    return !!affix;
  };
  if (item.rarity === 'magic') {
    const roll = unitRandom(random);
    if (roll < .5) select('suffix');
    else if (roll < .75) select('prefix');
    else { select('prefix'); select('suffix'); }
    if (!chosen.length) { select('prefix'); if (!chosen.length) select('suffix'); }
  } else {
    const count = [3, 4, 4, 5, 5, 5, 6, 6][integerRoll(0, 7, random)];
    const exhausted = { prefix: false, suffix: false };
    while (chosen.length < count && !(exhausted.prefix && exhausted.suffix)) {
      const kind = exhausted.prefix ? 'suffix' : exhausted.suffix ? 'prefix' : random() < .5 ? 'prefix' : 'suffix';
      if (!select(kind) || chosen.filter(a => a.kind === kind).length >= 3) exhausted[kind] = true;
    }
  }
  item.affixes = chosen.map(a => a.id); item.requiredLevel = Math.max(1, affixBase(item).requiredLevel, ...chosen.map(a => a.requiredLevel));
  for (const affix of chosen) {
    const rolled = rollAffix(affix, random); item.mods ??= {};
    for (const [key, value] of Object.entries(rolled.mods) as [Modifier, number][]) item.mods[key] = (item.mods[key] ?? 0) + value;
    if (rolled.sockets) item.sockets = Math.min(rolled.sockets, affixSocketCap(item));
  }
  const baseName = item.base ?? item.name;
  if (item.slot !== 'weapon' && item.mods?.enhancedDefense) item.power = (CATALOG_BASES.find(base => base.code === (item.baseCode ?? BASE_CODES[item.base ?? item.name]))?.defenseMax ?? item.power) + 1;
  if (item.rarity === 'magic') { const prefix = chosen.find(a => a.kind === 'prefix'), suffix = chosen.find(a => a.kind === 'suffix'); item.name = `${prefix ? affixName(prefix) : ''}${baseName}${suffix ? `之${affixName(suffix)}` : ''}`; }
  else item.name = `${['毁灭', '鲜血', '灵魂', '风暴', '命运', '荣耀'][integerRoll(0, 5, random)]}${['之握', '之眼', '之誓', '之冠', '之触', '之印'][integerRoll(0, 5, random)]}`;
  item.value += chosen.length * 75; item.identified = false;
  return item;
}
export function affixRanges(item: Item) {
  const ranges: Partial<Record<Modifier, [number, number]>> = {};
  for (const id of item.affixes ?? []) {
    const affix = affixById(id); if (!affix) continue;
    const low = rollAffix(affix, () => 0).mods, high = rollAffix(affix, () => 1).mods;
    for (const key of Object.keys(low) as Modifier[]) { const range = ranges[key] ??= [0, 0]; range[0] += Math.min(low[key]!, high[key]!); range[1] += Math.max(low[key]!, high[key]!); }
  }
  return ranges;
}
export function elementalDamage(mods: Mods, type: 'fire' | 'cold' | 'lightning', random = Math.random) {
  const min = mods[`${type}MinDamage`] ?? 0, max = Math.max(min, mods[`${type}MaxDamage`] ?? 0);
  return (mods[`${type}Damage`] ?? 0) + integerRoll(min, max, random);
}
export function poisonDamage(mods: Mods) {
  const seconds = (mods.poisonFrames ?? 0) / 25;
  return { min: (mods.poisonMinRate ?? 0) * (mods.poisonFrames ?? 0) / 256, max: (mods.poisonMaxRate ?? 0) * (mods.poisonFrames ?? 0) / 256, seconds };
}
