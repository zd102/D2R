import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GameWorld, createActor, animateActor, makeRing, gridWalkable, COLORS, type Actor } from './world';
import { newHero, stats, skillLevel, gainXp, equipItem, equipReason, sellItem, allocateAttribute, swapWeapons, difficulty, recoverCorpse, selectCampaignLevel, completeCampaignLevel, activateQuestObject, recordQuestKill, type HeroState, type Item, type Slot } from './model';
import { clearShot } from './ranged';
import { ACTS, LEVELS, levelLayout, levelTuning, eliteCount, questComplete, canEnterLevel } from './campaign';
import { CAMP, prepareCampArrival } from './camp';
import { type Attribute, type DamageType } from './paladin';
import { packItems, placeItems, runeLabel, type DropRank, type RuneId, type Mods } from './items';
import { rollLoot } from './loot';
import { rollChestLoot, chestContext } from './chests';
import { PaladinCombat } from './combat';
import { BOSSES, ENCOUNTERS, MONSTERS, type MonsterDef } from './bestiary';
import { createMonsterActor } from './monster-models';
import { MonsterCombat } from './monster-combat';
import { monsterExperience, monsterStats } from './balance';
import { SaveStore, SaveError, PROFILE_PREFIX, type SavedProfile } from './saves';
import { SHARED_STASH_KEY } from './shared-stash';
import { refreshSharedStorage } from './shared-storage';
import { GameAudio } from './audio';
import { UI } from './ui';
import { KEYBOARD_SKILLS, emptyCooldowns, type SkillSlot } from './controls';
import { followPath } from './navigation';

