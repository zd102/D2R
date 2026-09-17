import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, Sphere, World, Vec3 } from 'cannon-es';
import { blockedMovement } from '../src/actor-collision.ts';

test('walking into normal, elite and boss bodies cannot push them, at any movement speed', () => {
  for (const radius of [.37, .44, .85]) for (const speed of [4.5, 7.8, 30]) {
    const world = new World({ gravity: new Vec3() });
    const player = new Body({ mass: 1, shape: new Sphere(.4) });
    const monster = new Body({ mass: 1, shape: new Sphere(radius), position: new Vec3(2, 0, 0) });
    world.addBody(player); world.addBody(monster);
    for (let i = 0; i < 300; i++) {
      const velocity = blockedMovement(player, { x: speed, z: 0 }, [{ body: monster, dead: false }], 1 / 60);
      player.velocity.set(velocity.x, 0, velocity.z); monster.velocity.set(0, 0, 0); world.step(1 / 60);
    }
    assert.equal(monster.position.x, 2);
    assert.ok(player.position.x <= 2 - .4 - radius);
    assert.equal(blockedMovement(player, { x: -speed, z: speed }, [{ body: monster, dead: false }], 1 / 60).z, speed);
    assert.equal(blockedMovement(player, { x: speed, z: 0 }, [{ body: monster, dead: true }], 1 / 60).x, speed);
    player.collisionResponse = false;
    assert.equal(blockedMovement(player, { x: speed, z: 0 }, [{ body: monster, dead: false }], 1 / 60).x, speed);
  }
});
