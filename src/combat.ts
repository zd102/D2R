import { playerLifeFactor } from './player-count.ts';
import * as THREE from 'three';
import { castSound, impactSound, weaponSound } from './audio-bank.ts';
import type { Game, Enemy, Skill } from './game';
import { stats, equippedAuras, skillLevel, setAura, hitChance, resistedDamage, difficulty, createCorpse, clampResources } from './model.ts';
import { skillValues, isAura, tierValue, PALADIN_BALANCE, type ActionId, type DamageType } from './paladin.ts';
import { makeRing, gridWalkable } from './world.ts';
import { heroAction, playHeroAction } from './hero-models.ts';
import { createProjectileVisual, decorateAura, updateVisual, updateHeroWards } from './visual-effects.ts';
import { questComplete } from './campaign.ts';
import { isUndead, leechEffectiveness } from './bestiary.ts';
import { itemMods, weaponType, type Item } from './items.ts';
import { clearShot } from './ranged.ts';
import { elementalDamage, poisonDamage } from './affixes.ts';
import { itemDamage, absorbDamage, openWoundsDps } from './item-effects.ts';
import type { SkillId } from './paladin.ts';
import { activeEquipment, activeCharms } from './model.ts';
import { itemTriggers } from './item-catalog.ts';
import { CURSE_NAMES, type ItemCurse } from './item-effects.ts';
import { ClassCombat } from './class-combat.ts';
import { classSkillMode, type ExtraSkillId } from './class-skills.ts';
import { isPassive } from './paladin.ts';
import { strongerAura } from './mercenary-auras.ts';

