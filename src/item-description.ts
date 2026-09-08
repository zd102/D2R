import { MOD_NAMES, itemMods, type Item, type Modifier, type Mods } from './items.ts';
import { affixRanges, poisonDamage } from './affixes.ts';

const numeric = (value: number) => String(Math.round(value * 1000) / 1000);
const interval = (min: number, max: number) => min === max ? numeric(min) : `${numeric(min)} - ${numeric(max)}`;
export function itemModifierLines(item: Item) {
  const mods = itemMods(item), ranges = affixRanges(item), lines: { text: string; range?: string }[] = [];
  const hidden = new Set<Modifier>(['poisonMinRate', 'poisonMaxRate', 'poisonFrames']);
  const range = (key: Modifier) => {
    const bounds = ranges[key]; if (!bounds || bounds[0] === bounds[1]) return '';
    const socketBonus = (mods[key] ?? 0) - (item.mods?.[key] ?? 0);
    return interval(bounds[0] + socketBonus, bounds[1] + socketBonus);
  };
  for (const type of ['fire', 'cold', 'lightning'] as const) {
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
    const binary = ['cannotBeFrozen', 'halfFreeze', 'indestructible', 'ignoreDefense', 'knockback', 'preventHeal'].includes(key);
    lines.push({ text: binary ? MOD_NAMES[key] : `+${numeric(value)} ${MOD_NAMES[key]}`, range: range(key) || undefined });
  }
  return lines;
}
export function itemWeaponDamage(item: Item, level: number, mods: Mods) {
  const min = Math.floor((item.minDamage ?? item.power * .65) * (1 + (mods.damage ?? 0) / 100)) + (mods.minDamage ?? 0) + (mods.damageFlat ?? 0);
  const max = Math.floor((item.maxDamage ?? item.power) * (1 + (mods.damage ?? 0) / 100)) + (mods.maxDamage ?? 0) + (mods.damageFlat ?? 0) + Math.floor((mods.maxDamagePerLevel ?? 0) * level);
  return `${min} - ${Math.max(min + 1, max)}`;
}
