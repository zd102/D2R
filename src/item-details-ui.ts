import type { HeroState } from './model';
import { filledSockets, itemMods, itemRequirements, rangedBase, rarityNames, slotNames, RUNES, runeNumber, runeLabel, type Item } from './items';
import { CLASS_NAMES, itemSetName } from './item-catalog';
import { CHARM_BASES } from './affixes';
import { itemModifierLines, itemWeaponDamage } from './item-description';
import { itemVisual, runeArtwork } from './item-art';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function itemDetails(hero: HeroState, item: Item, options: { equipped?: boolean; editable?: boolean; showRanges?: boolean; socketEditorOpen?: boolean; comparison?: string; tooltip?: boolean } = {}) {
  const identified = item.identified !== false, mods = identified ? itemMods(item) : {}, facts: [string, string | number][] = [];
  if (item.slot === 'weapon') facts.push([rangedBase(item)?.stack ? '投掷伤害' : item.twoHanded ? '双手伤害' : '单手伤害', itemWeaponDamage(item, hero.level, mods)]);
  else if (!item.charm && !['ring', 'ring2', 'amulet'].includes(item.slot)) facts.push(['防御', Math.floor(item.power * (1 + (mods.enhancedDefense ?? 0) / 100) + (mods.defense ?? 0) + (mods.defensePerLevel ?? 0) * hero.level)]);
  if (item.block) facts.push(['盾牌格挡', `${item.block + (mods.block ?? 0)}%`]);
  if (item.maxDurability) facts.push(['耐久度', mods.indestructible ? '无法破坏' : `${item.durability} / ${item.maxDurability}`]);
  if (rangedBase(item)) facts.push(['弹药', '无限']);
  facts.push(['物品等级', item.level], ['需要等级', item.requiredLevel ?? 1]);
  if (item.requiredStrength) facts.push(['需要力量', identified ? itemRequirements(item).strength : item.requiredStrength]);
  if (item.requiredDexterity) facts.push(['需要敏捷', identified ? itemRequirements(item).dexterity : item.requiredDexterity]);
  if (item.requiredClass) facts.push(['限定职业', CLASS_NAMES[item.requiredClass]]);
  const kind = item.misc ? '杂物' : item.charm ? item.charmSize ? CHARM_BASES[item.charmSize].name : '护身符' : item.jewel ? '珠宝' : slotNames[item.slot];
  const affixes = identified ? itemModifierLines(item) : [];
  return `<div class="item-detail-scroll ${options.showRanges ? 'show-ranges' : ''}"><header class="item-summary"><div class="item-showcase ${item.rarity}">${itemVisual(item)}</div><div><span class="rarity-tag ${item.rarity}">${rarityNames[item.rarity]} · ${kind}</span><h3 class="${item.rarity}">${escape(identified ? item.name : `未鉴定 ${item.base ?? item.name}`)}</h3>${item.base && item.base !== item.name ? `<small>${escape(item.base)}</small>` : ''}</div></header>
    <dl class="item-basics">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(String(value))}</dd></div>`).join('')}</dl>
    ${identified ? `<section class="item-affix-panel">${!options.tooltip && affixes.some(line => line.range) ? `<label class="affix-range-toggle"><input type="checkbox" data-affix-ranges ${options.showRanges ? 'checked' : ''}/>显示词缀浮动范围</label>` : ''}<ul class="item-affixes">${affixes.map(line => `<li>${escape(line.text)}${line.range ? `<small class="affix-range">变量 ${escape(line.range)}</small>` : ''}</li>`).join('')}</ul></section>${item.setId ? `<div class="set-bonuses">${escape(itemSetName(item) ?? '')}${item.setId === 'sigon' ? '<br>2 件：10% 生命偷取<br>3 件：100 防御<br>6 件：20 法力、12% 火抗、7 点物理减伤' : ''}</div>` : ''}` : '<p class="unidentified-note">鉴定后显示魔法属性</p>'}
    ${item.sockets ? `<section class="item-socket-panel"><div class="section-label">镶嵌 · ${filledSockets(item)} / ${item.sockets} 孔</div><div class="socket-row">${(item.runes ?? []).map(id => `<span class="socket-rune" data-tip="${escape(runeLabel(id))}">${runeArtwork(id)}<b>${runeNumber(id)}</b><small>${RUNES[id].name}</small></span>`).join('')}${(item.socketedJewels ?? []).map(jewel => `<span data-tip="${escape(jewel.name)}"><i data-lucide="gem"></i></span>`).join('')}${Array(Math.max(0, item.sockets - filledSockets(item))).fill('<span class="socket-empty">空</span>').join('')}</div>${options.editable && !options.equipped && identified && filledSockets(item) < item.sockets ? `<details class="socket-editor" ${options.socketEditorOpen ? 'open' : ''}><summary>镶嵌符文 / 珠宝</summary><div class="socket-options">${[...new Set(hero.runes)].map(id => `<button data-socket="${id}" aria-label="镶嵌${runeLabel(id)}">${runeArtwork(id)}<span>${RUNES[id].name}<small>${runeNumber(id)}</small></span></button>`).join('') || '<small>尚无符文</small>'}</div><div class="socket-options">${[...hero.inventory, ...hero.stash].filter(item => item.jewel && item.identified !== false).map(item => `<button data-socket-jewel="${escape(item.id)}"><i data-lucide="gem"></i>${escape(item.name)}</button>`).join('')}</div></details>` : ''}</section>` : ''}${options.comparison ?? ''}</div>`;
}
