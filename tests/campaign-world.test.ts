import { test } from 'node:test';
import assert from 'node:assert/strict';
import PF from 'pathfinding';
import { GameWorld } from '../src/world.ts';

test('pathfinding finishes the final partial cell beside a collidable quest object', () => {
  const world = Object.create(GameWorld.prototype) as GameWorld;
  world.grid = new PF.Grid(57, 57); world.finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
  for (let x = -17; x <= -13; x++) for (let z = -4; z <= 0; z++) world.grid.setWalkableAt(x + 28, z + 28, false);
  const path = world.path({ x: -11.54, z: -1.74 }, { x: -15, z: -2 });
  assert.equal(path.length, 1); assert.deepEqual({ x: path[0].x, z: path[0].z }, { x: -12, z: -2 });
  assert.ok(Math.hypot(path[0].x + 15, path[0].z + 2) < 3.4);
  assert.deepEqual(world.path({ x: -12, z: -2 }, { x: -15, z: -2 }), []);
});
