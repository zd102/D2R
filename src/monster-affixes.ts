import type { DamageType } from './paladin.ts';

export type MonsterAffixId = 'vital' | 'armored' | 'swift' | 'mighty' | 'fireWard' | 'coldWard' | 'lightningWard' | 'poisonWard';
export type MonsterAffix = { id: MonsterAffixId; name: string; group: 'durability' | 'offense' | 'ward'; hp?: number; defense?: number; speed?: number; damage?: number; resistance?: [DamageType, number] };
export type MonsterAffixStats = { maxHp: number; damage: number; defense: number; speed: number; resistances: Record<DamageType, number> };

// Each effect is deliberately narrow. A roll may contain one durable, one offensive,
// and one single-element ward, so higher difficulties add variety without stacking extremes.
export const MONSTER_AFFIXES: readonly MonsterAffix[] = [
  { id: 'vital', name: '活力', group: 'durability', hp: 1.18 },
  { id: 'armored', name: '坚甲', group: 'durability', defense: 1.18 },
  { id: 'swift', name: '疾行', group: 'offense', speed: 1.12 },
  { id: 'mighty', name: '强击', group: 'offense', damage: 1.12 },
  { id: 'fireWard', name: '火焰护体', group: 'ward', resistance: ['fire', 25] },
  { id: 'coldWard', name: '冰霜护体', group: 'ward', resistance: ['cold', 25] },
  { id: 'lightningWard', name: '闪电护体', group: 'ward', resistance: ['lightning', 25] },
  { id: 'poisonWard', name: '毒素护体', group: 'ward', resistance: ['poison', 25] },
];

export const monsterAffixCount = (difficulty: number) => 1 + Math.max(0, Math.min(2, Math.floor(difficulty)));

export function rollMonsterAffixes(difficulty: number, random = Math.random, canMove = true) {
  const available = MONSTER_AFFIXES.filter(affix => canMove || affix.id !== 'swift');
  const chosen: MonsterAffix[] = [], groups = new Set<MonsterAffix['group']>();
  while (chosen.length < monsterAffixCount(difficulty)) {
    const candidates = available.filter(affix => !groups.has(affix.group));
    if (!candidates.length) break;
    const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
    const affix = candidates[index]; chosen.push(affix); groups.add(affix.group);
  }
  return chosen;
}

export function applyMonsterAffixes<T extends MonsterAffixStats>(stats: T, affixes: readonly MonsterAffix[]): T {
  const result: T = { ...stats, resistances: { ...stats.resistances } };
  for (const affix of affixes) {
    if (affix.hp) result.maxHp = Math.round(result.maxHp * affix.hp);
    if (affix.defense) result.defense = Math.round(result.defense * affix.defense);
    if (affix.speed) result.speed *= affix.speed;
    if (affix.damage) result.damage *= affix.damage;
    if (affix.resistance) { const [type, amount] = affix.resistance; result.resistances[type] = Math.min(80, result.resistances[type] + amount); }
  }
  return result;
}
