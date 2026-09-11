import type { Game } from './game';
import type { Item } from './items';
import { mercenaryUnlocked, mercenaryCost, mercenaryStats, mercenaryAuraRank, mercenaryAuraValues, mercenaryAuras, mercenaryEquipReason, mercenaryItemAllowed, mercenaryEquipmentPreview, activeMercenaryEquipment, MERCENARY_AURAS, MERCENARY_SLOTS, type MercenarySlot } from './mercenary';
import { skillName, isSkill, isAura, type SkillId } from './paladin';
import { itemDetails } from './item-details-ui';
import { itemVisual } from './item-art';

export type MercenaryPanelState = { tab: 'equipment' | 'auras'; itemId?: string; statsOpen?: boolean };
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const slotNames = { weapon: '武器', helm: '头盔', armor: '铠甲' };
const slotIcons = { weapon: 'sword', helm: 'crown', armor: 'shirt' };
const auraIcons = { prayer: 'heart-pulse', defiance: 'shield-check', blessedAim: 'focus', might: 'swords', holyFreeze: 'snowflake', thorns: 'sun' };
const itemName = (item: Item) => escape(item.identified === false ? `未鉴定 ${item.base ?? item.name}` : item.name);
const number = (value: number) => Math.round(value).toLocaleString();

function auraDescription(aura: ReturnType<typeof mercenaryAuraValues>) {
  switch (aura.id) {
    case 'prayer': return `每 2 秒回血 ${aura.healing}`;
    case 'defiance': return `防御 +${aura.percent}%`;
    case 'blessedAim': return `准确率 +${aura.attack}%`;
    case 'might': return `物理伤害 +${aura.damage}%`;
    case 'holyFreeze': return `减速 ${aura.percent}% · 每 2 秒冰伤 ${aura.min}–${aura.max}`;
    case 'thorns': return `近战反伤 ${aura.percent}% + ${aura.secondary}`;
  }
}

