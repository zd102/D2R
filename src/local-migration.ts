import { SHARED_STASH_ROWS } from './shared-stash.ts';
import { emptyPotions } from './potions.ts';
import { SaveStore, PROFILE_PREFIX, MIGRATION_KEY, type SavedProfile, type SharedStash } from './saves.ts';
import { SAVE_KEY, parseSave, newHero, type HeroState } from './model.ts';
import { placeItems, stashRows, type Item } from './items.ts';
import { refreshSharedStorage, sharedRaw, commitOriginMigration, finishOriginMigration } from './shared-storage.ts';
import { collectResources, type SharedResources } from './shared-resources.ts';

export type OriginSnapshot = { origin: string; capturedAt: number; entries: Record<string, string>; shared: string | null };
export async function captureLocalOrigin(): Promise<OriginSnapshot> {
  await refreshSharedStorage();
  return { origin: location.origin, capturedAt: Date.now(), entries: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('eclipse-ii-')).map(key => [key, localStorage.getItem(key)!])), shared: sharedRaw(localStorage) };
}
export function snapshotStore(snapshot: OriginSnapshot) {
  const entries = new Map(Object.entries(snapshot.entries));
  if (snapshot.shared !== null) entries.set('eclipse-ii-shared-stash-v1', snapshot.shared);
  return new SaveStore({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); }, key: index => [...entries.keys()][index] ?? null, get length() { return entries.size; } });
}
export function ownedItems(hero: HeroState): Item[] {
  return [...hero.inventory, ...hero.stash, ...hero.cube, ...Object.values(hero.equipment), ...Object.values(hero.alternate), ...Object.values(hero.corpse?.equipment ?? {}), ...(hero.corpse?.extras ?? [])].filter((item): item is Item => !!item);
}

