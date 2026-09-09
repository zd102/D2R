import { MOD_NAMES, itemMods, rangedBase, type Item, type Modifier, type Mods } from './items.ts';
import { affixRanges, poisonDamage } from './affixes.ts';
import { unappliedItemEffects, itemTriggers, catalogModifierRanges, otherClassItemEffects } from './item-catalog.ts';
import { CURSE_NAMES } from './item-effects.ts';

const numeric = (value: number) => String(Math.round(value * 1000) / 1000);
const interval = (min: number, max: number) => min === max ? numeric(min) : `${numeric(min)} - ${numeric(max)}`;
export function itemModifierLines(item: Item) {
  const mods = itemMods(item), ranges = { ...catalogModifierRanges(item), ...affixRanges(item) }, lines: { text: string; range?: string }[] = [];
  const hidden = new Set<Modifier>(['poisonMinRate', 'poisonMaxRate', 'poisonFrames']);
  const range = (key: Modifier) => {
    const bounds = ranges[key]; if (!bounds || bounds[0] === bounds[1]) return '';
    const socketBonus = (mods[key] ?? 0) - (item.mods?.[key] ?? 0);
    return interval(bounds[0] + socketBonus, bounds[1] + socketBonus);
  };
  for (const type of ['fire', 'cold', 'lightning', 'magic'] as const) {
    const min: Modifier = `${type}MinDamage`, max: Modifier = `${type}MaxDamage`;
    hidden.add(min); hidden.add(max);
    if (!mods[min] && !mods[max]) continue;
    const lowRange = range(min), highRange = range(max);
    lines.push({ text: `增加 ${interval(mods[min] ?? 0, mods[max] ?? 0)} ${MOD_NAMES[`${type}Damage`]}`, range: [lowRange && `最小 ${lowRange}`, highRange && `最大 ${highRange}`].filter(Boolean).join(' / ') || undefined });
  }
  const poison = poisonDamage(mods);
  if (poison.seconds > 0) lines.push({ text: `增加 ${interval(Math.floor(poison.min), Math.floor(poison.max))} 毒素伤害，持续 ${numeric(poison.seconds)} 秒` });
  for (const [key, value] of Object.entries(mods) as [Modifier, number][]) {
    if (!value || hidden.has(key)) continue;
    const binary = ['cannotBeFrozen', 'halfFreeze', 'indestructible', 'ignoreDefense', 'knockback', 'preventHeal', 'restInPeace'].includes(key);
    lines.push({ text: binary ? MOD_NAMES[key] : `${value > 0 ? '+' : ''}${numeric(value)} ${MOD_NAMES[key]}`, range: range(key) || undefined });
  }
  for (const trigger of itemTriggers(item)) lines.push({ text: `${trigger.chance}% ${trigger.event === 'hit-skill' ? '击中' : trigger.event === 'gethit-skill' ? '受击' : '攻击'}触发等级 ${trigger.level} ${CURSE_NAMES[trigger.kind]}` });
  for (const effect of otherClassItemEffects(item)) lines.push({ text: effect });
  for (const effect of unappliedItemEffects(item)) lines.push({ text: `未生效：${effect}` });
  return lines;
}
export function itemWeaponDamage(item: Item, level: number, mods: Mods) {
  const ranged = rangedBase(item);
  if (ranged?.stack) item = { ...item, minDamage: ranged.min, maxDamage: ranged.max };
  const min = Math.floor((item.minDamage ?? item.power * .65) * (1 + (mods.damage ?? 0) / 100)) + (mods.minDamage ?? 0) + (mods.damageFlat ?? 0);
  const max = Math.floor((item.maxDamage ?? item.power) * (1 + ((mods.damage ?? 0) + Math.floor((mods.damagePercentPerLevel ?? 0) * level)) / 100)) + (mods.maxDamage ?? 0) + (mods.damageFlat ?? 0) + Math.floor((mods.maxDamagePerLevel ?? 0) * level);
  return `${min} - ${Math.max(min + 1, max)}`;
}
