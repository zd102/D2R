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
    world: { scene, grid: { width: 57, height: 57, isWalkableAt: () => true }, path: () => [] },
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
  game.position.x = 0; enemy.cooldown = 0; combat.state(enemy).abilities.arrow = 0; step(1.4); assert.ok(hits.includes('physical'));
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
  corpse.elite = true; combat.summon(shaman, 'revive', new THREE.Vector3()); assert.equal(game.enemies.length, 2); assert.equal(corpse.redeemed, false);
  corpse.elite = false;
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

test('dormant packs need sight, alert nearby pack mates, and forget a lost target', () => {
  const { spawn, combat, game, step } = setup();
  const scout = spawn(MONSTERS.fallen,0,6), ally = spawn(MONSTERS.shaman,1,12), other = spawn(MONSTERS.zombie,2,12);
  scout.pack = ally.pack = 3; other.pack = 4;
  scout.active = ally.active = other.active = false;
  game.world.grid.isWalkableAt = (_x: number,z: number) => z !== 31;
  step(.1); assert.equal(scout.active,false); assert.equal(ally.active,false);
  game.world.grid.isWalkableAt = () => true;
  step(.1); assert.equal(scout.active,true); assert.equal(ally.active,true); assert.equal(other.active,false);
  const remembered = combat.state(scout).lastSeen!.clone();
  game.world.grid.isWalkableAt = (_x: number,z: number) => z !== 31; game.position.x = 5;
  step(.5); assert.deepEqual(combat.state(scout).lastSeen,remembered);
  step(5); assert.equal(scout.active,false); assert.equal(combat.telegraph(scout),null);
});

test('fallen panic is local and blocked by walls; elites and converted allies hold their ground', () => {
  const { spawn, combat, game, step } = setup();
  const corpse = spawn(MONSTERS.fallen,0,6), runner = spawn(MONSTERS.fallen,1,7), elite = spawn(MONSTERS.fallen,2,7), converted = spawn(MONSTERS.fallen,3,7), hidden = spawn(MONSTERS.fallen,0,2);
  elite.elite = true; converted.converted = 5; corpse.dead = true;
  game.world.grid.isWalkableAt = (_x: number,z: number) => z !== 32;
  combat.onDeath(corpse);
  assert.ok(runner.flee! > 0); assert.ok(!elite.flee && !converted.flee && !hidden.flee);
  combat.updateEnemy(runner,.05); assert.ok(runner.body.velocity.z > 0);
  step(2.5); assert.equal(runner.flee,0);
});

test('support prioritizes a visible corpse, marks that corpse and never invents a fallback spell', () => {
  const { spawn, combat, game, step } = setup(), shaman = spawn(MONSTERS.shaman), corpse = spawn(MONSTERS.fallen,2,5);
  corpse.dead = true; step(.05);
  const cast = combat.state(shaman).cast!;
  assert.equal(cast.id,'revive'); assert.equal(cast.corpse,corpse); assert.equal(cast.mesh.position.x,2); assert.equal(cast.mesh.position.z,5);
  corpse.redeemed = true; step(1.2); assert.equal(game.enemies.length,2);
  const mummy = spawn(MONSTERS.unraveler,0,7);
  assert.equal(combat.selectAttack(mummy,7,true),'skull');
  combat.state(mummy).abilities.skull = 2; assert.equal(combat.selectAttack(mummy,7,true),undefined);
});

test('ranged retreats are bounded and blocked retreats still allow a shot', () => {
  const { spawn, combat, game, step } = setup(), archer = spawn(MONSTERS.rogue,0,2);
  step(.05); assert.ok(archer.body.velocity.z > 0); assert.equal(combat.telegraph(archer),null);
  step(.8); assert.equal(combat.state(archer).cast?.id,'arrow');
  const cornered = spawn(MONSTERS.rogue,2,0); game.world.canWalk = () => false;
  combat.updateEnemy(cornered,.05); assert.equal(combat.state(cornered).cast?.id,'arrow'); assert.equal(cornered.body.velocity.length(),0);
});

test('distance and independent ability cooldowns control charges, close attacks and boss phases', () => {
  const { spawn, combat } = setup(), viper = spawn(MONSTERS.viper), baal = spawn(BOSSES[24]);
  assert.equal(combat.selectAttack(viper,6,true),'charge'); assert.equal(combat.selectAttack(viper,1,true),'strike');
  combat.state(viper).abilities.charge = 4;
  assert.equal(combat.selectAttack(viper,6,true),undefined); assert.equal(combat.selectAttack(viper,1,true),'strike');
  assert.notEqual(combat.selectAttack(baal,7,true),'clone'); baal.hp = 49;
  assert.equal(combat.selectAttack(baal,7,true),'clone');
});

test('breath stops at a wall, locks the caster during the channel and is interrupted by stun', () => {
  const { spawn, combat, game, step, hits } = setup(), enemy = spawn(MONSTERS.venomLord,0,6);
  game.world.grid.isWalkableAt = (_x: number,z: number) => z!==31;
  combat.startCast(enemy,'inferno');
  assert.ok(combat.state(enemy).cast!.target.z > 3.5);
  // Keep the caster aware while testing interruption of an already committed cast.
  combat.state(enemy).memory = 5;
  step(.9); assert.equal(combat.hazards.length,1); assert.equal(enemy.body.velocity.length(),0); assert.equal(hits.length,0);
  enemy.stunned = 1; step(.05); assert.equal(combat.hazards.length,0);
});

test('broods are bounded melee young and missed frenzy swings do not grant acceleration', () => {
  const { spawn, combat, game, step } = setup(), parent = spawn(MONSTERS.maggot);
  combat.summon(parent,'brood',game.position); combat.summon(parent,'brood',game.position); combat.summon(parent,'brood',game.position);
  const young = game.enemies.filter((e: Enemy)=>e.owner===parent.id);
  assert.equal(young.length,2); assert.ok(young.every((e: Enemy)=>e.summoned&&e.definition!.attacks.join() === 'strike'));
  const lord = spawn(MONSTERS.bloodLord,0,1); combat.startCast(lord,'frenzy'); game.position.x = 7;
  step(.4); assert.equal(combat.state(lord).frenzy,0);
});

test('fire walls cross the locked target point and only damage bodies in their strip', () => {
  const { spawn, combat, game, step, hits } = setup(), caster=spawn(MONSTERS.vampire,0,6);
  combat.startCast(caster,'fireWall');
  const cast=combat.state(caster).cast!;
  assert.ok(cast.origin.x*cast.target.x < -4); assert.equal(cast.origin.z,0); assert.equal(cast.target.z,0);
  game.position.z=2; step(1.1); assert.equal(hits.length,0); assert.equal(combat.hazards.length,1);
  game.position.set(1,0,0); step(.7); assert.ok(hits.includes('fire'));
  caster.cooldown=100; game.position.z=2; const previous=hits.length; step(.7); assert.equal(hits.length,previous);
});

test('two resurrection casts cannot consume the same corpse twice', () => {
  const {spawn,combat,game}=setup(), first=spawn(MONSTERS.shaman,0,6),second=spawn(MONSTERS.shaman,2,6),corpse=spawn(MONSTERS.fallen,1,5);
  corpse.dead=true;combat.startCast(first,'revive');combat.startCast(second,'revive');
  combat.resolve(first,combat.state(first).cast!);combat.resolve(second,combat.state(second).cast!);
  assert.equal(game.enemies.filter((e:Enemy)=>e.summoned).length,1);assert.equal(corpse.redeemed,true);
});
