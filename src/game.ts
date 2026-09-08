import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GameWorld, createActor, animateActor, makeRing, SHRINES, COLORS, type Actor } from './world';
import { newHero, stats, gainXp, rollItem, equipItem, type HeroState, type Item } from './model';
import { SaveStore, SaveError, PROFILE_PREFIX, type SavedProfile } from './saves';
import { GameAudio } from './audio';
import { UI } from './ui';

export type Enemy = { id: number; name: string; actor: Actor; body: CANNON.Body; hp: number; maxHp: number; damage: number; speed: number; cooldown: number; attackTime: number; path: THREE.Vector3[]; rethink: number; dead: boolean; boss: boolean; active: boolean };
export type Loot = { id: number; x: number; z: number; item?: Item; gold?: number; potion?: number; mesh: THREE.Group };
type Effect = { mesh: THREE.Object3D; life: number; duration: number; type: 'ring' | 'burst' | 'slash' | 'beam'; velocity?: THREE.Vector3 };
export type Skill = 'attack' | 'cleave' | 'nova' | 'dash' | 'bolt';
export class Game {
  world = new GameWorld();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.OrthographicCamera();
  composer: EffectComposer;
  hero: HeroState;
  actor = createActor('hero');
  body: CANNON.Body;
  audio = new GameAudio();
  ui: UI;
  enemies: Enemy[] = [];
  loot: Loot[] = [];
  effects: Effect[] = [];
  keys = new Set<string>();
  path: THREE.Vector3[] = [];
  joystick = new THREE.Vector2();
  pointer = new THREE.Vector2();
  aim = new THREE.Vector3(3, 0, 8);
  raycaster = new THREE.Raycaster();
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  target?: Enemy;
  heldAttack = false;
  started = false;
  paused = true;
  dead = false;
  time = 0;
  attackTime = 0;
  invincible = 0;
  cooldowns: Record<Skill, number> = { attack: 0, cleave: 0, nova: 0, dash: 0, bolt: 0 };
  saveTimer = 0;
  marker = makeRing(.4, 0xe2d8ac);
  selection = makeRing(.7, 0xcf5650);
  playerRing = makeRing(.57, 0xbfc9a8, .4);
  zoom = 22;
  quality = 'high';
  visited = new Set<string>();
  lastFrame = performance.now();
  frameId = 0;
  nextId = 0;
  storageAvailable = true;
  saves?: SaveStore;
  profile?: SavedProfile;
  profileNotice = '';
  saveConflict = false;
  constructor() {
    this.hero = newHero();
    try {
      this.saves = new SaveStore(localStorage);
      if (this.saves.migrateLegacy()) this.profileNotice = '原有旅程已迁移为独立角色，旧存档已保留。';
    } catch (error) {
      this.storageAvailable = error instanceof SaveError;
      this.profileNotice = error instanceof SaveError ? error.message : '本地存储不可用，暂时无法创建或载入角色。';
    }
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.id = 'game-canvas'; this.renderer.domElement.setAttribute('aria-label', '遗忘墓园游戏场景'); this.renderer.domElement.tabIndex = 0;
    document.getElementById('app')!.appendChild(this.renderer.domElement);
    this.camera.near = .1; this.camera.far = 150;
    this.body = this.world.body(0, 11);
    this.world.scene.add(this.actor.group, this.marker, this.selection, this.playerRing);
    this.marker.visible = this.selection.visible = false;
    this.actor.group.position.set(0, 0, 11); this.actor.group.rotation.y = .5; this.actor.group.scale.setScalar(2);
    const heroLight = new THREE.PointLight(0xc7ede5, 3.0, 7); heroLight.position.set(0, 2.5, 0); this.actor.group.add(heroLight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.world.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .30, .5, 1.2));
    this.composer.addPass(new OutputPass());
    this.ui = new UI(this);
    this.resize(); this.bindControls();
    this.ui.openPanel('profiles');
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { this.releaseInput(); if (this.started && !this.dead && !this.paused) this.ui.openPanel('pause'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.releaseInput(); this.save(false); if (this.started && !this.dead && !this.paused) this.ui.openPanel('pause'); } });
    window.addEventListener('pagehide', () => this.save(false));
    window.addEventListener('storage', event => {
      if (event.key !== null && !event.key.startsWith(PROFILE_PREFIX)) return;
      if (!this.profile) {
        if (this.ui.panel === 'profiles') this.ui.renderPanel();
        return;
      }
      if (event.key !== null && event.key !== PROFILE_PREFIX + this.profile.id) return;
      try {
        if (this.saves!.read(this.profile.id).revision === this.profile.revision) return;
      } catch { /* A removed or damaged record must not be recreated by autosave. */ }
      this.saveConflict = true; this.ui.openPanel('save-conflict');
    });
    this.loop();
  }
  startProfile(id: string) {
    if (this.profile || !this.saves) return;
    const profile = this.saves.read(id);
    this.saves.remember(id);
    this.profile = profile; this.hero = structuredClone(profile.hero);
    this.actor.group.scale.setScalar(1); this.actor.group.rotation.y = Math.PI;
    this.hero.shrines.forEach(shrine => this.world.cleanseShrine(shrine));
    this.spawnEnemies(); this.ui.closePanel(); this.resize();
    document.getElementById('hero-profile-name')!.textContent = profile.name;
    document.getElementById('hero-profile-name')!.title = profile.name;
    this.ui.toast(profile.name, `等级 ${this.hero.level} · 第 ${this.hero.stage} 周目`);
  }
  returnToProfiles(discard = false) {
    if (!discard && !this.save()) return;
    if (discard) this.profile = undefined;
    location.reload();
  }
  get position() { return this.actor.group.position; }
  resize() {
    const width = innerWidth, height = innerHeight;
    const aspect = width / height;
    const view = height < 580 ? Math.min(this.zoom, 14) : width < 700 ? 20 : this.zoom;
    this.camera.left = -view * aspect / 2; this.camera.right = view * aspect / 2;
    this.camera.top = view / 2; this.camera.bottom = -view / 2;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); this.composer.setSize(width, height);
    this.updateCamera(1);
  }
  updateCamera(blend: number) {
    const focus = this.position.clone(); focus.y = .4;
    if (!this.profile && innerWidth > 700) focus.add(new THREE.Vector3(3.7, 0, -3.7));
    const offset = new THREE.Vector3(20, 26, 20);
    const expected = focus.clone().add(offset);
    this.camera.position.lerp(expected, blend); this.camera.lookAt(this.camera.position.clone().sub(offset));
  }
  setQuality(quality: string) {
    this.quality = quality;
    this.renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.world.scene.traverse(object => { if (object instanceof THREE.Mesh) { const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(m => m.needsUpdate = true); } });
    this.resize();
  }
  spawnEnemies() {
    const packs: [number, number, number][] = [[5, 5, 3], [-6, 1, 3], [9, -3, 3], [-17, -3, 4], [18, -3, 4], [0, -12, 3], [3, -20, 3]];
    packs.forEach(([x, z, count], pack) => {
      for (let i = 0; i < count; i++) {
        let px = x + Math.cos(i * 2.4) * 1.8, pz = z + Math.sin(i * 2.4) * 1.8;
        if (!this.world.grid.isWalkableAt(Math.round(px) + 28, Math.round(pz) + 28)) {
          const route = this.world.path({ x: 0, z: 11 }, { x: px, z: pz });
          if (route.length) { const end = route[route.length - 1]; px = end.x; pz = end.z; }
        }
        this.spawnEnemy(px, pz, (i + pack) % 3 === 0 ? 'demon' : 'skeleton');
      }
    });
    if (!this.hero.bossDefeated) this.spawnEnemy(0, -23, 'boss');
  }
  spawnEnemy(x: number, z: number, kind: 'skeleton' | 'demon' | 'boss') {
    const actor = createActor(kind), boss = kind === 'boss', scale = 1 + (this.hero.stage - 1) * .4;
    const maxHp = Math.round((boss ? 680 : kind === 'demon' ? 70 : 48) * scale);
    actor.group.position.set(x, 0, z); this.world.scene.add(actor.group);
    this.enemies.push({ id: this.nextId++, name: boss ? '无光者 · 莫德雷克' : kind === 'demon' ? '堕落守卫' : '复生骸骨', actor, body: this.world.body(x, z, boss ? .85 : .37), hp: maxHp, maxHp, damage: (boss ? 22 : kind === 'demon' ? 10 : 7) * scale, speed: boss ? 2 : kind === 'demon' ? 2.3 : 1.9, cooldown: 1, attackTime: 0, path: [], rethink: 0, dead: false, boss, active: false });
  }
  begin() { if (!this.profile) return; this.started = true; this.audio.unlock(); }
  releaseInput() { this.keys.clear(); this.heldAttack = false; this.joystick.set(0, 0); this.path = []; this.target = undefined; this.body.velocity.set(0, 0, 0); }
  bindControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointermove', event => {
      this.pointer.set(event.clientX / innerWidth * 2 - 1, -event.clientY / innerHeight * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera); this.raycaster.ray.intersectPlane(this.plane, this.aim);
      this.ui.hoveredEnemy = this.enemyAt(event.clientX, event.clientY);
      canvas.style.cursor = this.ui.hoveredEnemy ? 'crosshair' : 'default';
    });
    canvas.addEventListener('pointerdown', event => {
      if (this.paused || this.dead) return;
      this.begin();
      this.pointer.set(event.clientX / innerWidth * 2 - 1, -event.clientY / innerHeight * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera); this.raycaster.ray.intersectPlane(this.plane, this.aim);
      if (event.button === 2) { this.useSkill('bolt', true); return; }
      const enemy = this.enemyAt(event.clientX, event.clientY);
      if (enemy) { this.target = enemy; this.heldAttack = true; this.path = this.world.path(this.position, enemy.actor.group.position); }
      else if (event.shiftKey) { this.path = []; this.useSkill('attack', true); this.heldAttack = true; }
      else this.moveTo(this.aim);
    });
    window.addEventListener('pointerup', () => this.heldAttack = false);
    window.addEventListener('pointercancel', () => this.heldAttack = false);
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * .007, 12, 24); this.resize(); }, { passive: false });
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (this.ui.panel && key === 'tab') {
        if (this.ui.panel === 'map') { event.preventDefault(); this.ui.closePanel(); return; }
        const buttons = [...this.ui.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')].filter(element => element.getClientRects().length);
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus(); return;
      }
      if (this.ui.isProfilePanel()) {
        if (key === 'escape') { event.preventDefault(); this.ui.closePanel(); }
        return;
      }
      if (key !== 'escape' && (event.target as HTMLElement)?.matches('input, select, textarea')) return;
      if (['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
      if (event.repeat) return;
      if (key === 'escape') { this.ui.panel ? this.ui.closePanel() : this.ui.openPanel('pause'); return; }
      if (key === 'i') { this.ui.togglePanel('inventory'); return; }
      if (key === 'c') { this.ui.togglePanel('character'); return; }
      if (key === 'tab' || key === 'm') { this.ui.togglePanel('map'); return; }
      if (key === 'j') { this.ui.togglePanel('quest'); return; }
      if (this.paused || this.dead) return;
      this.begin(); this.keys.add(key);
      if (key === 'q') this.useSkill('cleave');
      if (key === 'e') this.useSkill('nova');
      if (key === 'r' || key === ' ') this.useSkill('dash');
      if (key === '1') this.drink(0);
      if (key === '2') this.drink(1);
      if (key === 'f') this.interact();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
  }
  project(position: THREE.Vector3) { const p = position.clone().project(this.camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, visible: p.z >= -1 && p.z <= 1 }; }
  enemyAt(x: number, y: number) {
    let found: Enemy | undefined, best = 45;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const screen = this.project(enemy.actor.group.position.clone().add(new THREE.Vector3(0, enemy.boss ? 1.8 : .9, 0)));
      const d = Math.hypot(x - screen.x, y - screen.y);
      if (d < best) { best = d; found = enemy; }
    }
    return found;
  }
  moveTo(point: THREE.Vector3) {
    this.target = undefined; this.path = this.world.path(this.position, point);
    if (this.path.length) { this.marker.position.set(this.path[this.path.length - 1].x, .08, this.path[this.path.length - 1].z); this.marker.visible = true; }
  }
  nearestEnemy(range: number) {
    return this.enemies.filter(e => !e.dead && (!e.boss || this.hero.shrines.length === 3)).sort((a, b) => a.actor.group.position.distanceToSquared(this.position) - b.actor.group.position.distanceToSquared(this.position)).find(e => e.actor.group.position.distanceTo(this.position) < range);
  }
  useSkill(skill: Skill, aimed = false) {
    if (this.paused || this.dead) return;
    this.begin();
    if (this.cooldowns[skill] > 0) return;
    const cost = { attack: 0, cleave: 20, nova: 30, dash: 12, bolt: 10 }[skill];
    if (this.hero.mana < cost) { this.ui.toast('法力不足'); return; }
    this.hero.mana -= cost;
    this.cooldowns[skill] = { attack: .45, cleave: 3.5, nova: 6, dash: 2.2, bolt: .7 }[skill];
    const s = stats(this.hero), origin = this.position.clone();
    const enemy = this.target && !this.target.dead ? this.target : this.nearestEnemy(skill === 'bolt' ? 13 : 4);
    const direction = aimed ? this.aim.clone().sub(origin) : enemy ? enemy.actor.group.position.clone().sub(origin) : new THREE.Vector3(Math.sin(this.actor.group.rotation.y), 0, Math.cos(this.actor.group.rotation.y)); direction.y = 0; direction.normalize();
    if (!direction.lengthSq()) direction.set(0, 0, -1);
    this.actor.group.rotation.y = Math.atan2(direction.x, direction.z);
    this.attackTime = 1;
    if (skill === 'dash') {
      if (this.joystick.length() > .1 || ['w', 'a', 's', 'd'].some(key => this.keys.has(key))) { direction.set(this.body.velocity.x, 0, this.body.velocity.z).normalize(); }
      let last = origin.clone();
      for (let i = .4; i <= 5.2; i += .25) {
        const next = origin.clone().addScaledVector(direction, i);
        if (!this.world.grid.isWalkableAt(Math.round(next.x) + 28, Math.round(next.z) + 28)) break;
        last = next;
        if (Math.floor(i * 4) % 2 === 0) this.burst(next.clone().add(new THREE.Vector3(0, .5, 0)), 0x9de9da, 2);
      }
      this.body.position.set(last.x, .5, last.z); this.actor.group.position.set(last.x, 0, last.z); this.invincible = .55; this.path = []; this.audio.play('portal'); return;
    }
    if (skill === 'bolt') {
      const end = aimed ? origin.clone().addScaledVector(direction, 12) : enemy ? enemy.actor.group.position.clone() : origin.clone().addScaledVector(direction, 12);
      this.beam(origin.clone().add(new THREE.Vector3(0, 1, 0)), end.clone().add(new THREE.Vector3(0, .8, 0)));
      for (const e of this.enemies) {
        if (e.dead) continue;
        const relative = e.actor.group.position.clone().sub(origin), distance = relative.dot(direction);
        if (distance > 0 && distance < 13 && relative.addScaledVector(direction, -distance).length() < .85) this.hurtEnemy(e, s.magic * 1.15);
      }
      this.audio.play('spell'); return;
    }
    const radius = skill === 'nova' ? 7 : skill === 'cleave' ? 4.3 : 2.9;
    const color = skill === 'nova' ? 0x79e6d1 : skill === 'cleave' ? 0xe6c277 : 0xd5ddc3;
    const ring = makeRing(skill === 'attack' ? radius : .4, color, .9); ring.position.copy(origin); ring.position.y = .2;
    if (skill === 'attack') { ring.geometry.dispose(); ring.geometry = new THREE.RingGeometry(2.2, 2.7, 24, 1, -.8, 1.6); ring.rotation.z = -this.actor.group.rotation.y + Math.PI / 2; }
    this.world.scene.add(ring); this.effects.push({ mesh: ring, life: skill === 'attack' ? .18 : .5, duration: skill === 'attack' ? .18 : .5, type: skill === 'attack' ? 'slash' : 'ring' });
    if (skill === 'nova') this.burst(origin.clone().add(new THREE.Vector3(0, 1, 0)), color, 40);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const distance = e.actor.group.position.distanceTo(origin);
      const facing = e.actor.group.position.clone().sub(origin).normalize().dot(direction);
      if (distance <= radius && (skill !== 'attack' || facing > -.25 || distance < 1.4)) this.hurtEnemy(e, skill === 'nova' ? s.magic * 1.6 : s.attack * (skill === 'cleave' ? 1.9 : 1));
    }
    this.audio.play(skill === 'nova' ? 'spell' : 'swing');
  }
  hurtEnemy(enemy: Enemy, damage: number) {
    if (enemy.boss && this.hero.shrines.length < 3) { this.ui.toast('三重封印尚未解除'); return; }
    const critical = Math.random() < .16;
    const amount = Math.round(damage * (.9 + Math.random() * .2) * (critical ? 1.7 : 1));
    enemy.hp -= amount; enemy.active = true;
    this.ui.floatText(String(amount), enemy.actor.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)), critical ? 'critical' : 'damage');
    this.burst(enemy.actor.group.position.clone().add(new THREE.Vector3(0, .9, 0)), critical ? 0xffd889 : 0xc9d6b3, 7);
    this.audio.play('hit');
    const knock = enemy.actor.group.position.clone().sub(this.position).normalize(); enemy.body.velocity.x += knock.x * 5; enemy.body.velocity.z += knock.z * 5;
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }
  killEnemy(enemy: Enemy) {
    enemy.dead = true; this.hero.kills++; this.world.physics.removeBody(enemy.body);
    enemy.actor.group.rotation.z = -Math.PI / 2; enemy.actor.group.position.y = .2;
    if (this.target === enemy) { this.target = undefined; this.path = []; }
    const xp = enemy.boss ? 250 : 22 + this.hero.stage * 3;
    if (gainXp(this.hero, xp)) { this.ui.toast('等级提升', `等级 ${this.hero.level} · 获得 3 点属性`); this.audio.play('level'); this.burst(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xf4d68b, 35); }
    this.dropLoot(enemy.actor.group.position, enemy.boss);
    if (enemy.boss) {
      this.hero.bossDefeated = true; this.hero.gold += 200; this.ui.toast('无光者已陨落', '遗忘墓园重归寂静');
      this.save(false); setTimeout(() => { if (!this.dead) this.ui.openPanel('victory'); }, 1400);
    }
  }
  dropLoot(position: THREE.Vector3, boss = false) {
    const gold = { id: this.nextId++, x: position.x + .4, z: position.z + .2, gold: 9 + Math.floor(Math.random() * 13) + this.hero.stage * 3, mesh: new THREE.Group() };
    this.addLoot(gold);
    if (boss || Math.random() > .40) {
      const item = rollItem(this.hero.level, Math.random(), boss);
      this.addLoot({ id: this.nextId++, x: position.x - .5, z: position.z, item, mesh: new THREE.Group() });
    }
    if (Math.random() < .30) this.addLoot({ id: this.nextId++, x: position.x, z: position.z + .6, potion: Math.random() > .4 ? 0 : 1, mesh: new THREE.Group() });
  }
  addLoot(loot: Loot) {
    const color = loot.item ? COLORS[loot.item.rarity] : loot.gold ? 0xe5bd60 : loot.potion === 0 ? 0xe45555 : 0x56a7eb;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(loot.gold ? .12 : .19), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .6, metalness: .7, roughness: .3 })); gem.position.y = .25; loot.mesh.add(gem);
    if (loot.item) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.028, .12, loot.item.rarity === 'legendary' ? 3.5 : 1.8, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = loot.item.rarity === 'legendary' ? 1.7 : .9; loot.mesh.add(beam);
      loot.mesh.add(makeRing(.38, color, .4));
    }
    loot.mesh.position.set(loot.x, 0, loot.z); this.world.scene.add(loot.mesh); this.loot.push(loot);
  }
  pickup(id: number) {
    if (this.paused || this.dead) return;
    const loot = this.loot.find(l => l.id === id); if (!loot) return;
    this.begin();
    if (Math.hypot(this.position.x - loot.x, this.position.z - loot.z) > 3) { this.moveTo(new THREE.Vector3(loot.x, 0, loot.z)); return; }
    if (loot.item) {
      if (this.hero.inventory.length >= 24) { this.ui.toast('背包已满'); return; }
      this.hero.inventory.push(loot.item); this.ui.toast(loot.item.name, '已收入背包');
    } else if (loot.gold) { this.hero.gold += loot.gold; this.ui.floatText(`+${loot.gold}`, this.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 'gold'); }
    else if (loot.potion !== undefined) this.hero.potions[loot.potion] = Math.min(99, this.hero.potions[loot.potion] + 1);
    this.disposeObject(loot.mesh); this.loot.splice(this.loot.indexOf(loot), 1); this.audio.play('loot'); this.save(false);
  }
  drink(index: 0 | 1) {
    if (this.paused || this.dead) return;
    const s = stats(this.hero), key = index === 0 ? 'hp' : 'mana', max = index === 0 ? s.maxHp : s.maxMana;
    if (this.hero[key] >= max) { this.ui.toast(index === 0 ? '生命值已满' : '法力值已满'); return; }
    if (!this.hero.potions[index]) { this.ui.toast('药剂已用尽'); return; }
    this.hero.potions[index]--; this.hero[key] = Math.min(max, this.hero[key] + max * .65);
    this.burst(this.position.clone().add(new THREE.Vector3(0, 1, 0)), index === 0 ? 0xe25c65 : 0x63c8ed, 15); this.audio.play('loot'); this.save(false);
  }
  contextAction() {
    if (this.dead) return null;
    const shrine = SHRINES.findIndex(p => Math.hypot(this.position.x - p.x, this.position.z - p.z) < 3.4);
    if (shrine >= 0 && !this.hero.shrines.includes(shrine)) return { name: '净化祭坛', kind: 'shrine', id: shrine };
    if (this.position.distanceTo(new THREE.Vector3(-5.8, 0, 12)) < 3.5) return { name: '旅者补给', kind: 'shop', id: 0 };
    if (this.loot.some(l => Math.hypot(l.x - this.position.x, l.z - this.position.z) < 3)) return { name: '拾取战利品', kind: 'loot', id: 0 };
    return null;
  }
  interact() {
    if (this.paused || this.dead) return;
    this.begin(); const action = this.contextAction(); if (!action) return;
    if (action.kind === 'shop') { this.ui.openPanel('shop'); return; }
    if (action.kind === 'loot') { [...this.loot].filter(l => Math.hypot(l.x - this.position.x, l.z - this.position.z) < 3).forEach(l => this.pickup(l.id)); return; }
    const p = SHRINES[action.id];
    if (this.enemies.some(e => !e.dead && !e.boss && Math.hypot(e.actor.group.position.x - p.x, e.actor.group.position.z - p.z) < 6)) { this.ui.toast('祭坛仍受守卫侵蚀'); return; }
    this.hero.shrines.push(action.id); this.world.cleanseShrine(action.id);
    this.hero.hp = stats(this.hero).maxHp; this.hero.mana = stats(this.hero).maxMana;
    gainXp(this.hero, 60); this.burst(new THREE.Vector3(p.x, 2, p.z), 0x80ffdf, 45); this.audio.play('level');
    this.ui.toast('祭坛已净化', this.hero.shrines.length === 3 ? '三重封印破碎 · 无光者已苏醒' : `封印已解除 ${this.hero.shrines.length} / 3`); this.save(false);
  }
  buy(index: 0 | 1) {
    if (this.hero.gold < 25) { this.ui.toast('金币不足'); return; }
    if (this.hero.potions[index] >= 99) return;
    this.hero.gold -= 25; this.hero.potions[index]++; this.audio.play('loot'); this.ui.renderPanel(); this.save(false);
  }
  equip(id: string) { if (equipItem(this.hero, id)) { this.audio.play('loot'); this.save(false); this.ui.renderPanel(); } }
  salvage(id: string) {
    const index = this.hero.inventory.findIndex(item => item.id === id); if (index < 0) return;
    this.hero.gold += this.hero.inventory[index].value; this.hero.inventory.splice(index, 1); this.ui.selectedItem = undefined; this.ui.renderPanel(); this.save(false);
  }
  allocate(key: 'strength' | 'vitality' | 'spirit') {
    if (this.hero.points <= 0) return;
    this.hero.points--; this.hero[key]++; if (key === 'vitality') this.hero.hp += 5; if (key === 'spirit') this.hero.mana += 3;
    this.ui.renderPanel(); this.save(false);
  }
  save(notify = true) {
    if (!this.profile) return true;
    if (!this.saves || this.saveConflict) return false;
    const savedHero = this.dead ? { ...this.hero, hp: stats(this.hero).maxHp, mana: stats(this.hero).maxMana, gold: Math.floor(this.hero.gold * .9) } : this.hero;
    try {
      this.profile = this.saves.save(this.profile.id, savedHero, this.profile.revision);
      this.storageAvailable = true; if (notify) this.ui.toast('旅程已保存', this.profile.name);
      return true;
    } catch (error) {
      if (error instanceof SaveError) { this.saveConflict = true; this.ui.openPanel('save-conflict'); }
      else { this.storageAvailable = false; this.ui.toast('无法保存', '本地存储不可用，当前进度仍保留在本页面。'); }
      return false;
    }
  }
  revive() {
    this.dead = false; this.hero.gold = Math.floor(this.hero.gold * .9); this.hero.hp = stats(this.hero).maxHp; this.hero.mana = stats(this.hero).maxMana;
    this.body.position.set(0, .5, 11); this.actor.group.position.set(0, 0, 11); this.actor.group.rotation.z = 0;
    this.invincible = 4; this.enemies.forEach(e => { e.active = false; }); this.ui.closePanel(); this.save(false);
  }
  nextJourney() {
    if (!this.hero.bossDefeated) return;
    const previous = structuredClone(this.hero);
    this.hero.stage++; this.hero.shrines = []; this.hero.bossDefeated = false; this.hero.hp = stats(this.hero).maxHp; this.hero.mana = stats(this.hero).maxMana; this.hero.potions[0] += 3; this.hero.potions[1] += 2;
    if (this.save(false)) location.reload();
    else this.hero = previous;
  }
  burst(origin: THREE.Vector3, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const particle = new THREE.Mesh(new THREE.IcosahedronGeometry(.035 + Math.random() * .045, 0), new THREE.MeshBasicMaterial({ color, transparent: true })); particle.position.copy(origin);
      const duration = .35 + Math.random() * .55;
      this.world.scene.add(particle); this.effects.push({ mesh: particle, life: duration, duration, type: 'burst', velocity: new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 5, (Math.random() - .5) * 6) });
    }
  }
  beam(from: THREE.Vector3, to: THREE.Vector3) {
    const direction = to.clone().sub(from), length = direction.length();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, length, 8), new THREE.MeshBasicMaterial({ color: 0xb5ffff, transparent: true }));
    beam.position.copy(from).add(to).multiplyScalar(.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    this.world.scene.add(beam); this.effects.push({ mesh: beam, life: .22, duration: .22, type: 'beam' }); this.burst(to, 0x73eddd, 9);
  }
  disposeObject(object: THREE.Object3D) {
    this.world.scene.remove(object); object.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose()); } });
  }
  update(dt: number) {
    this.time += dt; this.world.update(this.time, dt);
    if (!this.profile) animateActor(this.actor, this.time, false, 0);
    if (this.paused || this.dead) return;
    this.attackTime = Math.max(0, this.attackTime - dt * 3.5); this.invincible = Math.max(0, this.invincible - dt);
    for (const skill of Object.keys(this.cooldowns) as Skill[]) this.cooldowns[skill] = Math.max(0, this.cooldowns[skill] - dt);
    const s = stats(this.hero); this.hero.mana = Math.min(s.maxMana, this.hero.mana + dt * 4);
    if (this.started) this.hero.hp = Math.min(s.maxHp, this.hero.hp + dt * .55);
    const move = new THREE.Vector2(
      Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')) + this.joystick.x,
      Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup')) + this.joystick.y,
    );
    let vx = 0, vz = 0;
    if (move.length() > .1) {
      move.normalize(); vx = (move.x + move.y) * Math.SQRT1_2; vz = (move.y - move.x) * Math.SQRT1_2; this.path = []; this.target = undefined;
    } else {
      if (this.target && !this.target.dead) {
        const dist = this.target.actor.group.position.distanceTo(this.position);
        if (dist < 2.5) { this.path = []; this.useSkill('attack'); }
        else if (!this.path.length || Math.random() < .015) this.path = this.world.path(this.position, this.target.actor.group.position);
      } else if (this.heldAttack) this.useSkill('attack', true);
      if (this.path.length) {
        const target = this.path[0], distance = this.position.distanceTo(target);
        if (distance < .22) this.path.shift();
        else { vx = (target.x - this.position.x) / distance; vz = (target.z - this.position.z) / distance; }
      }
    }
    const speed = this.attackTime > .35 ? 2.2 : 5.2;
    this.body.velocity.set(vx * speed, 0, vz * speed);
    if (vx || vz) this.actor.group.rotation.y = Math.atan2(vx, vz);
    this.marker.visible = this.path.length > 0;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const p = enemy.actor.group.position, dist = p.distanceTo(this.position);
      if (this.started && dist < (enemy.boss ? 10 : 9) && (!enemy.boss || this.hero.shrines.length === 3)) enemy.active = true;
      if (dist > 22) enemy.active = false;
      enemy.attackTime = Math.max(0, enemy.attackTime - dt * 3);
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      let moving = false;
      enemy.body.velocity.x *= .65; enemy.body.velocity.z *= .65;
      if (enemy.active) {
        enemy.actor.group.rotation.y = Math.atan2(this.position.x - p.x, this.position.z - p.z);
        if (dist > (enemy.boss ? 2.25 : 1.45)) {
          enemy.rethink -= dt;
          if (enemy.rethink <= 0) { enemy.path = this.world.path(p, this.position); enemy.rethink = .6 + Math.random() * .4; }
          const point = enemy.path[0];
          if (point) {
            const dx = point.x - p.x, dz = point.z - p.z, d = Math.hypot(dx, dz);
            if (d < .3) enemy.path.shift();
            else { enemy.body.velocity.set(dx / d * enemy.speed, 0, dz / d * enemy.speed); moving = true; }
          }
        } else if (enemy.cooldown === 0) {
          enemy.cooldown = enemy.boss ? 1.35 : 1.5; enemy.attackTime = 1;
          if (!this.invincible) this.hurtPlayer(Math.max(2, enemy.damage - s.armor * .5));
        }
        if (enemy.boss && enemy.cooldown === 0 && dist > 2.25 && dist < 8) {
          enemy.cooldown = 3.4;
          const ring = makeRing(.5, 0xe96653); ring.position.set(p.x, .2, p.z); this.world.scene.add(ring); this.effects.push({ mesh: ring, life: .75, duration: .75, type: 'ring' });
          if (!this.invincible) this.hurtPlayer(12);
        }
      }
      animateActor(enemy.actor, this.time + enemy.id, moving, enemy.attackTime);
    }
    this.world.physics.step(1 / 60, dt, 3);
    this.position.set(this.body.position.x, 0, this.body.position.z);
    for (const enemy of this.enemies) if (!enemy.dead) enemy.actor.group.position.set(enemy.body.position.x, 0, enemy.body.position.z);
    animateActor(this.actor, this.time, !!(vx || vz), this.attackTime);
    this.playerRing.position.set(this.position.x, .09, this.position.z);
    this.playerRing.visible = !this.invincible || Math.sin(this.time * 15) > 0;
    const hover = this.ui.hoveredEnemy ?? this.target;
    this.selection.visible = !!hover && !hover.dead;
    if (hover) this.selection.position.set(hover.actor.group.position.x, .1, hover.actor.group.position.z);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.life -= dt;
      if (effect.life <= 0) { this.disposeObject(effect.mesh); this.effects.splice(i, 1); continue; }
      const ratio = effect.life / effect.duration;
      if (effect.type === 'ring') effect.mesh.scale.setScalar(1 + (1 - ratio) * 16);
      if (effect.velocity) { effect.mesh.position.addScaledVector(effect.velocity, dt); effect.velocity.y -= dt * 6; }
      const material = (effect.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial; material.opacity = ratio;
    }
    this.loot.forEach(loot => { loot.mesh.children[0].rotation.y = this.time; loot.mesh.children[0].position.y = .23 + Math.sin(this.time * 2 + loot.id) * .06; });
    [...this.loot].filter(l => Math.hypot(l.x - this.position.x, l.z - this.position.z) < (l.gold || l.potion !== undefined ? 1.6 : 1.0)).forEach(l => { if (!l.item || this.hero.inventory.length < 24) this.pickup(l.id); });
    const cx = Math.floor(this.position.x / 3), cz = Math.floor(this.position.z / 3);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) this.visited.add(`${cx + dx},${cz + dz}`);
    this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(false); }
  }
  hurtPlayer(damage: number) {
    this.hero.hp = Math.max(0, this.hero.hp - damage); this.invincible = .25;
    this.ui.floatText(`-${Math.round(damage)}`, this.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 'hurt'); this.audio.play('hurt');
    this.ui.flashDamage();
    if (this.hero.hp <= 0) { this.dead = true; this.releaseInput(); this.actor.group.rotation.z = Math.PI / 2; this.ui.openPanel('death'); this.save(false); }
  }
  loop = () => {
    const now = performance.now(), dt = Math.min((now - this.lastFrame) / 1000, .05); this.lastFrame = now;
    this.update(dt); this.updateCamera(Math.min(1, dt * 7));
    if (this.quality === 'low') this.renderer.render(this.world.scene, this.camera); else this.composer.render();
    this.ui.update(dt); this.frameId = requestAnimationFrame(this.loop);
  };
}
