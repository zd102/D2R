import { POTIONS, emptyPotions, POTION_LIMIT } from './potions.ts';
import type { HeroState } from './model.ts';
import { RUNES } from './items.ts';
import { SaveError, type SavedProfile } from './save-format.ts';

export type SharedResources = { revision: number; gold: number; runes: HeroState['runes']; members: string[]; potions?: number[]; potionMembers?: string[] };
export const resourceMember = (profile: SavedProfile) => `${profile.id}:${profile.createdAt}`;
export function parseResources(value: unknown): SharedResources {
  const data = value as SharedResources;
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Number.isSafeInteger(data.gold) || data.gold < 0
    || !Array.isArray(data.runes) || !data.runes.every(rune => typeof rune === 'string' && Object.hasOwn(RUNES, rune))
    || !Array.isArray(data.members) || !data.members.every(id => typeof id === 'string')) throw new SaveError('共享金币或符文数据无法读取，原数据已保留。', 'corrupt');
  if (data.potions !== undefined || data.potionMembers !== undefined) {
    if (!Array.isArray(data.potions) || data.potions.length !== POTIONS.length || !data.potions.every(count => Number.isSafeInteger(count) && count >= 0 && count <= POTION_LIMIT)
      || !Array.isArray(data.potionMembers) || !data.potionMembers.every(id => typeof id === 'string')) throw new SaveError('共享药水数据无法读取，原数据已保留。', 'corrupt');
  }
  return structuredClone(data);
}
export function collectResources(previous: SharedResources | undefined, profiles: SavedProfile[]): SharedResources {
  const resources = previous ? parseResources(previous) : { revision: 0, gold: 0, runes: [], members: [] };
  const firstMigration = resources.potions === undefined;
  resources.potions ??= emptyPotions(); resources.potionMembers ??= [];
  if (firstMigration) resources.revision++;
  for (const profile of profiles) {
    const member = resourceMember(profile);
    if (!resources.potionMembers.includes(member)) {
      if (!profile.hero.potionsShared) resources.potions = resources.potions.map((count, index) => count + (profile.hero.potions[index] ?? 0));
      resources.potionMembers.push(member); resources.revision++;
    }
    if (resources.members.includes(member)) continue;
    resources.gold += profile.hero.gold; resources.runes = resources.runes.concat(profile.hero.runes); resources.members.push(member);
    resources.revision++;
  }
  return parseResources(resources);
}
export function withResources(profile: SavedProfile, resources?: SharedResources): SavedProfile {
  return resources ? { ...profile, resourcesRevision: resources.revision, hero: { ...profile.hero, gold: resources.gold, runes: [...resources.runes], ...(resources.potions ? { potions: [...resources.potions], potionsShared: true } : {}) } } : profile;
}
export function updateResources(resources: SharedResources, hero: HeroState, expectedRevision: number | undefined) {
  if (expectedRevision !== resources.revision) throw new SaveError('共享金币、符文或药水已在其他角色中更新，请重新载入。', 'conflict');
  const next = parseResources({ ...resources, gold: hero.gold, runes: hero.runes, ...(resources.potions ? { potions: hero.potions } : {}) });
  if (next.gold !== resources.gold || JSON.stringify(next.runes) !== JSON.stringify(resources.runes) || JSON.stringify(next.potions) !== JSON.stringify(resources.potions)) next.revision++;
  return next;
}
