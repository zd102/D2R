import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import PF from 'pathfinding';
import { GameWorld } from '../src/world.ts';
import { createHeroActor } from '../src/hero-models.ts';
import { disposeVisual } from '../src/visual-effects.ts';
import { clearShot } from '../src/ranged.ts';
import { newHero } from '../src/model.ts';
import { hireMercenary } from '../src/mercenary.ts';
import { MercenaryCombat } from '../src/mercenary-combat.ts';
import type { Game, Enemy } from '../src/game.ts';

function fixture(t: TestContext) {
  const world = Object.create(GameWorld.prototype) as GameWorld;
  world.grid = new PF.Grid(129, 129); world.scene = new THREE.Scene();
  world.finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
  const hero = newHero(); hero.level = 30; hero.gold = 10000; hero.campaign.cleared[0] = 5; hireMercenary(hero, true); hero.mercenary!.aura = 'might';
  const game = { hero, world, position: new THREE.Vector3(), actor: createHeroActor('paladin'), enemies: [] as Enemy[], inCamp: false, dead: false, time: 0,
    combat: { hostile: (enemy: Enemy) => !enemy.dead && enemy.converted <= 0 && !enemy.boss }, disposeObject: disposeVisual,
  } as unknown as Game;
  game.mercenary = new MercenaryCombat(game); const merc = game.mercenary; merc.sync();
  const hits: number[] = []; t.mock.method(merc, 'strike', (enemy: Enemy) => { hits.push(enemy.id); });
  const enemy = (id: number, x: number, z = 0) => {
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const e = { id, actor: { group }, hp: 1000, dead: false, converted: 0, boss: false } as Enemy;
    game.enemies.push(e); return e;
  };
  const block = (x: number, z: number) => world.grid.setWalkableAt(x + world.gridOffset, z + world.gridOffset, false);
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) { const before = merc.position!.clone(); game.time += 1 / 60; merc.update(1 / 60); assert.ok(world.canWalk(before, merc.position!), 'Every movement segment clears walls'); } };
  t.after(() => { merc.clear(); disposeVisual(game.actor.group); });
  return { game, world, merc, hits, enemy, block, step };
}

test('mercenary acquires a foe 20 units away and closes to attack in under two seconds', t => {
  const f = fixture(t), enemy = f.enemy(1, 20); f.step(1.7);
  assert.ok(f.hits.includes(enemy.id)); assert.ok(f.merc.position!.distanceTo(enemy.actor.group.position) <= 2.1);
  assert.ok(f.merc.position!.x > 17, 'The mercenary pursues beyond the old teleport tether');
});

test('mercenary routes around a wall to unseen enemies and never stabs through it', t => {
  const f = fixture(t), enemy = f.enemy(1, 10); for (let z = -4; z <= 4; z++) f.block(4, z);
  assert.equal(clearShot(f.world.grid, f.merc.position!, enemy.actor.group.position), false);
  f.step(.5); assert.equal(f.hits.length, 0); assert.equal(f.merc.target, enemy);
  f.step(2.5); assert.ok(f.hits.length > 0); assert.ok(clearShot(f.world.grid, f.merc.position!, enemy.actor.group.position));
});

test('unreachable preferred targets cannot block reachable foes or trigger A* every frame', t => {
  const f = fixture(t); for (let z = -64; z <= 64; z++) f.block(3, z);
  const sealed = f.enemy(1, 6), reachable = f.enemy(2, -12); f.game.target = sealed;
  const path = t.mock.method(f.world, 'path'); f.step(1.2);
  assert.ok(f.hits.includes(reachable.id)); assert.ok(!f.hits.includes(sealed.id));
  assert.ok(path.mock.callCount() <= 4, `Unreachable searches are throttled (${path.mock.callCount()})`);
});

test('mercenary assists the selected enemy and immediately replaces dead or converted targets', t => {
  const f = fixture(t), near = f.enemy(1, 6), selected = f.enemy(2, 18), converted = f.enemy(3, 1); converted.converted = 10;
  f.game.target = selected; f.step(1 / 60); assert.equal(f.merc.target, selected);
  selected.dead = true; f.step(1 / 60); assert.equal(f.merc.target, near);
  near.converted = 10; f.step(1 / 60); assert.equal(f.merc.target, undefined); assert.equal(f.hits.length, 0);
});

test('close-range jab chains attack faster while remote targets and town never trigger combat', t => {
  const f = fixture(t); const near = f.enemy(1, 1.6); f.step(1);
  assert.ok(f.hits.length >= 4); near.dead = true; f.enemy(2, 29); f.step(.2); assert.equal(f.merc.target, undefined);
  const count = f.hits.length; f.game.inCamp = true; f.enemy(3, 1); f.step(.5); assert.equal(f.hits.length, count);
});

test('following catches up at 16 units per second and player teleport regroups the mercenary', t => {
  const f = fixture(t); f.game.position.x = 20; f.step(.5); assert.ok(f.merc.position!.x >= 7.9);
  f.game.position.x = 55; f.merc.update(1 / 60); assert.ok(f.merc.position!.distanceTo(f.game.position) <= 1.8);
});
