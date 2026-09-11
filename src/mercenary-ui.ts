import type { Game } from './game';
import { mercenaryUnlocked, mercenaryCost, mercenaryStats, mercenaryAuraRank, mercenaryEquipReason, mercenaryItemAllowed, activeMercenaryEquipment, MERCENARY_AURAS, MERCENARY_SLOTS } from './mercenary';
import { skillName, skillValues, emptySkills } from './paladin';
import { itemDetails } from './item-details-ui';
import { itemVisual } from './item-art';
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function mercenaryPanel(game: Game, merchant: boolean) {
  const h = game.hero, merc = h.mercenary, s = mercenaryStats(h), cost = mercenaryCost(h);
  if (!mercenaryUnlocked(h)) return '<p class="quest-story">通关第一章、击败安达利尔后，营地将开放佣兵商人。</p>';
  const rank = mercenaryAuraRank(h.level) + (s.mods.allSkills ?? 0), active = activeMercenaryEquipment(h);
  const descriptions = {
    prayer: (rank: number) => `每 2 秒为附近队友恢复 ${skillValues('prayer', rank, emptySkills()).healing} 生命`,
    defiance: (rank: number) => `附近队友防御 +${skillValues('defiance', rank, emptySkills()).percent}%`,
    blessedAim: (rank: number) => `附近队友准确率 +${skillValues('blessedAim', rank, emptySkills()).attack}%`,
    might: (rank: number) => `附近队友物理伤害加成 +${skillValues('might', rank, emptySkills()).damage}%`,
    holyFreeze: (rank: number) => `附近敌人减速 ${skillValues('holyFreeze', rank, emptySkills()).percent}%，持续造成冰冷伤害`,
    thorns: (rank: number) => `附近队友反弹 ${skillValues('thorns', rank, emptySkills()).percent}% 所受近战物理伤害`,
  };
  const slotNames = { weapon: '武器', helm: '头盔', armor: '铠甲' };
  return `<div class="mercenary-screen">
    <div class="mercenary-banner"><div class="mercenary-emblem">${icon('swords')}</div><div><small>沙漠佣兵 · 突刺</small><h3>米山 <span>Lv. ${h.level}</span></h3><p>${!merc ? '尚未雇佣' : merc.status === 'dead' ? '已阵亡 · 装备已保留' : '正在随行 · 等级与角色同步'}</p></div></div>
    ${merc?.status === 'alive' ? `<div class="mercenary-life" role="meter" aria-label="米山生命" aria-valuemin="0" aria-valuemax="${s.maxHp}" aria-valuenow="${Math.ceil(merc.hp)}"><i style="width:${merc.hp / s.maxHp * 100}%"></i><span>生命 ${Math.ceil(merc.hp)} / ${s.maxHp}</span></div>` : ''}
    ${merchant ? `<div class="mercenary-contract"><p>格雷兹 · 佣兵商人<br><small>雇佣费随角色等级增长。阵亡后需回到此处重新雇佣。</small></p><button class="primary-button" data-action="hire-mercenary" ${merc?.status === 'alive' || h.gold < cost || !game.atMercenaryMerchant ? 'disabled' : ''}>${merc?.status === 'alive' ? '已雇佣' : merc?.status === 'dead' ? '重新雇佣米山' : '雇佣米山'} · ${cost.toLocaleString()} 金币</button><small>持有 ${h.gold.toLocaleString()} 金币${h.gold < cost && merc?.status !== 'alive' ? ' · 金币不足' : ''}</small></div>` : merc?.status !== 'alive' ? '<p class="quest-story">请回营地找佣兵商人雇佣米山。</p>' : ''}
    ${!merchant && game.inCamp && merc?.status !== 'alive' ? '<button class="primary-button" data-action="find-mercenary">前往佣兵商人</button>' : ''}
    <dl class="mercenary-stats">${[['突刺基础伤害', `${Math.floor(s.attackMin)}–${Math.floor(s.attackMax)}`], ['防御', s.defense], ['准确率', s.attackRating], ['力量 / 敏捷', `${s.strength} / ${s.dexterity}`], ['火 / 冰抗性', `${s.resistances.fire}% / ${s.resistances.cold}%`], ['电 / 毒抗性', `${s.resistances.lightning}% / ${s.resistances.poison}%`]].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    ${merc ? `<section><h3>光环选择 <small>等级 ${rank} · 同时启用一种</small></h3><div class="mercenary-auras">${MERCENARY_AURAS.map(aura => `<button data-mercenary-aura="${aura}" aria-pressed="${merc.aura === aura}" class="${merc.aura === aura ? 'selected' : ''}"><strong>${skillName(aura)}</strong><small>${descriptions[aura](rank)}</small></button>`).join('')}</div></section>
    <section><h3>佣兵装备</h3><p class="mercenary-note">长柄武器、长矛或标枪 · 头盔 · 铠甲。需满足等级、力量与敏捷要求。装备不消耗耐久；阵亡后仍可取回。</p><div class="mercenary-equipment">${MERCENARY_SLOTS.map(slot => { const item = merc.equipment[slot]; return `<div class="mercenary-slot" data-mercenary-slot="${slot}"><h4>${slotNames[slot]}</h4>${item ? `<details><summary>${itemVisual(item)}<span class="${item.rarity}">${escapeHtml(item.name)}</span></summary>${itemDetails(h, item, { equipped: true })}</details>${!active.includes(item) ? '<p class="red-text">需求不满足，属性未生效</p>' : ''}<button data-mercenary-unequip="${slot}">取回${slotNames[slot]}</button>` : '<p>未装备</p>'}</div>`; }).join('')}</div></section>
    <section><h3>从背包装备</h3><div class="mercenary-candidates">${h.inventory.filter(item => mercenaryItemAllowed(item)).map(item => { const reason = mercenaryEquipReason(h, item); return `<div><details><summary>${itemVisual(item)}<span class="${item.rarity}">${escapeHtml(item.identified === false ? `未鉴定 ${item.base ?? item.name}` : item.name)}</span></summary>${itemDetails(h, item)}</details><button data-mercenary-equip="${escapeHtml(item.id)}" ${reason ? 'disabled' : ''}>装备给米山</button>${reason ? `<small>${escapeHtml(reason)}</small>` : ''}</div>`; }).join('') || '<p class="mercenary-note">背包中没有适合米山的装备，可从底材商人购买，或将仓库中的装备取至背包。</p>'}</div></section>` : '<p class="mercenary-note">雇佣后可穿戴装备并选择祈祷、反抗、祝福瞄准、力量、神圣冰冻或荆棘光环。</p>'}
  </div>`;
}
