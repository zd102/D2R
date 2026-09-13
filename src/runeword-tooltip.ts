import { AVAILABLE_RUNEWORDS, BASES, RUNES, makeItem, runewordFits, socketItem, slotNames, runeLabel, type RuneWord } from './items.ts';
import { runewordBaseLabel } from './item-catalog.ts';
import { itemModifierLines } from './item-description.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function runewordPreviewSections(word: RuneWord) {
  return word.slots.flatMap(slot => {
    const base = BASES.find(base => base.slot === slot && (base.sockets ?? 0) >= word.runes.length
      && runewordFits({ ...makeItem(base, 'recipe-preview'), sockets: word.runes.length }, word));
    if (!base) return [];
    const item = makeItem(base, `recipe-preview-${word.catalogId}-${slot}`); item.sockets = word.runes.length;
    for (const rune of word.runes) socketItem(item, rune, () => .5);
    return [{ slot, base: base.name, lines: itemModifierLines(item) }];
  });
}

export function runewordTooltip(id: string) {
  const word = AVAILABLE_RUNEWORDS.find(word => word.catalogId === id); if (!word) return undefined;
  return `<div class="runeword-tooltip"><h3>${escape(word.name)}</h3><p>${word.runes.map(rune => escape(runeLabel(rune))).join(' → ')}</p>
    <p>${escape(runewordBaseLabel(word))} · ${word.runes.length} 孔 · 符文需要等级 ${Math.max(...word.runes.map(rune => RUNES[rune].level))}</p>
    <p class="recipe-preview-note">属性为示例值，浮动范围另列；成品伤害与防御取决于底材。</p>
    ${runewordPreviewSections(word).map(section => `<section><h4>${section.slot === 'weapon' ? '武器' : section.slot === 'shield' ? '盾牌' : slotNames[section.slot]} · ${escape(section.base)}示例</h4><ul class="item-affixes">${section.lines.map(line => `<li>${escape(line.text)}${line.range ? `<small class="affix-range">范围 ${escape(line.range)}</small>` : ''}</li>`).join('')}</ul></section>`).join('')}</div>`;
}
