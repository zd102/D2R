import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MONSTERS, ENCOUNTERS, BOSSES, isUndead, type MonsterDef } from '../src/bestiary.ts';
import { createMonsterActor } from '../src/monster-models.ts';
import { MonsterCombat, ATTACKS, segmentDistance } from '../src/monster-combat.ts';
import { newHero } from '../src/model.ts';
import type { Enemy, Game } from '../src/game.ts';

function setup() {
  const hits: string[] = [], scene = new THREE.Scene(), enemies: Enemy[] = [];
  const game: any = { hero: newHero(), enemies, time: 0, position: new THREE.Vector3(), started: true, invincible: 0, dead: false,
    world: { scene, grid: { isWalkableAt: () => true }, path: () => [] },
    disposeObject: (object: THREE.Object3D) => object.removeFromParent(), killEnemy: (enemy: Enemy) => { enemy.dead = true; },
    combat: { slow: () => 1, allyUpdate: () => false, hurt: (_damage: number, type: string) => hits.push(type) } };
  const combat = new MonsterCombat(game as Game); game.monsterCombat = combat;
  const spawn = (definition = MONSTERS.rogue, x = 0, z = 6) => {
    const actor = createMonsterActor(definition); actor.group.position.set(x, 0, z); scene.add(actor.group);
    const enemy = { id: enemies.length, name: definition.name, definition, actor, body: new CANNON.Body({ mass: 1 }), hp: 100, maxHp: 100, damage: 10, speed: definition.speed, cooldown: 0, attackTime: 0, path: [], rethink: 0, dead: false, boss: false, active: true, kind: definition.race === 'undead' ? 'skeleton' : 'demon', level: 20, defense: 20, attackRating: 100, resistances: { physical: 0, fire: 0, cold: 0, lightning: 0, poison: 0, magic: 0 }, stunned: 0, coldTime: 0, converted: 0, bleed: 0, redeemed: false } as Enemy;
    enemies.push(enemy); return enemy;
  };
  game.spawnEnemy = (x: number, z: number, _kind: string, def: MonsterDef) => spawn(def, x, z);
  const step = (seconds: number) => { for (let t = 0; t < seconds; t += .05) { game.time += .05; combat.update(.05); } };
  return { game, combat, hits, spawn, step };
}
test('25 encounter pools reference 37 species and all 25 bosses have valid attacks', () => {
  assert.equal(ENCOUNTERS.length, 25); assert.equal(BOSSES.length, 25); assert.ok(Object.keys(MONSTERS).length >= 35);
  const used = new Set<string>();
  for (const pool of ENCOUNTERS) { assert.ok(pool.length >= 3); for (const id of pool) { assert.ok(MONSTERS[id]); used.add(id); } }
  assert.equal(used.size, Object.keys(MONSTERS).length);
  for (const definition of [...Object.values(MONSTERS), ...BOSSES]) { for (const id of definition.attacks) assert.ok(ATTACKS[id]); if (definition.revive) assert.ok(MONSTERS[definition.revive]); }
  assert.equal(isUndead({ definition: BOSSES[0], kind: 'boss' }), true); assert.equal(isUndead({ definition: BOSSES[4], kind: 'boss' }), false);
});
test('every body plan has finite visible geometry and independent animated rigs', () => {
  const models = new Map([...Object.values(MONSTERS), ...BOSSES].map(def => [def.model, def]));
  const signatures = new Set<string>();
  for (const def of models.values()) {
    const actor = createMonsterActor(def), bound = new THREE.Box3().setFromObject(actor.group), size = bound.getSize(new THREE.Vector3());
    assert.ok(size.x > .2 && size.y > .3 && size.z > .2 && size.length() < 12, def.id);
    assert.ok([size.x, size.y, size.z].every(Number.isFinite));
    const before = actor.group.children[0].position.y; actor.animate!(.43, true, .5);
    assert.notEqual(actor.group.children[0].position.y, before); assert.equal(actor.group.userData.bodyPlan, def.model);
    let count = 0; actor.group.traverse(o => { if (o instanceof THREE.Mesh) count++; }); signatures.add(`${count}:${size.toArray().join(',')}`);
  }
  assert.ok(signatures.size >= 22);
  assert.equal(new Set([4, 9, 14, 19, 24].map(i => BOSSES[i].model)).size, 5);
});
test('ranged attacks warn first, lock their aim, travel, hit or can be dodged', () => {
  const { combat, spawn, step, hits, game } = setup(), enemy = spawn();
  step(.1); assert.equal(hits.length, 0); assert.equal(combat.telegraph(enemy)?.name, '箭矢');
  step(.55); assert.ok(combat.missiles.length > 0); assert.equal(hits.length, 0);
  game.position.x = 3; step(.8); assert.equal(hits.length, 0);
  game.position.x = 0; enemy.cooldown = 0; step(1.4); assert.ok(hits.includes('physical'));
});

