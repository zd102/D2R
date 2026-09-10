import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { FrameClock } from '../src/frame-clock.ts';

function simulate(frames: number[]) {
  const clock = new FrameClock(), world = new CANNON.World();
  const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(.4), linearDamping: .95 });
  world.addBody(body);
  let elapsed = 0;
  for (const frame of frames) clock.advance(frame, dt => {
    elapsed += dt;
    body.velocity.set(5.2, 0, 0);
    world.step(1 / 60, dt, 3);
  });
  return { elapsed, distance: body.position.x };
}

test('real physics movement and gameplay time agree across render rates and uneven frames', () => {
  const reference = simulate(Array(60).fill(1 / 60));
  assert.ok(reference.distance > 4.9 && reference.distance < 5);
  const schedules = [5, 10, 15, 20, 30, 60, 120, 144].map(fps => Array(fps).fill(1 / fps));
  schedules.push(Array.from({ length: 4 }, () => [1 / 120, 1 / 30, 1 / 15, 1 / 60, 1 / 10, 1 / 40]).flat());
  for (const frames of schedules) {
    const result = simulate(frames);
    assert.ok(Math.abs(result.elapsed - 1) < 1e-10, JSON.stringify(result));
    assert.ok(Math.abs(result.distance - reference.distance) < 1e-10, JSON.stringify(result));
  }
});

test('long stalls discard excess time without leaving a catch-up backlog', () => {
  const clock = new FrameClock();
  let elapsed = 0;
  const update = (dt: number) => { elapsed += dt; };
  assert.equal(clock.advance(30, update), .25);
  assert.ok(Math.abs(elapsed - .25) < 1e-10);
  clock.advance(1 / 60, update);
  assert.ok(Math.abs(elapsed - (.25 + 1 / 60)) < 1e-10);
});

test('fractional frames accumulate and resetting discards only pending time', () => {
  const clock = new FrameClock();
  let updates = 0;
  const update = () => { updates++; };
  clock.advance(1 / 120, update); assert.equal(updates, 0);
  clock.advance(1 / 120, update); assert.equal(updates, 1);
  clock.advance(1 / 120, update); clock.reset();
  clock.advance(1 / 120, update); assert.equal(updates, 1);
  clock.advance(1 / 120, update); assert.equal(updates, 2);
  for (const dt of [-1, NaN, Infinity]) assert.equal(clock.advance(dt, update), 0);
  assert.equal(updates, 2);
});
