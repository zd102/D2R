import { BASES, SPECIAL_ITEMS, AVAILABLE_RUNEWORDS, RUNE_ORDER, RUNES, makeItem, specialItem, runewordFits, socketItem, isAvailableItem, type Item, type ItemBase, type SpecialItem, type RuneWord, type RuneId, type Slot } from './items.ts';
import { CATALOG_SPECIALS, CATALOG_RUNEWORDS } from './item-catalog-data.ts';
import { AFFIX_BASES } from './affix-data.ts';
import { MONSTERS, BOSSES, ENCOUNTERS, type MonsterDef } from './bestiary.ts';
import { LEVELS, SPECIAL_LEVELS } from './campaign.ts';
import { monsterStats } from './balance.ts';
import { BOSS_DROP_PROFILES, bossSpecialPool } from './boss-loot.ts';
import { runePool } from './loot.ts';
import { runeNumber, runeLabel } from './items.ts';

export const ITEM_KINDS = { all: '全部物品', unique: '暗金装备', set: '套装装备', base: '装备底材', runeword: '符文之语', rune: '符文', supply: '补给' };
export type ItemKind = Exclude<keyof typeof ITEM_KINDS, 'all'>;
export type EncyclopediaItem = { id: string; name: string; english: string; kind: ItemKind; level: number; slot?: Slot; icon: string; base?: ItemBase; special?: SpecialItem; word?: RuneWord; rune?: RuneId; supply?: 0 | 1 };
export const RACE_NAMES = { undead: '不死系', demon: '恶魔', beast: '野兽' };
export const MONSTER_RANKS = { all: '全部怪物', monster: '普通怪物', miniboss: '守关首领', actBoss: '章节首领' };
export type EncyclopediaMonster = { id: string; name: string; definition: MonsterDef; rank: Exclude<keyof typeof MONSTER_RANKS, 'all'>; areas: number[] };
const slotIcons: Record<Slot, string> = { weapon: 'sword', shield: 'shield', armor: 'shirt', helm: 'crown', gloves: 'hand', boots: 'footprints', belt: 'rectangle-ellipsis', amulet: 'gem', ring: 'circle', ring2: 'circle' };
export const equipmentIcon = (base: ItemBase) => base.charm ? 'scroll-text' : base.jewel ? 'gem' : slotIcons[base.slot];
export const ENCYCLOPEDIA_ITEMS: EncyclopediaItem[] = [
  ...SPECIAL_ITEMS.filter(isAvailableItem).map(special => ({ id: special.catalogId!, name: special.name, english: CATALOG_SPECIALS.find(row => row.id === special.catalogId)!.key, kind: special.rarity, level: special.level, slot: special.slot, icon: equipmentIcon(special), special })),
  ...BASES.map((base, index) => ({ id: `base-${index}`, name: base.name, english: AFFIX_BASES[base.baseCode!]?.name ?? '', kind: 'base' as const, level: base.requiredLevel ?? 1, slot: base.slot, icon: equipmentIcon(base), base })).filter(entry => isAvailableItem(entry.base)),
  ...AVAILABLE_RUNEWORDS.map(word => ({ id: `word-${word.catalogId}`, name: word.name, english: CATALOG_RUNEWORDS.find(row => row.id === word.catalogId)!.key, kind: 'runeword' as const, level: Math.max(...word.runes.map(id => RUNES[id].level)), icon: 'scroll-text', word })),
  ...RUNE_ORDER.map(rune => ({ id: `rune-${rune}`, name: `${RUNES[rune].name}符文`, english: rune.toUpperCase(), kind: 'rune' as const, level: RUNES[rune].level, icon: 'gem', rune })),
  { id: 'supply-life', name: '生命药剂', english: 'Healing Potion', kind: 'supply', level: 1, icon: 'heart-pulse', supply: 0 },
  { id: 'supply-mana', name: '法力药剂', english: 'Mana Potion', kind: 'supply', level: 1, icon: 'droplets', supply: 1 },
];
export const ENCYCLOPEDIA_AREAS = [...LEVELS, ...Object.values(SPECIAL_LEVELS)];
export const ENCYCLOPEDIA_MONSTERS: EncyclopediaMonster[] = [
  ...BOSSES.map((definition, index) => ({ id: definition.id, name: LEVELS[index].boss, definition, rank: LEVELS[index].actBoss ? 'actBoss' as const : 'miniboss' as const, areas: [index] })),
  ...Object.values(MONSTERS).map(definition => ({ id: definition.id, name: definition.name, definition, rank: 'monster' as const, areas: definition.id === 'hellCow' ? [SPECIAL_LEVELS.cow.index] : ENCOUNTERS.flatMap((pack, index) => pack.includes(definition.id) ? [index] : []) })),
];
const itemsById = new Map(ENCYCLOPEDIA_ITEMS.map(entry => [entry.id, entry]));
const monstersById = new Map(ENCYCLOPEDIA_MONSTERS.map(entry => [entry.id, entry]));
export const encyclopediaItem = (id: string) => itemsById.get(id);
export const encyclopediaMonster = (id: string) => monstersById.get(id);
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function filterEncyclopediaItems(query = '', kind = 'all', slot = 'all', sort = 'default') {
  const terms = normalize(query).split(' ').filter(Boolean);
  const entries = ENCYCLOPEDIA_ITEMS.filter(entry => {
    if (kind !== 'all' && entry.kind !== kind) return false;
    if (slot !== 'all' && (entry.word ? !entry.word.slots.includes(slot as Slot) : entry.slot !== slot)) return false;
    const search = normalize([entry.name, entry.english, entry.base?.baseCode, entry.special?.base, entry.special?.setId, entry.rune ? runeNumber(entry.rune) : '', ...(entry.word?.runes.map(id => `${id} ${runeLabel(id)}`) ?? [])].join(' '));
    return terms.every(term => /^#\d+$/.test(term) ? [entry.rune, ...(entry.word?.runes ?? [])].some(id => id && runeNumber(id) === term) : search.includes(term));
  });
  if (sort === 'level') entries.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'zh-CN'));
  if (sort === 'name') entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return entries;
}
export function filterEncyclopediaMonsters(query = '', rank = 'all', act = 'all', race = 'all') {
  const terms = normalize(query).split(' ').filter(Boolean);
  return ENCYCLOPEDIA_MONSTERS.filter(entry => (rank === 'all' || entry.rank === rank) && (race === 'all' || entry.definition.race === race) && (act === 'all' || entry.areas.some(index => ENCYCLOPEDIA_AREAS[index].act === Number(act))) && terms.every(term => normalize(`${entry.name} ${entry.id} ${entry.areas.map(index => ENCYCLOPEDIA_AREAS[index].name).join(' ')}`).includes(term)));
}
export function recipeBases(word: RuneWord) { return BASES.filter(base => (base.sockets ?? 0) >= word.runes.length && runewordFits({ ...makeItem(base, 'encyclopedia-base'), sockets: word.runes.length }, word)); }
export function encyclopediaItemPreview(entry: EncyclopediaItem, baseName?: string): Item | undefined {
  if (entry.special) { const item = specialItem(entry.id, () => .5); item.id = `encyclopedia-${entry.id}`; item.identified = true; return item; }
  if (entry.base) return makeItem(entry.base, `encyclopedia-${entry.id}`);
  if (entry.word) {
    const candidates = recipeBases(entry.word), base = candidates.find(base => base.name === baseName) ?? candidates[0];
    if (!base) return undefined;
    const item = makeItem(base, `encyclopedia-${entry.id}`); item.sockets = entry.word.runes.length;
    for (const rune of entry.word.runes) socketItem(item, rune, () => .5);
    return item;
  }
}
export type ItemDropSource = { monsterId: string; area: number; kind: 'regular' | 'favored' | 'event' | 'forge' | 'countess' };
export function itemDropSources(entry: EncyclopediaItem, difficulty: number): ItemDropSource[] {
  const sources: ItemDropSource[] = [];
  if (entry.special && !isAvailableItem(entry.special) || entry.base && !isAvailableItem(entry.base)) return sources;
  for (const profile of BOSS_DROP_PROFILES) {
    const area = LEVELS[profile.levelIndex], boss = BOSSES[area.index], level = monsterStats(boss, area, difficulty, true).level;
    let kind: ItemDropSource['kind'] | undefined;
    if (entry.special) {
      if (entry.special.eventOnly) {
        if (difficulty === 2 && (entry.id === 'unique-382' && area.index === 19 || entry.id === 'unique-401' && area.index === 24)) kind = 'event';
      } else if ((entry.special.qualityLevel ?? entry.level) <= level && (entry.special.treasureClass ?? 0) <= profile.maxTC[difficulty]) {
        kind = bossSpecialPool(profile, level, difficulty).includes(entry.special) ? 'favored' : 'regular';
      }
    } else if (entry.base) {
      const qlvl = entry.base.qualityLevel ?? entry.base.level;
      if (entry.base.charm || qlvl <= level + 3 && Math.ceil(qlvl / 3) * 3 <= profile.maxTC[difficulty]) kind = 'regular';
    } else if (entry.rune) {
      const index = RUNE_ORDER.indexOf(entry.rune), forgeStart = [0, 11, 14][difficulty];
      if (runePool(level, difficulty, area.act).includes(entry.rune)) kind = 'regular';
      if (area.index === 3 && index <= [7, 15, 23][difficulty]) kind = 'countess';
      if (area.index === 17 && index >= forgeStart && index < forgeStart + 11) kind = 'forge';
    }
    if (kind) sources.push({ monsterId: boss.id, area: area.index, kind });
  }
  return sources;
}
