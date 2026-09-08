import { EXPANSION_MOD_NAMES, EXTRA_RUNES, EXTRA_BASES, EXTRA_RUNEWORDS, EXTRA_UNIQUES } from './item-expansion.ts';
import { AFFIX_MOD_NAMES, applyAffixes, type CharmSize } from './affixes.ts';
export const SLOTS = ['helm', 'amulet', 'weapon', 'armor', 'shield', 'gloves', 'ring', 'belt', 'ring2', 'boots'] as const;
export type Slot = typeof SLOTS[number];
export type Rarity = 'common' | 'magic' | 'rare' | 'set' | 'unique' | 'runeword' | 'legendary';
export const rarityNames: Record<Rarity, string> = { common: '普通', magic: '魔法', rare: '稀有', set: '套装', unique: '暗金', runeword: '符文之语', legendary: '传承' };
export const slotNames: Record<Slot, string> = { weapon: '主手', armor: '铠甲', shield: '副手盾牌', helm: '头盔', amulet: '项链', gloves: '手套', belt: '腰带', boots: '靴子', ring: '左戒指', ring2: '右戒指' };
const BASE_MOD_NAMES = { strength: '力量', dexterity: '敏捷', vitality: '体力', energy: '精力', life: '生命', mana: '法力', damage: '增强伤害 %', defense: '防御', enhancedDefense: '增强防御 %', attackRating: '准确率', allRes: '所有抗性', fireRes: '火焰抗性', coldRes: '冰冷抗性', lightningRes: '闪电抗性', poisonRes: '毒素抗性', allSkills: '所有技能', combatSkills: '战斗技能', offensiveSkills: '攻击灵气', defensiveSkills: '防御灵气', ias: '攻击速度 %', fcr: '施法速度 %', fhr: '打击恢复 %', fbr: '格挡速度 %', block: '格挡几率 %', lifeSteal: '生命偷取 %', manaSteal: '法力偷取 %', crushingBlow: '压碎性打击 %', deadlyStrike: '致命攻击 %', openWounds: '撕开伤口 %', magicFind: '寻获魔法装备 %', runWalk: '跑步 / 行走速度 %', manaRegen: '法力恢复 %', replenishLife: '生命恢复', damageReduction: '物理伤害减免 %', fireDamage: '火焰伤害', coldDamage: '冰冷伤害', lightningDamage: '闪电伤害', poisonDamage: '毒素伤害', cannotBeFrozen: '无法冰冻' };
export const MOD_NAMES = { ...BASE_MOD_NAMES, ...EXPANSION_MOD_NAMES, ...AFFIX_MOD_NAMES, attackRatingPercent: '准确率加成 %', minDamage: '最小伤害', maxDamage: '最大伤害', damageFlat: '伤害', maxManaPercent: '法力上限 %', lifePerLevel: '每级生命', manaPerLevel: '每级法力', defensePerLevel: '每级防御', damageReductionFlat: '物理伤害减少', magicReduction: '魔法伤害减少', reflectDamage: '攻击者受到伤害', manaOnKill: '击杀恢复法力', lightRadius: '照亮范围', knockback: '击退', targetDefense: '降低目标防御 %', stamina: '耐力', damageToMana: '受伤转化法力 %', poisonLength: '缩短中毒时间 %', coldAbsorb: '冰冷吸收 %' };
export type Modifier = keyof typeof MOD_NAMES;
export type Mods = Partial<Record<Modifier, number>>;
export const RUNE_ORDER = ['el', 'eld', 'tir', 'nef', 'eth', 'ith', 'tal', 'ral', 'ort', 'thul', 'amn', 'sol', 'shael', 'dol', 'hel', 'io', 'lum', 'ko', 'fal', 'lem', 'pul', 'um', 'mal', 'ist', 'gul', 'vex', 'ohm', 'lo', 'sur', 'ber', 'jah', 'cham', 'zod'] as const;
export type RuneId = typeof RUNE_ORDER[number];
export const DROP_RATES = {
  monster: { equipment: .16, rune: .035, charm: .006 },
  miniboss: { equipment: .80, rune: .28, charm: .025 },
  actBoss: { equipment: 1, rune: .70, charm: .04 },
} as const;
export type DropRank = keyof typeof DROP_RATES;
export function rollDropKinds(rank: DropRank, random = Math.random) {
  const rates = DROP_RATES[rank];
  return { equipment: random() < rates.equipment, rune: random() < rates.rune, charm: random() < rates.charm };
}
const runeData = {
  el: { name: '艾尔', level: 11, weapon: { attackRating: 50, lightRadius: 1 }, armor: { defense: 15, lightRadius: 1 }, shield: { defense: 15, lightRadius: 1 } },
  tir: { name: '特尔', level: 13, weapon: { manaOnKill: 2 }, armor: { manaOnKill: 2 }, shield: { manaOnKill: 2 } },
  nef: { name: '那夫', level: 13, weapon: { knockback: 1 }, armor: { defense: 30 }, shield: { defense: 30 } },
  eth: { name: '爱斯', level: 15, weapon: { targetDefense: 25 }, armor: { manaRegen: 15 }, shield: { manaRegen: 15 } },
  ith: { name: '伊司', level: 15, weapon: { maxDamage: 9 }, armor: { damageToMana: 15 }, shield: { damageToMana: 15 } },
  tal: { name: '塔尔', level: 17, weapon: { poisonDamage: 25 }, armor: { poisonRes: 30 }, shield: { poisonRes: 35 } },
  ral: { name: '拉尔', level: 19, weapon: { fireDamage: 17 }, armor: { fireRes: 30 }, shield: { fireRes: 35 } },
  ort: { name: '欧特', level: 21, weapon: { lightningDamage: 25 }, armor: { lightningRes: 30 }, shield: { lightningRes: 35 } },
  thul: { name: '书尔', level: 23, weapon: { coldDamage: 10 }, armor: { coldRes: 30 }, shield: { coldRes: 35 } },
  amn: { name: '安姆', level: 25, weapon: { lifeSteal: 7 }, armor: { reflectDamage: 14 }, shield: { reflectDamage: 14 } },
  sol: { name: '索尔', level: 27, weapon: { damageFlat: 9 }, armor: { damageReductionFlat: 7 }, shield: { damageReductionFlat: 7 } },
  ...EXTRA_RUNES,
};
export const RUNES = Object.fromEntries(RUNE_ORDER.map(id => [id, runeData[id]])) as Record<RuneId, { name: string; level: number; weapon: Mods; armor: Mods; shield: Mods }>;
export type Item = { id: string; name: string; slot: Slot; rarity: Rarity; power: number; level: number; value: number;
  base?: string; minDamage?: number; maxDamage?: number; smiteMin?: number; smiteMax?: number; block?: number; speed?: number; twoHanded?: boolean;
  requiredLevel?: number; requiredStrength?: number; requiredDexterity?: number; mods?: Mods; durability?: number; maxDurability?: number;
  sockets?: number; runes?: RuneId[]; identified?: boolean; width?: number; height?: number; x?: number; y?: number; setId?: string; charm?: boolean;
  affixes?: string[]; charmSize?: CharmSize;
};
export type WeaponType = 'sword' | 'axe' | 'mace' | 'hammer' | 'scepter' | 'polearm';
export type ItemBase = { name: string; slot: Slot; level: number; power: number; strength?: number; dexterity?: number; min?: number; max?: number; block?: number; smiteMin?: number; smiteMax?: number; speed?: number; twoHanded?: boolean; sockets?: number; weaponType?: WeaponType };
export const BASES: ItemBase[] = [
  { name: '短剑', slot: 'weapon', level: 1, power: 8, min: 2, max: 7, speed: 0, sockets: 2 },
  { name: '权杖', slot: 'weapon', level: 1, power: 9, strength: 25, min: 6, max: 11, sockets: 2 },
  { name: '弯刀', slot: 'weapon', level: 5, power: 10, dexterity: 21, min: 2, max: 6, speed: -20, sockets: 2 },
  { name: '水晶剑', slot: 'weapon', level: 12, power: 15, strength: 43, min: 5, max: 15, sockets: 6 },
  { name: '连枷', slot: 'weapon', level: 16, power: 24, strength: 41, dexterity: 35, min: 1, max: 24, speed: -10, sockets: 5 },
  { name: '双手剑', slot: 'weapon', level: 10, power: 17, strength: 35, dexterity: 27, min: 8, max: 17, twoHanded: true, sockets: 3 },
  { name: '战斗权杖', slot: 'weapon', level: 21, power: 24, strength: 55, min: 10, max: 17, speed: -10, sockets: 4 },
  { name: '符文剑', slot: 'weapon', level: 38, power: 42, strength: 103, dexterity: 79, min: 10, max: 42, speed: -10, sockets: 4 },
  { name: '幻化之刃', slot: 'weapon', level: 73, power: 35, strength: 25, dexterity: 136, min: 31, max: 35, speed: -30, sockets: 6 },
  { name: '圆盾', slot: 'shield', level: 1, power: 5, strength: 12, block: 30, smiteMin: 1, smiteMax: 3, sockets: 1 },
  { name: '轻圆盾', slot: 'shield', level: 3, power: 12, strength: 22, block: 40, smiteMin: 2, smiteMax: 6, sockets: 3 },
  { name: '轻盾', slot: 'shield', level: 10, power: 22, strength: 16, block: 40, smiteMin: 2, smiteMax: 6, sockets: 4 },
  { name: '皇冠之盾', slot: 'shield', level: 24, power: 35, strength: 65, block: 55, smiteMin: 4, smiteMax: 12, sockets: 4 },
  { name: '神圣小盾', slot: 'shield', level: 63, power: 145, strength: 86, block: 60, smiteMin: 22, smiteMax: 70, sockets: 4 },
  { name: '布甲', slot: 'armor', level: 1, power: 8, sockets: 2 },
  { name: '皮甲', slot: 'armor', level: 3, power: 15, strength: 15, sockets: 2 },
  { name: '锁子甲', slot: 'armor', level: 15, power: 65, strength: 48, sockets: 2 },
  { name: '法师铠甲', slot: 'armor', level: 25, power: 100, strength: 55, sockets: 3 },
  { name: '海蛇皮甲', slot: 'armor', level: 36, power: 125, strength: 43, sockets: 2 },
  { name: '执政官铠甲', slot: 'armor', level: 63, power: 450, strength: 103, sockets: 4 },
  { name: '皮帽', slot: 'helm', level: 1, power: 4, sockets: 2 },
  { name: '头盔', slot: 'helm', level: 11, power: 18, strength: 26, sockets: 2 },
  { name: '军帽', slot: 'helm', level: 58, power: 100, strength: 50, sockets: 2 },
  { name: '皮手套', slot: 'gloves', level: 1, power: 3 },
  { name: '铁手套', slot: 'gloves', level: 18, power: 15, strength: 60 },
  { name: '饰带', slot: 'belt', level: 1, power: 2 },
  { name: '重扣带', slot: 'belt', level: 12, power: 8, strength: 25 },
  { name: '轻扣带', slot: 'belt', level: 27, power: 15, strength: 50 },
  { name: '皮靴', slot: 'boots', level: 1, power: 3 },
  { name: '锁链靴', slot: 'boots', level: 12, power: 12, strength: 30 },
  { name: '战场之靴', slot: 'boots', level: 32, power: 45, strength: 95 },
  { name: '戒指', slot: 'ring', level: 1, power: 0 },
  { name: '项链', slot: 'amulet', level: 1, power: 0 },
  ...EXTRA_BASES,
];
const LEGACY_WEAPON_TYPES: Record<string, WeaponType> = { '短剑': 'sword', '权杖': 'scepter', '弯刀': 'sword', '水晶剑': 'sword', '连枷': 'mace', '双手剑': 'sword', '战斗权杖': 'scepter', '符文剑': 'sword', '幻化之刃': 'sword' };
export function weaponType(item: Item) { return BASES.find(base => base.name === (item.base ?? item.name))?.weaponType ?? LEGACY_WEAPON_TYPES[item.base ?? item.name]; }
export const itemId = () => globalThis.crypto.randomUUID?.() ?? globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-');
export const footprint = (item: Item): [number, number] => [item.width ?? (['ring', 'ring2', 'amulet'].includes(item.slot) ? 1 : 2), item.height ?? (item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'shield' ? 3 : ['ring', 'ring2', 'amulet', 'belt'].includes(item.slot) ? 1 : 2)];
export function makeItem(base: ItemBase, id: string = itemId()): Item {
  const durable = !['ring', 'amulet'].includes(base.slot);
  const item: Item = { id, name: base.name, base: base.name, slot: base.slot, rarity: 'common', power: base.power, level: base.level, value: 20 + base.level * 30,
    minDamage: base.min, maxDamage: base.max, block: base.block, smiteMin: base.smiteMin, smiteMax: base.smiteMax, speed: base.speed ?? 0, twoHanded: base.twoHanded ?? false,
    requiredLevel: base.level > 30 ? base.level - 10 : 1, requiredStrength: base.strength ?? 0, requiredDexterity: base.dexterity ?? 0,
    mods: base.name === '幻化之刃' ? { indestructible: 1 } : {}, identified: true, ...(durable ? { durability: 40, maxDurability: 40 } : {}), sockets: 0, runes: [],
  };
  for (const key of Object.keys(item) as (keyof Item)[]) if (item[key] === undefined) delete item[key];
  return item;
}
export function addMods(target: Mods, source: Mods | undefined) { for (const key of Object.keys(source ?? {}) as Modifier[]) target[key] = (target[key] ?? 0) + source![key]!; return target; }
export function itemMods(item: Item): Mods {
  const result = { ...item.mods };
  if (item.rarity !== 'runeword') for (const rune of item.runes ?? []) addMods(result, RUNES[rune][item.slot === 'weapon' ? 'weapon' : item.slot === 'shield' ? 'shield' : 'armor']);
  return result;
}
export type RuneWord = { name: string; runes: RuneId[]; slots: Slot[]; bases?: string[]; weaponTypes?: WeaponType[]; mods: Mods };
export const RUNEWORDS: RuneWord[] = [
  { name: '钢铁', runes: ['tir', 'el'], slots: ['weapon'], weaponTypes: ['sword', 'axe', 'mace'], mods: { damage: 20, minDamage: 3, maxDamage: 3, ias: 25, attackRating: 50, openWounds: 50, manaOnKill: 2, lightRadius: 1 } },
  { name: '隐密', runes: ['tal', 'eth'], slots: ['armor'], mods: { runWalk: 25, fcr: 25, fhr: 25, dexterity: 6, manaRegen: 15, poisonRes: 30, stamina: 15, magicReduction: 3 } },
  { name: '先祖之誓', runes: ['ral', 'ort', 'tal'], slots: ['shield'], mods: { enhancedDefense: 50, coldRes: 43, fireRes: 48, lightningRes: 48, poisonRes: 48, damageToMana: 10 } },
  { name: '精神', runes: ['tal', 'thul', 'ort', 'amn'], slots: ['weapon', 'shield'], weaponTypes: ['sword'], mods: { allSkills: 2, fcr: 30, fhr: 55, vitality: 22, mana: 100 } },
  { name: '知识', runes: ['ort', 'sol'], slots: ['helm'], mods: { allSkills: 1, energy: 10, lightningRes: 30, damageReductionFlat: 7, manaOnKill: 2, lightRadius: 2 } },
  ...EXTRA_RUNEWORDS,
];
export const WEAPON_TYPE_NAMES: Record<WeaponType, string> = { sword: '剑', axe: '斧', mace: '钉锤 / 连枷', hammer: '战锤', scepter: '权杖', polearm: '长柄武器' };
export function runewordFits(item: Item, word: RuneWord) {
  return item.rarity === 'common' && item.sockets === word.runes.length && word.slots.includes(item.slot) && (!word.bases || word.bases.includes(item.base ?? item.name)) && (item.slot !== 'weapon' || !word.weaponTypes || !!weaponType(item) && word.weaponTypes.includes(weaponType(item)!));
}
export function itemRequirements(item: Item) {
  const factor = Math.max(0, 1 - (itemMods(item).requirementReduction ?? 0) / 100);
  return { strength: Math.floor((item.requiredStrength ?? 0) * factor), dexterity: Math.floor((item.requiredDexterity ?? 0) * factor) };
}
export function socketItem(item: Item, rune: RuneId): boolean {
  if (!RUNES[rune] || !item.sockets || (item.runes?.length ?? 0) >= item.sockets || item.identified === false) return false;
  item.runes ??= []; item.runes.push(rune); item.requiredLevel = Math.max(item.requiredLevel ?? 1, RUNES[rune].level);
  const word = RUNEWORDS.find(word => runewordFits(item, word) && word.runes.every((value, index) => item.runes![index] === value));
  if (word) {
    item.name = word.name; item.rarity = 'runeword'; addMods(item.mods ??= {}, word.mods);
    if (word.name === '精神') addMods(item.mods, item.slot === 'shield' ? { coldRes: 35, lightningRes: 35, poisonRes: 35 } : { lifeSteal: 7, poisonDamage: 25, coldDamage: 10, lightningDamage: 25 });
  }
  return true;
}
export type ItemPosition = { x: number; y: number; width: number; height: number };
export function packItems(items: Item[], rows = 4): Map<string, ItemPosition> | null {
  const occupied = new Set<number>(), positions = new Map<string, ItemPosition>(), pending: Item[] = [];
  const fits = (x: number, y: number, width: number, height: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + width <= 10 && y + height <= rows && Array.from({ length: width * height }, (_, n) => (y + Math.floor(n / width)) * 10 + x + n % width).every(cell => !occupied.has(cell));
  const reserve = (item: Item, x: number, y: number) => {
    const [width, height] = footprint(item);
    for (let n = 0; n < width * height; n++) occupied.add((y + Math.floor(n / width)) * 10 + x + n % width);
    positions.set(item.id, { x, y, width, height });
  };
  // Reserve saved placements before assigning space to new or legacy items.
  for (const item of items) {
    if (fits(item.x ?? -1, item.y ?? -1, ...footprint(item))) reserve(item, item.x!, item.y!);
    else pending.push(item);
  }
  for (const item of pending) {
    const [width, height] = footprint(item); let found = false;
    for (let y = 0; y <= rows - height && !found; y++) for (let x = 0; x <= 10 - width; x++) if (fits(x, y, width, height)) { reserve(item, x, y); found = true; break; }
    if (!found) return null;
  }
  return positions;
}
export function canMoveItem(items: Item[], id: string, x: number, y: number, rows = 4) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const positions = packItems(items, rows), current = positions?.get(id);
  if (!positions || !current || x < 0 || y < 0 || x + current.width > 10 || y + current.height > rows) return false;
  return [...positions].every(([otherId, other]) => otherId === id || x + current.width <= other.x || other.x + other.width <= x || y + current.height <= other.y || other.y + other.height <= y);
}
export function moveItem(items: Item[], id: string, x: number, y: number, rows = 4) {
  if (!canMoveItem(items, id, x, y, rows)) return false;
  const positions = packItems(items, rows)!;
  for (const item of items) { const position = positions.get(item.id)!; item.x = item.id === id ? x : position.x; item.y = item.id === id ? y : position.y; }
  return true;
}
export function stashRows(items: Item[]) {
  return Math.max(10, Math.ceil(items.reduce((sum, item) => sum + footprint(item)[0] * footprint(item)[1], 0) / 10) + 4, ...items.map(item => (item.y ?? 0) + footprint(item)[1]));
}
export function placeItems(items: Item[], rows = 4) { const positions = packItems(items, rows); if (!positions) return false; for (const item of items) { const p = positions.get(item.id)!; item.x = p.x; item.y = p.y; } return true; }
export type SpecialItem = ItemBase & { base: string; rarity: 'set' | 'unique'; mods: Mods; durability?: number };
export const SPECIAL_ITEMS: SpecialItem[] = [
  { name: '拿各的戒指', base: '戒指', slot: 'ring', rarity: 'unique', level: 7, power: 0, mods: { attackRating: 65, magicFind: 25, magicReduction: 3, reflectDamage: 3 } },
  { name: '玛那得的治疗', base: '戒指', slot: 'ring', rarity: 'unique', level: 15, power: 0, mods: { manaSteal: 6, replenishLife: 6, manaRegen: 20, life: 20 } },
  { name: '乔丹之石', base: '戒指', slot: 'ring', rarity: 'unique', level: 29, power: 0, mods: { allSkills: 1, maxManaPercent: 25, mana: 20, lightningDamage: 6 } },
  { name: '乌鸦之霜', base: '戒指', slot: 'ring', rarity: 'unique', level: 45, power: 0, mods: { attackRating: 200, coldDamage: 30, cannotBeFrozen: 1, dexterity: 18, mana: 40, coldAbsorb: 20 } },
  { name: '精神之帷幕', base: '鬼魂战甲', slot: 'armor', rarity: 'unique', level: 28, power: 118, strength: 38, durability: 20, mods: { enhancedDefense: 150, cannotBeFrozen: 1, allSkills: 1, replenishLife: 10, magicReduction: 9 } },
  { name: '蛇魔法师之皮', base: '海蛇皮甲', slot: 'armor', rarity: 'unique', level: 29, power: 127, strength: 43, durability: 24, mods: { enhancedDefense: 120, allSkills: 1, fcr: 30, magicReduction: 11, allRes: 30 } },
  { name: '谢夫特斯坦布', base: '织网战甲', slot: 'armor', rarity: 'unique', level: 38, power: 214, strength: 92, durability: 45, mods: { enhancedDefense: 200, damageReduction: 30, life: 60 } },
  { name: '撒卡兰姆使者', base: '饰金盾牌', slot: 'shield', rarity: 'unique', level: 42, power: 169, strength: 89, durability: 50, block: 52, smiteMin: 20, smiteMax: 28, mods: { enhancedDefense: 175, block: 30, fbr: 30, attackRatingPercent: 20, strength: 20, vitality: 20, allRes: 50, allSkills: 2, combatSkills: 2 } },
  { name: '谐角之冠', base: '军帽', slot: 'helm', rarity: 'unique', level: 62, power: 120, strength: 50, durability: 12, mods: { allSkills: 2, lifePerLevel: 1.5, manaPerLevel: 1.5, damageReduction: 10, magicFind: 50, strength: 2, dexterity: 2, vitality: 2, energy: 2 } },
  { name: '哥布林脚趾', base: '轻型金属靴', slot: 'boots', rarity: 'unique', level: 22, power: 12, strength: 50, durability: 18, mods: { enhancedDefense: 55, crushingBlow: 25, damageReductionFlat: 1, magicReduction: 1, defense: 15 } },
  { name: '蚀肉骑士', base: '巨战之靴', slot: 'boots', rarity: 'unique', level: 47, power: 54, strength: 94, durability: 34, mods: { enhancedDefense: 180, runWalk: 30, openWounds: 10, crushingBlow: 15, deadlyStrike: 15, stamina: 20 } },
  { name: '西刚的面甲', base: '卓越头盔', slot: 'helm', rarity: 'set', level: 6, power: 35, strength: 63, mods: { defense: 25, mana: 30 } },
  { name: '西刚的遮蔽', base: '哥德战甲', slot: 'armor', rarity: 'set', level: 6, power: 136, strength: 70, mods: { enhancedDefense: 25, lightningRes: 30 } },
  { name: '西刚的木鞋', base: '护胫', slot: 'boots', rarity: 'set', level: 6, power: 15, strength: 70, mods: { runWalk: 20, coldRes: 40 } },
  { name: '西刚的守护', base: '塔盾', slot: 'shield', rarity: 'set', level: 6, power: 25, strength: 75, block: 54, smiteMin: 1, smiteMax: 5, mods: { allSkills: 1, block: 20 } },
  { name: '西刚的挑战', base: '金属手套', slot: 'gloves', rarity: 'set', level: 6, power: 15, strength: 60, mods: { attackRating: 20, strength: 10 } },
  { name: '西刚的包覆', base: '金属扣带', slot: 'belt', rarity: 'set', level: 6, power: 11, strength: 60, mods: { fireRes: 20, life: 20 } },
  ...EXTRA_UNIQUES,
];
export function specialItem(name: string): Item {
  const template = SPECIAL_ITEMS.find(item => item.name === name); if (!template) throw new Error('Unknown special item');
  const item = makeItem({ ...BASES.find(base => base.name === template.base), ...template, name: template.base });
  item.name = template.name; item.rarity = template.rarity; item.requiredLevel = template.level; item.mods = { ...template.mods }; item.identified = false;
  if (template.durability) item.durability = item.maxDurability = template.durability;
  if (template.sockets) item.sockets = template.sockets;
  if (template.rarity === 'set') item.setId = 'sigon';
  return item;
}
export function rollItem(level: number, roll = Math.random(), forceUnique = false, magicFind = 0, random = Math.random): Item {
  level = Math.max(1, Math.min(99, Math.floor(level)));
  const available = BASES.filter(base => base.level <= level + 3);
  const base = weightedChoice(available, base => ['ring', 'amulet'].includes(base.slot) ? 3 : 1 + 5 * (base.level / Math.max(1, level)) ** 2, random);
  const item = makeItem(base); item.level = level;
  const mf = Math.max(0, magicFind), uniqueChance = .02 * (1 + mf * 250 / (mf + 250) / 100), setChance = .035 * (1 + mf * 500 / (mf + 500) / 100);
  item.rarity = forceUnique || roll > 1 - uniqueChance ? 'unique' : roll > 1 - uniqueChance - setChance ? 'set' : roll > .71 - Math.min(.12, mf / 2500) ? 'rare' : roll > .32 ? 'magic' : 'common';
  if (item.rarity === 'unique' || item.rarity === 'set') {
    const candidates = SPECIAL_ITEMS.filter(special => special.rarity === item.rarity && special.level <= (forceUnique ? Math.max(level, 7) : level));
    if (candidates.length) { const special = specialItem(weightedChoice(candidates, entry => 1 + entry.level / Math.max(1, level) * 2, random).name); special.level = level; return special; }
    item.rarity = 'rare';
  }
  if (item.rarity !== 'common') return applyAffixes(item, random);
  if (item.rarity === 'common' && base.sockets && random() < .5) { const maximum = Math.min(base.sockets, level < 12 ? 2 : level < 26 ? 3 : level < 41 ? 4 : 6); item.sockets = 1 + Math.floor(random() * maximum); }
  item.identified = true;
  return item;
}
export function weightedChoice<T>(values: T[], weight: (value: T) => number, random = Math.random): T {
  if (!values.length) throw new Error('Empty item pool');
  const weights = values.map(value => Math.max(0, weight(value))), total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.max(0, Math.min(.999999999, random())) * total;
  for (let i = 0; i < values.length; i++) { roll -= weights[i]; if (roll < 0) return values[i]; }
  return values[values.length - 1];
}
