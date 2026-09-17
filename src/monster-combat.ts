import { curseDuration } from './item-special-effects.ts';
import { monsterTraits } from './monster-traits.ts';
import { baseMonsterAttackRating } from './balance.ts';
import * as THREE from 'three';
import { castSound } from './audio-bank.ts';
import type { CombatAlly } from './class-combat.ts';
import type { Enemy, Game } from './game.ts';
import { MONSTERS, monsterTactic, type AttackId, type MonsterDef } from './bestiary.ts';
import type { DamageType } from './paladin.ts';
import { questComplete } from './campaign.ts';
import { animateActor, gridWalkable } from './world.ts';
import { createProjectileVisual, createLightning, decorateGround, updateVisual } from './visual-effects.ts';
import { hasMonsterAffix, monsterDamageParts, type MonsterAura, type DamagePart } from './monster-affixes.ts';
import { stats } from './model.ts';
import { makeRing } from './world.ts';
import type { HeroStatus } from './status-effects.ts';

type Shape = 'melee' | 'bolt' | 'fan' | 'nova' | 'pool' | 'line' | 'wall' | 'summon' | 'revive' | 'teleport' | 'prison' | 'support';
export type AttackSpec = { name: string; shape: Shape; type: DamageType; range: number; windup: number; cooldown: number; damage: number; radius: number; count?: number; speed?: number; duration?: number; status?: 'curse' | 'mana' | 'stun' | 'bloodMana' | 'defense' | 'decrepify'; move?: boolean; color?: number; secondary?: [DamageType, number]; knockback?: number; triggered?: boolean; afterDeath?: boolean; ignoreDefense?: boolean; manaDrain?: number };
const attack = (name: string, shape: Shape, type: DamageType, range: number, windup: number, cooldown: number, damage: number, radius: number, extra: Partial<AttackSpec> = {}): AttackSpec => ({ name, shape, type, range, windup, cooldown, damage, radius, ...extra });
export const ATTACKS: Record<AttackId, AttackSpec> = {
  summonMinions: attack('召唤毁灭仆从', 'summon', 'magic', 10, 1.2, 9, 0, 1.2),
  corpseExplosion: attack('尸体爆炸', 'pool', 'fire', 12, 1.1, 4, 1.2, 3.5, { duration: .3, secondary: ['physical', 1.2], ignoreDefense: true }),
  rally: attack('督战与治疗', 'support', 'magic', 8, .9, 9, 0, 7),
  meteor: attack('陨火', 'pool', 'fire', 11, 1.5, 7, .7, 1.8, { duration: 1.5 }),
  strike: attack('重击', 'melee', 'physical', 1.8, .38, 1.4, 1, 2.1),
  manaTouch: attack('汲取法力', 'melee', 'physical', 1.8, .5, 1.8, .85, 2.1, { status: 'mana' }),
  fireWall: attack('火墙', 'wall', 'fire', 9, 1, 5, .35, .7, { duration: 3 }),
  brood: attack('孵化幼体', 'summon', 'physical', 10, 1.2, 9, 0, 1.2),
  frenzy: attack('狂乱', 'melee', 'physical', 1.9, .32, 1.1, .85, 2.2),
  arrow: attack('箭矢', 'bolt', 'physical', 8, .55, 2, .9, .2, { speed: 10 }),
  fireArrow: attack('火焰箭', 'fan', 'fire', 9, .7, 2.4, .8, .22, { count: 3, speed: 9 }),
  fireball: attack('火球', 'bolt', 'fire', 8, .7, 2.5, 1.1, .32, { speed: 7 }),
  poisonSpit: attack('毒液喷吐', 'bolt', 'poison', 7, .7, 2.7, .85, .35, { speed: 6 }),
  lightning: attack('闪电', 'fan', 'lightning', 10, .85, 3.2, 1, .23, { count: 3, speed: 10 }),
  revive: attack('亡者复生', 'revive', 'magic', 9, 1.1, 7, 0, 1.3),
  charge: attack('冲锋', 'line', 'physical', 8, .9, 3.5, 1.4, .9, { move: true, duration: .65 }),
  stomp: attack('震地重击', 'pool', 'physical', 3.5, .9, 3, 1.3, 2.5, { duration: .3 }),
  inferno: attack('地狱烈焰', 'line', 'fire', 6, .85, 3, .4, .75, { duration: 1.3 }),
  curse: attack('伤害加深', 'pool', 'magic', 9, .95, 6, .2, 2, { duration: .35, status: 'curse' }),
  hydra: attack('多头火蛇', 'summon', 'fire', 9, 1, 7, .8, 1.2),
  poisonFan: attack('剧毒弹幕', 'fan', 'poison', 10, .85, 2.8, .85, .35, { count: 7, speed: 7 }),
  poisonPool: attack('毒液之池', 'pool', 'poison', 9, 1.1, 4.5, .38, 2.4, { duration: 3 }),
  coldNova: attack('冰霜新星', 'nova', 'cold', 7, 1, 3.6, .8, .3, { count: 14, speed: 5 }),
  jab: attack('寒冰戳刺', 'melee', 'cold', 2.8, .55, 1.7, .55, 3, { count: 3 }),
  skull: attack('骸骨弹', 'bolt', 'magic', 10, .75, 2.7, 1.2, .4, { speed: 7 }),
  blizzard: attack('暴风雪', 'pool', 'cold', 10, 1.1, 4, .45, 2.5, { duration: 2.6 }),
  firestorm: attack('火焰风暴', 'fan', 'fire', 11, 1, 3.2, 1.1, .42, { count: 5, speed: 5.5 }),
  redLightning: attack('赤红闪电', 'line', 'lightning', 12, 1.2, 4.5, .55, .8, { duration: 1.4, color: 0xff4a59, secondary: ['physical', .55] }),
  fireNova: attack('火焰新星', 'nova', 'fire', 10, 1, 3.7, .9, .38, { count: 18, speed: 6 }),
  coldWave: attack('寒冰波', 'fan', 'cold', 11, 1, 3.5, .95, .6, { count: 5, speed: 6, knockback: 1.6 }),
  manaRift: attack('法力裂隙', 'line', 'magic', 11, 1.15, 4, .85, 1, { duration: .35, status: 'mana', manaDrain: .5 }),
  tentacles: attack('腐化触须', 'summon', 'physical', 9, 1.1, 8, .6, 1.4),
  clone: attack('邪恶幻象', 'summon', 'magic', 10, 1.3, 9, .5, 1.6),
  whirlwind: attack('旋风斩', 'line', 'physical', 8, .9, 3.4, .8, 1.3, { duration: 1, move: true }),
  poisonStrike: attack('剧毒爪击', 'melee', 'physical', 2.3, .5, 1.8, .8, 2.6, { secondary: ['poison', .4] }),
  smite: attack('重击', 'melee', 'physical', 2.6, .8, 3.5, 1.1, 2.9, { status: 'stun', knockback: 1.4 }),
  mephistoLightning: attack('闪电束', 'line', 'lightning', 11, .9, 3, .75, .4, { duration: .3 }),
  chargedBolt: attack('充能弹', 'fan', 'lightning', 10, .8, 3.4, .65, .25, { count: 9, speed: 5 }),
  mephistoOrb: attack('冰冷骷髅弹', 'bolt', 'cold', 12, .9, 3.2, .65, .5, { speed: 7, secondary: ['physical', .65] }),
  poisonNova: attack('剧毒新星', 'nova', 'poison', 8, 1, 5, .65, .3, { count: 16, speed: 5 }),
  coldTouch: attack('寒冰之触', 'melee', 'physical', 2.8, .6, 2.1, .8, 3, { secondary: ['cold', .35] }),
  bonePrison: attack('骨牢', 'prison', 'physical', 10, 1.2, 12, 0, 2, { duration: 5 }),
  bossTeleport: attack('传送', 'teleport', 'magic', 14, .7, 8, 0, 1),
  baalCurse: attack('鲜血法力 / 防御诅咒', 'pool', 'magic', 10, 1, 8, 0, 2.5, { duration: .3, status: 'bloodMana' }),
  decrepify: attack('衰老', 'pool', 'magic', 9, .9, 8, 0, 2.5, { duration: .3, status: 'decrepify' }),
};
export const ELEMENT_COLORS: Record<DamageType, number> = { physical: 0xf1bd7b, fire: 0xff7045, cold: 0x8bdfff, lightning: 0xffdb84, poison: 0xa1e26b, magic: 0xeaa6dd };
// Higher difficulties pursue farther and recover faster; attack warnings retain their full duration.
export const DIFFICULTY_AI = [
  { sightRange: 20, engageRange: 12, memory: 6, leash: 28, alertRange: 12, cooldownMultiplier: .88, recoveryMultiplier: 1, pursuit: 1 },
  { sightRange: 23, engageRange: 15, memory: 8, leash: 32, alertRange: 14, cooldownMultiplier: .72, recoveryMultiplier: .82, pursuit: 1.08 },
  { sightRange: 26, engageRange: 18, memory: 11, leash: 36, alertRange: 16, cooldownMultiplier: .62, recoveryMultiplier: .72, pursuit: 1.18 },
] as const;
export const NORMAL_DIFFICULTY_AI = DIFFICULTY_AI[0];
type Cast = { id: AttackId; spec: AttackSpec; left: number; origin: THREE.Vector3; target: THREE.Vector3; summon?: CombatAlly; corpse?: Enemy; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> };
type State = { cast?: Cast; sequence: number; retaliation: number; summons: number; cloned: boolean; frenzy: number; lifetime?: number; abilities: Partial<Record<AttackId, number>>; lastAttack?: AttackId; lastSeen?: THREE.Vector3; memory: number; alerted: boolean; retreat: number; retreatCooldown: number; teleportCooldown?: number; heals?: number; auraTick?: number; corpseLife?: number; phase?: { from: THREE.Vector3; to: THREE.Vector3; progress: number } };
type Missile = { source: Enemy; mesh: THREE.Mesh; velocity: THREE.Vector3; spec: AttackSpec; life: number; volley: { hit: boolean; summons?: Set<CombatAlly> } };
type Hazard = { source: Enemy; mesh: THREE.Mesh; spec: AttackSpec; origin: THREE.Vector3; target: THREE.Vector3; life: number; tick: number; hit: boolean; moving: boolean };
export function segmentDistance(point: { x: number; z: number }, from: { x: number; z: number }, to: { x: number; z: number }) {
  const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length)) : 0;
  return Math.hypot(point.x - from.x - dx * t, point.z - from.z - dz * t);
}
export function monsterAttackSpec(definition: MonsterDef | undefined, id: AttackId, difficulty = 0): AttackSpec {
  const spec = { ...ATTACKS[id] }, species = definition?.id, traits = monsterTraits(definition);
  if (id === 'strike' && traits.meleeWindup) spec.windup = traits.meleeWindup;
  if (id === 'lightning' && species === 'soul') Object.assign(spec, { name: '灵魂闪电', shape: 'line', range: 13, radius: .35, windup: .75, duration: .35, damage: 1.2, cooldown: 3.6 });
  if (id === 'inferno' && ['unraveler', 'frozen'].includes(species ?? '')) Object.assign(spec, {
    name: species === 'frozen' ? '寒冰吐息' : '腐败毒息', type: species === 'frozen' ? 'cold' : 'poison', range: 5, cooldown: 4,
  });
  if (id === 'poisonSpit' && species === 'iceCrawler') Object.assign(spec, { name: '寒冰喷吐', type: 'cold' });
  if (id === 'inferno' && species === 'nihlathak') Object.assign(spec, { name: '极地风暴', type: 'cold', range: 7, cooldown: 4 });
  if (id === 'bossTeleport' && species === 'imp') Object.assign(spec, { name: '闪烁逃脱', windup: .55, cooldown: 7 });
  if (id === 'charge' && ['viper', 'reanimated', 'iceCrawler'].includes(species ?? '')) spec.knockback = 1;
  if (id === 'strike' && ['spider', 'mummy'].includes(species ?? '')) spec.secondary = ['poison', .25];
  if (difficulty > 0 && (id === 'strike' || id === 'frenzy')) {
    if (species === 'fallen') spec.secondary = ['fire', .15];
    if (species === 'doomKnight') spec.secondary = ['cold', .2];
    if (species === 'bloodLord') spec.secondary = ['magic', .2];
  }
  return spec;
}

