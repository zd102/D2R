import { emptySkills, skillValues, type SkillId, type SkillValues } from './paladin.ts';

export const MERCENARY_AURAS = ['prayer', 'defiance', 'blessedAim', 'might', 'holyFreeze', 'thorns'] as const;
export type MercenaryAura = typeof MERCENARY_AURAS[number];
export type AuraEffect = SkillValues & { id: SkillId; rank: number };
export const mercenaryAuraRank = (level: number) => Math.min(20, 1 + Math.floor((Math.max(1, level) - 1) / 5));

// Native hireling auras use the same effect fields as Paladin and item auras,
// with curves suited to the mercenary's life and the project's combat cadence.
export function mercenaryAuraValues(id: MercenaryAura, level: number, allSkills = 0) {
  const rank = Math.min(30, mercenaryAuraRank(level) + Math.max(0, Math.floor(allSkills)));
  const values = skillValues(id, rank, emptySkills());
  values.cost = 0; values.radius = Math.min(20, 10 + rank * .4);
  switch (id) {
    case 'prayer': values.healing = Math.round((100 + 18 * level) * (.018 + rank * .0006)); break;
    case 'defiance': values.percent = 60 + 8 * rank; break;
    case 'blessedAim': values.attack = 50 + 10 * rank; break;
    case 'might': values.damage = 25 + 7 * rank; break;
    case 'holyFreeze':
      values.percent = Math.min(45, Math.round(18 + rank * .9));
      values.min = Math.round(1.5 + level * .3 + rank * .65); values.max = Math.ceil(values.min * 1.3);
      values.radius = Math.min(14, 5 + rank * .3); values.secondary = 2.5; break;
    case 'thorns': values.percent = 70 + 10 * rank; values.secondary = Math.round(level * .6 + rank * 2); break;
  }
  return { id, rank, ...values };
}

// Compare the actual benefit because native and item/player curves differ.
export function strongerAura(candidate: AuraEffect, current: AuraEffect) {
  const power = (aura: AuraEffect) => aura.id === 'prayer' ? aura.healing : aura.id === 'blessedAim' ? aura.attack
    : ['might', 'concentration'].includes(aura.id) ? aura.damage : ['holyFire', 'holyShock', 'sanctuary'].includes(aura.id) ? aura.min + aura.max : aura.percent;
  return power(candidate) > power(current) || power(candidate) === power(current)
    && (candidate.secondary > current.secondary || candidate.secondary === current.secondary && candidate.rank > current.rank);
}