export type Enemy = { id: number; name: string; actor: Actor; body: CANNON.Body; hp: number; maxHp: number; damage: number; speed: number; cooldown: number; attackTime: number; path: THREE.Vector3[]; rethink: number; dead: boolean; boss: boolean; elite?: boolean; active: boolean; kind: 'skeleton' | 'demon' | 'boss'; level: number; defense: number; attackRating: number; resistances: Record<DamageType, number>; stunned: number; coldTime: number; converted: number; bleed: number; redeemed: boolean; definition?: MonsterDef; summoned?: boolean; owner?: number; blind?: number; flee?: number; preventHeal?: boolean; poison?: { dps: number; remaining: number }; slow?: { percent: number; remaining: number } };
export type Loot = { id: number; x: number; z: number; item?: Item; gold?: number; potion?: number; rune?: RuneId; mesh: THREE.Group };
type Effect = { mesh: THREE.Object3D; life: number; duration: number; type: 'ring' | 'burst' | 'slash' | 'beam'; velocity?: THREE.Vector3 };
type PointerGesture = { id: number; button: number; x: number; y: number; started: number; dragging: boolean; stationary: boolean; mode: 'move' | 'attack' | 'interact' | 'cast' };
export type Skill = SkillSlot;
export class Game {
  world = new GameWorld(LEVELS[0], true);
  renderer: THREE.WebGLRenderer;
  camera = new THREE.OrthographicCamera();
  composer: EffectComposer;
  hero: HeroState;
  actor = createActor('hero');
  body: CANNON.Body;
  audio = new GameAudio();
  ui: UI;
  combat: PaladinCombat;
  monsterCombat = new MonsterCombat(this);
  enemies: Enemy[] = [];
  loot: Loot[] = [];
  effects: Effect[] = [];
  keys = new Set<string>();
  path: THREE.Vector3[] = [];
  joystick = new THREE.Vector2();
  pointer = new THREE.Vector2();
  pointerAimActive = false;
  pointerGesture?: PointerGesture;
  pointerPathTimer = 0;
  pointerDestination?: THREE.Vector3;
  targetPathTimer = 0;
  targetDestination?: THREE.Vector3;
  aim = new THREE.Vector3(3, 0, 8);
  raycaster = new THREE.Raycaster();
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  target?: Enemy;
  pendingPickup?: number;
  pendingPortal = false;
  pendingCampTarget: 'portal' | 'stash' = 'portal';
  pendingChest?: number;
  heldAttack = false;
  started = false;
  paused = true;
  dead = false;
  time = 0;
  attackTime = 0;
  invincible = 0;
  cooldowns = emptyCooldowns();
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
  victoryTimer = 0;
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
    this.renderer.domElement.id = 'game-canvas'; this.renderer.domElement.setAttribute('aria-label', `${CAMP.name}游戏场景`); this.renderer.domElement.tabIndex = 0;
    document.getElementById('app')!.appendChild(this.renderer.domElement);
    this.camera.near = .1; this.camera.far = 150;
    this.body = this.world.body(0, 11);
    this.world.scene.add(this.actor.group, this.marker, this.selection, this.playerRing);
    this.marker.visible = this.selection.visible = false;
    this.actor.group.position.set(0, 0, 11); this.actor.group.rotation.y = .5; this.actor.group.scale.setScalar(2);
    const heroLight = new THREE.PointLight(0xc7ede5, 3.0, 7); heroLight.name = 'hero-light'; heroLight.position.set(0, 2.5, 0); this.actor.group.add(heroLight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.world.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .30, .5, 1.2));
    this.composer.addPass(new OutputPass());
    this.combat = new PaladinCombat(this);
    this.ui = new UI(this);
    this.resize(); this.bindControls();
    this.ui.openPanel('profiles');
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { this.releaseInput(); if (this.started && !this.dead && !this.paused) this.ui.openPanel('pause'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.releaseInput(); this.save(false); if (this.started && !this.dead && !this.paused) this.ui.openPanel('pause'); } });
    window.addEventListener('pagehide', () => this.save(false));
    window.addEventListener('storage', async event => {
      if (event.key !== null && event.key !== SHARED_STASH_KEY && !event.key.startsWith(PROFILE_PREFIX)) return;
      if (event.key === null || event.key === SHARED_STASH_KEY) await refreshSharedStorage();
      if (!this.profile) {
        if (this.ui.panel === 'profiles') this.ui.renderPanel();
        return;
      }
      if (event.key !== null && event.key !== SHARED_STASH_KEY && event.key !== PROFILE_PREFIX + this.profile.id) return;
      try {
        const current = this.saves!.read(this.profile.id);
        if (current.revision === this.profile.revision && current.sharedRevision === this.profile.sharedRevision) { if (event.key === SHARED_STASH_KEY) this.ui.sharedStashScreen.refresh(); return; }
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
    prepareCampArrival(this.hero);
    this.loadArea(true);
    document.getElementById('hero-profile-name')!.textContent = profile.name;
    document.getElementById('hero-profile-name')!.title = profile.name;
    this.ui.toast(profile.name, `等级 ${this.hero.level} · ${CAMP.name}`);
  }
  get level() { return LEVELS[this.hero.campaign.current]; }
  get inCamp() { return this.world.isCamp; }
  get areaName() { return this.inCamp ? CAMP.name : this.level.name; }
  loadArea(inCamp: boolean) {
    this.releaseInput();
    this.combat?.classes.clear();
    this.world.scene.remove(this.actor.group, this.marker, this.selection, this.playerRing);
    if(this.actor.group.userData.classId!==this.hero.classId) {
      const light=this.actor.group.getObjectByName('hero-light');light?.removeFromParent();
      this.disposeObject(this.actor.group);this.actor=createActor('hero',this.hero.classId);if(light)this.actor.group.add(light);
    }
    this.world.dispose(); this.world = new GameWorld(this.level, inCamp);
    (this.composer.passes[0] as RenderPass).scene = this.world.scene;
    this.body = this.world.body(0, 11); this.actor.group.position.set(0, 0, 11); this.actor.group.scale.setScalar(1); this.actor.group.rotation.set(0, Math.PI, 0);
    this.world.scene.add(this.actor.group, this.marker, this.selection, this.playerRing);
    this.marker.visible = this.selection.visible = false; this.playerRing.position.set(0, .09, 11);
    this.enemies = []; this.loot = []; this.effects = []; this.visited.clear(); this.combat = new PaladinCombat(this);
    this.monsterCombat = new MonsterCombat(this);
    this.cooldowns = emptyCooldowns(); this.victoryTimer = 0; this.attackTime = 0; this.invincible = 2;
    this.ui.hoveredEnemy = undefined; this.ui.floats.forEach(float => float.element.remove()); this.ui.floats = [];
    if (!inCamp) {
      this.hero.campaign.objects.forEach(id => this.world.completeObjective(id)); this.world.exit.visible = this.hero.bossDefeated;
    }
    this.renderer.domElement.setAttribute('aria-label', `${this.areaName}游戏场景`);
    document.getElementById('app')!.classList.toggle('is-camp', inCamp);
    this.spawnEnemies(); this.ui.closePanel(); this.resize();
  }
  previewClass(classId: HeroState['classId']) {
    if(this.profile||this.actor.group.userData.classId===classId)return;
    const old=this.actor,light=old.group.getObjectByName('hero-light');light?.removeFromParent();
    this.actor=createActor('hero',classId);this.actor.group.position.copy(old.group.position);this.actor.group.rotation.copy(old.group.rotation);this.actor.group.scale.copy(old.group.scale);
    this.disposeObject(old.group);if(light)this.actor.group.add(light);this.world.scene.add(this.actor.group);
    this.hero=newHero(classId);
    const weapon=this.actor.group.getObjectByName('hero-weapon'),staff=this.actor.group.getObjectByName('hero-staff'),shield=this.actor.group.getObjectByName('hero-shield');
    if(weapon)weapon.visible=classId==='paladin';if(staff)staff.visible=classId==='sorceress';if(shield)shield.visible=classId!=='sorceress';
    this.actor.group.getObjectByName('hero-javelin')!.visible=classId==='amazon';
  }
  returnToCamp() {
    if (!this.profile || this.dead || this.saveConflict || this.inCamp) return false;
    const previous = structuredClone(this.hero);
    prepareCampArrival(this.hero);
    if (!this.save(false)) { this.hero = previous; return false; }
    this.loadArea(true); this.ui.toast(CAMP.name, '旅程已保存'); return true;
  }
  useCampPortal() {
    if (!this.inCamp || !this.profile || this.paused || this.dead || this.saveConflict) return;
    this.begin(); this.pendingCampTarget = 'portal';
    if (Math.hypot(this.position.x - CAMP.portal.x, this.position.z - CAMP.portal.z) < 3.5) this.ui.openPanel('campaign');
    else { this.moveTo(new THREE.Vector3(CAMP.portal.x, 0, CAMP.portal.z)); this.pendingPortal = this.path.length > 0; }
  }
  useSharedStash() {
    if (!this.inCamp || !this.profile || this.paused || this.dead || this.saveConflict) return;
    this.begin(); this.pendingCampTarget = 'stash'; this.ui.sharedStashScreen.selected = undefined; this.ui.sharedStashScreen.error = '';
    if (Math.hypot(this.position.x - CAMP.stash.x, this.position.z - CAMP.stash.z) < 3.5) this.ui.openPanel('shared-stash');
    else { this.moveTo(new THREE.Vector3(CAMP.stash.x, 0, CAMP.stash.z)); this.pendingPortal = this.path.length > 0; }
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
    if (this.inCamp) return;
    const layout = levelLayout(this.level), tuning = levelTuning(this.level, difficulty(this.hero));
    const points = [...layout.route.slice(1, -1), ...layout.objects, ...layout.rooms.slice(4, 7)];
    const packs = Array.from({ length: tuning.packs }, (_, i) => points[i % points.length]);
    packs.forEach(({ x, z }, pack) => {
      const count = 3;
      for (let i = 0; i < count; i++) {
        let px = x + Math.cos(i * 2.4) * 1.8, pz = z + Math.sin(i * 2.4) * 1.8;
        if (!gridWalkable(this.world.grid, { x: px, z: pz })) {
          const route = this.world.path({ x: 0, z: 11 }, { x: px, z: pz });
          if (route.length) { const end = route[route.length - 1]; px = end.x; pz = end.z; }
        }
        const pool = ENCOUNTERS[this.level.index];
        this.spawnEnemy(px, pz, 'demon', MONSTERS[pool[(pack * 3 + i) % pool.length]]);
      }
    });
    for (let i = 0; i < eliteCount(this.level, difficulty(this.hero)); i++) {
      const room = layout.rooms[[4, 7, 6, 5, 8, 9][i]], desired = { x: room.x - 2, z: room.z - 2 };
      const point = this.world.path(layout.spawn, desired).at(-1) ?? room;
      const pool = ENCOUNTERS[this.level.index];
      this.spawnEnemy(point.x, point.z, 'demon', MONSTERS[pool[(this.level.index + i) % pool.length]], true);
    }
    if (!this.hero.bossDefeated) this.spawnEnemy(layout.boss.x, layout.boss.z, 'boss');
  }
  spawnEnemy(x: number, z: number, kind: 'skeleton' | 'demon' | 'boss', definition = kind === 'boss' ? BOSSES[this.level.index] : MONSTERS[kind === 'skeleton' ? 'skeleton' : ENCOUNTERS[this.level.index][0]], elite = false) {
    const boss = kind === 'boss'; elite = elite && !boss;
    const actor = createMonsterActor(definition, boss), tuning = monsterStats(definition, this.level, difficulty(this.hero), boss, elite);
    if (elite) {
      actor.group.scale.multiplyScalar(1.2);
      const ring = makeRing(.65, 0xeac66c, .75); ring.position.y = .09; actor.group.add(ring);
    }
    actor.group.position.set(x, 0, z); this.world.scene.add(actor.group);
    const enemy: Enemy = { id: this.nextId++, name: boss ? this.level.boss : elite ? `精英 · ${definition.name}` : definition.name, actor, definition, body: this.world.body(x, z, boss ? .85 : elite ? .44 : .37), ...tuning, hp: tuning.maxHp, speed: definition.speed * (elite ? 1.1 : 1), cooldown: 1, attackTime: 0, path: [], rethink: 0, dead: false, boss, elite, active: false, kind: boss ? 'boss' : definition.race === 'undead' ? 'skeleton' : 'demon', stunned: 0, coldTime: 0, converted: 0, bleed: 0, redeemed: false };
    this.enemies.push(enemy); return enemy;
  }
  begin() { if (!this.profile) return; this.started = true; this.audio.unlock(); }
  releaseInput() { if (this.pointerGesture) this.finishPointerGesture(true); this.pointerAimActive = false; this.keys.clear(); this.heldAttack = false; this.joystick.set(0, 0); this.path = []; this.target = undefined; this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined; this.body.velocity.set(0, 0, 0); }
  updatePointer(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.pointerAimActive = event.pointerType !== 'touch';
    this.updatePointerAim();
  }
  updatePointerAim() {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera); this.raycaster.ray.intersectPlane(this.plane, this.aim);
    if (this.pointerAimActive) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.ui.hoveredEnemy = this.enemyAt(rect.left + (this.pointer.x + 1) * rect.width / 2, rect.top + (1 - this.pointer.y) * rect.height / 2);
      this.renderer.domElement.style.cursor = this.ui.hoveredEnemy ? 'crosshair' : 'default';
    }
  }
  finishPointerGesture(cancel = false) {
    const gesture = this.pointerGesture; this.pointerGesture = undefined;
    this.heldAttack = false; this.pointerPathTimer = 0; this.pointerDestination = undefined;
    if (gesture && (cancel || gesture.dragging || gesture.mode === 'move' && performance.now() - gesture.started >= 200)) {
      this.path = []; this.target = undefined; this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
      this.body.velocity.set(0, 0, 0); this.marker.visible = false;
    }
    if (gesture && this.renderer.domElement.hasPointerCapture(gesture.id)) this.renderer.domElement.releasePointerCapture(gesture.id);
  }
  updatePointerNavigation(dt: number) {
    const gesture = this.pointerGesture;
    if (!gesture || this.keys.has('shift')) return;
    if (gesture.mode === 'cast' && performance.now() - gesture.started >= 200) { gesture.mode = 'move'; gesture.dragging = true; }
    if (gesture.mode !== 'move' || this.combat.lock > .1 || this.combat.zeal || this.combat.classes.sequence) return;
    this.pointerPathTimer = Math.max(0, this.pointerPathTimer - dt);
    if (this.aim.distanceToSquared(this.position) < .3 ** 2) { this.path = []; this.body.velocity.set(0, 0, 0); return; }
    // Open ground tracks the exact cursor point every frame without running A*.
    if (this.world.canWalk(this.position, this.aim)) {
      this.path = [this.aim.clone()]; this.pointerDestination = this.aim.clone();
      this.pointerPathTimer = 0; this.target = undefined; this.heldAttack = false;
      this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
      return;
    }
    // Keep following the existing route while obstacle repaths are throttled.
    if (!this.pointerPathTimer && (!this.pointerDestination || this.pointerDestination.distanceToSquared(this.aim) > .25 ** 2 || !this.path.length)) {
      this.pointerPathTimer = .125; this.pointerDestination = this.aim.clone(); this.heldAttack = false;
      this.moveTo(this.aim);
    }
  }
  bindControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointermove', event => {
      if (this.paused || this.dead || this.pointerGesture && this.pointerGesture.id !== event.pointerId) return;
      this.updatePointer(event);
      const gesture = this.pointerGesture;
      if (gesture && !(event.buttons & 3)) { this.finishPointerGesture(true); return; }
      if (gesture && !gesture.stationary && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6) {
        if (!gesture.dragging) { this.pointerDestination = undefined; this.pointerPathTimer = 0; }
        gesture.dragging = true; gesture.mode = 'move'; this.heldAttack = false;
        this.target = undefined; this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
      }
    });
    canvas.addEventListener('pointerleave', () => { if (!this.pointerGesture) { this.pointerAimActive = false; this.ui.hoveredEnemy = undefined; } });
    window.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') this.pointerAimActive = false;
      if (event.target !== canvas && this.pointerGesture) this.finishPointerGesture(true);
    }, true);
    canvas.addEventListener('pointerdown', event => {
      if (this.paused || this.dead || ![0, 2].includes(event.button) || this.pointerGesture) return;
      event.preventDefault();
      if (event.button === 2 && (this.target || this.pendingPickup !== undefined || this.pendingPortal || this.pendingChest !== undefined)) this.path = [];
      this.pendingPickup = undefined;
      this.begin();
      this.updatePointer(event);
      if (event.pointerType !== 'touch') {
        this.pointerGesture = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, started: performance.now(), dragging: false, stationary: event.shiftKey, mode: event.button === 2 ? 'cast' : 'interact' };
        this.pointerDestination = undefined; this.pointerPathTimer = 0; canvas.setPointerCapture(event.pointerId);
      }
      if (event.button === 2) { this.target = undefined; this.pendingPortal = false; this.pendingChest = undefined; return; }
      this.pendingPortal = false; this.pendingChest = undefined;
      if (this.inCamp && !event.shiftKey && this.raycaster.intersectObject(this.world.portal, true).length) { this.useCampPortal(); return; }
      if (this.inCamp && !event.shiftKey && this.world.sharedStash && this.raycaster.intersectObject(this.world.sharedStash, true).length) { this.useSharedStash(); return; }
      const enemy = this.enemyAt(event.clientX, event.clientY);
      const hit = this.raycaster.intersectObjects(this.loot.map(loot => loot.mesh), true)[0];
      const clickedLoot = hit && this.loot.find(loot => { for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) if (object === loot.mesh) return true; return false; });
      if (!enemy && clickedLoot && !event.shiftKey) { this.pickup(clickedLoot.id); return; }
      const chestHit = !enemy && !event.shiftKey && this.raycaster.intersectObjects(this.world.chests.filter(chest => !chest.opened).map(chest => chest.group), true)[0];
      if (chestHit) {
        const chest = this.world.chests.find(chest => { for (let node: THREE.Object3D | null = chestHit.object; node; node = node.parent) if (node === chest.group) return true; return false; });
        if (chest) { this.openChest(chest.id); return; }
      }
      if (event.shiftKey) { if (this.pointerGesture) this.pointerGesture.mode = 'attack'; this.path = []; this.target = undefined; this.useSkill('attack', true); this.heldAttack = true; }
      else if (enemy) { if (this.pointerGesture) this.pointerGesture.mode = 'attack'; this.target = enemy; this.heldAttack = true; this.path = []; this.targetDestination = undefined; this.targetPathTimer = 0; }
      else { if (this.pointerGesture) this.pointerGesture.mode = 'move'; this.moveTo(this.aim); }
    });
    window.addEventListener('pointerup', event => {
      const gesture = this.pointerGesture;
      if (gesture && (gesture.id !== event.pointerId || event.buttons & 3)) return;
      const cast = gesture?.mode === 'cast' && gesture.button === event.button && !gesture.dragging && !this.paused && !this.dead;
      if (gesture) this.updatePointer(event);
      this.finishPointerGesture();
      if (cast) this.useSkill('bolt', true);
    });
    const cancelPointer = (event: PointerEvent) => { if (!this.pointerGesture || this.pointerGesture.id === event.pointerId) this.finishPointerGesture(true); };
    window.addEventListener('pointercancel', cancelPointer); canvas.addEventListener('lostpointercapture', cancelPointer);
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
      if (key === 't') { this.ui.togglePanel('skills'); return; }
      if (key === 'tab' || key === 'm') { this.ui.togglePanel('map'); return; }
      if (key === 'j') { this.ui.togglePanel('quest'); return; }
      if (this.paused || this.dead) return;
      this.begin(); this.keys.add(key);
      if (key === 'x') { this.swapWeapons(); return; }
      if (key === 'v') { this.hero.running = !this.hero.running; return; }
      const skill = KEYBOARD_SKILLS[key];
      if (skill) { this.useSkill(skill); return; }
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
      if (enemy.dead || enemy.converted > 0) continue;
      const screen = this.project(enemy.actor.group.position.clone().add(new THREE.Vector3(0, enemy.boss ? 1.8 : .9, 0)));
      const d = Math.hypot(x - screen.x, y - screen.y);
      if (d < best) { best = d; found = enemy; }
    }
    return found;
  }
  moveTo(point: THREE.Vector3) {
    this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
    this.target = undefined; this.path = this.world.path(this.position, point);
    if (this.path.length) { this.marker.position.set(this.path[this.path.length - 1].x, .08, this.path[this.path.length - 1].z); this.marker.visible = true; }
  }
  nearestEnemy(range: number) {
    return this.enemies.filter(e => this.combat.hostile(e)).sort((a, b) => a.actor.group.position.distanceToSquared(this.position) - b.actor.group.position.distanceToSquared(this.position)).find(e => e.actor.group.position.distanceTo(this.position) < range);
  }
  useSkill(skill: Skill, aimed = this.pointerAimActive) {
    if (this.paused || this.dead) return;
    if (aimed) this.updatePointerAim();
    if (!this.combat.cast(skill, aimed)) return;
    // Ordinary navigation resumes after the action's recovery. Interactions and
    // chasing a previous attack target still yield to an explicit skill command.
    if (this.pendingPickup !== undefined || this.pendingPortal || this.pendingChest !== undefined || aimed && this.target) this.path = [];
    this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
    if (aimed) { this.target = undefined; this.heldAttack = false; }
  }
  openChest(id: number, telekinesis=false) {
    if (this.inCamp || this.paused || this.dead || this.saveConflict || !this.profile) return;
    const chest = this.world.chests.find(chest => chest.id === id && !chest.opened); if (!chest) return;
    if(telekinesis&&(!skillLevel(this.hero,'telekinesis')||Math.hypot(this.position.x-chest.x,this.position.z-chest.z)>12||!clearShot(this.world.grid,this.position,chest)))return;
    this.begin(); this.target = undefined; this.heldAttack = false; this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
    if (!telekinesis && Math.hypot(this.position.x - chest.x, this.position.z - chest.z) > 3) {
      this.moveTo(new THREE.Vector3(chest.x, 0, chest.z));
      const end = this.path.at(-1);
      if (end && Math.hypot(end.x - chest.x, end.z - chest.z) <= 3) this.pendingChest = id;
      else { this.path = []; this.ui.toast('无法靠近该箱子'); }
      return;
    }
    // Resolve drops before marking open; a second interaction cannot roll this chest again.
    const mods = stats(this.hero).mods, drops = rollChestLoot(chestContext(this.level, difficulty(this.hero), mods.magicFind, mods.goldFind));
    chest.opened = true; this.path = []; this.body.velocity.set(0, 0, 0);
    for (const [i, drop] of drops.entries()) {
      const angle = i * 2.4, desired = { x: chest.x + Math.cos(angle) * 2, z: chest.z + Math.sin(angle) * 2 };
      const point = this.world.path(this.position, desired).at(-1) ?? this.position;
      this.addLoot({ ...drop, id: this.nextId++, x: point.x, z: point.z, mesh: new THREE.Group() });
    }
    this.audio.play('loot');
  }
  hurtEnemy(enemy: Enemy, damage: number) { this.combat.damage(enemy, damage, 'physical'); }
  killEnemy(enemy: Enemy, rewardMods?: Mods) {
    if (enemy.dead) return;
    enemy.dead = true; this.monsterCombat.cancel(enemy); this.world.physics.removeBody(enemy.body);
    if (enemy.summoned) { enemy.redeemed = true; enemy.actor.group.visible = false; if (this.target === enemy) { this.target = undefined; this.path = []; } return; }
    this.hero.kills++;
    const playerStats = stats(this.hero); if (rewardMods) playerStats.mods = rewardMods;
    this.hero.mana = Math.min(playerStats.maxMana, this.hero.mana + (playerStats.mods.manaOnKill ?? 0));
    this.hero.hp = Math.min(playerStats.maxHp, this.hero.hp + (playerStats.mods.lifeOnKill ?? 0) + (enemy.definition?.race === 'demon' ? playerStats.mods.lifeOnDemonKill ?? 0 : 0));
    if (playerStats.mods.restInPeace) enemy.redeemed = true;
    enemy.actor.group.rotation.z = -Math.PI / 2; enemy.actor.group.position.y = .2;
    if (this.target === enemy) { this.target = undefined; this.path = []; }
    const rank: DropRank = enemy.boss ? this.level.actBoss ? 'actBoss' : 'miniboss' : enemy.elite ? 'elite' : 'monster';
    const xp = monsterExperience(this.hero.level, enemy.level, rank, { difficulty: difficulty(this.hero), act: this.level.act, baseLife: enemy.definition?.hp, firstClear: this.hero.campaign.cleared[difficulty(this.hero)] === this.level.index });
    if (gainXp(this.hero, xp * (1 + (playerStats.mods.experienceBonus ?? 0) / 100))) { this.ui.toast('等级提升', `等级 ${this.hero.level} · 5 属性点 · 1 技能点`); this.audio.play('level'); this.burst(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xf4d68b, 35); }
    const wasReady = questComplete(this.hero.campaign);
    if (!enemy.boss) recordQuestKill(this.hero);
    if (!wasReady && questComplete(this.hero.campaign)) { this.ui.toast('任务已完成', `${this.level.boss}已现身`); this.save(false); }
    this.dropLoot(enemy.actor.group.position, rank, enemy.level);
    if (enemy.boss) {
      if (!completeCampaignLevel(this.hero)) return;
      this.world.exit.visible = true; this.ui.toast(`${this.level.boss}已被击败`, this.level.actBoss ? '本章已通关' : '下一关已解锁');
      this.save(false); this.victoryTimer = 1.1;
    }
  }
  dropLoot(position: THREE.Vector3, rank: DropRank = 'monster', areaLevel: number = levelTuning(this.level, difficulty(this.hero)).level) {
    const mods = stats(this.hero).mods, diff = difficulty(this.hero);
    const drop = rollLoot({ level: areaLevel, act: this.level.act, difficulty: diff, rank, levelIndex: this.level.index, firstClear: this.hero.campaign.cleared[diff] <= this.level.index, magicFind: mods.magicFind, goldFind: mods.goldFind });
    this.addLoot({ id: this.nextId++, x: position.x + .4, z: position.z + .2, gold: drop.gold, mesh: new THREE.Group() });
    drop.items.forEach((item, i) => this.addLoot({ id: this.nextId++, x: position.x - .6 + i * .8, z: position.z + .6, item, mesh: new THREE.Group() }));
    drop.runes.forEach((rune, i) => this.addLoot({ id: this.nextId++, x: position.x + .8, z: position.z - .5 - i * .6, rune, mesh: new THREE.Group() }));
    if (drop.potion !== undefined) this.addLoot({ id: this.nextId++, x: position.x, z: position.z + .9, potion: drop.potion, mesh: new THREE.Group() });
  }
  addLoot(loot: Loot) {
    const color = loot.item ? COLORS[loot.item.rarity] : loot.gold || loot.rune ? 0xe5bd60 : loot.potion === 0 ? 0xe45555 : 0x56a7eb;
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
    this.begin(); this.target = undefined; this.heldAttack = false; this.pendingPickup = undefined; this.pendingChest = undefined; this.pendingPortal = false; this.path = [];
    if (loot.item && !packItems([...this.hero.inventory, loot.item])) { this.ui.toast('背包空间不足'); return; }
    if (Math.hypot(this.position.x - loot.x, this.position.z - loot.z) > 3) {
      this.moveTo(new THREE.Vector3(loot.x, 0, loot.z));
      const end = this.path.at(-1);
      if (!end || Math.hypot(end.x - loot.x, end.z - loot.z) > 3) { this.path = []; this.ui.toast('无法靠近该物品'); return; }
      this.pendingPickup = id; return;
    }
    this.collectLoot(loot);
  }
  collectLoot(loot: Loot) {
    if (this.paused || this.dead || !this.loot.includes(loot)) return;
    if (loot.item) {
      if (!packItems([...this.hero.inventory, loot.item])) { this.ui.toast('背包空间不足'); return; }
      this.hero.inventory.push(loot.item); placeItems(this.hero.inventory); this.ui.toast(loot.item.name, '已收入背包');
    } else if (loot.rune) { this.hero.runes.push(loot.rune); this.ui.toast(`${runeLabel(loot.rune)}符文`);
    } else if (loot.gold) { this.hero.gold += loot.gold; this.ui.floatText(`+${loot.gold}`, this.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 'gold'); }
    else if (loot.potion !== undefined) this.hero.potions[loot.potion] = Math.min(99, this.hero.potions[loot.potion] + 1);
    this.disposeObject(loot.mesh); this.loot.splice(this.loot.indexOf(loot), 1); this.audio.play('loot'); this.save(false);
  }
  updateLootPickup() {
    if (this.paused || this.dead) return;
    if (this.pendingPickup !== undefined) {
      const selected = this.loot.find(loot => loot.id === this.pendingPickup);
      if (!selected) this.pendingPickup = undefined;
      else if (Math.hypot(this.position.x - selected.x, this.position.z - selected.z) <= 3) {
        this.pendingPickup = undefined; this.path = []; this.body.velocity.set(0, 0, 0); this.collectLoot(selected);
      } else if (!this.path.length) this.pendingPickup = undefined;
    }
    for (const loot of [...this.loot]) if (!loot.item && Math.hypot(loot.x - this.position.x, loot.z - this.position.z) < (loot.gold || loot.potion !== undefined ? 1.6 : 1)) this.collectLoot(loot);
  }
  drink(index: 0 | 1) {
    if (this.paused || this.dead) return;
    const s = stats(this.hero), key = index === 0 ? 'hp' : 'mana', max = index === 0 ? s.maxHp : s.maxMana;
    if (this.hero[key] >= max) { this.ui.toast(index === 0 ? '生命值已满' : '法力值已满'); return; }
    if (!this.hero.potions[index]) { this.ui.toast('药剂已用尽'); return; }
    this.hero.potions[index]--; this.combat.regen[index] += index ? 80 : 160;
    this.burst(this.position.clone().add(new THREE.Vector3(0, 1, 0)), index === 0 ? 0xe25c65 : 0x63c8ed, 15); this.audio.play('loot'); this.save(false);
  }
  contextAction() {
    if (this.dead) return null;
    if (this.hero.corpse && Math.hypot(this.position.x - this.hero.corpse.x, this.position.z - this.hero.corpse.z) < 2.8) return { name: '取回遗体装备', kind: 'corpse', id: 0 };
    if (this.inCamp) {
      if (Math.hypot(this.position.x - CAMP.stash.x, this.position.z - CAMP.stash.z) < 3.5) return { name: '本地共享仓库', kind: 'shared-stash', id: 0 };
      if (Math.hypot(this.position.x - CAMP.portal.x, this.position.z - CAMP.portal.z) < 3.5) return { name: '传送阵 · 选择关卡', kind: 'camp-portal', id: 0 };
      if (Math.hypot(this.position.x - CAMP.supply.x, this.position.z - CAMP.supply.z) < 3.5) return { name: '旅者补给', kind: 'shop', id: 0 };
      return null;
    }
    const chest = this.world.chests?.find(chest => !chest.opened && Math.hypot(this.position.x - chest.x, this.position.z - chest.z) <= 3);
    if (chest) return { name: '打开箱子', kind: 'chest', id: chest.id };
    const layout = levelLayout(this.level), shrine = layout.objects.findIndex(p => Math.hypot(this.position.x - p.x, this.position.z - p.z) < 3.4);
    if (shrine >= 0 && !this.hero.campaign.objects.includes(shrine)) return { name: this.level.quest.action, kind: 'objective', id: shrine };
    if (this.hero.bossDefeated && Math.hypot(this.position.x - layout.exit.x, this.position.z - layout.exit.z) < 3.5) return { name: this.level.index === 24 ? '战役结算' : this.level.actBoss ? '前往下一章' : '前往下一关', kind: 'exit', id: 0 };
    if (this.position.distanceTo(new THREE.Vector3(-5.8, 0, 12)) < 3.5) return { name: '旅者补给', kind: 'shop', id: 0 };
    if (this.loot.some(l => !l.item && Math.hypot(l.x - this.position.x, l.z - this.position.z) < 3)) return { name: '拾取补给', kind: 'loot', id: 0 };
    return null;
  }
  interact() {
    if (this.paused || this.dead) return;
    this.begin(); const action = this.contextAction(); if (!action) return;
    if (action.kind === 'corpse') { if (recoverCorpse(this.hero, !this.inCamp)) { this.ui.toast('装备已取回'); this.save(false); } else this.ui.toast('背包空间不足'); return; }
    if (action.kind === 'shop') { this.ui.openPanel('shop'); return; }
    if (action.kind === 'camp-portal') { this.ui.openPanel('campaign'); return; }
    if (action.kind === 'shared-stash') { this.ui.openPanel('shared-stash'); return; }
    if (action.kind === 'chest') { this.openChest(action.id); return; }
    if (action.kind === 'exit') { this.ui.openPanel('victory'); return; }
    if (action.kind === 'loot') { [...this.loot].filter(l => !l.item && Math.hypot(l.x - this.position.x, l.z - this.position.z) < 3).forEach(l => this.collectLoot(l)); return; }
    const p = levelLayout(this.level).objects[action.id];
    if (this.enemies.some(e => !e.dead && !e.boss && Math.hypot(e.actor.group.position.x - p.x, e.actor.group.position.z - p.z) < 5)) { this.ui.toast('附近仍有守卫'); return; }
    if (!activateQuestObject(this.hero, action.id)) return;
    this.world.completeObjective(action.id);
    this.hero.hp = stats(this.hero).maxHp; this.hero.mana = stats(this.hero).maxMana;
    this.burst(new THREE.Vector3(p.x, 2, p.z), ACTS[this.level.act].accent, 25); this.audio.play('level');
    this.ui.toast(this.level.quest.action, questComplete(this.hero.campaign) ? `任务已完成 · 击败${this.level.boss}` : `${this.hero.campaign.objects.length} / ${this.level.quest.count}`); this.save(false);
  }
  buy(index: 0 | 1) {
    if (this.hero.gold < 25) { this.ui.toast('金币不足'); return; }
    if (this.hero.potions[index] >= 99) return;
    this.hero.gold -= 25; this.hero.potions[index]++; this.audio.play('loot'); this.ui.renderPanel(); this.save(false);
  }
  equip(id: string, slot?: Slot) { if (equipItem(this.hero, id, slot)) { this.audio.play('loot'); this.save(false); this.ui.renderPanel(); } else { const item = this.hero.inventory.find(item => item.id === id); this.ui.toast(item ? equipReason(this.hero, item, slot) || '背包空间不足' : '物品不存在'); } }
  swapWeapons() { swapWeapons(this.hero); this.ui.toast(`武器组 ${this.hero.weaponSet + 1}`); this.save(false); this.ui.renderPanel(); }
  salvage(id: string) {
    if (this.saveConflict || !sellItem(this.hero, id)) return;
    this.ui.selectedItem = undefined; this.save(false); this.ui.renderPanel();
  }
  allocate(key: Attribute, count = 1) {
    if (!allocateAttribute(this.hero, key, count)) return;
    this.ui.renderPanel(); this.save(false);
  }
  save(notify = true) {
    if (this.ui?.sharedStashScreen?.busy) return false;
    if (!this.profile) return true;
    if (!this.saves || this.saveConflict) return false;
    const savedHero = this.dead ? { ...this.hero, hp: stats(this.hero).maxHp, mana: stats(this.hero).maxMana } : this.hero;
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
    this.dead = false; this.hero.hp = stats(this.hero).maxHp; this.hero.mana = stats(this.hero).maxMana; this.hero.stamina = stats(this.hero).maxStamina;
    this.body.position.set(0, .5, 11); this.actor.group.position.set(0, 0, 11); this.actor.group.rotation.z = 0;
    this.invincible = 4; this.enemies.forEach(e => { e.active = false; }); this.ui.closePanel(); this.save(false);
  }
  nextJourney() {
    if (this.inCamp || !this.hero.bossDefeated) return;
    if (this.level.index < 24) this.enterLevel(this.level.index + 1);
    else if (difficulty(this.hero) < 2) this.enterLevel(0, difficulty(this.hero) + 1);
  }
  changeDifficulty(value: number) {
    if (![0, 1, 2].includes(value) || value === this.hero.difficultyLevel) return;
    this.enterLevel(Math.min(24, this.hero.campaign.cleared[value]), value);
  }
  enterLevel(index: number, diff: number = difficulty(this.hero)) {
    if (this.dead || !this.profile || this.saveConflict || !canEnterLevel(this.hero.campaign, index, diff)) return false;
    const previous = structuredClone(this.hero);
    if (!selectCampaignLevel(this.hero, index, diff as 0 | 1 | 2, this.inCamp)) return false;
    if (!this.save(false)) { this.hero = previous; return false; }
    this.loadArea(false); this.ui.toast(this.level.name, `第 ${this.level.act + 1} 章 · 第 ${this.level.step + 1} 关`); return true;
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
    if (this.victoryTimer > 0) { this.victoryTimer -= dt; if (this.victoryTimer <= 0) { this.ui.openPanel('victory'); return; } }
    this.attackTime = Math.max(0, this.attackTime - dt * 3.5); this.invincible = Math.max(0, this.invincible - dt);
    if (this.pointerAimActive) this.updatePointerAim();
    this.combat.update(dt); if (this.dead) return;
    const s = stats(this.hero);
    const move = new THREE.Vector2(
      Number(this.keys.has('arrowright')) - Number(this.keys.has('arrowleft')) + this.joystick.x,
      Number(this.keys.has('arrowdown')) - Number(this.keys.has('arrowup')) + this.joystick.y,
    );
    let vx = 0, vz = 0;
    let navigating = false;
    if (move.length() > .1) {
      if (this.pointerGesture && this.pointerGesture.mode !== 'cast') this.finishPointerGesture(true);
      this.pendingPickup = undefined; this.pendingPortal = false; this.pendingChest = undefined;
      move.normalize(); vx = (move.x + move.y) * Math.SQRT1_2; vz = (move.y - move.x) * Math.SQRT1_2; this.path = []; this.target = undefined;
    } else {
      this.updatePointerNavigation(dt);
      if (this.target && this.combat.hostile(this.target)) {
        const bound = this.hero.bindings.attack;
        this.targetPathTimer = Math.max(0, this.targetPathTimer - dt);
        if (this.combat.canReach(this.target, bound)) { this.path = []; this.combat.castAction(bound); }
        else if (!this.targetPathTimer && this.combat.lock <= .1 && !this.combat.zeal && !this.combat.classes.sequence
          && (!this.path.length || !this.targetDestination || this.targetDestination.distanceToSquared(this.target.actor.group.position) > .5 ** 2)) {
          this.targetDestination = this.target.actor.group.position.clone(); this.targetPathTimer = .2;
          this.path = this.world.path(this.position, this.targetDestination);
        }
      } else if (this.heldAttack) this.combat.castAction(this.hero.bindings.attack, true);
      navigating = this.path.length > 0;
    }
    const locked = this.combat.zeal || this.combat.classes.sequence || this.combat.lock > .1;
    const speed = locked ? 0 : (this.hero.running && this.hero.stamina > 0 ? 5.2 : 3) * s.runSpeed;
    if (navigating) { const velocity = followPath(this.position, this.path, speed, dt); vx = velocity.x; vz = velocity.z; }
    else { vx *= speed; vz *= speed; }
    this.combat.moving = !!(vx || vz); this.combat.running = this.combat.moving && this.hero.running && this.hero.stamina > 0;
    this.body.velocity.set(vx, 0, vz);
    if (vx || vz) this.actor.group.rotation.y = Math.atan2(vx, vz);
    if (this.path.length) this.marker.position.set(this.path.at(-1)!.x, .08, this.path.at(-1)!.z);
    this.marker.visible = this.path.length > 0;
    this.monsterCombat.update(dt); if (this.dead) return;
    this.world.physics.step(1 / 60, dt, 3);
    this.position.set(this.body.position.x, 0, this.body.position.z);
    const campTarget = CAMP[this.pendingCampTarget];
    if (this.pendingPortal && Math.hypot(this.position.x - campTarget.x, this.position.z - campTarget.z) < 3.5) { this.ui.openPanel(this.pendingCampTarget === 'stash' ? 'shared-stash' : 'campaign'); return; }
    if (this.pendingChest !== undefined) {
      const chest = this.world.chests.find(chest => chest.id === this.pendingChest && !chest.opened);
      if (!chest || !this.path.length && Math.hypot(this.position.x - chest.x, this.position.z - chest.z) > 3) this.pendingChest = undefined;
      else if (Math.hypot(this.position.x - chest.x, this.position.z - chest.z) <= 3) this.openChest(chest.id);
    }
    for (const enemy of this.enemies) if (!enemy.dead) enemy.actor.group.position.set(enemy.body.position.x, 0, enemy.body.position.z);
    animateActor(this.actor, this.time, this.combat.moving, this.attackTime);
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
    this.updateLootPickup();
    const cx = Math.floor(this.position.x / 3), cz = Math.floor(this.position.z / 3);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) this.visited.add(`${cx + dx},${cz + dz}`);
    this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(false); }
  }
  hurtPlayer(damage: number) {
    this.combat.hurt(damage);
  }
  loop = () => {
    const now = performance.now(), dt = Math.min((now - this.lastFrame) / 1000, .05); this.lastFrame = now;
    this.update(dt); this.updateCamera(Math.min(1, dt * 7));
    if (this.quality === 'low') this.renderer.render(this.world.scene, this.camera); else this.composer.render();
    this.ui.update(dt); this.frameId = requestAnimationFrame(this.loop);
  };
}
