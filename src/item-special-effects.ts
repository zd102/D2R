import * as THREE from 'three';
import type { Enemy } from './game.ts';
import type { PaladinCombat, AttackSnapshot } from './combat.ts';
import { skillValues } from './paladin.ts';
import { clearShot } from './ranged.ts';
import { decorateGround, updateVisual } from './visual-effects.ts';

export const controllableMonster = (enemy: Enemy) => !enemy.boss && !enemy.elite && !enemy.champion && !['oblivionKnight', 'putridDefiler'].includes(enemy.definition?.id ?? '');
export function curseDuration(hero: { buffs: { fade?: { rank: number } } }, seconds: number) {
  return seconds * (1 - (hero.buffs.fade ? skillValues('fade', hero.buffs.fade.rank).secondary : 0) / 100);
}

type Patch = { mesh: THREE.Object3D; point: THREE.Vector3; life: number; tick: number; physical: number; fire: number; radius: number; snapshot: AttackSnapshot; fissure?: number };
type Stream = { point: THREE.Vector3; direction: THREE.Vector3; life: number; tick: number; rank: number; snapshot: AttackSnapshot };
type Fissure = { point: THREE.Vector3; life: number; tick: number; rank: number; snapshot: AttackSnapshot; id: number };

// These skills use persistent ground collisions, not a single instant area hit.
export class ItemSpecialEffects {
  patches: Patch[] = [];
  streams: Stream[] = [];
  fissures: Fissure[] = [];
  taunts = new WeakMap<Enemy, number>();
  reanimations = new WeakSet<Enemy>();
  conversions = new Map<Enemy, { level: number; maxHp: number }>();
  private nextFissure = 0;
  private nextHit = new WeakMap<Enemy, Map<number, number>>();
  private time = 0;
  private accumulator = 0;
  readonly combat: PaladinCombat;
  constructor(combat: PaladinCombat) { this.combat = combat; }
  get game() { return this.combat.game; }
  convert(enemy: Enemy, duration: number) {
    if (enemy.level > this.game.hero.level && !this.conversions.has(enemy)) {
      this.conversions.set(enemy, { level: enemy.level, maxHp: enemy.maxHp });
      const scale = this.game.hero.level / enemy.level;
      enemy.level = this.game.hero.level; enemy.maxHp = Math.max(1, enemy.maxHp * scale); enemy.hp = Math.max(1, enemy.hp * scale);
    }
    enemy.converted = duration;
  }
  restoreConversions() {
    for (const [enemy, original] of this.conversions) if (enemy.converted <= 0 || enemy.dead) {
      const fraction = enemy.hp / enemy.maxHp;
      enemy.level = original.level; enemy.maxHp = original.maxHp; enemy.hp = fraction * enemy.maxHp;
      this.conversions.delete(enemy);
    }
  }
  armReanimation(enemy: Enemy, snapshot = this.combat.snapshot()) {
    const chance = snapshot.stats.mods.reanimateReturned ?? 0;
    if (chance > 0 && controllableMonster(enemy) && !enemy.summoned && this.combat.itemRandom() * 100 < chance) this.reanimations.add(enemy);
  }
  reanimate(enemy: Enemy) {
    if (!this.reanimations.has(enemy)) return;
    this.reanimations.delete(enemy);
    if (!this.game.dead && !enemy.redeemed && enemy.dead && controllableMonster(enemy) && !enemy.summoned) {
      if (this.combat.classes.summonReturned(enemy)) enemy.redeemed = true;
    }
  }
  cast(id: 'fissure' | 'diabloFirestorm', rank: number, point: THREE.Vector3) {
    const snapshot = this.combat.snapshot();
    if (id === 'fissure') {
      if (this.fissures.length >= 16) return;
      this.fissures.push({ point: point.clone(), life: 3.2, tick: 0, rank, snapshot, id: ++this.nextFissure });
    } else {
      const direction = point.clone().sub(snapshot.origin).setY(0).normalize();
      if (!direction.lengthSq()) direction.set(0, 0, 1);
      for (let i = 0; i < Math.min(32, rank); i++) {
        if (this.streams.length >= 64) break;
        this.streams.push({ point: snapshot.origin.clone(), direction: direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (i - (rank - 1) / 2) * .08), life: 3.2, tick: 0, rank, snapshot });
      }
    }
  }
  patch(point: THREE.Vector3, life: number, physical: number, fire: number, radius: number, snapshot: AttackSnapshot, fissure?: number) {
    if (this.patches.length >= 512) return;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), new THREE.MeshBasicMaterial());
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(point).setY(.08);
    decorateGround(mesh, 'fire', radius, fissure === undefined ? 'pool' : 'fissure');
    this.game.world.scene.add(mesh);
    this.patches.push({ mesh, point: point.clone(), life, tick: 0, physical, fire, radius, snapshot, fissure });
  }
  update(dt: number) {
    this.restoreConversions();
    // Fixed 25 Hz substeps keep trajectories and hit delays independent of frame rate.
    this.accumulator += dt;
    while (this.accumulator >= .04 - 1e-8) { this.accumulator -= .04; this.step(.04); }
  }
  private step(dt: number) {
    this.time += dt;
    for (const f of this.fissures) {
      f.life -= dt; f.tick -= dt;
      if (f.tick <= 0 && f.life > 0) {
        f.tick += 6 / 25;
        const angle = this.combat.itemRandom() * Math.PI * 2, radius = Math.sqrt(this.combat.itemRandom()) * 14 / 3;
        const point = f.point.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        if (clearShot(this.game.world.grid, f.point, point)) {
          const v = skillValues('fissure', f.rank, f.snapshot.skills);
          this.patch(point, 84 / 25, 0, v.min + this.combat.itemRandom() * (v.max - v.min), 1, f.snapshot, f.id);
        }
      }
    }
    this.fissures = this.fissures.filter(f => f.life > 0);
    for (const s of this.streams) {
      s.life -= dt; s.tick -= dt;
      s.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), (this.combat.itemRandom() - .5) * .18);
      const next = s.point.clone().addScaledVector(s.direction, dt * 6);
      if (!clearShot(this.game.world.grid, s.point, next)) { s.life = 0; continue; }
      s.point.copy(next);
      if (s.tick <= 0 && s.life > 0) {
        s.tick += .12;
        // Missiles.txt diabwall: HitShift=3, physical 4-12 +2/lvl,
        // fire 12-25 +5/lvl; per-frame damage converted to per-second.
        const n = s.rank - 1, roll = this.combat.itemRandom();
        this.patch(s.point, 36 / 25, (4 + 2 * n + 8 * roll) * 25 / 32, (12 + 5 * n + 13 * roll) * 25 / 32, .65, s.snapshot);
      }
    }
    this.streams = this.streams.filter(s => s.life > 0);
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i]; p.life -= dt; p.tick -= dt;
      if (p.life <= 0) { this.game.disposeObject(p.mesh); this.patches.splice(i, 1); continue; }
      updateVisual(p.mesh, this.time, Math.min(1, p.life * 4));
      if (p.tick > 0) continue;
      p.tick += .2;
      for (const enemy of this.combat.classes.nearby(p.point, p.radius)) {
        if (p.fissure !== undefined) {
          const times = this.nextHit.get(enemy) ?? new Map<number, number>(); this.nextHit.set(enemy, times);
          if ((times.get(p.fissure) ?? 0) > this.time) continue;
          times.set(p.fissure, this.time + 5 / 25);
          for (const [id, time] of times) if (time < this.time - 4) times.delete(id);
        }
        const scale = p.fissure === undefined ? .2 : 1;
        if (p.physical) this.combat.damage(enemy, p.physical * scale, 'physical', false, false, p.snapshot);
        this.combat.damage(enemy, p.fire * scale, 'fire', false, false, p.snapshot);
      }
    }
  }
  clear() {
    for (const enemy of this.conversions.keys()) enemy.converted = 0;
    this.restoreConversions();
    for (const patch of this.patches) this.game.disposeObject(patch.mesh);
    this.patches = []; this.streams = []; this.fissures = []; this.taunts = new WeakMap(); this.reanimations = new WeakSet(); this.nextHit = new WeakMap(); this.accumulator = 0;
  }
}
