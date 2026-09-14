import { monsterTraits } from './monster-traits.ts';
import { playerLifeFactor, playerDamageFactor, playerExperienceFactor } from './player-count.ts';
import { xpForLevel, type DamageType } from './paladin.ts';
import { AREA_LEVELS, levelTuning, type Level } from './campaign.ts';
import type { MonsterDef } from './bestiary.ts';
import type { DropRank } from './items.ts';

// Multipliers layer over the continuous area curve and explicit boss health tables.
export const DIFFICULTY_POWER = [
  { life: 1, damage: 1, defense: 1, attack: 1 },
  { life: 1.3, damage: 1.15, defense: 1.1, attack: 1.12 },
  { life: 2, damage: 1.3, defense: 1.25, attack: 1.3 },
] as const;

// Field packs must outpace equipped melee leech. Ramp through Nightmare rather
// than spiking at its entrance. Hell inherits that pressure, then tapers the
// extra multiplier as its underlying area damage grows. Boss budgets are separate.
function fieldOffense(areaLevel: number, difficulty: number) {
  if (!difficulty) return { damage: 1, attack: 1 };
  const levels = AREA_LEVELS[difficulty];
  const progress = Math.max(0, Math.min(1, (areaLevel - levels[0]) / (levels[24] - levels[0])));
  return difficulty === 1
    ? { damage: Math.pow(3, progress), attack: Math.pow(1.5, progress) }
    : { damage: 3 * Math.pow(2 / 3, progress), attack: 1.5 };
}

// Unrounded accuracy budget, also used by boss summons whose damage already
// inherits the boss budget rather than the stronger field-pack curve.
export function baseMonsterAttackRating(definition: MonsterDef, level: number, difficulty: number, players = 1) {
  return monsterTraits(definition).accuracy * DIFFICULTY_POWER[difficulty].attack * playerDamageFactor(players, difficulty) * (25 + level * 7);
}

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
export function monsterExperience(playerLevel: number, monsterLevel: number, rank: DropRank, context: { difficulty: number; act: number; baseLife?: number; firstClear?: boolean; summoned?: boolean; players?: number }) {
  if (context.summoned) return 0;
  const factor = experienceFactor(playerLevel, monsterLevel); if (!factor) return 0;
  const rate = context.difficulty === 0 && context.act === 0 ? .055 : [.02, .018, .017][context.difficulty];
  const weight = rank === 'actBoss' ? 10 : rank === 'miniboss' ? 4 : rank === 'elite' ? 2 : rank === 'champion' ? 1.6 : Math.max(.7, Math.min(1.4, Math.sqrt((context.baseLife ?? 24) / 24)));
  const firstClear = (rank === 'actBoss' || rank === 'miniboss') && context.firstClear ? 1.35 : 1;
  // Level-99 monsters still reward XP; level 99 has no "next level" threshold.
  const base = xpForLevel(Math.min(98, Math.max(1, Math.floor(monsterLevel))));
  return Math.max(1, Math.floor(base * rate * weight * firstClear * factor * playerExperienceFactor(context.players)));
}
export function monsterStats(definition: MonsterDef, area: Level, difficulty: number, boss = false, elite = false, players = 1) {
  difficulty = Math.max(0, Math.min(2, Math.floor(difficulty)));
  const power = DIFFICULTY_POWER[difficulty], traits = monsterTraits(definition);
  elite = elite && !boss;
  const tuning = levelTuning(area, difficulty), level = Math.min(99, tuning.level + (boss || elite ? 2 : 0));
  const offense = boss ? { damage: 1, attack: 1 } : fieldOffense(tuning.level, difficulty);
  const uberDiablo = area.special === 'uberDiablo' && boss && definition.id === 'diablo';
  const maxHp = uberDiablo ? 900000 : boss && definition.hpByDifficulty ? definition.hpByDifficulty[difficulty] : Math.round(definition.hp * tuning.hp * (boss ? 1.25 : elite ? 2.5 + difficulty * .5 : 1));
  const resistances: Record<DamageType, number> = { physical: difficulty === 2 ? 15 : 0, magic: boss ? difficulty * 10 : 0, fire: difficulty * 10, cold: difficulty * 10, lightning: difficulty * 10, poison: definition.race === 'undead' ? 65 : difficulty * 10 };
  for (const type of Object.keys(definition.resist ?? {}) as DamageType[]) resistances[type] = Math.min(85, definition.resist![type]! + difficulty * 10);
  for (const type of Object.keys(traits.resistance ?? {}) as DamageType[]) resistances[type] = Math.min(85, traits.resistance![type]![difficulty]);
  if (uberDiablo) for (const type of ['fire', 'cold', 'lightning', 'poison'] as DamageType[]) resistances[type] = Math.max(resistances[type], 75);
  const damageFactor = playerDamageFactor(players, difficulty);
  return { level, maxHp: Math.floor(Math.floor(maxHp * power.life) * playerLifeFactor(players)), damage: traits.damage * power.damage * damageFactor * definition.damage * tuning.damage * offense.damage * (uberDiablo ? 1.7 : elite ? 1.25 + difficulty * .1 : 1), defense: Math.round(traits.defense * power.defense * tuning.defense * (uberDiablo ? 1.35 : boss ? 1.1 : elite ? 1.25 : 1)), attackRating: Math.round(baseMonsterAttackRating(definition, level, difficulty, players) * offense.attack * (uberDiablo ? 1.5 : boss ? 1.1 : elite ? 1.2 : 1)), resistances };
}
