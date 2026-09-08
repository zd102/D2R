import * as THREE from 'three';
import type { Game, Enemy, Skill } from './game';
import { stats, skillLevel, setAura, hitChance, resistedDamage, difficulty, createCorpse, clampResources } from './model.ts';
import { skillValues, isAura, PALADIN_BALANCE, type ActionId, type DamageType } from './paladin.ts';
import { makeRing } from './world.ts';
import { questComplete } from './campaign.ts';
import { isUndead, leechEffectiveness } from './bestiary.ts';
import { itemMods } from './items.ts';
import { elementalDamage, poisonDamage } from './affixes.ts';

type Projectile = { mesh: THREE.Mesh; origin: THREE.Vector3; direction: THREE.Vector3; phase: number; age: number; life: number; damage: number; healing: number; kind: 'hammer' | 'bolt'; hit: Set<number> };
export class PaladinCombat {
  game: Game;
  lock = 0;
  fohDelay = 0;
  auraTimer = 0;
  regen: [number, number] = [0, 0];
  zeal: { hits: number; timer: number; direction: THREE.Vector3 } | null = null;
  projectiles: Projectile[] = [];
  auraRing = makeRing(1.3, 0xd8c674, .65);
  shieldRing = makeRing(.7, 0xebdd9d, .8);
  corpseRing = makeRing(.8, 0xe4dac4, .9);
  moving = false;
  running = false;
  constructor(game: Game) { this.game = game; game.world.scene.add(this.auraRing, this.shieldRing, this.corpseRing); this.auraRing.visible = this.shieldRing.visible = this.corpseRing.visible = false; }
  hostile(enemy: Enemy) { return !enemy.dead && enemy.converted <= 0 && (!enemy.boss || questComplete(this.game.hero.campaign)); }
  inAura(enemy: Enemy) { return enemy.actor.group.position.distanceTo(this.game.position) <= stats(this.game.hero).aura.radius; }
  cast(slot: Skill, aimed = false) {
    const g = this.game, h = g.hero, id = h.bindings[slot];
    if (g.paused || g.dead) return; g.begin();
    if (slot !== 'attack' && id === 'attack') { g.ui.openPanel('skills'); return; }
    if (isAura(id)) { setAura(h, h.activeAura === id ? null : id as Exclude<ActionId, 'attack'>); this.auraTimer = 0; g.save(false); return; }
    this.castAction(id, aimed);
  }
  castAction(id: ActionId, aimed = false) {
    if (isAura(id)) return;
    const g = this.game, h = g.hero, s = stats(h), rank = skillLevel(h, id, s.mods), v = skillValues(id, rank, h.skills);
    if (this.lock > 0 || this.zeal || g.paused || g.dead || id !== 'attack' && !rank || id === 'fistOfHeavens' && this.fohDelay > 0) return;
    if ((id === 'smite' || id === 'holyShield') && !s.hasShield) { g.ui.toast('需要可用的盾牌'); return; }
    if (h.mana < v.cost) { g.ui.toast('法力不足'); return; }
    const origin = g.position.clone(), target = g.target && this.hostile(g.target) ? g.target : g.nearestEnemy(14);
    if (id === 'fistOfHeavens' && !target) { g.ui.toast('没有可攻击的目标'); return; }
    const direction = aimed ? g.aim.clone().sub(origin) : target ? target.actor.group.position.clone().sub(origin) : new THREE.Vector3(Math.sin(g.actor.group.rotation.y), 0, Math.cos(g.actor.group.rotation.y));
    direction.y = 0; direction.normalize(); if (!direction.lengthSq()) direction.set(0, 0, -1);
    const casting = ['holyBolt', 'blessedHammer', 'holyShield', 'fistOfHeavens'].includes(id);
    this.lock = (casting ? s.castFrames : s.attackFrames) / 25;
    h.mana -= v.cost; g.attackTime = 1; g.actor.group.rotation.y = Math.atan2(direction.x, direction.z);
    if (id === 'holyShield') { h.holyShield = v.duration; h.holyShieldLevel = rank; g.burst(origin.clone().setY(1), 0xffebaa, 24); g.audio.play('spell'); g.save(false); return; }
    if (id === 'holyBolt' || id === 'blessedHammer') {
      const hammer = id === 'blessedHammer';
      const mesh = new THREE.Mesh(hammer ? new THREE.BoxGeometry(.48, .22, .22) : new THREE.SphereGeometry(.15, 10, 8), new THREE.MeshBasicMaterial({ color: hammer ? 0xf5d88d : 0xdafff4, transparent: true }));
      if (hammer) { const handle = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .48, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c2 })); handle.position.y = -.25; mesh.add(handle); }
      mesh.position.copy(origin).setY(.9); g.world.scene.add(mesh);
      const concentration = hammer && s.aura.id === 'concentration' ? 1 + s.aura.damage / 200 : 1;
      // Align one point on the spiral with the aim at cast time, without homing afterward.
      const aimDistance = Math.max(1.2, Math.min(4.5, aimed ? g.aim.distanceTo(origin) : target ? target.actor.group.position.distanceTo(origin) : 2));
      const phase = Math.atan2(direction.z, direction.x) - (hammer ? 7 * (aimDistance - .7) / 2.5 : 0);
      this.projectiles.push({ mesh, origin, direction, phase, age: 0, life: hammer ? 2.3 : 1.25, damage: (v.min + Math.random() * (v.max - v.min)) * concentration, healing: v.healing, kind: hammer ? 'hammer' : 'bolt', hit: new Set() });
      g.audio.play('spell'); return;
    }
    if (id === 'fistOfHeavens' && target) {
      this.fohDelay = 1; const point = target.actor.group.position.clone(); g.beam(point.clone().setY(10), point.clone().setY(.5));
      this.damage(target, v.min + Math.random() * (v.max - v.min), 'lightning');
      for (const enemy of g.enemies) if (this.hostile(enemy) && isUndead(enemy) && enemy.actor.group.position.distanceTo(point) < 8) {
        g.beam(point.clone().setY(1), enemy.actor.group.position.clone().setY(.8)); this.damage(enemy, v.secondary, 'magic', true);
      }
      g.audio.play('spell'); return;
    }
    if (id === 'charge') {
      let last = origin.clone(); const distance = target ? Math.min(10, Math.max(0, target.actor.group.position.distanceTo(origin) - 1.2)) : 8;
      for (let step = .25; step <= distance; step += .25) { const next = origin.clone().addScaledVector(direction, step); if (!g.world.grid.isWalkableAt(Math.round(next.x) + 28, Math.round(next.z) + 28)) break; last = next; if (step % 1 === 0) g.burst(next.clone().setY(.4), 0xe5ce84, 2); }
      g.body.position.set(last.x, .5, last.z); g.position.copy(last); g.path = []; this.melee(id, direction); g.audio.play('swing'); return;
    }
    if (id === 'zeal') { this.zeal = { hits: v.hits, timer: 0, direction }; this.lock = (s.attackFrames + s.zealFrames * (v.hits - 1)) / 25; return; }
    this.melee(id, direction);
  }
  melee(id: ActionId, direction: THREE.Vector3) {
    const g = this.game, h = g.hero, s = stats(h), v = skillValues(id, skillLevel(h, id, s.mods), h.skills);
    const enemies = g.enemies.filter(enemy => this.hostile(enemy) && enemy.actor.group.position.distanceTo(g.position) <= 2.6 && enemy.actor.group.position.clone().sub(g.position).normalize().dot(direction) > -.3);
    const enemy = (g.target && enemies.includes(g.target) ? g.target : enemies.sort((a, b) => a.actor.group.position.distanceToSquared(g.position) - b.actor.group.position.distanceToSquared(g.position))[0]);
    const slash = makeRing(1.7, id === 'vengeance' ? 0x96daef : id === 'sacrifice' ? 0xe5948d : 0xe5d6ae, .85);
    slash.geometry.dispose(); slash.geometry = new THREE.RingGeometry(1.4, 1.8, 24, 1, -.8, 1.6); slash.rotation.z = -Math.atan2(direction.x, direction.z) + Math.PI / 2; slash.position.copy(g.position).setY(.25);
    g.world.scene.add(slash); g.effects.push({ mesh: slash, duration: .2, life: .2, type: 'slash' }); g.attackTime = 1; g.audio.play('swing');
    if (!enemy) return;
    const conviction = s.aura.id === 'conviction' && this.inAura(enemy) ? s.aura.secondary : 0;
    const raceAttack = isUndead(enemy) ? s.mods.attackUndead ?? 0 : enemy.definition?.race === 'demon' ? s.mods.attackDemons ?? 0 : 0;
    const targetDefense = s.mods.ignoreDefense && !enemy.boss ? 0 : enemy.defense * Math.max(0, 1 - conviction / 100 - (s.mods.targetDefense ?? 0) / 100 / (enemy.boss ? 2 : 1));
    const chance = hitChance((s.baseAttackRating + raceAttack) * (1 + (s.attackRatingBonus + v.attack) / 100), targetDefense, h.level, enemy.level);
    if (id !== 'smite' && Math.random() * 100 >= chance) { g.ui.floatText('未命中', enemy.actor.group.position.clone().setY(1.8), 'miss'); return; }
    const smite = id === 'smite', weaponDamage = s.weaponMin + Math.random() * (s.weaponMax - s.weaponMin);
    let physical = smite ? (s.smiteMin + Math.random() * (s.smiteMax - s.smiteMin)) * (1 + (s.damageBonus + v.damage) / 100) : weaponDamage * (1 + (s.damageBonus + v.damage) / 100);
    if (!smite) physical += weaponDamage * (isUndead(enemy) ? s.mods.damageUndead ?? 0 : enemy.definition?.race === 'demon' ? s.mods.damageDemons ?? 0 : 0) / 100;
    const critical = !smite && Math.random() * 100 < (s.mods.deadlyStrike ?? 0); if (critical) physical *= 2;
    if (Math.random() * 100 < (s.mods.crushingBlow ?? 0)) this.damage(enemy, enemy.hp * (enemy.boss ? .125 : .25), 'physical');
    const dealt = this.damage(enemy, physical, 'physical', false, critical);
    if (!smite) {
      const drain = leechEffectiveness(enemy, difficulty(h));
      h.hp = Math.min(s.maxHp, h.hp + dealt * (s.mods.lifeSteal ?? 0) / 100 * drain); h.mana = Math.min(s.maxMana, h.mana + dealt * (s.mods.manaSteal ?? 0) / 100 * drain);
      for (const type of ['fire', 'cold', 'lightning', 'poison'] as const) {
        let amount = type === 'poison' ? s.mods.poisonDamage ?? 0 : elementalDamage(s.mods, type);
        if (id === 'vengeance' && type !== 'poison') amount += weaponDamage * (v.percent + 10 * h.skills[({ fire: 'resistFire', cold: 'resistCold', lightning: 'resistLightning' } as const)[type]]) / 100;
        if (s.aura.type === type && s.aura.id && ['holyFire', 'holyFreeze', 'holyShock'].includes(s.aura.id)) amount += (s.aura.min + Math.random() * (s.aura.max - s.aura.min)) * s.aura.secondary;
        if (amount > 0 && !enemy.dead) {
          const elementalDealt = this.damage(enemy, amount, type);
          if (type === 'cold' && elementalDealt > 0) enemy.coldTime = Math.max(enemy.coldTime, (s.mods.coldDuration ?? (v.duration || 2)) / [1, 2, 4][difficulty(h)]);
        }
      }
      const poison = poisonDamage(s.mods);
      if (poison.seconds > 0 && !enemy.dead) {
        const dps = resistedDamage((poison.min + Math.random() * (poison.max - poison.min)) / poison.seconds, enemy.resistances.poison);
        if (dps > 0 && (!enemy.poison || dps >= enemy.poison.dps)) enemy.poison = { dps, remaining: poison.seconds };
      }
    }
    if (Math.random() * 100 < (s.mods.openWounds ?? 0)) enemy.bleed = 8;
    if (s.mods.preventHeal) enemy.preventHeal = true;
    if (!enemy.boss && !enemy.dead) {
      if (s.mods.freezeTarget && enemy.resistances.cold < 100) enemy.stunned = Math.max(enemy.stunned, s.mods.freezeTarget / [1, 2, 3][difficulty(h)]);
      if (s.mods.blindTarget) enemy.blind = Math.max(enemy.blind ?? 0, s.mods.blindTarget);
      if (Math.random() * 100 < (s.mods.flee ?? 0)) enemy.flee = 2;
    }
    if (smite && !enemy.boss) { enemy.stunned = v.duration; this.knockback(enemy, 1.1); }
    if (id === 'charge') this.knockback(enemy, 1.5);
    if (s.mods.knockback) this.knockback(enemy, .7);
    if (id === 'conversion' && !enemy.dead && !enemy.boss && Math.random() * 100 < v.percent) { enemy.converted = v.duration; enemy.path = []; g.target = undefined; g.ui.floatText('转化', enemy.actor.group.position.clone().setY(2), 'gold'); }
    if (h.equipment.weapon?.durability && !itemMods(h.equipment.weapon).indestructible && Math.random() < .04) h.equipment.weapon.durability--;
    if (id === 'sacrifice') this.hurt(physical * PALADIN_BALANCE.sacrificeRecoil, 'physical', undefined, true);
  }
  knockback(enemy: Enemy, distance: number) {
    if (enemy.boss || enemy.dead) return;
    const p = enemy.actor.group.position, next = p.clone().addScaledVector(p.clone().sub(this.game.position).normalize(), distance);
    if (this.game.world.grid.isWalkableAt(Math.round(next.x) + 28, Math.round(next.z) + 28)) { enemy.body.position.set(next.x, .5, next.z); p.copy(next); }
  }
  damage(enemy: Enemy, amount: number, type: DamageType, ignoreResist = false, critical = false) {
    const g = this.game; if (!this.hostile(enemy)) return 0;
    const s = stats(g.hero), conviction = ['fire', 'cold', 'lightning'].includes(type) && s.aura.id === 'conviction' && this.inAura(enemy) ? s.aura.percent : 0;
    const sanctuary = type === 'physical' && isUndead(enemy) && s.aura.id === 'sanctuary' && this.inAura(enemy);
    const dealt = Math.max(0, Math.floor(resistedDamage(amount, ignoreResist || sanctuary ? 0 : enemy.resistances[type], conviction)));
    enemy.hp -= dealt; enemy.active = true;
    g.ui.floatText(dealt ? String(dealt) : '免疫', enemy.actor.group.position.clone().setY(1.8), critical ? 'critical' : type === 'physical' ? 'damage' : 'magic-damage');
    if (dealt) g.burst(enemy.actor.group.position.clone().setY(.8), type === 'fire' ? 0xf09669 : type === 'cold' ? 0x80cfea : 0xe8d79c, 3);
    if (enemy.hp <= 0) g.killEnemy(enemy); else if (dealt) g.monsterCombat?.onHit(enemy); return dealt;
  }
  hurt(amount: number, type: DamageType = 'physical', source?: Enemy, self = false) {
    const g = this.game, h = g.hero, s = stats(h); if (g.dead || !self && g.invincible > 0) return;
    if (!self && source && type === 'physical') {
      if (!this.running && Math.random() * 100 >= hitChance(source.attackRating, s.defense, source.level, h.level)) { g.ui.floatText('闪避', g.position.clone().setY(1.8), 'miss'); return; }
      if (Math.random() * 100 < s.block / (this.running ? 3 : 1)) { this.lock = Math.max(this.lock, s.blockFrames / 25); g.ui.floatText('格挡', g.position.clone().setY(1.8), 'gold'); return; }
    }
    let damage = self ? amount : type === 'physical' ? Math.max(0, amount - (s.mods.damageReductionFlat ?? 0)) * (1 - Math.min(50, s.mods.damageReduction ?? 0) / 100) * (h.curse > 0 ? 2 : 1) : resistedDamage(Math.max(0, amount - (s.mods.magicReduction ?? 0)), type === 'magic' ? 0 : s.resistances[type]);
    if (!self && type === 'cold') { const absorb = damage * Math.min(40, s.mods.coldAbsorb ?? 0) / 100; h.hp = Math.min(s.maxHp, h.hp + absorb); damage -= absorb; if (!s.mods.cannotBeFrozen) h.cold = s.mods.halfFreeze ? 2 : 4; }
    damage = Math.max(0, damage); h.hp = Math.max(0, h.hp - damage);
    if (!self) {
      g.invincible = PALADIN_BALANCE.hitGraceSeconds;
      h.mana = Math.min(s.maxMana, h.mana + damage * (s.mods.damageToMana ?? 0) / 100);
      if (damage >= s.maxHp / 12 && !this.zeal && !(s.aura.id === 'concentration' && Math.random() < .2)) this.lock = Math.max(this.lock, s.recoveryFrames / 25);
      if (type === 'poison') h.poison = Math.max(h.poison, 6);
      const armor = h.equipment.armor ?? h.equipment.shield; if (armor?.durability && !itemMods(armor).indestructible && Math.random() < .1) armor.durability--;
    }
    g.ui.floatText(`-${Math.ceil(damage)}`, g.position.clone().setY(1.8), 'hurt'); g.ui.flashDamage(); g.audio.play('hurt');
    if (!self && source && type === 'physical' && s.aura.id === 'thorns') this.damage(source, damage * s.aura.percent / 100, 'physical');
    if (!self && source && type === 'physical' && s.mods.reflectDamage) this.damage(source, s.mods.reflectDamage, 'physical');
    if (h.hp <= 0) { createCorpse(h, g.position.x, g.position.z); g.dead = true; g.releaseInput(); this.zeal = null; g.actor.group.rotation.z = Math.PI / 2; g.ui.openPanel('death'); g.save(false); }
  }
  update(dt: number) {
    const g = this.game, h = g.hero, s = stats(h);
    this.lock = Math.max(0, this.lock - dt); this.fohDelay = Math.max(0, this.fohDelay - dt); h.holyShield = Math.max(0, h.holyShield - dt);
    if (!h.holyShield) h.holyShieldLevel = 0;
    const weaponModel = g.actor.group.getObjectByName('hero-weapon'), shieldModel = g.actor.group.getObjectByName('hero-shield');
    if (weaponModel) { weaponModel.visible = !!h.equipment.weapon && h.equipment.weapon.durability !== 0; weaponModel.scale.z = h.equipment.weapon?.twoHanded ? 1.3 : 1; }
    if (shieldModel) shieldModel.visible = s.hasShield;
    for (const slot of Object.keys(g.cooldowns) as Skill[]) g.cooldowns[slot] = isAura(h.bindings[slot]) ? 0 : Math.max(this.lock, h.bindings[slot] === 'fistOfHeavens' ? this.fohDelay : 0);
    h.mana = Math.min(s.maxMana, h.mana + s.manaRegen * dt); h.hp = Math.min(s.maxHp, h.hp + s.lifeRegen * dt);
    const cleanse = s.aura.id === 'cleansing' ? 1 / (1 - s.aura.percent / 100) : 1;
    h.poison = Math.max(0, h.poison - dt * cleanse / (1 - Math.min(75, s.mods.poisonLength ?? 0) / 100)); h.curse = Math.max(0, h.curse - dt * cleanse); h.cold = Math.max(0, h.cold - dt);
    if (h.poison > 0) h.hp = Math.max(1, h.hp - dt * resistedDamage(2 + difficulty(h) * 2, s.resistances.poison));
    for (const index of [0, 1] as const) if (this.regen[index] > 0) { const restored = Math.min(this.regen[index], (index ? 15 : 30) * dt); this.regen[index] -= restored; const key = index ? 'mana' : 'hp'; h[key] = Math.min(index ? s.maxMana : s.maxHp, h[key] + restored); }
    if (this.moving && h.running && h.stamina > 0) h.stamina = Math.max(0, h.stamina - dt * 6 * Math.max(0, 1 - (s.mods.staminaDrain ?? 0) / 100)); else h.stamina = Math.min(s.maxStamina, h.stamina + dt * (this.moving ? 4 : 16) * (1 + ((s.mods.staminaRegen ?? 0) + (s.aura.id === 'vigor' ? s.aura.secondary : 0)) / 100));
    this.auraRing.visible = !!s.aura.id; this.auraRing.position.copy(g.position).setY(.08); this.auraRing.rotation.z = g.time * .4;
    this.auraRing.material.color.setHex(s.aura.type === 'fire' ? 0xe59b52 : s.aura.type === 'cold' ? 0x80cfed : s.aura.id === 'conviction' ? 0x81bd79 : s.aura.id === 'prayer' || s.aura.id === 'meditation' ? 0x7bd3bf : 0xe5d38b);
    this.shieldRing.visible = h.holyShield > 0 && s.hasShield; this.shieldRing.position.copy(g.position).setY(1); this.shieldRing.rotation.x = 0;
    this.corpseRing.visible = !!h.corpse; if (h.corpse) this.corpseRing.position.set(h.corpse.x, .1, h.corpse.z);
    this.auraTimer += dt;
    if (this.auraTimer >= 2) { this.auraTimer -= 2; this.pulse(); }
    if (this.zeal) { this.zeal.timer -= dt; if (this.zeal.timer <= 0) { const target = g.nearestEnemy(2.6); if (target) this.zeal.direction.copy(target.actor.group.position).sub(g.position).normalize(); this.melee('zeal', this.zeal.direction); if (this.zeal && --this.zeal.hits <= 0) this.zeal = null; else if (this.zeal) this.zeal.timer += s.zealFrames / 25; } }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i]; projectile.age += dt;
      if (projectile.age > projectile.life) { g.disposeObject(projectile.mesh); this.projectiles.splice(i, 1); continue; }
      const p = projectile.mesh.position, previous = p.clone();
      if (projectile.kind === 'hammer') { const radius = .7 + projectile.age * 2.5, angle = projectile.age * 7 + projectile.phase; p.set(projectile.origin.x + Math.cos(angle) * radius, .9, projectile.origin.z + Math.sin(angle) * radius); projectile.mesh.rotation.z += dt * 15; }
      else p.addScaledVector(projectile.direction, dt * 14);
      if (!g.world.grid.isWalkableAt(Math.round(p.x) + 28, Math.round(p.z) + 28)) { projectile.life = 0; continue; }
      const segment = new THREE.Line3(previous, p);
      for (const enemy of g.enemies) {
        const center = enemy.actor.group.position.clone().setY(.9);
        if (enemy.dead || projectile.hit.has(enemy.id) || segment.closestPointToPoint(center, true, new THREE.Vector3()).distanceTo(center) > .9) continue;
        if (projectile.kind === 'bolt' && enemy.converted > 0) { enemy.hp = Math.min(enemy.maxHp, enemy.hp + projectile.healing); projectile.hit.add(enemy.id); projectile.life = 0; break; }
        if (!this.hostile(enemy) || projectile.kind === 'bolt' && !isUndead(enemy)) continue;
        projectile.hit.add(enemy.id); this.damage(enemy, projectile.damage, 'magic', projectile.kind === 'bolt'); if (projectile.kind === 'bolt') { projectile.life = 0; break; }
      }
    }
    for (const enemy of g.enemies) {
      enemy.stunned = Math.max(0, enemy.stunned - dt); enemy.coldTime = Math.max(0, enemy.coldTime - dt); enemy.converted = Math.max(0, enemy.converted - dt);
      if (enemy.bleed > 0 && !enemy.dead) { enemy.bleed -= dt; enemy.hp -= dt * (h.level * .6 + 2); if (enemy.hp <= 0) g.killEnemy(enemy); }
      if (enemy.poison && !enemy.dead) {
        enemy.hp -= enemy.poison.dps * Math.min(dt, enemy.poison.remaining);
        enemy.poison.remaining -= dt;
        if (enemy.poison.remaining <= 0) delete enemy.poison;
        if (enemy.hp <= 0) g.killEnemy(enemy);
      }
    }
    clampResources(h);
  }
  pulse() {
    const g = this.game, h = g.hero, s = stats(h), aura = s.aura; if (!aura.id) return;
    if (aura.id === 'prayer' || aura.id === 'cleansing' || aura.id === 'meditation') {
      const prayer = skillValues('prayer', skillLevel(h, 'prayer'), h.skills);
      if (aura.id !== 'prayer' || h.mana >= aura.cost) {
        if (aura.id === 'prayer') h.mana -= aura.cost;
        h.hp = Math.min(s.maxHp, h.hp + prayer.healing);
        for (const ally of g.enemies) if (ally.converted > 0 && this.inAura(ally)) ally.hp = Math.min(ally.maxHp, ally.hp + prayer.healing);
      }
    }
    if (aura.id === 'redemption') for (const enemy of g.enemies) if (enemy.dead && !enemy.redeemed && this.inAura(enemy) && Math.random() * 100 < aura.percent) {
      enemy.redeemed = true; enemy.actor.group.visible = false; h.hp = Math.min(s.maxHp, h.hp + aura.healing); h.mana = Math.min(s.maxMana, h.mana + aura.healing); g.burst(enemy.actor.group.position.clone().setY(.5), 0xeee1a2, 6);
    }
    if (['holyFire', 'holyFreeze', 'holyShock', 'sanctuary'].includes(aura.id)) for (const enemy of g.enemies) if (this.hostile(enemy) && this.inAura(enemy) && (aura.id !== 'sanctuary' || isUndead(enemy))) {
      this.damage(enemy, aura.min + Math.random() * (aura.max - aura.min), aura.type); if (aura.id === 'sanctuary') this.knockback(enemy, 1);
    }
  }
  slow(enemy: Enemy) { const aura = stats(this.game.hero).aura; return Math.max(.2, 1 - (aura.id === 'holyFreeze' && this.inAura(enemy) ? aura.percent / 100 : enemy.coldTime > 0 ? .5 : 0)); }
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
