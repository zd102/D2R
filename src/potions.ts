import type { HeroState } from './model.ts';

export const POTIONS = [
  { name: '生命药剂', english: 'Healing Potion', code: 'hp1', price: 25, icon: 'heart-pulse', color: 0xe45555, description: '持续恢复 160 点生命' },
  { name: '法力药剂', english: 'Mana Potion', code: 'mp1', price: 25, icon: 'droplets', color: 0x56a7eb, description: '持续恢复 80 点法力' },
  { name: '精力药水', english: 'Stamina Potion', code: 'vps', price: 25, icon: 'footprints', color: 0xeeeeee, description: '立即恢复全部耐力，30 秒内耐力不消耗；连续饮用延长时间' },
  { name: '解毒药水', english: 'Antidote Potion', code: 'yps', price: 40, icon: 'leaf', color: 0xa4d765, description: '立即解毒，30 秒内毒素抗性 +50%、最大毒素抗性 +10%；连续饮用只延长时间' },
  { name: '溶解药水', english: 'Thawing Potion', code: 'wms', price: 25, icon: 'sun', color: 0xf3c65f, description: '立即解除冰冷减速，30 秒内冰冷抗性 +50%、最大冰冷抗性 +10%；连续饮用只延长时间' },
] as const;
export function potionIndex(code: string): number | undefined {
  if (/^[hm]p[1-5]$/.test(code)) return code[0] === 'h' ? 0 : 1;
  const index = POTIONS.findIndex(potion => potion.code === code);
  return index < 0 ? undefined : index;
}
// Retain the existing life/mana preference while allowing all three utility potions.
export function rollPotion(random = Math.random): number {
  const roll = random();
  return roll < .32 ? 1 : roll < .8 ? 0 : roll < .87 ? 2 : roll < .94 ? 3 : 4;
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