export class MonsterCombat {
  states = new Map<number, State>();
  missiles: Missile[] = [];
  hazards: Hazard[] = [];
  triggeredCasts: { source: Enemy; cast: Cast }[] = [];
  meleeCasts: { source: Enemy; cast: Cast }[] = [];
  prisons: { source: Enemy; center: THREE.Vector3; guards: Enemy[] }[] = [];
  debuffs = { bloodMana: 0, defense: 0, decrepify: 0 };
  mercenaryCurseUntil = 0;
  allyCurses = new WeakMap<CombatAlly, number>();
  readonly game: Game;
  constructor(game: Game) { this.game = game; }
  aura(enemy: Enemy): MonsterAura | undefined { return enemy.definition?.id === 'duriel' ? 'holyFreeze' : enemy.affixes?.find(a => a.id === 'auraEnchanted')?.aura; }
  auraAt(point: THREE.Vector3, aura: MonsterAura) {
    return this.game.enemies.some(e => !e.dead && e.active && e.converted <= 0 && this.aura(e) === aura && e.actor.group.position.distanceTo(point) < 7 && this.lineOfSight(e.actor.group.position, point));
  }
  heroSpeed() { return (this.auraAt(this.game.position, 'holyFreeze') ? .6 : 1) * (this.debuffs.decrepify > 0 ? .65 : 1); }
  imprisoned(point: THREE.Vector3) { return this.prisons.some(p => !p.source.dead && p.guards.every(e => !e.dead) && point.distanceTo(p.center) < 2.2); }
  rallied = new Map<number, { source: Enemy; until: number }>();
  rallyBoost(enemy: Enemy) {
    const buff = this.rallied.get(enemy.id), source = buff?.source;
    return !!buff && buff.until > this.game.time && !!source && !source.dead && source.active && source.converted <= 0 && enemy.converted <= 0
      && source.actor.group.position.distanceTo(enemy.actor.group.position) < 9 && this.lineOfSight(source.actor.group.position, enemy.actor.group.position);
  }
  attackRate(enemy: Enemy) { return (enemy.converted <= 0 && this.auraAt(enemy.actor.group.position, 'fanaticism') ? 1.2 : 1) * (this.rallyBoost(enemy) ? 1.2 : 1); }
  supportTargets(enemy: Enemy) {
    return this.game.enemies.filter(ally => ally !== enemy && !ally.dead && !ally.boss && !ally.summoned && ally.active && ally.converted <= 0
      && ally.definition?.race === 'demon' && !ally.definition.attacks.includes('rally')
      && ally.actor.group.position.distanceTo(enemy.actor.group.position) < 7 && this.lineOfSight(enemy.actor.group.position, ally.actor.group.position));
  }
  attackSpec(enemy: Enemy, id: AttackId) { return monsterAttackSpec(enemy.definition, id, this.game.hero.difficultyLevel); }
  accuracy(enemy: Enemy) { return enemy.attackRating * (1 - (this.game.combat.specialItems?.taunts.get(enemy) ?? 0) / 100) * (enemy.converted <= 0 && this.auraAt(enemy.actor.group.position, 'blessedAim') ? 1.5 : 1); }
  damageParts(enemy: Enemy, amount: number, type: DamageType, spec?: AttackSpec): DamagePart[] {
    const parts = spec?.triggered ? [{ type, amount }] : monsterDamageParts(enemy, amount, type);
    if (spec?.secondary) parts.push({ type: spec.secondary[0], amount: enemy.damage * spec.secondary[1] });
    if (!spec?.triggered && enemy.converted <= 0) {
      const point = enemy.actor.group.position, multiplier = this.auraAt(point, 'might') ? 1.3 : this.auraAt(point, 'fanaticism') ? 1.2 : 1;
      for (const part of parts) if (part.type === 'physical') part.amount *= multiplier;
    }
    // Flat reduction and absorption apply once per damage type, even when an
    // enchantment adds the same element as the original attack.
    const totals = new Map<DamageType, number>();
    for (const part of parts) totals.set(part.type, (totals.get(part.type) ?? 0) + part.amount);
    return [...totals].map(([type, amount]) => ({ type, amount: type === 'physical' && !spec?.triggered ? amount * (1 - (this.game.combat.specialItems?.taunts.get(enemy) ?? 0) / 100) : amount }));
  }
  clearHeroDebuffs() { this.debuffs = { bloodMana: 0, defense: 0, decrepify: 0 }; this.mercenaryCurseUntil = 0; }
  heroStatuses(): HeroStatus[] {
    const effects: HeroStatus[] = [];
    for (const [id, name, description] of [
      ['bloodMana', '鲜血法力', '施法额外损失法力消耗一半的生命'],
      ['defense', '防御诅咒', '防御大幅降低'],
      ['decrepify', '衰老', '移动、行动速度和物理输出降低'],
    ] as const) if (this.debuffs[id] > 0) effects.push({ id: `monster-${id}`, name, description, icon: 'skull', kind: 'debuff', remaining: this.debuffs[id] });
    for (const [aura, name, description] of [['holyFreeze', '神圣冰冻', '离开灵气范围解除减速'], ['conviction', '敌方审判', '火、冰、电抗性降低 35，防御降低']] as const) {
      if (this.auraAt(this.game.position, aura)) effects.push({ id: `monster-${aura}`, name, description, icon: 'sparkles', kind: 'debuff', remaining: null });
    }
    if (this.imprisoned(this.game.position)) effects.push({ id: 'monster-prison', name: '骨牢', description: '击碎任一骨柱脱困，或等待骨牢消失', icon: 'lock', kind: 'debuff', remaining: null });
    return effects;
  }
  castCost(cost: number) { if (this.debuffs.bloodMana > 0 && cost > 0) this.game.combat.hurt(cost * .5, 'magic', undefined, true); }
  teleport(enemy: Enemy, heal = false) {
    const origin = enemy.actor.group.position.clone(), start = Math.random() * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const angle = start + i * Math.PI / 6, point = origin.clone().add(new THREE.Vector3(Math.sin(angle) * 4, 0, Math.cos(angle) * 4));
      if (!this.walkable(point) || !this.lineOfSight(origin, point) || point.distanceTo(this.game.position) < 2 || this.game.enemies.some(e => e !== enemy && !e.dead && point.distanceTo(e.actor.group.position) < 1)) continue;
      this.game.burst?.(origin, 0xb898ff, 12); enemy.actor.group.position.copy(point); enemy.body.position.set(point.x, enemy.body.position.y, point.z); enemy.body.velocity.set(0, 0, 0); enemy.path = []; enemy.rethink = 0;
      if (heal && !enemy.preventHeal && !enemy.poison && (this.state(enemy).heals ?? 0) < 2) { enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * .08); this.state(enemy).heals = (this.state(enemy).heals ?? 0) + 1; }
      return true;
    }
    return false;
  }
  hurtAlly(ally: CombatAlly, enemy: Enemy, spec: AttackSpec, missile = false) {
    // Mercenaries share the complete damage packet, avoiding duplicate hit checks.
    if (ally.id === 'mercenary') { this.game.mercenary.hurt(enemy.damage * spec.damage, spec.type, enemy, missile, spec); return; }
    const cursed = (this.allyCurses.get(ally) ?? 0) > this.game.time;
    for (const part of this.damageParts(enemy, enemy.damage * spec.damage, spec.type, spec)) this.game.combat.classes.hurtSummon(ally, part.amount * (cursed && part.type === 'physical' ? 2 : 1), part.type, enemy, missile);
    if (!spec.triggered && hasMonsterAffix(enemy, 'cursed') && Math.random() < .75) this.allyCurses.set(ally, this.game.time + 5);
  }
  state(enemy: Enemy) { let state = this.states.get(enemy.id); if (!state) { state = { sequence: 0, retaliation: 0, summons: 0, cloned: false, frenzy: 0, abilities: {}, memory: 0, alerted: false, retreat: 0, retreatCooldown: 0 }; this.states.set(enemy.id, state); } return state; }
  telegraph(enemy: Enemy) { const cast = this.states.get(enemy.id)?.cast; return cast ? { name: cast.spec.name, remaining: cast.left, total: cast.spec.windup } : null; }
  walkable(p: { x: number; z: number }) { return gridWalkable(this.game.world.grid, p); }
  lineOfSight(a: { x: number; z: number }, b: { x: number; z: number }) {
    const wall=this.game.combat?.expansion?.walls.find(w=>w.ally.hp>0&&Math.hypot(w.ally.actor.group.position.x-b.x,w.ally.actor.group.position.z-b.z)<.1);
    if(wall){const distance=Math.hypot(b.x-a.x,b.z-a.z),factor=Math.max(0,distance-.75)/Math.max(.001,distance);b={x:a.x+(b.x-a.x)*factor,z:a.z+(b.z-a.z)*factor};}
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 3));
    for (let i = 0; i <= steps; i++) if (!this.walkable({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps })) return false;
    return true;
  }
  cancel(enemy: Enemy) {
    this.endPhase(enemy, true);
    const state = this.states.get(enemy.id); if (state?.cast) { this.game.disposeObject(state.cast.mesh); state.cast = undefined; enemy.cooldown = Math.max(enemy.cooldown, .6); }
    for (const hazard of this.hazards) if (hazard.source === enemy && hazard.spec.shape === 'line') hazard.life = 0;
  }
  onDeath(enemy: Enemy) {
    const death = monsterTraits(enemy.definition).death;
    if (death && enemy.converted <= 0 && !enemy.summoned) {
      const origin = enemy.actor.group.position.clone();
      const spec: AttackSpec = { ...ATTACKS.poisonPool, name: death === 'burst' ? '娃娃死亡爆炸' : '腐尸毒云',
        type: death === 'burst' ? 'physical' : 'poison', radius: death === 'burst' ? 2.4 : 2,
        damage: death === 'burst' ? [1.5, 1.8, 2.1][this.game.hero.difficultyLevel] : .25,
        ignoreDefense: death === 'burst', windup: death === 'burst' ? .55 : .4, duration: death === 'burst' ? .3 : 3, triggered: true, afterDeath: true };
      this.triggeredCasts.push({ source: enemy, cast: { id: 'poisonPool', spec, origin, target: origin.clone(), left: spec.windup, mesh: this.warning(spec, origin, origin) } });
    }
    if (enemy.converted <= 0 && !enemy.summoned) for (const [affix, id] of [['fireEnchanted', 'fireNova'], ['coldEnchanted', 'coldNova']] as const) {
      if (!hasMonsterAffix(enemy, affix)) continue;
      const origin = enemy.actor.group.position.clone();
      const spec: AttackSpec = affix === 'fireEnchanted' ? { ...ATTACKS.fireNova, name: '火焰强化爆炸', shape: 'pool', radius: 3, damage: .65, secondary: ['physical', .65], duration: .2, windup: .65, triggered: true, afterDeath: true } : { ...ATTACKS.coldNova, name: '冰冷强化新星', damage: .75, windup: .65, triggered: true, afterDeath: true };
      this.triggeredCasts.push({ source: enemy, cast: { id, spec, origin, target: origin.clone(), left: spec.windup, mesh: this.warning(spec, origin, origin) } });
    }
    if (enemy.converted > 0 || !['fallen','shaman'].includes(enemy.definition?.model ?? '')) return;
    for (const ally of this.game.enemies) {
      if (ally.dead || ally.boss || ally.elite || ally.champion || ally.converted > 0 || monsterTactic(ally.definition) !== 'coward') continue;
      if (ally.actor.group.position.distanceTo(enemy.actor.group.position) > 8 || !this.lineOfSight(ally.actor.group.position, enemy.actor.group.position)) continue;
      ally.flee = Math.max(ally.flee ?? 0, 1.2 + ally.id % 4 * .2);
      this.cancel(ally);
    }
  }
  revivalTarget(enemy: Enemy) {
    if (this.state(enemy).summons >= 3 || !enemy.definition?.revive) return undefined;
    return this.game.enemies.filter(e => e.dead && !e.boss && !e.elite && !e.champion && !e.redeemed && !e.summoned && e.definition?.id === enemy.definition?.revive
      && e.actor.group.position.distanceTo(enemy.actor.group.position) < 9 && this.lineOfSight(enemy.actor.group.position, e.actor.group.position))
      .sort((a,b) => a.actor.group.position.distanceToSquared(enemy.actor.group.position)-b.actor.group.position.distanceToSquared(enemy.actor.group.position))[0];
  }
  canSummon(enemy: Enemy, id: AttackId) {
    const state = this.state(enemy), living = this.game.enemies.filter(e => !e.dead && e.summoned);
    if (living.length >= 8 || living.filter(e => e.owner === enemy.id).length >= (id === 'clone' ? 1 : 2)) return false;
    if (id === 'summonMinions' && this.game.enemies.filter(e => e.owner === enemy.id && (!e.dead || !e.redeemed)).length >= 2) return false;
    if (id === 'revive') return !!this.revivalTarget(enemy);
    if (id === 'clone') return !state.cloned && enemy.hp <= enemy.maxHp * .5;
    return true;
  }
  explosionTarget(enemy: Enemy) {
    return this.game.enemies.find(corpse => corpse.dead && !corpse.boss && !corpse.redeemed && (!corpse.summoned || corpse.corpseExplosionSource && corpse.owner === enemy.id) && corpse.actor.group.position.distanceTo(enemy.actor.group.position) < 12 && this.lineOfSight(enemy.actor.group.position, corpse.actor.group.position));
  }
  selectAttack(enemy: Enemy, distance: number, visible: boolean): AttackId | undefined {
    const state = this.state(enemy), attacks = enemy.definition?.attacks ?? ['strike'];
    const available = attacks.filter(id => {
      const spec = this.attackSpec(enemy, id);
      if ((state.abilities[id] ?? 0) > 0) return false;
      if (id === 'corpseExplosion' && !this.explosionTarget(enemy)) return false;
      if (spec.shape === 'revive') return this.canSummon(enemy, id);
      if (spec.shape === 'support') return visible && this.supportTargets(enemy).some(ally => !this.rallyBoost(ally) || ally.hp < ally.maxHp * .65 && !ally.poison && !ally.preventHeal);
      if (['imp', 'nihlathak'].includes(enemy.definition?.id ?? '') && id === 'bossTeleport' && (distance > 3.8 || enemy.summoned)) return false;
      if (!visible || distance > spec.range) return false;
      if (spec.move && distance < 3.5) return false;
      if (spec.shape === 'nova' && distance > spec.range * .7) return false;
      return spec.shape !== 'summon' || this.canSummon(enemy, id);
    });
    // Support and phase abilities must not wait for an unrelated melee attack.
    if (available.includes('corpseExplosion')) return 'corpseExplosion';
    if (available.includes('revive')) return 'revive';
    if (available.includes('clone')) return 'clone';
    if (available.includes('rally')) return 'rally';
    if (['imp', 'nihlathak'].includes(enemy.definition?.id ?? '') && available.includes('bossTeleport')) return 'bossTeleport';
    if (enemy.definition?.id === 'duriel' && distance < 2.6) {
      // Weighted, reproducible rotation: three jabs, two smites and one strike.
      const preferred: AttackId = ['jab', 'smite', 'jab', 'strike', 'jab', 'smite'][state.sequence % 6] as AttackId;
      if (available.includes(preferred)) return preferred;
    }
    const melee = available.find(id => ATTACKS[id].shape === 'melee');
    if (melee && (state.lastAttack !== melee || available.length === 1)) return melee;
    if (distance > 4 && available.includes('charge')) return 'charge';
    const different = available.filter(id => id !== state.lastAttack);
    const choices = different.length ? different : available;
    return choices[state.sequence % Math.max(1, choices.length)];
  }
  canMove(from: THREE.Vector3, to: THREE.Vector3) {
    return this.game.world.canWalk ? this.game.world.canWalk(from, to) : this.lineOfSight(from, to);
  }
  startPhase(enemy: Enemy, destination: THREE.Vector3) {
    if (enemy.definition?.id !== 'ghost' || enemy.summoned || enemy.converted > 0 || enemy.stunned > 0) return false;
    const from = enemy.actor.group.position.clone(), direction = destination.clone().sub(from).setY(0), distance = direction.length();
    if (!this.walkable(from) || distance < 1) return false;
    direction.normalize(); let crossed = false;
    // Only cross a short obstruction with a verified free exit. Never chase
    // through the map boundary or finish inside collision geometry.
    for (let d = .25; d <= Math.min(6, distance); d += .25) {
      const point = from.clone().addScaledVector(direction, d);
      const grid = this.game.world.grid, x = Math.round(point.x) + Math.floor(grid.width / 2), z = Math.round(point.z) + Math.floor(grid.height / 2);
      if (x < 1 || z < 1 || x >= grid.width - 1 || z >= grid.height - 1) return false;
      if (!this.walkable(point)) { crossed = true; continue; }
      if (crossed && [[.5, 0], [-.5, 0], [0, .5], [0, -.5]].every(([dx, dz]) => this.walkable({ x: point.x + dx, z: point.z + dz }))) {
        this.state(enemy).phase = { from, to: point, progress: 0 }; enemy.body.collisionResponse = false;
        enemy.path = []; enemy.body.velocity.set(0, 0, 0); return true;
      }
    }
    return false;
  }
  endPhase(enemy: Enemy, abort = false) {
    const state = this.states.get(enemy.id), phase = state?.phase; if (!phase) return;
    const point = abort ? phase.from : phase.to;
    enemy.actor.group.position.copy(point); enemy.body.position.set(point.x, enemy.body.position.y, point.z);
    enemy.body.velocity.set(0, 0, 0); enemy.body.collisionResponse = true; enemy.rethink = 0; state!.phase = undefined;
  }
  moveAway(enemy: Enemy, target: THREE.Vector3, dt: number, sideways = false) {
    const p = enemy.actor.group.position, away = p.clone().sub(target).setY(0);
    if (!away.lengthSq()) away.set(1,0,0);
    const angle = Math.atan2(away.x, away.z), side = enemy.id % 2 ? 1 : -1;
    const speed = enemy.speed * this.game.combat.slow(enemy);
    for (const turn of sideways ? [side*1.1,0,-side*1.1] : [0,side*.7,-side*.7,side*1.3,-side*1.3]) {
      const direction = new THREE.Vector3(Math.sin(angle+turn),0,Math.cos(angle+turn));
      const next = p.clone().addScaledVector(direction, Math.max(.8, speed*dt));
      if (!this.canMove(p,next)) continue;
      enemy.body.velocity.set(direction.x*speed,0,direction.z*speed); enemy.path = []; enemy.rethink = 0;
      return speed > 0;
    }
    enemy.body.velocity.set(0,0,0); return false;
  }
  onHit(enemy: Enemy) {
    enemy.actor.group.userData.hitFlash=1;
    const state = this.state(enemy);
    if ((!enemy.definition?.retaliation && !hasMonsterAffix(enemy, 'lightningEnchanted')) || enemy.dead || enemy.converted > 0 || state.retaliation > 0) return;
    state.retaliation = enemy.definition?.retaliation ? [1.8, 1.3, .9][this.game.hero.difficultyLevel] : 2.2;
    // Enchanted retaliation can wind up alongside a normal cast without cancelling it.
    const enchanted = hasMonsterAffix(enemy, 'lightningEnchanted');
    const spec: AttackSpec = { ...ATTACKS.lightning, name: enchanted ? '受击充能弹' : '闪电', shape: 'nova', count: enchanted ? 8 : 6, damage: .45, windup: .65, speed: 5, triggered: true };
    if (!state.cast) this.startCast(enemy, 'lightning', spec);
    else { const origin = enemy.actor.group.position.clone(); this.triggeredCasts.push({ source: enemy, cast: { id: 'lightning', spec, origin, target: origin.clone(), left: spec.windup, mesh: this.warning(spec, origin, origin) } }); }
  }
  warning(spec: AttackSpec, origin: THREE.Vector3, target: THREE.Vector3) {
    const line = spec.shape === 'line' || spec.shape === 'wall' || spec.shape === 'bolt' || spec.shape === 'fan';
    const length = origin.distanceTo(target), radius = spec.shape === 'nova' ? 1.5 : spec.radius;
    const mesh = new THREE.Mesh(line ? new THREE.PlaneGeometry(spec.shape === 'fan' ? 1.5 : spec.radius * 2, Math.max(.2, length)) : new THREE.RingGeometry(Math.max(.1, radius - .08), radius, 40), new THREE.MeshBasicMaterial({ color: spec.color ?? ELEMENT_COLORS[spec.type], transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(line ? origin.clone().lerp(target, .5) : spec.shape === 'pool' || spec.shape === 'summon' || spec.shape === 'revive' ? target : origin).setY(.12);
    if (line) mesh.rotation.z = Math.atan2(target.x - origin.x, target.z - origin.z);
    this.game.world.scene.add(mesh); return mesh;
  }
  startCast(enemy: Enemy, id: AttackId, override?: AttackSpec) {
    const summon=this.game.combat.specialItems?.taunts.has(enemy) ? undefined : this.game.combat.classes?.target(enemy);
    const spec = override ?? this.attackSpec(enemy, id), origin = enemy.actor.group.position.clone(), target = (summon?.actor.group.position??this.game.position).clone();
    const corpse = id === 'revive' ? this.revivalTarget(enemy) : id === 'corpseExplosion' ? this.explosionTarget(enemy) : undefined;
    if (id === 'corpseExplosion') { if (!corpse) return; target.copy(corpse.actor.group.position); corpse.redeemed = true; }
    if (id === 'revive') { if (!corpse) return; target.copy(corpse.actor.group.position); }
    if (id === 'brood' || id === 'rally') target.copy(origin);
    if (spec.shape === 'wall') {
      const direction = target.clone().sub(origin).normalize(), across = new THREE.Vector3(direction.z,0,-direction.x);
      if (!across.lengthSq()) across.set(1,0,0);
      const center = target.clone(); origin.copy(center);
      for (let d=.2;d<=2.6;d+=.2) { const next=center.clone().addScaledVector(across,-d); if (!this.lineOfSight(center,next)) break; origin.copy(next); }
      for (let d=.2;d<=2.6;d+=.2) { const next=center.clone().addScaledVector(across,d); if (!this.lineOfSight(center,next)) break; target.copy(next); }
    }
    if (spec.shape === 'melee' || spec.shape === 'nova') target.copy(origin);
    if (spec.shape === 'line') {
      const dir = target.clone().sub(origin).normalize();
      target.copy(origin);
      // The warning ends at the first wall and is also the actual attack endpoint.
      for (let d = .2; d <= spec.range; d += .2) { const next = origin.clone().addScaledVector(dir,d); if (!this.lineOfSight(origin,next)) break; target.copy(next); }
    }
    this.state(enemy).cast = { id, spec, origin, target, summon, corpse, left: spec.windup, mesh: this.warning(spec, origin, target) };
    enemy.actor.group.userData.attackShape=spec.shape;
    enemy.attackTime = 1; enemy.body.velocity.set(0, 0, 0);
  }
  hit(source: Enemy, spec: AttackSpec) {
    const g = this.game; if (g.invincible > 0 || g.dead || source.converted > 0) return;
    const accepted = g.combat.hurt(source.damage * spec.damage, spec.type, source, false, spec.shape !== 'melee', spec);
    if (g.dead || accepted === false) return;
    if (spec.status === 'curse') g.hero.curse = Math.max(g.hero.curse, curseDuration(g.hero, 5));
    if (spec.status === 'mana') g.hero.mana = Math.max(0, g.hero.mana * (1 - (spec.manaDrain ?? .25)));
    if (spec.status === 'stun') g.combat.recover(.45);
    if (spec.status === 'bloodMana') { const s = stats(g.hero); this.debuffs[s.maxMana >= s.maxHp ? 'bloodMana' : 'defense'] = curseDuration(g.hero, 6); }
    if (spec.status === 'decrepify') this.debuffs.decrepify = curseDuration(g.hero, 5);
    if (spec.knockback) {
      const point = g.position.clone().addScaledVector(g.position.clone().sub(source.actor.group.position).normalize(), spec.knockback);
      if (this.canMove(g.position, point)) { g.body.position.set(point.x, g.body.position.y, point.z); g.position.copy(point); }
    }
  }
  fire(enemy: Enemy, spec: AttackSpec, origin: THREE.Vector3, direction: THREE.Vector3, volley = { hit: false }) {
    if (this.missiles.length >= 100) return;
    const mesh = createProjectileVisual(spec.type,spec.type==='physical'?'arrow':'bolt',Math.min(.3,spec.radius),this.game.projectileVisuals);
    mesh.position.copy(origin).setY(.8);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.game.world.scene.add(mesh); this.missiles.push({ source: enemy, spec, mesh, velocity: direction.clone().multiplyScalar(spec.speed ?? 7), life: spec.range / (spec.speed ?? 7) + .5, volley });
  }
  resolve(enemy: Enemy, cast: Cast) {
    enemy.actor.group.userData.release=1;
    const g = this.game, { spec, id, origin, target } = cast;
    g.audio.play(spec.shape === 'melee' ? 'swing' : spec.type === 'physical' ? 'shot' : castSound(id, spec.type), { position: origin, gain: enemy.boss ? .95 : .65, nativeKey: `cast:${id}` });
    if (spec.shape === 'melee') {
      for (let i = 1; i < (spec.count ?? 1); i++) this.meleeCasts.push({ source: enemy, cast: { ...cast, spec: { ...spec, count: 1 }, left: i * .32, mesh: this.warning(spec, origin, target) } });
      const point=cast.summon?.actor.group.position??g.position;
      if (point.distanceTo(enemy.actor.group.position) <= spec.radius && this.lineOfSight(enemy.actor.group.position, point)) {
        if(cast.summon){if(cast.summon.hp>0)this.hurtAlly(cast.summon,enemy,spec);}else this.hit(enemy,spec);
        if (id === 'frenzy') this.state(enemy).frenzy = 5;
      }
    } else if (['bolt', 'fan', 'nova'].includes(spec.shape)) {
      const count = Math.min(54, (spec.count ?? 1) * (!spec.triggered && spec.shape !== 'nova' && hasMonsterAffix(enemy, 'multishot') ? 3 : 1)), angle = Math.atan2(target.x - origin.x, target.z - origin.z);
      const volley = { hit: false };
      for (let i = 0; i < count; i++) {
        const a = spec.shape === 'nova' ? i * Math.PI * 2 / count : angle + (i - (count - 1) / 2) * .17;
        this.fire(enemy, spec, origin, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), volley);
      }
    } else if (spec.shape === 'pool' || spec.shape === 'line' || spec.shape === 'wall') {
      if (this.hazards.length >= 24) return;
      const line = spec.shape !== 'pool', material = new THREE.MeshBasicMaterial({ color: spec.color ?? ELEMENT_COLORS[spec.type], transparent: true, opacity: .48, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(line ? new THREE.PlaneGeometry(spec.radius * 2, origin.distanceTo(target)) : new THREE.CircleGeometry(spec.radius, 32), material);
      mesh.position.copy(line ? origin.clone().lerp(target, .5) : target).setY(.13); mesh.rotation.x = -Math.PI / 2;
      if (line) mesh.rotation.z = Math.atan2(target.x - origin.x, target.z - origin.z);
      g.world.scene.add(mesh);
      decorateGround(mesh,spec.type,spec.radius,line?'line':'pool',origin.distanceTo(target));
      if (enemy.definition?.id === 'soul' && spec.type === 'lightning' && spec.shape === 'line') {
        const half = origin.distanceTo(target) / 2;
        mesh.add(createLightning(new THREE.Vector3(0, -half, .65), new THREE.Vector3(0, half, .65)));
      }
      this.hazards.push({ source: enemy, spec, mesh, origin, target, life: spec.duration ?? 1, tick: 0, hit: false, moving: !!spec.move });
    } else if (spec.shape === 'support') {
      if (!enemy.active || enemy.dead || enemy.converted > 0) return;
      for (const ally of this.supportTargets(enemy)) {
        if (!ally.poison && !ally.preventHeal) ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * .08);
        this.rallied.set(ally.id, { source: enemy, until: g.time + 5 });
        g.burst?.(ally.actor.group.position, 0xf2b956, 8);
      }
    } else if (spec.shape === 'teleport') this.teleport(enemy, hasMonsterAffix(enemy, 'teleportation') && !['baal', 'imp'].includes(enemy.definition?.id ?? ''));
    else if (spec.shape === 'prison') {
      if (g.enemies.filter(e => !e.dead && e.summoned).length > 4) return;
      const points = Array.from({ length: 4 }, (_, i) => target.clone().add(new THREE.Vector3(Math.sin(i * Math.PI / 2) * 1.8, 0, Math.cos(i * Math.PI / 2) * 1.8)));
      if (points.some(p => !this.walkable(p) || !this.lineOfSight(target, p))) return;
      const guards = points.map(p => {
        const guard = g.spawnEnemy(p.x, p.z, 'skeleton', { ...MONSTERS.skeleton, speed: 0, attacks: [], scale: 1.4 });
        guard.name = '骨牢 · 击碎任一骨柱脱困'; guard.summoned = true; guard.owner = enemy.id; guard.hp = guard.maxHp = Math.max(12, enemy.maxHp * .004); guard.damage = 0;
        this.state(guard).lifetime = spec.duration ?? 5; return guard;
      });
      this.prisons.push({ source: enemy, center: target.clone(), guards });
    } else this.summon(enemy, id, target, cast.corpse);
  }
  summon(enemy: Enemy, id: AttackId, target: THREE.Vector3, selectedCorpse?: Enemy) {
    const g = this.game, state = this.state(enemy);
    if (id === 'summonMinions' && !this.canSummon(enemy, id)) return;
    if (g.enemies.filter(e => !e.dead && e.summoned).length >= 8 || g.enemies.filter(e => !e.dead && e.owner === enemy.id).length >= (id === 'clone' ? 1 : 2)) return;
    let definition = MONSTERS.viper, name = '腐化触须', position = target.clone(), corpse: Enemy | undefined;
    if (id === 'revive') {
      corpse = selectedCorpse ?? this.revivalTarget(enemy);
      if (corpse && (corpse.redeemed || corpse.elite || corpse.champion || corpse.boss || !corpse.dead || corpse.summoned || corpse.definition?.id !== enemy.definition?.revive || corpse.actor.group.position.distanceTo(enemy.actor.group.position)>=9)) return;
      if (!corpse || state.summons >= 3) return;
      definition = corpse.definition!; name = corpse.name; position.copy(corpse.actor.group.position);
    } else if (id === 'clone') {
      if (state.cloned || enemy.hp > enemy.maxHp * .5) return;
      definition = { ...enemy.definition!, attacks: ['coldWave', 'skull'], scale: enemy.definition!.scale * .85 }; name = '巴尔的幻象'; position.copy(enemy.actor.group.position).add(new THREE.Vector3(2, 0, 0));
    } else if (id === 'hydra') { definition = { ...MONSTERS.viper, color: 0xd6935d, attacks: ['fireball'] }; name = '多头火蛇'; }
    else if (id === 'summonMinions') { definition = MONSTERS.minion; name = '尼拉塞克的仆从'; position.copy(enemy.actor.group.position); }
    else if (id === 'brood') { definition = { ...(enemy.definition?.id === 'spawner' ? MONSTERS.spawner : MONSTERS.maggot), attacks: ['strike'], scale: .55, speed: 2.5 }; name = enemy.definition?.id === 'spawner' ? '血肉幼兽' : '沙虫幼体'; position.copy(enemy.actor.group.position); }
    else definition = { ...definition, attacks: ['strike'] };
    const candidates = id === 'revive' ? [position] : Array.from({ length: 8 }, (_, i) => position.clone().add(new THREE.Vector3(Math.sin(i * Math.PI / 4) * 2, 0, Math.cos(i * Math.PI / 4) * 2)));
    const point = candidates.find(p => this.walkable(p) && this.lineOfSight(enemy.actor.group.position, p)); if (!point) return;
    if (corpse) { corpse.redeemed = true; corpse.actor.group.visible = false; }
    if (id === 'clone') state.cloned = true;
    const add = g.spawnEnemy(point.x, point.z, 'demon', definition); add.name = name; add.summoned = true; add.owner = enemy.id; add.active = true; add.corpseExplosionSource = id === 'summonMinions';
    add.maxHp = add.hp = enemy.maxHp * (id === 'clone' ? .18 : .12); add.damage = enemy.damage * .4;
    if (enemy.boss) add.attackRating = Math.round(baseMonsterAttackRating(definition, add.level, g.hero.difficultyLevel, add.playerCount ?? g.hero.playerCount));
    if (id === 'hydra' || id === 'tentacles') add.speed = 0;
    this.state(add).lifetime = id === 'clone' ? 16 : 12; state.summons++;
  }
  updateEnemy(enemy: Enemy, dt: number) {
    const g = this.game, state = this.state(enemy), p = enemy.actor.group.position, taunted = g.combat.specialItems?.taunts.has(enemy), targetPoint=taunted ? g.position : g.combat.classes?.target(enemy)?.actor.group.position??g.position, distance = p.distanceTo(targetPoint), ai = DIFFICULTY_AI[g.hero.difficultyLevel];
    const auraRing = enemy.actor.group.getObjectByName('monster-aura'); if (auraRing) auraRing.visible = enemy.active && enemy.converted <= 0;
    enemy.actor.group.userData.hitFlash=Math.max(0,(enemy.actor.group.userData.hitFlash??0)-dt*7);
    enemy.actor.group.userData.release=Math.max(0,(enemy.actor.group.userData.release??0)-dt*5);
    state.retaliation = Math.max(0, state.retaliation - dt); state.frenzy = Math.max(0, state.frenzy - dt);
    state.teleportCooldown = Math.max(0, (state.teleportCooldown ?? 0) - dt);
    state.retreat = Math.max(0,state.retreat-dt); state.retreatCooldown = Math.max(0,state.retreatCooldown-dt);
    for (const id of Object.keys(state.abilities) as AttackId[]) state.abilities[id] = Math.max(0,state.abilities[id]!-dt);
    enemy.blind = Math.max(0, (enemy.blind ?? 0) - dt); enemy.flee = Math.max(0, (enemy.flee ?? 0) - dt);
    if (state.phase) {
      state.memory = Math.max(0, state.memory - dt);
      if (enemy.stunned > 0 || enemy.converted > 0 || !enemy.active || !state.memory) this.endPhase(enemy, true);
      else {
        const phase = state.phase; phase.progress = Math.min(1, phase.progress + dt * enemy.speed * ai.pursuit * g.combat.slow(enemy) / phase.from.distanceTo(phase.to));
        const point = phase.from.clone().lerp(phase.to, phase.progress);
        enemy.actor.group.position.copy(point); enemy.body.position.set(point.x, enemy.body.position.y, point.z); enemy.body.velocity.set(0,0,0);
        if (phase.progress >= 1) this.endPhase(enemy);
        animateActor(enemy.actor,g.time+enemy.id,true,0);
      }
      return;
    }
    const traits = monsterTraits(enemy.definition);
    const regen = traits.regen || (enemy.definition?.model === 'council' ? .01 : 0);
    if (enemy.active && enemy.converted <= 0 && !enemy.summoned && !enemy.preventHeal && !enemy.poison && regen) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * regen * dt);
    if (state.lifetime !== undefined) { state.lifetime -= dt; if (state.lifetime <= 0 || g.enemies.find(e => e.id === enemy.owner)?.dead) { enemy.redeemed = true; g.killEnemy(enemy); return; } }
    const unlocked = !enemy.boss || !!g.specialArea || questComplete(g.hero.campaign), visible = distance < ai.sightRange && this.lineOfSight(p,targetPoint), engageRange = ai.engageRange * traits.awareness;
    if (g.started && unlocked && visible && (distance < engageRange || enemy.active)) {
      enemy.active = true; state.lastSeen = targetPoint.clone(); state.memory = ai.memory;
      if (!state.alerted) {
        state.alerted = true;
        for (const ally of g.enemies) {
          if (ally === enemy || ally.dead || ally.boss || ally.converted > 0 || ally.active || ally.pack !== enemy.pack || enemy.pack === undefined) continue;
          if (ally.actor.group.position.distanceTo(p) < ai.alertRange && this.lineOfSight(p,ally.actor.group.position)) {
            ally.active = true; const friend = this.state(ally); friend.lastSeen = targetPoint.clone(); friend.memory = ai.memory; friend.alerted = true;
          }
        }
      }
    } else state.memory = Math.max(0,state.memory-dt);
    if (!unlocked || distance > ai.leash || !visible && state.memory <= 0) { enemy.active = false; state.alerted = false; }
    enemy.attackTime = Math.max(0, enemy.attackTime - dt * 2); enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.body.velocity.x *= .65; enemy.body.velocity.z *= .65;
    if (enemy.flee > 0 && !enemy.boss && enemy.stunned <= 0 && enemy.converted <= 0) {
      this.cancel(enemy);
      const moving = this.moveAway(enemy,targetPoint,dt);
      animateActor(enemy.actor, g.time + enemy.id, moving, 0); return;
    }
    if (enemy.stunned > 0 || enemy.converted > 0 || !enemy.active || enemy.blind > 0 && distance > 2.5) {
      this.cancel(enemy);
      if (enemy.stunned > 0) enemy.body.velocity.set(0, 0, 0);
      const moving = enemy.stunned <= 0 && g.combat.allyUpdate(enemy, dt); animateActor(enemy.actor, g.time + enemy.id, moving, enemy.attackTime); return;
    }
    if (taunted) {
      if (state.cast && state.cast.id !== 'strike') this.cancel(enemy);
      if (!state.cast) {
        if (distance <= 1.8 && !enemy.cooldown) this.startCast(enemy, 'strike');
        else if (distance > 1.8 && enemy.speed > 0) {
          enemy.rethink -= dt;
          if (enemy.rethink <= 0) { enemy.path = g.world.path(p, g.position); enemy.rethink = .5; }
          const next = enemy.path[0];
          if (next) { const direction = next.clone().sub(p).setY(0).normalize(); const speed = enemy.speed * g.combat.slow(enemy); if (this.canMove(p, p.clone().addScaledVector(direction, speed * dt))) enemy.body.velocity.set(direction.x * speed, 0, direction.z * speed); if (p.distanceTo(next) < .3) enemy.path.shift(); }
        }
        animateActor(enemy.actor, g.time + enemy.id, distance > 1.8, enemy.attackTime); return;
      }
    }
    const aura = this.aura(enemy);
    if (aura) {
      let ring = enemy.actor.group.getObjectByName('monster-aura');
      if (!ring) { ring = makeRing(1.2, aura === 'holyFreeze' ? 0x80cfff : aura === 'conviction' ? 0xad73dd : 0xffc15a, .7); ring.name = 'monster-aura'; ring.position.y = .1; enemy.actor.group.add(ring); }
      ring.rotation.z += dt; state.auraTick = (state.auraTick ?? 1) - dt;
      if (state.auraTick <= 0) {
        state.auraTick = 2;
        const type = aura === 'holyFire' ? 'fire' : aura === 'holyFreeze' ? 'cold' : aura === 'holyShock' ? 'lightning' : undefined;
        if (type) { const spec: AttackSpec = { ...ATTACKS.coldNova, name: '灵气脉冲', shape: 'pool', type, damage: .18, triggered: true };
          if (p.distanceTo(g.position) < 7 && this.lineOfSight(p, g.position)) this.hit(enemy, spec);
          for (const ally of g.combat.classes?.allies() ?? []) if (ally.hp > 0 && p.distanceTo(ally.actor.group.position) < 7 && this.lineOfSight(p, ally.actor.group.position)) this.hurtAlly(ally, enemy, spec, true);
        }
      }
    }
    if (!state.cast && !enemy.cooldown && !state.teleportCooldown && enemy.hp < enemy.maxHp * .3 && hasMonsterAffix(enemy, 'teleportation')) {
      state.teleportCooldown = 10; this.startCast(enemy, 'bossTeleport'); return;
    }
    const dash = this.hazards.find(h => h.source === enemy && h.moving);
    if (dash) {
      const direction = dash.target.clone().sub(p), remaining = direction.length(); direction.normalize();
      const next = p.clone().addScaledVector(direction, Math.min(remaining, dt * 10));
      if (remaining < .4 || !this.canMove(p, next)) { dash.life = 0; enemy.body.velocity.set(0, 0, 0); animateActor(enemy.actor,g.time+enemy.id,false,0); return; }
      else enemy.body.velocity.set(direction.x * 10, 0, direction.z * 10);
      const summon=g.combat.classes?.allies().find(s=>s.id!=='hydra'&&s.hp>0&&segmentDistance(s.actor.group.position,p,next)<dash.spec.radius+.3);
      if(!dash.hit&&summon){this.hurtAlly(summon,enemy,dash.spec);dash.hit=true;}
      if (!dash.hit && segmentDistance(g.position, p, next) < dash.spec.radius + .3) { this.hit(enemy, dash.spec); dash.hit = true; }
      animateActor(enemy.actor, g.time + enemy.id, true, .6); return;
    }
    if (state.cast) {
      state.cast.left -= dt; enemy.body.velocity.set(0, 0, 0); enemy.attackTime = Math.max(.1, state.cast.left / state.cast.spec.windup);
      state.cast.mesh.material.opacity = .3 + .25 * Math.sin(g.time * 12) ** 2;
      if (state.cast.left <= 0) {
        const cast = state.cast; state.cast = undefined; g.disposeObject(cast.mesh); this.resolve(enemy, cast);
        state.lastAttack = cast.id;
        state.abilities[cast.id] = cast.spec.cooldown * traits.cooldown * ai.cooldownMultiplier / g.combat.slow(enemy) / (state.frenzy > 0 ? 1.25 : 1) / this.attackRate(enemy);
        // Strong attacks have their own cooldown; a short recovery allows other tactics between them.
        enemy.cooldown = Math.min(state.abilities[cast.id]!, (enemy.boss ? 2 : 1.5) * traits.cooldown * ai.recoveryMultiplier);
      }
      animateActor(enemy.actor, g.time + enemy.id, false, enemy.attackTime); return;
    }
    // Breath/beam attacks are channeled: the caster cannot walk away from the visible beam.
    if (this.hazards.some(h => h.source === enemy && !h.moving && h.spec.shape === 'line' && h.life > 0)) {
      enemy.body.velocity.set(0,0,0); animateActor(enemy.actor,g.time+enemy.id,false,.5); return;
    }
    enemy.actor.group.rotation.y = Math.atan2(targetPoint.x - p.x, targetPoint.z - p.z);
    const attacks = enemy.definition?.attacks ?? ['strike'];
    const tactic = monsterTactic(enemy.definition), ranged = ['ranged','support','caster','skirmisher','brood'].includes(tactic);
    const selected = this.selectAttack(enemy,distance,visible);
    // Bounded retreats leave attack windows; corners cause a stand-and-fight response.
    if ((ranged || enemy.definition?.id === 'spider' && enemy.hp < enemy.maxHp * .35) && enemy.speed > 0 && visible && distance < (tactic==='skirmisher'?3:3.8) && !state.retreatCooldown && selected !== 'revive' && selected !== 'bossTeleport') {
      state.retreat = enemy.boss ? .55 : .75; state.retreatCooldown = enemy.boss ? 4 : 3.2;
    }
    if (state.retreat > 0 && visible && this.moveAway(enemy,targetPoint,dt,tactic==='skirmisher')) {
      animateActor(enemy.actor,g.time+enemy.id,true,0); return;
    }
    if (!enemy.cooldown && selected) { state.sequence++; this.startCast(enemy, selected); return; }
    let moving = false;
    const attackRange = Math.max(...attacks.filter(id=>!['revive','support','teleport'].includes(this.attackSpec(enemy,id).shape)).map(id=>this.attackSpec(enemy,id).range),1.8);
    const preferred = ranged ? Math.min(traits.preferredRange ?? 7,attackRange*.85) : 1.5;
    const destination = visible ? targetPoint : state.lastSeen;
    if (enemy.speed > 0 && destination && (!visible || distance > preferred)) {
      if (!visible && state.memory > 0 && this.startPhase(enemy, destination)) return;
      enemy.rethink -= dt;
      if (enemy.rethink <= 0) { enemy.path = g.world.path(p, destination); enemy.rethink = (.65 + enemy.id%3*.1) / ai.pursuit; }
      const point = enemy.path[0];
      if (point) { const direction = point.clone().sub(p), d = direction.length(); if (d < .3) enemy.path.shift(); else {
        direction.normalize(); const speed = enemy.speed * ai.pursuit * g.combat.slow(enemy) * (state.frenzy > 0 ? 1.25 : 1) * (this.rallyBoost(enemy) ? 1.15 : 1);
        if (this.canMove(p,p.clone().addScaledVector(direction,Math.min(d,speed*dt)))) { enemy.body.velocity.set(direction.x * speed, 0, direction.z * speed); moving = speed > 0; }
        else { enemy.path = []; enemy.rethink = 0; }
      } }
    }
    if (!moving) enemy.body.velocity.set(0,0,0);
    animateActor(enemy.actor, g.time + enemy.id, moving, enemy.attackTime);
  }
  update(dt: number) {
    const g = this.game;
    for (const key of Object.keys(this.debuffs) as (keyof typeof this.debuffs)[]) this.debuffs[key] = g.inCamp || g.dead ? 0 : Math.max(0, this.debuffs[key] - dt);
    this.prisons = this.prisons.filter(p => !p.source.dead && p.guards.every(e => !e.dead));
    for (let i = this.meleeCasts.length - 1; i >= 0; i--) {
      const entry = this.meleeCasts[i]; entry.cast.left -= dt;
      const cancelled = entry.source.dead || entry.source.stunned > 0 || entry.source.converted > 0 || !entry.source.active;
      if (cancelled || entry.cast.left <= 0) { g.disposeObject(entry.cast.mesh); if (!cancelled) this.resolve(entry.source, entry.cast); this.meleeCasts.splice(i, 1); }
    }
    for (let i = this.triggeredCasts.length - 1; i >= 0; i--) {
      const entry = this.triggeredCasts[i]; entry.cast.left -= dt;
      const cancelled = !entry.cast.spec.afterDeath && (entry.source.dead || entry.source.converted > 0);
      if (cancelled || entry.cast.left <= 0) { g.disposeObject(entry.cast.mesh); if (!cancelled) this.resolve(entry.source, entry.cast); this.triggeredCasts.splice(i, 1); }
    }
    for (const [id, buff] of this.rallied) if (buff.until <= g.time || buff.source.dead || buff.source.converted > 0) this.rallied.delete(id);
    for (const enemy of g.enemies) if (!enemy.dead) this.updateEnemy(enemy, dt); else this.cancel(enemy);
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], previous = m.mesh.position.clone(), speed=g.combat.classes?.missileSpeed(m.source)??1; m.life -= dt*speed; m.mesh.position.addScaledVector(m.velocity, dt*speed);
      updateVisual(m.mesh,g.time);
      const blocked = !this.lineOfSight(previous, m.mesh.position), cancelled = m.source.dead && !m.spec.afterDeath || m.source.converted > 0;
      const heroHit=segmentDistance(g.position,previous,m.mesh.position)<m.spec.radius+.32;
      const summon=g.combat.classes?.allies().filter(s=>s.id!=='hydra'&&s.hp>0&&segmentDistance(s.actor.group.position,previous,m.mesh.position)<m.spec.radius+.32&&(!heroHit||s.actor.group.position.distanceToSquared(previous)<g.position.distanceToSquared(previous))).sort((a,b)=>a.actor.group.position.distanceToSquared(previous)-b.actor.group.position.distanceToSquared(previous))[0];
      if(!cancelled&&!blocked&&summon){m.volley.summons??=new Set();if(!m.volley.summons.has(summon)){this.hurtAlly(summon,m.source,m.spec,true);m.volley.summons.add(summon);}m.life=0;}
      else if (!cancelled && !blocked && heroHit) {
        // One volley can hit once even if its other missiles arrive in later frames.
        if (!m.volley.hit) this.hit(m.source, m.spec);
        m.volley.hit = true; m.life = 0;
      }
      if (m.life <= 0 || blocked || cancelled) { g.disposeObject(m.mesh); this.missiles.splice(i, 1); }
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.life -= dt; h.tick -= dt;
      updateVisual(h.mesh,g.time,Math.min(1,h.life*3));
      if (h.life <= 0 || h.source.dead && !h.spec.afterDeath || h.source.converted > 0) { g.disposeObject(h.mesh); this.hazards.splice(i, 1); continue; }
      if (h.moving || h.tick > 0) continue;
      h.tick = .65;
      const inside = h.spec.shape !== 'pool' ? segmentDistance(g.position, h.origin, h.target) <= h.spec.radius + .3 : g.position.distanceTo(h.target) < h.spec.radius + .25;
      if (inside && this.lineOfSight(h.origin, g.position)) this.hit(h.source, h.spec);
      for(const summon of g.combat.classes?.allies()??[]) {const point=summon.actor.group.position;if(summon.id!=='hydra'&&summon.hp>0&&(h.spec.shape!=='pool'?segmentDistance(point,h.origin,h.target)<=h.spec.radius+.3:point.distanceTo(h.target)<h.spec.radius+.25)&&this.lineOfSight(h.origin,point))this.hurtAlly(summon,h.source,h.spec,true);}
    }
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const enemy = g.enemies[i];
      if (enemy.dead && enemy.summoned) {
        const state = this.state(enemy);
        if (enemy.corpseExplosionSource && !enemy.redeemed && g.enemies.some(owner => owner.id === enemy.owner && !owner.dead)) {
          state.corpseLife = (state.corpseLife ?? 12) - dt;
          if (state.corpseLife > 0) continue;
        }
        enemy.redeemed = true; this.states.delete(enemy.id); g.disposeObject(enemy.actor.group); g.enemies.splice(i, 1);
      }
    }
  }
}
