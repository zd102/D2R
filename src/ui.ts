import { mercenaryPanel } from './mercenary-ui';
import { mercenaryUnlocked, mercenaryStats, equipMercenary, unequipMercenary, selectMercenaryAura } from './mercenary';
import type { HeroState } from './model';
import { CLASSES } from './classes';
import type { SkillId } from './paladin';
import * as THREE from 'three';
import { createIcons, Swords, Sword, Flame, Wind, Zap, Footprints, Backpack, UserRound, Users, UserPlus, Pencil, ArrowLeft, Map as MapIcon, ScrollText, Settings, Pause, Volume2, VolumeX, Maximize, Save, X, ChevronRight, Plus, Coins, Shield, Gem, Heart, Skull, Check, RotateCcw, Play, Trash2, ArrowUp, Droplets, Sparkles, Compass, Crosshair } from 'lucide';
import type { Game, Enemy, Skill } from './game';
import { SKILL_SLOTS, skillKeys, MOVEMENT_HINTS } from './controls';
import { stats, rarityNames, slotNames, type Item } from './model';
import { ACTS, levelTuning, questProgress, questComplete } from './campaign';
import { CampaignScreen } from './campaign-ui';
import { ProfileScreen, type ProfilePanel } from './profiles-ui';
import { CharacterScreen } from './character-ui';
import { SharedStashScreen } from './shared-stash-ui';
import { skillLevel, difficulty, difficultyNames } from './model';
import { skillName, skillIcon, skillValues, type Attribute } from './paladin';
import { BASES, runeLabel, groundItemName } from './items';
import { CAMP } from './camp';
import { EncyclopediaScreen } from './encyclopedia-ui';
import { heroStatuses, statusTime } from './status-effects';
import { panelFrame, rememberDialogFocus, navigateDialogTabs } from './ui-components';
import { settingsPanel } from './settings-ui';
import { itemDetails } from './item-details-ui';
import { Search, FilterX, ChevronLeft, Undo2, KeyRound, Package } from 'lucide';
import { Hammer, ShieldCheck, Sun, Focus, Snowflake, Church, Eye, HeartPulse, BookOpen, Shirt, Crown, Hand, RectangleEllipsis, Circle, Archive, ArrowLeftRight, ScanEye, Wrench, ArrowDown, Upload, Download, FileJson, FolderOpen } from 'lucide';

type Panel = 'inventory' | 'character' | 'skills' | 'map' | 'quest' | 'pause' | 'shop' | 'base-shop' | 'mercenary' | 'mercenary-shop' | 'death' | 'campaign' | 'shared-stash' | 'mystery-portal' | ProfilePanel;
const icons = { KeyRound, Package, Search, FilterX, ChevronLeft, Undo2, Upload, Download, FileJson, FolderOpen, Hammer, ShieldCheck, Sun, Focus, Snowflake, Church, Eye, HeartPulse, BookOpen, Shirt, Crown, Hand, RectangleEllipsis, Circle, Archive, ArrowLeftRight, ScanEye, Wrench, ArrowDown, Swords, Sword, Flame, Wind, Zap, Footprints, Backpack, UserRound, Users, UserPlus, Pencil, ArrowLeft, Map: MapIcon, ScrollText, Settings, Pause, Volume2, VolumeX, Maximize, Save, X, ChevronRight, Plus, Coins, Shield, Gem, Heart, Skull, Check, RotateCcw, Play, Trash2, ArrowUp, Droplets, Sparkles, Compass, Crosshair };
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const itemIcon = (item: Item) => icon(item.slot === 'weapon' ? 'sword' : item.slot === 'armor' ? 'shield' : 'gem');
const tip = (label: string) => `aria-label="${label}" data-tip="${label}"`;
const tooltipItemKey = (element?: HTMLElement) => element?.dataset.item ?? element?.dataset.sharedItem ?? (element?.dataset.loot !== undefined ? `loot:${element.dataset.loot}` : undefined);

// Replacing unchanged text/markup still creates nodes and invalidates layout.
// Keep HUD values live every frame without rebuilding the surrounding interface.
function setText(element: Element, value: string) { if (element.textContent !== value) element.textContent = value; }
function setMarkup(element: Element, value: string) { if (element.innerHTML !== value) element.innerHTML = value; }

function progressionBaseShop(hero: HeroState) {
  const stock = hero.baseStock;
  return `<p class="quest-story">每次通关关卡后刷新 5 件随机有孔底材，每件限购一次。${stock.offers.length ? ['普通', '噩梦', '地狱'][stock.difficulty] + '难度货单' : '首次通关后开始供应'}。</p><div class="shop-items">${stock.offers.map(offer => {
    const base = BASES.find(base => base.baseCode === offer.code)!;
    return `<div><div class="shop-item-icon gold-text"><i data-lucide="hammer"></i></div><div><h3>${base.name} · ${offer.sockets} 孔</h3><small>等级 ${base.requiredLevel ?? (base.level > 30 ? base.level - 10 : 1)} · 力量 ${base.strength ?? 0} · 敏捷 ${base.dexterity ?? 0}${base.requiredClass ? ' · ' + Object.values(CLASSES).find(character => character.code === base.requiredClass)?.name + '专属' : ''}</small></div><button class="secondary-button" data-buy-base="${offer.id}" ${offer.sold || hero.gold < offer.price ? 'disabled' : ''}>${offer.sold ? '已售罄' : `<i data-lucide="coins"></i>${offer.price}`}</button></div>`;
  }).join('')}</div><div class="inventory-gold">${hero.gold.toLocaleString()}<small>金币</small></div>`;
}

