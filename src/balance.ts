import { xpForLevel, type DamageType } from './paladin.ts';
import { levelTuning, type Level } from './campaign.ts';
import type { MonsterDef } from './bestiary.ts';
import type { DropRank } from './items.ts';

// LoD's level-70+ XP factors, softened by square root for this shorter campaign.
const CLASSIC_HIGH_LEVEL_XP = [.9531,.9063,.8594,.8125,.7656,.7188,.6719,.625,.5781,.5313,.4844,.4375,.3906,.3438,.2969,.25,.1875,.1406,.1055,.0791,.0596,.0449,.0342,.0254,.0195,.0146,.0107,.0078,.0059];
export function experienceFactor(playerLevel: number, monsterLevel: number) {
  if (playerLevel >= 99 || playerLevel < 1 || monsterLevel < 1 || !Number.isFinite(playerLevel + monsterLevel)) return 0;
  const gap = Math.floor(playerLevel) - Math.floor(monsterLevel);
  let factor = 1;
  if (gap > 5) factor = [.81, .62, .43, .24, .05][Math.min(4, gap - 6)];
  else if (gap < 0 && playerLevel >= 25) factor = playerLevel / monsterLevel;
  else if (gap < -5) factor = [.88, .68, .36, .15, .1][Math.min(4, -gap - 6)];
  return factor * (playerLevel < 70 ? 1 : Math.sqrt(CLASSIC_HIGH_LEVEL_XP[Math.floor(playerLevel) - 70]));
}
export function monsterExperience(playerLevel: number, monsterLevel: number, rank: DropRank, context: { difficulty: number; act: number; baseLife?: number; firstClear?: boolean; summoned?: boolean }) {
  if (context.summoned) return 0;
  const factor = experienceFactor(playerLevel, monsterLevel); if (!factor) return 0;
  const rate = context.difficulty === 0 && context.act === 0 ? .065 : .03;
  const weight = rank === 'actBoss' ? 10 : rank === 'miniboss' ? 4 : Math.max(.7, Math.min(1.4, Math.sqrt((context.baseLife ?? 24) / 24)));
  const firstClear = rank !== 'monster' && context.firstClear ? 1.35 : 1;
  // Level-99 monsters still reward XP; level 99 has no "next level" threshold.
  const base = xpForLevel(Math.min(98, Math.max(1, Math.floor(monsterLevel))));
  return Math.max(1, Math.floor(base * rate * weight * firstClear * factor));
}
export function monsterStats(definition: MonsterDef, area: Level, difficulty: number, boss = false) {
  const tuning = levelTuning(area, difficulty), level = Math.min(99, tuning.level + (boss ? 2 : 0));
  const maxHp = boss && definition.hpByDifficulty ? definition.hpByDifficulty[difficulty] : Math.round(definition.hp * tuning.hp * (boss ? 1.25 : 1));
  const resistances: Record<DamageType, number> = { physical: difficulty === 2 ? 15 : 0, magic: boss ? difficulty * 10 : 0, fire: difficulty * 10, cold: difficulty * 10, lightning: difficulty * 10, poison: definition.race === 'undead' ? 65 : difficulty * 10 };
  for (const type of Object.keys(definition.resist ?? {}) as DamageType[]) resistances[type] = Math.min(85, definition.resist![type]! + difficulty * 10);
  return { level, maxHp, damage: definition.damage * tuning.damage, defense: Math.round(tuning.defense * (boss ? 1.1 : 1)), attackRating: Math.round((25 + level * 7) * (boss ? 1.1 : 1)), resistances };
}
