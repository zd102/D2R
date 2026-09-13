import { AVAILABLE_RUNEWORDS, runewordFits, socketItem, type Item, type RuneId } from './items.ts';
import { hasCube, type HeroState } from './model.ts';

export function compatibleRunewords(item: Item, runes: readonly RuneId[]) {
  if (item.identified === false) return [];
  const inserted = item.runes ?? [];
  return AVAILABLE_RUNEWORDS.filter(word => runewordFits(item, word) && inserted.length < word.runes.length
    && inserted.every((rune, index) => rune === word.runes[index])).map(word => {
    const remaining = word.runes.slice(inserted.length), needed = new Map<RuneId, number>();
    for (const rune of remaining) needed.set(rune, (needed.get(rune) ?? 0) + 1);
    const missing = [...needed].flatMap(([rune, count]) => {
      const shortage = count - runes.filter(owned => owned === rune).length;
      return shortage > 0 ? [{ rune, count: shortage }] : [];
    });
    return { word, remaining, missing };
  }).sort((a, b) => Number(a.missing.length > 0) - Number(b.missing.length > 0));
}

export function socketRuneword(hero: HeroState, itemId: string, wordId: string, random = Math.random) {
  const item = [...hero.inventory, ...hero.stash, ...(hasCube(hero) ? hero.cube : [])].find(item => item.id === itemId);
  if (!item) return false;
  const recipe = compatibleRunewords(item, hero.runes).find(recipe => recipe.word.catalogId === wordId);
  if (!recipe || recipe.missing.length) return false;
  // Complete on copies first: a stale selection or failed recipe cannot consume
  // a partial sequence or leave a partly modified piece of equipment.
  const crafted = structuredClone(item), remainingRunes = [...hero.runes];
  for (const rune of recipe.remaining) {
    const index = remainingRunes.indexOf(rune);
    if (index < 0 || !socketItem(crafted, rune, random)) return false;
    remainingRunes.splice(index, 1);
  }
  if (crafted.rarity !== 'runeword' || crafted.catalogId !== wordId) return false;
  Object.assign(item, crafted); hero.runes = remainingRunes; return true;
}