export class UI {
  panel?: Panel;
  selectedItem?: string;
  hoveredEnemy?: Enemy;
  mapCanvas: HTMLCanvasElement;
  mapCtx: CanvasRenderingContext2D;
  overlay: HTMLElement;
  toastContainer: HTMLElement;
  labels: HTMLElement;
  labelNodes = new Map<string, HTMLElement>();
  private labelSizes = new WeakMap<HTMLElement, { width: number; height: number; viewport: string }>();
  floats: { element: HTMLElement; position: THREE.Vector3; time: number }[] = [];
  timer = 0;
  damageTimer?: ReturnType<typeof setTimeout>;
  game: Game;
  profileScreen: ProfileScreen;
  characterScreen: CharacterScreen;
  sharedStashScreen: SharedStashScreen;
  campaignScreen: CampaignScreen;
  encyclopediaScreen: EncyclopediaScreen;
  bindingsSignature = '';
  statusSignature = '';
  statusDurations = new Map<string, number>();
  tooltipTarget?: HTMLElement;
  tooltipHideTimer?: ReturnType<typeof setTimeout>;
  tooltipTouch = false;
  tooltipDismissedKey?: string;
  panelOpener?: HTMLElement;
  constructor(game: Game) {
    this.game = game;
    void document.fonts.ready.then(() => { this.labelSizes = new WeakMap(); });
    const keys = skillKeys(game.movementMode);
    document.getElementById('app')!.insertAdjacentHTML('beforeend', `
      <div class="vignette" aria-hidden="true"></div><div id="damage-flash"></div>
      <header class="topbar">
        <div class="identity"><div class="title-row"><img src="/sigil.svg" alt="" class="brand-sigil"/><h1>黯蚀 <span>II</span></h1></div><div class="edition">ECLIPSE <span>·</span> 余烬之誓</div></div>
        <div class="top-tools"><span class="offline"><b></b>单人旅程</span><button ${tip('保存旅程')} data-action="save">${icon('save')}</button><button ${tip('声音')} id="sound-button" data-action="sound" aria-pressed="${!this.game.audio.volume}">${icon(this.game.audio.volume ? 'volume-2' : 'volume-x')}</button><button ${tip('设置')} data-panel="pause">${icon('settings')}</button></div>
      </header>
      <aside class="world-info"><div class="location"><span class="chapter">第 1 章 · 第 1 关</span><h2>邪恶洞窟</h2><span id="difficulty">普通 · Lv. 1</span></div>
        <button class="minimap-button" ${tip('区域地图')} data-panel="map"><canvas id="minimap" width="200" height="150"></canvas><span class="map-north">N</span><span class="map-expand">${icon('maximize')}</span></button>
        <button class="quest-track" data-panel="quest"><span class="quest-eyebrow">${icon('scroll-text')} 当前任务</span><strong>邪恶的巢穴</strong><span id="quest-step">消灭洞窟魔物 0 / 8</span><span class="quest-final">击败尸体发火</span></button>
      </aside>
      <div id="boss-bar" hidden><span>尸体发火</span><div><i></i></div><small>守关首领</small></div>
      <div id="world-labels"></div><div id="floating-text"></div><div id="toasts" aria-live="polite"></div>
      <aside id="combat-status" aria-label="角色增益与减益" hidden><div class="status-group debuffs" data-status-group="debuff" aria-label="减益状态"></div><div class="status-group buffs" data-status-group="buff" aria-label="增益状态"></div></aside>
      <div id="ui-tooltip" role="tooltip" hidden></div>
      <div class="area-caption"><span class="ornament-line"></span><span>邪恶洞窟</span><small>DEN OF EVIL</small></div>
      <button id="context-action" hidden><kbd>F</kbd><span></span>${icon('chevron-right')}</button>
      <div class="mobile-controls"><div id="joystick" aria-label="移动摇杆"><div></div></div><button id="mobile-attack" ${tip('攻击')} data-skill="attack">${icon('swords')}</button></div>
      <footer class="hud">
        <div class="resource health"><div class="orb-frame"><div class="orb"><div class="orb-fill" id="health-fill"></div><div class="orb-shine"></div><span id="health-value">55<small>/ 55</small></span></div></div><div class="resource-caption"><span>生命</span><small id="health-percent">100%</small></div></div>
        <div class="hud-center"><div class="hero-strip"><span class="hero-name"><span id="hero-profile-name">圣骑士</span><b id="hero-level">Lv. 1</b></span><div class="xp-track" ${tip('经验')}><i id="xp-fill"></i></div><span id="xp-value">0 / 80</span></div>
          <div class="action-row"><div class="skill-group">
            ${SKILL_SLOTS.map(key => `<button class="skill ${key}-skill" data-skill="${key}" ${tip('普通攻击')}><kbd>${keys[key]}</kbd>${icon('sword')}<span class="skill-name">普通攻击</span><span class="cooldown"></span></button>`).join('')}
          </div><span class="belt-divider"></span><div class="potion-group">
            <button class="skill health-potion" data-potion="0" ${tip('生命药剂 · 1')}><kbd>1</kbd>${icon('flame')}<b id="health-potions">6</b></button>
            <button class="skill mana-potion" data-potion="1" ${tip('法力药剂 · 2')}><kbd>2</kbd>${icon('droplets')}<b id="mana-potions">4</b></button>
          </div></div>
          <div class="paladin-status"><span id="active-aura-label">无灵气</span><span id="holy-shield-label"></span><span id="ammo-label" hidden></span><button data-action="run-mode" ${tip('切换跑步与行走')}><i data-lucide="footprints"></i></button><div class="stamina-track" ${tip('耐力')}><i id="stamina-fill"></i></div></div>
          <nav class="bottom-nav"><button data-panel="character" ${tip('角色 · C')}>${icon('user-round')}<span>角色</span><kbd class="nav-key" aria-hidden="true">C</kbd><b id="points-badge" hidden></b></button><button data-panel="skills" ${tip('技能 · T')}>${icon('book-open')}<span>技能</span><kbd class="nav-key" aria-hidden="true">T</kbd><b id="skill-points-badge" hidden></b></button><button data-panel="inventory" ${tip('背包 · I')}>${icon('backpack')}<span>背包</span><kbd class="nav-key" aria-hidden="true">I</kbd></button><button data-panel="quest" ${tip('任务 · J')}>${icon('scroll-text')}<span>任务</span><kbd class="nav-key" aria-hidden="true">J</kbd></button><button data-panel="map" ${tip('地图 · Tab')}>${icon('map')}<span>地图</span><kbd class="nav-key" aria-hidden="true">Tab</kbd></button><span class="gold-count">${icon('coins')}<b id="gold-value">0</b></span><button data-panel="pause" ${tip('暂停 · Esc')}>${icon('pause')}</button></nav>
        </div>
        <div class="resource mana"><div class="orb-frame"><div class="orb"><div class="orb-fill" id="mana-fill"></div><div class="orb-shine"></div><span id="mana-value">15<small>/ 15</small></span></div></div><div class="resource-caption"><span>法力</span><small id="mana-percent">100%</small></div></div>
      </footer>
      <button id="mercenary-status" data-panel="mercenary" data-tip="O 管理佣兵 · Shift+1 给米山使用生命药剂" hidden></button><div id="overlay" hidden></div><div class="corner-mark">ECLIPSE II <span>·</span> LOCAL REALM</div>
    `);
    this.mapCanvas = document.getElementById('minimap') as HTMLCanvasElement; this.mapCtx = this.mapCanvas.getContext('2d')!;
    this.overlay = document.getElementById('overlay')!; this.toastContainer = document.getElementById('toasts')!; this.labels = document.getElementById('world-labels')!;
    this.profileScreen = new ProfileScreen(game, this);
    this.characterScreen = new CharacterScreen(game, this);
    this.sharedStashScreen = new SharedStashScreen(this);
    this.campaignScreen = new CampaignScreen(this);
    this.encyclopediaScreen = new EncyclopediaScreen(this);
    this.bind(); this.refreshIcons();
  }
  refreshIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.5 } }); }
  hideTooltip() {
    clearTimeout(this.tooltipHideTimer);
    const target = this.tooltipTarget;
    if (target) {
      const ids = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== 'ui-tooltip');
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' ')); else target.removeAttribute('aria-describedby');
    }
    this.tooltipTarget = undefined;
    const tooltip = document.getElementById('ui-tooltip');
    if (tooltip) { tooltip.hidden = true; tooltip.replaceChildren(); tooltip.classList.remove('item-tooltip'); }
  }
  tooltipItem(target: HTMLElement) {
    const h = this.game.hero, id = target.dataset.item ?? target.dataset.sharedItem;
    if (target.dataset.loot !== undefined) return this.game.loot.find(loot => loot.id === Number(target.dataset.loot))?.item;
    if (!id) return undefined;
    if (target.dataset.sharedSide === 'shared') return this.sharedStashScreen.state?.items.find(item => item.id === id);
    return [...h.inventory, ...h.stash, ...Object.values(h.equipment)].find((item): item is Item => !!item && item.id === id);
  }
  updateTooltip() {
    const target = this.tooltipTarget, tooltip = document.getElementById('ui-tooltip')!;
    if (!target?.isConnected || !target.getClientRects().length || document.documentElement.classList.contains('is-dragging-item')) { this.hideTooltip(); return; }
    const item = this.tooltipItem(target);
    if (!item && !target.dataset.tip) { this.hideTooltip(); return; }
    tooltip.style.maxHeight = '';
    tooltip.classList.toggle('item-tooltip', !!item);
    if (item) { tooltip.innerHTML = itemDetails(this.game.hero, item, { tooltip: true }); this.refreshIcons(); }
    else tooltip.textContent = target.dataset.tip!;
    tooltip.hidden = false;
    const describedBy = new Set((target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    describedBy.add('ui-tooltip'); target.setAttribute('aria-describedby', [...describedBy].join(' '));
    const rect = target.getBoundingClientRect(), width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    if (item) {
      const workspace = target.closest('.paperdoll, .diablo-grid')?.getBoundingClientRect() ?? rect;
      const right = workspace.right + 10, left = workspace.left - width - 10;
      const beside = right + width <= innerWidth - 8 || left >= 8;
      tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, right + width <= innerWidth - 8 ? right : left >= 8 ? left : rect.left))}px`;
      let top = rect.top;
      if (!beside) {
        const below = innerHeight - rect.bottom - 18, above = rect.top - 18;
        tooltip.style.maxHeight = `${Math.max(48, Math.max(below, above))}px`;
        top = below >= above ? rect.bottom + 10 : rect.top - tooltip.offsetHeight - 10;
      }
      tooltip.style.top = `${Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, top))}px`;
      return;
    }
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, rect.top >= height + 16 ? rect.top - height - 8 : rect.bottom + 8))}px`;
  }
  updateStatuses(current: ReturnType<typeof stats>) {
    const effects = heroStatuses(this.game.hero, current), root = document.getElementById('combat-status')!;
    root.hidden = this.game.paused || this.game.dead || !effects.length;
    const signature = effects.map(effect => `${effect.id}:${effect.description}`).join('|');
    if (signature !== this.statusSignature) {
      this.statusSignature = signature;
      for (const kind of ['debuff', 'buff'] as const) {
        const group = root.querySelector<HTMLElement>(`[data-status-group="${kind}"]`)!, list = effects.filter(effect => effect.kind === kind);
        group.hidden = !list.length;
        setMarkup(group, `<span class="status-heading">${kind === 'debuff' ? '减益' : '增益'}</span>${list.map(effect => `<button class="status-chip" data-status="${effect.id}" data-tip="${escapeHtml(`${effect.name} · ${effect.description}`)}">${icon(effect.icon)}<span>${escapeHtml(effect.name)}</span><b></b><i class="status-time-bar" aria-hidden="true"></i></button>`).join('')}`);
      }
      this.refreshIcons();
      for (const id of this.statusDurations.keys()) if (!effects.some(effect => effect.id === id)) this.statusDurations.delete(id);
    }
    for (const effect of effects) {
      const chip = root.querySelector<HTMLElement>(`[data-status="${effect.id}"]`)!;
      const duration = Math.max(this.statusDurations.get(effect.id) ?? 0, effect.remaining ?? 0);
      this.statusDurations.set(effect.id, duration);
      setText(chip.querySelector('b')!, statusTime(effect.remaining));
      chip.setAttribute('aria-label', `${effect.name}，${statusTime(effect.remaining)}，${effect.description}`);
      chip.classList.toggle('expiring', effect.remaining !== null && effect.remaining <= 5);
      chip.style.setProperty('--remaining', String(effect.remaining === null ? 1 : effect.remaining / Math.max(.001, duration)));
    }
  }
  bind() {
    this.overlay.addEventListener('keydown', event => navigateDialogTabs(this.overlay, event));
    const showTooltip = (target: EventTarget | null) => {
      if (document.documentElement.classList.contains('is-dragging-item')) return;
      const tooltip = document.getElementById('ui-tooltip')!;
      if (target instanceof Node && tooltip.contains(target)) { clearTimeout(this.tooltipHideTimer); return; }
      const next = target instanceof Element ? target.closest<HTMLElement>('[data-item], [data-shared-item], [data-loot], [data-tip]') ?? undefined : undefined;
      if (tooltipItemKey(next) && tooltipItemKey(next) === this.tooltipDismissedKey) return;
      if (tooltipItemKey(next)) this.tooltipDismissedKey = undefined;
      if (next === this.tooltipTarget && !tooltip.hidden) { clearTimeout(this.tooltipHideTimer); return; }
      this.hideTooltip(); this.tooltipTarget = next;
      this.updateTooltip();
    };
    document.addEventListener('pointerover', event => { if (event.pointerType !== 'touch' && !event.buttons) showTooltip(event.target); });
    document.addEventListener('pointermove', event => {
      if (!this.tooltipDismissedKey || !(event.target instanceof Element)) return;
      const item = event.target.closest<HTMLElement>('[data-item], [data-shared-item], [data-loot]');
      if (tooltipItemKey(item ?? undefined) !== this.tooltipDismissedKey) this.tooltipDismissedKey = undefined;
    });
    document.addEventListener('focusin', event => {
      if (!this.tooltipTouch && event.target instanceof HTMLElement && event.target.matches(':focus-visible')) showTooltip(event.target);
    });
    document.addEventListener('pointerout', event => {
      const next = event.relatedTarget as Node | null, tooltip = document.getElementById('ui-tooltip')!;
      if (!this.tooltipTarget || this.tooltipTarget.contains(next) || tooltip.contains(next)) return;
      clearTimeout(this.tooltipHideTimer);
      if (tooltip.classList.contains('item-tooltip')) this.tooltipHideTimer = setTimeout(() => this.hideTooltip(), 140);
      else this.hideTooltip();
    });
    document.addEventListener('focusout', () => this.hideTooltip());
    document.addEventListener('pointerdown', event => {
      this.tooltipTouch = event.pointerType === 'touch';
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-item], [data-shared-item], [data-loot]') : undefined;
      this.tooltipDismissedKey = tooltipItemKey(item ?? undefined);
      if (!(event.target instanceof Node) || !document.getElementById('ui-tooltip')!.contains(event.target)) this.hideTooltip();
    }, true);
    document.addEventListener('pointerup', event => {
      // A completed drop replaces the item buttons under a stationary pointer.
      // Wait for the next deliberate hover before showing the moved item's details.
      const item = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-item], [data-shared-item], [data-loot]');
      if (item) this.tooltipDismissedKey = tooltipItemKey(item);
    }, true);
    document.addEventListener('keydown', event => {
      this.tooltipTouch = false;
      if (event.key === 'Tab' || event.key.startsWith('Arrow')) this.tooltipDismissedKey = undefined;
      const tooltip = document.getElementById('ui-tooltip')!;
      if ([' ', 'Enter'].includes(event.key) && event.target instanceof Element) {
        const item = event.target.closest<HTMLElement>('[data-item], [data-shared-item]');
        if (item) { this.tooltipDismissedKey = tooltipItemKey(item); this.hideTooltip(); }
      }
      if (event.key === 'Escape' && !tooltip.hidden && tooltip.classList.contains('item-tooltip')) {
        this.hideTooltip();
      }
    }, true);
    document.addEventListener('scroll', event => {
      if (!(event.target instanceof Node) || !document.getElementById('ui-tooltip')!.contains(event.target)) this.hideTooltip();
    }, true);
    window.addEventListener('resize', () => this.hideTooltip());
    document.addEventListener('click', event => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('button'); if (!element) return;
      this.game.audio.unlock();
      if (element.dataset.panel) this.togglePanel(element.dataset.panel as Panel);
      if (element.dataset.skill) this.game.useSkill(element.dataset.skill as Skill);
      if (element.dataset.potion) this.game.drink(Number(element.dataset.potion) as 0 | 1);
      if (element.dataset.item) { this.game.audio.play('uiClick'); this.selectedItem = element.dataset.item; if (innerWidth <= 700 || innerHeight <= 580) this.characterScreen.inventoryPane = 'details'; this.renderPanel(); }
      if (element.dataset.equip) this.game.equip(element.dataset.equip);
      if (element.dataset.salvage) this.game.salvage(element.dataset.salvage);
      if (element.dataset.allocate) this.game.allocate(element.dataset.allocate as Attribute, Number(element.dataset.count ?? 1));
      if (element.dataset.buyBase) this.game.buyBase(element.dataset.buyBase);
      if (element.dataset.mercenaryEquip) this.changeMercenary(() => equipMercenary(this.game.hero, element.dataset.mercenaryEquip!));
      if (element.dataset.mercenaryUnequip) this.changeMercenary(() => unequipMercenary(this.game.hero, element.dataset.mercenaryUnequip!));
      if (element.dataset.mercenaryAura) this.changeMercenary(() => selectMercenaryAura(this.game.hero, element.dataset.mercenaryAura));
      if (element.dataset.buy) this.game.buy(Number(element.dataset.buy) as 0 | 1);
      if (element.dataset.loot) this.game.pickup(Number(element.dataset.loot));
      if (element.dataset.chest !== undefined) this.game.openChest(Number(element.dataset.chest));
      if (element.dataset.cowEntry) this.game.enterCowLevel(element.dataset.cowEntry);
      if (element.dataset.uberEntry) this.game.enterUberDiablo(element.dataset.uberEntry);
      switch (element.dataset.action) {
        case 'close': this.closePanel(); break;
        case 'save': this.game.save(); break;
        case 'sound': this.game.audio.toggleMute(); this.refreshAudioButton(); break;
        case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => this.toast('全屏暂不可用')); break;
        case 'revive': this.game.revive(); break;
        case 'profiles': this.game.returnToProfiles(); break;
        case 'camp': this.game.returnToCamp(); break;
        case 'camp-portal': this.game.useCampPortal(); break;
        case 'mystery-portal': this.game.useMysteryPortal(); break;
        case 'base-merchant': this.game.useBaseMerchant(); break;
        case 'mercenary-merchant': this.game.useMercenaryMerchant(); break;
        case 'hire-mercenary': this.game.hireMercenary(); break;
        case 'find-mercenary': this.closePanel(); this.game.useMercenaryMerchant(); break;
        case 'shared-stash': this.game.useSharedStash(); break;
        case 'mystery-corpse': this.game.openMysteriousCorpse(); break;
        case 'run-mode': this.game.hero.running = !this.game.hero.running; this.game.save(false); break;
        case 'restore': this.game.hero.hp = stats(this.game.hero).maxHp; this.game.hero.mana = stats(this.game.hero).maxMana; this.toast('生命与法力已恢复'); this.game.save(false); break;
      }
    });
    this.overlay.addEventListener('click', event => { if (event.target === this.overlay && !this.isProfilePanel() && this.panel !== 'death') this.closePanel(); });
    this.overlay.addEventListener('input', event => {
      const element = event.target as HTMLInputElement;
      if (element.id === 'volume') { this.game.audio.volume = Number(element.value) / 100; this.refreshAudioButton(); }
      const channel = element.dataset.audioChannel;
      if (channel === 'effects' || channel === 'ambience' || channel === 'ui') this.game.audio.setChannelVolume(channel, Number(element.value) / 100);
      if (element.id === 'volume' || channel) {
        const label = document.getElementById(`${element.id}-value`); if (label) label.textContent = `${element.value}%`;
      }
    });
    this.overlay.addEventListener('change', event => {
      const element = event.target as HTMLInputElement;
      if (element.id === 'quality') this.game.setQuality(element.value);
      if (element.id === 'player-count') {
        this.game.setPlayerCount(Number(element.value));
        if (this.panel === 'pause') { this.renderPanel(); document.getElementById('player-count')?.focus(); }
      }
      if (element.id === 'movement-mode') {
        this.game.setMovementMode(element.value);
        document.getElementById('movement-hint')!.textContent = MOVEMENT_HINTS[this.game.movementMode];
      }
    });
    document.getElementById('context-action')!.addEventListener('click', () => this.game.interact());
    const joystick = document.getElementById('joystick')!, knob = joystick.firstElementChild as HTMLElement;
    const handleJoystick = (event: PointerEvent) => {
      if (this.game.paused || this.game.dead) return;
      const rect = joystick.getBoundingClientRect(); let x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
      const dist = Math.hypot(x, y), max = rect.width * .3; if (dist > max) { x *= max / dist; y *= max / dist; }
      this.game.joystick.set(x / max, y / max); knob.style.transform = `translate(${x}px, ${y}px)`;
    };
    joystick.addEventListener('pointerdown', event => { joystick.setPointerCapture(event.pointerId); this.game.begin(); handleJoystick(event); });
    joystick.addEventListener('pointermove', event => { if (joystick.hasPointerCapture(event.pointerId)) handleJoystick(event); });
    const reset = () => { this.game.joystick.set(0, 0); knob.style.transform = ''; };
    joystick.addEventListener('pointerup', reset); joystick.addEventListener('pointercancel', reset);
    const attack = document.getElementById('mobile-attack')!;
    attack.addEventListener('pointerdown', event => { if (this.game.paused || this.game.dead) return; attack.setPointerCapture(event.pointerId); this.game.target = this.game.nearestEnemy(12); this.game.heldAttack = true; this.game.useSkill('attack'); });
    attack.addEventListener('pointerup', () => this.game.heldAttack = false);
    attack.addEventListener('pointercancel', () => this.game.heldAttack = false);
  }
  refreshAudioButton() {
    const button = document.getElementById('sound-button'); if (!button) return;
    button.setAttribute('aria-pressed', String(!this.game.audio.volume));
    button.innerHTML = icon(this.game.audio.volume ? 'volume-2' : 'volume-x'); this.refreshIcons();
    const slider = document.getElementById('volume') as HTMLInputElement | null;
    if (slider) { slider.value = String(Math.round(this.game.audio.volume * 100)); document.getElementById('volume-value')!.textContent = `${slider.value}%`; }
  }
  togglePanel(panel: Panel) { this.panel === panel ? this.closePanel() : this.openPanel(panel); }
  changeMercenary(change: () => boolean) {
    if (!this.game.profile || this.game.dead || this.game.saveConflict || !['mercenary', 'mercenary-shop'].includes(this.panel ?? '')) return;
    const previous = structuredClone(this.game.hero);
    if (!change()) { this.toast('无法移动装备', '请检查装备需求和背包空间'); return; }
    if (!this.game.save(false)) { this.game.hero = previous; this.game.mercenary.clear(); this.game.mercenary.sync(); return; }
    this.game.mercenary.sync(); this.renderPanel();
  }
  isProfilePanel(panel = this.panel) { return ['profiles', 'new-profile', 'rename-profile', 'delete-profile', 'import-profile', 'save-conflict', 'encyclopedia'].includes(panel ?? ''); }
  openPanel(panel: Panel) {
    if (this.sharedStashScreen?.busy) return;
    if (!this.game.profile && !this.isProfilePanel(panel)) return;
    if (this.game.saveConflict && panel !== 'save-conflict') return;
    if (this.game.dead && panel !== 'death' && panel !== 'save-conflict') return;
    if (panel === 'base-shop' && (!this.game.inCamp || Math.hypot(this.game.position.x - CAMP.baseMerchant.x, this.game.position.z - CAMP.baseMerchant.z) >= 3.5)) return;
    if (panel === 'mercenary-shop' && !this.game.atMercenaryMerchant) return;
    if (panel === 'shared-stash' && (!this.game.inCamp || Math.hypot(this.game.position.x - CAMP.stash.x, this.game.position.z - CAMP.stash.z) >= 3.5)) return;
    if (!this.panel) {
      const focused = document.activeElement;
      this.panelOpener = focused instanceof HTMLElement && focused.tabIndex >= 0 ? focused : undefined;
    }
    if (panel === 'campaign') this.campaignScreen.reset();
    if (panel !== this.panel && panel !== 'death') this.game.audio.play(panel === 'shared-stash' ? 'chest' : 'uiOpen');
    this.hideTooltip(); this.panel = panel; this.game.paused = true; this.game.releaseInput(); this.overlay.hidden = false;
    document.getElementById('combat-status')!.hidden = true;
    this.renderPanel();
    (this.overlay.querySelector<HTMLButtonElement>('.profile-delete [data-profile-action="back"]') ?? this.overlay.querySelector<HTMLInputElement>('#profile-name') ?? this.overlay.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? this.overlay.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    this.hideTooltip();
  }
  closePanel() {
    if (this.sharedStashScreen.busy) return;
    this.hideTooltip();
    this.characterScreen.inventoryDrag.cancel();
    if (this.game.dead || this.game.saveConflict) return;
    if (this.panel === 'encyclopedia') { this.openPanel('profiles'); this.overlay.querySelector<HTMLButtonElement>('[data-profile-action="encyclopedia"]')?.focus(); return; }
    if (!this.game.profile) {
      if (this.panel !== 'profiles') this.openPanel('profiles');
      return;
    }
    this.overlay.classList.remove('profile-overlay'); document.getElementById('app')!.classList.remove('is-roster');
    if (this.panel) this.game.audio.play('uiClose');
    this.panel = undefined; this.game.paused = false; this.overlay.hidden = true; this.overlay.innerHTML = '';
    const opener = this.panelOpener;
    (opener?.isConnected && opener.getClientRects().length ? opener : this.game.renderer.domElement).focus({ preventScroll: true });
    this.panelOpener = undefined;
  }
  renderPanel() {
    const restoreFocus = rememberDialogFocus(this.overlay);
    this.renderPanelContent();
    restoreFocus();
    this.hideTooltip();
  }
  renderPanelContent() {
    this.hideTooltip();
    this.characterScreen.inventoryDrag.cancel();
    if (!this.panel) return;
    if (this.panel === 'encyclopedia') { this.encyclopediaScreen.render(); return; }
    this.encyclopediaScreen.dispose(); this.overlay.classList.remove('encyclopedia-overlay');
    if (this.isProfilePanel()) { this.profileScreen.render(); return; }
    this.overlay.classList.remove('profile-overlay');
    const h = this.game.hero, s = stats(h);
    const titles: Record<Exclude<Panel, ProfilePanel>, [string, string]> = {
      'base-shop': ['底材商人', 'BASE MERCHANT'],
      'mercenary': ['佣兵 · 米山', 'DESERT MERCENARY'],
      'mercenary-shop': ['佣兵商人', 'MERCENARY CAPTAIN'],
      'shared-stash': ['本地共享仓库', 'SHARED STASH'],
      'mystery-portal': ['神秘传送阵', 'MYSTERIOUS PORTAL'],
      campaign: [this.game.inCamp ? '远征传送阵' : '章节关卡', 'CAMPAIGN'],
      inventory: ['行囊', 'INVENTORY'], character: ['圣骑士', 'PALADIN'], skills: ['圣骑士技能', 'PALADIN SKILLS'], map: ['区域地图', 'AREA MAP'], quest: ['当前任务', 'QUEST JOURNAL'], pause: ['旅程暂歇', 'PAUSED'], shop: ['旅者补给', 'WAYFARER'], death: ['你已陨落', 'YOU HAVE FALLEN'],
    };
    titles.character = [CLASSES[h.classId].name, CLASSES[h.classId].english];
    titles.skills = [`${CLASSES[h.classId].name}技能`, `${CLASSES[h.classId].english} SKILLS`];
    titles.quest = [this.game.level.quest.name, 'QUEST JOURNAL'];
    titles.map = [this.game.areaName, 'AREA MAP'];
    const panelTitle = titles[this.panel as keyof typeof titles];
    let content = '';
    if (this.panel === 'mercenary' || this.panel === 'mercenary-shop') {
      content = mercenaryPanel(this.game, this.panel === 'mercenary-shop');
    } else if (this.panel === 'shared-stash') {
      content = this.sharedStashScreen.render();
    } else if (this.panel === 'mystery-portal') {
      const legs = this.game.cowLegs, soj = this.game.hero.inventory.find(item => item.catalogId === 'unique-122' || item.name === '乔丹之石');
      content = `<div class="quest-rewards"><span>${icon('sparkles')}维特之腿</span></div><div class="shop-items">${legs.map(leg => `<div><div class="shop-item-icon gold-text">${icon('sword')}</div><div><h3>${leg.name}</h3></div><button class="primary-button" data-cow-entry="${escapeHtml(leg.id)}">${icon('circle')}开启</button></div>`).join('') || '<p class="quest-story">未携带维特之腿</p>'}</div><div class="quest-rewards"><span>${icon('flame')}乔丹之石</span></div>${this.game.hero.campaign.cleared[2] >= 25 ? `<div class="shop-items"><div><div class="shop-item-icon red-text">${icon('gem')}</div><div><h3>超级迪亚波罗</h3></div><button class="primary-button" data-uber-entry="${escapeHtml(soj?.id ?? '')}" ${soj ? '' : 'disabled'}>${icon('flame')}开启</button></div></div>` : ''}`;
    } else if (this.panel === 'campaign') {
      content = this.campaignScreen.render();
    } else if (this.panel === 'inventory') {
      content = this.characterScreen.inventory();
    } else if (this.panel === 'character') {
      content = this.characterScreen.character();
    } else if (this.panel === 'skills') {
      content = this.characterScreen.skills();
    } else if (this.panel === 'map') {
      content = `<canvas id="large-map" width="700" height="570"></canvas><div class="map-legend"><span><i class="legend-player"></i>${CLASSES[h.classId].name}</span>${this.game.inCamp ? '' : '<span><i class="legend-shrine"></i>任务目标</span><span><i class="legend-enemy"></i>敌人</span>'}<span><i class="legend-portal"></i>${this.game.inCamp ? '远征传送阵' : '传送门'}</span></div>`;
      if (!this.game.inCamp) {
        const floor = this.game.world.floorCells;
        const explored = floor.filter(p => this.game.visited.has(`${Math.floor(p.x / 3)},${Math.floor(p.z / 3)}`)).length;
        content += `<p class="quest-story">已探索 ${Math.floor(explored / Math.max(1, floor.length) * 100)}% · 道路与目标随探索显露，支路中可找到宝箱与精英。</p>`;
      }
    } else if (this.panel === 'quest') {
      content = this.campaignScreen.quest();
    } else if (this.panel === 'pause') {
      content = settingsPanel(this.game);
    } else if (this.panel === 'shop') {
      content = `<div class="shop-intro">${icon('compass')}<p>归途的灯火，总为旅者而亮。</p></div><button class="secondary-button" data-action="restore">${icon('heart')}圣泉祝福 · 恢复状态</button><div class="shop-items">${([0, 1] as const).map(index => `<div><div class="shop-item-icon ${index === 0 ? 'red-text' : 'blue-text'}">${icon(index === 0 ? 'flame' : 'droplets')}</div><div><h3>${index === 0 ? '生命' : '法力'}药剂</h3><small>持有 ${h.potions[index]}</small></div><button class="secondary-button" data-buy="${index}" ${h.gold < 25 ? 'disabled' : ''}>${icon('coins')}25</button></div>`).join('')}</div><div class="inventory-gold">${icon('coins')}${h.gold.toLocaleString()}<small>金币</small></div>`;
    } else if (this.panel === 'base-shop') {
      content = progressionBaseShop(h);
    } else if (this.panel === 'death') {
      content = `<div class="end-mark death-mark">${icon('skull')}</div><p class="end-story">灰烬尚温，誓约未尽。</p><div class="end-stats"><span>等级 <b>${h.level}</b></span><span>击杀 <b>${h.kills}</b></span></div><p class="death-cost">遗体保留装备 · 遗失 ${h.corpse?.gold ?? 0} 金币</p><button class="primary-button" data-action="revive">${icon('rotate-ccw')}在传送阵重生</button>`;
    }
    this.overlay.innerHTML = panelFrame(this.panel, panelTitle, content);
    const characterName = this.overlay.querySelector('.character-banner h3');
    if (characterName) characterName.textContent = this.game.profile?.name ?? '灰烬行者';
    this.refreshIcons();
    if (this.panel === 'map') this.drawMap(document.getElementById('large-map') as HTMLCanvasElement, true);
  }
  toast(title: string, subtitle = '') {
    const existing = [...this.toastContainer.children].find(el => el.firstElementChild?.textContent === title); if (existing) return;
    const toast = document.createElement('div'); toast.className = 'toast';
    const strong = document.createElement('strong'); strong.textContent = title; toast.append(strong);
    if (subtitle) { const sub = document.createElement('span'); sub.textContent = subtitle; toast.append(sub); }
    this.toastContainer.append(toast); if (this.toastContainer.children.length > 3) this.toastContainer.firstElementChild?.remove();
    setTimeout(() => toast.remove(), 3400);
  }
  floatText(text: string, position: THREE.Vector3, kind: string) {
    const element = document.createElement('span'); element.className = `float ${kind}`; element.textContent = text;
    document.getElementById('floating-text')!.append(element); this.floats.push({ element, position, time: 1.1 });
  }
  flashDamage() { const flash = document.getElementById('damage-flash')!; flash.classList.add('active'); clearTimeout(this.damageTimer); this.damageTimer = setTimeout(() => flash.classList.remove('active'), 180); }
  drawMap(canvas = this.mapCanvas, large = false) {
    const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = large ? '#131c1c' : 'rgba(12,20,20,.68)'; ctx.fillRect(0, 0, w, h);
    const mapWidth = this.game.world.grid.width - 2, mapHeight = this.game.world.grid.height - 2;
    const mapSize = (mapWidth + mapHeight) / 2;
    const extent = large || this.game.inCamp ? mapSize : 44;
    const center = large || this.game.inCamp ? { x: 0, z: 0 } : this.game.position;
    const scale = Math.min(w / (extent * 1.55), h / (extent * 1.3)), point = (x: number, z: number) => ({ x: w / 2 + (x - center.x - z + center.z) * .707 * scale, y: h / 2 + (x - center.x + z - center.z) * .48 * scale });
    const explored = (x: number, z: number) => this.game.inCamp || this.game.visited.has(`${Math.floor(x / 3)},${Math.floor(z / 3)}`);
    const poly = (x: number, z: number, width: number, depth: number, color: string) => {
      ctx.fillStyle = color; ctx.beginPath(); [[x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2], [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]].forEach(([px, pz], index) => { const p = point(px, pz); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
    };
    poly(0, 0, mapWidth, mapHeight, '#24302b');
    this.game.world.floorCells.forEach(p => { if (explored(p.x, p.z)) poly(p.x, p.z, 1.05, 1.05, '#697667'); });
    const dot = (x: number, z: number, color: string, radius: number, diamond = false) => { const p = point(x, z); ctx.fillStyle = color; ctx.beginPath(); if (diamond) { ctx.moveTo(p.x, p.y - radius); ctx.lineTo(p.x + radius, p.y); ctx.lineTo(p.x, p.y + radius); ctx.lineTo(p.x - radius, p.y); } else ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); };
    this.game.enemies.forEach(e => { if (!e.dead && explored(e.actor.group.position.x, e.actor.group.position.z) && (e.boss ? !!this.game.specialArea || questComplete(this.game.hero.campaign) : e.actor.group.position.distanceTo(this.game.position) < 12)) dot(e.actor.group.position.x, e.actor.group.position.z, e.boss ? '#ef846b' : e.elite ? '#eac66c' : '#c56456', e.boss ? 4 : e.elite ? 3 : 2); });
    if (this.game.inCamp) {
      dot(CAMP.portal.x, CAMP.portal.z, '#63c8c8', large ? 6 : 4, true);
      dot(CAMP.mysteryPortal.x, CAMP.mysteryPortal.z, '#c48bea', large ? 6 : 4, true);
      dot(CAMP.baseMerchant.x, CAMP.baseMerchant.z, '#d6c492', large ? 5 : 3);
      if (mercenaryUnlocked(this.game.hero)) dot(CAMP.mercenaryMerchant.x, CAMP.mercenaryMerchant.z, '#a6d6ae', large ? 5 : 3);
      dot(CAMP.supply.x, CAMP.supply.z, '#d6c492', large ? 5 : 3);
      dot(CAMP.stash.x, CAMP.stash.z, '#e7c273', large ? 5 : 3);
    } else {
      const layout = this.game.world.layout;
      layout.objects.forEach((p, i) => { const complete = this.game.hero.campaign.objects.includes(i); if (explored(p.x, p.z)) dot(p.x, p.z, complete ? '#81d1b5' : ACTS[this.game.level.act].color, large ? 6 : 3.7, true); });
      if (this.game.hero.bossDefeated && explored(layout.exit.x, layout.exit.z)) dot(layout.exit.x, layout.exit.z, '#cfe69b', large ? 6 : 4, true);
      dot(layout.supply.x, layout.supply.z, '#63c8c8', large ? 5 : 3);
      for (const chest of this.game.world.chests) if (this.game.visited.has(`${Math.floor(chest.x / 3)},${Math.floor(chest.z / 3)}`)) dot(chest.x, chest.z, chest.opened ? '#686b60' : '#e1b968', large ? 4 : 2.5);
    }
    const mercenary = this.game.mercenary.position;
    if (mercenary) dot(mercenary.x, mercenary.z, '#81d9c8', large ? 4 : 2.5, true);
    dot(this.game.position.x, this.game.position.z, '#fff2c7', large ? 5 : 3, true);
    if (large) { ctx.fillStyle = '#7f8c84'; ctx.font = '13px Georgia'; ctx.fillText('N', w / 2 + 14, 30); const p = point(0, 22); ctx.textAlign = 'center'; ctx.fillStyle = '#c0b397'; ctx.font = '15px serif'; ctx.fillText(this.game.inCamp ? CAMP.name : '归途之门', p.x, p.y + 23); }
  }
  update(dt: number) {
    if (!this.game.profile) return;
    const game = this.game, h = game.hero, s = stats(h);
    const mercenaryStatus = document.getElementById('mercenary-status')!;
    mercenaryStatus.hidden = !game.profile || !mercenaryUnlocked(h) || !!this.panel;
    if (!mercenaryStatus.hidden) {
      const merc = h.mercenary, maxHp = mercenaryStats(h).maxHp;
      setMarkup(mercenaryStatus, merc ? `<span>米山 · Lv. ${h.level} <kbd>O</kbd></span><small>${merc.status === 'dead' ? '已阵亡 · 需重新雇佣' : `${skillName(merc.aura)} · ${Math.ceil(merc.hp)} / ${maxHp}`}</small><progress aria-label="米山生命" max="${maxHp}" value="${merc.hp}"></progress>` : '<span>佣兵 · O</span><small>可在营地雇佣米山</small>');
    }
    this.updateStatuses(s);
    if (this.tooltipTarget && !this.tooltipTarget.isConnected) this.hideTooltip();
    this.timer += dt;
    const hp = Math.ceil(h.hp), mana = Math.floor(h.mana);
    document.getElementById('health-fill')!.style.height = `${h.hp / s.maxHp * 100}%`;
    document.getElementById('mana-fill')!.style.height = `${h.mana / s.maxMana * 100}%`;
    setMarkup(document.getElementById('health-value')!, `${hp}<small>/ ${s.maxHp}</small>`);
    setMarkup(document.getElementById('mana-value')!, `${mana}<small>/ ${s.maxMana}</small>`);
    setText(document.getElementById('health-percent')!, `${Math.ceil(h.hp / s.maxHp * 100)}%`);
    setText(document.getElementById('mana-percent')!, `${Math.floor(h.mana / s.maxMana * 100)}%`);
    setText(document.getElementById('hero-level')!, `Lv. ${h.level}`);
    setText(document.getElementById('xp-value')!, h.level === 99 ? 'MAX' : `${Math.floor(h.xp / s.xpNeeded * 100)}%`);
    document.getElementById('xp-fill')!.style.width = `${h.level === 99 ? 100 : Math.min(100, h.xp / s.xpNeeded * 100)}%`;
    setText(document.getElementById('health-potions')!, String(h.potions[0])); setText(document.getElementById('mana-potions')!, String(h.potions[1]));
    setText(document.getElementById('gold-value')!, h.gold.toLocaleString()); setText(document.getElementById('difficulty')!, game.inCamp ? '安全区域' : `${difficultyNames[difficulty(h)]} · Lv. ${levelTuning(game.level, difficulty(h)).level}`);
    const special = game.specialArea;
    setText(document.querySelector('.location .chapter')!, special ? '隐藏领域' : game.inCamp ? '旅者驻地' : `第 ${game.level.act + 1} 章 · 第 ${game.level.step + 1} 关`);
    setText(document.querySelector('.location h2')!, game.areaName);
    setText(document.querySelector('.quest-track strong')!, game.level.quest.name);
    setText(document.querySelector('.area-caption>span:last-of-type')!, game.areaName);
    setText(document.querySelector('.area-caption>small')!, game.inCamp ? CAMP.english : game.level.english);
    setText(document.getElementById('quest-step')!, special === 'cow' ? `剩余地狱奶牛 ${game.enemies.filter(enemy => !enemy.dead && !enemy.boss).length}` : special ? '唯一首领' : `${game.level.quest.action} ${questProgress(h.campaign)} / ${game.level.quest.count}`);
    const questFinal = document.querySelector('.quest-final')!; setText(questFinal, h.bossDefeated ? '传送门已激活 · 靠近按 F 交互' : `${special || questComplete(h.campaign) ? '击败' : '完成任务后挑战'}${game.level.boss}`); questFinal.classList.toggle('complete', h.bossDefeated);
    const badge = document.getElementById('points-badge')!; badge.hidden = !h.points; setText(badge, String(h.points));
    const skillBadge = document.getElementById('skill-points-badge')!; skillBadge.hidden = !h.skillPoints; setText(skillBadge, String(h.skillPoints));
    const classBuffs=Object.entries(h.buffs).map(([id,buff])=>`${skillName(id as SkillId)} ${Math.ceil(buff.remaining)}秒`);
    const auraLabel=document.getElementById('active-aura-label')!;
    setText(auraLabel, h.activeAura ? skillName(h.activeAura) : classBuffs[0]??(h.classId==='paladin'?'无灵气':CLASSES[h.classId].name));
    auraLabel.title=classBuffs.join(' · ');
    setText(document.getElementById('holy-shield-label')!, h.holyShield > 0 ? `圣盾 ${Math.ceil(h.holyShield)}s` : h.poison > 0 ? '中毒' : h.curse > 0 ? '伤害加深' : '');
    const ammo = document.getElementById('ammo-label')!;
    ammo.hidden = !s.ranged; setText(ammo, s.ranged ? `${s.ranged.stack ? '投掷' : s.ranged.kind === 'bow' ? '箭矢' : '弩矢'} ∞` : '');
    document.getElementById('stamina-fill')!.style.width = `${Math.min(100, h.stamina / s.maxStamina * 100)}%`;
    const runButton = document.querySelector<HTMLButtonElement>('[data-action="run-mode"]')!; runButton.setAttribute('aria-pressed', String(h.running)); runButton.dataset.tip = h.running ? '跑步' : '行走';
    const signature = JSON.stringify([game.movementMode, h.bindings]);
    if (signature !== this.bindingsSignature) {
      this.bindingsSignature = signature;
      const keys = skillKeys(game.movementMode);
      document.querySelectorAll<HTMLButtonElement>('.skill[data-skill]').forEach(button => {
        const key = button.dataset.skill as Skill, id = h.bindings[key];
        button.querySelector('svg')?.remove(); button.insertAdjacentHTML('beforeend', icon(skillIcon(id)));
        setText(button.querySelector('.skill-name')!, skillName(id));
        setText(button.querySelector('kbd')!, keys[key]);
        const label = `${skillName(id)} · ${keys[key]}`;
        button.setAttribute('aria-label', label); button.dataset.tip = label;
      }); this.refreshIcons();
    }
    document.querySelectorAll<HTMLButtonElement>('.skill[data-skill]').forEach(button => {
      const remaining = game.cooldowns[button.dataset.skill as Skill], cooldown = button.querySelector<HTMLElement>('.cooldown')!;
      setText(cooldown, remaining > .1 ? remaining.toFixed(1) : ''); button.classList.toggle('on-cooldown', remaining > .1);
      const id = h.bindings[button.dataset.skill as Skill];
      button.classList.toggle('no-mana', h.mana < skillValues(id, skillLevel(h, id), h.skills).cost);
      button.classList.toggle('aura-active', h.activeAura === id);
    });
    const action = game.contextAction(), context = document.getElementById('context-action')!;
    context.hidden = !action || game.paused || game.dead; if (action) setText(context.querySelector('span')!, action.name);
    const boss = game.enemies.find(e => e.boss && !e.dead && e.actor.group.position.distanceTo(game.position) < 14), bar = document.getElementById('boss-bar')!;
    bar.hidden = !boss; if (boss) { bar.querySelector<HTMLElement>('i')!.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`; setText(bar.querySelector('span')!, boss.name); setText(bar.querySelector('small')!, questComplete(h.campaign) ? game.monsterCombat.telegraph(boss)?.name ?? (game.level.actBoss ? '章节首领' : '守关首领') : '完成当前任务后现身'); }
    const aliveKeys = new Set<string>();
    const controlRects = ['joystick', 'mobile-attack'].map(id => document.getElementById(id)!)
      .filter(element => element.getClientRects().length).map(element => element.getBoundingClientRect());
    for (const chest of game.world.chests) {
      if (chest.opened || Math.hypot(chest.x - game.position.x, chest.z - game.position.z) > 11) continue;
      const point = game.project(new THREE.Vector3(chest.x, 1.3, chest.z));
      if (!point.visible || point.x < 50 || point.x > innerWidth - 50 || point.y < 95 || point.y > innerHeight - 155) continue;
      const key = `chest-${chest.id}`; aliveKeys.add(key); let label = this.labelNodes.get(key);
      if (!label) { label = document.createElement('button'); label.className = 'world-chest-label'; label.dataset.chest = String(chest.id); setText(label, '箱子'); label.setAttribute('aria-label', `打开箱子 ${chest.id + 1}`); this.labels.append(label); this.labelNodes.set(key, label); }
      label.hidden = game.paused;
      let y = point.y;
      for (const rect of controlRects) if (point.x + label.offsetWidth / 2 > rect.left - 6 && point.x - label.offsetWidth / 2 < rect.right + 6 && y > rect.top - 6 && y - label.offsetHeight < rect.bottom + 6) y = rect.top - 8;
      label.style.transform = `translate(${point.x}px, ${y}px) translate(-50%, -100%)`;
    }
    if (game.inCamp) {
      const merchantPoint = game.project(new THREE.Vector3(CAMP.baseMerchant.x, 2, CAMP.baseMerchant.z));
      if (mercenaryUnlocked(h)) {
        const p = game.project(new THREE.Vector3(CAMP.mercenaryMerchant.x, 2, CAMP.mercenaryMerchant.z));
        if (p.visible && p.x > 40 && p.x < innerWidth - 40 && p.y > 50 && p.y < innerHeight - 110) {
          const key = 'mercenary-merchant'; aliveKeys.add(key); let label = this.labelNodes.get(key);
          if (!label) { label = document.createElement('button'); label.className = 'camp-portal-label'; label.dataset.action = key; setMarkup(label, `${icon('swords')}佣兵商人`); this.labels.append(label); this.labelNodes.set(key, label); this.refreshIcons(); }
          label.hidden = game.paused; label.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%, -100%)`;
        }
      }
      if (merchantPoint.visible && merchantPoint.x > 45 && merchantPoint.x < innerWidth - 45 && merchantPoint.y > 50 && merchantPoint.y < innerHeight - 110) {
        const key = 'base-merchant'; aliveKeys.add(key); let label = this.labelNodes.get(key);
        if (!label) { label = document.createElement('button'); label.className = 'camp-portal-label'; label.dataset.action = key; setMarkup(label, `${icon('hammer')}底材商人`); this.labels.append(label); this.labelNodes.set(key, label); this.refreshIcons(); }
        label.hidden = game.paused; label.style.transform = `translate(${merchantPoint.x}px,${merchantPoint.y}px) translate(-50%, -100%)`;
      }
      const stashPoint = game.project(new THREE.Vector3(CAMP.stash.x, 1.4, CAMP.stash.z));
      if (stashPoint.visible && stashPoint.x > 65 && stashPoint.x < innerWidth - 65 && stashPoint.y > 50 && stashPoint.y < innerHeight - 150) {
        const key = 'shared-stash'; aliveKeys.add(key); let label = this.labelNodes.get(key);
        if (!label) { label = document.createElement('button'); label.className = 'camp-portal-label'; label.dataset.action = 'shared-stash'; setMarkup(label, `${icon('archive')}本地共享仓库`); this.labels.append(label); this.labelNodes.set(key, label); this.refreshIcons(); }
        label.hidden = game.paused; label.style.transform = `translate(${stashPoint.x}px,${stashPoint.y}px) translate(-50%, -100%)`;
      }
      const point = game.project(new THREE.Vector3(CAMP.portal.x, 1.3, CAMP.portal.z));
      if (point.visible && point.x > 70 && point.x < innerWidth - 70 && point.y > 45 && point.y < innerHeight - 150) {
        const key = 'camp-portal'; aliveKeys.add(key);
        let label = this.labelNodes.get(key);
        if (!label) {
          label = document.createElement('button'); label.className = 'camp-portal-label'; label.dataset.action = 'camp-portal';
          setMarkup(label, `${icon('compass')}远征传送阵`); this.labels.append(label); this.labelNodes.set(key, label); this.refreshIcons();
        }
        label.hidden = game.paused; label.style.transform = `translate(${point.x}px, ${Math.max(90, point.y)}px) translate(-50%, -100%)`;
      }
    }
    if (game.inCamp) {
      const point = game.project(new THREE.Vector3(CAMP.mysteryPortal.x, 1.3, CAMP.mysteryPortal.z));
      if (point.visible && point.x > 70 && point.x < innerWidth - 70 && point.y > 45 && point.y < innerHeight - 150) {
        const key = 'mystery-portal'; aliveKeys.add(key); let label = this.labelNodes.get(key);
        if (!label) { label = document.createElement('button'); label.className = 'camp-portal-label'; label.dataset.action = 'mystery-portal'; setMarkup(label, `${icon('sparkles')}神秘传送阵`); this.labels.append(label); this.labelNodes.set(key, label); this.refreshIcons(); }
        label.hidden = game.paused; label.style.transform = `translate(${point.x}px, ${Math.max(90, point.y)}px) translate(-50%, -100%)`;
      }
    }
    const mysteryCorpse = game.world.mysteryCorpse;
    if (mysteryCorpse && !mysteryCorpse.opened && Math.hypot(mysteryCorpse.x - game.position.x, mysteryCorpse.z - game.position.z) <= 11) {
      const point = game.project(new THREE.Vector3(mysteryCorpse.x, 1.15, mysteryCorpse.z));
      if (point.visible && point.x > 55 && point.x < innerWidth - 55 && point.y > 85 && point.y < innerHeight - 150) {
        const key = 'mystery-corpse'; aliveKeys.add(key); let label = this.labelNodes.get(key);
        if (!label) { label = document.createElement('button'); label.className = 'world-chest-label'; label.dataset.action = 'mystery-corpse'; setText(label, '神秘尸体'); this.labels.append(label); this.labelNodes.set(key, label); }
        label.hidden = game.paused; label.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
      }
    }
    for (const enemy of game.enemies) {
      if (enemy.dead || enemy.boss || enemy.actor.group.position.distanceTo(game.position) > 16) continue;
      const point = game.project(enemy.actor.group.position.clone().add(new THREE.Vector3(0, enemy.elite ? 2.5 : 2, 0))); if (!point.visible || point.x < 0 || point.x > innerWidth || point.y < 0 || point.y > innerHeight - 120) continue;
      const key = `e${enemy.id}`; aliveKeys.add(key);
      let el = this.labelNodes.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'enemy-label'; setMarkup(el, `<span>${enemy.name}</span><div><i></i></div>`); this.labels.append(el); this.labelNodes.set(key, el); }
      el.classList.toggle('elite-label', !!enemy.elite);
      el.style.transform = `translate(${enemy.elite ? Math.max(60, Math.min(innerWidth - 60, point.x)) : point.x}px,${point.y}px)`; el.classList.toggle('active', !!enemy.elite || enemy.active || this.hoveredEnemy === enemy); el.querySelector<HTMLElement>('i')!.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
    }
    const lootRects: { x: number; y: number; width: number; height: number }[] = controlRects.map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));
    for (const loot of game.loot) {
      if ((!loot.item && !loot.rune) || Math.hypot(loot.x - game.position.x, loot.z - game.position.z) > 15) continue;
      const point = game.project(new THREE.Vector3(loot.x, .5, loot.z)); if (point.x < 40 || point.x > innerWidth - 40 || point.y < 40 || point.y > innerHeight - 130) continue;
      const key = `l${loot.id}`; aliveKeys.add(key); let el = this.labelNodes.get(key);
      if (!el) { el = document.createElement('button'); el.className = `loot-label ${loot.item?.rarity ?? 'runeword'}`; setText(el, (loot.item ? groundItemName(loot.item) : undefined) ?? `${runeLabel(loot.rune!)}符文`); el.dataset.loot = String(loot.id); this.labels.append(el); this.labelNodes.set(key, el); }
      const viewport = `${innerWidth}:${innerHeight}:${devicePixelRatio}`;
      let size = this.labelSizes.get(el);
      if (!size || size.viewport !== viewport) { el.hidden = false; size = { width: el.offsetWidth, height: el.offsetHeight, viewport }; this.labelSizes.set(el, size); }
      const { width, height } = size, x = Math.max(12, Math.min(innerWidth - width - 12, point.x - width / 2));
      const overlaps = (y: number) => lootRects.some(rect => x < rect.x + rect.width + 3 && x + width + 3 > rect.x && y < rect.y + rect.height + 3 && y + height + 3 > rect.y);
      let y = point.y + 12;
      while (overlaps(y) && y + height < innerHeight - 130) y += height + 4;
      if (y + height >= innerHeight - 130) { y = point.y - height - 12; while (overlaps(y) && y >= 55) y -= height + 4; }
      if (y < 55 || y + height >= innerHeight - 130) { el.hidden = true; continue; }
      el.hidden = false;
      lootRects.push({ x, y, width, height });
      el.style.transform = `translate(${x + 45}px,${y}px)`;
      el.classList.toggle('is-pickup-target', game.pendingPickup === loot.id);
      const contested = game.enemies.some(enemy => game.combat.hostile(enemy) && enemy.actor.group.position.distanceTo(game.position) < 7 && Math.hypot(enemy.actor.group.position.x - loot.x, enemy.actor.group.position.z - loot.z) < 3);
      el.style.pointerEvents = contested ? 'none' : 'auto';
    }
    for (const [key, el] of this.labelNodes) if (!aliveKeys.has(key)) { el.remove(); this.labelNodes.delete(key); }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const float = this.floats[i]; if (!game.paused) float.time -= dt;
      if (float.time <= 0) { float.element.remove(); this.floats.splice(i, 1); continue; }
      const point = game.project(float.position); float.element.style.transform = `translate(${point.x}px, ${point.y - (1.1 - float.time) * 48}px)`; float.element.style.opacity = String(Math.min(1, float.time * 2));
    }
    if (this.timer > .16) { this.timer = 0; this.drawMap(); }
  }
}