test('a projectile volley hits only once across frames, while a separate cast and persistent ground effects still hurt', () => {
  const { combat, spawn, step, hits, game } = setup(), enemy = spawn(MONSTERS.shaman);
  enemy.cooldown = 100;
  const volley = { hit: false };
  combat.fire(enemy, ATTACKS.fireball, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), volley); step(.15); assert.equal(hits.length, 1);
  combat.fire(enemy, ATTACKS.fireball, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), volley); step(.15); assert.equal(hits.length, 1);
  combat.fire(enemy, ATTACKS.fireball, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)); step(.15); assert.equal(hits.length, 2);
  combat.startCast(enemy, 'poisonPool'); step(1.2); const first = hits.length; step(1.5); assert.ok(hits.length > first);
  game.position.x = 10; const escaped = hits.length; step(.5); assert.equal(hits.length, escaped);
});
test('walls block missiles and line hazards, including swept fast projectiles', () => {
  const { combat, spawn, hits, game, step } = setup(), enemy = spawn();
  game.world.grid.isWalkableAt = (_x: number, z: number) => z !== 31;
  assert.equal(combat.lineOfSight(enemy.actor.group.position, game.position), false);
  combat.fire(enemy, ATTACKS.arrow, enemy.actor.group.position, new THREE.Vector3(0, 0, -1)); step(1); assert.equal(hits.length, 0); assert.equal(combat.missiles.length, 0);
  assert.equal(segmentDistance({ x: 0, z: 0 }, { x: -2, z: 0 }, { x: 2, z: 0 }), 0);
});
test('stun, conversion, death and quest gating cancel casts without invisible damage', () => {
  for (const status of ['stun', 'conversion', 'death']) {
    const { spawn, step, combat, hits } = setup(), enemy = spawn(); step(.1);
    if (status === 'stun') enemy.stunned = 2; if (status === 'conversion') enemy.converted = 2; if (status === 'death') enemy.dead = true;
    step(1.2); assert.equal(combat.telegraph(enemy), null); assert.equal(hits.length, 0);
  }
  const { spawn, step, combat } = setup(), boss = spawn(BOSSES[4]); boss.boss = true; boss.active = false; step(2); assert.equal(combat.telegraph(boss), null);
});
test('poison pools are telegraphed, spatial, expire and are removed when their caster dies', () => {
  const { spawn, step, combat, hits, game } = setup(), enemy = spawn(MONSTERS.spider);
  combat.startCast(enemy, 'poisonPool'); step(1); assert.equal(hits.length, 0);
  game.position.x = 4; step(.3); assert.equal(combat.hazards.length, 1); assert.equal(hits.length, 0);
  game.position.x = 0; step(.7); assert.ok(hits.includes('poison'));
  enemy.dead = true; step(.1); assert.equal(combat.hazards.length, 0);
});
test('revival consumes matching corpses once and bounded summons cannot chain-revive', () => {
  const { spawn, combat, game, step } = setup(), shaman = spawn(MONSTERS.shaman), corpse = spawn(MONSTERS.fallen, 1, 4); corpse.dead = true;
  combat.summon(shaman, 'revive', new THREE.Vector3()); assert.equal(corpse.redeemed, true); assert.equal(game.enemies.length, 3);
  const add = game.enemies[2]; assert.equal(add.summoned, true); assert.equal(add.owner, shaman.id);
  combat.summon(shaman, 'revive', new THREE.Vector3()); assert.equal(game.enemies.length, 3);
  add.dead = true; combat.summon(shaman, 'revive', new THREE.Vector3()); assert.equal(game.enemies.length, 3);
  const baal = spawn(BOSSES[24]); baal.hp = 49; combat.summon(baal, 'clone', new THREE.Vector3()); const count = game.enemies.length;
  combat.summon(baal, 'clone', new THREE.Vector3()); assert.equal(game.enemies.length, count); baal.dead = true; step(.1); assert.ok(!game.enemies.some((e: Enemy) => e.owner === baal.id));
});
test('beetle retaliation is delayed and throttled; prevent-heal stops council regeneration', () => {
  const { spawn, combat, step } = setup(), beetle = spawn(MONSTERS.beetle);
  combat.onHit(beetle); combat.onHit(beetle); assert.equal(combat.telegraph(beetle)?.name, '闪电'); step(.8); assert.ok(combat.missiles.length <= 6);
  const council = spawn(MONSTERS.council); council.hp = 50; step(.1); assert.ok(council.hp > 50);
  council.preventHeal = true; const hp = council.hp; step(.1); assert.equal(council.hp, hp);
});
test('diagonal ground telegraphs align with the real line hit region', () => {
  const { spawn, combat, step } = setup(), enemy = spawn(BOSSES[19], 4, 6);
  combat.startCast(enemy, 'redLightning');
  const cast = combat.state(enemy).cast!, direction = cast.target.clone().sub(cast.origin).normalize();
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(cast.mesh.quaternion);
  assert.ok(Math.abs(axis.dot(direction)) > .999);
  step(1.25); const hazard = combat.hazards[0]; assert.ok(hazard);
  assert.ok(Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(hazard.mesh.quaternion).dot(direction)) > .999);
});
