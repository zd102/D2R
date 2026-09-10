import type { Level, MapPoint } from './campaign.ts';
import { mapRandom, shuffled } from './map-random.ts';
import { areaMapProfile, MAP_SIZE_LIMIT } from './area-map-profiles.ts';

type Pair = [number, number];
type LayoutDraft = { path: Pair[]; wings: Pair[]; width: number; room: number; shape?: 'round' | 'rect' | 'octagon'; axis?: boolean; boss?: Pair; links?: [number, number][]; loops?: boolean; objectives?: Pair[]; arena?: number };
// Save-file coordinate ceiling only. Live map bounds belong to each layout.
export const MAP_BOUND = Math.floor((MAP_SIZE_LIMIT - 3) / 2);
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
// Expand the authored geography without stretching doorways, actors or the saved entrance.
// Fixed set pieces below replace generic loops with the corresponding area's topology.
const expanded: LayoutDraft[] = drafts.map(draft => ({ ...draft,
  path: draft.path.map(([x,z]) => [Math.round(x*1.27), Math.round(z*1.27)]),
  wings: draft.wings.map(([x,z]) => [Math.round(x*1.27), Math.round(z*1.27)]),
  boss: [0,-41], room: draft.room*1.12,
}));
Object.assign(expanded[0], { width: 2.5, loops: false, room: 13 }); // Branching cave pockets.
Object.assign(expanded[1], { // Cemetery enclosure, two crypt wings and a central burial field.
  path: [[0,-2],[-13,-12],[0,-22],[13,-30]], wings: [[-26,9],[26,9],[-30,-19],[30,-19],[-24,-36],[24,32]],
  room: 17, width: 4, boss: [0,-34], arena: 12,
  links: [[0,1],[1,2],[2,3],[3,4],[4,5],[1,6],[1,7],[2,8],[4,9],[3,10],[7,11],[6,8],[7,9]],
});
Object.assign(expanded[2], { // Ruined streets surrounding Cain's square.
  path: [[0,-3],[-17,-3],[-17,-22],[0,-22]], wings: [[22,14],[-34,5],[22,-8],[-33,-30],[26,-30],[-20,32]],
  width: 3.3, room: 15, objectives: [[0,-3]],
});
Object.assign(expanded[3], { width: 2, room: 13, loops: false }); // Tower cellars and dead-end treasury rooms.
Object.assign(expanded[4], { path: [[0,-3],[-20,-3],[-20,-25],[0,-25]], width: 2.5, room: 13, arena: 9 });
Object.assign(expanded[5], { // Parallel sewer galleries joined across the drainage channel.
  path: [[14,3],[14,-15],[-14,-15],[-14,-32]], wings: [[-18,19],[34,3],[34,-30],[-34,-7],[15,-36],[20,34]],
  width: 2.4, room: 13, loops: false,
});
Object.assign(expanded[6], { width: 2.3, room: 14, loops: false });
Object.assign(expanded[7], { // Long single-file worm tunnels; side nests never reconnect.
  path: [[-12,0],[-27,-12],[-11,-24],[20,-28]], wings: [[21,18],[-37,4],[29,-7],[-32,-35],[37,-31],[-19,32]],
  width: 1.35, room: 12, loops: false, boss: [6,-41], arena: 7,
});
Object.assign(expanded[8], { // Four independent arms from a central platform, no perimeter shortcut.
  path: [[0,0],[0,-15],[-13,-15],[-13,-33]], wings: [[-20,0],[-39,0],[20,0],[39,0],[0,29],[0,39]],
  width: 1.7, room: 12, boss: [0,-41], objectives: [[-13,-33]],
  links: [[0,1],[1,2],[2,3],[3,4],[4,5],[1,6],[6,7],[1,8],[8,9],[0,10],[10,11]],
});
Object.assign(expanded[9], { width: 2.4, room: 14, arena: 8, loops: false });
Object.assign(expanded[10], { width: 3, room: 17, loops: false });
Object.assign(expanded[11], { // Meandering river banks, short crossings and isolated village clearings.
  path: [[-15,0],[3,-12],[25,-21],[9,-35]], wings: [[23,20],[-35,9],[-29,-19],[37,-3],[-20,-36],[-22,34]],
  width: 2.7, room: 16, loops: false,
});
Object.assign(expanded[12], { width: 3.2, room: 16 });
Object.assign(expanded[13], { // Symmetric temple approach and council courtyards.
  path: [[0,-2],[-17,-11],[0,-22],[17,-31]], wings: [[-26,19],[26,19],[-30,-12],[30,-12],[-24,-35],[24,-35]],
  width: 3.5, room: 15, arena: 10,
  links: [[0,1],[1,2],[2,3],[3,4],[4,5],[0,6],[0,7],[2,8],[4,9],[3,10],[4,11],[6,8],[7,9],[10,5],[11,5]],
});
Object.assign(expanded[14], { // A moat separates Mephisto's dais from the entry galleries.
  path: [[-18,0],[-18,-17],[-27,-29],[-17,-38]], wings: [[23,20],[-35,6],[18,-10],[33,-26],[-33,-32],[-23,33]],
  width: 2.8, room: 15, boss: [0,-36], arena: 8, loops: false,
  links: [[0,1],[1,2],[2,3],[3,4],[4,5],[0,6],[1,7],[6,8],[8,9],[9,5],[3,10],[0,11]],
});
Object.assign(expanded[15], { room: 20, width: 5.5 });
Object.assign(expanded[16], { room: 19, width: 5 });
Object.assign(expanded[17], { width: 2.6, room: 13, loops: false }); // Basalt islands over lava.
for (const index of [18,19]) Object.assign(expanded[index], { // Three seal wings around a cruciform nave.
  path: [[0,-2],[0,-15],[-20,-15],[-20,-33]], wings: [[-24,15],[24,15],[-38,-22],[38,-22],[20,-33],[0,-39]],
  width: 3.2, room: index===19 ? 15 : 13, axis: true, boss: index===19 ? [0,-15] : [0,-39], arena: index===19 ? 10 : 7,
  objectives: index===19 ? [[-20,-33],[20,-33],[0,-39]] : [[-38,-22],[38,-22]],
  links: [[0,1],[1,2],[2,3],[3,4],[2,5],[0,6],[0,7],[3,8],[2,9],[9,10],[2,11]],
});
Object.assign(expanded[20], { // Long uphill lanes with staggered barricade clearings.
  path: [[-10,-1],[10,-13],[-10,-25],[10,-36]], wings: [[-29,17],[30,5],[-33,-12],[33,-23],[-28,-36],[20,34]],
  width: 3.5, room: 15, loops: false,
});
Object.assign(expanded[21], { width: 3.2, room: 17, loops: false });
Object.assign(expanded[22], { width: 2.2, room: 14, loops: false });
Object.assign(expanded[23], { // A single summit arena reached by an approach, with peripheral ledges.
  path: [[-10,0],[-16,-12],[0,-22],[16,-29]], wings: [[23,20],[-33,5],[33,-7],[-32,-27],[32,-33],[-21,34]],
  room: 11, boss: [0,-30], arena: 15, objectives: [[-8,-29],[0,-39],[8,-29]],
});
Object.assign(expanded[24], { // Long throne aisle, paired galleries and a separate chamber beyond it.
  path: [[0,-2],[0,-14],[0,-26],[0,-33]], wings: [[-25,17],[25,17],[-25,-12],[25,-12],[-25,-32],[25,-32]],
  width: 3, room: 15, arena: 8,
});
function authoredLayout(level: Level) {
  const draft = expanded[level.index], spawn = { x: 0, z: 11 }, supply = { x: -5.8, z: 12 };
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
    if (draft.loops !== false) { connect(wings[0], wings[5]); connect(wings[1], wings[3]); connect(wings[2], wings[4]); }
  }
  connect(spawn, supply); connect(boss, exit);
  const objects = Array.from({ length: level.quest.kind === 'interact' ? level.quest.count : 0 }, (_, i) => draft.objectives ? point(draft.objectives[i]) : ({ ...wings[[2, 3, 4][i]] }));
  const chests = wings.slice(0, 4 + Math.floor(level.act / 2)).map((p, id) => ({ id, x: p.x + (id % 2 ? -2 : 2), z: p.z + 2 }));
  return { route, rooms, connections, objects, chests, spawn, boss, exit, supply, corridorWidth: draft.width, bossRadius: draft.arena ?? 7 };
}
/** Authored geography supplies the identity; each visit builds its own room graph. */
export function campaignLayout(level: Level, seed = 0) {
  const random = mapRandom(seed ^ Math.imul(level.index + 1, 7919));
  const base = authoredLayout(level), draft = expanded[level.index], profile = areaMapProfile(level);
  const bounds = { x: (profile.width - 3) / 2, z: (profile.height - 3) / 2 };
  const anchors = [...base.route, ...base.rooms];
  const margin = Math.max(14 * profile.roomScale, base.bossRadius + 3);
  const scaleX = (bounds.x - margin) / Math.max(...anchors.map(p => Math.abs(p.x))) * (.94 + random() * .06);
  const scaleZ = (bounds.z - margin) / Math.max(...anchors.map(p => Math.abs(p.z))) * (.94 + random() * .06);
  const organic = draft.shape === 'round';
  const transformed = new Map<string, MapPoint>();
  const transform = (p: MapPoint): MapPoint => {
    if (p === base.spawn || p === base.supply) return { ...p };
    const key = `${p.x},${p.z}`;
    let result = transformed.get(key);
    if (!result) {
      result = { x: Math.round(p.x * scaleX + (organic ? (random() - .5) * 4 : 0)), z: Math.round(p.z * scaleZ + (organic ? (random() - .5) * 4 : 0)) };
      transformed.set(key, result);
    }
    return result;
  };
  const route = base.route.map(transform), spawn = route[0], supply = { ...base.supply }, boss = route.at(-1)!;
  const exit = { x: boss.x, z: boss.z - 4 };
  // Exit direction belongs to the boss set piece, and is not independently warped.
  transformed.set(`${base.exit.x},${base.exit.z}`, exit);
  const rooms = base.rooms.map(room => ({ ...room, ...transform(room), width: room.width * profile.roomScale * (1.02 + random() * .2), depth: room.depth * profile.roomScale * (1.02 + random() * .2) }));
  const connections: [MapPoint, MapPoint][] = base.connections.map(([a,b]) => [transform(a), transform(b)]);
  const wings = rooms.slice(4), branches: MapPoint[] = [];
  // Outward pockets vary both the graph and the floor plan. Their parent is always connected.
  const branchCount = profile.branches[0] + Math.floor(random() * (profile.branches[1] - profile.branches[0] + 1));
  for (const parent of shuffled(wings, random).slice(0, branchCount)) {
    const length = Math.hypot(parent.x, parent.z) || 1;
    const reach = 12 + random() * 6;
    const p = { x: Math.round(Math.max(-bounds.x+9, Math.min(bounds.x-9, parent.x + parent.x / length * reach))), z: Math.round(Math.max(-bounds.z+9, Math.min(bounds.z-9, parent.z + parent.z / length * reach))) };
    branches.push(p);
    rooms.push({ ...p, width: 10 + random() * 4, depth: 10 + random() * 4, shape: draft.shape ?? 'rect' });
    if (draft.axis) {
      const bend = random() < .5 ? { x: parent.x, z: p.z } : { x: p.x, z: parent.z };
      connections.push([parent, bend], [bend, p]);
    } else connections.push([parent, p]);
  }
  // Preserve islands, nests, moats and seal wings. Towns and open plains get variable shortcuts.
  if (draft.loops !== false && !draft.links && level.index !== 23 && level.index !== 24) {
    const choices = shuffled([[0,2],[1,4],[3,5]] as const, random);
    for (const [a,b] of choices.slice(0, 1 + Math.floor(random() * 2))) connections.push([wings[a], wings[b]]);
  }
  const objects = draft.objectives ? base.objects.map(transform) : shuffled([...wings.slice(2), ...branches], random).slice(0, base.objects.length).map(p => ({ x: p.x, z: p.z }));
  if (level.index === 23) objects.splice(0, objects.length, ...base.objects.map(p => ({ x: boss.x + p.x - base.boss.x, z: boss.z + p.z - base.boss.z })));
  // Keep one early cache; the rest reward searching distant rooms without raising the loot budget.
  const chestSites = [wings[0], ...shuffled([...wings.slice(1), ...branches], random)];
  const chests = chestSites.slice(0, base.chests.length).map((p,id) => ({ id, x: p.x + 2, z: p.z + 2 }));
  const layout = { ...base, seed: seed >>> 0, bounds, width: profile.width, height: profile.height, route, spawn, supply, boss, exit, rooms, connections, branches, objects, chests };
  if (level.index === 8) buildArcaneArms(layout, random);
  return layout;
}

