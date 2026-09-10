import type { Level, MapPoint } from './campaign.ts';

type Pair = [number, number];
type LayoutDraft = { path: Pair[]; wings: Pair[]; width: number; room: number; shape?: 'round' | 'rect' | 'octagon'; axis?: boolean; boss?: Pair; links?: [number, number][] };
// Authored room graphs follow each area's identity; all share the saved entrance.
const drafts: LayoutDraft[] = [
  { path: [[-11,2],[-20,-12],[-6,-20],[12,-25]], wings: [[17,15],[-29,3],[23,-9],[-25,-27],[27,-25],[-15,26]], width: 3.2, room: 11, shape: 'round' },
  { path: [[0,0],[-14,-8],[-14,-22],[0,-25]], wings: [[-20,15],[21,2],[22,-16],[-29,-10],[20,-27],[16,26]], width: 4.3, room: 12 },
  { path: [[-12,1],[-12,-13],[9,-13],[9,-25]], wings: [[18,16],[-27,2],[-27,-20],[26,-4],[26,-25],[-18,26]], width: 4.5, room: 11, axis: true },
  { path: [[-12,4],[-12,-10],[12,-10],[12,-25]], wings: [[19,16],[-28,4],[-28,-20],[28,-10],[-15,-27],[-15,26]], width: 2.8, room: 10, axis: true },
  { path: [[0,0],[-16,0],[-16,-19],[0,-19]], wings: [[19,15],[-28,4],[18,-8],[-29,-25],[24,-24],[-16,26]], width: 3.3, room: 11, axis: true },
  { path: [[12,3],[12,-10],[-12,-10],[-12,-25]], wings: [[-18,16],[28,5],[28,-21],[-27,-6],[16,-27],[17,27]], width: 3.1, room: 10, axis: true },
  { path: [[-12,2],[-12,-12],[8,-12],[8,-25]], wings: [[18,16],[-28,0],[-28,-22],[25,-6],[-16,-28],[-17,27]], width: 2.8, room: 12, axis: true },
  { path: [[-11,4],[-22,-8],[-8,-17],[13,-23]], wings: [[17,16],[-29,9],[23,-4],[-28,-26],[29,-23],[-18,25]], width: 1.65, room: 10, shape: 'round' },
  { path: [[0,0],[-18,0],[0,-18],[18,0]], wings: [[-28,0],[28,0],[0,-27],[-18,22],[18,22],[0,28]], width: 2.2, room: 9, shape: 'octagon', axis: true,
    links: [[0,1],[1,2],[1,3],[1,4],[3,5],[2,6],[4,7],[3,8],[0,9],[0,10],[0,11],[9,11],[10,11]] },
  { path: [[0,1],[-13,-7],[-13,-20],[0,-23]], wings: [[20,15],[-26,5],[24,-8],[-28,-22],[25,-26],[-16,27]], width: 3.1, room: 12, shape: 'octagon', axis: true },
  { path: [[12,3],[20,-9],[4,-17],[-9,-25]], wings: [[-18,16],[29,6],[-22,-7],[26,-23],[-26,-25],[15,27]], width: 4.1, room: 12, shape: 'round' },
  { path: [[-11,0],[3,-9],[20,-17],[10,-26]], wings: [[18,17],[-27,6],[-23,-16],[29,-4],[-16,-28],[-17,27]], width: 3.8, room: 12, shape: 'round' },
  { path: [[0,0],[15,0],[15,-18],[0,-18]], wings: [[-21,15],[29,7],[-22,-9],[29,-26],[-22,-27],[18,27]], width: 4.2, room: 12, axis: true },
  { path: [[0,0],[-12,-8],[0,-16],[12,-24]], wings: [[-21,15],[22,8],[-27,-12],[27,-12],[-25,-27],[18,26]], width: 4.1, room: 12, axis: true },
  { path: [[-14,3],[-14,-12],[12,-12],[12,-25]], wings: [[18,17],[-28,4],[-28,-24],[28,-4],[-10,-27],[-18,26]], width: 3.5, room: 12, axis: true },
  { path: [[11,2],[-3,-9],[-18,-18],[-10,-27]], wings: [[-19,16],[27,8],[25,-12],[-29,-3],[23,-27],[17,27]], width: 4.6, room: 14, shape: 'round' },
  { path: [[-13,2],[-22,-9],[-6,-17],[13,-25]], wings: [[18,16],[-30,7],[23,-5],[-28,-25],[29,-25],[-17,27]], width: 4.4, room: 14, shape: 'round' },
  { path: [[-12,1],[5,-9],[21,-17],[9,-25]], wings: [[18,17],[-27,4],[-24,-13],[29,-5],[-18,-28],[-18,27]], width: 3.3, room: 10, shape: 'octagon' },
  { path: [[0,1],[0,-9],[-18,-15],[18,-15]], wings: [[-22,14],[22,14],[-28,-22],[28,-22],[-16,-30],[16,-30]], width: 3.6, room: 11, axis: true,
    links: [[0,1],[1,2],[2,3],[2,4],[2,5],[0,6],[0,7],[3,8],[4,9],[8,10],[9,11],[10,5],[11,5]] },
  { path: [[-12,2],[-17,-12],[0,-17],[17,-23]], wings: [[19,15],[-28,4],[26,-7],[-28,-23],[28,-25],[-18,27]], width: 3.8, room: 12, shape: 'octagon', boss: [0,-30] },
  { path: [[-8,0],[10,-8],[-8,-17],[10,-25]], wings: [[-23,15],[24,5],[-27,-9],[27,-17],[-24,-27],[16,27]], width: 4.5, room: 13 },
  { path: [[13,2],[13,-12],[-10,-12],[-10,-26]], wings: [[-21,15],[28,7],[-26,-3],[27,-24],[-26,-25],[17,27]], width: 4.1, room: 12 },
  { path: [[-12,3],[-20,-10],[-3,-18],[13,-25]], wings: [[18,16],[-29,7],[25,-8],[-28,-24],[28,-26],[-16,27]], width: 3.3, room: 11, shape: 'round' },
  { path: [[-11,1],[-15,-11],[0,-17],[15,-24]], wings: [[19,16],[-26,4],[27,-5],[-28,-22],[27,-25],[-17,27]], width: 3.7, room: 11, shape: 'round', boss: [0,-29] },
  { path: [[0,1],[0,-8],[0,-18],[0,-25]], wings: [[-19,14],[19,14],[-19,-8],[19,-8],[-19,-25],[19,-25]], width: 3.5, room: 11, shape: 'octagon', axis: true, boss: [0,-30],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[0,6],[0,7],[2,8],[2,9],[4,10],[4,11],[6,8],[7,9],[8,10],[9,11]] },
];
const point = ([x, z]: Pair): MapPoint => ({ x, z });
export function campaignLayout(level: Level) {
  const draft = drafts[level.index], spawn = { x: 0, z: 11 }, supply = { x: -5.8, z: 12 };
  const boss = point(draft.boss ?? [0, -33]), exit = { x: boss.x, z: boss.z - 4 };
  const route = [spawn, ...draft.path.map(point), boss], wings = draft.wings.map(point);
  const rooms = [...route.slice(1, -1), ...wings].map((p, i) => ({ ...p, width: draft.room + i % 3, depth: draft.room - 1 + (i + level.step) % 3, shape: draft.shape ?? 'rect' }));
  const connections: [MapPoint, MapPoint][] = [];
  const connect = (a: MapPoint, b: MapPoint) => {
    if (draft.axis && a.x !== b.x && a.z !== b.z) {
      const bend = { x: b.x, z: a.z }; connections.push([a, bend], [bend, b]);
    } else connections.push([a, b]);
  };
  if(draft.links) {
    const points=[...route,...wings];draft.links.forEach(([a,b])=>connect(points[a],points[b]));
  } else {
    route.slice(1).forEach((p, i) => connect(route[i], p));
    wings.forEach((p, i) => connect(route[[0, 1, 3, 2, 4, 0][i]], p));
    connect(wings[0], wings[5]); connect(wings[1], wings[3]); connect(wings[2], wings[4]);
  }
  connect(spawn, supply); connect(boss, exit);
  const objects = Array.from({ length: level.quest.kind === 'interact' ? level.quest.count : 0 }, (_, i) => ({ ...wings[[2, 3, 4][i]] }));
  const chests = wings.slice(0, 4 + Math.floor(level.act / 2)).map((p, id) => ({ id, x: p.x + (id % 2 ? -2 : 2), z: p.z + 2 }));
  return { route, rooms, connections, objects, chests, spawn, boss, exit, supply, corridorWidth: draft.width, bossRadius: [19,23,24].includes(level.index) ? 7 : 6 };
}
export type LevelLayout = ReturnType<typeof campaignLayout>;
export function distanceToSegment(x: number, z: number, a: MapPoint, b: MapPoint) {
  const length = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / length)) : 0;
  return Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z));
}
export function layoutWalkable(layout: LevelLayout, x: number, z: number, bound = 39) {
  return Math.abs(x) < bound && Math.abs(z) < bound && (
    layout.connections.some(([a, b]) => distanceToSegment(x, z, a, b) < layout.corridorWidth) ||
    Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 6 || Math.hypot(x - layout.boss.x, z - layout.boss.z) < layout.bossRadius ||
    layout.rooms.some(room => {
      const dx = Math.abs(x - room.x) / (room.width / 2), dz = Math.abs(z - room.z) / (room.depth / 2);
      return room.shape === 'round' ? dx * dx + dz * dz < 1 : room.shape === 'octagon' ? Math.max(dx, dz) < 1 && dx + dz < 1.5 : Math.max(dx, dz) < 1;
    }));
}
