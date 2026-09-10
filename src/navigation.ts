import PF from 'pathfinding';

type Point = { x: number; z: number };
type WalkGrid = Pick<PF.Grid, 'width' | 'height' | 'isWalkableAt'>;
export type Obstacle = Point & { w: number; d: number };
export const PLAYER_RADIUS = .4;
export const WALK_CLEARANCE = PLAYER_RADIUS + .025;
export const NAV_SCALE = 2;

function pointRectangleDistance(point: Point, obstacle: Obstacle) {
  return Math.hypot(Math.max(0, Math.abs(point.x - obstacle.x) - obstacle.w / 2), Math.max(0, Math.abs(point.z - obstacle.z) - obstacle.d / 2));
}

// Swept circle vs the same rectangles used by Cannon. Rounded corners keep the
// player's radius without adding an entire blocked tile around a small prop.
export function clearObstacles(obstacles: Obstacle[], from: Point, to: Point, radius = WALK_CLEARANCE) {
  if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return false;
  const dx = to.x - from.x, dz = to.z - from.z, lengthSq = dx * dx + dz * dz;
  for (const obstacle of obstacles) {
    const left = obstacle.x - obstacle.w / 2, right = obstacle.x + obstacle.w / 2;
    const top = obstacle.z - obstacle.d / 2, bottom = obstacle.z + obstacle.d / 2;
    if (Math.max(from.x, to.x) < left - radius || Math.min(from.x, to.x) > right + radius
      || Math.max(from.z, to.z) < top - radius || Math.min(from.z, to.z) > bottom + radius) continue;
    const startDistance = pointRectangleDistance(from, obstacle);
    // Contact impulses may remove the tiny planning margin. Still allow sliding
    // away from a surface while preserving the physical body radius.
    const clearance = startDistance >= PLAYER_RADIUS - .001 ? Math.min(radius, startDistance) : radius;
    if (startDistance < clearance || pointRectangleDistance(to, obstacle) < clearance) return false;
    let near = 0, far = 1;
    for (const [origin, delta, min, max] of [[from.x, dx, left, right], [from.z, dz, top, bottom]]) {
      if (!delta) { if (origin < min || origin > max) { far = -1; break; } }
      else { const a = (min - origin) / delta, b = (max - origin) / delta; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
    }
    if (near <= far) return false;
    if (lengthSq) for (const x of [left, right]) for (const z of [top, bottom]) {
      const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / lengthSq));
      if ((x - from.x - dx * t) ** 2 + (z - from.z - dz * t) ** 2 < clearance ** 2) return false;
    }
  }
  return true;
}

export function collisionGrid(obstacles: Obstacle[], extent: number, extentZ = extent) {
  const offset = extent * NAV_SCALE, offsetZ = extentZ * NAV_SCALE;
  const width = offset * 2 + 1, height = offsetZ * 2 + 1, grid = new PF.Grid(width, height);
  for (let x = 0; x < width; x++) { grid.setWalkableAt(x, 0, false); grid.setWalkableAt(x, height - 1, false); }
  for (let z = 0; z < height; z++) { grid.setWalkableAt(0, z, false); grid.setWalkableAt(width - 1, z, false); }
  for (const obstacle of obstacles) {
    const x0 = Math.max(0, Math.ceil((obstacle.x - obstacle.w / 2 - WALK_CLEARANCE) * NAV_SCALE) + offset);
    const x1 = Math.min(width - 1, Math.floor((obstacle.x + obstacle.w / 2 + WALK_CLEARANCE) * NAV_SCALE) + offset);
    const z0 = Math.max(0, Math.ceil((obstacle.z - obstacle.d / 2 - WALK_CLEARANCE) * NAV_SCALE) + offsetZ);
    const z1 = Math.min(height - 1, Math.floor((obstacle.z + obstacle.d / 2 + WALK_CLEARANCE) * NAV_SCALE) + offsetZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (pointRectangleDistance({ x: (x - offset) / NAV_SCALE, z: (z - offsetZ) / NAV_SCALE }, obstacle) < WALK_CLEARANCE) grid.setWalkableAt(x, z, false);
    }
  }
  return grid;
}

// Traverse every crossed cell, including both sides of a diagonal corner.
// The navigation grid already includes clearance around physical obstacles.
export function clearWalk(grid: WalkGrid, from: Point, to: Point) {
  if (![from.x, from.z, to.x, to.z].every(Number.isFinite)) return false;
  const ox = Math.floor(grid.width / 2), oz = Math.floor(grid.height / 2);
  let x = Math.round(from.x) + ox, z = Math.round(from.z) + oz;
  const endX = Math.round(to.x) + ox, endZ = Math.round(to.z) + oz;
  if (!grid.isWalkableAt(x, z) || !grid.isWalkableAt(endX, endZ)) return false;
  const dx = to.x - from.x, dz = to.z - from.z, stepX = Math.sign(dx), stepZ = Math.sign(dz);
  while (x !== endX || z !== endZ) {
    const tx = x === endX ? Infinity : (x - ox + stepX * .5 - from.x) / dx;
    const tz = z === endZ ? Infinity : (z - oz + stepZ * .5 - from.z) / dz;
    if (Math.abs(tx - tz) < 1e-10) {
      if (!grid.isWalkableAt(x + stepX, z) || !grid.isWalkableAt(x, z + stepZ)) return false;
      x += stepX; z += stepZ;
    } else if (tx < tz) x += stepX;
    else z += stepZ;
    if (!grid.isWalkableAt(x, z)) return false;
  }
  return true;
}

// Consume reached waypoints in the same frame and cap the final step to avoid
// oscillating past short segments at high speed or low frame rates.
export function followPath(position: Point, path: Point[], speed: number, dt: number, canWalk?: (from: Point, to: Point) => boolean) {
  while (path.length && Math.hypot(path[0].x - position.x, path[0].z - position.z) < .12) path.shift();
  if (!path.length || speed <= 0) return { x: 0, z: 0 };
  if (canWalk) while (path.length > 1 && canWalk(position, path[1])) path.shift();
  let target = path[0];
  if (canWalk && path.length > 1) {
    const distance = Math.hypot(target.x - position.x, target.z - position.z), lookahead = Math.min(.8, speed * .16);
    if (distance < lookahead) {
      const next = path[1], length = Math.hypot(next.x - target.x, next.z - target.z);
      const blend = Math.min(1, (lookahead - distance) / Math.max(length, .001));
      const turn = { x: target.x + (next.x - target.x) * blend, z: target.z + (next.z - target.z) * blend };
      if (canWalk(position, turn)) target = turn;
    }
  }
  const dx = target.x - position.x, dz = target.z - position.z, distance = Math.hypot(dx, dz);
  const scale = Math.min(speed, distance / Math.max(dt, 1 / 60)) / distance;
  return { x: dx * scale, z: dz * scale };
}
