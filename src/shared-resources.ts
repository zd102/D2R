import type { HeroState } from './model.ts';
import { RUNES } from './items.ts';
import { SaveError, type SavedProfile } from './save-format.ts';

export type SharedResources = { revision: number; gold: number; runes: HeroState['runes']; members: string[] };
export const resourceMember = (profile: SavedProfile) => `${profile.id}:${profile.createdAt}`;
export function parseResources(value: unknown): SharedResources {
  const data = value as SharedResources;
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Number.isSafeInteger(data.gold) || data.gold < 0
    || !Array.isArray(data.runes) || !data.runes.every(rune => typeof rune === 'string' && Object.hasOwn(RUNES, rune))
    || !Array.isArray(data.members) || !data.members.every(id => typeof id === 'string')) throw new SaveError('共享金币或符文数据无法读取，原数据已保留。', 'corrupt');
  return structuredClone(data);
}
export function collectResources(previous: SharedResources | undefined, profiles: SavedProfile[]): SharedResources {
  const resources = previous ? parseResources(previous) : { revision: 0, gold: 0, runes: [], members: [] };
  for (const profile of profiles) {
    const member = resourceMember(profile);
    if (resources.members.includes(member)) continue;
    resources.gold += profile.hero.gold; resources.runes = resources.runes.concat(profile.hero.runes); resources.members.push(member);
    resources.revision++;
  }
  return parseResources(resources);
}
export function withResources(profile: SavedProfile, resources?: SharedResources): SavedProfile {
  return resources ? { ...profile, resourcesRevision: resources.revision, hero: { ...profile.hero, gold: resources.gold, runes: [...resources.runes] } } : profile;
}
export function updateResources(resources: SharedResources, hero: HeroState, expectedRevision: number | undefined) {
  if (expectedRevision !== resources.revision) throw new SaveError('共享金币或符文已在其他角色中更新，请重新载入。', 'conflict');
  const next = parseResources({ ...resources, gold: hero.gold, runes: hero.runes });
  if (next.gold !== resources.gold || JSON.stringify(next.runes) !== JSON.stringify(resources.runes)) next.revision++;
  return next;
}
