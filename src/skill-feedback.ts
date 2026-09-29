import { availableCharges, skillLevel, type HeroState } from './model.ts';
import { isAura, skillValues } from './paladin.ts';
import type { SkillSlot } from './controls.ts';
import type { Mods } from './items.ts';

/** Describe resource readiness without preventing queued inputs or aura toggles. */
export function skillResourceFeedback(hero: HeroState, slot: SkillSlot, mods: Mods, charges = availableCharges(hero)) {
  const id = hero.bindings[slot], binding = hero.chargeBindings?.[slot];
  const charge = binding && charges.find(group => group.id === binding.id && group.rank === binding.rank);
  const values = skillValues(id, binding?.rank ?? skillLevel(hero, id, mods), hero.skills);
  const cost = binding || isAura(id) ? 0 : values.cost;
  const reason = binding ? charge?.remaining ? '' : '聚气耗尽' : hero.mana < cost ? '法力不足' : '';
  const resource = binding ? `聚气 ${charge?.remaining ?? 0}/${charge?.maximum ?? 0} · 不消耗法力`
    : isAura(id) ? '切换灵气不消耗法力' : cost ? `消耗 ${Number(cost.toFixed(3))} 法力` : '不消耗法力';
  return { values, cost, reason, resource, badge: reason === '法力不足' ? '缺蓝' : reason ? '耗尽' : '' };
}
