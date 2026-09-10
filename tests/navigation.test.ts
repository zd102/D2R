import { test } from 'node:test';
import assert from 'node:assert/strict';
import PF from 'pathfinding';
import { GameWorld } from '../src/world.ts';
import { clearWalk, clearObstacles, followPath, type Obstacle } from '../src/navigation.ts';

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

function collisionFixture(obstacles: Obstacle[]) {
  const { world } = fixture(); world.obstacles = obstacles; return world;
}

test('physical clearance allows walking beside small props and through a body-width gap', () => {
  const prop = { x: 0, z: 0, w: 1, d: 1 }, world = collisionFixture([prop]);
  assert.equal(world.canWalk({ x: -4, z: 1 }, { x: 4, z: 1 }), true, 'no extra grid tile beside a half-unit edge');
  assert.equal(world.canWalk({ x: -4, z: .8 }, { x: 4, z: .8 }), false, 'the player radius still collides');
  const narrow = collisionFixture([{ x: 0, z: -1.1, w: 8, d: 1 }, { x: 0, z: 1.1, w: 8, d: 1 }]);
  assert.equal(narrow.canWalk({ x: -5, z: 0 }, { x: 5, z: 0 }), true);
  assert.equal(narrow.path({ x: -5, z: 0 }, { x: 5, z: 0 }).length, 1);
});

test('swept circles detect thin walls and rounded corners at arbitrary angles', () => {
  const obstacles = [{ x: 0, z: 0, w: 1, d: 1 }];
  assert.equal(clearObstacles(obstacles, { x: -2, z: .7 }, { x: 2, z: .7 }), false);
  assert.equal(clearObstacles(obstacles, { x: .82, z: .82 }, { x: 2, z: 2 }), true, 'rounded corner is traversable');
  assert.equal(clearObstacles([{ x: 0, z: 0, w: .02, d: 3 }], { x: -6, z: 0 }, { x: 6, z: 0 }), false);
  assert.equal(clearObstacles(obstacles, { x: .9, z: 0 }, { x: 2, z: 1 }), true, 'can escape a physical contact');
  assert.equal(clearObstacles(obstacles, { x: .9, z: 0 }, { x: .6, z: 1 }), false);
});

test('physical routes preserve clearance from off-grid starts and steer around corners continuously', () => {
  const world = collisionFixture([{ x: 0, z: 0, w: 1.3, d: 4.7 }]);
  for (const start of [{ x: -5.13, z: .17 }, { x: -1.1, z: 0 }, { x: -3, z: 1.7 }]) {
    const position = { ...start }, to = { x: 4.73, z: .29 }, path = world.path(position, to);
    assert.ok(path.length >= 2);
    let anchor = position;
    for (const point of path) { assert.ok(world.canWalk(anchor, point), JSON.stringify({ anchor, point })); anchor = point; }
    let arbitraryAngle = false;
    for (let frame = 0; frame < 400 && path.length; frame++) {
      const velocity = followPath(position, path, 5.2, 1 / 60, (a, b) => world.canWalk(a, b));
      const end = { x: position.x + velocity.x / 60, z: position.z + velocity.z / 60 };
      assert.ok(world.canWalk(position, end), 'lookahead cannot cut through a building');
      if (Math.abs(velocity.x) > .1 && Math.abs(velocity.z) > .1 && Math.abs(Math.abs(velocity.x) - Math.abs(velocity.z)) > .1) arbitraryAngle = true;
      Object.assign(position, end);
    }
    assert.ok(arbitraryAngle); assert.ok(Math.hypot(position.x - to.x, position.z - to.z) < .13);
  }
});
