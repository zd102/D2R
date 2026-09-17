import { updateItemForm } from './item-form.ts';
import { curseDuration } from './item-special-effects.ts';
import type { AttackSpec } from './monster-combat.ts';
import { hasMonsterAffix } from './monster-affixes.ts';
import * as THREE from 'three';
import type { Game, Enemy } from './game.ts';
import type { AttackSnapshot } from './combat.ts';
import { createActor, animateActor, makeRing, type Actor } from './world.ts';
import { playHeroAction } from './hero-models.ts';
import { clearShot } from './ranged.ts';
import { followPath } from './navigation.ts';
import { hitChance, resistedDamage } from './model.ts';
import { emptySkills, skillValues, type DamageType, type SkillId } from './paladin.ts';
import { activeMercenaryEquipment, MERCENARY_JAB, mercenaryAuras, mercenaryStats, setMercenaryDistance, updateMercenaryPotion } from './mercenary.ts';
import { elementalDamage, poisonDamage } from './affixes.ts';
import { absorbDamage, itemDamage } from './item-effects.ts';
import { isUndead, leechEffectiveness } from './bestiary.ts';
import { playerLifeFactor } from './player-count.ts';

export type MercenaryAlly = { id: 'mercenary'; actor: Actor; hp: number };
export const MERCENARY_PURSUIT = { speed: 8, catchUpSpeed: 16, searchRadius: 8, leash: 10, regroupDistance: 36, scanInterval: .12, repathInterval: .18, retryDelay: .8, reach: 2.1 } as const;
export class MercenaryCombat {
  readonly game: Game;
  ally?: MercenaryAlly;
  ring?: ReturnType<typeof makeRing>;
  path: THREE.Vector3[] = [];
  rethink = 0;
  timer = 0;
  pulseTimer = 0;
  swing = 0;
  strikes = 0;
  attacks = 0;
  lastLevel = 0;
  target?: Enemy;
  scanTimer = 0;
  navigationTime = 0;
  unreachable = new WeakMap<Enemy, number>();
  knockbackReady = new WeakMap<Enemy, number>();
  constructor(game: Game) { this.game = game; }
  get position() { return this.ally?.actor.group.position; }
  clear() {
    if (this.ally) this.game.disposeObject(this.ally.actor.group);
    if (this.ring) this.game.disposeObject(this.ring);
    this.ally = undefined; this.ring = undefined; this.path = []; this.strikes = 0; this.timer = this.pulseTimer = 0;
    this.target = undefined; this.scanTimer = this.rethink = this.navigationTime = 0; this.unreachable = new WeakMap();
    this.knockbackReady = new WeakMap();
    setMercenaryDistance(this.game.hero, Infinity);
  }
  sync() {
    const g = this.game, merc = g.hero.mercenary;
    if (!merc || merc.status !== 'alive' || merc.hp <= 0) { if (this.ally) this.clear(); return; }
    if (!this.ally) {
      const actor = createActor('hero', 'paladin'); actor.group.name = 'mercenary-mishan';
      for (const name of ['hero-weapon', 'hero-shield', 'hero-staff', 'hero-javelin', 'hero-bow', 'hero-crossbow']) { const object = actor.group.getObjectByName(name); if (object) object.visible = false; }
      const spear = new THREE.Group(); spear.name = 'mercenary-spear';
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0x735839 }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(.14, .5, 4), new THREE.MeshStandardMaterial({ color: 0xb9ccd0, metalness: .7, roughness: .3 })); tip.position.y = 1.5;
      spear.add(shaft, tip); spear.position.set(.15, -.5, .2); spear.rotation.x = .3; actor.rightArm.add(spear);
      actor.group.position.copy(g.position); actor.group.rotation.y = g.actor.group.rotation.y;
      this.ally = { id: 'mercenary', actor, get hp() { return merc.hp; }, set hp(value: number) { merc.hp = value; } };
      this.ring = makeRing(.8, 0x8dd5ba, .6); g.world.scene.add(actor.group, this.ring);
      this.lastLevel = g.hero.level;
    }
    setMercenaryDistance(g.hero, this.position!.distanceTo(g.position));
  }
  snapshot(): AttackSnapshot {
    const g = this.game;
    return { stats: mercenaryStats(g.hero), level: g.hero.level, difficulty: g.hero.difficultyLevel, skills: emptySkills(), items: activeMercenaryEquipment(g.hero), origin: this.position!.clone(), mercenary: true };
  }
  auraAt(enemy: Enemy, id: SkillId) {
    if (!this.position) return undefined;
    return mercenaryAuras(this.game.hero).find(aura => aura.id === id && enemy.actor.group.position.distanceTo(this.position!) <= aura.radius);
  }
  canPursue(enemy?: Enemy): enemy is Enemy {
    const g = this.game;
    return !!enemy && !g.inCamp && g.combat.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) <= MERCENARY_PURSUIT.leash && enemy.actor.group.position.distanceTo(this.position!) <= MERCENARY_PURSUIT.searchRadius;
  }
  canStrike(enemy: Enemy) { return this.position!.distanceTo(enemy.actor.group.position) <= MERCENARY_PURSUIT.reach && clearShot(this.game.world.grid, this.position!, enemy.actor.group.position); }
  routeReaches(enemy: Enemy, path: THREE.Vector3[]) {
    const end = path.at(-1), destination = enemy.actor.group.position;
    return !!end && end.distanceTo(destination) <= MERCENARY_PURSUIT.reach && clearShot(this.game.world.grid, end, destination);
  }
  findTarget() {
    const g = this.game, point = this.position!;
    if (this.target && !this.canPursue(this.target)) { this.target = undefined; this.path = []; this.strikes = 0; this.scanTimer = 0; }
    if (g.inCamp || this.scanTimer > 0) return;
    this.scanTimer = MERCENARY_PURSUIT.scanInterval;
    const preferred = this.canPursue(g.target) ? g.target : undefined;
    // Keep a reachable opponent until it dies, unless the player calls a target.
    if (this.target && (!preferred || preferred === this.target)) return;
    const candidates = g.enemies.filter(enemy => this.canPursue(enemy) && (this.unreachable.get(enemy) ?? 0) <= this.navigationTime)
      .sort((a, b) => Number(b === preferred) - Number(a === preferred) || point.distanceToSquared(a.actor.group.position) - point.distanceToSquared(b.actor.group.position));
    for (const enemy of candidates.slice(0, 4)) {
      const direct = this.canStrike(enemy) || g.world.canWalk(point, enemy.actor.group.position), path = direct ? [] : g.world.path(point, enemy.actor.group.position);
      if (!direct && !this.routeReaches(enemy, path)) { this.unreachable.set(enemy, this.navigationTime + MERCENARY_PURSUIT.retryDelay); continue; }
      if (this.target !== enemy) this.strikes = 0;
      this.target = enemy; this.path = path; this.rethink = MERCENARY_PURSUIT.repathInterval; return;
    }
  }
  triggerItemBuff(id: 'fade'|'boneArmor'|'delirium'|'burstOfSpeed', rank: number) {
    const merc = this.game.hero.mercenary; if (!merc || merc.status !== 'alive') return;
    const value = skillValues(id, rank);
    if(id==='fade'&&merc.buffs)delete merc.buffs.burstOfSpeed;if(id==='burstOfSpeed'&&merc.buffs)delete merc.buffs.fade;
    (merc.buffs ??= {})[id] = { rank, remaining: value.duration, ...(id === 'boneArmor' ? { absorb: value.percent } : {}) };
    if (this.ally) updateItemForm(this.ally.actor, merc.buffs, this.game.time);
  }
  update(dt: number) {
    this.sync();
    const g = this.game, merc = g.hero.mercenary, ally = this.ally;
    if (!merc || !ally || g.dead) return;
    for (const [id,buff] of Object.entries(merc.buffs ?? {})) {
      if (id !== 'boneArmor') buff.remaining -= dt;
      if (buff.remaining <= 0) delete merc.buffs![id as SkillId];
    }
    updateItemForm(ally.actor, merc.buffs ?? {}, g.time);
    const s = mercenaryStats(g.hero), point = ally.actor.group.position;
    if (this.lastLevel !== g.hero.level) { merc.hp = s.maxHp; this.lastLevel = g.hero.level; }
    merc.hp = Math.min(s.maxHp, merc.hp + s.lifeRegen * dt);
    updateMercenaryPotion(g.hero, dt, s.maxHp);
    merc.cold = Math.max(0, merc.cold - dt);
    if (merc.poison > 0 && !g.inCamp) { merc.poison = Math.max(0, merc.poison - dt); this.hurt(s.maxHp * .006 * dt, 'poison'); if (merc.status === 'dead') return; }
    this.timer -= dt; this.swing = Math.max(0, this.swing - dt * 3); this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) { this.pulseTimer = 2; this.pulse(); }
    this.navigationTime += dt; this.scanTimer -= dt; this.rethink -= dt;
    if (point.distanceTo(g.position) > MERCENARY_PURSUIT.regroupDistance) { point.copy(g.position); this.target = undefined; this.path = []; this.rethink = this.scanTimer = 0; }
    this.findTarget();
    const target = this.target, destination = target ? target.actor.group.position : g.position, distance = point.distanceTo(destination);
    let moving = false;
    if (target ? !this.canStrike(target) : distance > 1.8) {
      this.strikes = 0;
      const direct = g.world.canWalk(point, destination), speed = (target || point.distanceTo(g.position) < 8 ? MERCENARY_PURSUIT.speed : MERCENARY_PURSUIT.catchUpSpeed) * s.runSpeed * (g.monsterCombat?.auraAt?.(point, 'holyFreeze') ? .6 : 1) * (g.monsterCombat?.imprisoned?.(point) ? 0 : 1);
      if (direct) {
        this.path = [destination.clone()];
      } else if (this.rethink <= 0 || !this.path.length) {
        this.path = g.world.path(point, destination); this.rethink = MERCENARY_PURSUIT.repathInterval;
        if (target && !this.routeReaches(target, this.path)) { this.unreachable.set(target, this.navigationTime + MERCENARY_PURSUIT.retryDelay); this.target = undefined; this.path = []; this.scanTimer = 0; }
      }
      const velocity = followPath(point, this.path, direct ? Math.min(speed, Math.max(0, distance - (target ? 2 : 1.8)) / Math.max(dt, 1 / 60)) : speed, dt, (from, to) => g.world.canWalk(from, to));
      const end = point.clone().add(new THREE.Vector3(velocity.x * dt, 0, velocity.z * dt));
      if (g.world.canWalk(point, end) && end.distanceToSquared(point) > 1e-8) { point.copy(end); moving = true; ally.actor.group.rotation.y = Math.atan2(velocity.x, velocity.z); }
      else if (this.path.length && (velocity.x || velocity.z)) { this.path = []; this.rethink = 0; }
    }
    if (target && this.target === target && this.canStrike(target) && this.timer <= 0) {
      const direction = destination.clone().sub(point); ally.actor.group.rotation.y = Math.atan2(direction.x, direction.z);
      if (!this.strikes) this.strikes = MERCENARY_JAB.hits;
      this.strike(target); this.strikes--; this.timer = this.strikes ? Math.max(.1, MERCENARY_JAB.chainDelay * s.attackFrames / 15) : Math.max(.45, MERCENARY_JAB.recovery * s.attackFrames / 15);
      this.swing = 1; this.attacks++; playHeroAction(ally.actor, 'thrust', g.time, .3);
    }
    animateActor(ally.actor, g.time, moving, this.swing);
    this.ring!.position.copy(point).setY(.09); this.ring!.material.color.setHex(merc.aura === 'holyFreeze' ? 0x7ed4ef : merc.aura === 'prayer' ? 0x89d5a4 : 0xdcc078);
    setMercenaryDistance(g.hero, point.distanceTo(g.position));
  }
  strike(enemy: Enemy) {
    const g = this.game, c = g.combat, merc = g.hero.mercenary!, snapshot = this.snapshot(), s = snapshot.stats, mods = s.mods;
    c.triggerItems('att-skill', enemy, snapshot.items, true);
    const jab = skillValues('jab', 1 + Math.floor(g.hero.level / 5) + (mods.allSkills ?? 0), emptySkills());
    const defense = mods.ignoreDefense && !enemy.boss ? 0 : Math.max(0, enemy.defense - c.classes.defenseReduction(enemy)) * Math.max(0, 1 - (mods.targetDefense ?? 0) / 100 / (enemy.boss ? 2 : 1) - (c.auraAt(enemy, 'conviction', s)?.secondary ?? 0) / 100);
    const raceAttack = isUndead(enemy) ? mods.attackUndead ?? 0 : enemy.definition?.race === 'demon' ? mods.attackDemons ?? 0 : 0;
    const attackRating = (s.baseAttackRating + raceAttack) * (1 + (s.attackRatingBonus + jab.attack) / 100);
    if (Math.random() * 100 >= hitChance(attackRating, defense, g.hero.level, enemy.level)) { g.ui.floatText('未命中', enemy.actor.group.position.clone().setY(1.8), 'miss'); return; }
    if (mods.reanimateReturned) c.specialItems.armReanimation(enemy, snapshot);
    if (Math.random() * 100 < (mods.crushingBlow ?? 0)) c.damage(enemy, resistedDamage(enemy.hp / playerLifeFactor(enemy.playerCount) * (enemy.boss ? .125 : .25), Math.max(0, c.physicalResistance(enemy))), 'physical', true, false, snapshot);
    const critical = s.criticalStrike > 0 && Math.random() * 100 < s.criticalStrike || Math.random() * 100 < (mods.deadlyStrike ?? 0);
    const racial = isUndead(enemy) ? mods.damageUndead ?? 0 : enemy.definition?.race === 'demon' ? mods.damageDemons ?? 0 : 0;
    const physical = (s.attackMin + Math.random() * (s.attackMax - s.attackMin)) * Math.max(.1, 1 + (jab.damage + racial) / 100) * (critical ? 2 : 1);
    const dealt = c.damage(enemy, physical, 'physical', false, critical, snapshot);
    merc.hp = Math.min(g.hero.level === snapshot.level ? s.maxHp : mercenaryStats(g.hero).maxHp, merc.hp + dealt * ((mods.lifeSteal ?? 0) / 100 * leechEffectiveness(enemy, snapshot.difficulty) + (c.itemCurses.get(enemy)?.kind === 'lifeTap' ? .5 : 0)));
    for (const type of ['fire', 'cold', 'lightning', 'poison'] as const) {
      const itemAmount = type === 'poison' ? mods.poisonDamage ?? 0 : elementalDamage(mods, type);
      let amount = itemAmount;
      for (const aura of s.auras) if (aura.type === type && ['holyFire', 'holyFreeze', 'holyShock'].includes(aura.id)) amount += (aura.min + Math.random() * (aura.max - aura.min)) * aura.secondary;
      if (amount > 0 && !enemy.dead) { const hit = c.damage(enemy, amount, type, false, false, snapshot); if (hit && type === 'cold' && itemAmount > 0) enemy.coldTime = Math.max(enemy.coldTime, (mods.coldDuration ?? 2) / [1, 2, 4][snapshot.difficulty]); }
    }
    const magic = (mods.magicMinDamage ?? 0) + Math.random() * ((mods.magicMaxDamage ?? 0) - (mods.magicMinDamage ?? 0));
    if (magic > 0) c.damage(enemy, magic, 'magic', false, false, snapshot);
    const poison = poisonDamage(mods);
    if (poison.seconds > 0 && !enemy.dead) { const dps = itemDamage((poison.min + poison.max) / 2 / poison.seconds, 'poison', mods, enemy.resistances.poison); if (dps > 0 && dps >= (enemy.poison?.dps ?? 0)) enemy.poison = { dps, remaining: poison.seconds, snapshot }; }
    if (Math.random() * 100 < (mods.openWounds ?? 0)) { enemy.bleed = 8; enemy.bleedSnapshot = snapshot; }
    if (mods.slowTarget) enemy.slow = { percent: Math.max(enemy.slow?.percent ?? 0, Math.min(enemy.boss ? 50 : 90, mods.slowTarget)), remaining: 30 };
    if (mods.targetDefenseFlat) enemy.defense = Math.max(0, enemy.defense - Math.abs(mods.targetDefenseFlat));
    if (!enemy.boss && !enemy.dead) {
      if (mods.freezeTarget && enemy.resistances.cold < 100) enemy.stunned = Math.max(enemy.stunned, mods.freezeTarget / [1, 2, 3][snapshot.difficulty]);
      if (mods.blindTarget) enemy.blind = Math.max(enemy.blind ?? 0, mods.blindTarget);
      if (Math.random() * 100 < (mods.flee ?? 0)) enemy.flee = 2;
    }
    // Jab's rapid hits must not repeatedly push the same target out of reach.
    if (mods.knockback && this.navigationTime >= (this.knockbackReady.get(enemy) ?? 0)
      && c.knockback(enemy, .8, this.position!)) this.knockbackReady.set(enemy, this.navigationTime + 2);
    if (!enemy.dead) c.triggerItems('hit-skill', enemy, snapshot.items, true);
  }
  hurt(amount: number, type: DamageType = 'physical', source?: Enemy, missile = false, spec?: AttackSpec) {
    const g = this.game, merc = g.hero.mercenary;
    if (!merc || merc.status !== 'alive' || !this.position || g.inCamp || g.dead || source?.converted) return;
    const s = mercenaryStats(g.hero);
    if (source && type === 'physical' && !spec?.ignoreDefense && Math.random() * 100 >= hitChance(g.monsterCombat?.accuracy?.(source) ?? source.attackRating, s.defense + (s.mods[missile ? 'defenseMissile' : 'defenseMelee'] ?? 0), source.level, g.hero.level)) return;
    const curse = source && g.combat.itemCurses.get(source)?.kind;
    if (type === 'physical') amount *= curse === 'decrepify' ? .5 : curse === 'weaken' ? .67 : 1;
    // Act bosses pressure an unsupported guard; ordinary packs keep his tank role.
    if (source?.boss && source.definition?.hpByDifficulty) amount *= 1.5;
    const parts = source ? g.monsterCombat?.damageParts?.(source, amount, type, spec) ?? [{ amount, type }] : [{ amount, type }];
    let damage = 0;
    for (const part of parts) {
      const bone = merc.buffs?.boneArmor;
      if (bone && part.type === 'physical') {
        const capacity = bone.absorb ?? skillValues('boneArmor',bone.rank).percent, absorbed = Math.min(part.amount,capacity);
        part.amount -= absorbed; bone.absorb = capacity - absorbed; if (bone.absorb <= 0) delete merc.buffs!.boneArmor;
      }
      const conviction = ['fire', 'cold', 'lightning'].includes(part.type) && g.monsterCombat?.auraAt?.(this.position, 'conviction') ? 35 : 0;
      const resisted = part.type === 'physical' ? Math.max(0, part.amount - (s.mods.damageReductionFlat ?? 0)) * (1 - Math.min(50, s.mods.damageReduction ?? 0) / 100) * ((g.monsterCombat?.mercenaryCurseUntil ?? 0) > g.time ? 2 : 1) : resistedDamage(Math.max(0, part.amount - (s.mods.magicReduction ?? 0)), part.type === 'magic' ? 0 : s.resistances[part.type] - conviction);
      const absorbed = absorbDamage(resisted, part.type, s.mods); merc.hp = Math.max(0, Math.min(s.maxHp, merc.hp + absorbed.healing) - absorbed.damage); damage += absorbed.damage;
      if (part.type === 'cold' && part.amount > 0 && !s.mods.cannotBeFrozen) merc.cold = s.mods.halfFreeze ? 2 : 4;
      if (part.type === 'poison' && part.amount > 0) merc.poison = Math.max(merc.poison, 6);
    }
    if (source && !spec?.triggered && hasMonsterAffix(source, 'cursed') && Math.random() < .75 && g.monsterCombat) g.monsterCombat.mercenaryCurseUntil = g.time + curseDuration({ buffs: merc.buffs ?? {} }, 5);
    if (source && merc.hp > 0) {
      g.combat.triggerItems('gethit-skill', source, activeMercenaryEquipment(g.hero), true);
      if (!missile && type === 'physical') { const thorns = s.auras.find(aura => aura.id === 'thorns'); const reflected = damage * (thorns?.percent ?? 0) / 100 + (thorns?.secondary ?? 0) + (s.mods.reflectDamage ?? 0) + (merc.buffs?.spiritOfBarbs?skillValues('spiritOfBarbs',merc.buffs.spiritOfBarbs.rank).percent:0) + (curse==='ironMaiden'?damage*skillValues('ironMaiden',g.combat.itemCurses.get(source)?.rank??1).percent/100:0); if (reflected > 0) g.combat.damage(source, reflected, 'physical', false, false, this.snapshot()); }
    }
    if (merc.hp <= 0) {
      merc.status = 'dead'; delete merc.buffs; merc.cold = merc.poison = merc.potionHealing = 0;
      g.burst(this.position.clone().setY(1), 0xb78363, 12); this.clear();
      g.ui.toast('米山已阵亡', '装备已保留，请回营地找佣兵商人重新雇佣'); g.save(false);
    }
  }
  pulse() {
    const g = this.game, merc = g.hero.mercenary!;
    const s = mercenaryStats(g.hero), prayer = s.auras.find(aura => aura.id === 'prayer');
    if (prayer) merc.hp = Math.min(s.maxHp, merc.hp + prayer.healing);
    for (const aura of mercenaryAuras(g.hero)) {
      if (!g.inCamp && ['holyFire', 'holyFreeze', 'holyShock', 'sanctuary'].includes(aura.id)) for (const enemy of g.enemies) if (g.combat.hostile(enemy) && this.auraAt(enemy, aura.id) && (aura.id !== 'sanctuary' || isUndead(enemy))) g.combat.damage(enemy, (aura.min + aura.max) / 2 * (aura.pulses ?? 1), aura.type, false, false, this.snapshot());
    }
  }
}
