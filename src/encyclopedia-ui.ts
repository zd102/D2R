import type { UI } from './ui.ts';
import { ENCYCLOPEDIA_ITEMS, ENCYCLOPEDIA_MONSTERS, ITEM_KINDS, MONSTER_RANKS, RACE_NAMES, encyclopediaItem, encyclopediaMonster, filterEncyclopediaItems, filterEncyclopediaMonsters, encyclopediaItemPreview, itemDropSources, recipeBases, type EncyclopediaItem, type EncyclopediaMonster } from './encyclopedia.ts';
import { EncyclopediaPreview } from './encyclopedia-preview.ts';
import { SLOTS, slotNames, rarityNames, RUNES, AVAILABLE_RUNEWORDS as RUNEWORDS, RUNE_ORDER, SPECIAL_ITEMS, DROP_RATES, itemMods, itemRequirements, isAvailableItem, type Item, type Mods } from './items.ts';
import { CLASS_NAMES, itemSetName, runewordBaseLabel } from './item-catalog.ts';
import { itemVisual, runeArtwork } from './item-art.ts';
import { runeNumber, runeLabel } from './items.ts';
import { itemModifierLines, itemWeaponDamage } from './item-description.ts';
import { ACTS } from './campaign.ts';
import { ENCYCLOPEDIA_AREAS as LEVELS } from './encyclopedia.ts';
import { difficultyNames, damageTypeNames } from './model.ts';
import { monsterStats } from './balance.ts';
import { ATTACKS } from './monster-combat.ts';
import { monsterTactic, TACTIC_DESCRIPTIONS } from './bestiary.ts';
import { BOSS_DROP_PROFILES, bossDropLabel, bossSpecialPool } from './boss-loot.ts';
import { runeUpgradeCost } from './loot.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const number = (value: number) => Number.isInteger(value) ? value.toLocaleString('zh-CN') : value.toFixed(1);
const percent = (value: number) => `${Number((value * 100).toFixed(1))}%`;
const statsList = (rows: [string, string | number][]) => `<dl class="encyclopedia-stats">${rows.map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${typeof value === 'number' ? number(value) : escape(value)}</dd></div>`).join('')}</dl>`;
const modsList = (item: Item) => `<ul class="encyclopedia-mods">${itemModifierLines(item).map(line => `<li>${escape(line.text)}${line.range ? `<small class="affix-range">变量 ${escape(line.range)}</small>` : ''}</li>`).join('')}</ul>`;
const standaloneMods = (mods: Mods) => modsList({ id: 'encyclopedia-mods', name: '', slot: 'amulet', rarity: 'common', level: 1, value: 0, power: 0, mods });
const select = (id: string, label: string, value: string, options: Record<string, string>) => `<label class="encyclopedia-filter"><span>${label}</span><select id="encyclopedia-${id}" data-encyclopedia-filter="${id}" aria-label="${label}">${Object.entries(options).map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>`;
const PAGE_SIZE = 24;
type View = 'items' | 'monsters';
type Filters = { query: string; category: string; slot: string; sort: string; act: string; race: string; page: number; selected?: string };
const emptyFilters = (): Filters => ({ query: '', category: 'all', slot: 'all', sort: 'default', act: 'all', race: 'all', page: 0 });
type Location = { view: View; items: Filters; monsters: Filters; difficulty: number; area: number; recipeBase: string; detail: boolean };

export class EncyclopediaScreen {
  private ui: UI;
  private view: View = 'items';
  private items = emptyFilters();
  private monsters = emptyFilters();
  private difficulty = 0;
  private area = -1;
  private recipeBase = '';
  private detail = false;
  private history: Location[] = [];
  private preview?: EncyclopediaPreview;
  constructor(ui: UI) {
    this.ui = ui;
    ui.overlay.addEventListener('click', event => {
      if (ui.panel !== 'encyclopedia') return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
      const data = button.dataset;
      if (data.encyclopediaView) { this.view = data.encyclopediaView as View; this.detail = false; this.history = []; this.render(); }
      if (data.encyclopediaEntry) { this.filters.selected = data.encyclopediaEntry; this.area = -1; this.recipeBase = ''; this.detail = true; this.renderSelection(); }
      if (data.encyclopediaPage) { this.filters.page += Number(data.encyclopediaPage); this.refreshResults(true); }
      if (data.encyclopediaLink) this.follow(data.encyclopediaLink, data.encyclopediaTarget as View);
      if (data.encyclopediaDifficulty) { this.difficulty = Number(data.encyclopediaDifficulty); this.renderDetail(); }
      switch (data.encyclopediaAction) {
        case 'exit': this.ui.openPanel('profiles'); break;
        case 'list': this.detail = false; this.renderSelection(); this.ui.overlay.querySelector<HTMLButtonElement>('.encyclopedia-entry[aria-current="true"]')?.focus({ preventScroll: true }); break;
        case 'clear': Object.assign(this.filters, emptyFilters()); this.detail = false; this.render(); this.ui.overlay.querySelector<HTMLInputElement>('#encyclopedia-query')?.focus(); break;
        case 'back': { const location = this.history.pop(); if (location) { Object.assign(this, location); this.render(); } break; }
        case 'rotate': this.preview?.reset(); break;
        case 'animate': this.preview?.toggle(); button.innerHTML = icon(this.preview?.paused ? 'play' : 'pause'); button.setAttribute('aria-label', this.preview?.paused ? '播放预览动画' : '暂停预览动画'); button.dataset.tip = button.getAttribute('aria-label')!; this.ui.refreshIcons(); break;
      }
    });
    ui.overlay.addEventListener('input', event => {
      if (ui.panel !== 'encyclopedia' || !(event.target instanceof HTMLInputElement) || event.target.id !== 'encyclopedia-query') return;
      this.filters.query = event.target.value; this.filters.page = 0; this.refreshResults();
    });
    ui.overlay.addEventListener('change', event => {
      if (ui.panel !== 'encyclopedia' || !(event.target instanceof HTMLSelectElement)) return;
      const select = event.target, key = select.dataset.encyclopediaFilter;
      if (key && ['category', 'slot', 'sort', 'act', 'race'].includes(key)) {
        Object.assign(this.filters, { [key]: select.value, page: 0 });
        if (key === 'category' && ['rune', 'supply'].includes(select.value)) this.filters.slot = 'all';
        this.refreshResults();
      }
      if (select.id === 'encyclopedia-area') { this.area = Number(select.value); this.renderDetail(); }
      if (select.id === 'encyclopedia-base') { this.recipeBase = select.value; this.renderDetail(); }
    });
    ui.overlay.addEventListener('keydown', event => {
      if (ui.panel !== 'encyclopedia') return;
      const target = event.target as HTMLElement;
      if (target.closest('.encyclopedia-tabs') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); this.view = this.view === 'items' ? 'monsters' : 'items'; this.detail = false; this.render();
        ui.overlay.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
      }
      if (!target.closest('.encyclopedia-results') || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const entries = this.results(), current = entries.findIndex(entry => entry.id === this.filters.selected);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
      if (!entries[next]) return;
      this.filters.selected = entries[next].id; this.filters.page = Math.floor(next / PAGE_SIZE); this.area = -1; this.refreshResults();
      ui.overlay.querySelector<HTMLButtonElement>('.encyclopedia-entry[aria-current="true"]')?.focus();
    });
    let compact = innerWidth <= 700;
    window.addEventListener('resize', () => { const next = innerWidth <= 700; if (ui.panel === 'encyclopedia' && next !== compact) this.renderSelection(false); compact = next; });
  }
  private get filters() { return this.view === 'items' ? this.items : this.monsters; }
  private results(): (EncyclopediaItem | EncyclopediaMonster)[] {
    const f = this.filters;
    return this.view === 'items' ? filterEncyclopediaItems(f.query, f.category, ['rune', 'supply'].includes(f.category) ? 'all' : f.slot, f.sort) : filterEncyclopediaMonsters(f.query, f.category, f.act, f.race);
  }
  private follow(id: string, view: View) {
    if (view === 'items' ? !encyclopediaItem(id) : !encyclopediaMonster(id)) return;
    this.history.push({ view: this.view, items: { ...this.items }, monsters: { ...this.monsters }, difficulty: this.difficulty, area: this.area, recipeBase: this.recipeBase, detail: this.detail });
    this.view = view; Object.assign(this.filters, emptyFilters(), { selected: id });
    const index = this.results().findIndex(entry => entry.id === id); this.filters.page = Math.floor(index / PAGE_SIZE);
    this.area = -1; this.recipeBase = ''; this.detail = true; this.render();
  }
  private link(id: string, name: string, view: View, meta = '') {
    return `<button class="encyclopedia-related" data-encyclopedia-link="${escape(id)}" data-encyclopedia-target="${view}"><span>${escape(name)}${meta ? `<small>${escape(meta)}</small>` : ''}</span>${icon('chevron-right')}</button>`;
  }
  dispose() { this.preview?.dispose(); this.preview = undefined; }
  render() {
    this.dispose();
    this.ui.overlay.classList.remove('profile-overlay'); this.ui.overlay.classList.add('encyclopedia-overlay');
    const f = this.filters, slots = Object.fromEntries([['all', '全部部位'], ...SLOTS.filter(slot => slot !== 'ring2').map(slot => [slot, slot === 'weapon' ? '武器' : slotNames[slot]])]);
    this.ui.overlay.innerHTML = `<section class="encyclopedia-screen" role="dialog" aria-modal="true" aria-label="百科">
      <header class="encyclopedia-header"><img src="/sigil.svg" alt=""/><div><small>SANCTUARY ARCHIVES</small><h2>百科</h2></div><button class="encyclopedia-exit" data-encyclopedia-action="exit" aria-label="返回角色选择" data-tip="返回角色选择">${icon('arrow-left')}<span>角色选择</span></button></header>
      <div class="encyclopedia-tabs" role="tablist" aria-label="百科分类">${(['items', 'monsters'] as const).map(view => `<button id="encyclopedia-tab-${view}" role="tab" aria-selected="${view === this.view}" aria-controls="encyclopedia-content" data-encyclopedia-view="${view}">${icon(view === 'items' ? 'book-open' : 'skull')}<span>${view === 'items' ? '装备 / 物品' : '怪物'}</span><b>${view === 'items' ? ENCYCLOPEDIA_ITEMS.length : ENCYCLOPEDIA_MONSTERS.length}</b></button>`).join('')}<span class="encyclopedia-edition">毁灭之王 · 五幕战役</span></div>
      <div id="encyclopedia-content" role="tabpanel" aria-labelledby="encyclopedia-tab-${this.view}" class="encyclopedia-content">
        <div class="encyclopedia-filters"><label class="encyclopedia-search">${icon('search')}<input id="encyclopedia-query" type="search" autocomplete="off" placeholder="${this.view === 'items' ? '搜索物品名称 / 符文' : '搜索怪物名称 / 地点'}" aria-label="${this.view === 'items' ? '搜索装备或物品' : '搜索怪物'}" value="${escape(f.query)}"/></label>
        ${this.view === 'items' ? select('category', '物品分类', f.category, ITEM_KINDS) + select('slot', '装备部位', f.slot, slots) + select('sort', '排序', f.sort, { default: '目录顺序', level: '需求等级', name: '名称' }) : select('category', '怪物类型', f.category, MONSTER_RANKS) + select('act', '出现章节', f.act, Object.fromEntries([['all', '全部章节'], ...ACTS.map((act, index) => [String(index), `第 ${index + 1} 章 · ${act.region}`])])) + select('race', '种族', f.race, { all: '全部种族', ...RACE_NAMES })}</div>
        <div class="encyclopedia-columns"><div class="encyclopedia-index"><div class="encyclopedia-result-heading"><span id="encyclopedia-count" role="status" aria-live="polite"></span><button data-encyclopedia-action="clear" aria-label="重置筛选" data-tip="重置筛选">${icon('filter-x')}</button></div><div class="encyclopedia-results" aria-label="${this.view === 'items' ? '物品条目' : '怪物条目'}"></div><nav class="encyclopedia-pagination" aria-label="图鉴分页"></nav></div><article class="encyclopedia-detail" aria-label="条目详情"></article></div>
      </div></section>`;
    this.refreshResults();
  }
  private refreshResults(selectFirst = false) {
    const entries = this.results(), f = this.filters, pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    f.page = Math.max(0, Math.min(pages - 1, f.page));
    const visible = entries.slice(f.page * PAGE_SIZE, (f.page + 1) * PAGE_SIZE);
    if (selectFirst || !visible.some(entry => entry.id === f.selected)) { f.selected = visible[0]?.id; this.area = -1; this.recipeBase = ''; }
    this.ui.overlay.querySelector('#encyclopedia-count')!.textContent = `${entries.length.toLocaleString()} 条记录`;
    const slots = this.ui.overlay.querySelector<HTMLSelectElement>('#encyclopedia-slot'); if (slots) { slots.disabled = ['rune', 'supply'].includes(f.category); slots.value = f.slot; }
    const results = this.ui.overlay.querySelector<HTMLElement>('.encyclopedia-results')!;
    results.innerHTML = visible.map(entry => {
      const item = 'kind' in entry ? entry : undefined, monster = 'rank' in entry ? entry : undefined;
      const secondary = item ? `${ITEM_KINDS[item.kind]}${item.special?.base ? ` · ${item.special.base}` : item.base?.charm ? ' · 护身符' : ''}` : `${MONSTER_RANKS[monster!.rank]} · ${RACE_NAMES[monster!.definition.race]}`;
      const preview = item && encyclopediaItemPreview(item);
      const art = preview ? itemVisual(preview) : item?.rune ? runeArtwork(item.rune) : icon(item?.icon ?? (monster!.rank === 'actBoss' ? 'crown' : 'skull'));
      return `<button class="encyclopedia-entry ${item?.kind ?? monster?.rank}" data-encyclopedia-entry="${escape(entry.id)}" aria-current="${entry.id === f.selected}"><span class="encyclopedia-entry-icon">${art}</span><span><strong>${escape(entry.name)}</strong><small>${item?.rune ? `${runeNumber(item.rune)} · ` : ''}${escape(secondary)}</small></span><b>${item ? `Lv. ${item.level}` : monster!.areas.length ? `第 ${[...new Set(monster!.areas.map(index => LEVELS[index].act + 1))].join('/')} 章` : ''}</b></button>`;
    }).join('') || `<div class="encyclopedia-empty">${icon('search')}<h3>没有匹配的条目</h3><button class="text-button" data-encyclopedia-action="clear">重置筛选</button></div>`;
    this.ui.overlay.querySelector('.encyclopedia-pagination')!.innerHTML = `<button data-encyclopedia-page="-1" aria-label="上一页" data-tip="上一页" ${f.page === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><span>${f.page + 1} / ${pages}</span><button data-encyclopedia-page="1" aria-label="下一页" data-tip="下一页" ${f.page + 1 >= pages ? 'disabled' : ''}>${icon('chevron-right')}</button>`;
    results.scrollTop = 0; this.renderSelection(false);
  }
  private renderSelection(focus = true) {
    this.ui.overlay.querySelector('.encyclopedia-screen')?.classList.toggle('has-detail', this.detail && !!this.filters.selected);
    this.ui.overlay.querySelectorAll<HTMLElement>('[data-encyclopedia-entry]').forEach(element => element.setAttribute('aria-current', String(element.dataset.encyclopediaEntry === this.filters.selected)));
    this.renderDetail();
    if (focus && this.detail) this.ui.overlay.querySelector<HTMLElement>('.encyclopedia-detail h3')?.focus({ preventScroll: true });
  }
  private difficultyControl() {
    return `<div class="encyclopedia-difficulty" role="group" aria-label="图鉴难度">${difficultyNames.map((name, value) => `<button aria-pressed="${this.difficulty === value}" data-encyclopedia-difficulty="${value}">${name}</button>`).join('')}</div>`;
  }
  private renderDetail() {
    const host = this.ui.overlay.querySelector<HTMLElement>('.encyclopedia-detail'); if (!host) return;
    const entry = this.view === 'items' ? encyclopediaItem(this.filters.selected ?? '') : encyclopediaMonster(this.filters.selected ?? '');
    host.innerHTML = `<div class="encyclopedia-detail-nav"><button class="encyclopedia-list-back" data-encyclopedia-action="list">${icon('arrow-left')}返回列表</button>${this.history.length ? `<button data-encyclopedia-action="back">${icon('undo-2')}返回上一条目</button>` : ''}</div>` + (entry ? 'kind' in entry ? this.itemDetail(entry) : this.monsterDetail(entry) : `<div class="encyclopedia-empty">${icon('book-open')}<span>暂无条目</span></div>`);
    host.scrollTop = 0; this.ui.refreshIcons();
    if (entry && 'definition' in entry && (innerWidth > 700 || this.detail)) {
      const model = host.querySelector<HTMLElement>('.encyclopedia-model-stage')!;
      try { this.preview ??= new EncyclopediaPreview(); this.preview.mount(model, entry.definition, entry.rank !== 'monster', entry.name); }
      catch { this.dispose(); model.innerHTML = `<div class="encyclopedia-empty">${icon('skull')}<span>模型暂不可用</span></div>`; this.ui.refreshIcons(); }
    } else this.dispose();
  }
  private itemDetail(entry: EncyclopediaItem) {
    const item = encyclopediaItemPreview(entry, this.recipeBase), mods = item ? itemMods(item) : {};
    const type = item?.charm ? '护身符' : item?.jewel ? '珠宝' : item ? slotNames[item.slot] : ITEM_KINDS[entry.kind];
    let body = `<div class="encyclopedia-item-heading ${entry.kind}"><div class="encyclopedia-art">${item ? itemVisual(item) : entry.rune ? runeArtwork(entry.rune) : icon(entry.icon)}</div><div><span>${ITEM_KINDS[entry.kind]} · ${type}</span><h3 tabindex="-1">${escape(entry.name)}</h3><small>${escape(entry.english)}</small>${entry.rune ? `<div class="encyclopedia-rune-number">${runeNumber(entry.rune)}</div>` : ''}${item?.base && item.base !== entry.name ? `<p>${escape(item.base)}</p>` : ''}</div></div>`;
    if (entry.rune) {
      const rune = RUNES[entry.rune], upgrade = runeUpgradeCost(entry.rune);
      body += statsList([['符文序号', runeNumber(entry.rune)], ['需求等级', rune.level]]);
      body += `<div class="encyclopedia-rune-effects">${(['weapon', 'armor', 'shield'] as const).map(slot => `<section><h4>${slot === 'weapon' ? '武器' : slot === 'armor' ? '铠甲 / 头盔' : '盾牌'}</h4>${standaloneMods(rune[slot])}</section>`).join('')}</div>`;
      if (upgrade) body += `<h4>符文合成</h4>${this.link(`rune-${upgrade.next}`, `${upgrade.count} ${runeLabel(entry.rune)} → ${runeLabel(upgrade.next)}`, 'items')}`;
      body += `<details class="encyclopedia-related-group"><summary>相关符文之语 · ${RUNEWORDS.filter(word => word.runes.includes(entry.rune!)).length}</summary>${RUNEWORDS.filter(word => word.runes.includes(entry.rune!)).map(word => this.link(`word-${word.catalogId}`, word.name, 'items', word.runes.map(runeLabel).join(' · '))).join('')}</details>`;
    } else if (entry.supply !== undefined) {
      body += statsList([['售价', '25 金币'], ['获得方式', '旅者补给 / 怪物掉落'], ['持续恢复', entry.supply === 0 ? '160 生命' : '80 法力'], ['持有上限', 99]]);
    } else if (item) {
      if (entry.word) {
        body += `<div class="encyclopedia-recipe">${entry.word.runes.map((rune, index) => `<button data-encyclopedia-link="rune-${rune}" data-encyclopedia-target="items" aria-label="第 ${index + 1} 孔 · ${runeLabel(rune)}"><small class="rune-order">${index + 1}</small>${runeArtwork(rune)}<span>${RUNES[rune].name}<b>${runeNumber(rune)}</b></span></button>`).join('')}</div><label class="encyclopedia-base-select"><span>符文之语底材 · ${entry.word.runes.length} 孔</span><select id="encyclopedia-base" aria-label="符文之语底材">${recipeBases(entry.word).map(base => `<option value="${escape(base.name)}" ${base.name === item.base ? 'selected' : ''}>${escape(base.name)}</option>`).join('')}</select></label><p class="encyclopedia-muted">${escape(runewordBaseLabel(entry.word))}</p>`;
      }
      const requirements = itemRequirements(item), rows: [string, string | number][] = [['需求等级', item.requiredLevel ?? 1]];
      if (item.slot === 'weapon') rows.push([item.twoHanded ? '双手伤害' : '单手伤害', itemWeaponDamage(item, 1, mods)]);
      else if (!['amulet', 'ring', 'ring2'].includes(item.slot)) rows.push(['防御', Math.floor(item.power * (1 + (mods.enhancedDefense ?? 0) / 100) + (mods.defense ?? 0))]);
      if (requirements.strength) rows.push(['需要力量', requirements.strength]); if (requirements.dexterity) rows.push(['需要敏捷', requirements.dexterity]);
      if (item.requiredClass) rows.push(['专属职业', CLASS_NAMES[item.requiredClass]]);
      if (item.block) rows.push(['盾牌格挡', `${item.block + (mods.block ?? 0)}%`]);
      if (entry.special?.qualityLevel !== undefined && !entry.special.eventOnly) rows.push(['暗金 / 套装等级', entry.special.qualityLevel]);
      if (entry.base?.sockets) rows.push(['最大孔数', entry.base.sockets]); else if (item.sockets) rows.push(['孔数', item.sockets]);
      rows.push(['占用空间', `${item.width ?? 2} × ${item.height ?? 2}`]);
      body += statsList(rows);
      if (Object.keys(mods).length) body += `<h4>装备属性</h4>${modsList(item)}`;
      if (item.setId) body += `<details class="encyclopedia-related-group" open><summary>${escape(itemSetName(item) ?? '')}</summary>${SPECIAL_ITEMS.filter(template => isAvailableItem(template) && template.setId === item.setId).map(template => this.link(template.catalogId!, template.name, 'items', template.base)).join('')}</details>`;
      if (entry.base) {
        const variants = SPECIAL_ITEMS.filter(template => template.baseCode === entry.base!.baseCode);
        if (variants.length) body += `<details class="encyclopedia-related-group" open><summary>暗金与套装变体 · ${variants.length}</summary>${variants.map(template => this.link(template.catalogId!, template.name, 'items', rarityNames[template.rarity])).join('')}</details>`;
      }
    }
    if (entry.kind !== 'runeword' && entry.kind !== 'supply') {
      const sources = itemDropSources(entry, this.difficulty);
      const sourceNames = { regular: '可掉落', favored: '额外暗金池', event: '专属护符 · 0.5%', countess: '专用符文池', forge: '熔炉首通 · 1/11' };
      body += `<div class="encyclopedia-section-heading"><h4>首领来源</h4>${this.difficultyControl()}</div><div class="encyclopedia-sources">${sources.map(source => this.link(source.monsterId, LEVELS[source.area].boss, 'monsters', `${LEVELS[source.area].name} · ${sourceNames[source.kind]}`)).join('') || `<p class="encyclopedia-muted">${difficultyNames[this.difficulty]}暂无首领掉落来源</p>`}</div>`;
    }
    return body;
  }
  private monsterDetail(entry: EncyclopediaMonster) {
    const areas = entry.areas.filter(index => this.monsters.act === 'all' || LEVELS[index].act === Number(this.monsters.act));
    const available = areas.length ? areas : entry.areas;
    if (!available.includes(this.area)) this.area = available[0] ?? 0;
    const area = LEVELS[this.area], boss = entry.rank !== 'monster', values = monsterStats(entry.definition, area, this.difficulty, boss), rates = DROP_RATES[entry.rank];
    const animationLabel = this.preview?.paused ? '播放预览动画' : '暂停预览动画';
    let body = `<div class="encyclopedia-monster-heading"><span>${MONSTER_RANKS[entry.rank]} · ${RACE_NAMES[entry.definition.race]}</span><h3 tabindex="-1">${escape(entry.name)}</h3><small>${entry.id}</small></div><div class="encyclopedia-model-stage"></div><div class="encyclopedia-model-tools"><button data-encyclopedia-action="animate" aria-label="${animationLabel}" data-tip="${animationLabel}">${icon(this.preview?.paused ? 'play' : 'pause')}</button><button data-encyclopedia-action="rotate" aria-label="重置视角" data-tip="重置视角">${icon('rotate-ccw')}</button></div>
      <div class="encyclopedia-section-heading"><h4>战斗数据</h4>${this.difficultyControl()}</div><label class="encyclopedia-base-select"><span>出现地点</span><select id="encyclopedia-area" aria-label="怪物出现地点">${available.map(index => `<option value="${index}" ${index === this.area ? 'selected' : ''}>第 ${LEVELS[index].act + 1} 章 · ${LEVELS[index].name}</option>`).join('')}</select></label>`;
    body += statsList([['等级', values.level], ['生命', values.maxHp], ['基础伤害', Number(values.damage.toFixed(1))], ['防御', values.defense], ['准确率', values.attackRating], ['移动速度', entry.definition.speed]]);
    body += `<h4>抗性</h4><div class="encyclopedia-resistances">${Object.entries(values.resistances).map(([type, value]) => `<div class="resist-${type}"><span>${damageTypeNames[type as keyof typeof damageTypeNames]}</span><b>${value}%</b></div>`).join('')}</div>`;
    body += `<h4>战斗招式</h4><dl class="encyclopedia-attacks">${entry.definition.attacks.map(id => { const attack = ATTACKS[id]; return `<div><dt>${escape(attack.name)}<small>${damageTypeNames[attack.type]}</small></dt><dd>预警 ${attack.windup} 秒 · 间隔 ${attack.cooldown} 秒${attack.damage ? ` · ${number(values.damage * attack.damage)} 伤害` : ''}</dd></div>`; }).join('')}</dl>`;
    body += `<h4>行为模式</h4><p class="encyclopedia-muted">${TACTIC_DESCRIPTIONS[monsterTactic(entry.definition)]}</p>`;
    if (entry.definition.revive) body += this.link(entry.definition.revive, `复活：${encyclopediaMonster(entry.definition.revive)?.name ?? entry.definition.revive}`, 'monsters');
    if (entry.definition.retaliation) body += `<p class="encyclopedia-muted">受击反击：闪电</p>`;
    body += `<h4>基础战利品</h4>${statsList([['装备判定', entry.rank === 'actBoss' ? '2 件基础装备' : percent(rates.equipment)], ['符文判定', percent(rates.rune)], ['魔法护符', percent(rates.charm)]])}`;
    if (boss) {
      const profile = BOSS_DROP_PROFILES[this.area], pool = bossSpecialPool(profile, values.level, this.difficulty);
      body += `<div class="encyclopedia-section-heading"><h4>特殊掉落</h4><span>0 MF</span></div><p class="encyclopedia-muted">${bossDropLabel(this.area, this.difficulty)}</p>`;
      body += statsList([['额外暗金判定', percent(profile.uniqueChance)], ['额外符文判定', this.area === 3 ? '3 次独立 75%' : percent(profile.runeChance)], ['宝藏等级上限', profile.maxTC[this.difficulty]]]);
      if (entry.rank === 'actBoss') body += `<p class="encyclopedia-muted">首通奖励：第一件暗金与一枚符文保底</p>`;
      if (this.difficulty === 2 && [19, 24].includes(this.area)) { const charm = encyclopediaItem(this.area === 19 ? 'unique-382' : 'unique-401')!; body += this.link(charm.id, charm.name, 'items', '专属护符 · 0.5%'); }
      body += `<details class="encyclopedia-related-group"><summary>额外暗金池 · ${pool.length}</summary>${pool.map(item => this.link(item.catalogId!, item.name, 'items', `需求等级 ${item.level} · ${item.base}`)).join('')}</details>`;
    }
    return body;
  }
}
