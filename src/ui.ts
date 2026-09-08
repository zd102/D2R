import * as THREE from 'three';
import { createIcons, Swords, Sword, Flame, Wind, Zap, Footprints, Backpack, UserRound, Users, UserPlus, Pencil, ArrowLeft, Map as MapIcon, ScrollText, Settings, Pause, Volume2, VolumeX, Maximize, Save, X, ChevronRight, Plus, Coins, Shield, Gem, Heart, Skull, Check, RotateCcw, Play, Trash2, ArrowUp, Droplets, Sparkles, Compass, Crosshair } from 'lucide';
import type { Game, Enemy, Skill } from './game';
import { stats, rarityNames, slotNames, type Item } from './model';
import { ACTS, levelLayout, levelTuning, questProgress, questComplete } from './campaign';
import { CampaignScreen } from './campaign-ui';
import { ProfileScreen, type ProfilePanel } from './profiles-ui';
import { CharacterScreen } from './character-ui';
import { skillLevel, difficulty, difficultyNames } from './model';
import { skillName, skillIcon, skillValues, type Attribute } from './paladin';
import { RUNES } from './items';
import { Hammer, ShieldCheck, Sun, Focus, Snowflake, Church, Eye, HeartPulse, BookOpen, Shirt, Crown, Hand, RectangleEllipsis, Circle, Archive, ArrowLeftRight, ScanEye, Wrench, ArrowDown } from 'lucide';