/** Hidden areas use authored footprints too, but remain separate from the 25-level campaign graph. */
export function specialLayout(level: Level, seed = 0) {
  const random = mapRandom(seed ^ Math.imul(level.index + 1, 7919));
  const cow = level.special === 'cow';
  const width = cow ? 293 : 61, height = cow ? 293 : 61;
  const bounds = { x: (width - 3) / 2, z: (height - 3) / 2 };
  const spawn = { x: 0, z: 11 }, supply = { x: -5.8, z: 12 };
  const boss = cow ? { x: 0, z: -112 } : { x: 0, z: -18 };
  const exit = { x: boss.x, z: boss.z - 4 };
  if (!cow) {
    const route = [spawn, { x: 0, z: -3 }, boss];
    return {
      seed: seed >>> 0, bounds, width, height, route, spawn, supply, boss, exit,
      rooms: [{ x: 0, z: -3, width: 22, depth: 18, shape: 'octagon' as const }, { x: 0, z: -18, width: 20, depth: 18, shape: 'octagon' as const }],
      connections: [[spawn, supply], [spawn, route[1]], [route[1], boss], [boss, exit]] as [MapPoint, MapPoint][],
      branches: [], objects: [], chests: [], corridorWidth: 4.8, bossRadius: 8,
    };
  }
  const sites = [
    { x: -42, z: -8 }, { x: 35, z: -17 }, { x: -72, z: -48 }, { x: 5, z: -57 }, { x: 76, z: -61 },
    { x: -50, z: -94 }, { x: 48, z: -101 }, { x: 0, z: -112 }, { x: -108, z: -90 }, { x: 104, z: -36 },
  ].map(point => ({ x: point.x + Math.round((random() - .5) * 7), z: point.z + Math.round((random() - .5) * 7) }));
  sites[7] = boss;
  const route = [spawn, { x: -42, z: -8 }, { x: -72, z: -48 }, { x: -50, z: -94 }, boss];
  const rooms = sites.map((point, index) => ({ ...point, width: 26 + index % 3 * 5, depth: 24 + (index + 1) % 3 * 5, shape: 'round' as const }));
  const connections: [MapPoint, MapPoint][] = [[spawn, supply], [spawn, route[1]], [route[1], route[2]], [route[2], route[3]], [route[3], boss], [boss, exit]];
  for (const [a, b] of [[0, 1], [1, 3], [3, 4], [4, 6], [6, 7], [0, 2], [2, 5], [5, 8], [1, 9], [9, 4]] as const) connections.push([sites[a], sites[b]]);
  return {
    seed: seed >>> 0, bounds, width, height, route, spawn, supply, boss, exit, rooms, connections,
    branches: sites.slice(4), objects: [], chests: sites.slice(0, 4).map((point, id) => ({ id, x: point.x + 3, z: point.z + 2 })), corridorWidth: 5.5, bossRadius: 10,
  };
}

