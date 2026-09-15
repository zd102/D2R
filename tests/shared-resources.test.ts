import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore, PROFILE_PREFIX } from '../src/saves.ts';
import { SHARED_STORAGE_KEY } from '../src/shared-storage.ts';

function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
  const store = new SaveStore(storage, async operation => operation());
  return { store, storage, data };
}
test('local resources merge old characters once, survive deletion and remain shared by new characters', async () => {
  const { store, data } = fixture();
  let a = store.create('甲'), b = store.create('乙');
  a = store.save(a.id, { ...a.hero, gold: 10000000, runes: Array(1000).fill('el') }, a.revision);
  b = store.save(b.id, { ...b.hero, gold: 200, runes: ['tir', 'el'] }, b.revision);
  const original = data.get(PROFILE_PREFIX + a.id);
  await store.initializeResources(); await store.initializeResources();
  assert.equal(store.readShared().version, 3);
  assert.equal(data.get(PROFILE_PREFIX + a.id), original);
  a = store.read(a.id); b = store.read(b.id);
  assert.equal(a.hero.gold, 10000200); assert.equal(b.hero.runes.length, 1002);
  a.hero.gold -= 25; a.hero.runes.splice(a.hero.runes.indexOf('tir'), 1);
  a = await store.saveAtomic(a.id, a.hero, a.revision, a.resourcesRevision);
  assert.equal(store.read(b.id).hero.gold, 10000175); assert.equal(store.read(b.id).hero.runes.includes('tir'), false);
  await assert.rejects(store.saveAtomic(b.id, b.hero, b.revision, b.resourcesRevision), /共享/);
  store.delete(a.id, a.revision); store.delete(b.id, b.revision);
  const c = store.create('丙'); await store.initializeResources();
  assert.equal(store.read(c.id).hero.gold, 10000175); assert.equal(store.read(c.id).hero.runes.length, 1001);
});

test('a migrated wallet with missing balances is rejected instead of recollected from stale character snapshots', async () => {
  const { store, data } = fixture(); store.create('甲'); await store.initializeResources();
  const shared = JSON.parse(data.get(SHARED_STORAGE_KEY)!); delete shared.resources;
  data.set(SHARED_STORAGE_KEY, JSON.stringify(shared)); const before = new Map(data);
  await assert.rejects(store.initializeResources(), /无法读取/); assert.deepEqual(data, before);
});
test('failed resource writes preserve both character and wallet; import contributes once', async () => {
  const { store, storage, data } = fixture(); let a = store.create('甲'); await store.initializeResources(); a = store.read(a.id);
  const before = new Map(data), write = storage.setItem;
  storage.setItem = (key, value) => { if (key === SHARED_STORAGE_KEY) throw new Error('Quota'); write(key, value); };
  await assert.rejects(store.saveAtomic(a.id, { ...a.hero, gold: 50, runes: ['ral'] }, a.revision, a.resourcesRevision), /Quota/);
  assert.deepEqual(data, before); storage.setItem = write;
  a = await store.saveAtomic(a.id, { ...a.hero, gold: 50, runes: ['ral'] }, a.revision, a.resourcesRevision);
  const imported = store.importCharacter(store.exportCharacter(a.id).content, '副本');
  await store.initializeResources(); await store.initializeResources();
  assert.equal(store.read(imported.id).hero.gold, 100); assert.deepEqual(store.read(a.id).hero.runes, ['ral', 'ral']);
});

test('v2 wallets migrate every personal potion once, reject stale spending and do not duplicate exported shared stacks', async () => {
  const { store, data } = fixture();
  const a = store.create('旧药甲'), b = store.create('旧药乙');
  // Emulate the previous shared gold/rune format, whose characters still owned potions.
  data.set(SHARED_STORAGE_KEY, JSON.stringify({ version: 2, revision: 0, items: [], checkpoints: {}, resources: {
    revision: 4, gold: 10, runes: [], members: [a, b].map(p => `${p.id}:${p.createdAt}`),
  } }));
  await store.initializeResources(); await store.initializeResources();
  let first = store.read(a.id); const stale = store.read(b.id);
  assert.equal(first.hero.potions[0], 12); assert.equal(first.hero.potions[1], 8);
  first.hero.potions[0]--; first.hero.potions[14] = 2; first.hero.potionBindings = [14, 13, 3, 4];
  first = await store.saveAtomic(first.id, first.hero, first.revision, first.resourcesRevision);
  const fresh = store.read(b.id); assert.equal(fresh.hero.potions[0], 11); assert.equal(fresh.hero.potions[14], 2);
  assert.deepEqual(fresh.hero.potionBindings, [0, 1, 13, 14]);
  await assert.rejects(store.saveAtomic(stale.id, stale.hero, stale.revision, stale.resourcesRevision), /共享/);
  store.importCharacter(store.exportCharacter(first.id).content, '导入副本');
  await store.initializeResources(); assert.equal(store.readShared().resources!.potions![14], 2);
  store.delete(first.id, first.revision); const created = store.create('新角色'); await store.initializeResources();
  assert.equal(store.read(created.id).hero.potions[0], 11);
  assert.equal(store.read(created.id).hero.potions[14], 2);
});

test('a corrupt migrated potion wallet cannot recollect stale role snapshots', async () => {
  const { store, data } = fixture(); store.create('甲'); await store.initializeResources();
  const shared = JSON.parse(data.get(SHARED_STORAGE_KEY)!); delete shared.resources.potions;
  data.set(SHARED_STORAGE_KEY, JSON.stringify(shared)); const before = new Map(data);
  await assert.rejects(store.initializeResources(), /无法读取/); assert.deepEqual(data, before);
});
