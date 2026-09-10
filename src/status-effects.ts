import { stats, type HeroState } from './model.ts';
import { skillName, skillIcon, type SkillId } from './paladin.ts';

export type HeroStatus = { id: string; name: string; icon: string; kind: 'buff' | 'debuff'; remaining: number | null; description: string };
export function heroStatuses(hero: HeroState, current = stats(hero)): HeroStatus[] {
  const effects: HeroStatus[] = [];
  const debuff = (id: string, name: string, icon: string, remaining: number, description: string) => {
    if (remaining > 0) effects.push({ id, name, icon, remaining, description, kind: 'debuff' });
  };
  debuff('poison', '中毒', 'skull', hero.poison, '持续受到毒素伤害');
  debuff('curse', '伤害加深', 'flame', hero.curse, '受到的物理伤害提高');
  debuff('cold', '冰冷减速', 'snowflake', hero.cold, '移动与攻击速度降低');
  if (hero.holyShield > 0 && current.hasShield) effects.push({ id: 'holyShield', name: '神圣之盾', icon: 'shield-check', remaining: hero.holyShield, description: '提高防御、格挡与盾击能力', kind: 'buff' });
  for (const [id, buff] of Object.entries(hero.buffs)) if (buff && buff.remaining > 0 && buff.rank > 0) {
    effects.push({ id, name: skillName(id as SkillId), icon: skillIcon(id as SkillId), remaining: buff.remaining, description: `技能等级 ${buff.rank}`, kind: 'buff' });
  }
  for (const aura of current.auras) effects.push({ id: `aura-${aura.id}`, name: skillName(aura.id), icon: skillIcon(aura.id), remaining: null, description: `${hero.activeAura === aura.id ? '已开启的灵气' : '装备提供的灵气'} · 等级 ${aura.rank}`, kind: 'buff' });
  return effects;
}
export function statusTime(seconds: number | null) {
  if (seconds === null) return '常驻';
  if (seconds >= 60) { const rounded = Math.ceil(seconds); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`; }
  return seconds > 3 ? `${Math.ceil(seconds)}秒` : `${Math.max(0, seconds).toFixed(1)}秒`;
}
