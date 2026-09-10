import type { Game, Skill } from './game';
import type { UI } from './ui';
import { stats, skillLevel, learnSkill, learnReason, bindSkill, setAura, activeEquipment, equipItem, equipReason, unequipItem, moveStorage, identifyItem, IDENTIFY_COST, insertRune, repairCost, repairEquipment, respec, difficulty, difficultyNames, damageTypeNames, totalExperience, type Slot } from './model';
import { skillsForClass, skillById, skillValues, skillName, skillIcon, treeNames, attributeNames, isAura, isPassive, type SkillTree, type SkillId, type ActionId, type Attribute } from './paladin';
import { CLASSES } from './classes';
import { SLOTS, slotNames, rarityNames, MOD_NAMES, RUNES, RUNEWORDS, itemMods, packItems, footprint, stashRows, type Item, type Modifier, type RuneId } from './items';
import { InventoryDrag } from './inventory-drag';
import { filledSockets, itemRequirements } from './items';
import { insertJewel } from './model';
import { CLASS_NAMES, itemSetName, runewordBaseLabel } from './item-catalog';
import { itemVisual, runeArtwork } from './item-art';
import { RUNE_ORDER, runeNumber, runeLabel } from './items';
import { runeUpgradeCost, upgradeRune } from './loot';
import { itemModifierLines, itemWeaponDamage } from './item-description';
import { CHARM_BASES } from './affixes';
import { skillSlotNames } from './controls';
import { rangedBase } from './items';

