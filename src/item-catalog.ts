import { CATALOG_BASES, CATALOG_SPECIALS, CATALOG_RUNEWORDS, CATALOG_SETS, type CatalogProperty } from './item-catalog-data.ts';
import { AFFIX_TYPES, AFFIX_BASES } from './affix-data.ts';
import { BASE_CODES, rollAffix, supportsAffixProperty } from './affixes.ts';
import type { ItemBase, Item, Mods, Modifier, RuneWord, RuneId, SpecialItem, WeaponType } from './items.ts';
import { EFFECT_PROPERTIES, LEVEL_PROPERTIES, catalogSkill, itemTrigger } from './item-effects.ts';
import { isAura } from './paladin.ts';

export const CLASS_NAMES: Record<string, string> = { ama: '亚马逊', sor: '法师', nec: '死灵法师', pal: '圣骑士', bar: '野蛮人', dru: '德鲁伊', ass: '刺客' };
const classes: Record<string, string> = { abow: 'ama', aspe: 'ama', ajav: 'ama', orb: 'sor', head: 'nec', ashd: 'pal', phlm: 'bar', pelt: 'dru', h2h: 'ass', h2h2: 'ass' };
const weaponTypes: Record<string, WeaponType> = { swor: 'sword', axe: 'axe', mace: 'mace', club: 'mace', hamm: 'hammer', scep: 'scepter', pole: 'polearm', spea: 'spear', aspe: 'spear', bow: 'bow', abow: 'bow', xbow: 'crossbow', knif: 'dagger', wand: 'wand', staf: 'staff', orb: 'orb', h2h: 'claw', h2h2: 'claw', tkni: 'throwing', taxe: 'throwing', jave: 'javelin', ajav: 'javelin' };
export function hasItemType(type: string, expected: string): boolean {
  return type === expected || (AFFIX_TYPES[type]?.parents ?? []).some(parent => hasItemType(parent, expected));
}
export function expandBases(legacy: ItemBase[]): ItemBase[] {
  const existing = new Map(legacy.map(base => [BASE_CODES[base.name], base]));
  const names = new Set(legacy.map(base => base.name));
  const imported = CATALOG_BASES.map(base => {
    const old = existing.get(base.code), shield = ['shie', 'ashd', 'head'].includes(base.type);
    let name = old?.name ?? base.name;
    if (!old && names.has(name)) name += `（${AFFIX_BASES[base.code]?.name ?? base.code}）`;
    names.add(name);
    return {
      name, baseCode: base.code, itemType: base.type, requiredClass: classes[base.type],
      slot: base.weapon ? 'weapon' : shield ? 'shield' : ({ tors: 'armor', helm: 'helm', circ: 'helm', phlm: 'helm', pelt: 'helm', glov: 'gloves', boot: 'boots', belt: 'belt', ring: 'ring' } as const)[base.type as 'tors'] ?? 'amulet',
      level: base.level, qualityLevel: base.level, requiredLevel: Math.max(1, base.requiredLevel), power: base.weapon ? base.max : base.defense,
      strength: base.strength, dexterity: base.dexterity, min: base.min, max: base.max,
      ...(shield ? { block: base.block + 30, smiteMin: base.min, smiteMax: base.max } : {}),
      speed: base.speed, twoHanded: base.twoHanded, sockets: base.sockets, durability: base.durability,
      width: base.width, height: base.height, weaponType: weaponTypes[base.type],
      ...(base.type.startsWith('scha') || ['mcha', 'lcha'].includes(base.type) ? { charm: true, charmSize: base.code === 'cm1' ? 'small' : base.code === 'cm2' ? 'large' : 'grand' } as const : {}),
      ...(base.code === 'jew' ? { jewel: true } : {}),
      ...(old ? { name: old.name, width: old.width ?? (['ring', 'amulet'].includes(old.slot) ? 1 : 2), height: old.height ?? (['weapon', 'armor', 'shield'].includes(old.slot) ? 3 : ['ring', 'amulet', 'belt'].includes(old.slot) ? 1 : 2) } : {}),
    } as ItemBase;
  });
  // Keep saved display aliases and the starter ordering stable.
  return [...legacy.map(old => ({ ...imported.find(base => base.baseCode === BASE_CODES[old.name])!, name: old.name,
    width: old.width ?? (['ring', 'amulet'].includes(old.slot) ? 1 : 2),
    height: old.height ?? (['weapon', 'armor', 'shield'].includes(old.slot) ? 3 : ['ring', 'amulet', 'belt'].includes(old.slot) ? 1 : 2),
  })), ...imported.filter(base => !existing.has(base.baseCode!))];
}
const extraProperties: Record<string, Modifier> = {
  ...EFFECT_PROPERTIES,
  vit: 'vitality', allskills: 'allSkills', crush: 'crushingBlow', deadly: 'deadlyStrike', openwounds: 'openWounds', nofreeze: 'cannotBeFrozen',
  'red-dmg%': 'damageReduction', 'regen-mana': 'manaRegen', 'mana%': 'maxManaPercent', 'hp%': 'maxLifePercent',
  'res-fire-max': 'maxFireRes', 'res-cold-max': 'maxColdRes', 'res-ltng-max': 'maxLightningRes', 'res-pois-max': 'maxPoisonRes',
  'abs-cold%': 'coldAbsorb', light: 'lightRadius', 'dmg': 'damageFlat',
};
export function catalogMods(properties: CatalogProperty[], random = () => .5): Mods {
  const result: Mods = {}, add = (mods: Mods) => { for (const [key, value] of Object.entries(mods)) result[key as Modifier] = (result[key as Modifier] ?? 0) + value!; };
  for (const [rawCode, param, min, max] of properties) {
    const code = rawCode.toLowerCase();
    const draw = random(), roll = Number.isFinite(draw) ? Math.min(1 - Number.EPSILON, Math.max(0, draw)) : .5;
    const value = min + Math.floor(roll * (max - min + 1));
    if (extraProperties[code]) add({ [extraProperties[code]]: value });
    else if (LEVEL_PROPERTIES[code]) { const [key, divisor] = LEVEL_PROPERTIES[code]; add({ [key]: (Number(param) || value) / divisor }); }
    else if (code === 'skill' && catalogSkill(param)) add({ [`skill_${catalogSkill(param)}`]: value });
    else if (code === 'aura' && catalogSkill(param) && isAura(catalogSkill(param)!)) add({ [`aura_${catalogSkill(param)}`]: value });
    else if (code === 'rep-dur') add({ repairDurability: Number(param) / 100 });
    else if (code === 'rep-quant') add({ replenishQuantity: Number(param) / 100 });
    else if (code === 'howl') add({ flee: value * 100 / 128 });
    else if (code === 'dmg-mag') add({ magicMinDamage: min, magicMaxDamage: max });
    else if (code === 'dmg-elem') add({ fireMinDamage: min, fireMaxDamage: max, coldMinDamage: min, coldMaxDamage: max, lightningMinDamage: min, lightningMaxDamage: max, coldDuration: Number(param) / 25 });
    else if (code === 'res-all-max') add({ maxFireRes: value, maxColdRes: value, maxLightningRes: value, maxPoisonRes: value });
    else if (code === 'all-stats') add({ strength: value, dexterity: value, vitality: value, energy: value });
    else if (code === 'dmg-norm') add({ minDamage: min, maxDamage: max });
    else if (code === 'reduce-ac') add({ targetDefense: Math.abs(value) });
    else if (code === 'skilltab' && !['0','1','2','3','4','5','9','10','11'].includes(param)) continue;
    else if (code === 'randclassskill') add({ paladinSkills: 3 });
    else if (supportsAffixProperty(code)) add(rollAffix({ properties: [[code, Number(param) || 0, min, max]] } as Parameters<typeof rollAffix>[0], () => roll).mods);
  }
  return result;
}
type CatalogItem = Pick<Item, 'catalogId' | 'catalogRolls'>;
export function catalogItemMods(item: CatalogItem) {
  const entry = CATALOG_SPECIALS.find(entry => entry.id === item.catalogId) ?? CATALOG_RUNEWORDS.find(entry => entry.id === item.catalogId);
  let index = 0;
  return entry ? catalogMods(entry.properties, () => item.catalogRolls?.[index++] ?? .5) : {};
}
export function rollCatalogMods(item: Item, random: () => number) {
  const entry = CATALOG_SPECIALS.find(entry => entry.id === item.catalogId) ?? CATALOG_RUNEWORDS.find(entry => entry.id === item.catalogId);
  if (!entry) throw new Error('Unknown catalog item');
  // Keep one draw per original property so recipe-only ranges can be recovered after saving.
  item.catalogRolls = entry.properties.map(() => { const draw = random(); return Number.isFinite(draw) ? Math.max(0, Math.min(1 - Number.EPSILON, draw)) : .5; });
  item.catalogVersion = 2;
  return catalogItemMods(item);
}
export function catalogPropertyStatus(property: CatalogProperty): 'active' | 'other-class' | 'inactive' | 'unused' {
  const [rawCode, param] = property;
  const code = rawCode.toLowerCase();
  if (code.startsWith('*') || ['bloody', 'state', 'fade'].includes(code)) return 'unused';
  if (['nec', 'bar', 'dru', 'ass', 'skill-rand'].includes(code) || code === 'skilltab' && !['0','1','2','3','4','5','9','10','11'].includes(param) || code === 'skill' && !catalogSkill(param)) return 'other-class';
  if (code === 'aura') return catalogSkill(param) && isAura(catalogSkill(param)!) ? 'active' : 'inactive';
  if (code === 'rep-quant') return 'active';
  if (itemTrigger(property)) return 'active';
  return extraProperties[code] || LEVEL_PROPERTIES[code] || supportsAffixProperty(code) || ['skill', 'all-stats', 'dmg-norm', 'reduce-ac', 'randclassskill', 'rep-dur', 'howl', 'dmg-mag', 'dmg-elem', 'res-all-max'].includes(code) ? 'active' : 'inactive';
}
const inactiveLabels: Record<string, string> = {
  'hit-skill': '击中触发', 'att-skill': '攻击触发', 'gethit-skill': '受击触发', 'kill-skill': '击杀触发', 'death-skill': '死亡触发', 'levelup-skill': '升级触发',
  charged: '技能聚气', oskill: '职业外技能', ethereal: '无形', reanimate: '复活为亡灵', pierce: '穿透攻击', magicarrow: '魔法箭', explosivearrow: '爆炸箭', 'rep-quant': '回复数量', stack: '数量上限', cheap: '商店价格降低', light: '照亮范围',
};
function originalItemProperties(item: Item) {
  const entry = CATALOG_SPECIALS.find(entry => entry.id === item.catalogId) ?? CATALOG_RUNEWORDS.find(entry => entry.id === item.catalogId);
  const properties = [...(entry?.properties ?? [])];
  for (const jewel of item.socketedJewels ?? []) properties.push(...(CATALOG_SPECIALS.find(entry => entry.id === jewel.catalogId && entry.code === 'jew')?.properties ?? []));
  return properties;
}
export function itemTriggers(item: Item) { return originalItemProperties(item).map(itemTrigger).filter((trigger): trigger is NonNullable<ReturnType<typeof itemTrigger>> => !!trigger); }
export function catalogModifierRanges(item: Item): Partial<Record<Modifier, [number, number]>> {
  const entry = CATALOG_SPECIALS.find(entry => entry.id === item.catalogId) ?? CATALOG_RUNEWORDS.find(entry => entry.id === item.catalogId);
  if (!entry) return {};
  const low = catalogMods(entry.properties, () => 0), high = catalogMods(entry.properties, () => 1), rolled = catalogItemMods(item), result: Partial<Record<Modifier, [number, number]>> = {};
  for (const key of Object.keys(low) as Modifier[]) {
    const bonus = item.rarity === 'runeword' ? (item.mods?.[key] ?? 0) - (rolled[key] ?? 0) : 0;
    result[key] = [Math.min(low[key]!, high[key] ?? low[key]!) + bonus, Math.max(low[key]!, high[key] ?? low[key]!) + bonus];
  }
  return result;
}
export function otherClassItemEffects(item: Item) {
  return originalItemProperties(item).filter(property => catalogPropertyStatus(property) === 'other-class').map(([code, param, min, max]) => {
    const amount = min === max ? min : `${min}-${max}`;
    if (CLASS_NAMES[code]) return `+${amount} ${CLASS_NAMES[code]}技能（职业限定）`;
    if (code === 'skilltab') {
      const tabs = ['弓与十字弓', '被动与魔法', '标枪与长矛', '火焰法术', '闪电法术', '冰冷法术', '诅咒', '毒素与白骨', '召唤', '战斗技能', '攻击灵气', '防御灵气', '战斗技能', '战斗专家', '战嚎', '召唤', '变形', '元素', '陷阱', '影子训练', '武学技艺'];
      const classes = ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass'];
      return `+${amount} ${tabs[Number(param)] ?? param}（仅限${CLASS_NAMES[classes[Math.floor(Number(param) / 3)]] ?? '其他职业'}）`;
    }
    return `+${amount} 单项技能 ${param}（其他职业）`;
  });
}
export function unappliedItemEffects(item: Item) {
  const properties = originalItemProperties(item);
  return properties.filter(property => catalogPropertyStatus(property) === 'inactive').map(([code, param, min, max]) => {
    const label = inactiveLabels[code.toLowerCase()] ?? code;
    return code.endsWith('-skill') ? `${min}% ${label}：等级 ${max} ${param}` : `${label}${param ? ` · ${param}` : ''}${min || max ? `（${min === max ? min : `${min}–${max}`}）` : ''}`;
  });
}
const aliases: Record<string, string> = {
  'The Spirit Shroud': '精神之帷幕', 'Goblin Toe': '哥布林脚趾', "Sigon's Visor": '西刚的面甲', "Sigon's Wrap": '西刚的包覆',
  'Rusthandle': '罗瑟的愤怒', Ironward: '阿斯特龙之铁的保护区', 'Pelta Lunata': '镶金盾', "Mara's Kaleidoscope": '玛拉的万花筒',
};
export function expandSpecials(legacy: SpecialItem[], bases: ItemBase[]): SpecialItem[] {
  const names = new Set<string>();
  const result = CATALOG_SPECIALS.map(entry => {
    const old = legacy.find(item => item.name === (aliases[entry.key] ?? entry.name));
    const base = bases.find(base => base.baseCode === entry.code)!;
    let name = old?.name ?? entry.name;
    if (entry.key === 'Rainbow Facet') {
      const element = entry.properties.find(([code]) => code.startsWith('extra-'))?.[0];
      const label = ({ 'extra-fire': '火焰', 'extra-cold': '冰冷', 'extra-ltng': '闪电', 'extra-pois': '毒素' } as Record<string, string>)[element ?? ''] ?? '元素';
      name += `（${label}·${entry.properties.some(([code]) => code === 'death-skill') ? '死亡' : '升级'}）`;
    }
    if (names.has(name)) name += `（${entry.rarity === 'set' ? '套装' : entry.code}）`;
    names.add(name);
    const sockets = entry.properties.find(([code]) => code === 'sock');
    return { ...base, sockets: sockets ? Number(sockets[1]) || sockets[3] : 0, name, base: base.name,
      baseCode: entry.code, catalogId: entry.id, rarity: entry.rarity, level: entry.requiredLevel,
      qualityLevel: entry.qualityLevel, treasureClass: Math.ceil(CATALOG_BASES.find(base => base.code === entry.code)!.level / 3) * 3, dropWeight: entry.weight,
      setId: entry.set.startsWith('Sigon') ? 'sigon' : entry.set || undefined,
      eventOnly: entry.qualityLevel > 99, mods: catalogMods(entry.properties),
    };
  });
  for (const old of legacy) if (!result.some(item => item.name === old.name)) throw new Error(`Unmapped legacy special: ${old.name}`);
  return result;
}
export function expandRunewords(legacy: RuneWord[], bases: ItemBase[], runeOrder: readonly RuneId[]): RuneWord[] {
  return CATALOG_RUNEWORDS.map(entry => {
    const runes = entry.runes.map(code => runeOrder[Number(code.slice(1)) - 1]);
    const old = legacy.find(word => word.runes.join() === runes.join());
    const allowed = bases.filter(base => base.itemType && entry.include.some(type => hasItemType(base.itemType!, type)) && !entry.exclude.some(type => hasItemType(base.itemType!, type)));
    return { name: old?.name ?? entry.name, runes, slots: [...new Set(allowed.map(base => base.slot))],
      bases: allowed.map(base => base.name), mods: catalogMods(entry.properties),
      catalogId: entry.id, includeTypes: entry.include, excludeTypes: entry.exclude,
      // Imported properties are the recipe bonus; socket rune bonuses are applied separately.
      addRuneMods: true,
    };
  });
}
export function catalogSetBonuses(active: Item[]): Mods {
  const result: Mods = {};
  const add = (properties: CatalogProperty[]) => { for (const [key, value] of Object.entries(catalogMods(properties))) result[key as Modifier] = (result[key as Modifier] ?? 0) + value!; };
  for (const set of CATALOG_SETS) {
    const equipped = active.filter(item => item.setId === set.id || item.setId === 'sigon' && set.id.startsWith('Sigon')), ids = new Set(equipped.map(item => item.catalogId ?? item.name));
    for (const [count, properties] of set.partial) if (ids.size >= count) add(properties);
    if (ids.size && ids.size >= CATALOG_SPECIALS.filter(item => item.set === set.id).length) add(set.full);
  }
  return result;
}
export function catalogItemSetBonuses(item: Item, active: Item[]): Mods {
  const entry = CATALOG_SPECIALS.find(entry => entry.id === item.catalogId), result: Mods = {};
  if (entry?.addFunction !== 2) return result;
  const count = new Set(active.filter(other => other.setId === item.setId).map(other => other.catalogId ?? other.name)).size;
  for (const [needed, properties] of entry.partial) if (count >= needed) for (const [key, value] of Object.entries(catalogMods(properties))) result[key as Modifier] = (result[key as Modifier] ?? 0) + value!;
  return result;
}
export function itemSetName(item: Item) { return item.setId === 'sigon' ? '西刚的全套刀剑' : CATALOG_SETS.find(set => set.id === item.setId)?.name ?? item.setId; }
const typeLabels: Record<string, string> = { weap: '武器', mele: '近战武器', miss: '弓 / 弩', swor: '剑', axe: '斧', club: '棍棒', hamm: '战锤', mace: '钉锤 / 连枷', scep: '权杖', pole: '长柄武器', spea: '长矛', staf: '法杖', wand: '魔杖', h2h: '爪', h2h2: '爪', tors: '铠甲', helm: '头盔', shld: '盾牌', ashd: '圣骑士盾牌', pala: '圣骑士盾牌' };
export function runewordBaseLabel(word: RuneWord) { return (word.includeTypes ?? []).map(type => typeLabels[type] ?? type).join(' / '); }
