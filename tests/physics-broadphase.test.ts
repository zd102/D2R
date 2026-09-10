import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, Box, NaiveBroadphase, Sphere, Vec3, World, type Broadphase } from 'cannon-es';
import { MapBroadphase, MapCollisionMatrix } from '../src/physics-broadphase.ts';
import { mapRandom } from '../src/map-random.ts';

function pairs(broadphase: Broadphase, world: World) {
  const a: Body[] = [], b: Body[] = [];
  broadphase.dirty = true; broadphase.collisionPairs(world, a, b);
  return a.map((body, i) => [body.id, b[i].id].sort((x, y) => x - y).join(':')).sort();
}

test('map sweep matches exhaustive AABB pairs through movement, filters and body lifecycle', () => {
  const random = mapRandom(20260910), world = new World(), sweep = new MapBroadphase(world), exhaustive = new NaiveBroadphase();
  exhaustive.useBoundingBoxes = true; world.broadphase = sweep;
  for (let i = 0; i < 180; i++) {
    const body = new Body({ mass: i % 4 ? 0 : 1, shape: i % 4 ? new Box(new Vec3(.2 + random() * 15, 2, .2 + random() * 3)) : new Sphere(.3), position: new Vec3(random() * 60 - 30, .5, random() * 60 - 30) });
    body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), random() * 3);
    if (i % 7 === 0) body.collisionFilterMask = 0;
    if (i % 11 === 0) body.sleep();
    world.addBody(body);
  }
  for (const axis of [0, 1, 2] as const) {
    sweep.axisIndex = axis;
    for (let step = 0; step < 4; step++) {
      for (const body of world.bodies) if (body.mass) { body.position.x += random() * 4 - 2; body.aabbNeedsUpdate = true; }
      assert.deepEqual(pairs(sweep, world), pairs(exhaustive, world));
    }
  }
  world.removeBody(world.bodies[17]);
  world.addBody(new Body({ mass: 1, shape: new Sphere(2) }));
  assert.deepEqual(pairs(sweep, world), pairs(exhaustive, world));
  const touching = new World(), touchSweep = new MapBroadphase(touching);
  touching.addBody(new Body({ mass: 1, shape: new Sphere(1) }));
  touching.addBody(new Body({ shape: new Box(new Vec3(1, 1, 1)), position: new Vec3(2, 0, 0) }));
  assert.equal(pairs(touchSweep, touching).length, 1, 'touching interval endpoints remain candidates');
});

test('separated static walls stop the sweep before testing all pairs', () => {
  const world = new World(), sweep = new MapBroadphase(world);
  for (let i = 0; i < 2000; i++) world.addBody(new Body({ shape: new Box(new Vec3(.2, 2, 20)), position: new Vec3(i * 2, 0, 0) }));
  world.addBody(new Body({ mass: 1, shape: new Sphere(.4), position: new Vec3(200, .5, 0) }));
  let checks = 0;
  const filter = sweep.needBroadphaseCollision;
  sweep.needBroadphaseCollision = function(a, b) { checks++; return filter.call(this, a, b); };
  assert.equal(pairs(sweep, world).length, 1);
  assert.ok(checks < 10, `local candidates only, received ${checks}`);
});

test('sparse contact history keeps stable body IDs across removals and clears between ticks', () => {
  const world = new World(), a = new Body(), b = new Body(), c = new Body(), matrix = new MapCollisionMatrix();
  [a, b, c].forEach(body => world.addBody(body));
  matrix.setNumObjects(10000); assert.equal(matrix.matrix.length, 0, 'no quadratic wall matrix');
  matrix.set(a, c, true); assert.equal(matrix.get(c, a), 1); assert.equal(matrix.get(a, b), 0);
  world.removeBody(b); matrix.setNumObjects(world.bodies.length);
  assert.equal(matrix.get(a, c), 1, 'removing another body must not lose existing contacts');
  matrix.set(c, a, false); assert.equal(matrix.get(a, c), 0);
  matrix.set(a, c, true); matrix.reset(); assert.equal(matrix.get(a, c), 0);
});
