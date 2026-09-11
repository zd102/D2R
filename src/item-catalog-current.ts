// Curated updates are separate from the reproducible LoD import. Property order
// stays stable so existing catalogRolls never shift to a different modifier.
import { CATALOG_SPECIALS as ORIGINAL_SPECIALS, CATALOG_RUNEWORDS as ORIGINAL_WORDS, type CatalogProperty, type CatalogWord } from './item-catalog-data.ts';
export * from './item-catalog-data.ts';
export const LEGACY_CURATED_SPECIALS = ORIGINAL_SPECIALS.filter(entry => ['Pluckeye', 'Bane Ash', 'Manald Heal', 'Gravenspine', 'Blinkbats Form'].includes(entry.key));

export const CATALOG_SPECIALS = ORIGINAL_SPECIALS.map(entry => {
  const properties: CatalogProperty[] = entry.properties.map(property => [...property]);
  if (entry.key === 'Pluckeye') properties.push(['swing2', '', 25, 25]);
  if (entry.key === 'Manald Heal') properties.push(['cast2', '', 10, 10]);
  if (entry.key === 'Gravenspine') properties.push(['cast2', '', 10, 10]);
  if (entry.key === 'Bane Ash') {
    for (const property of properties) if (['swing2', 'dmg%'].includes(property[0])) property[0] = '*legacy';
    properties.push(['cast2', '', 20, 20]);
  }
  if (entry.key === 'Blinkbats Form') {
    const speed = properties.find(property => property[0] === 'move2')!; speed[2] = speed[3] = 30;
    properties.push(['mana-kill', '', 1, 1]);
  }
  return { ...entry, properties };
});

// Rune socket bonuses are applied separately by socketItem, just as for LoD
// recipes. These properties describe only the additional recipe effects.
const helms = (id: string, name: string, rune: string, properties: CatalogProperty[]): CatalogWord => ({
  id: `d2r-${id}`, key: id, name, runes: ['r13', 'r16', rune], include: ['helm'], exclude: [],
  properties: [['ac%', '', 75, 100], ['hp%', '', 5, 5], ...properties],
});
export const ADDED_RUNEWORDS: CatalogWord[] = [
  helms('Bulwark', '壁垒', 'r12', [['lifesteal', '', 4, 6], ['regen', '', 30, 30], ['red-dmg%', '', 10, 15]]),
  helms('Cure', '治愈', 'r07', [['aura', 'Cleansing', 1, 1], ['res-pois', '', 10, 30], ['res-pois-len', '', 50, 50]]),
  helms('Hearth', '炉火', 'r10', [['res-cold', '', 10, 30], ['abs-cold%', '', 10, 15], ['nofreeze', '', 1, 1]]),
  helms('Ground', '地面', 'r09', [['res-ltng', '', 10, 30], ['abs-ltng%', '', 10, 15]]),
  helms('Temper', '熔火', 'r08', [['res-fire', '', 10, 30], ['abs-fire%', '', 10, 15]]),
  { id: 'd2r-Hustle-armor', key: 'Hustle Armor', name: '躁动', runes: ['r13', 'r18', 'r02'], include: ['tors'], exclude: [],
    properties: [['move2', '', 65, 65], ['swing2', '', 40, 40], ['oskill', 'Evade', 6, 6], ['stamdrain', '', 35, 35], ['res-all', '', 10, 10]] },
];
export const CATALOG_RUNEWORDS: CatalogWord[] = [
  ...ORIGINAL_WORDS.map(entry => entry.key === 'Insight' ? { ...entry, include: [...entry.include, 'miss'] } : entry),
  ...ADDED_RUNEWORDS,
];