function buildArcaneArms(layout: LevelLayout, random: () => number) {
  const hub = { x: 0, z: 0 }, arms: MapPoint[][] = [];
  layout.rooms = []; layout.connections = []; layout.branches = [];
  for (const [dx,dz] of [[0,-1],[-1,0],[1,0],[0,1]]) {
    const arm: MapPoint[] = [];
    for (let step = 1; step <= 3; step++) {
      const extent = dx ? layout.bounds.x : layout.bounds.z;
      const distance = step * (extent - 13) / 3 * (.94 + random() * .06);
      const p = { x: Math.round(dx * distance), z: Math.round(dz * distance) };
      layout.connections.push([arm.at(-1) ?? hub, p]); arm.push(p);
      layout.rooms.push({ ...p, width: 11 + random() * 3, depth: 11 + random() * 3, shape: 'octagon' });
    }
    arms.push(arm); layout.branches.push(arm[2]);
  }
  layout.rooms.push({ ...hub, width: 13, depth: 13, shape: 'octagon' });
  const selected = arms[Math.floor(random() * arms.length)];
  layout.boss = { ...selected[2] };
  layout.objects = [{ ...selected[1] }];
  const direction = { x: Math.sign(layout.boss.x), z: Math.sign(layout.boss.z) };
  layout.exit = { x: layout.boss.x + direction.x * 4, z: layout.boss.z + direction.z * 4 };
  layout.route = [layout.spawn, hub, ...selected, layout.boss];
  layout.connections.push([layout.spawn, layout.supply], [layout.boss, layout.exit]);
  layout.chests = shuffled(arms, random).map((arm,id) => ({ id, x: arm[2].x + 2, z: arm[2].z + 2 }));
}
export type LevelLayout = ReturnType<typeof campaignLayout>;
export function distanceToSegment(x: number, z: number, a: MapPoint, b: MapPoint) {
  const length = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / length)) : 0;
  return Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z));
}
export function layoutWalkable(layout: LevelLayout, x: number, z: number) {
  return Math.abs(x) < layout.bounds.x && Math.abs(z) < layout.bounds.z && (
    layout.connections.some(([a, b]) => distanceToSegment(x, z, a, b) < layout.corridorWidth) ||
    Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 6 || Math.hypot(x - layout.boss.x, z - layout.boss.z) < layout.bossRadius ||
    layout.rooms.some(room => {
      const dx = Math.abs(x - room.x) / (room.width / 2), dz = Math.abs(z - room.z) / (room.depth / 2);
      return room.shape === 'round' ? dx * dx + dz * dz < 1 : room.shape === 'octagon' ? Math.max(dx, dz) < 1 && dx + dz < 1.5 : Math.max(dx, dz) < 1;
    }));
}
