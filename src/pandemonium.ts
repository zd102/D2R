import { BOSSES, type MonsterDef } from './bestiary.ts';
import { BOSS_DROP_PROFILES, type BossDropProfile } from './boss-loot.ts';

// Preserve each original boss's model and combat repertoire; use dedicated reward pools.
export const PANDEMONIUM_BOSSES = [
  { name: '莉莉丝', source: 4, life: 1.25, damage: 1.15, reward: '戒指 / 项链' },
  { name: '超级都瑞尔', source: 9, life: 1.4, damage: 1.2, reward: '护甲 / 战靴' },
  { name: '超级衣卒尔', source: 16, life: 1.55, damage: 1.25, reward: '武器 / 护甲' },
  { name: '超级墨菲斯托', source: 14, life: 1.7, damage: 1.3, reward: '护甲 / 盾牌 / 头盔' },
  { name: '混沌迪亚波罗', source: 19, life: 1.85, damage: 1.35, reward: '武器 / 头盔 / 项链' },
  { name: '超级巴尔', source: 24, life: 2, damage: 1.4, reward: '武器 / 护甲 / 头盔 / 腰带' },
].map((entry, stage) => ({ ...entry,
  definition: { ...BOSSES[entry.source], name: entry.name,
    attacks: [...BOSSES[entry.source].attacks, ...(stage === 1 ? ['coldNova' as const] : stage === 2 ? ['summonMinions' as const] : [])],
  } satisfies MonsterDef,
  loot: { ...BOSS_DROP_PROFILES[entry.source], uniqueChance: .45 + stage * .05, runeChance: .12 + stage * .02, maxTC: [87, 87, 87], runeTC: [17, 17, 17] } satisfies BossDropProfile,
}));
