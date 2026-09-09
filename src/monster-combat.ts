import * as THREE from 'three';
import type { ClassSummon } from './class-combat.ts';
import type { Enemy, Game } from './game.ts';
import { MONSTERS, type AttackId } from './bestiary.ts';
import type { DamageType } from './paladin.ts';
import { questComplete } from './campaign.ts';
import { animateActor, gridWalkable } from './world.ts';

type Shape = 'melee' | 'bolt' | 'fan' | 'nova' | 'pool' | 'line' | 'summon' | 'revive';
export type AttackSpec = { name: string; shape: Shape; type: DamageType; range: number; windup: number; cooldown: number; damage: number; radius: number; count?: number; speed?: number; duration?: number; status?: 'curse' | 'mana'; move?: boolean; color?: number };
const attack = (name: string, shape: Shape, type: DamageType, range: number, windup: number, cooldown: number, damage: number, radius: number, extra: Partial<AttackSpec> = {}): AttackSpec => ({ name, shape, type, range, windup, cooldown, damage, radius, ...extra });
export const ATTACKS: Record<AttackId, AttackSpec> = {
  strike: attack('重击', 'melee', 'physical', 1.8, .38, 1.4, 1, 2.1),
  frenzy: attack('狂乱', 'melee', 'physical', 1.9, .32, 1.1, .85, 2.2),
  arrow: attack('箭矢', 'bolt', 'physical', 8, .55, 2, .9, .2, { speed: 10 }),
  fireArrow: attack('火焰箭', 'fan', 'fire', 9, .7, 2.4, .8, .22, { count: 3, speed: 9 }),
  fireball: attack('火球', 'bolt', 'fire', 8, .7, 2.5, 1.1, .32, { speed: 7 }),
  poisonSpit: attack('毒液喷吐', 'bolt', 'poison', 7, .7, 2.7, .85, .35, { speed: 6 }),
  lightning: attack('闪电', 'fan', 'lightning', 10, .85, 3.2, 1, .23, { count: 3, speed: 10 }),
  revive: attack('亡者复生', 'revive', 'magic', 9, 1.1, 7, 0, 1.3),
  charge: attack('冲锋', 'line', 'physical', 8, .9, 3.5, 1.4, .9, { move: true, duration: .65 }),
  stomp: attack('震地重击', 'pool', 'physical', 3.5, .9, 3, 1.3, 2.5, { duration: .3 }),
  inferno: attack('地狱烈焰', 'fan', 'fire', 7, .85, 3, .75, .35, { count: 5, speed: 6 }),
  curse: attack('伤害加深', 'pool', 'magic', 9, .95, 6, .2, 2, { duration: .35, status: 'curse' }),
  hydra: attack('多头火蛇', 'summon', 'fire', 9, 1, 7, .8, 1.2),
  poisonFan: attack('剧毒弹幕', 'fan', 'poison', 10, .85, 2.8, .85, .35, { count: 7, speed: 7 }),
  poisonPool: attack('毒液之池', 'pool', 'poison', 9, 1.1, 4.5, .38, 2.4, { duration: 3 }),
  coldNova: attack('冰霜新星', 'nova', 'cold', 7, 1, 3.6, .8, .3, { count: 14, speed: 5 }),
  jab: attack('寒冰戳刺', 'melee', 'cold', 2.8, .55, 1.7, 1.2, 3),
  skull: attack('骸骨弹', 'bolt', 'magic', 10, .75, 2.7, 1.2, .4, { speed: 7 }),
  blizzard: attack('暴风雪', 'pool', 'cold', 10, 1.1, 4, .45, 2.5, { duration: 2.6 }),
  firestorm: attack('火焰风暴', 'fan', 'fire', 11, 1, 3.2, 1.1, .42, { count: 5, speed: 5.5 }),
  redLightning: attack('赤红闪电', 'line', 'lightning', 12, 1.2, 4.5, .55, .8, { duration: 1.4, color: 0xff4a59 }),
  fireNova: attack('火焰新星', 'nova', 'fire', 10, 1, 3.7, .9, .38, { count: 18, speed: 6 }),
  coldWave: attack('寒冰波', 'fan', 'cold', 11, 1, 3.5, .95, .6, { count: 5, speed: 6 }),
  manaRift: attack('法力裂隙', 'line', 'magic', 11, 1.15, 4, 1, 1, { duration: .35, status: 'mana' }),
  tentacles: attack('腐化触须', 'summon', 'physical', 9, 1.1, 8, .6, 1.4),
  clone: attack('邪恶幻象', 'summon', 'magic', 10, 1.3, 9, .5, 1.6),
  whirlwind: attack('旋风斩', 'line', 'physical', 8, .9, 3.4, .8, 1.3, { duration: 1, move: true }),
};
export const ELEMENT_COLORS: Record<DamageType, number> = { physical: 0xf1bd7b, fire: 0xff7045, cold: 0x8bdfff, lightning: 0xffdb84, poison: 0xa1e26b, magic: 0xeaa6dd };
type Cast = { id: AttackId; spec: AttackSpec; left: number; origin: THREE.Vector3; target: THREE.Vector3; summon?: ClassSummon; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> };
type State = { cast?: Cast; sequence: number; retaliation: number; summons: number; cloned: boolean; frenzy: number; lifetime?: number };
type Missile = { source: Enemy; mesh: THREE.Mesh; velocity: THREE.Vector3; spec: AttackSpec; life: number; volley: { hit: boolean; summons?: Set<ClassSummon> } };
type Hazard = { source: Enemy; mesh: THREE.Mesh; spec: AttackSpec; origin: THREE.Vector3; target: THREE.Vector3; life: number; tick: number; hit: boolean; moving: boolean };
export function segmentDistance(point: { x: number; z: number }, from: { x: number; z: number }, to: { x: number; z: number }) {
  const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length)) : 0;
  return Math.hypot(point.x - from.x - dx * t, point.z - from.z - dz * t);
}
export class MonsterCombat {
  states = new Map<number, State>();
  missiles: Missile[] = [];
  hazards: Hazard[] = [];
  readonly game: Game;
  constructor(game: Game) { this.game = game; }
  state(enemy: Enemy) { let state = this.states.get(enemy.id); if (!state) { state = { sequence: 0, retaliation: 0, summons: 0, cloned: false, frenzy: 0 }; this.states.set(enemy.id, state); } return state; }
  telegraph(enemy: Enemy) { const cast = this.states.get(enemy.id)?.cast; return cast ? { name: cast.spec.name, remaining: cast.left, total: cast.spec.windup } : null; }
  walkable(p: { x: number; z: number }) { return gridWalkable(this.game.world.grid, p); }
  lineOfSight(a: { x: number; z: number }, b: { x: number; z: number }) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 3));
    for (let i = 0; i <= steps; i++) if (!this.walkable({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps })) return false;
    return true;
  }
  cancel(enemy: Enemy) {
    const state = this.states.get(enemy.id); if (state?.cast) { this.game.disposeObject(state.cast.mesh); state.cast = undefined; enemy.cooldown = Math.max(enemy.cooldown, .6); }
  }
  onHit(enemy: Enemy) {
    const state = this.state(enemy);
    if (!enemy.definition?.retaliation || enemy.dead || enemy.converted > 0 || state.retaliation > 0) return;
    state.retaliation = 2.2;
    // Retaliation has the same visible windup and collision rules as other attacks.
    if (!state.cast) this.startCast(enemy, 'lightning', { ...ATTACKS.lightning, shape: 'nova', count: 6, damage: .45, windup: .65, speed: 5 });
  }
  warning(spec: AttackSpec, origin: THREE.Vector3, target: THREE.Vector3) {
    const line = spec.shape === 'line' || spec.shape === 'bolt' || spec.shape === 'fan';
    const length = origin.distanceTo(target), radius = spec.shape === 'nova' ? 1.5 : spec.radius;
    const mesh = new THREE.Mesh(line ? new THREE.PlaneGeometry(spec.shape === 'fan' ? 1.5 : spec.radius * 2, Math.max(.2, length)) : new THREE.RingGeometry(Math.max(.1, radius - .08), radius, 40), new THREE.MeshBasicMaterial({ color: spec.color ?? ELEMENT_COLORS[spec.type], transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(line ? origin.clone().lerp(target, .5) : spec.shape === 'pool' || spec.shape === 'summon' ? target : origin).setY(.12);
    if (line) mesh.rotation.z = Math.atan2(target.x - origin.x, target.z - origin.z);
    this.game.world.scene.add(mesh); return mesh;
  }
  startCast(enemy: Enemy, id: AttackId, override?: AttackSpec) {
    const summon=this.game.combat.classes?.target(enemy);
    const spec = override ?? ATTACKS[id], origin = enemy.actor.group.position.clone(), target = (summon?.actor.group.position??this.game.position).clone();
    if (spec.shape === 'melee' || spec.shape === 'nova') target.copy(origin);
    if (spec.shape === 'line') { const dir = target.clone().sub(origin).normalize(); target.copy(origin).addScaledVector(dir, spec.range); }
    this.state(enemy).cast = { id, spec, origin, target, summon, left: spec.windup, mesh: this.warning(spec, origin, target) };
    enemy.attackTime = 1; enemy.body.velocity.set(0, 0, 0);
  }
  hit(source: Enemy, spec: AttackSpec) {
    const g = this.game; if (g.invincible > 0 || g.dead || source.converted > 0) return;
    g.combat.hurt(source.damage * spec.damage, spec.type, source, false, spec.shape !== 'melee');
    if (g.dead) return;
    if (spec.status === 'curse') g.hero.curse = Math.max(g.hero.curse, 5);
    if (spec.status === 'mana') g.hero.mana = Math.max(0, g.hero.mana * .75);
  }
  fire(enemy: Enemy, spec: AttackSpec, origin: THREE.Vector3, direction: THREE.Vector3, volley = { hit: false }) {
    if (this.missiles.length >= 100) return;
    const material = new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS[spec.type] });
    const mesh = new THREE.Mesh(spec.type === 'physical' ? new THREE.ConeGeometry(.07, .7, 5) : new THREE.IcosahedronGeometry(spec.radius, 1), material);
    mesh.position.copy(origin).setY(.8);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.game.world.scene.add(mesh); this.missiles.push({ source: enemy, spec, mesh, velocity: direction.clone().multiplyScalar(spec.speed ?? 7), life: spec.range / (spec.speed ?? 7) + .5, volley });
  }
  resolve(enemy: Enemy, cast: Cast) {
    const g = this.game, { spec, id, origin, target } = cast;
    if (spec.shape === 'melee') {
      const point=cast.summon?.actor.group.position??g.position;
      if (point.distanceTo(enemy.actor.group.position) <= spec.radius && this.lineOfSight(enemy.actor.group.position, point)) {
        if(cast.summon){if(cast.summon.hp>0)g.combat.classes.hurtSummon(cast.summon,enemy.damage*spec.damage,spec.type);}else this.hit(enemy,spec);
      }
      if (id === 'frenzy') this.state(enemy).frenzy = 5;
    } else if (['bolt', 'fan', 'nova'].includes(spec.shape)) {
      const count = spec.count ?? 1, angle = Math.atan2(target.x - origin.x, target.z - origin.z);
      const volley = { hit: false };
      for (let i = 0; i < count; i++) {
        const a = spec.shape === 'nova' ? i * Math.PI * 2 / count : angle + (i - (count - 1) / 2) * .17;
        this.fire(enemy, spec, origin, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), volley);
      }
    } else if (spec.shape === 'pool' || spec.shape === 'line') {
      if (this.hazards.length >= 24) return;
      const line = spec.shape === 'line', material = new THREE.MeshBasicMaterial({ color: spec.color ?? ELEMENT_COLORS[spec.type], transparent: true, opacity: .48, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(line ? new THREE.PlaneGeometry(spec.radius * 2, origin.distanceTo(target)) : new THREE.CircleGeometry(spec.radius, 32), material);
      mesh.position.copy(line ? origin.clone().lerp(target, .5) : target).setY(.13); mesh.rotation.x = -Math.PI / 2;
      if (line) mesh.rotation.z = Math.atan2(target.x - origin.x, target.z - origin.z);
      g.world.scene.add(mesh);
      if (id === 'blizzard') for (let i = 0; i < 6; i++) { const shard = new THREE.Mesh(new THREE.ConeGeometry(.09, .65, 4), material); shard.position.set(Math.sin(i * 2.4) * 1.7, Math.cos(i * 2.4) * 1.7, .5 + i * .15); mesh.add(shard); }
      this.hazards.push({ source: enemy, spec, mesh, origin, target, life: spec.duration ?? 1, tick: 0, hit: false, moving: !!spec.move });
    } else this.summon(enemy, id, target);
  }
  summon(enemy: Enemy, id: AttackId, target: THREE.Vector3) {
    const g = this.game, state = this.state(enemy);
    if (g.enemies.filter(e => !e.dead && e.summoned).length >= 8 || g.enemies.filter(e => !e.dead && e.owner === enemy.id).length >= (id === 'clone' ? 1 : 2)) return;
    let definition = MONSTERS.viper, name = '腐化触须', position = target.clone(), corpse: Enemy | undefined;
    if (id === 'revive') {
      corpse = g.enemies.find(e => e.dead && !e.elite && !e.redeemed && !e.summoned && e.definition?.id === enemy.definition?.revive && e.actor.group.position.distanceTo(enemy.actor.group.position) < 9);
      if (!corpse || state.summons >= 3) return;
      definition = corpse.definition!; name = corpse.name; position.copy(corpse.actor.group.position);
    } else if (id === 'clone') {
      if (state.cloned || enemy.hp > enemy.maxHp * .5) return;
      definition = { ...enemy.definition!, attacks: ['coldWave', 'skull'], scale: enemy.definition!.scale * .85 }; name = '巴尔的幻象'; position.copy(enemy.actor.group.position).add(new THREE.Vector3(2, 0, 0));
    } else if (id === 'hydra') { definition = { ...MONSTERS.viper, color: 0xd6935d, attacks: ['fireball'] }; name = '多头火蛇'; }
    else definition = { ...definition, attacks: ['strike'] };
    const candidates = id === 'revive' ? [position] : Array.from({ length: 8 }, (_, i) => position.clone().add(new THREE.Vector3(Math.sin(i * Math.PI / 4) * 2, 0, Math.cos(i * Math.PI / 4) * 2)));
    const point = candidates.find(p => this.walkable(p) && this.lineOfSight(enemy.actor.group.position, p)); if (!point) return;
    if (corpse) { corpse.redeemed = true; corpse.actor.group.visible = false; }
    if (id === 'clone') state.cloned = true;
    const add = g.spawnEnemy(point.x, point.z, 'demon', definition); add.name = name; add.summoned = true; add.owner = enemy.id; add.active = true;
    add.maxHp = add.hp = enemy.maxHp * (id === 'clone' ? .18 : .12); add.damage = enemy.damage * .4;
    if (id === 'hydra' || id === 'tentacles') add.speed = 0;
    this.state(add).lifetime = id === 'clone' ? 16 : 12; state.summons++;
  }
  updateEnemy(enemy: Enemy, dt: number) {
    const g = this.game, state = this.state(enemy), p = enemy.actor.group.position, targetPoint=g.combat.classes?.target(enemy)?.actor.group.position??g.position, distance = p.distanceTo(targetPoint);
    state.retaliation = Math.max(0, state.retaliation - dt); state.frenzy = Math.max(0, state.frenzy - dt);
    enemy.blind = Math.max(0, (enemy.blind ?? 0) - dt); enemy.flee = Math.max(0, (enemy.flee ?? 0) - dt);
    if (enemy.active && !enemy.preventHeal && !enemy.poison && enemy.definition?.model === 'council') enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * .01 * dt);
    if (state.lifetime !== undefined) { state.lifetime -= dt; if (state.lifetime <= 0 || g.enemies.find(e => e.id === enemy.owner)?.dead) { g.killEnemy(enemy); return; } }
    if (g.started && distance < (enemy.boss ? 11 : 9) && (!enemy.boss || questComplete(g.hero.campaign))) enemy.active = true;
    if (distance > 22) enemy.active = false;
    enemy.attackTime = Math.max(0, enemy.attackTime - dt * 2); enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.body.velocity.x *= .65; enemy.body.velocity.z *= .65;
    if (enemy.flee > 0 && !enemy.boss && enemy.stunned <= 0 && enemy.converted <= 0) {
      this.cancel(enemy); const direction = p.clone().sub(g.position).normalize(), next = p.clone().addScaledVector(direction, enemy.speed * dt);
      if (this.lineOfSight(p, next)) enemy.body.velocity.set(direction.x * enemy.speed, 0, direction.z * enemy.speed);
      animateActor(enemy.actor, g.time + enemy.id, true, 0); return;
    }
    if (enemy.stunned > 0 || enemy.converted > 0 || !enemy.active || enemy.blind > 0 && distance > 2.5) {
      this.cancel(enemy);
      if (enemy.stunned > 0) enemy.body.velocity.set(0, 0, 0);
      const moving = enemy.stunned <= 0 && g.combat.allyUpdate(enemy, dt); animateActor(enemy.actor, g.time + enemy.id, moving, enemy.attackTime); return;
    }
    const dash = this.hazards.find(h => h.source === enemy && h.moving);
    if (dash) {
      const direction = dash.target.clone().sub(p), remaining = direction.length(); direction.normalize();
      const next = p.clone().addScaledVector(direction, Math.min(remaining, dt * 10));
      if (remaining < .4 || !this.lineOfSight(p, next)) { dash.life = 0; enemy.body.velocity.set(0, 0, 0); }
      else enemy.body.velocity.set(direction.x * 10, 0, direction.z * 10);
      const summon=g.combat.classes?.summons.find(s=>s.id!=='hydra'&&s.hp>0&&segmentDistance(s.actor.group.position,p,next)<dash.spec.radius+.3);
      if(!dash.hit&&summon){g.combat.classes.hurtSummon(summon,enemy.damage*dash.spec.damage,dash.spec.type);dash.hit=true;}
      if (!dash.hit && segmentDistance(g.position, p, next) < dash.spec.radius + .3) { this.hit(enemy, dash.spec); dash.hit = true; }
      animateActor(enemy.actor, g.time + enemy.id, true, .6); return;
    }
    if (state.cast) {
      state.cast.left -= dt; enemy.body.velocity.set(0, 0, 0); enemy.attackTime = Math.max(.1, state.cast.left / state.cast.spec.windup);
      state.cast.mesh.material.opacity = .3 + .25 * Math.sin(g.time * 12) ** 2;
      if (state.cast.left <= 0) { const cast = state.cast; state.cast = undefined; g.disposeObject(cast.mesh); this.resolve(enemy, cast); enemy.cooldown = cast.spec.cooldown / g.combat.slow(enemy) / (state.frenzy > 0 ? 1.25 : 1); }
      animateActor(enemy.actor, g.time + enemy.id, false, enemy.attackTime); return;
    }
    enemy.actor.group.rotation.y = Math.atan2(targetPoint.x - p.x, targetPoint.z - p.z);
    const attacks = enemy.definition?.attacks ?? ['strike'];
    let selected = attacks[state.sequence % attacks.length];
    if (selected === 'clone' && (state.cloned || enemy.hp > enemy.maxHp * .5)) selected = 'coldWave';
    if (selected === 'revive' && (state.summons >= 3 || !g.enemies.some(e => e.dead && !e.redeemed && !e.summoned && e.definition?.id === enemy.definition?.revive && e.actor.group.position.distanceTo(p) < 9))) selected = enemy.definition?.id === 'bloodRaven' ? 'fireArrow' : 'fireball';
    const spec = ATTACKS[selected], sight = distance < spec.range && this.lineOfSight(p, targetPoint);
    if (!enemy.cooldown && sight) { state.sequence++; this.startCast(enemy, selected); return; }
    let moving = false;
    if (distance > (spec.shape === 'melee' ? spec.range * .85 : sight ? spec.range * .65 : 1.5)) {
      enemy.rethink -= dt;
      if (enemy.rethink <= 0) { enemy.path = g.world.path(p, targetPoint); enemy.rethink = .7; }
      const point = enemy.path[0];
      if (point) { const direction = point.clone().sub(p), d = direction.length(); if (d < .3) enemy.path.shift(); else { direction.normalize(); const speed = enemy.speed * g.combat.slow(enemy) * (state.frenzy > 0 ? 1.25 : 1); enemy.body.velocity.set(direction.x * speed, 0, direction.z * speed); moving = speed > 0; } }
    }
    animateActor(enemy.actor, g.time + enemy.id, moving, enemy.attackTime);
  }
  update(dt: number) {
    const g = this.game;
    for (const enemy of g.enemies) if (!enemy.dead) this.updateEnemy(enemy, dt); else this.cancel(enemy);
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], previous = m.mesh.position.clone(), speed=g.combat.classes?.missileSpeed(m.source)??1; m.life -= dt*speed; m.mesh.position.addScaledVector(m.velocity, dt*speed);
      const blocked = !this.lineOfSight(previous, m.mesh.position), cancelled = m.source.dead || m.source.converted > 0;
      const heroHit=segmentDistance(g.position,previous,m.mesh.position)<m.spec.radius+.32;
      const summon=g.combat.classes?.summons.filter(s=>s.id!=='hydra'&&s.hp>0&&segmentDistance(s.actor.group.position,previous,m.mesh.position)<m.spec.radius+.32&&(!heroHit||s.actor.group.position.distanceToSquared(previous)<g.position.distanceToSquared(previous))).sort((a,b)=>a.actor.group.position.distanceToSquared(previous)-b.actor.group.position.distanceToSquared(previous))[0];
      if(!cancelled&&!blocked&&summon){m.volley.summons??=new Set();if(!m.volley.summons.has(summon)){g.combat.classes.hurtSummon(summon,m.source.damage*m.spec.damage,m.spec.type);m.volley.summons.add(summon);}m.life=0;}
      else if (!cancelled && !blocked && heroHit) {
        // One volley can hit once even if its other missiles arrive in later frames.
        if (!m.volley.hit) this.hit(m.source, m.spec);
        m.volley.hit = true; m.life = 0;
      }
      if (m.life <= 0 || blocked || cancelled) { g.disposeObject(m.mesh); this.missiles.splice(i, 1); }
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.life -= dt; h.tick -= dt;
      if (h.life <= 0 || h.source.dead || h.source.converted > 0) { g.disposeObject(h.mesh); this.hazards.splice(i, 1); continue; }
      if (h.moving || h.tick > 0) continue;
      h.tick = .65;
      const inside = h.spec.shape === 'line' ? segmentDistance(g.position, h.origin, h.target) <= h.spec.radius + .3 : g.position.distanceTo(h.target) < h.spec.radius + .25;
      if (inside && this.lineOfSight(h.origin, g.position)) this.hit(h.source, h.spec);
      for(const summon of g.combat.classes?.summons??[]) {const point=summon.actor.group.position;if(summon.id!=='hydra'&&summon.hp>0&&(h.spec.shape==='line'?segmentDistance(point,h.origin,h.target)<=h.spec.radius+.3:point.distanceTo(h.target)<h.spec.radius+.25)&&this.lineOfSight(h.origin,point))g.combat.classes.hurtSummon(summon,h.source.damage*h.spec.damage,h.spec.type);}
    }
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const enemy = g.enemies[i];
      if (enemy.dead && enemy.summoned) { this.states.delete(enemy.id); g.disposeObject(enemy.actor.group); g.enemies.splice(i, 1); }
    }
  }
}