type Panel = 'inventory' | 'character' | 'skills' | 'map' | 'quest' | 'pause' | 'shop' | 'death' | 'victory' | 'campaign' | ProfilePanel;
const icons = { Hammer, ShieldCheck, Sun, Focus, Snowflake, Church, Eye, HeartPulse, BookOpen, Shirt, Crown, Hand, RectangleEllipsis, Circle, Archive, ArrowLeftRight, ScanEye, Wrench, ArrowDown, Swords, Sword, Flame, Wind, Zap, Footprints, Backpack, UserRound, Users, UserPlus, Pencil, ArrowLeft, Map: MapIcon, ScrollText, Settings, Pause, Volume2, VolumeX, Maximize, Save, X, ChevronRight, Plus, Coins, Shield, Gem, Heart, Skull, Check, RotateCcw, Play, Trash2, ArrowUp, Droplets, Sparkles, Compass, Crosshair };
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const itemIcon = (item: Item) => icon(item.slot === 'weapon' ? 'sword' : item.slot === 'armor' ? 'shield' : 'gem');
const tip = (label: string) => `aria-label="${label}" data-tip="${label}"`;

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
  floats: { element: HTMLElement; position: THREE.Vector3; time: number }[] = [];
  timer = 0;
  damageTimer?: ReturnType<typeof setTimeout>;
  game: Game;
  profileScreen: ProfileScreen;
  characterScreen: CharacterScreen;
  campaignScreen: CampaignScreen;
  bindingsSignature = '';
  constructor(game: Game) {
    this.game = game;
    document.getElementById('app')!.insertAdjacentHTML('beforeend', `
      <div class="vignette" aria-hidden="true"></div><div id="damage-flash"></div>
      <header class="topbar">
        <div class="identity"><div class="title-row"><img src="/sigil.svg" alt="" class="brand-sigil"/><h1>黯蚀 <span>II</span></h1></div><div class="edition">ECLIPSE <span>·</span> 余烬之誓</div></div>
        <div class="top-tools"><span class="offline"><b></b>单人旅程</span><button ${tip('保存旅程')} data-action="save">${icon('save')}</button><button ${tip('声音')} id="sound-button" data-action="sound">${icon('volume-2')}</button><button ${tip('设置')} data-panel="pause">${icon('settings')}</button></div>
      </header>
      <aside class="world-info"><div class="location"><span class="chapter">第 1 章 · 第 1 关</span><h2>邪恶洞窟</h2><span id="difficulty">普通 · Lv. 1</span></div>
        <button class="minimap-button" ${tip('区域地图')} data-panel="map"><canvas id="minimap" width="200" height="150"></canvas><span class="map-north">N</span><span class="map-expand">${icon('maximize')}</span></button>
        <button class="quest-track" data-panel="quest"><span class="quest-eyebrow">${icon('scroll-text')} 当前任务</span><strong>邪恶的巢穴</strong><span id="quest-step">消灭洞窟魔物 0 / 8</span><span class="quest-final">击败尸体发火</span></button>
      </aside>
      <div id="boss-bar" hidden><span>尸体发火</span><div><i></i></div><small>守关首领</small></div>
      <div id="world-labels"></div><div id="floating-text"></div><div id="toasts" aria-live="polite"></div>
      <div class="area-caption"><span class="ornament-line"></span><span>邪恶洞窟</span><small>DEN OF EVIL</small></div>
      <button id="context-action" hidden><kbd>F</kbd><span></span>${icon('chevron-right')}</button>
      <div class="mobile-controls"><div id="joystick" aria-label="移动摇杆"><div></div></div><button id="mobile-attack" ${tip('攻击')} data-skill="attack">${icon('swords')}</button></div>
      <footer class="hud">
        <div class="resource health"><div class="orb-frame"><div class="orb"><div class="orb-fill" id="health-fill"></div><div class="orb-shine"></div><span id="health-value">55<small>/ 55</small></span></div></div><div class="resource-caption"><span>生命</span><small id="health-percent">100%</small></div></div>
        <div class="hud-center"><div class="hero-strip"><span class="hero-name"><span id="hero-profile-name">圣骑士</span><b id="hero-level">Lv. 1</b></span><div class="xp-track" ${tip('经验')}><i id="xp-fill"></i></div><span id="xp-value">0 / 80</span></div>
          <div class="action-row"><div class="skill-group">
            ${(['attack', 'cleave', 'nova', 'dash', 'bolt'] as const).map((key, index) => `<button class="skill ${key}-skill" data-skill="${key}" ${tip(index ? '配置技能' : '普通攻击')}><kbd>${['鼠左', 'Q', 'E', 'R', '鼠右'][index]}</kbd>${icon(index ? 'plus' : 'sword')}<span class="skill-name">${index ? '未配置' : '普通攻击'}</span><span class="cooldown"></span></button>`).join('')}
          </div><span class="belt-divider"></span><div class="potion-group">
            <button class="skill health-potion" data-potion="0" ${tip('生命药剂 · 1')}><kbd>1</kbd>${icon('flame')}<b id="health-potions">6</b></button>
            <button class="skill mana-potion" data-potion="1" ${tip('法力药剂 · 2')}><kbd>2</kbd>${icon('droplets')}<b id="mana-potions">4</b></button>
          </div></div>
          <div class="paladin-status"><span id="active-aura-label">无灵气</span><span id="holy-shield-label"></span><button data-action="run-mode" ${tip('切换跑步与行走')}><i data-lucide="footprints"></i></button><div class="stamina-track" ${tip('耐力')}><i id="stamina-fill"></i></div></div>
          <nav class="bottom-nav"><button data-panel="character" ${tip('角色 · C')}>${icon('user-round')}<span>角色</span><b id="points-badge" hidden></b></button><button data-panel="skills" ${tip('技能 · T')}>${icon('book-open')}<span>技能</span><b id="skill-points-badge" hidden></b></button><button data-panel="inventory" ${tip('背包 · I')}>${icon('backpack')}<span>背包</span></button><button data-panel="quest" ${tip('任务 · J')}>${icon('scroll-text')}<span>任务</span></button><button data-panel="map" ${tip('地图 · Tab')}>${icon('map')}<span>地图</span></button><span class="gold-count">${icon('coins')}<b id="gold-value">0</b></span><button data-panel="pause" ${tip('暂停 · Esc')}>${icon('pause')}</button></nav>
        </div>
        <div class="resource mana"><div class="orb-frame"><div class="orb"><div class="orb-fill" id="mana-fill"></div><div class="orb-shine"></div><span id="mana-value">15<small>/ 15</small></span></div></div><div class="resource-caption"><span>法力</span><small id="mana-percent">100%</small></div></div>
      </footer>
      <div id="overlay" hidden></div><div class="corner-mark">ECLIPSE II <span>·</span> LOCAL REALM</div>
    `);
    this.mapCanvas = document.getElementById('minimap') as HTMLCanvasElement; this.mapCtx = this.mapCanvas.getContext('2d')!;
    this.overlay = document.getElementById('overlay')!; this.toastContainer = document.getElementById('toasts')!; this.labels = document.getElementById('world-labels')!;
    this.profileScreen = new ProfileScreen(game, this);
    this.characterScreen = new CharacterScreen(game, this);
    this.campaignScreen = new CampaignScreen(this);
    this.bind(); this.refreshIcons();
  }
  refreshIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.5 } }); }
  bind() {
    document.addEventListener('click', event => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('button'); if (!element) return;
      this.game.audio.unlock();
      if (element.dataset.panel) this.togglePanel(element.dataset.panel as Panel);
      if (element.dataset.skill) this.game.useSkill(element.dataset.skill as Skill);
      if (element.dataset.potion) this.game.drink(Number(element.dataset.potion) as 0 | 1);
      if (element.dataset.item) { this.selectedItem = element.dataset.item; this.renderPanel(); }
      if (element.dataset.equip) this.game.equip(element.dataset.equip);
      if (element.dataset.salvage) this.game.salvage(element.dataset.salvage);
      if (element.dataset.allocate) this.game.allocate(element.dataset.allocate as Attribute, Number(element.dataset.count ?? 1));
      if (element.dataset.buy) this.game.buy(Number(element.dataset.buy) as 0 | 1);
      if (element.dataset.loot) this.game.pickup(Number(element.dataset.loot));
      switch (element.dataset.action) {
        case 'close': this.closePanel(); break;
        case 'save': this.game.save(); break;
        case 'sound': this.game.audio.volume = this.game.audio.volume ? 0 : .35; element.innerHTML = icon(this.game.audio.volume ? 'volume-2' : 'volume-x'); this.refreshIcons(); break;
        case 'fullscreen': if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => this.toast('全屏暂不可用')); break;
        case 'revive': this.game.revive(); break;
        case 'next': this.game.nextJourney(); break;
        case 'profiles': this.game.returnToProfiles(); break;
        case 'run-mode': this.game.hero.running = !this.game.hero.running; this.game.save(false); break;
        case 'restore': this.game.hero.hp = stats(this.game.hero).maxHp; this.game.hero.mana = stats(this.game.hero).maxMana; this.toast('生命与法力已恢复'); this.game.save(false); break;
      }
    });
    this.overlay.addEventListener('click', event => { if (event.target === this.overlay && !this.isProfilePanel() && !['death', 'victory'].includes(this.panel ?? '')) this.closePanel(); });
    this.overlay.addEventListener('input', event => { const element = event.target as HTMLInputElement; if (element.id === 'volume') { this.game.audio.volume = Number(element.value) / 100; document.getElementById('volume-value')!.textContent = `${element.value}%`; } });
    this.overlay.addEventListener('change', event => { const element = event.target as HTMLInputElement; if (element.id === 'quality') this.game.setQuality(element.value); });
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
  togglePanel(panel: Panel) { this.panel === panel ? this.closePanel() : this.openPanel(panel); }
  isProfilePanel(panel = this.panel) { return ['profiles', 'new-profile', 'rename-profile', 'delete-profile', 'save-conflict'].includes(panel ?? ''); }
  openPanel(panel: Panel) {
    if (!this.game.profile && !this.isProfilePanel(panel)) return;
    if (this.game.saveConflict && panel !== 'save-conflict') return;
    if (this.game.dead && panel !== 'death' && panel !== 'save-conflict') return;
    if (panel === 'campaign') this.campaignScreen.reset();
    if (panel === 'victory' && !this.game.hero.bossDefeated) return;
    if (panel === 'victory') this.campaignScreen.replayConfirm = false;
    this.panel = panel; this.game.paused = true; this.game.releaseInput(); this.overlay.hidden = false;
    this.renderPanel();
    (this.overlay.querySelector<HTMLInputElement>('#profile-name') ?? this.overlay.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? this.overlay.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
  }
  closePanel() {
    this.characterScreen.inventoryDrag.cancel();
    if (this.game.dead || this.game.saveConflict) return;
    if (!this.game.profile) {
      if (this.panel !== 'profiles') this.openPanel('profiles');
      return;
    }
    this.overlay.classList.remove('profile-overlay'); document.getElementById('app')!.classList.remove('is-roster');
    this.panel = undefined; this.game.paused = false; this.overlay.hidden = true; this.overlay.innerHTML = ''; this.game.renderer.domElement.focus({ preventScroll: true });
  }
  renderPanel() {
    this.characterScreen.inventoryDrag.cancel();
    if (!this.panel) return;
    if (this.isProfilePanel()) { this.profileScreen.render(); return; }
    this.overlay.classList.remove('profile-overlay');
    const h = this.game.hero, s = stats(h);
    const titles: Record<Exclude<Panel, ProfilePanel>, [string, string]> = {
      campaign: ['章节关卡', 'CAMPAIGN'],
      inventory: ['行囊', 'INVENTORY'], character: ['圣骑士', 'PALADIN'], skills: ['圣骑士技能', 'PALADIN SKILLS'], map: ['区域地图', 'AREA MAP'], quest: ['当前任务', 'QUEST JOURNAL'], pause: ['旅程暂歇', 'PAUSED'], shop: ['旅者补给', 'WAYFARER'], death: ['你已陨落', 'YOU HAVE FALLEN'], victory: ['长夜将尽', 'THE OATH FULFILLED'],
    };
    titles.quest = [this.game.level.quest.name, 'QUEST JOURNAL'];
    titles.map = [this.game.level.name, 'AREA MAP'];
    titles.victory = [this.game.level.index === 24 ? '难度通关' : this.game.level.actBoss ? '章节完成' : '关卡完成', 'AREA COMPLETE'];
    const panelTitle = titles[this.panel as keyof typeof titles];
    let content = '';
    if (this.panel === 'campaign') {
      content = this.campaignScreen.render();
    } else if (this.panel === 'inventory') {
      content = this.characterScreen.inventory();
    } else if (this.panel === 'character') {
      content = this.characterScreen.character();
    } else if (this.panel === 'skills') {
      content = this.characterScreen.skills();
    } else if (this.panel === 'map') {
      content = '<canvas id="large-map" width="700" height="570"></canvas><div class="map-legend"><span><i class="legend-player"></i>圣骑士</span><span><i class="legend-shrine"></i>任务目标</span><span><i class="legend-enemy"></i>敌人</span><span><i class="legend-portal"></i>传送门</span></div>';
    } else if (this.panel === 'quest') {
      content = this.campaignScreen.quest();
    } else if (this.panel === 'pause') {
      content = `<div class="pause-sigil"><img src="/sigil.svg" alt="" /></div><button class="primary-button" data-action="close">${icon('play')}继续旅程</button><button class="secondary-button" data-action="save">${icon('save')}保存旅程</button><button class="secondary-button" data-action="profiles">${icon('users')}保存并切换角色</button><div class="settings-row"><label for="volume">${icon('volume-2')}音效</label><input id="volume" type="range" min="0" max="100" value="${Math.round(this.game.audio.volume * 100)}"/><span id="volume-value">${Math.round(this.game.audio.volume * 100)}%</span></div><div class="settings-row"><label for="quality">画质</label><select id="quality"><option value="high" ${this.game.quality === 'high' ? 'selected' : ''}>精细</option><option value="low" ${this.game.quality === 'low' ? 'selected' : ''}>流畅</option></select><button ${tip('切换全屏')} data-action="fullscreen">${icon('maximize')}</button></div><div class="save-state"><i></i>${this.game.storageAvailable ? '本地自动存档' : '本地存档不可用'}</div>`;
    } else if (this.panel === 'shop') {
      content = `<div class="shop-intro">${icon('compass')}<p>归途的灯火，总为旅者而亮。</p></div><button class="secondary-button" data-action="restore">${icon('heart')}圣泉祝福 · 恢复状态</button><div class="shop-items">${([0, 1] as const).map(index => `<div><div class="shop-item-icon ${index === 0 ? 'red-text' : 'blue-text'}">${icon(index === 0 ? 'flame' : 'droplets')}</div><div><h3>${index === 0 ? '生命' : '法力'}药剂</h3><small>持有 ${h.potions[index]}</small></div><button class="secondary-button" data-buy="${index}" ${h.gold < 25 ? 'disabled' : ''}>${icon('coins')}25</button></div>`).join('')}</div><div class="inventory-gold">${icon('coins')}${h.gold.toLocaleString()}<small>金币</small></div>`;
    } else if (this.panel === 'death') {
      content = `<div class="end-mark death-mark">${icon('skull')}</div><p class="end-story">灰烬尚温，誓约未尽。</p><div class="end-stats"><span>等级 <b>${h.level}</b></span><span>击杀 <b>${h.kills}</b></span></div><p class="death-cost">遗体保留装备 · 遗失 ${h.corpse?.gold ?? 0} 金币</p><button class="primary-button" data-action="revive">${icon('rotate-ccw')}在传送阵重生</button>`;
    } else if (this.panel === 'victory') {
      content = this.campaignScreen.victory();
    }
    this.overlay.innerHTML = `<section class="panel panel-${this.panel}" role="dialog" aria-modal="true" aria-label="${panelTitle[0]}"><header class="panel-header"><div><small>${panelTitle[1]}</small><h2>${panelTitle[0]}</h2></div>${this.panel !== 'death' ? `<button ${tip('关闭')} data-action="close">${icon('x')}</button>` : ''}</header><div class="panel-body">${content}</div><div class="panel-footer"><span></span><img src="/sigil.svg" alt=""/><span></span></div></section>`;
    const characterName = this.overlay.querySelector('.character-banner h3');
    if (characterName) characterName.textContent = this.game.profile?.name ?? '灰烬行者';
    if (this.panel === 'pause') this.overlay.querySelector('.panel-body')!.insertAdjacentHTML('beforeend', `<button class="secondary-button" data-panel="campaign">${icon('map')}关卡选择</button>${h.bossDefeated ? `<button class="secondary-button" data-panel="victory">${icon('chevron-right')}通关结算</button>` : ''}`);
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
    const scale = Math.min(w / 86, h / 72), point = (x: number, z: number) => ({ x: w / 2 + (x - z) * .707 * scale, y: h / 2 + (x + z) * .48 * scale });
    const poly = (x: number, z: number, width: number, depth: number, color: string) => {
      ctx.fillStyle = color; ctx.beginPath(); [[x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2], [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]].forEach(([px, pz], index) => { const p = point(px, pz); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
    };
    poly(0, 0, 55, 55, '#24302b');
    this.game.world.floorCells.forEach(p => poly(p.x, p.z, 1.05, 1.05, '#697667'));
    if (large) {
      for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) if (!this.game.visited.has(`${x},${z}`)) poly(x * 3, z * 3, 3.05, 3.05, 'rgba(5,11,11,.48)');
    }
    const dot = (x: number, z: number, color: string, radius: number, diamond = false) => { const p = point(x, z); ctx.fillStyle = color; ctx.beginPath(); if (diamond) { ctx.moveTo(p.x, p.y - radius); ctx.lineTo(p.x + radius, p.y); ctx.lineTo(p.x, p.y + radius); ctx.lineTo(p.x - radius, p.y); } else ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); };
    this.game.enemies.forEach(e => { if (!e.dead && (e.boss || e.actor.group.position.distanceTo(this.game.position) < 12)) dot(e.actor.group.position.x, e.actor.group.position.z, e.boss ? '#ef846b' : '#c56456', e.boss ? 4 : 2); });
    levelLayout(this.game.level).objects.forEach((p, i) => { const complete = this.game.hero.campaign.objects.includes(i); dot(p.x, p.z, complete ? '#81d1b5' : ACTS[this.game.level.act].color, large ? 6 : 3.7, true); });
    if (this.game.hero.bossDefeated) dot(0, -26, '#cfe69b', large ? 6 : 4, true);
    dot(-5.8, 12, '#63c8c8', large ? 5 : 3); dot(this.game.position.x, this.game.position.z, '#fff2c7', large ? 5 : 3, true);
    if (large) { ctx.fillStyle = '#7f8c84'; ctx.font = '13px Georgia'; ctx.fillText('N', w / 2 + 14, 30); const p = point(0, 22); ctx.textAlign = 'center'; ctx.fillStyle = '#c0b397'; ctx.font = '15px serif'; ctx.fillText('归途之门', p.x, p.y + 23); }
  }
  update(dt: number) {
    if (!this.game.profile) return;
    const game = this.game, h = game.hero, s = stats(h);
    this.timer += dt;
    const hp = Math.ceil(h.hp), mana = Math.floor(h.mana);
    document.getElementById('health-fill')!.style.height = `${h.hp / s.maxHp * 100}%`;
    document.getElementById('mana-fill')!.style.height = `${h.mana / s.maxMana * 100}%`;
    document.getElementById('health-value')!.innerHTML = `${hp}<small>/ ${s.maxHp}</small>`;
    document.getElementById('mana-value')!.innerHTML = `${mana}<small>/ ${s.maxMana}</small>`;
    document.getElementById('health-percent')!.textContent = `${Math.ceil(h.hp / s.maxHp * 100)}%`;
    document.getElementById('mana-percent')!.textContent = `${Math.floor(h.mana / s.maxMana * 100)}%`;
    document.getElementById('hero-level')!.textContent = `Lv. ${h.level}`;
    document.getElementById('xp-value')!.textContent = h.level === 99 ? 'MAX' : `${Math.floor(h.xp / s.xpNeeded * 100)}%`;
    document.getElementById('xp-fill')!.style.width = `${h.level === 99 ? 100 : Math.min(100, h.xp / s.xpNeeded * 100)}%`;
    document.getElementById('health-potions')!.textContent = String(h.potions[0]); document.getElementById('mana-potions')!.textContent = String(h.potions[1]);
    document.getElementById('gold-value')!.textContent = h.gold.toLocaleString(); document.getElementById('difficulty')!.textContent = `${difficultyNames[difficulty(h)]} · Lv. ${levelTuning(game.level, difficulty(h)).level}`;
    document.querySelector('.location .chapter')!.textContent = `第 ${game.level.act + 1} 章 · 第 ${game.level.step + 1} 关`;
    document.querySelector('.location h2')!.textContent = game.level.name;
    document.querySelector('.quest-track strong')!.textContent = game.level.quest.name;
    document.querySelector('.area-caption>span:last-of-type')!.textContent = game.level.name;
    document.querySelector('.area-caption>small')!.textContent = game.level.english;
    document.getElementById('quest-step')!.textContent = `${game.level.quest.action} ${questProgress(h.campaign)} / ${game.level.quest.count}`;
    const questFinal = document.querySelector('.quest-final')!; questFinal.textContent = h.bossDefeated ? `${game.level.boss}已被击败` : `${questComplete(h.campaign) ? '击败' : '完成任务后挑战'}${game.level.boss}`; questFinal.classList.toggle('complete', h.bossDefeated);
    const badge = document.getElementById('points-badge')!; badge.hidden = !h.points; badge.textContent = String(h.points);
    const skillBadge = document.getElementById('skill-points-badge')!; skillBadge.hidden = !h.skillPoints; skillBadge.textContent = String(h.skillPoints);
    document.getElementById('active-aura-label')!.textContent = h.activeAura ? skillName(h.activeAura) : '无灵气';
    document.getElementById('holy-shield-label')!.textContent = h.holyShield > 0 ? `圣盾 ${Math.ceil(h.holyShield)}s` : h.poison > 0 ? '中毒' : h.curse > 0 ? '伤害加深' : '';
    document.getElementById('stamina-fill')!.style.width = `${Math.min(100, h.stamina / s.maxStamina * 100)}%`;
    const runButton = document.querySelector<HTMLButtonElement>('[data-action="run-mode"]')!; runButton.setAttribute('aria-pressed', String(h.running)); runButton.dataset.tip = h.running ? '跑步' : '行走';
    const signature = JSON.stringify(h.bindings);
    if (signature !== this.bindingsSignature) {
      this.bindingsSignature = signature;
      document.querySelectorAll<HTMLButtonElement>('.skill[data-skill]').forEach(button => {
        const key = button.dataset.skill as Skill, id = h.bindings[key], unbound = key !== 'attack' && id === 'attack';
        button.querySelector('svg')?.remove(); button.insertAdjacentHTML('beforeend', icon(unbound ? 'plus' : skillIcon(id)));
        button.querySelector('.skill-name')!.textContent = unbound ? '未配置' : skillName(id);
        const label = unbound ? `${({ cleave: '快捷一', nova: '快捷二', dash: '快捷三', bolt: '副攻击', attack: '主攻击' })[key]} · 配置技能` : skillName(id);
        button.setAttribute('aria-label', label); button.dataset.tip = label;
      }); this.refreshIcons();
    }
    document.querySelectorAll<HTMLButtonElement>('.skill[data-skill]').forEach(button => {
      const remaining = game.cooldowns[button.dataset.skill as Skill], cooldown = button.querySelector<HTMLElement>('.cooldown')!;
      cooldown.textContent = remaining > .1 ? remaining.toFixed(1) : ''; button.classList.toggle('on-cooldown', remaining > .1);
      const id = h.bindings[button.dataset.skill as Skill];
      button.classList.toggle('no-mana', h.mana < skillValues(id, skillLevel(h, id), h.skills).cost);
      button.classList.toggle('aura-active', h.activeAura === id);
    });
    const action = game.contextAction(), context = document.getElementById('context-action')!;
    context.hidden = !action || game.paused || game.dead; if (action) context.querySelector('span')!.textContent = action.name;
    const boss = game.enemies.find(e => e.boss && !e.dead && e.actor.group.position.distanceTo(game.position) < 14), bar = document.getElementById('boss-bar')!;
    bar.hidden = !boss; if (boss) { bar.querySelector<HTMLElement>('i')!.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`; bar.querySelector('span')!.textContent = boss.name; bar.querySelector('small')!.textContent = questComplete(h.campaign) ? game.monsterCombat.telegraph(boss)?.name ?? (game.level.actBoss ? '章节首领' : '守关首领') : '完成当前任务后现身'; }
    const aliveKeys = new Set<string>();
    for (const enemy of game.enemies) {
      if (enemy.dead || enemy.boss || enemy.actor.group.position.distanceTo(game.position) > 16) continue;
      const point = game.project(enemy.actor.group.position.clone().add(new THREE.Vector3(0, 2, 0))); if (!point.visible || point.x < 0 || point.x > innerWidth || point.y < 0 || point.y > innerHeight - 120) continue;
      const key = `e${enemy.id}`; aliveKeys.add(key);
      let el = this.labelNodes.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'enemy-label'; el.innerHTML = `<span>${enemy.name}</span><div><i></i></div>`; this.labels.append(el); this.labelNodes.set(key, el); }
      el.style.transform = `translate(${point.x}px,${point.y}px)`; el.classList.toggle('active', enemy.active || this.hoveredEnemy === enemy); el.querySelector<HTMLElement>('i')!.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
    }
    const lootRects: { x: number; y: number; width: number; height: number }[] = [];
    for (const loot of game.loot) {
      if ((!loot.item && !loot.rune) || Math.hypot(loot.x - game.position.x, loot.z - game.position.z) > 15) continue;
      const point = game.project(new THREE.Vector3(loot.x, .5, loot.z)); if (point.x < 40 || point.x > innerWidth - 40 || point.y < 40 || point.y > innerHeight - 130) continue;
      const key = `l${loot.id}`; aliveKeys.add(key); let el = this.labelNodes.get(key);
      if (!el) { el = document.createElement('button'); el.className = `loot-label ${loot.item?.rarity ?? 'runeword'}`; el.textContent = loot.item?.name ?? `${RUNES[loot.rune!].name}符文`; el.dataset.loot = String(loot.id); this.labels.append(el); this.labelNodes.set(key, el); }
      el.hidden = false;
      const width = el.offsetWidth, height = el.offsetHeight, x = Math.max(12, Math.min(innerWidth - width - 12, point.x - width / 2));
      const overlaps = (y: number) => lootRects.some(rect => x < rect.x + rect.width + 3 && x + width + 3 > rect.x && y < rect.y + rect.height + 3 && y + height + 3 > rect.y);
      let y = point.y + 12;
      while (overlaps(y) && y + height < innerHeight - 130) y += height + 4;
      if (y + height >= innerHeight - 130) { y = point.y - height - 12; while (overlaps(y) && y >= 55) y -= height + 4; }
      if (y < 55 || y + height >= innerHeight - 130) { el.hidden = true; continue; }
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
