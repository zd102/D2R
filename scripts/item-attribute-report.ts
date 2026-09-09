import { CATALOG_BASES, CATALOG_SPECIALS, CATALOG_RUNEWORDS, CATALOG_SETS, type CatalogProperty } from '../src/item-catalog-data.ts';
import { catalogPropertyStatus } from '../src/item-catalog.ts';

const properties: CatalogProperty[] = [
  ...CATALOG_SPECIALS.flatMap(item => [...item.properties, ...item.partial.flatMap(([, properties]) => properties)]),
  ...CATALOG_RUNEWORDS.flatMap(item => item.properties),
  ...CATALOG_SETS.flatMap(set => [...set.full, ...set.partial.flatMap(([, properties]) => properties)]),
];
const counts = { active: 0, 'other-class': 0, inactive: 0, unused: 0 };
const missing = new Map<string, number>();
for (const property of properties) {
  const status = catalogPropertyStatus(property); counts[status]++;
  if (status === 'inactive') missing.set(property[0], (missing.get(property[0]) ?? 0) + 1);
}
console.log(JSON.stringify({ bases: CATALOG_BASES.length, specials: CATALOG_SPECIALS.length, runewords: CATALOG_RUNEWORDS.length, properties: properties.length, counts, inactive: Object.fromEntries([...missing].sort((a, b) => b[1] - a[1])) }, null, 2));
