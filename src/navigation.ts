import type PF from 'pathfinding';

type Point = { x: number; z: number };
type WalkGrid = Pick<PF.Grid, 'width' | 'height' | 'isWalkableAt'>;

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
export function followPath(position: Point, path: Point[], speed: number, dt: number) {
  while (path.length && Math.hypot(path[0].x - position.x, path[0].z - position.z) < .12) path.shift();
  if (!path.length || speed <= 0) return { x: 0, z: 0 };
  const dx = path[0].x - position.x, dz = path[0].z - position.z, distance = Math.hypot(dx, dz);
  const scale = Math.min(speed, distance / Math.max(dt, 1 / 60)) / distance;
  return { x: dx * scale, z: dz * scale };
}