const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const tip = (label: string) => `aria-label="${escape(label)}" data-tip="${escape(label)}"`;
const number = (value: number) => Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
export class CharacterScreen {
  game: Game; ui: UI;
  tree: SkillTree = 'combat'; selectedSkill: SkillId = 'sacrifice'; view: 'inventory' | 'stash' | 'runes' = 'inventory';
  respecPending = false;
  recipeFilter = 'all';
  recipePage = 0;
  showRanges = false;
  sheetTab: 'attributes' | 'combat' = 'attributes';
  skillPane: 'tree' | 'detail' | 'bindings' = 'tree';
  itemTab: 'overview' | 'affixes' | 'sockets' = 'affixes';
  affixPage = 0;
  detailItem?: string;
  inventoryPane: 'items' | 'equipment' | 'details' = 'items';
  runePane: 'materials' | 'recipes' = 'materials';
  inventoryDrag: InventoryDrag;
  constructor(game: Game, ui: UI) {
    this.game = game; this.ui = ui;
    this.inventoryDrag = new InventoryDrag(ui);
    ui.overlay.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
      const data = button.dataset, h = game.hero; let changed = false, render = false;
      if (data.tree) { this.tree = data.tree as SkillTree; this.selectedSkill = skillsForClass(h.classId).find(skill => skill.tree === this.tree)!.id; render = true; }
      if (data.selectSkill) { this.selectedSkill = data.selectSkill as SkillId; render = true; }
      if (data.learn) { changed = learnSkill(h, data.learn as SkillId); if (!changed) ui.toast(learnReason(h, data.learn as SkillId)); }
      if (data.activateAura) { changed = setAura(h, h.activeAura === data.activateAura ? null : data.activateAura as SkillId); game.combat.auraTimer = 0; }
      if (data.bagView) { this.view = data.bagView as typeof this.view; this.inventoryPane = 'items'; ui.selectedItem = undefined; render = true; }
      if (data.inventoryPane) { this.inventoryPane = data.inventoryPane as typeof this.inventoryPane; render = true; }
      if (data.runePane) { this.runePane = data.runePane as typeof this.runePane; render = true; }
      if (data.recipePage !== undefined) { this.recipePage = Math.max(0, Number(data.recipePage)); render = true; }
      if (data.sheetTab) { this.sheetTab = data.sheetTab as typeof this.sheetTab; render = true; }
      if (data.skillPane) { this.skillPane = data.skillPane as typeof this.skillPane; render = true; }
      if (data.itemTab) { this.itemTab = data.itemTab as typeof this.itemTab; render = true; }
      if (data.affixPage !== undefined) { this.affixPage = Math.max(0, Number(data.affixPage)); render = true; }
      if (data.selectSkill && innerWidth <= 700) this.skillPane = 'detail';
      if (data.tree) this.skillPane = 'tree';
      if (data.unequip) { changed = unequipItem(h, data.unequip as Slot); if (!changed) ui.toast('背包空间不足'); }
      if (data.stash) { changed = moveStorage(h, data.stash, true); if (!changed) ui.toast('仓库空间不足'); }
      if (data.withdraw) { changed = moveStorage(h, data.withdraw, false); if (!changed) ui.toast('背包空间不足'); }
      if (data.identify) { changed = identifyItem(h, data.identify); if (!changed) ui.toast(h.gold < IDENTIFY_COST ? '金币不足' : '该物品无需鉴定'); }
      if (data.socket && ui.selectedItem) { changed = insertRune(h, ui.selectedItem, data.socket as RuneId); if (!changed) ui.toast('无法镶嵌'); }
      if (data.socketJewel && ui.selectedItem) { changed = insertJewel(h, ui.selectedItem, data.socketJewel); if (!changed) ui.toast('无法镶嵌'); }
      if (data.equipRing) { game.equip(data.equipRing, 'ring2'); return; }
      if (data.upgradeRune && !game.saveConflict) { changed = upgradeRune(h.runes, data.upgradeRune as RuneId); if (changed) ui.toast('符文已合成', runeLabel(runeUpgradeCost(data.upgradeRune as RuneId)!.next)); }
      if (data.action === 'swap-weapons') { game.swapWeapons(); return; }
      if (data.action === 'repair') { changed = repairEquipment(h); if (!changed) ui.toast('金币不足'); }
      if (data.action === 'respec') { this.respecPending = true; render = true; }
      if (data.action === 'cancel-respec') { this.respecPending = false; render = true; }
      if (data.action === 'confirm-respec') { changed = respec(h); this.respecPending = false; render = true; if (changed) { game.combat.zeal = null; game.combat.classes.clear(); ui.toast('属性与技能点已返还'); } }
      if (changed && data.identify) this.itemTab = 'affixes';
      if (changed) game.save(false); if (changed || render) { ui.renderPanel(); if (data.selectSkill && innerWidth < 700) ui.overlay.querySelector('.skill-inspector')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    ui.overlay.addEventListener('change', event => {
      const select = event.target as HTMLSelectElement;
      if (select.dataset.recipeFilter) { this.recipeFilter = select.value; this.recipePage = 0; ui.renderPanel(); }
      if (select.dataset.affixRanges !== undefined) { this.showRanges = (select as unknown as HTMLInputElement).checked; ui.renderPanel(); }
      if (select.dataset.binding) { bindSkill(game.hero, select.dataset.binding as Skill, select.value as ActionId); game.save(false); ui.renderPanel(); }
    });
  }
  character() {
    const h = this.game.hero, s = stats(h), diff = difficulty(h), canRespec = h.questRewards.includes(`${diff}:shrine0`) && !h.respecUsed.includes(diff), c = CLASSES[h.classId];
    const FCR=c.fcr, FHR=c.fhr, FBR=c.fbr;
    const rows = [
      ['攻击伤害', `${Math.floor(s.attackMin)} - ${Math.floor(s.attackMax)}`], ['准确率', s.attackRating], ['防御', s.defense], ['格挡几率', `${s.block}%`],
      ['生命', `${Math.ceil(h.hp)} / ${number(s.maxHp)}`], ['法力', `${number(h.mana)} / ${number(s.maxMana)}`], ['耐力', `${Math.ceil(h.stamina)} / ${Math.ceil(s.maxStamina)}`], ['武器速度', `${s.ranged ? s.rangedFrames : s.attackFrames} 帧`],
    ];
    const next = (value: number, thresholds: readonly number[]) => thresholds.find(threshold => threshold > value) ?? '已达上限';
    return `<div class="paladin-sheet" data-sheet-tab="${this.sheetTab}"><div class="character-banner"><div class="class-mark" style="color:${c.color}">${icon(c.icon)}</div><div><span>${c.name} · ${difficultyNames[diff]}</span><h3>${escape(this.game.profile?.name ?? c.name)}</h3><small>等级 ${h.level} · 第 ${this.game.level.act + 1} 章 · 第 ${this.game.level.step + 1} 关</small></div></div>
      <nav class="compact-tabs sheet-tabs" aria-label="角色属性分类"><button data-sheet-tab="attributes" aria-pressed="${this.sheetTab === 'attributes'}">属性与抗性</button><button data-sheet-tab="combat" aria-pressed="${this.sheetTab === 'combat'}">战斗数据</button></nav><div class="sheet-columns"><div><div class="section-label"><span>基础属性</span><span class="gold-text">剩余 ${h.points}</span></div><div class="attribute-list">${(Object.keys(attributeNames) as Attribute[]).map(key => `<div>${icon(({ strength: 'sword', dexterity: 'crosshair', vitality: 'heart', energy: 'droplets' })[key])}<span>${attributeNames[key]}<small>${h[key]} 基础${s[key] !== h[key] ? ` + ${s[key] - h[key]}` : ''}</small></span><b>${s[key]}</b><button data-allocate="${key}" ${tip(`提升${attributeNames[key]}`)} ${h.points ? '' : 'disabled'}>${icon('plus')}</button><button data-allocate="${key}" data-count="5" ${tip(`${attributeNames[key]}增加5点`)} ${h.points >= 5 ? '' : 'disabled'}>+5</button></div>`).join('')}</div>
      <div class="section-label"><span>抗性</span><span>${[0, -40, -100][diff]}% 难度惩罚</span></div><div class="resistance-list">${(['fire', 'cold', 'lightning', 'poison'] as const).map(type => `<div class="resist-${type}">${icon(({ fire: 'flame', cold: 'snowflake', lightning: 'zap', poison: 'skull' })[type])}<span>${damageTypeNames[type]}</span><b>${s.resistances[type]}%</b><small>上限 ${s.maxResistances[type]}%</small></div>`).join('')}</div></div>
      <div><div class="section-label">战斗属性</div><dl class="sheet-stats">${rows.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl><div class="section-label">速度档位</div><div class="breakpoint-list">${[['施法', s.mods.fcr ?? 0, s.castFrames, FCR], ['打击恢复', s.mods.fhr ?? 0, s.recoveryFrames, FHR], ['格挡', s.mods.fbr ?? 0, s.blockFrames, h.holyShield ? [0, 86] : FBR]].map(([label, value, frames, thresholds]) => `<div><span>${label}</span><b>${value}%</b><strong>${frames} 帧</strong><small>下一档 ${next(value as number, thresholds as number[])}${typeof next(value as number, thresholds as number[]) === 'number' ? '%' : ''}</small></div>`).join('')}</div></div></div>
      <details class="advanced-stats"><summary>进阶属性</summary><dl class="sheet-stats">${(['lifeSteal', 'manaSteal', 'crushingBlow', 'deadlyStrike', 'openWounds', 'magicFind', 'damageReduction', 'runWalk', 'allSkills'] as Modifier[]).map(key => `<div><dt>${MOD_NAMES[key]}</dt><dd>${s.mods[key] ?? 0}</dd></div>`).join('')}<div><dt>生命恢复 / 秒</dt><dd>${number(s.lifeRegen)}</dd></div><div><dt>法力恢复 / 秒</dt><dd>${number(s.manaRegen)}</dd></div></dl></details>
      <div class="character-xp"><span>累计经验 ${Math.floor(totalExperience(h)).toLocaleString()}</span><b>${h.level === 99 ? '最高等级' : `${Math.floor(h.xp).toLocaleString()} / ${s.xpNeeded.toLocaleString()}`}</b><div><i style="width:${h.level === 99 ? 100 : Math.min(100, h.xp / s.xpNeeded * 100)}%"></i></div></div>
      <div class="sheet-actions"><button class="secondary-button" data-panel="skills">${icon('book-open')}技能 <b>${h.skillPoints}</b></button><button class="secondary-button" data-action="respec" ${canRespec ? '' : 'disabled'}>${icon('rotate-ccw')}重置属性与技能</button><small>${h.respecUsed.includes(diff) ? '本难度重置已使用' : canRespec ? '本难度剩余 1 次' : '通关邪恶洞窟后解锁'}</small></div>
      ${this.respecPending ? `<div class="respec-confirm" role="alert"><strong>重置所有已投入的属性与技能？</strong><p>本难度的重置次数将被消耗。装备需求会重新计算。</p><button class="primary-button" data-action="confirm-respec" ${canRespec ? '' : 'disabled'}>${icon('rotate-ccw')}确认重置</button><button class="text-button" data-action="cancel-respec">取消</button></div>` : ''}</div>`;
  }
  skillSummary(id: SkillId, rank: number) {
    const h = this.game.hero, v = skillValues(id, rank, h.skills), s = stats(h), rows: [string, string][] = [];
    if (!rank) return '<span class="muted">尚未学习</span>';
    if (v.min || v.max) { const multiplier = id === 'blessedHammer' && s.aura.id === 'concentration' ? 1 + s.aura.damage / 200 : 1+(s.mods[`${v.type}SkillDamage` as Modifier]??0)/100; rows.push([`${damageTypeNames[v.type]}伤害${['inferno','blaze','fireWall'].includes(id)?' / 秒':v.type==='poison'?' / 全程':''}`, `${Math.floor(v.min * multiplier)} - ${Math.floor(v.max * multiplier)}`]); }
    if (v.damage && v.type === 'physical') rows.push([id==='magicArrow'?'附加武器伤害':'伤害加成', `${v.damage>0?'+':''}${v.damage}${id==='magicArrow'?'':'%'}`]);
    if (v.attack) rows.push(['准确率', `+${v.attack}%`]);
    if (v.hits > 1) rows.push(['连续攻击', `${v.hits} 次`]);
    if (v.duration) rows.push(['持续时间', `${number(v.duration)} 秒`]);
    if (v.healing) rows.push([id==='valkyrie'?'召唤生命':'恢复生命', number(v.healing)]);
    if (v.percent) rows.push([({ vengeance: '各元素附加', conversion: '转化几率', holyShield: '防御加成', fanaticism: '技能攻击速度', holyFreeze: '减速', conviction: '降低元素抗性', thorns: '反弹伤害', cleansing: '缩短持续时间', vigor: '移动速度', meditation: '法力恢复', redemption: '救赎几率' } as Partial<Record<SkillId, string>>)[id] ?? '抗性 / 防御加成', `${v.percent}%`]);
    if (id === 'holyShield') rows.push(['增加格挡', `${v.secondary}%`]);
    if (id === 'fistOfHeavens') rows.push(['圣光弹魔法伤害', number(v.secondary)]);
    if (['holyFire', 'holyFreeze', 'holyShock'].includes(id)) rows.push(['攻击附加伤害', `${Math.floor(v.min * v.secondary)} - ${Math.floor(v.max * v.secondary)}`]);
    const effectNames:Partial<Record<SkillId,string>>={criticalStrike:'双倍伤害几率',dodge:'近战闪避',avoid:'远程闪避',evade:'移动闪避',pierce:'穿透几率',penetrate:'准确率加成',warmth:'法力恢复',fireMastery:'火焰增伤',lightningMastery:'闪电增伤',coldMastery:'降低冰冷抗性',staticField:'削减当前生命',energyShield:'伤害转移',slowMissiles:'投射物减速',dopplezon:'继承生命',fireArrow:'物理转火焰',coldArrow:'物理转冰冷',lightningBolt:'物理转闪电',magicArrow:'物理转魔法',impale:'损耗耐久几率'};
    if(v.percent&&effectNames[id]) rows[rows.findIndex(([label])=>label==='抗性 / 防御加成')]=[effectNames[id]!,`${v.percent}%`];
    if(id==='innerSight') rows.push(['降低防御',number(v.secondary)]);
    if(id==='energyShield') rows.push(['每点伤害消耗法力',number(v.secondary)]);
    if (v.radius) rows.push(['范围', `${number(v.radius)} 码`]);
    if(!isPassive(id)) rows.push(['法力消耗', number(v.cost)]);
    return `<dl class="skill-values">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  }
  skills() {
    const bindingNames = skillSlotNames(this.game.movementMode);
    const classId=this.game.hero.classId, SKILLS=skillsForClass(classId), trees:readonly SkillTree[]=CLASSES[classId].trees;
    if(!trees.includes(this.tree))this.tree=trees[0];
    if(!SKILLS.some(skill=>skill.id===this.selectedSkill&&skill.tree===this.tree))this.selectedSkill=SKILLS.find(skill=>skill.tree===this.tree)!.id;
    const h = this.game.hero, skill = skillById[this.selectedSkill], rank = skillLevel(h, skill.id), hard = h.skills[skill.id], reason = learnReason(h, skill.id);
    const options = ['attack' as const, ...SKILLS.filter(skill => skillLevel(h, skill.id)&&!isPassive(skill.id)).map(skill => skill.id)];
    return `<div class="skill-screen" data-skill-pane="${this.skillPane}"><nav class="compact-tabs skill-pane-tabs" aria-label="技能视图">${(['tree','detail','bindings'] as const).map(pane => `<button data-skill-pane="${pane}" aria-pressed="${this.skillPane === pane}">${({tree:'技能树',detail:'技能说明',bindings:'快捷配置'})[pane]}</button>`).join('')}</nav><div class="skill-toolbar"><div role="tablist" aria-label="技能系别" class="character-tabs">${trees.map(tree => `<button role="tab" aria-selected="${this.tree === tree}" data-tree="${tree}">${icon(SKILLS.find(skill=>skill.tree===tree)!.icon)}${treeNames[tree]}<b>${SKILLS.filter(skill => skill.tree === tree).reduce((sum, skill) => sum + h.skills[skill.id], 0)}</b></button>`).join('')}</div><span class="skill-points">剩余技能点 <b>${h.skillPoints}</b></span></div>
      <div class="skill-layout"><div class="skill-tree" role="tabpanel" aria-label="${treeNames[this.tree]}">${[1, 6, 12, 18, 24, 30].map((level, index) => `<span class="tree-level" style="grid-row:${index + 1}">${level}</span>`).join('')}${SKILLS.filter(skill => skill.tree === this.tree).map(node => `<button class="skill-node ${h.skills[node.id] ? 'learned' : h.level < node.level ? 'locked' : 'available'} ${this.selectedSkill === node.id ? 'selected' : ''} ${h.activeAura === node.id ? 'aura-active' : ''}" style="grid-column:${node.column + 1};grid-row:${[1, 6, 12, 18, 24, 30].indexOf(node.level) + 1}" data-select-skill="${node.id}" aria-pressed="${this.selectedSkill === node.id}" aria-label="${node.name}，投入 ${h.skills[node.id]} 点">${node.requires.length ? `<span class="prereq-arrow" title="${node.requires.map(id => skillName(id)).join('、')}">${icon('arrow-down')}</span>` : ''}<span class="skill-glyph">${icon(node.icon)}</span><strong>${node.name}</strong><span class="skill-rank">${h.skills[node.id]}<small> / 20</small>${skillLevel(h, node.id) > h.skills[node.id] ? `<em>+${skillLevel(h, node.id) - h.skills[node.id]}</em>` : ''}</span></button>`).join('')}</div>
      <div class="skill-inspector"><div class="skill-detail-heading">${icon(skill.icon)}<div><small>${treeNames[skill.tree]}</small><h3>${skill.name}</h3></div><b>${rank ? `Lv. ${rank}` : '未学习'}</b></div><p>${skill.description}</p><div class="skill-requirements"><span>需要等级 ${skill.level}</span>${skill.requires.length ? `<span>前置 ${skill.requires.map(id => `${skillName(id)} ${h.skills[id] ? '✓' : '0'}`).join(' · ')}</span>` : ''}</div>
      <div class="skill-compare"><div><h4>当前等级 ${rank}</h4>${this.skillSummary(skill.id, rank)}</div>${hard < 20 ? `<div><h4>下一等级 ${rank ? rank + 1 : 1}</h4>${this.skillSummary(skill.id, rank ? rank + 1 : 1)}</div>` : ''}</div>
      <button class="primary-button" data-learn="${skill.id}" ${reason ? 'disabled' : ''}>${icon('plus')}投入技能点</button><small class="learn-reason">${reason || `投入 ${hard} / 20 · 装备加成 +${rank - hard}`}</small>
      ${isAura(skill.id) ? `<button class="secondary-button ${h.activeAura === skill.id ? 'aura-active' : ''}" data-activate-aura="${skill.id}" ${rank ? '' : 'disabled'}>${icon('sun')}${h.activeAura === skill.id ? '关闭灵气' : '激活灵气'}</button>` : ''}
      ${Object.keys(skill.synergies).length ? `<div class="section-label">协同加成</div><ul class="synergy-list">${Object.entries(skill.synergies).map(([id, effect]) => `<li><span>${skillName(id as SkillId)} <b>${h.skills[id as SkillId]}</b></span><small>${effect}</small></li>`).join('')}</ul>` : ''}</div></div>
      <div class="section-label binding-heading"><span>技能配置</span><span>${h.classId==='paladin'?h.activeAura ? `当前灵气 · ${skillName(h.activeAura)}` : '无激活灵气':'被动技能自动生效'}</span></div><div class="binding-grid">${(Object.keys(h.bindings) as Skill[]).map(key => `<label><span>${bindingNames[key]}</span><select data-binding="${key}" aria-label="${bindingNames[key]}">${options.filter(id => key !== 'attack' || !isAura(id)).map(id => `<option value="${id}" ${h.bindings[key] === id ? 'selected' : ''}>${skillName(id)}</option>`).join('')}</select></label>`).join('')}</div></div>`;
  }
  runes() {
    const runes = this.game.hero.runes, count = (id: RuneId) => runes.filter(r => r === id).length;
    const recipes = RUNEWORDS.filter(word => this.recipeFilter !== 'ready' || word.runes.every(id => count(id) >= word.runes.filter(r => r === id).length));
    const pages = Math.max(1, Math.ceil(recipes.length / 4)); this.recipePage = Math.min(this.recipePage, pages - 1);
    return `<nav class="compact-tabs rune-pane-tabs" aria-label="符文视图"><button data-rune-pane="materials" aria-pressed="${this.runePane === 'materials'}">符文材料</button><button data-rune-pane="recipes" aria-pressed="${this.runePane === 'recipes'}">符文之语</button></nav><div class="rune-layout" data-rune-pane="${this.runePane}"><section><div class="section-label">符文材料 · 33 种</div><div class="rune-pouch">${RUNE_ORDER.map(id => {
      const recipe = runeUpgradeCost(id), owned = count(id), title = recipe ? `${recipe.count} ${runeLabel(id)}合成 1 ${runeLabel(recipe.next)}` : '';
      return `<div class="rune-entry ${owned ? '' : 'muted'}" data-rune="${id}">${runeArtwork(id)}<strong>${RUNES[id].name}</strong><small>${runeNumber(id)} · ${id.toUpperCase()}</small><b>${owned}</b>${recipe ? `<button class="rune-upgrade" data-upgrade-rune="${id}" ${tip(title)} ${owned < recipe.count ? 'disabled' : ''}>${icon('arrow-up')}</button>` : ''}</div>`;
    }).join('')}</div></section><section><div class="section-label recipe-heading"><span>符文之语 · ${recipes.length}</span><select data-recipe-filter="true" aria-label="符文之语筛选"><option value="all" ${this.recipeFilter === 'all' ? 'selected' : ''}>全部配方</option><option value="ready" ${this.recipeFilter === 'ready' ? 'selected' : ''}>符文齐备</option></select></div><div class="runeword-list">${recipes.map((word, index) => `<div ${Math.floor(index / 4) === this.recipePage ? '' : 'hidden'}><strong>${escape(word.name)}</strong><span class="rune-sequence">${word.runes.map(id => `<span>${RUNES[id].name}<small>${runeNumber(id)}</small></span>`).join('<i aria-hidden="true">›</i>')}</span><small>${escape(runewordBaseLabel(word))} · ${word.runes.length} 孔</small></div>`).join('') || '<span class="muted">暂无匹配配方</span>'}</div><nav class="recipe-pagination" aria-label="配方分页"><button data-recipe-page="${this.recipePage - 1}" ${this.recipePage === 0 ? 'disabled' : ''}>上一页</button><span>${this.recipePage + 1} / ${pages}</span><button data-recipe-page="${this.recipePage + 1}" ${this.recipePage + 1 === pages ? 'disabled' : ''}>下一页</button></nav></section></div>`;
  }
  inventory() {
    const h = this.game.hero, items = this.view === 'stash' ? h.stash : h.inventory, selected = [...h.inventory, ...h.stash, ...Object.values(h.equipment)].find(item => item?.id === this.ui.selectedItem);
    if (!selected && this.inventoryPane === 'details') this.inventoryPane = 'items';
    const equippedSlot = SLOTS.find(slot => h.equipment[slot]?.id === selected?.id), inStash = selected && h.stash.includes(selected), active = activeEquipment(h);
    const occupied = h.inventory.reduce((sum, item) => { const [w, height] = footprint(item); return sum + w * height; }, 0);
    const rows = this.view === 'stash' ? stashRows(items) : 4;
    const positions = packItems(items, rows);
    const equipment = `<div class="equipment-heading"><span>武器组 ${h.weaponSet + 1}</span><button data-action="swap-weapons" ${tip('切换武器组')}>${icon('arrow-left-right')}</button></div><div class="paperdoll">${SLOTS.map(slot => { const item = h.equipment[slot]; return `<div class="gear-position gear-${slot}"><span>${slotNames[slot]}</span><button class="gear-slot ${item?.rarity ?? ''} ${item && !active.includes(item) ? 'unusable' : ''} ${item?.id === this.ui.selectedItem ? 'selected' : ''}" ${item ? `data-item="${escape(item.id)}" ${tip(item.name)}` : `aria-label="${slotNames[slot]}未装备" disabled`}>${item ? itemVisual(item) : icon(({ weapon: 'sword', shield: 'shield', armor: 'shirt', helm: 'crown', gloves: 'hand', belt: 'rectangle-ellipsis', boots: 'footprints', amulet: 'gem', ring: 'circle', ring2: 'circle' })[slot])}${item?.durability === 0 ? `<small>损坏</small>` : ''}</button></div>`; }).join('')}</div>`;
    const tabs = `<div class="character-tabs bag-tabs" role="tablist" aria-label="物品容器">${(['inventory', 'stash', 'runes'] as const).map(view => `<button role="tab" aria-selected="${this.view === view}" data-bag-view="${view}">${icon(view === 'inventory' ? 'backpack' : view === 'stash' ? 'archive' : 'gem')}${({ inventory: '背包', stash: '私人仓库', runes: '符文' })[view]}</button>`).join('')}</div>`;
    const grid = this.view === 'runes' ? this.runes() : `<div class="section-label"><span>${this.view === 'stash' ? '私人仓库' : '背包'}</span><span>${this.view === 'stash' ? `${items.length} 件` : `${occupied} / 40 格`}</span></div><div class="inventory-grid-scroll"><div class="diablo-grid" data-container="${this.view}" data-rows="${rows}" style="--rows:${rows}" aria-label="${this.view === 'stash' ? '仓库' : '背包'}物品">${items.map((item, i) => { const p = positions?.get(item.id) ?? { x: i % 10, y: Math.floor(i / 10), width: 1, height: 1 }; return `<button draggable="false" aria-roledescription="可移动装备" aria-keyshortcuts="Space Enter ArrowLeft ArrowRight ArrowUp ArrowDown Escape" class="bag-item ${item.rarity} ${item.id === this.ui.selectedItem ? 'selected' : ''}" style="grid-column:${p.x + 1}/span ${p.width};grid-row:${p.y + 1}/span ${p.height}" data-item="${escape(item.id)}" ${tip(item.identified === false ? `未鉴定 ${item.base ?? item.name}` : item.name)}>${itemVisual(item)}${item.identified === false ? '<b class="unidentified-mark">?</b>' : ''}${item.sockets ? `<small>${filledSockets(item)}/${item.sockets}</small>` : ''}</button>`; }).join('')}</div></div><span class="inventory-move-status" role="status" aria-live="polite" aria-atomic="true"></span>`;
    let details = `<div class="empty-detail">${icon('shield-check')}<span>${CLASSES[h.classId].name}装备</span><small>${active.length} 件生效 · 武器组 ${h.weaponSet + 1}</small></div>`;
    if (selected) {
      const identified = selected.identified !== false, reason = equipReason(h, selected), mods = identified ? itemMods(selected) : {}, slot = equippedSlot;
      const affixes = identified ? itemModifierLines(selected) : [], affixPages = Math.max(1, Math.ceil(affixes.length / 6));
      if (this.detailItem !== selected.id) { this.detailItem = selected.id; this.affixPage = 0; this.itemTab = affixes.length ? 'affixes' : 'overview'; }
      this.affixPage = Math.min(this.affixPage, affixPages - 1);
      let comparison = '';
      if (!slot && !inStash && identified && !selected.charm && !reason) { const clone = structuredClone(h); if (equipItem(clone, selected.id)) { const current = stats(h), next = stats(clone); comparison = `<div class="item-comparison">${([['伤害', next.attack - current.attack], ['防御', next.defense - current.defense], ['生命', next.maxHp - current.maxHp], ['格挡', next.block - current.block]] as [string, number][]).filter(([, value]) => Math.abs(value) > .01).map(([label, value]) => `<span class="${value > 0 ? 'positive' : 'negative'}">${label} ${value > 0 ? '+' : ''}${number(value)}</span>`).join('')}</div>`; } }
      details = `<nav class="item-detail-tabs" aria-label="物品详情分类">${(['overview','affixes','sockets'] as const).map(tab => `<button data-item-tab="${tab}" aria-pressed="${this.itemTab === tab}" ${tab === 'affixes' && !identified || tab === 'sockets' && !selected.sockets ? 'disabled' : ''}>${({overview:'属性',affixes:'词缀',sockets:'镶嵌'})[tab]}</button>`).join('')}</nav><div class="item-detail-scroll"><span class="rarity-tag ${selected.rarity}">${rarityNames[selected.rarity]} · ${selected.misc ? '杂物' : selected.charm ? selected.charmSize ? CHARM_BASES[selected.charmSize].name : '护身符' : selected.jewel ? '珠宝' : slotNames[selected.slot]}</span><div class="item-showcase ${selected.rarity}">${itemVisual(selected)}</div><h3 class="${selected.rarity}">${escape(identified ? selected.name : `未鉴定 ${selected.base ?? selected.name}`)}</h3>${selected.base && selected.base !== selected.name ? `<small>${escape(selected.base)}</small>` : ''}
      <dl class="item-basics" ${this.itemTab === 'overview' ? '' : 'hidden'}>${selected.slot === 'weapon' ? `<div><dt>${rangedBase(selected)?.stack ? '投掷' : selected.twoHanded ? '双手' : '单手'}伤害</dt><dd>${itemWeaponDamage(selected, h.level, mods)}</dd></div>` : !selected.charm && !['ring', 'ring2', 'amulet'].includes(selected.slot) ? `<div><dt>防御</dt><dd>${Math.floor(selected.power * (1 + (mods.enhancedDefense ?? 0) / 100) + (mods.defense ?? 0) + (mods.defensePerLevel ?? 0) * h.level)}</dd></div>` : ''}${selected.block ? `<div><dt>盾牌格挡</dt><dd>${selected.block + (mods.block ?? 0)}%</dd></div>` : ''}${selected.maxDurability ? `<div><dt>耐久度</dt><dd>${mods.indestructible ? '无法破坏' : `${selected.durability} / ${selected.maxDurability}`}</dd></div>` : ''}${rangedBase(selected) ? '<div><dt>弹药</dt><dd>无限</dd></div>' : ''}<div><dt>物品等级</dt><dd>${selected.level}</dd></div><div><dt>需要等级</dt><dd>${selected.requiredLevel ?? 1}</dd></div>${selected.requiredStrength ? `<div><dt>需要力量</dt><dd>${identified ? itemRequirements(selected).strength : selected.requiredStrength}</dd></div>` : ''}${selected.requiredDexterity ? `<div><dt>需要敏捷</dt><dd>${identified ? itemRequirements(selected).dexterity : selected.requiredDexterity}</dd></div>` : ''}</dl>
      ${selected.requiredClass ? `<small>仅限${CLASS_NAMES[selected.requiredClass]}</small>` : ''}
      ${identified ? `<div class="item-affix-panel" ${this.itemTab === 'affixes' ? '' : 'hidden'}><label class="affix-range-toggle"><input type="checkbox" data-affix-ranges ${this.showRanges ? 'checked' : ''}/>显示词缀浮动范围</label><ul class="item-affixes">${affixes.map((line, index) => `<li ${Math.floor(index / 6) === this.affixPage ? '' : 'hidden'}>${escape(line.text)}${line.range ? `<small class="affix-range">变量 ${escape(line.range)}</small>` : ''}</li>`).join('')}</ul><nav class="affix-pagination" aria-label="词缀分页" ${affixPages > 1 ? '' : 'hidden'}><button data-affix-page="${this.affixPage - 1}" ${this.affixPage === 0 ? 'disabled' : ''}>上一页</button><span>${this.affixPage + 1} / ${affixPages}</span><button data-affix-page="${this.affixPage + 1}" ${this.affixPage + 1 === affixPages ? 'disabled' : ''}>下一页</button></nav></div>${selected.setId ? `<div class="set-bonuses">${escape(itemSetName(selected) ?? '')}${selected.setId === 'sigon' ? '<br>2 件：10% 生命偷取<br>3 件：100 防御<br>6 件：20 法力、12% 火抗、7 点物理减伤' : ''}</div>` : ''}` : ''}
      ${selected.sockets ? `<div class="item-socket-panel" ${this.itemTab === 'sockets' ? '' : 'hidden'}><div class="socket-row">${(selected.runes ?? []).map(id => `<span class="socket-rune" ${tip(runeLabel(id))}>${runeArtwork(id)}<b>${runeNumber(id)}</b><small>${RUNES[id].name}</small></span>`).join('')}${(selected.socketedJewels ?? []).map(jewel => `<span ${tip(jewel.name)}>${icon('gem')}</span>`).join('')}${Array(Math.max(0, selected.sockets - filledSockets(selected))).fill('<span class="socket-empty">空</span>').join('')}</div>${!slot && identified && filledSockets(selected) < selected.sockets ? `<label class="socket-label">镶嵌符文</label><div class="socket-options">${[...new Set(h.runes)].map(id => `<button data-socket="${id}" ${tip(`镶嵌${runeLabel(id)}`)}>${runeArtwork(id)}<span>${RUNES[id].name}<small>${runeNumber(id)}</small></span></button>`).join('') || '<small>尚无符文</small>'}</div><div class="socket-options">${[...h.inventory, ...h.stash].filter(item => item.jewel && item.identified !== false).map(item => `<button data-socket-jewel="${escape(item.id)}" ${tip(`镶嵌${item.name}`)}>${icon('gem')}${escape(item.name)}</button>`).join('')}</div>` : ''}</div>` : ''}${comparison}</div><div class="item-actions">
      ${!identified ? `<button class="primary-button" data-identify="${escape(selected.id)}" ${h.gold >= IDENTIFY_COST ? '' : 'disabled'}>${icon('scan-eye')}鉴定 · ${IDENTIFY_COST} 金币</button>` : ''}
      ${slot ? `<span class="equipped-label">已装备${!active.includes(selected) ? ' · 需求未满足' : ''}</span><button class="secondary-button" data-unequip="${slot}">${icon('backpack')}卸下</button>` : inStash ? `<button class="primary-button" data-withdraw="${escape(selected.id)}">${icon('arrow-down')}取回背包</button><button class="text-button" data-salvage="${escape(selected.id)}">${icon('coins')}出售 · ${selected.value}</button>` : `<button class="primary-button" data-equip="${escape(selected.id)}" ${reason ? 'disabled' : ''}>${icon('sword')}装备</button>${selected.slot === 'ring' ? `<button class="secondary-button" data-equip-ring="${escape(selected.id)}" ${reason ? 'disabled' : ''}>${icon('circle')}装备到右戒指</button>` : ''}<small class="learn-reason">${reason}</small><button class="secondary-button" data-stash="${escape(selected.id)}">${icon('archive')}存入仓库</button><button class="text-button" data-salvage="${escape(selected.id)}">${icon('coins')}出售 · ${selected.value}</button>`}</div>`;
    }
    return `<div class="inventory-screen" data-inventory-pane="${this.inventoryPane}"><nav class="compact-tabs inventory-pane-tabs" aria-label="行囊视图">${(['items','equipment','details'] as const).map(pane => `<button data-inventory-pane="${pane}" aria-pressed="${this.inventoryPane === pane}" ${pane === 'details' && !selected ? 'disabled' : ''}>${({items:'物品',equipment:'装备',details:'详情'})[pane]}</button>`).join('')}</nav><div class="paladin-inventory" data-view="${this.view}"><div class="gear-column">${equipment}<div class="inventory-gold">${icon('coins')}${h.gold.toLocaleString()}</div></div><div class="bag-column">${tabs}${grid}<div class="bag-utilities"><button class="text-button" data-action="repair" ${h.gold >= repairCost(h) && repairCost(h) > 0 ? '' : 'disabled'}>${icon('wrench')}修理 ${repairCost(h)}</button></div></div><div class="item-details ${this.showRanges ? 'show-ranges' : ''}">${details}</div></div></div>`;
  }
}