export type AttackSnapshot = { stats: ReturnType<typeof stats>; level: number; difficulty: number; skills: Record<SkillId, number>; items: Item[]; origin: THREE.Vector3; mercenary?: boolean };
export type Projectile = { mesh: THREE.Mesh; origin: THREE.Vector3; direction: THREE.Vector3; phase: number; age: number; life: number; damage: number; healing: number; kind: 'hammer' | 'bolt' | 'arrow' | 'throw'; hit: Set<number>; snapshot: AttackSnapshot; speed: number; pierce: number; magicArrow: number; explosion: number };
export class PaladinCombat {
  game: Game;
  lock = 0;
  actionCooldowns: Partial<Record<ActionId, number>> = {};
  stagger = 0;
  movementRecovery = 0;
  fohDelay = 0;
  auraTimer = 0;
  regen: [number, number] = [0, 0];
  repairTime = new WeakMap<Item, number>();
  itemCurses = new WeakMap<Enemy, { kind: ItemCurse; remaining: number }>();
  zeal: { hits: number; timer: number; direction: THREE.Vector3; aimed: boolean } | null = null;
  projectiles: Projectile[] = [];
  auraRing = makeRing(1.3, 0xd8c674, .65);
  shieldRing = makeRing(.7, 0xebdd9d, .8);
  corpseRing = makeRing(.8, 0xe4dac4, .9);
  moving = false;
  running = false;
  ammoWarning = 0;
  classes = new ClassCombat(this);
  constructor(game: Game) { this.game = game; decorateAura(this.auraRing); game.world.scene.add(this.auraRing, this.shieldRing, this.corpseRing); this.auraRing.visible = this.shieldRing.visible = this.corpseRing.visible = false; }
  cooldown(id: ActionId) {
    if (isAura(id) || isPassive(id)) return 0;
    return Math.max(this.actionCooldowns[id] ?? 0, this.classes.delays[id as ExtraSkillId] ?? 0, id === 'fistOfHeavens' ? this.fohDelay : 0);
  }
  readyIn(id: ActionId) { return Math.max(this.stagger, this.cooldown(id)); }
  get movementLocked() { return this.stagger > 0 || this.movementRecovery > 0 || !!this.zeal || !!this.classes.sequence; }
  startAction(id: ActionId, duration: number) {
    const s=stats(this.game.hero);
    playHeroAction(this.game.actor,heroAction(id,s.ranged?.kind,s.weapon?weaponType(s.weapon):undefined),this.game.time,duration);
    // Switching actions cancels the unfinished combo, but keeps its own cadence.
    this.zeal = null; this.classes.sequence = undefined;
    this.lock = duration; this.actionCooldowns[id] = duration;
    this.movementRecovery = Math.min(.12, duration * .35);
  }
  recover(duration: number) {
    playHeroAction(this.game.actor,'recover',this.game.time,Math.max(.2,duration));
    this.stagger = Math.max(this.stagger, duration);
    this.lock = Math.max(this.lock, duration);
  }
  hostile(enemy: Enemy) { return !enemy.dead && enemy.converted <= 0 && (!enemy.boss || !!this.game.specialArea || questComplete(this.game.hero.campaign)); }
  inAura(enemy: Enemy) { return enemy.actor.group.position.distanceTo(this.game.position) <= stats(this.game.hero).aura.radius; }
  auraAt(enemy: Enemy, id: SkillId, s = stats(this.game.hero), origin = this.game.position) {
    const own = s.auras.find(aura => !aura.mercenary && aura.id === id && enemy.actor.group.position.distanceTo(origin) <= aura.radius), merc = this.game.mercenary?.auraAt(enemy, id);
    return merc && (!own || strongerAura(merc, own)) ? merc : own;
  }
  snapshot(): AttackSnapshot { const h = this.game.hero; return { stats: stats(h), level: h.level, difficulty: difficulty(h), skills: { ...h.skills }, items: structuredClone([...activeEquipment(h), ...activeCharms(h)]), origin: this.game.position.clone() }; }
  reach(id: ActionId) { return this.classes.reach(id) ?? (id === 'attack' && stats(this.game.hero).ranged ? 14 : ['holyBolt', 'fistOfHeavens', 'charge'].includes(id) ? 12 : id === 'blessedHammer' ? 5 : 2.5); }
  canReach(enemy: Enemy, id: ActionId) { return enemy.actor.group.position.distanceTo(this.game.position) < this.reach(id) && clearShot(this.game.world.grid, this.game.position, enemy.actor.group.position); }
  triggerItems(event: string, target: Enemy, equipment?: Item[]) {
    const g = this.game, triggers = new Map<string, ReturnType<typeof itemTriggers>[number]>();
    for (const item of equipment ?? [...activeEquipment(g.hero), ...activeCharms(g.hero)]) for (const trigger of itemTriggers(item)) if (trigger.event === event) {
      const key = `${trigger.kind}:${trigger.level}`, previous = triggers.get(key);
      triggers.set(key, { ...trigger, chance: trigger.chance + (previous?.chance ?? 0) });
    }
    for (const trigger of triggers.values()) if (Math.random() * 100 < trigger.chance) {
      const duration = trigger.kind === 'amplify' ? 5 + trigger.level * 3 : trigger.kind === 'decrepify' ? 3.4 + trigger.level * .6 : (trigger.kind === 'lifeTap' ? 13.6 : 11.6) + trigger.level * 2.4;
      const radius = trigger.kind === 'decrepify' ? 4 : (trigger.kind === 'weaken' ? 6 : trigger.kind === 'lifeTap' ? 8 / 3 : 2) + (trigger.level - 1) * 2 / 3;
      for (const enemy of g.enemies) if (this.hostile(enemy) && enemy.actor.group.position.distanceTo(target.actor.group.position) <= radius) this.itemCurses.set(enemy, { kind: trigger.kind, remaining: duration });
      g.ui.floatText(CURSE_NAMES[trigger.kind], target.actor.group.position.clone().setY(2.2), 'magic-damage');
    }
  }
  physicalResistance(enemy: Enemy) {
    const curse = this.itemCurses.get(enemy)?.kind, reduction = curse === 'amplify' ? 100 : curse === 'decrepify' ? 50 : 0;
    return enemy.resistances.physical - reduction / (enemy.resistances.physical >= 100 ? 5 : 1);
  }
  pointedEnemy() {
    const g = this.game, hovered = g.ui.hoveredEnemy;
    if (hovered && this.hostile(hovered) && hovered.actor.group.position.distanceTo(g.position) <= 14 && clearShot(g.world.grid, g.position, hovered.actor.group.position)) return hovered;
    const direction = g.aim.clone().sub(g.position).setY(0);
    return g.enemies.filter(enemy => this.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) <= 14
      && enemy.actor.group.position.distanceTo(g.aim) <= 2 && enemy.actor.group.position.clone().sub(g.position).dot(direction) > 0 && clearShot(g.world.grid, g.position, enemy.actor.group.position))
      .sort((a, b) => a.actor.group.position.distanceToSquared(g.aim) - b.actor.group.position.distanceToSquared(g.aim))[0];
  }
  cast(slot: Skill, aimed = false): boolean {
    const g = this.game, h = g.hero, id = h.bindings[slot];
    if (g.paused || g.dead) return false; g.begin();
    if (isAura(id)) { setAura(h, h.activeAura === id ? null : id as Exclude<ActionId, 'attack'>); this.auraTimer = 0; g.audio.play('aura', { nativeKey: `cast:${id}` }); g.save(false); return true; }
    return this.castAction(id, aimed);
  }
  castAction(id: ActionId, aimed = false): boolean {
    if (isAura(id) || isPassive(id)) return false;
    if (this.readyIn(id) > 0 || this.game.paused || this.game.dead) return false;
    if (classSkillMode(id)) return this.classes.cast(id as ExtraSkillId,aimed);
    const g = this.game, h = g.hero, s = stats(h), rank = skillLevel(h, id, s.mods), v = skillValues(id, rank, h.skills);
    if (id !== 'attack' && !rank || id === 'fistOfHeavens' && this.fohDelay > 0) return false;
    if ((id === 'smite' || id === 'holyShield') && !s.hasShield) { g.ui.toast('需要可用的盾牌'); return false; }
    if (s.ranged && !s.ranged.stack && ['sacrifice', 'zeal', 'vengeance', 'conversion', 'charge'].includes(id)) { if (!this.ammoWarning) g.ui.toast('该技能需要近战武器'); this.ammoWarning = 1; return false; }
    if (h.mana < v.cost) { g.ui.toast('法力不足'); return false; }
    const origin = g.position.clone();
    const target = aimed ? this.pointedEnemy() : g.target && this.hostile(g.target) && g.target.actor.group.position.distanceTo(origin) <= 14 && clearShot(g.world.grid, origin, g.target.actor.group.position) ? g.target : g.enemies.filter(enemy => this.hostile(enemy) && enemy.actor.group.position.distanceTo(origin) <= 14 && clearShot(g.world.grid, origin, enemy.actor.group.position)).sort((a, b) => a.actor.group.position.distanceToSquared(origin) - b.actor.group.position.distanceToSquared(origin))[0];
    if (id === 'fistOfHeavens' && (!target || !this.canReach(target, id))) { g.ui.toast('没有可攻击的目标'); return false; }
    const direction = aimed ? g.aim.clone().sub(origin) : target ? target.actor.group.position.clone().sub(origin) : new THREE.Vector3(Math.sin(g.actor.group.rotation.y), 0, Math.cos(g.actor.group.rotation.y));
    direction.y = 0; direction.normalize(); if (!direction.lengthSq()) direction.set(Math.sin(g.actor.group.rotation.y), 0, Math.cos(g.actor.group.rotation.y));
    const casting = ['holyBolt', 'blessedHammer', 'holyShield', 'fistOfHeavens'].includes(id);
    const ranged = id === 'attack' && s.ranged && s.weapon;
    this.startAction(id, id === 'zeal' ? (s.attackFrames + s.zealFrames * (v.hits - 1)) / 25 : (casting ? s.castFrames : ranged ? s.rangedFrames : s.attackFrames) / 25);
    h.mana -= v.cost; g.attackTime = 1; g.actor.group.rotation.y = Math.atan2(direction.x, direction.z);
    if (id === 'holyShield') { h.holyShield = v.duration; h.holyShieldLevel = rank; g.burst(origin.clone().setY(1), 0xffebaa, 24); g.audio.play(castSound(id, v.type), { nativeKey: `cast:${id}` }); g.save(false); return true; }
    if (ranged) { this.shootWeapon(origin, direction, target); return true; }
    if (id === 'holyBolt' || id === 'blessedHammer') {
      const hammer = id === 'blessedHammer';
      const mesh = createProjectileVisual('magic',hammer?'hammer':'bolt',.15,g.projectileVisuals);
      mesh.position.copy(origin).setY(.9); g.world.scene.add(mesh);
      const concentration = hammer ? 1 + (s.auras.find(aura => aura.id === 'concentration')?.damage ?? 0) / 200 : 1;
      // Align one point on the spiral with the aim at cast time, without homing afterward.
      const aimDistance = Math.max(1.2, Math.min(4.5, aimed ? g.aim.distanceTo(origin) : target ? target.actor.group.position.distanceTo(origin) : 2));
      const phase = Math.atan2(direction.z, direction.x) - (hammer ? 7 * (aimDistance - .7) / 2.5 : 0);
      this.projectiles.push({ mesh, origin, direction, phase, age: 0, life: hammer ? 2.3 : 1.25, damage: (v.min + Math.random() * (v.max - v.min)) * concentration, healing: v.healing, kind: hammer ? 'hammer' : 'bolt', hit: new Set(), snapshot: this.snapshot(), speed: 14, pierce: 0, magicArrow: 0, explosion: 0 });
      g.audio.play(castSound(id, v.type), { nativeKey: `cast:${id}` }); return true;
    }
    if (id === 'fistOfHeavens' && target) {
      this.fohDelay = .4; const point = target.actor.group.position.clone(); g.beam(point.clone().setY(10), point.clone().setY(.5));
      this.damage(target, v.min + Math.random() * (v.max - v.min), 'lightning');
      const holyHits = new Set<number>([target.id]);
      for (const enemy of g.enemies) if (this.hostile(enemy) && (isUndead(enemy) || (enemy.definition?.race ?? enemy.kind) === 'demon') && enemy.actor.group.position.distanceTo(point) < 8) {
        const mesh = createProjectileVisual('magic','bolt',.12,g.projectileVisuals);
        mesh.position.copy(point).setY(.9); g.world.scene.add(mesh);
        const flight = enemy.actor.group.position.clone().sub(point).setY(0).normalize(); if (!flight.lengthSq()) flight.copy(direction);
        // Outgoing bolts must leave the impact target before testing other bodies.
        this.projectiles.push({ mesh, origin: point.clone(), direction: flight, phase: 0, age: 0, life: .75, damage: v.secondary, healing: 0, kind: 'bolt', hit: holyHits, snapshot: this.snapshot(), speed: 16, pierce: 0, magicArrow: 0, explosion: 0 });
      }
      g.audio.play(castSound(id, v.type), { nativeKey: `cast:${id}` }); return true;
    }
    if (id === 'charge') {
      let last = origin.clone(); const distance = aimed ? Math.min(10, Math.max(0, g.aim.distanceTo(origin) - (target ? 1.2 : 0))) : target ? Math.min(10, Math.max(0, target.actor.group.position.distanceTo(origin) - 1.2)) : 8;
      for (let step = .25; step <= distance; step += .25) { const next = origin.clone().addScaledVector(direction, step); if (!gridWalkable(g.world.grid, next)) break; last = next; if (step % 1 === 0) g.burst(next.clone().setY(.4), 0xe5ce84, 2); }
      g.body.position.set(last.x, .5, last.z); g.position.copy(last); g.path = []; this.melee(id, direction, aimed); return true;
    }
    if (id === 'zeal') { this.zeal = { hits: v.hits, timer: 0, direction, aimed }; return true; }
    this.melee(id, direction, aimed);
    return true;
  }
  shootWeapon(origin: THREE.Vector3, direction: THREE.Vector3, target?: Enemy) {
    const g = this.game, snapshot = this.snapshot(), s = snapshot.stats, base = s.ranged!;
    const bow = !base.stack, explosion = bow ? s.mods.explosiveArrowLevel ?? 0 : 0, magicArrow = bow && !explosion ? s.mods.magicArrowLevel ?? 0 : 0;
    const mesh = createProjectileVisual(explosion?'fire':magicArrow?'magic':'physical',bow?'arrow':base.kind==='javelin'?'javelin':base.kind==='axe'?'axe':'knife',.16,g.projectileVisuals);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); mesh.position.copy(origin).setY(.9); g.world.scene.add(mesh);
    this.projectiles.push({ mesh, origin, direction, phase: 0, age: 0, life: 1, damage: 0, healing: 0, kind: bow ? 'arrow' : 'throw', hit: new Set(), snapshot, speed: bow ? 20 : 18, pierce: Math.max(0, Math.min(100, s.mods.pierceChance ?? 0)), magicArrow, explosion });
    if (target) this.triggerItems('att-skill', target, snapshot.items);
    g.audio.play(weaponSound(s.weapon ? weaponType(s.weapon) : undefined));
  }
  melee(id: ActionId, direction: THREE.Vector3, aimed = false) {
    const g = this.game, h = g.hero, s = stats(h), v = skillValues(id, skillLevel(h, id, s.mods), h.skills);
    const enemies = g.enemies.filter(enemy => this.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) <= 2.6 && enemy.actor.group.position.clone().sub(g.position).normalize().dot(direction) > (aimed ? .3 : -.3));
    const enemy = (!aimed && g.target && enemies.includes(g.target) ? g.target : enemies.sort((a, b) => a.actor.group.position.distanceToSquared(g.position) - b.actor.group.position.distanceToSquared(g.position))[0]);
    const slash = makeRing(1.7, id === 'vengeance' ? 0x96daef : id === 'sacrifice' ? 0xe5948d : 0xe5d6ae, .85);
    slash.geometry.dispose(); slash.geometry = new THREE.RingGeometry(1.4, 1.8, 24, 1, -.8, 1.6); slash.rotation.z = -Math.atan2(direction.x, direction.z) + Math.PI / 2; slash.position.copy(g.position).setY(.25);
    g.world.scene.add(slash); g.effects.push({ mesh: slash, duration: .2, life: .2, type: 'slash' }); g.attackTime = 1; g.audio.play(id === 'smite' ? 'bluntSwing' : weaponSound(s.weapon ? weaponType(s.weapon) : undefined), { nativeKey: `cast:${id}` });
    playHeroAction(g.actor,heroAction(id,undefined,s.weapon?weaponType(s.weapon):undefined),g.time,id==='zeal'?s.zealFrames/25:.35);
    if (!enemy) return;
    this.triggerItems('att-skill', enemy);
    this.weaponHit(enemy, id);
  }
  weaponHit(enemy: Enemy, id: ActionId, projectile?: Projectile) {
    const g = this.game, h = g.hero, snapshot = projectile?.snapshot, s = snapshot?.stats ?? stats(h), level = snapshot?.level ?? h.level, diff = snapshot?.difficulty ?? difficulty(h), skills = snapshot?.skills ?? h.skills;
    const v = skillValues(id, skillLevel(h, id, s.mods), skills), magicArrow = projectile?.magicArrow ?? 0;
    const conviction = this.auraAt(enemy, 'conviction', s)?.secondary ?? 0;
    const raceAttack = isUndead(enemy) ? s.mods.attackUndead ?? 0 : enemy.definition?.race === 'demon' ? s.mods.attackDemons ?? 0 : 0;
    const targetDefense = s.mods.ignoreDefense && !enemy.boss ? 0 : Math.max(0,enemy.defense-this.classes.defenseReduction(enemy)) * Math.max(0, 1 - conviction / 100 - (s.mods.targetDefense ?? 0) / 100 / (enemy.boss ? 2 : 1));
    const chance = hitChance((s.baseAttackRating + raceAttack) * (1 + (s.attackRatingBonus + v.attack + (magicArrow ? 1 + magicArrow * 9 : 0)) / 100), targetDefense, level, enemy.level);
    if (!['smite','guidedArrow'].includes(id) && Math.random() * 100 >= chance) { g.ui.floatText('未命中', enemy.actor.group.position.clone().setY(1.8), 'miss'); return false; }
    const smite = id === 'smite', weaponDamage = projectile ? s.rangedMin + Math.random() * (s.rangedMax - s.rangedMin) + magicArrow + (id === 'magicArrow' ? v.damage : 0) : s.weaponMin + Math.random() * (s.weaponMax - s.weaponMin);
    let physical = smite ? (s.smiteMin + Math.random() * (s.smiteMax - s.smiteMin)) * (1 + (s.smiteDamageBonus + v.damage) / 100) : weaponDamage * (1 + (s.damageBonus + (id==='magicArrow'?0:v.damage)) / 100);
    if (!smite) physical += weaponDamage * (isUndead(enemy) ? s.mods.damageUndead ?? 0 : enemy.definition?.race === 'demon' ? s.mods.damageDemons ?? 0 : 0) / 100;
    if(id==='multipleShot') physical *= .75;
    const critical = !smite && id !== 'sacrifice' && (s.criticalStrike>0&&Math.random()*100<s.criticalStrike || Math.random() * 100 < (s.mods.deadlyStrike ?? 0)); if (critical) physical *= 2;
    if (Math.random() * 100 < (s.mods.crushingBlow ?? 0)) this.damage(enemy, resistedDamage(enemy.hp / playerLifeFactor(enemy.playerCount) * (enemy.boss ? .125 : .25) * (projectile ? .5 : 1), Math.max(0, this.physicalResistance(enemy))), 'physical', true, false, snapshot);
    const classConversion = ['magicArrow','fireArrow','coldArrow','lightningBolt'].includes(id);
    const conversion = Math.min(100, classConversion ? v.percent : magicArrow) / 100;
    const dealt = this.damage(enemy, physical * (1 - conversion), 'physical', false, critical, snapshot);
    if (conversion) this.damage(enemy, physical * conversion, classConversion && id !== 'magicArrow' ? v.type : 'magic', false, critical, snapshot);
    const resources = snapshot ? stats(h) : s;
    if (this.itemCurses.get(enemy)?.kind === 'lifeTap') h.hp = Math.min(resources.maxHp, h.hp + dealt * .5);
    if (!smite) {
      const drain = leechEffectiveness(enemy, diff);
      h.hp = Math.min(resources.maxHp, h.hp + dealt * (s.mods.lifeSteal ?? 0) / 100 * drain); h.mana = Math.min(resources.maxMana, h.mana + dealt * (s.mods.manaSteal ?? 0) / 100 * drain);
      for (const type of ['fire', 'cold', 'lightning', 'poison'] as const) {
        if (type === 'fire' && projectile?.explosion) continue;
        let amount = type === 'poison' ? s.mods.poisonDamage ?? 0 : elementalDamage(s.mods, type);
        if (id === 'vengeance' && type !== 'poison') amount += Math.max(0, weaponDamage - (s.mods.damageFlat ?? 0)) * (v.percent + 10 * h.skills[({ fire: 'resistFire', cold: 'resistCold', lightning: 'resistLightning' } as const)[type]]) / 100;
        for (const aura of s.auras) if (aura.type === type && ['holyFire', 'holyFreeze', 'holyShock'].includes(aura.id)) amount += (aura.min + Math.random() * (aura.max - aura.min)) * aura.secondary * (1 + (projectile || type === 'poison' ? 0 : s.mods[`${type}SkillDamage`] ?? 0) / 100);
        if(id==='multipleShot')amount*=.75;
        if (amount > 0 && !enemy.dead) {
          const elementalDealt = this.damage(enemy, amount, type, false, false, snapshot);
          if (type === 'cold' && elementalDealt > 0) enemy.coldTime = Math.max(enemy.coldTime, (s.mods.coldDuration ?? (v.duration || 2)) / [1, 2, 4][diff]);
        }
      }
      if ((s.mods.magicMinDamage ?? 0) + (s.mods.magicMaxDamage ?? 0) > 0 && !enemy.dead) this.damage(enemy, (s.mods.magicMinDamage ?? 0) + Math.random() * ((s.mods.magicMaxDamage ?? 0) - (s.mods.magicMinDamage ?? 0)), 'magic', false, false, snapshot);
      const poison = poisonDamage(s.mods);
      if (poison.seconds > 0 && !enemy.dead) {
        const dps = itemDamage((poison.min + Math.random() * (poison.max - poison.min)) / poison.seconds, 'poison', s.mods, enemy.resistances.poison);
        if (dps > 0 && (!enemy.poison || dps >= enemy.poison.dps)) enemy.poison = { dps, remaining: poison.seconds };
      }
    }
    if (Math.random() * 100 < (s.mods.openWounds ?? 0)) { enemy.bleed = 8; enemy.bleedSnapshot = snapshot; }
    if (s.mods.preventHeal) enemy.preventHeal = true;
    if (!enemy.dead) this.triggerItems('hit-skill', enemy, snapshot?.items);
    if (s.mods.slowTarget) enemy.slow = { percent: Math.max(enemy.slow?.percent ?? 0, Math.min(enemy.boss ? 50 : 90, s.mods.slowTarget)), remaining: 30 };
    if (!smite && s.mods.targetDefenseFlat) enemy.defense = Math.max(0, enemy.defense - Math.abs(s.mods.targetDefenseFlat));
    if (!enemy.boss && !enemy.dead) {
      if (s.mods.freezeTarget && enemy.resistances.cold < 100) enemy.stunned = Math.max(enemy.stunned, s.mods.freezeTarget / [1, 2, 3][diff]);
      if (s.mods.blindTarget) enemy.blind = Math.max(enemy.blind ?? 0, s.mods.blindTarget);
      if (Math.random() * 100 < (s.mods.flee ?? 0)) enemy.flee = 2;
    }
    if (smite && !enemy.boss) { enemy.stunned = v.duration; this.knockback(enemy, 1.1); }
    if (id === 'charge') this.knockback(enemy, 1.5);
    if (s.mods.knockback) this.knockback(enemy, .7, snapshot?.origin);
    if (id === 'conversion' && !enemy.dead && !enemy.boss && Math.random() * 100 < v.percent) { enemy.converted = v.duration; enemy.path = []; g.target = undefined; g.ui.floatText('转化', enemy.actor.group.position.clone().setY(2), 'gold'); }
    if (!projectile && h.equipment.weapon?.durability && !itemMods(h.equipment.weapon).indestructible && Math.random() < .04) h.equipment.weapon.durability--;
    if (id === 'sacrifice') this.hurt(physical * PALADIN_BALANCE.sacrificeRecoil, 'physical', undefined, true);
    return true;
  }
  knockback(enemy: Enemy, distance: number, origin = this.game.position) {
    if (enemy.boss || enemy.dead) return;
    const p = enemy.actor.group.position, next = p.clone().addScaledVector(p.clone().sub(origin).normalize(), distance);
    if (gridWalkable(this.game.world.grid, next)) { enemy.body.position.set(next.x, .5, next.z); p.copy(next); }
  }
  explode(projectile: Projectile, point: THREE.Vector3) {
    const g = this.game, s = projectile.snapshot.stats, rank = projectile.explosion;
    const min = tierValue(rank, 2, [5, 7, 9, 11, 13]), max = tierValue(rank, 6, [5, 8, 11, 14, 17]);
    let amount = min + Math.random() * (max - min) + elementalDamage(s.mods, 'fire');
    for (const aura of s.auras) if (aura.id === 'holyFire') amount += (aura.min + Math.random() * (aura.max - aura.min)) * aura.secondary;
    const ring = makeRing(1, 0xff9954, .7); ring.position.copy(point).setY(.2); g.world.scene.add(ring);
    g.effects.push({ mesh: ring, life: .18, duration: .18, type: 'ring' });
    for (const enemy of g.enemies) if (this.hostile(enemy) && enemy.actor.group.position.distanceTo(point) <= 2.5 && clearShot(g.world.grid, point, enemy.actor.group.position)) this.damage(enemy, amount, 'fire', false, false, projectile.snapshot);
  }
  updateProjectile(projectile: Projectile, dt: number) {
    updateVisual(projectile.mesh,projectile.age);
    if(projectile.kind==='bolt')projectile.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),projectile.direction);
    const g = this.game, remaining = Math.min(dt, Math.max(0, projectile.life - projectile.age));
    const steps = Math.max(1, Math.ceil(remaining / .01)), step = remaining / steps;
    for (let i = 0; i < steps; i++) {
      const previous = projectile.mesh.position.clone(); projectile.age += step;
      if (projectile.kind === 'hammer') {
        const radius = .7 + projectile.age * 2.5, angle = projectile.age * 7 + projectile.phase;
        projectile.mesh.position.set(projectile.origin.x + Math.cos(angle) * radius, .9, projectile.origin.z + Math.sin(angle) * radius); projectile.mesh.rotation.z += step * 15;
      } else projectile.mesh.position.addScaledVector(projectile.direction, step * projectile.speed);
      const next = projectile.mesh.position;
      if (!clearShot(g.world.grid, previous, next)) { if (projectile.explosion) this.explode(projectile, previous.clone().setY(0)); return false; }
      const segment = new THREE.Line3(previous, next);
      const hits = g.enemies.filter(enemy => {
        if (enemy.dead || projectile.hit.has(enemy.id)) return false;
        const center = enemy.actor.group.position.clone().setY(.9);
        return segment.closestPointToPoint(center, true, new THREE.Vector3()).distanceTo(center) <= (enemy.boss ? 1 : .65)
          && clearShot(g.world.grid, previous, enemy.actor.group.position);
      }).sort((a, b) => a.actor.group.position.distanceToSquared(previous) - b.actor.group.position.distanceToSquared(previous));
      for (const enemy of hits) {
        if (projectile.kind === 'bolt' && projectile.healing > 0 && enemy.converted > 0) { enemy.hp = Math.min(enemy.maxHp, enemy.hp + projectile.healing); projectile.hit.add(enemy.id); continue; }
        if (!this.hostile(enemy) || projectile.kind === 'bolt' && !isUndead(enemy) && (enemy.definition?.race ?? enemy.kind) !== 'demon') continue;
        projectile.hit.add(enemy.id);
        if (projectile.kind === 'arrow' || projectile.kind === 'throw') {
          const point = enemy.actor.group.position.clone(), hit = this.weaponHit(enemy, 'attack', projectile);
          if (projectile.explosion) this.explode(projectile, point);
          if ((hit || projectile.explosion) && Math.random() * 100 >= projectile.pierce) return false;
        } else {
          this.damage(enemy, projectile.damage, 'magic', projectile.kind === 'bolt', false, projectile.snapshot);
          // Holy bolts pierce; the hit set prevents repeat damage to a body.
        }
      }
    }
    return projectile.age < projectile.life;
  }
  damage(enemy: Enemy, amount: number, type: DamageType, ignoreResist = false, critical = false, snapshot?: AttackSnapshot) {
    const g = this.game; if (!this.hostile(enemy)) return 0;
    const s = snapshot?.stats ?? stats(g.hero), conviction = ['fire', 'cold', 'lightning'].includes(type) ? this.auraAt(enemy, 'conviction', s, snapshot?.origin)?.percent ?? 0 : 0;
    const sanctuary = type === 'physical' && isUndead(enemy) && this.auraAt(enemy, 'sanctuary', s);
    const dealt = Math.max(0, Math.floor(itemDamage(amount, type, s.mods, ignoreResist || sanctuary ? 0 : type === 'physical' ? this.physicalResistance(enemy) : enemy.resistances[type], conviction)));
    enemy.hp -= dealt; enemy.active = true;
    g.ui.floatText(dealt ? String(dealt) : '免疫', enemy.actor.group.position.clone().setY(1.8), critical ? 'critical' : type === 'physical' ? 'damage' : 'magic-damage');
    if (dealt) g.audio.play(impactSound(type, enemy.definition?.model), { position: enemy.actor.group.position, gain: critical ? 1 : .85 });
    if (dealt) g.burst(enemy.actor.group.position.clone().setY(.8), type === 'fire' ? 0xf09669 : type === 'cold' ? 0x80cfea : 0xe8d79c, 3);
    if (enemy.hp <= 0) g.killEnemy(enemy, snapshot?.stats.mods, snapshot?.mercenary); else if (dealt) g.monsterCombat?.onHit(enemy); return dealt;
  }
  hurt(amount: number, type: DamageType = 'physical', source?: Enemy, self = false, missile = false) {
    const g = this.game, h = g.hero, s = stats(h); if (g.inCamp || g.dead || !self && g.invincible > 0) return;
    const evasion=this.moving?s.evade:missile?s.avoid:s.dodge;
    if(!self&&source&&evasion>0&&Math.random()*100<evasion){g.ui.floatText('回避',g.position.clone().setY(1.8),'miss');return;}
    if (!self && source && type === 'physical') { const curse = this.itemCurses.get(source)?.kind; amount *= curse === 'decrepify' ? .5 : curse === 'weaken' ? .67 : 1; }
    if (!self && source && type === 'physical') {
      if (!this.running && Math.random() * 100 >= hitChance(source.attackRating, s.defense + (s.mods[missile ? 'defenseMissile' : 'defenseMelee'] ?? 0), source.level, h.level)) { g.ui.floatText('闪避', g.position.clone().setY(1.8), 'miss'); return; }
      if (Math.random() * 100 < s.block / (this.running ? 3 : 1)) { this.recover(s.blockFrames / 25); g.ui.floatText('格挡', g.position.clone().setY(1.8), 'gold'); g.audio.play('block'); return; }
    }
    const shield=h.buffs?.energyShield;
    if(!self&&type!=='poison'&&shield?.remaining){const v=skillValues('energyShield',shield.rank,h.skills),absorbed=Math.min(amount*v.percent/100,h.mana/v.secondary);h.mana-=absorbed*v.secondary;amount-=absorbed;if(h.mana<=0)delete h.buffs.energyShield;}
    let damage = self ? amount : type === 'physical' ? Math.max(0, amount - (s.mods.damageReductionFlat ?? 0)) * (1 - Math.min(50, s.mods.damageReduction ?? 0) / 100) * (h.curse > 0 ? 2 : 1) : resistedDamage(Math.max(0, amount - (s.mods.magicReduction ?? 0)), type === 'magic' ? 0 : s.resistances[type]);
    if (!self) { const absorbed = absorbDamage(damage, type, s.mods); h.hp = Math.min(s.maxHp, h.hp + absorbed.healing); damage = absorbed.damage; }
    if (!self && type === 'cold' && !s.mods.cannotBeFrozen) h.cold = s.mods.halfFreeze ? 2 : 4;
    damage = Math.max(0, damage); h.hp = Math.max(0, h.hp - damage);
    if (!self) {
      g.invincible = PALADIN_BALANCE.hitGraceSeconds;
      if (type === 'physical') h.mana = Math.min(s.maxMana, h.mana + damage * (s.mods.damageToMana ?? 0) / 100);
      if (damage >= s.maxHp / 12 && !this.zeal && !(s.auras.some(aura => aura.id === 'concentration') && Math.random() < .2)) this.recover(s.recoveryFrames / 25);
      if (type === 'poison') h.poison = Math.max(h.poison, 6);
      const armor = h.equipment.armor ?? h.equipment.shield; if (armor?.durability && !itemMods(armor).indestructible && Math.random() < .1) armor.durability--;
    }
    g.ui.floatText(`-${Math.ceil(damage)}`, g.position.clone().setY(1.8), 'hurt'); g.ui.flashDamage(); if (damage > 0) g.audio.play('hurt', { nativeKey: `hurt:${h.classId}` });
    if (!self && source && h.hp > 0) this.triggerItems('gethit-skill', source);
    if (!self && source && !source.dead && h.hp > 0) {
      const id = missile ? 'chillingArmor' : h.buffs?.shiverArmor ? 'shiverArmor' : 'frozenArmor', buff = h.buffs?.[id];
      if (buff?.remaining) {
        const v = skillValues(id, buff.rank, h.skills);
        if (id === 'frozenArmor') {
          if (source.resistances.cold < 100) { if (!source.boss) source.stunned = Math.max(source.stunned, Math.min(3, 1.2 + .12 * (buff.rank - 1))); source.coldTime = Math.max(source.coldTime, 2); }
        } else if (missile) this.classes.missile(id, g.position, source.actor.group.position.clone().sub(g.position).normalize(), v, this.snapshot(), source);
        else this.classes.hit(source, id, v, this.snapshot());
      }
    }
    if (!self && !missile && source && type === 'physical') { const thorns = s.auras.find(aura => aura.id === 'thorns'); if (thorns) this.damage(source, damage * thorns.percent / 100 + thorns.secondary, 'physical'); }
    if (!self && !missile && source && type === 'physical' && s.mods.reflectDamage) this.damage(source, s.mods.reflectDamage, 'physical');
    if (!self && !missile && source && type === 'physical' && s.mods.lightningReflect) this.damage(source, s.mods.lightningReflect, 'lightning');
    if (h.hp <= 0) { g.audio.play('death', { nativeKey: `death:${h.classId}` }); createCorpse(h, g.position.x, g.position.z); h.buffs={}; g.dead = true; g.releaseInput(); this.zeal = null; this.classes.clear(); g.actor.group.rotation.z = Math.PI / 2; g.ui.openPanel('death'); g.save(false); }
  }
  update(dt: number) {
    const g = this.game, h = g.hero, s = stats(h);
    this.ammoWarning = Math.max(0, this.ammoWarning - dt);
    const light = g.actor.group.getObjectByName('hero-light');
    if (light instanceof THREE.PointLight) light.distance = 7 * (13 + Math.max(-12, Math.min(5, s.mods.lightRadius ?? 0))) / 13;
    for (const item of Object.values(h.equipment)) if (item?.maxDurability && item.durability !== undefined && itemMods(item).repairDurability) {
      const progress = (this.repairTime.get(item) ?? 0) + dt * itemMods(item).repairDurability!;
      item.durability = Math.min(item.maxDurability, item.durability + Math.floor(progress)); this.repairTime.set(item, progress % 1);
    }
    this.lock = Math.max(0, this.lock - dt); this.fohDelay = Math.max(0, this.fohDelay - dt); h.holyShield = Math.max(0, h.holyShield - dt);
    this.stagger = Math.max(0, this.stagger - dt); this.movementRecovery = Math.max(0, this.movementRecovery - dt);
    for (const id of Object.keys(this.actionCooldowns) as ActionId[]) {
      const remaining = this.actionCooldowns[id]! - dt;
      if (remaining <= 1e-6) delete this.actionCooldowns[id]; else this.actionCooldowns[id] = remaining;
    }
    this.classes.update(dt);
    updateHeroWards(g.actor.group,h.buffs??{},g.time);
    if (!h.holyShield) h.holyShieldLevel = 0;
    const weaponModel = g.actor.group.getObjectByName('hero-weapon'), shieldModel = g.actor.group.getObjectByName('hero-shield');
    const staffModel=g.actor.group.getObjectByName('hero-staff'), staff=!!s.weapon&&['staff','orb'].includes(weaponType(s.weapon)??'');
    if(staffModel)staffModel.visible=staff;
    if (weaponModel) {
      weaponModel.visible = !!s.weapon && !s.ranged&&!staff; weaponModel.scale.z = h.equipment.weapon?.twoHanded ? 1.3 : 1;
      const kind=s.weapon?weaponType(s.weapon):undefined,form=kind==='axe'?'axe':['spear','polearm'].includes(kind??'')?'spear':['mace','hammer','scepter'].includes(kind??'')?'mace':'sword';
      for(const child of weaponModel.children)child.visible=child.name===`melee-${form}`;
    }
    g.actor.group.userData.rangedKind = s.ranged?.kind;
    g.actor.group.userData.staff = staff;
    for (const kind of ['bow','crossbow','javelin','knife','axe']) {const model=g.actor.group.getObjectByName(`hero-${kind}`);if(model)model.visible=kind===s.ranged?.kind;}
    if (shieldModel) shieldModel.visible = s.hasShield;
    for (const slot of Object.keys(g.cooldowns) as Skill[]) g.cooldowns[slot] = this.cooldown(h.bindings[slot]);
    h.mana = Math.min(s.maxMana, h.mana + s.manaRegen * dt); h.hp = Math.min(s.maxHp, h.hp + s.lifeRegen * dt);
    const cleanse = 1 / (1 - (s.auras.find(aura => aura.id === 'cleansing')?.percent ?? 0) / 100);
    h.poison = Math.max(0, h.poison - dt * cleanse / (1 - Math.min(75, s.mods.poisonLength ?? 0) / 100)); h.curse = Math.max(0, h.curse - dt * cleanse); h.cold = Math.max(0, h.cold - dt);
    if (h.poison > 0) h.hp = Math.max(1, h.hp - dt * resistedDamage(2 + difficulty(h) * 2, s.resistances.poison));
    for (const index of [0, 1] as const) if (this.regen[index] > 0) { const restored = Math.min(this.regen[index], (index ? 15 : 30) * dt); this.regen[index] -= restored; const key = index ? 'mana' : 'hp'; h[key] = Math.min(index ? s.maxMana : s.maxHp, h[key] + restored); }
    if (this.moving && h.running && h.stamina > 0) h.stamina = Math.max(0, h.stamina - dt * 6 * Math.max(0, 1 - (s.mods.staminaDrain ?? 0) / 100)); else h.stamina = Math.min(s.maxStamina, h.stamina + dt * (this.moving ? 4 : 16) * (1 + ((s.mods.staminaRegen ?? 0) + (s.aura.id === 'vigor' ? s.aura.secondary : 0)) / 100));
    this.auraRing.visible = !!s.auras.length; this.auraRing.position.copy(g.position).setY(.08); this.auraRing.rotation.z = g.time * .4;
    this.auraRing.material.color.setHex(s.aura.type === 'fire' ? 0xe59b52 : s.aura.type === 'cold' ? 0x80cfed : s.aura.id === 'conviction' ? 0x81bd79 : s.aura.id === 'prayer' || s.aura.id === 'meditation' ? 0x7bd3bf : 0xe5d38b);
    this.shieldRing.visible = h.holyShield > 0 && s.hasShield; this.shieldRing.position.copy(g.position).setY(1); this.shieldRing.rotation.x = 0;
    this.corpseRing.visible = !!h.corpse; if (h.corpse) this.corpseRing.position.set(h.corpse.x, .1, h.corpse.z);
    this.auraTimer += dt;
    if (this.auraTimer >= 2) { this.auraTimer -= 2; this.pulse(); }
    if (this.zeal) {
      this.zeal.timer -= dt;
      if (this.zeal.timer <= 0) {
        if (this.zeal.aimed) {
          const direction = g.aim.clone().sub(g.position).setY(0);
          if (direction.lengthSq() > .15 ** 2) this.zeal.direction.copy(direction).normalize();
        } else { const target = g.nearestEnemy(2.6); if (target) this.zeal.direction.copy(target.actor.group.position).sub(g.position).normalize(); }
        g.actor.group.rotation.y = Math.atan2(this.zeal.direction.x, this.zeal.direction.z);
        this.melee('zeal', this.zeal.direction, this.zeal.aimed);
        if (this.zeal && --this.zeal.hits <= 0) this.zeal = null; else if (this.zeal) this.zeal.timer += s.zealFrames / 25;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      if (!this.updateProjectile(projectile, dt)) { g.disposeObject(projectile.mesh); this.projectiles.splice(i, 1); }
    }
    for (const enemy of g.enemies) {
      enemy.stunned = Math.max(0, enemy.stunned - dt); enemy.coldTime = Math.max(0, enemy.coldTime - dt); enemy.converted = Math.max(0, enemy.converted - dt);
      if (enemy.slow) { enemy.slow.remaining -= dt; if (enemy.slow.remaining <= 0) delete enemy.slow; }
      const curse = this.itemCurses.get(enemy); if (curse) { curse.remaining -= dt; if (curse.remaining <= 0) this.itemCurses.delete(enemy); }
      if (enemy.bleed > 0 && !enemy.dead) { enemy.hp -= Math.min(dt, enemy.bleed) * openWoundsDps(enemy.bleedSnapshot?.level ?? h.level, enemy.boss); enemy.bleed = Math.max(0, enemy.bleed - dt); if (enemy.hp <= 0) g.killEnemy(enemy, enemy.bleedSnapshot?.stats.mods, enemy.bleedSnapshot?.mercenary); }
      if (enemy.poison && !enemy.dead) {
        const snapshot = enemy.poison.snapshot;
        enemy.hp -= enemy.poison.dps * Math.min(dt, enemy.poison.remaining);
        enemy.poison.remaining -= dt;
        if (enemy.poison.remaining <= 0) delete enemy.poison;
        if (enemy.hp <= 0) g.killEnemy(enemy, snapshot?.stats.mods, snapshot?.mercenary);
      }
    }
    clampResources(h);
  }
  pulse() {
    const g = this.game, h = g.hero, s = stats(h);
    for (const aura of s.auras) {
    if (aura.id === 'prayer' || aura.id === 'cleansing' || aura.id === 'meditation') {
      const prayer = aura.id === 'prayer' ? aura : skillValues('prayer', skillLevel(h, 'prayer'), h.skills);
      if (aura.mercenary || aura.id !== 'prayer' || h.mana >= aura.cost) {
        if (aura.id === 'prayer' && !aura.mercenary) h.mana -= aura.cost;
        h.hp = Math.min(s.maxHp, h.hp + prayer.healing);
        for (const ally of g.enemies) if (ally.converted > 0 && this.auraAt(ally, aura.id, s)) ally.hp = Math.min(ally.maxHp, ally.hp + prayer.healing);
      }
    }
    if (aura.id === 'redemption') for (const enemy of g.enemies) if (enemy.dead && !enemy.redeemed && this.auraAt(enemy, aura.id, s) && Math.random() * 100 < aura.percent) {
      enemy.redeemed = true; enemy.actor.group.visible = false; h.hp = Math.min(s.maxHp, h.hp + aura.healing); h.mana = Math.min(s.maxMana, h.mana + aura.healing); g.burst(enemy.actor.group.position.clone().setY(.5), 0xeee1a2, 6);
    }
    if (['holyFire', 'holyFreeze', 'holyShock', 'sanctuary'].includes(aura.id)) for (const enemy of g.enemies) if (this.hostile(enemy) && this.auraAt(enemy, aura.id, s) && (aura.id !== 'sanctuary' || isUndead(enemy))) {
      this.damage(enemy, aura.min + Math.random() * (aura.max - aura.min), aura.type); if (aura.id === 'sanctuary') this.knockback(enemy, 1);
    }
    }
  }
  slow(enemy: Enemy) {
    // Movement needs only aura ranks/range, not a full character stat rebuild for
    // every monster. Read equipment live so breakage and weapon swaps apply now.
    const aura = equippedAuras(this.game.hero).find(aura => aura.id === 'holyFreeze' && enemy.actor.group.position.distanceTo(this.game.position) <= aura.radius), merc = this.game.mercenary?.auraAt(enemy, 'holyFreeze');
    return Math.max(.2, 1 - Math.max((aura?.percent ?? 0) / 100, (merc?.percent ?? 0) / 100 * (enemy.boss ? .5 : 1), enemy.coldTime > 0 ? .5 : 0) - (enemy.slow?.percent ?? 0) / 100 - (this.itemCurses.get(enemy)?.kind === 'decrepify' ? .5 : 0));
  }
  allyUpdate(enemy: Enemy, dt: number) {
    if (enemy.converted <= 0) return false;
    const g = this.game, target = g.enemies.filter(other => this.hostile(other)).sort((a, b) => a.actor.group.position.distanceToSquared(enemy.actor.group.position) - b.actor.group.position.distanceToSquared(enemy.actor.group.position))[0];
    if (target) {
      const p = enemy.actor.group.position, delta = target.actor.group.position.clone().sub(p), distance = delta.length(); enemy.actor.group.rotation.y = Math.atan2(delta.x, delta.z);
      if (distance > 1.7) { enemy.rethink -= dt; if (enemy.rethink <= 0) { enemy.path = g.world.path(p, target.actor.group.position); enemy.rethink = .5; } const point = enemy.path[0]; if (point) { const dir = point.clone().sub(p); if (dir.length() < .3) enemy.path.shift(); else { dir.normalize(); enemy.body.velocity.set(dir.x * enemy.speed, 0, dir.z * enemy.speed); } } }
      else if (enemy.cooldown <= 0) { enemy.cooldown = 1.2; enemy.attackTime = 1; const aura = stats(g.hero).aura; this.damage(target, enemy.damage * (1 + (this.inAura(enemy) ? aura.damage / 100 : 0)), 'physical'); }
    }
    return true;
  }
}
