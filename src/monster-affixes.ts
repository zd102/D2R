import type { DamageType } from './paladin.ts';
import type { MonsterDef } from './bestiary.ts';

export const MONSTER_RESIST_CAP = 85;
export type MonsterAffixId = 'extraStrong' | 'extraFast' | 'cursed' | 'auraEnchanted' | 'fireEnchanted' | 'coldEnchanted' | 'lightningEnchanted' | 'magicResistant' | 'manaBurn' | 'multishot' | 'spectralHit' | 'stoneSkin' | 'teleportation';
export type MonsterAura = 'might' | 'blessedAim' | 'fanaticism' | 'holyFire' | 'holyFreeze' | 'holyShock' | 'conviction';
export const MONSTER_AURAS: Record<MonsterAura, string> = { might: '力量', blessedAim: '祝福瞄准', fanaticism: '狂热', holyFire: '神圣火焰', holyFreeze: '神圣冰冻', holyShock: '神圣冲击', conviction: '审判' };
export type MonsterAffix = { id: MonsterAffixId; name: string; description: string; aura?: MonsterAura };
export type MonsterAffixStats = { maxHp: number; damage: number; defense: number; speed: number; attackRating?: number; resistances: Record<DamageType, number> };
export const MONSTER_AFFIXES: readonly MonsterAffix[] = [
  { id: 'extraStrong', name: '特别强壮', description: '物理伤害 +35%，准确率 +30%' },
  { id: 'extraFast', name: '特别快速', description: '移动速度 +35%' },
  { id: 'cursed', name: '诅咒', description: '攻击命中有 75% 概率施加伤害加深，持续 5 秒' },
  { id: 'auraEnchanted', name: '灵气强化', description: '携带一种灵气，影响附近战斗' },
  { id: 'fireEnchanted', name: '火焰强化', description: '附加火伤、火抗 +75；死亡后爆炸' },
  { id: 'coldEnchanted', name: '冰冷强化', description: '附加冰伤、冰抗 +75；死亡后释放冰霜新星' },
  { id: 'lightningEnchanted', name: '闪电强化', description: '附加电伤、电抗 +75；受击释放充能弹' },
  { id: 'magicResistant', name: '魔法抵抗', description: '火、冰、电抗性各 +40' },
  { id: 'manaBurn', name: '法力燃烧', description: '命中削减法力，魔法抗性 +20' },
  { id: 'multishot', name: '多重射击', description: '直射和扇形弹幕的投射物数量增至三倍' },
  { id: 'spectralHit', name: '幽灵一击', description: '附加随机属性伤害，火、冰、电抗性各 +20' },
  { id: 'stoneSkin', name: '皮肤硬化', description: '基础防御翻倍，物理抗性 +50' },
  { id: 'teleportation', name: '传送', description: '低血量传送并恢复少量生命；受冷却和禁疗限制' },
];
export type ChampionId = 'champion' | 'berserker' | 'fanatic' | 'ghostly' | 'possessed';
export type ChampionVariant = { id: ChampionId; name: string; hp: number; damage: number; attackRating: number; speed: number; defense: number; description: string };
export const CHAMPION_VARIANTS: readonly ChampionVariant[] = [
  { id: 'champion', name: '冠军', hp: 1.8, damage: 1.2, attackRating: 1.2, speed: 1.15, defense: 1, description: '生命与攻击强化' },
  { id: 'berserker', name: '狂战士', hp: .9, damage: 2, attackRating: 1.6, speed: 1, defense: 1, description: '高伤害、高命中，生命较低' },
  { id: 'fanatic', name: '狂热者', hp: 1.8, damage: 1.2, attackRating: 1.2, speed: 1.5, defense: .3, description: '快速移动，防御降低 70%' },
  { id: 'ghostly', name: '幽灵', hp: 1.8, damage: 1.2, attackRating: 1.2, speed: .8, defense: 1, description: '物理抗性 80%，攻击附加冰伤' },
  { id: 'possessed', name: '着魔者', hp: 3.6, damage: 1.2, attackRating: 1.2, speed: 1.15, defense: 1, description: '双倍冠军生命，不受诅咒影响' },
];
const index = (length: number, random: () => number) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
export const rollChampionVariant = (random = Math.random) => CHAMPION_VARIANTS[index(CHAMPION_VARIANTS.length, random)];
export const monsterAffixCount = (difficulty: number) => 1 + Math.max(0, Math.min(2, Math.floor(difficulty)));
const PROJECTILE_ATTACKS = new Set(['arrow', 'fireArrow', 'fireball', 'poisonSpit', 'lightning', 'poisonFan', 'skull', 'firestorm', 'coldWave', 'chargedBolt', 'mephistoOrb']);
export const canMultishot = (definition?: MonsterDef) => !definition || definition.attacks.some(id => PROJECTILE_ATTACKS.has(id) && !(definition.id === 'soul' && id === 'lightning'));
export function monsterAffix(id: MonsterAffixId, random = Math.random, aura?: MonsterAura): MonsterAffix {
  const value = { ...MONSTER_AFFIXES.find(a => a.id === id)! };
  if (id === 'auraEnchanted') { const keys = Object.keys(MONSTER_AURAS) as MonsterAura[]; value.aura = aura ?? keys[index(keys.length, random)]; value.name += '（' + MONSTER_AURAS[value.aura] + '）'; }
  return value;
}
export function rollMonsterAffixes(difficulty: number, random = Math.random, canMove = true, definition?: MonsterDef, fixed: readonly MonsterAffixId[] = [], fixedAura?: MonsterAura) {
  const chosen = [...new Set(fixed)].map(id => monsterAffix(id, random, fixedAura));
  const count = fixed.length ? chosen.length + monsterAffixCount(difficulty) - 1 : monsterAffixCount(difficulty);
  while (chosen.length < count) {
    const candidates = MONSTER_AFFIXES.filter(a => !chosen.some(c => c.id === a.id) && (canMove || !['extraFast', 'teleportation'].includes(a.id)) && (a.id !== 'multishot' || canMultishot(definition)) && (difficulty > 0 || a.id !== 'magicResistant'));
    if (!candidates.length) break;
    chosen.push(monsterAffix(candidates[index(candidates.length, random)].id, random));
  }
  return chosen;
}
// D2 fixed identities where available; project-only encounters have themed assignments.
export const SUPER_UNIQUE_AFFIXES: Record<string, readonly MonsterAffixId[]> = {
  corpsefire: ['spectralHit'], bloodRaven: ['extraFast', 'fireEnchanted'], griswold: ['cursed'], countess: ['fireEnchanted'],
  radament: ['extraFast'], bloodwitch: ['extraStrong', 'cursed'], coldworm: ['coldEnchanted', 'magicResistant'], summoner: ['extraStrong', 'magicResistant'],
  szzark: ['extraStrong', 'cursed'], endugu: ['magicResistant', 'fireEnchanted'], sarina: ['extraFast', 'spectralHit'], ismail: ['extraFast', 'cursed'],
  abyssVanguard: ['extraStrong', 'fireEnchanted'], izual: ['coldEnchanted', 'stoneSkin'], hephasto: ['auraEnchanted', 'spectralHit', 'magicResistant'], deSeis: ['extraStrong', 'auraEnchanted'],
  pindleskin: ['fireEnchanted'], nihlathak: ['coldEnchanted'],
  shenk: ['extraStrong'], eldritch: ['extraFast'], frozenstein: ['coldEnchanted', 'manaBurn'], talic: ['fireEnchanted'], hellCow: ['lightningEnchanted'],
};
export const SUPER_UNIQUE_AURAS: Partial<Record<string, MonsterAura>> = { hephasto: 'conviction', deSeis: 'fanaticism' };
export function capMonsterResistances(resistances: Record<DamageType, number>) {
  return Object.fromEntries(Object.entries(resistances).map(([type, value]) => [type, Math.min(MONSTER_RESIST_CAP, value)])) as Record<DamageType, number>;
}
export function applyMonsterAffixes<T extends MonsterAffixStats>(stats: T, affixes: readonly MonsterAffix[], champion?: ChampionVariant): T {
  const result = { ...stats, resistances: { ...stats.resistances } };
  const add = (type: DamageType, amount: number) => { result.resistances[type] += amount; };
  for (const { id } of affixes) {
    if (id === 'extraStrong' && result.attackRating !== undefined) result.attackRating = Math.round(result.attackRating * 1.3);
    if (id === 'extraFast') result.speed *= 1.35;
    if (id === 'stoneSkin') { result.defense *= 2; add('physical', 50); }
    if (id === 'manaBurn') add('magic', 20);
    if (id === 'magicResistant' || id === 'spectralHit') for (const type of ['fire', 'cold', 'lightning'] as const) add(type, id === 'magicResistant' ? 40 : 20);
    if (id === 'fireEnchanted') add('fire', 75);
    if (id === 'coldEnchanted') add('cold', 75);
    if (id === 'lightningEnchanted') add('lightning', 75);
  }
  if (champion) {
    result.maxHp = Math.round(result.maxHp * champion.hp); result.damage *= champion.damage; result.speed *= champion.speed; result.defense = Math.round(result.defense * champion.defense);
    if (result.attackRating !== undefined) result.attackRating = Math.round(result.attackRating * champion.attackRating);
    if (champion.id === 'ghostly') result.resistances.physical = 80;
  }
  result.resistances = capMonsterResistances(result.resistances);
  return result;
}
export const hasMonsterAffix = (enemy: { affixes?: readonly MonsterAffix[] }, id: MonsterAffixId) => !!enemy.affixes?.some(a => a.id === id);
export type DamagePart = { type: DamageType; amount: number };
export function monsterDamageParts(enemy: { affixes?: readonly MonsterAffix[]; champion?: ChampionVariant }, amount: number, type: DamageType, random = Math.random): DamagePart[] {
  const parts: DamagePart[] = [{ type, amount: amount * (type === 'physical' && hasMonsterAffix(enemy, 'extraStrong') ? 1.35 : 1) }];
  for (const [id, element] of [['fireEnchanted', 'fire'], ['coldEnchanted', 'cold'], ['lightningEnchanted', 'lightning']] as const) if (hasMonsterAffix(enemy, id)) parts.push({ type: element, amount: amount * .3 });
  if (enemy.champion?.id === 'ghostly') parts.push({ type: 'cold', amount: amount * .3 });
  if (hasMonsterAffix(enemy, 'spectralHit')) { const types: DamageType[] = ['fire', 'cold', 'lightning', 'poison', 'magic']; parts.push({ type: types[index(types.length, random)], amount: amount * .3 }); }
  return parts;
}
