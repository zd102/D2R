import { test } from 'node:test';
import assert from 'node:assert/strict';
import PF from 'pathfinding';
import { GameWorld } from '../src/world.ts';
import { clearWalk, followPath } from '../src/navigation.ts';

function fixture(size = 31) {
  const world = Object.create(GameWorld.prototype) as GameWorld;
  world.grid = new PF.Grid(size, size);
  world.finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
  const block = (x: number, z: number) => world.grid.setWalkableAt(x + world.gridOffset, z + world.gridOffset, false);
  return { world, block };
}

test('open-ground destinations retain sub-cell precision without A* or grid copies', t => {
  const { world } = fixture();
  const search = t.mock.method(world.finder, 'findPath'), clone = t.mock.method(world.grid, 'clone');
  for (let i = 0; i < 120; i++) {
    const to = { x: 5.1 + i / 200, z: 3.27 };
    const route = world.path({ x: .21, z: -.32 }, to);
    assert.deepEqual(route.map(p => ({ x: p.x, z: p.z })), [to]);
  }
  assert.equal(search.mock.callCount(), 0); assert.equal(clone.mock.callCount(), 0);
});

test('walk visibility rejects walls, diagonal corner cuts and invalid coordinates', () => {
  const { world, block } = fixture(); block(1, 0);
  assert.equal(clearWalk(world.grid, { x: 0, z: 0 }, { x: 2, z: 2 }), false);
  assert.equal(clearWalk(world.grid, { x: 2, z: 2 }, { x: 0, z: 0 }), false);
  assert.equal(clearWalk(world.grid, { x: 0, z: 0 }, { x: 2, z: 0 }), false);
  assert.equal(clearWalk(world.grid, { x: 0, z: 0 }, { x: -2, z: -2 }), true);
  assert.equal(clearWalk(world.grid, { x: 0, z: 0 }, { x: -.5, z: .5 }), true);
  assert.deepEqual(world.path({ x: 0, z: 0 }, { x: NaN, z: 1 }), []);
});

test('smoothed routes from off-center positions safely round walls and retain the requested endpoint', () => {
  const { world, block } = fixture();
  for (let z = -5; z <= 5; z++) block(0, z);
  let from = { x: -3.28, z: .42 }; const to = { x: 3.33, z: -.27 }, route = world.path(from, to);
  assert.ok(route.length >= 2); assert.deepEqual({ x: route.at(-1)!.x, z: route.at(-1)!.z }, to);
  for (const point of route) { assert.ok(world.canWalk(from, point), `blocked segment ${JSON.stringify({ from, point })}`); from = point; }
});

test('enclosed destinations reuse one failed search to reach the nearest accessible tile', t => {
  const { world, block } = fixture();
  for (let x = -2; x <= 2; x++) { block(x, -2); block(x, 2); }
  for (let z = -1; z <= 1; z++) { block(-2, z); block(2, z); }
  const search = t.mock.method(world.finder, 'findPath'), clone = t.mock.method(world.grid, 'clone');
  const route = world.path({ x: -8, z: 0 }, { x: 0, z: 0 });
  assert.deepEqual({ x: route.at(-1)!.x, z: route.at(-1)!.z }, { x: -3, z: 0 });
  assert.equal(search.mock.callCount(), 1); assert.equal(clone.mock.callCount(), 1);
  assert.ok(world.canWalk({ x: -8, z: 0 }, route[0]));
});

test('an unreachable destination does not repeat A* for all nearby candidates', t => {
  const { world, block } = fixture();
  for (let z = -15; z <= 15; z++) block(0, z);
  const search = t.mock.method(world.finder, 'findPath');
  assert.deepEqual(world.path({ x: -8, z: 0 }, { x: 8, z: 0 }), []);
  assert.equal(search.mock.callCount(), 1);
});

test('an actor pushed into an obstacle margin escapes without backtracking to the blocked cell center', () => {
  const { world, block } = fixture(); block(0, 0);
  const route = world.path({ x: .3, z: 0 }, { x: 4, z: 0 });
  assert.ok(route.length > 0 && route[0].x > .3);
  assert.deepEqual({ x: route.at(-1)!.x, z: route.at(-1)!.z }, { x: 4, z: 0 });
});

test('waypoints transition without a zero-velocity frame and short steps never overshoot', () => {
  const position = { x: 0, z: 0 }, path = [{ x: .05, z: 0 }, { x: .1, z: 0 }, { x: 0, z: 4 }];
  assert.deepEqual(followPath(position, path, 5.2, 1 / 60), { x: 0, z: 5.2 });
  assert.equal(path.length, 1);
  const short = [{ x: .2, z: 0 }], velocity = followPath(position, short, 25, .05);
  assert.equal(velocity.x * .05, .2);
  assert.deepEqual(followPath({ x: .2, z: 0 }, short, 25, .05), { x: 0, z: 0 });
  assert.equal(short.length, 0);
  const remaining = [{ x: 0, z: 4 }];
  assert.deepEqual(followPath(position, remaining, 0, .05), { x: 0, z: 0 }); assert.equal(remaining.length, 1);
});