function profilesFrom(snapshot: OriginSnapshot) {
  const store = snapshotStore(snapshot), profiles = store.list(false);
  if (store.invalidCount) throw new Error(`${snapshot.origin} 有 ${store.invalidCount} 个损坏存档，请先恢复；原数据未修改。`);
  const legacy = snapshot.entries[SAVE_KEY];
  if (legacy && !snapshot.entries[MIGRATION_KEY]) {
    const hero = parseSave(legacy); if (!hero) throw new Error('旧版存档无法读取。');
    profiles.push({ version: 2, id: 'legacy', name: '灰烬行者', createdAt: 0, updatedAt: 0, revision: 1, hero });
  }
  return profiles;
}
const progress = (p: SavedProfile) => [p.hero.level, p.hero.campaign.cleared.reduce((a, b) => a + b, 0), p.updatedAt, p.revision];
function ahead(a: SavedProfile, b: SavedProfile) {
  const left = progress(a), right = progress(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}
export type MergeReport = { characters: { name: string; level: number }[]; sharedItems: number; duplicateSharedItems: number; itemConflicts: number; overflowItems: number; sources: string[] };
export function planOriginMerge(target: OriginSnapshot, sources: OriginSnapshot[], id: () => string) {
  const targetStore = snapshotStore(target), previous = targetStore.readShared();
  const winners = new Map<string, SavedProfile>(), revisions = new Map<string, number>();
  for (const snapshot of [target, ...sources]) for (const profile of profilesFrom(snapshot)) {
    const current = winners.get(profile.id);
    if (current && (current.createdAt !== profile.createdAt || current.hero.classId !== profile.hero.classId)) throw new Error(`角色 ${profile.name} 的标识发生冲突，请先将其中一个版本作为新角色导入。`);
    revisions.set(profile.id, Math.max(revisions.get(profile.id) ?? 0, profile.revision));
    if (!current || ahead(profile, current)) winners.set(profile.id, structuredClone(profile));
  }
  const names = new Set<string>();
  function uniqueName(name: string) {
    let result = name, count = 1;
    while (names.has(result.toLowerCase())) { const suffix = `迁移${count++}`; result = Array.from(name).slice(0, 16 - Array.from(suffix).length).join('') + suffix; }
    names.add(result.toLowerCase()); return result;
  }
  const profiles = [...winners.values()];
  profiles.forEach(profile => { profile.name = uniqueName(profile.name); });
  const personal = new Set(profiles.flatMap(profile => ownedItems(profile.hero).map(item => item.id)));
  const items: Item[] = [], overflow: Item[] = [], seen = new Map<string, Item>();
  let duplicateSharedItems = 0, itemConflicts = 0;
  const itemContent = (item: Item) => { const copy = { ...item }; delete copy.x; delete copy.y; return JSON.stringify(copy); };
  for (const snapshot of [target, ...sources]) for (const item of snapshotStore(snapshot).readShared().items) {
    if (personal.has(item.id) || seen.has(item.id)) {
      duplicateSharedItems++;
      if (seen.has(item.id) && itemContent(seen.get(item.id)!) !== itemContent(item)) itemConflicts++;
      continue;
    }
    const copy = structuredClone(item); delete copy.x; delete copy.y; seen.set(item.id, copy);
    if (placeItems([...items, copy], SHARED_STASH_ROWS)) items.push(copy); else overflow.push(copy);
  }
  // Keep excess equipment accessible without changing the normal shared stash size.
  for (let i = 0; i < overflow.length;) {
    const hero = newHero(); for (const slot of Object.keys(hero.equipment) as (keyof typeof hero.equipment)[]) hero.equipment[slot] = null;
    hero.alternate = { weapon: null, shield: null }; hero.inventory = []; hero.stash = [];
    while (i < overflow.length && placeItems([...hero.stash, overflow[i]], stashRows(hero.stash))) hero.stash.push(overflow[i++]);
    if (!hero.stash.length) throw new Error("Cannot fit migrated item");
    if (!placeItems(hero.stash, stashRows(hero.stash))) throw new Error('无法排列迁移暂存物品。');
    profiles.push({ version: 2, id: id(), name: uniqueName('合并仓库余量'), createdAt: Date.now(), updatedAt: Date.now(), revision: 1, hero });
  }
  const shared: SharedStash = { version: 3, revision: previous.revision + 1, items, checkpoints: {}, migrationSources: previous.migrationSources ?? [] };
  const resources: SharedResources = { revision: 0, gold: 0, runes: [], members: [], potions: emptyPotions(), potionMembers: [] };
  for (const snapshot of [target, ...sources]) {
    const value = snapshotStore(snapshot).readShared().resources;
    if (!value) continue;
    if (value.potions) resources.potions = resources.potions!.map((count, index) => count + value.potions![index]);
    resources.potionMembers!.push(...(value.potionMembers ?? []));
    resources.gold += value.gold; resources.runes = resources.runes.concat(value.runes);
    resources.members.push(...value.members); resources.revision = Math.max(resources.revision, value.revision);
  }
  resources.members = [...new Set(resources.members)]; resources.revision++;
  shared.resources = collectResources(resources, profiles);
  for (const profile of profiles) {
    profile.revision = (revisions.get(profile.id) ?? profile.revision) + 1; profile.sharedRevision = shared.revision;
    shared.checkpoints[profile.id] = profile;
  }
  const writes = Object.fromEntries(profiles.map(profile => [PROFILE_PREFIX + profile.id, JSON.stringify(profile)]));
  if (target.entries[SAVE_KEY] && !target.entries[MIGRATION_KEY]) writes[MIGRATION_KEY] = 'legacy';
  const report: MergeReport = { characters: profiles.map(p => ({ name: p.name, level: p.hero.level })), sharedItems: items.length, duplicateSharedItems, itemConflicts, overflowItems: overflow.length, sources: sources.map(snapshot => snapshot.origin) };
  return { shared, writes, report };
}
async function fingerprint(snapshot: OriginSnapshot) {
  const entries = Object.fromEntries(Object.entries(snapshot.entries).filter(([key]) => key.startsWith(PROFILE_PREFIX) || key === SAVE_KEY || key === MIGRATION_KEY).sort(([a], [b]) => a.localeCompare(b)));
  const raw = JSON.stringify({ origin: snapshot.origin, entries, shared: snapshot.shared });
  // LAN HTTP contexts lack SubtleCrypto. An exact receipt avoids relying on a
  // weaker substitute hash there; IndexedDB can hold the original signature.
  if (!crypto.subtle) return 'raw:' + raw;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
export async function mergeLocalOrigins(sources: OriginSnapshot[]) {
  await finishOriginMigration();
  const target = await captureLocalOrigin(), completed = snapshotStore(target).readShared().migrationSources ?? [];
  const incoming: OriginSnapshot[] = [], hashes: string[] = [];
  for (const source of sources) {
    if (source.origin === target.origin) continue;
    const hash = await fingerprint(source); if (completed.includes(hash) || hashes.includes(hash)) continue;
    incoming.push(source); hashes.push(hash);
  }
  if (!incoming.length) return { alreadyMerged: true };
  const plan = planOriginMerge(target, incoming, () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join(''));
  plan.shared.migrationSources = [...completed, ...hashes];
  await commitOriginMigration(target, incoming, plan);
  return plan.report;
}
