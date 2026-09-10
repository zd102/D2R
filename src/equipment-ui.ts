import { activeEquipment, type HeroState } from './model';
import { SLOTS, slotNames, type Slot } from './items';
import { itemVisual } from './item-art';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const glyphs: Record<Slot, string> = { weapon: 'sword', shield: 'shield', armor: 'shirt', helm: 'crown', gloves: 'hand', belt: 'rectangle-ellipsis', boots: 'footprints', amulet: 'gem', ring: 'circle', ring2: 'circle' };
export function equipmentPanel(hero: HeroState, selectedId?: string, shared = false, disabled = false) {
  const active = activeEquipment(hero);
  return `<div class="equipment-heading"><span>武器组 ${hero.weaponSet + 1}</span><button data-action="swap-weapons" aria-label="切换武器组" data-tip="切换武器组" ${disabled ? 'disabled' : ''}><i data-lucide="arrow-left-right"></i></button></div><div class="paperdoll">${SLOTS.map(slot => {
    const item = hero.equipment[slot], label = ({ shield: '副手', ring: '左戒指', ring2: '右戒指' } as Partial<Record<Slot, string>>)[slot] ?? slotNames[slot];
    return `<div class="gear-position gear-${slot}"><span>${label}</span><button draggable="false" data-equipment-slot="${slot}" class="gear-slot ${item?.rarity ?? ''} ${item && !active.includes(item) ? 'unusable' : ''} ${item?.id === selectedId ? 'selected' : ''}" ${item ? `${shared ? 'data-shared-item' : 'data-item'}="${escape(item.id)}" ${shared ? 'data-shared-side="equipment"' : ''} aria-label="${escape(item.name)}" data-tip="${escape(item.name)}"` : `aria-label="${slotNames[slot]}未装备"`} ${disabled || !item ? 'disabled' : ''}>${item ? itemVisual(item) : `<i data-lucide="${glyphs[slot]}"></i>`}${item?.durability === 0 ? '<small>损坏</small>' : ''}</button></div>`;
  }).join('')}</div>`;
}
