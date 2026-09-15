import type { HeroState } from './model.ts';
import type { ClassId } from './classes.ts';

export type Potion = { name: string; english: string; code: string; price: number; icon: string; color: number; description: string; kind: 'health' | 'mana' | 'utility' | 'rejuvenation'; tier: number };
const prefixes = ['微型', '小型', '', '大型', '超级'];
const health = [30, 60, 100, 180, 320], mana = [40, 80, 160, 300, 500];
function recovery(kind: 'health' | 'mana', tier: number): Potion {
  return { name: `${prefixes[tier - 1]}${kind === 'health' ? '生命' : '法力'}药水`, english: `${['Minor ', 'Light ', '', 'Greater ', 'Super '][tier - 1]}${kind === 'health' ? 'Healing' : 'Mana'} Potion`,
    code: `${kind === 'health' ? 'hp' : 'mp'}${tier}`, tier, kind,
    price: (kind === 'health' ? [25, 50, 90, 160, 280] : [25, 50, 100, 180, 320])[tier - 1],
    icon: kind === 'health' ? 'heart-pulse' : 'droplets', color: kind === 'health' ? 0xe45555 : 0x56a7eb,
    description: `${kind === 'health' ? '6 秒内恢复生命' : '3 秒内恢复法力'}，恢复量随职业变化；连续饮用延长恢复` };
}
// Indices 0-4 stay stable for existing saves and utility consumers.
export const POTIONS: readonly Potion[] = [
  recovery('health', 1), recovery('mana', 1),
  { name: '精力药水', english: 'Stamina Potion', code: 'vps', price: 25, icon: 'footprints', color: 0xeeeeee, kind: 'utility', tier: 0, description: '立即恢复全部耐力，30 秒内耐力不消耗；连续饮用延长时间' },
  { name: '解毒药水', english: 'Antidote Potion', code: 'yps', price: 40, icon: 'leaf', color: 0xa4d765, kind: 'utility', tier: 0, description: '立即解毒，30 秒内毒素抗性 +50%、最大毒素抗性 +10%；连续饮用只延长时间' },
  { name: '溶解药水', english: 'Thawing Potion', code: 'wms', price: 25, icon: 'sun', color: 0xf3c65f, kind: 'utility', tier: 0, description: '立即解除冰冷减速，30 秒内冰冷抗性 +50%、最大冰冷抗性 +10%；连续饮用只延长时间' },
  ...[2, 3, 4, 5].flatMap(tier => [recovery('health', tier), recovery('mana', tier)]),
  { name: '恢复活力药剂', english: 'Rejuvenation Potion', code: 'rvs', price: 0, icon: 'sparkles', color: 0xb675e8, kind: 'rejuvenation', tier: 1, description: '立即恢复 35% 最大生命和法力；仅低概率掉落' },
  { name: '全面恢复活力药剂', english: 'Full Rejuvenation Potion', code: 'rvl', price: 0, icon: 'sparkles', color: 0xd9a0ff, kind: 'rejuvenation', tier: 2, description: '立即恢复全部生命和法力；仅低概率掉落' },
];
export const POTION_LIMIT = Number.MAX_SAFE_INTEGER;
export const DEFAULT_POTION_BINDINGS = [0, 1, 13, 14];
export const emptyPotions = () => POTIONS.map(() => 0);
export function potionIndex(code: string): number | undefined {
  const index = POTIONS.findIndex(potion => potion.code === code); return index < 0 ? undefined : index;
}
export function potionAmount(index: number, classId: ClassId) {
  const potion = POTIONS[index];
  return potion?.kind === 'health' ? health[potion.tier - 1] * (classId === 'sorceress' ? 1 : 1.5)
    : potion?.kind === 'mana' ? mana[potion.tier - 1] * (classId === 'sorceress' ? 1 : .75) : 0;
}
export function potionDescription(index: number, classId: ClassId) {
  const potion = POTIONS[index], amount = potionAmount(index, classId);
  return amount ? `${potion.kind === 'health' ? 6 : 3} 秒内恢复 ${amount} 点${potion.kind === 'health' ? '生命' : '法力'}；连续饮用延长恢复` : potion.description;
}
export function potionTier(act = 0, difficulty = 0) { return difficulty >= 2 ? 5 : difficulty === 1 ? (act < 2 ? 4 : 5) : Math.min(5, Math.max(1, act + 1)); }
export function rollPotion(random = Math.random, act = 0, difficulty = 0): number {
  const roll = random();
  if (roll < .005) return 14;
  if (roll < .025) return 13;
  if (roll >= .8) return roll < .87 ? 2 : roll < .94 ? 3 : 4;
  const tier = Math.max(1, potionTier(act, difficulty) - (random() < .2 ? 1 : 0));
  return potionIndex(`${roll < .335 ? 'mp' : 'hp'}${tier}`)!;
}
export type PotionRecovery = { index: number; remaining: number };
export function useRecoveryPotion(hero: HeroState, index: number, maxHp: number, maxMana: number): string | null {
  const potion = POTIONS[index];
  if (!potion || potion.kind === 'utility') return '无效药水';
  if (!(hero.potions[index] > 0)) return '药剂已用尽';
  const healing = potion.kind === 'health';
  if (potion.kind === 'rejuvenation') {
    if (hero.hp >= maxHp && hero.mana >= maxMana) return '生命和法力已满';
    const fraction = potion.tier === 1 ? .35 : 1;
    hero.hp = Math.min(maxHp, hero.hp + maxHp * fraction); hero.mana = Math.min(maxMana, hero.mana + maxMana * fraction);
    hero.potionRecovery = hero.potionRecovery.filter(effect => POTIONS[effect.index].kind === 'health' ? hero.hp < maxHp : hero.mana < maxMana);
  } else {
    if (healing ? hero.hp >= maxHp : hero.mana >= maxMana) return healing ? '生命值已满' : '法力值已满';
    // Bound the queue; never silently spend an entire stack through repeated input.
    if (hero.potionRecovery.filter(effect => POTIONS[effect.index].kind === potion.kind).length >= 2) return '该类药水已有两瓶待恢复';
    hero.potionRecovery.push({ index, remaining: potionAmount(index, hero.classId) });
  }
  hero.potions[index]--; return null;
}
export function tickRecoveryPotions(hero: HeroState, dt: number, maxHp: number, maxMana: number) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (const kind of ['health', 'mana'] as const) {
    const key = kind === 'health' ? 'hp' : 'mana', max = kind === 'health' ? maxHp : maxMana;
    let time = dt;
    const queue = hero.potionRecovery.filter(effect => POTIONS[effect.index].kind === kind).sort((a, b) => POTIONS[b.index].tier - POTIONS[a.index].tier);
    for (const effect of queue) {
      const rate = potionAmount(effect.index, hero.classId) / (kind === 'health' ? 6 : 3);
      const restored = Math.min(effect.remaining, rate * time);
      effect.remaining -= restored; time -= restored / rate; hero[key] = Math.min(max, hero[key] + restored);
      if (hero[key] >= max) { queue.forEach(entry => { entry.remaining = 0; }); break; }
      if (time <= 0) break;
    }
  }
  hero.potionRecovery = hero.potionRecovery.filter(effect => effect.remaining > 0);
}
export function useUtilityPotion(hero: HeroState, index: number, maxStamina: number): boolean {
  if (!Number.isInteger(index) || index < 2 || index > 4 || !(hero.potions[index] > 0)) return false;
  hero.potions[index]--;
  hero.potionTimers[index - 2] += 30;
  if (index === 2) hero.stamina = maxStamina;
  if (index === 3) hero.poison = 0;
  if (index === 4) hero.cold = 0;
  return true;
}
export function tickPotionTimers(hero: HeroState, dt: number) {
  hero.potionTimers = hero.potionTimers.map(time => Math.max(0, time - dt));
}
