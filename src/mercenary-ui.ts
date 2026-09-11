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
    case 'prayer': return `每 2 秒恢复 ${aura.healing} 点生命`;
    case 'defiance': return `防御提高 ${aura.percent}%`;
    case 'blessedAim': return `准确率提高 ${aura.attack}%`;
    case 'might': return `物理伤害加成 +${aura.damage}%`;
    case 'holyFreeze': return `敌人减速 ${aura.percent}%，每 2 秒造成 ${aura.min}–${aura.max} 冰冷伤害`;
    case 'thorns': return `反弹 ${aura.percent}% 近战物理伤害，附加 ${aura.secondary} 点反伤`;
  }
}

export function mercenaryPanel(game: Game, merchant: boolean, state: MercenaryPanelState) {
  const h = game.hero, merc = h.mercenary, s = mercenaryStats(h), cost = mercenaryCost(h);
  if (!mercenaryUnlocked(h)) return '<div class="mercenary-locked"><i data-lucide="swords"></i><h3>沙漠卫士，静候召集</h3><p>通关第一章、击败安达利尔后，营地将开放佣兵商人。</p></div>';
  const active = activeMercenaryEquipment(h), gear = merc ? MERCENARY_SLOTS.flatMap(slot => merc.equipment[slot] ? [merc.equipment[slot]!] : []) : [];
  const candidates = h.inventory.filter(item => mercenaryItemAllowed(item)), items = [...gear, ...candidates];
  const selected = items.find(item => item.id === state.itemId) ?? gear[0] ?? candidates[0];
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
  const equipmentPane = `<div class="mercenary-gear-heading"><h3>佣兵装备 <small>${active.length} / 3 生效</small></h3><span>武器 · 头盔 · 铠甲</span></div>
    <div class="mercenary-equipment">${MERCENARY_SLOTS.map(slot => { const item = merc?.equipment[slot]; return `<div class="mercenary-slot ${item && selected?.id === item.id ? 'selected' : ''}" data-mercenary-slot="${slot}">
      <span class="mercenary-slot-name">${slotNames[slot]}</span>${item ? `<button class="mercenary-item-select" data-mercenary-item="${escape(item.id)}" aria-pressed="${selected?.id === item.id}">${itemVisual(item)}<span class="${item.rarity}">${itemName(item)}</span></button><small class="${active.includes(item) ? 'improved' : 'reduced'}">${active.includes(item) ? '属性生效' : '需求不足 · 未生效'}</small><button class="mercenary-take" data-mercenary-unequip="${slot}">取回${slotNames[slot]}</button>` : `<div class="mercenary-empty-slot">${icon(slotIcons[slot])}<span>未装备</span></div>`}</div>`; }).join('')}</div>
    <div class="mercenary-loadout"><section class="mercenary-bag"><h3>背包候选 <small>${candidates.length}</small></h3><p>选择物品查看详情与属性变化。</p><div class="mercenary-candidates">${candidates.map(item => { const disabled = mercenaryEquipReason(h, item); return `<div class="${selected?.id === item.id ? 'selected' : ''}"><button class="mercenary-item-select" data-mercenary-item="${escape(item.id)}" aria-pressed="${selected?.id === item.id}">${itemVisual(item)}<span><strong class="${item.rarity}">${itemName(item)}</strong><small>${slotNames[item.slot as MercenarySlot]} · 需求等级 ${item.requiredLevel ?? 1}</small></span></button><button class="mercenary-equip" data-mercenary-equip="${escape(item.id)}" ${disabled ? 'disabled' : ''}>装备给米山</button>${disabled ? `<small class="reduced">${escape(disabled)}</small>` : ''}</div>`; }).join('') || '<div class="mercenary-empty">暂无可用物品<small>从仓库取出装备，或前往底材商人购买。</small></div>'}</div></section>
    <section class="mercenary-inspector" aria-label="佣兵装备详情"><h3>${equipped ? '已穿戴装备' : '装备详情'}</h3>${selected ? `${itemDetails(h, selected, { equipped: true })}${comparison}${equipped ? '' : reason ? `<p class="reduced">${escape(reason)}</p>` : ''}` : '<div class="mercenary-empty">选择一件装备<small>长柄武器、长矛或标枪；非职业专属头盔与铠甲。</small></div>'}</section></div>
    <p class="mercenary-footnote">装备不消耗耐久，阵亡后仍可取回。生命、抗性、吸血和攻速均作用于米山；体力和法力属性对米山无效。</p>`;
  const extraAuras = Object.entries(s.mods).filter(([key, rank]) => rank > 0 && key.startsWith('aura_') && isSkill(key.slice(5)) && isAura(key.slice(5) as SkillId)).map(([key, rank]) => ({ id: key.slice(5) as SkillId, rank }));
  const auraPane = `<div class="mercenary-aura-heading"><div><h3>选择战斗光环</h3><p>随米山等级成长，同时启用一种原生光环。</p></div><span>基础 ${mercenaryAuraRank(h.level)}${allSkills ? ` + 装备 ${allSkills}` : ''} 级</span></div>
    <div class="mercenary-auras">${MERCENARY_AURAS.map(id => { const aura = mercenaryAuraValues(id, h.level, allSkills), chosen = merc?.aura === id; return `<button data-mercenary-aura="${id}" aria-pressed="${chosen}" class="${chosen ? 'selected' : ''}" ${merc ? '' : 'disabled'}><span class="mercenary-aura-icon">${icon(auraIcons[id])}</span><span class="mercenary-aura-copy"><strong>${skillName(id)} <small>Lv. ${aura.rank}</small></strong><span>${auraDescription(aura)}</span><small>${id === 'holyFreeze' ? `首领减速减半 · ` : '米山与附近队友 · '}${aura.radius.toFixed(1)} 格</small></span><span class="mercenary-aura-check">${chosen ? '已选择' : '选择'}</span></button>`; }).join('')}</div>
    <div class="mercenary-extra-auras"><h3>装备提供的光环</h3>${extraAuras.length ? extraAuras.map(aura => `<span>${skillName(aura.id)} <b>Lv. ${aura.rank}</b></span>`).join('') : '<p>装备提供的额外光环会在这里显示。</p>'}<small>同名光环取较强效果；离开范围或米山阵亡后停止生效。</small></div>`;
  return `<div class="mercenary-screen"><header class="mercenary-banner"><div class="mercenary-emblem">${icon('swords')}</div><div><small>沙漠佣兵 · 双段突刺</small><h3>米山 <span>Lv. ${h.level}</span></h3></div><span class="mercenary-status-badge ${alive ? 'alive' : ''}">${status}</span></header>
    ${merchant ? `<div class="mercenary-contract"><div><strong>格雷兹 · 佣兵商人</strong><small>${alive ? '米山正与你并肩作战' : merc ? '装备已保留，重新雇佣即可随行' : '雇佣后即可配置装备与光环'} · 持有 ${number(h.gold)} 金币</small></div><button class="primary-button" data-action="hire-mercenary" ${alive || h.gold < cost || !game.atMercenaryMerchant ? 'disabled' : ''}>${alive ? '已雇佣' : merc ? '重新雇佣米山' : '雇佣米山'} · ${number(cost)} 金币</button>${!alive && h.gold < cost ? '<small class="reduced">金币不足</small>' : ''}</div>` : !alive ? `<div class="mercenary-contract"><p>${merc ? '米山已阵亡，装备已保留。' : '米山尚未加入队伍。'}请找佣兵商人雇佣。</p>${game.inCamp ? '<button class="primary-button" data-action="find-mercenary">前往佣兵商人</button>' : ''}</div>` : ''}
    <div class="mercenary-layout"><aside class="mercenary-overview"><div class="mercenary-life" role="meter" aria-label="米山生命" aria-valuemin="0" aria-valuemax="${s.maxHp}" aria-valuenow="${Math.ceil(merc?.hp ?? 0)}"><i style="width:${Math.min(100, (merc?.hp ?? 0) / s.maxHp * 100)}%"></i><span>生命 ${number(merc?.hp ?? 0)} / ${number(s.maxHp)}</span></div>
      <div class="mercenary-current-aura">${icon(auraIcons[merc?.aura ?? 'prayer'])}<div><strong>${merc ? skillName(merc.aura) : '待选择光环'}</strong><small>${!alive ? '尚未生效' : merc?.aura === 'holyFreeze' ? '以米山为中心' : auraInRange ? '你在光环范围内' : '你已离开光环范围'}</small></div><b>Lv. ${selectedAura.rank}</b></div>
      <details class="mercenary-stat-details" ${(state.statsOpen ?? (innerWidth > 700 && innerHeight > 580)) ? 'open' : ''}><summary>战斗属性与抗性 ${icon('chevron-right')}</summary><dl class="mercenary-stats">${statsRows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><div class="mercenary-resistances">${(['fire', 'cold', 'lightning', 'poison'] as const).map((type, i) => `<div><small>${['火焰', '冰冷', '闪电', '毒素'][i]}</small><b class="${s.resistances[type] < 0 ? 'reduced' : ''}">${s.resistances[type]}%</b></div>`).join('')}</div></details>
      <div class="mercenary-potion-tip"><kbd>Shift + 1</kbd><span>使用生命药剂<small>每瓶持续恢复 160 点生命</small></span></div></aside>
      <div class="mercenary-main"><div class="mercenary-tabs" role="tablist" aria-label="佣兵管理">${(['equipment', 'auras'] as const).map(tab => `<button role="tab" id="mercenary-tab-${tab}" aria-controls="mercenary-pane" aria-selected="${state.tab === tab}" tabindex="${state.tab === tab ? 0 : -1}" data-mercenary-tab="${tab}">${icon(tab === 'equipment' ? 'shirt' : 'sparkles')}${tab === 'equipment' ? '装备与背包' : '光环技能'}</button>`).join('')}</div><div id="mercenary-pane" role="tabpanel" aria-labelledby="mercenary-tab-${state.tab}">${state.tab === 'equipment' ? equipmentPane : auraPane}</div></div></div></div>`;
}
