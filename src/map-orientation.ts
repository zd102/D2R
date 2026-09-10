import type { MapPoint } from './campaign.ts';
import type { LevelLayout } from './level-layouts.ts';

export type MapRotation = 0 | 1 | 2 | 3;
export function rotateMapPoint<T extends MapPoint>(point: T, turns: number): T {
  const rotation = (turns % 4 + 4) % 4;
  const x = rotation === 1 ? -point.z : rotation === 2 ? -point.x : rotation === 3 ? point.z : point.x;
  const z = rotation === 1 ? point.x : rotation === 2 ? -point.z : rotation === 3 ? -point.x : point.z;
  return { ...point, x: x || 0, z: z || 0 };
}

/** Rotate the entire map, including rectangular footprints and all graph anchors. */
export function rotateLayout(layout: LevelLayout, turns: number): LevelLayout {
  const rotation = (turns % 4 + 4) % 4, swap = rotation % 2 !== 0;
  const point = <T extends MapPoint>(p: T) => rotateMapPoint(p, rotation);
  return {
    ...layout, rotation: (layout.rotation + rotation) % 4 as MapRotation,
    width: swap ? layout.height : layout.width, height: swap ? layout.width : layout.height,
    bounds: swap ? { x: layout.bounds.z, z: layout.bounds.x } : { ...layout.bounds },
    spawn: point(layout.spawn), supply: point(layout.supply), boss: point(layout.boss), exit: point(layout.exit),
    route: layout.route.map(point), branches: layout.branches.map(point), objects: layout.objects.map(point), chests: layout.chests.map(point),
    connections: layout.connections.map(([a, b]) => [point(a), point(b)]),
    rooms: layout.rooms.map(room => ({ ...point(room), width: swap ? room.depth : room.width, depth: swap ? room.width : room.depth })),
  };
}