export function mercenaryPanel(game: Game, merchant: boolean, state: MercenaryPanelState) {
  const h = game.hero, merc = h.mercenary, s = mercenaryStats(h), cost = mercenaryCost(h);
  if (!mercenaryUnlocked(h)) return '<div class="mercenary-locked"><i data-lucide="swords"></i><h3>沙漠卫士，静候召集</h3><p>通关第一章、击败安达利尔后，营地将开放佣兵商人。</p></div>';
  const active = activeMercenaryEquipment(h), gear = merc ? MERCENARY_SLOTS.flatMap(slot => merc.equipment[slot] ? [merc.equipment[slot]!] : []) : [];
  const candidates = h.inventory.filter(item => mercenaryItemAllowed(item)), items = [...gear, ...candidates];
  const selected = items.find(item => item.id === state.itemId);
  const equipped = !!selected && gear.includes(selected), reason = selected ? mercenaryEquipReason(h, selected) : '';
  const allSkills = s.mods.allSkills ?? 0, selectedAura = mercenaryAuras(h, true).find(aura => aura.id === merc?.aura) ?? mercenaryAuraValues('prayer', h.level, allSkills);
  const alive = merc?.status === 'alive', status = !merc ? '尚未雇佣' : alive ? '正在随行' : '已阵亡';
  const auraInRange = alive && !!game.mercenary.position && game.mercenary.position.distanceTo(game.position) <= selectedAura.radius;
  const statsRows: [string, string][] = [
    ['基础物理伤害', `${number(s.attackMin)}–${number(s.attackMax)}`], ['准确率', number(s.attackRating)], ['防御', number(s.defense)],
    ['力量 / 敏捷', `${number(s.strength)} / ${number(s.dexterity)}`],
    ['突刺频率', `${(2 / (Math.max(.10, s.attackFrames / 75) + Math.max(.32, s.attackFrames / 40))).toFixed(1)} 次/秒`],
    ['生命偷取', `${s.mods.lifeSteal ?? 0}%`], ['压碎 / 致命', `${s.mods.crushingBlow ?? 0}% / ${s.mods.deadlyStrike ?? 0}%`],
  ];
  let comparison = '';
  if (selected && merc && !equipped && !reason) {
    const preview = mercenaryEquipmentPreview(h, selected)!;
    const deltas: [string, number][] = [['平均物伤', preview.attack - s.attack], ['防御', preview.defense - s.defense], ['生命', preview.maxHp - s.maxHp], ['吸血 %', (preview.mods.lifeSteal ?? 0) - (s.mods.lifeSteal ?? 0)]];
    comparison = `<div class="mercenary-comparison"><h4>装备后变化</h4><dl>${deltas.map(([label, delta]) => `<div><dt>${label}</dt><dd class="${delta > 0 ? 'improved' : delta < 0 ? 'reduced' : ''}">${delta > 0 ? '+' : ''}${Math.round(delta)}</dd></div>`).join('')}</dl></div>`;
  }
  const equipmentPane = `<div class="mercenary-gear-heading"><h3>装备 <small>${active.length} / 3 生效</small></h3><span>点击物品查看详情</span></div>
    <div class="mercenary-equipment">${MERCENARY_SLOTS.map(slot => { const item = merc?.equipment[slot]; return `<div class="mercenary-slot ${item && selected?.id === item.id ? 'selected' : ''}" data-mercenary-slot="${slot}">
      <span class="mercenary-slot-name">${slotNames[slot]}</span>${item ? `<button class="mercenary-item-select" data-mercenary-item="${escape(item.id)}" aria-pressed="${selected?.id === item.id}">${itemVisual(item)}<span class="${item.rarity}">${itemName(item)}</span></button>${active.includes(item) ? '' : '<small class="reduced">需求不足 · 未生效</small>'}<button class="mercenary-take" data-mercenary-unequip="${slot}" aria-label="取回${slotNames[slot]}">取回</button>` : `<div class="mercenary-empty-slot">${icon(slotIcons[slot])}<span>未装备</span></div>`}</div>`; }).join('')}</div>
    <div class="mercenary-loadout"><section class="mercenary-bag"><h3>背包候选 <small>${candidates.length}</small></h3><div class="mercenary-candidates">${candidates.map(item => { const disabled = mercenaryEquipReason(h, item); return `<div class="${selected?.id === item.id ? 'selected' : ''}"><button class="mercenary-item-select" data-mercenary-item="${escape(item.id)}" aria-pressed="${selected?.id === item.id}">${itemVisual(item)}<span><strong class="${item.rarity}">${itemName(item)}</strong><small>${slotNames[item.slot as MercenarySlot]} · 需求等级 ${item.requiredLevel ?? 1}</small></span></button><button class="mercenary-equip" data-mercenary-equip="${escape(item.id)}" ${disabled ? 'disabled' : ''}>装备</button>${disabled ? `<small class="reduced">${escape(disabled)}</small>` : ''}</div>`; }).join('') || '<p class="mercenary-empty">背包内暂无可用装备</p>'}</div></section>
    ${selected ? `<section class="mercenary-inspector" aria-label="佣兵装备详情"><h3>${equipped ? '已穿戴装备' : '装备详情'}</h3>${itemDetails(h, selected, { equipped: true })}${comparison}${!equipped && reason ? `<p class="reduced">${escape(reason)}</p>` : ''}</section>` : ''}</div>
    <p class="mercenary-footnote">不消耗耐久 · 阵亡保留装备 · 体力与法力属性无效</p>`;
  const extraAuras = Object.entries(s.mods).filter(([key, rank]) => rank > 0 && key.startsWith('aura_') && isSkill(key.slice(5)) && isAura(key.slice(5) as SkillId)).map(([key, rank]) => ({ id: key.slice(5) as SkillId, rank }));
  const auraPane = `<div class="mercenary-aura-heading"><p>选择一种光环</p><span>基础 ${mercenaryAuraRank(h.level)}${allSkills ? ` + 装备 ${allSkills}` : ''} 级</span></div>
    <div class="mercenary-auras">${MERCENARY_AURAS.map(id => { const aura = mercenaryAuraValues(id, h.level, allSkills), chosen = merc?.aura === id; return `<button data-mercenary-aura="${id}" aria-pressed="${chosen}" class="${chosen ? 'selected' : ''}" ${merc ? '' : 'disabled'}><span class="mercenary-aura-icon">${icon(auraIcons[id])}</span><span class="mercenary-aura-copy"><strong>${skillName(id)} <small>Lv. ${aura.rank}</small></strong><span>${auraDescription(aura)}</span><small>${aura.radius.toFixed(1)} 格${id === 'holyFreeze' ? ' · 首领减速减半' : ''}</small></span>${chosen ? `<span class="mercenary-aura-check" aria-label="已选择">${icon('check')}</span>` : ''}</button>`; }).join('')}</div>
    ${extraAuras.length ? `<div class="mercenary-extra-auras"><small>装备光环</small>${extraAuras.map(aura => `<span>${skillName(aura.id)} <b>Lv. ${aura.rank}</b></span>`).join('')}</div>` : ''}<p class="mercenary-footnote">同名取较强效果 · 离开范围或阵亡后失效</p>`;
  return `<div class="mercenary-screen">
    ${merchant ? `<div class="mercenary-contract"><small>格雷兹 · 持有 ${number(h.gold)} 金币${!alive && h.gold < cost ? ' · 金币不足' : ''}</small><button class="primary-button" data-action="hire-mercenary" ${alive || h.gold < cost || !game.atMercenaryMerchant ? 'disabled' : ''}>${alive ? '已雇佣' : merc ? '重新雇佣米山' : '雇佣米山'}${alive ? '' : ` · ${number(cost)} 金币`}</button></div>` : !alive ? `<div class="mercenary-contract"><p>${merc ? '已阵亡，装备已保留。' : '尚未雇佣。'}</p>${game.inCamp ? '<button class="primary-button" data-action="find-mercenary">前往佣兵商人</button>' : '<small>请回营地雇佣</small>'}</div>` : ''}
    <div class="mercenary-overview"><div class="mercenary-life-summary"><strong>米山 · Lv. ${h.level} <small>${status}</small></strong><div class="mercenary-life" role="meter" aria-label="米山生命" aria-valuemin="0" aria-valuemax="${s.maxHp}" aria-valuenow="${Math.ceil(merc?.hp ?? 0)}"><i style="width:${Math.min(100, (merc?.hp ?? 0) / s.maxHp * 100)}%"></i><span>${number(merc?.hp ?? 0)} / ${number(s.maxHp)}</span></div></div>
      <div class="mercenary-current-aura">${icon(auraIcons[merc?.aura ?? 'prayer'])}<div><strong>${merc ? skillName(merc.aura) : '待选择光环'}</strong><small>${!alive ? '尚未生效' : merc?.aura === 'holyFreeze' ? '以米山为中心' : auraInRange ? '你在光环范围内' : '你已离开光环范围'}</small></div><b>Lv. ${selectedAura.rank}</b></div>
      <details class="mercenary-stat-details" ${state.statsOpen ? 'open' : ''}><summary>详细属性 ${icon('chevron-right')}</summary><dl class="mercenary-stats">${statsRows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><div class="mercenary-resistances">${(['fire', 'cold', 'lightning', 'poison'] as const).map((type, i) => `<div><small>${['火焰', '冰冷', '闪电', '毒素'][i]}</small><b class="${s.resistances[type] < 0 ? 'reduced' : ''}">${s.resistances[type]}%</b></div>`).join('')}</div></details>
      <div class="mercenary-potion-tip"><kbd>Shift + 1</kbd><span>喂生命药剂</span></div></div>
      <div class="mercenary-main"><div class="mercenary-tabs" role="tablist" aria-label="佣兵管理">${(['equipment', 'auras'] as const).map(tab => `<button role="tab" id="mercenary-tab-${tab}" aria-controls="mercenary-pane" aria-selected="${state.tab === tab}" tabindex="${state.tab === tab ? 0 : -1}" data-mercenary-tab="${tab}">${icon(tab === 'equipment' ? 'shirt' : 'sparkles')}${tab === 'equipment' ? '装备与背包' : '光环技能'}</button>`).join('')}</div><div id="mercenary-pane" role="tabpanel" aria-labelledby="mercenary-tab-${state.tab}">${state.tab === 'equipment' ? equipmentPane : auraPane}</div></div></div>`;
}
