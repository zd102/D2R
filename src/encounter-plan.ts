import { eliteCount, levelTuning, type Level, type MapPoint } from './campaign.ts';
import { ENCOUNTERS, MONSTERS } from './bestiary.ts';
import type { LevelLayout } from './level-layouts.ts';
import { mapRandom, shuffled } from './map-random.ts';
import { areaMapProfile } from './area-map-profiles.ts';
import { layoutWalkable } from './level-layouts.ts';

export type EncounterPack = MapPoint & { species: string[]; role: 'route' | 'exploration' | 'guard' };
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const lifeWeight = (id: string) => Math.max(.7, Math.min(1.4, Math.sqrt(MONSTERS[id].hp / 24)));

/** Populate space, then divide the area's reward budget across its actual population. */
export function encounterPlan(level: Level, layout: LevelLayout, difficulty: number) {
  const random = mapRandom(layout.seed ^ 0x51ed270b), pool = ENCOUNTERS[level.index];
  const packs: EncounterPack[] = [];
  const add = (point: MapPoint, role: EncounterPack['role']) => {
    if (distance(point, layout.spawn) < 15 || distance(point, layout.supply) < 12 || distance(point, layout.boss) < 10 || packs.some(pack => distance(pack, point) < 10)) return;
    const count = level.index === 7 || level.index === 8 ? 2 : 2 + Number(random() > .65);
    const start = Math.floor(random() * pool.length);
    packs.push({ x: point.x, z: point.z, role, species: Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]) });
  };
  layout.objects.forEach(p => add(p, 'guard'));
  layout.route.slice(1, -1).forEach(p => add(p, 'route'));
  layout.rooms.forEach(p => add(p, 'exploration'));
  // Long crossings get encounters too; encounter density does not depend on a lucky room roll.
  for (const [from,to] of layout.connections) {
    const steps = Math.ceil(distance(from,to) / 22);
    for (let i = 1; i < steps; i++) add({ x: from.x + (to.x-from.x)*i/steps, z: from.z + (to.z-from.z)*i/steps }, 'route');
  }
  // Bound actor/AI cost and combat time. Keep quest guards and distribute remaining packs
  // by their distance from occupied sites, so a larger roll does not become a crowded grind.
  const limit = areaMapProfile(level).packs;
  const candidates = packs.splice(0);
  packs.push(...candidates.filter(pack => pack.role === 'guard'));
  while (packs.length < limit) {
    const remaining = candidates.filter(pack => !packs.includes(pack));
    if (!remaining.length) break;
    remaining.sort((a,b) => {
      const score = (p: MapPoint) => Math.min(distance(p, layout.spawn), ...packs.map(other => distance(p, other)));
      return score(b) - score(a);
    });
    packs.push(remaining[0]);
  }
  const oldCount = levelTuning(level, difficulty).packs * 3;
  const referenceWeight = Array.from({ length: oldCount }, (_, i) => lifeWeight(pool[i % pool.length])).reduce((sum,n) => sum+n, 0);
  const actualWeight = packs.flatMap(pack => pack.species).reduce((sum,id) => sum+lifeWeight(id), 0);
  const normalCount = packs.reduce((sum,pack) => sum+pack.species.length, 0);
  // A full exploration earns 20% more ordinary XP. Boss and elite rewards retain their value.
  const xpScale = referenceWeight * 1.2 / Math.max(1, actualWeight);
  const lootScale = Math.min(1, oldCount * 1.15 / Math.max(1, normalCount));
  const eliteSites: MapPoint[] = [];
  const eliteSpacing = Math.min(12, Math.min(layout.width, layout.height) * .12);
  const roomCorners = layout.rooms.flatMap(room => [-1,1].flatMap(dx => [-1,1].map(dz => ({x:room.x+dx*room.width*.25,z:room.z+dz*room.depth*.25}))));
  const preferred = [...layout.chests, ...layout.branches, ...layout.rooms].map(p => ({ x:p.x-2,z:p.z-2 }));
  for (const p of [...shuffled(preferred,random), ...shuffled(roomCorners,random)]) {
    if (!layoutWalkable(layout,p.x,p.z) || distance(p, layout.spawn) < 18 || distance(p, layout.boss) < 12 || eliteSites.some(site => distance(site,p) < eliteSpacing)) continue;
    eliteSites.push(p);
    if (eliteSites.length === eliteCount(level, difficulty)) break;
  }
  return { packs, eliteSites, xpScale, lootScale, normalCount, referenceWeight };
}
