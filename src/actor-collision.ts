import type { Body } from 'cannon-es';

// Stop voluntary movement at contact instead of feeding it into Cannon as a
// pushing impulse. Tangential movement and retreat remain possible.
export function blockedMovement(body: Body, velocity: { x: number; z: number }, enemies: Iterable<{ body: Body; dead: boolean }>, dt: number) {
  let { x, z } = velocity;
  if (!body.collisionResponse || dt <= 0) return { x, z };
  const blockers = [...enemies].filter(enemy => !enemy.dead && enemy.body.collisionResponse);
  for (let pass = 0; pass < 3; pass++) for (const enemy of blockers) {
    const dx = enemy.body.position.x - body.position.x, dz = enemy.body.position.z - body.position.z;
    const distance = Math.hypot(dx, dz), radius = body.boundingRadius + enemy.body.boundingRadius + .025;
    if (distance < 1e-8 || distance > radius + Math.hypot(x, z) * dt) continue;
    const nx = dx / distance, nz = dz / distance;
    const excess = x * nx + z * nz - Math.max(0, distance - radius) / dt;
    if (excess > 0) { x -= excess * nx; z -= excess * nz; }
  }
  return { x, z };
}
