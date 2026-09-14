import test from 'node:test';
import assert from 'node:assert/strict';
import { newHero } from '../src/model.ts';
import { PROFILE_PREFIX, type SavedProfile } from '../src/saves.ts';
import { planOriginMerge, snapshotStore, type OriginSnapshot } from '../src/local-migration.ts';
import type { Item } from '../src/items.ts';

const profile = (id: string, level = 1, name = id): SavedProfile => ({ version: 2, id, name, createdAt: 1, updatedAt: 100, revision: 1, hero: { ...newHero(), level } });
const snapshot = (origin: string, profiles: SavedProfile[], items: Item[] = []): OriginSnapshot => ({ origin, capturedAt: 1, entries: Object.fromEntries(profiles.map(p => [PROFILE_PREFIX + p.id, JSON.stringify(p)])), shared: JSON.stringify({ version: 1, revision: 3, items, checkpoints: {} }) });
const equipment = (id: string): Item => ({ ...newHero().equipment.weapon!, id });

test('same character keeps progressed version despite a newer timestamp on an old save; sources remain intact', () => {
  const old = profile('paladin', 24); old.updatedAt = 999; old.revision = 500;
  const advanced = profile('paladin', 54); advanced.hero.campaign.cleared = [25, 1, 0];
  const target = snapshot('target', [old]), source = snapshot('source', [advanced]), before = structuredClone([target, source]);
  const plan = planOriginMerge(target, [source], () => 'unused');
  const result = JSON.parse(plan.writes[PROFILE_PREFIX + old.id]);
  assert.equal(result.hero.level, 54); assert.equal(result.revision, 501);
  assert.equal(result.sharedRevision, plan.shared.revision);
  assert.deepEqual([target, source], before);
});
test('independent same-name characters remain selectable with distinct names', () => {
  const plan = planOriginMerge(snapshot('target', [profile('a', 4, '同名')]), [snapshot('source', [profile('b', 6, '同名')])], () => 'unused');
  assert.deepEqual(plan.report.characters.map(p => p.name), ['同名', '同名迁移1']);
});
test('shared checkpoints supply the authoritative character after a deposit', () => {
  const p = profile('p'), target = snapshot('target', []), source = snapshot('source', [p]);
  const checkpoint = structuredClone(p); checkpoint.hero.level = 54; checkpoint.revision = 2; checkpoint.sharedRevision = 4;
  source.shared = JSON.stringify({ version: 1, revision: 4, items: [], checkpoints: { p: checkpoint } });
  assert.equal(planOriginMerge(target, [source], () => 'unused').report.characters[0].level, 54);
});
test('shared merge deduplicates IDs and never duplicates equipment already owned by a retained character', () => {
  const p = profile('p'), owned = p.hero.equipment.weapon!, common = equipment('shared'), extra = equipment('extra');
  const plan = planOriginMerge(snapshot('target', [p], [common]), [snapshot('source', [], [common, owned, extra])], () => 'unused');
  assert.deepEqual(plan.shared.items.map(item => item.id), ['shared', 'extra']);
  assert.equal(plan.report.duplicateSharedItems, 2);
});
test('shared overflow stays accessible in a personal stash and merged output parses', () => {
  // Swords occupy several cells; each input fits but their union exceeds the shared grid.
  const left = Array.from({ length: 15 }, (_, i) => equipment('left-' + i));
  const right = Array.from({ length: 15 }, (_, i) => equipment('right-' + i));
  const plan = planOriginMerge(snapshot('target', [], left), [snapshot('source', [], right)], () => 'overflow');
  assert.ok(plan.report.overflowItems > 0);
  const store = snapshotStore({ origin: 'target', capturedAt: 1, entries: plan.writes, shared: JSON.stringify(plan.shared) });
  assert.equal(store.readShared().items.length + store.list().flatMap(p => p.hero.stash).length, 30);
  assert.equal(store.invalidCount, 0);
});
test('corrupt records and unrelated characters reusing an ID abort instead of being silently discarded', () => {
  const bad = snapshot('source', []); bad.entries[PROFILE_PREFIX + 'broken'] = '{}';
  assert.throws(() => planOriginMerge(snapshot('target', []), [bad], () => 'unused'), /损坏/);
  const other = profile('same'); other.createdAt = 9;
  assert.throws(() => planOriginMerge(snapshot('target', [profile('same')]), [snapshot('source', [other])], () => 'unused'), /标识/);
});
