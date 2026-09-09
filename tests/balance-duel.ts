import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PaladinCombat } from '../src/combat.ts';
import { MonsterCombat } from '../src/monster-combat.ts';
import { monsterStats } from '../src/balance.ts';
import { BOSSES, type MonsterDef } from '../src/bestiary.ts';
import { LEVELS } from '../src/campaign.ts';
import { stats, skillLevel } from '../src/model.ts';
import { createActor } from '../src/world.ts';
import { createMonsterActor } from '../src/monster-models.ts';
import { referenceHero, type ReferenceBuild } from './balance-fixtures.ts';
import type { Enemy, Game } from '../src/game.ts';

// Real combat controllers in an open arena; movement integration omits map collisions.
export function simulateDuel(level: number, difficulty: 0 | 1 | 2, index: number, build: ReferenceBuild) {
  const hero = referenceHero(level, difficulty, build); hero.campaign.current = index;
  hero.campaign.kills = LEVELS[index].quest.count; hero.campaign.objects = Array.from({ length: LEVELS[index].quest.count }, (_, i) => i);
  const scene = new THREE.Scene(), enemies: Enemy[] = [], resources = new Set<THREE.BufferGeometry | THREE.Material>(), manaCosts = { hp: 0, mana: 0 };
  const dispose = (object: THREE.Object3D) => { object.traverse(node => { if (node instanceof THREE.Mesh) { resources.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => resources.add(material)); } }); object.removeFromParent(); };
  let nextId = 1, minHp = hero.hp;
  const game: any = { hero, enemies, time: 0, started: true, paused: false, dead: false, invincible: 0, position: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 2), actor: createActor('hero'), body: new CANNON.Body({ mass: 1 }), path: [], effects: [], attackTime: 0, cooldowns: { attack: 0, cleave: 0, nova: 0, dash: 0, bolt: 0 },
    world: { scene, grid: { width: 57, height: 57, isWalkableAt: () => true }, path: (_from: THREE.Vector3, to: THREE.Vector3) => [to.clone()] }, audio: { play() {} }, ui: { floatText() {}, toast() {}, flashDamage() {}, openPanel() {} },
    burst() {}, beam() {}, save() {}, begin() {}, releaseInput() {}, disposeObject: dispose,
    nearestEnemy(range: number) { return enemies.find(enemy => !enemy.dead && enemy.converted <= 0 && enemy.actor.group.position.distanceTo(this.position) <= range); },
    killEnemy(enemy: Enemy) { enemy.dead = true; this.monsterCombat.cancel(enemy); },
  };
  const spawn = (x: number, z: number, _kind: string, definition: MonsterDef, boss = false) => {
    const actor = createMonsterActor(definition, boss), tuning = monsterStats(definition, LEVELS[index], difficulty, boss), body = new CANNON.Body({ mass: 1 });
    actor.group.position.set(x, 0, z); body.position.set(x, .5, z); scene.add(actor.group);
    const enemy = { id: nextId++, name: definition.id, definition, actor, body, ...tuning, hp: tuning.maxHp, boss, dead: false, active: true, kind: boss ? 'boss' : definition.race === 'undead' ? 'skeleton' : 'demon', speed: definition.speed, cooldown: 1, attackTime: 0, path: [], rethink: 0, stunned: 0, coldTime: 0, converted: 0, bleed: 0, redeemed: false } as Enemy;
    enemies.push(enemy); return enemy;
  };
  game.spawnEnemy = spawn; scene.add(game.actor.group);
  const combat = new PaladinCombat(game as Game), monsterCombat = new MonsterCombat(game as Game); game.combat = combat; game.monsterCombat = monsterCombat;
  const boss = spawn(0, 2, 'boss', BOSSES[index], true); game.target = boss;
  const dt = .04;
  try {
    while (game.time < 180 && !game.dead && !boss.dead) {
      game.time += dt; game.invincible = Math.max(0, game.invincible - dt); combat.update(dt);
      if (hero.skills.holyShield && hero.holyShield <= 0 && !combat.lock && !combat.zeal) combat.castAction('holyShield');
      const s = stats(hero), delta = boss.actor.group.position.clone().sub(game.position), distance = delta.length();
      // Follow the target and leave regular gaps between attacks, without invulnerability cheats.
      if (distance > 2.1 && combat.lock <= .1 && !combat.zeal) { delta.normalize(); game.position.addScaledVector(delta, Math.min(distance - 2.1, 3 * s.runSpeed * dt)); game.body.position.set(game.position.x, .5, game.position.z); }
      else if (game.time % 3 < 2 && (distance <= 2.6 || build === 'hammer' && distance <= 5)) combat.castAction(hero.bindings.attack);
      for (const i of [0, 1] as const) {
        const key = i ? 'mana' : 'hp', maximum = i ? s.maxMana : s.maxHp;
        if (hero[key] < maximum * .55 && combat.regen[i] < (i ? 15 : 30) && hero.potions[i] > 0) { hero.potions[i]--; combat.regen[i] += i ? 80 : 160; manaCosts[key]++; }
      }
      monsterCombat.update(dt);
      for (const enemy of enemies) if (!enemy.dead) { enemy.body.position.x += enemy.body.velocity.x * dt; enemy.body.position.z += enemy.body.velocity.z * dt; enemy.actor.group.position.set(enemy.body.position.x, 0, enemy.body.position.z); }
      game.actor.group.position.copy(game.position); minHp = Math.min(minHp, hero.hp);
      for (const effect of game.effects) dispose(effect.mesh); game.effects = [];
    }
    return { difficulty, act: LEVELS[index].act + 1, level, build, won: boss.dead && !game.dead, seconds: Math.round(game.time * 10) / 10, bossRemaining: Math.round(boss.hp / boss.maxHp * 100), minLifePercent: Math.round(minHp / stats(hero).maxHp * 100), healingPotions: manaCosts.hp, manaPotions: manaCosts.mana, skill: hero.bindings.attack, skillRank: skillLevel(hero, hero.bindings.attack) };
  } finally { for (const object of [...scene.children]) dispose(object); for (const resource of resources) resource.dispose(); }
}
