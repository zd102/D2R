import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore, SaveError, PROFILE_PREFIX, parseCharacterFile } from '../src/saves.ts';
import { SHARED_STASH_KEY, moveSharedItem, type SharedLock } from '../src/shared-stash.ts';
import { newHero, stats } from '../src/model.ts';
import { BASES, makeItem, specialItem, socketItem, type Item } from '../src/items.ts';
import { CATALOG_SPECIALS } from '../src/item-catalog-current.ts';

class MemoryStorage {
  data = new Map<string, string>(); failKey?: string; afterWrite?: (key: string) => void;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (key === this.failKey) throw new Error('Quota exceeded'); this.data.set(key, value); this.afterWrite?.(key); }
  removeItem(key: string) { this.data.delete(key); }
}
function fixture() {
  const storage = new MemoryStorage(); let queue: Promise<unknown> = Promise.resolve();
  const lock: SharedLock = operation => { const result = queue.then(operation); queue = result.catch(() => {}); return result; };
  const store = new SaveStore(storage, lock), a = store.create('First'), b = store.create('Second');
  return { storage, store, a, b, lock };
}
const gear = (id: string) => makeItem(BASES.find(base => base.baseCode === 'rin')!, id);
const properties = (item: Item) => { const copy = structuredClone(item); delete copy.x; delete copy.y; return copy; };

test('both personal containers deposit and both withdrawal destinations work across separate roles', async () => {
  const { store, a, b } = fixture(); a.hero.inventory = [gear('bag')]; a.hero.stash = [gear('private')];
  let current = store.save(a.id, a.hero, a.revision), revision = 0;
  for (const container of ['inventory', 'stash'] as const) {
    const result = await store.transferShared(a.id, current.hero, current.revision, revision, { direction: 'deposit', container, itemId: container === 'inventory' ? 'bag' : 'private' });
    current = result.profile; revision = result.shared.revision;
  }
  assert.equal(store.read(a.id).hero.inventory.length, 0); assert.equal(store.read(a.id).hero.stash.length, 0);
  let recipient = b;
  for (const container of ['inventory', 'stash'] as const) {
    const result = await store.transferShared(b.id, recipient.hero, recipient.revision, revision, { direction: 'withdraw', container, itemId: container === 'inventory' ? 'bag' : 'private' });
    recipient = result.profile; revision = result.shared.revision;
  }
  assert.equal(store.readShared().items.length, 0); assert.equal(store.read(b.id).hero.inventory[0].id, 'bag'); assert.equal(store.read(b.id).hero.stash[0].id, 'private');
});

test('rolled equipment, sockets, quantities and unidentified status survive transfer and reloading', async () => {
  const { store, storage, lock, a, b } = fixture();
  const item = specialItem(CATALOG_SPECIALS.find(entry => entry.key === 'Tomb Reaver')!.id, () => 1); item.identified = true;
  socketItem(item, 'amn'); item.durability = 1;
  const thrown = makeItem(BASES.find(base => base.baseCode === 'jav')!); thrown.quantity = 0; thrown.identified = false;
  a.hero.stash = [item, thrown]; let current = store.save(a.id, a.hero, a.revision);
  for (const original of [item, thrown]) {
    const result = await store.transferShared(a.id, current.hero, current.revision, store.readShared().revision, { direction: 'deposit', container: 'stash', itemId: original.id }); current = result.profile;
    assert.deepEqual(properties(result.shared.items.find(value => value.id === original.id)!), properties(original));
  }
  const reloaded = new SaveStore(storage, lock); let next = b;
  for (const original of [item, thrown]) {
    const result = await reloaded.transferShared(b.id, next.hero, next.revision, reloaded.readShared().revision, { direction: 'withdraw', container: 'stash', itemId: original.id }); next = result.profile;
    assert.deepEqual(properties(next.hero.stash.find(value => value.id === original.id)!), properties(original));
  }
});

test('full shared space and full personal destinations reject transfers without touching either record', async () => {
  const { store, storage, a } = fixture(); a.hero.inventory = [gear('incoming')];
  const current = store.save(a.id, a.hero, a.revision);
  storage.setItem(SHARED_STASH_KEY, JSON.stringify({ version: 1, revision: 1, checkpoints: {}, items: Array.from({ length: 100 }, (_, i) => gear(`shared-${i}`)) }));
  const before = [...storage.data]; await assert.rejects(store.transferShared(a.id, current.hero, current.revision, 1, { direction: 'deposit', container: 'inventory', itemId: 'incoming' }), /空间不足/); assert.deepEqual([...storage.data], before);
  const hero = newHero(); hero.inventory = Array.from({ length: 40 }, (_, i) => gear(`bag-${i}`));
  hero.stash = Array.from({ length: 200 }, (_, i) => gear(`stash-${i}`));
  for (const container of ['inventory', 'stash'] as const) {
    const items = [gear('overflow')], unchanged = structuredClone({ hero, items });
    assert.throws(() => moveSharedItem(hero, items, { direction: 'withdraw', container, itemId: 'overflow' }), /不足|已满/); assert.deepEqual({ hero, items }, unchanged);
  }
});

test('shared commit failure leaves all items intact and can be retried exactly once', async () => {
  const { store, storage, a } = fixture(); a.hero.inventory = [gear('once')]; const current = store.save(a.id, a.hero, a.revision), before = [...storage.data];
  storage.failKey = SHARED_STASH_KEY;
  const request = { direction: 'deposit' as const, container: 'inventory' as const, itemId: 'once' };
  await assert.rejects(store.transferShared(a.id, current.hero, current.revision, 0, request), /Quota/);
  assert.deepEqual([...storage.data], before); assert.equal(current.hero.inventory.length, 1);
  storage.failKey = undefined; const result = await store.transferShared(a.id, current.hero, current.revision, 0, request);
  assert.equal(result.shared.items.length, 1); await assert.rejects(store.transferShared(a.id, current.hero, current.revision, 0, request), SaveError);
});

test('direct shared equipment changes commit both records atomically and survive reload', async () => {
  const { store, storage, lock, a } = fixture(); a.hero.inventory = [gear('wear')];
  let current = store.save(a.id, a.hero, a.revision);
  const deposit = await store.transferShared(a.id, current.hero, current.revision, 0, { direction: 'deposit', container: 'inventory', itemId: 'wear' });
  current = deposit.profile;
  const before = [...storage.data], unchanged = structuredClone(current.hero);
  storage.failKey = SHARED_STASH_KEY;
  await assert.rejects(store.transferShared(a.id, current.hero, current.revision, 1, { direction: 'equip', itemId: 'wear' }), /Quota/);
  assert.deepEqual([...storage.data], before); assert.deepEqual(current.hero, unchanged);
  storage.failKey = undefined;
  const worn = await store.transferShared(a.id, current.hero, current.revision, 1, { direction: 'equip', itemId: 'wear' });
  const reload = new SaveStore(storage, lock);
  assert.equal(reload.read(a.id).hero.equipment.ring?.id, 'wear'); assert.equal(reload.readShared().items.length, 0);
  await assert.rejects(store.transferShared(a.id, current.hero, current.revision, 1, { direction: 'equip', itemId: 'wear' }), SaveError);
  const removed = await reload.transferShared(a.id, worn.profile.hero, worn.profile.revision, 2, { direction: 'unequip', slot: 'ring' });
  assert.equal(removed.profile.hero.equipment.ring, null); assert.equal(reload.readShared().items[0].id, 'wear');
});

test('shared region exchanges are atomic, persistent and reject a stale second move', async () => {
  const { store, storage, a } = fixture();
  const items = [{ ...gear('large'), width: 2, height: 3, x: 0, y: 0 }, { ...gear('one'), x: 6, y: 0 }, { ...gear('two'), x: 7, y: 2 }];
  storage.setItem(SHARED_STASH_KEY, JSON.stringify({ version: 1, revision: 1, checkpoints: {}, items }));
  const before = [...storage.data], request = { direction: 'move' as const, itemId: 'large', x: 6, y: 0 };
  storage.failKey = SHARED_STASH_KEY;
  await assert.rejects(store.transferShared(a.id, a.hero, a.revision, 1, request), /Quota/);
  assert.deepEqual([...storage.data], before);
  storage.failKey = undefined;
  const result = await store.transferShared(a.id, a.hero, a.revision, 1, request);
  assert.deepEqual(result.shared.items.map(item => [item.id, item.x, item.y]), [['large', 6, 0], ['one', 0, 0], ['two', 1, 2]]);
  assert.deepEqual(store.readShared().items, result.shared.items);
  await assert.rejects(store.transferShared(a.id, a.hero, a.revision, 1, request), SaveError);
});

test('shared commits survive unavailable character writes, including exports and stale autosaves', async () => {
  const { store, storage, lock, a } = fixture(); a.hero.inventory = [gear('atomic')]; const current = store.save(a.id, a.hero, a.revision);
  storage.failKey = PROFILE_PREFIX + a.id;
  const moved = await store.transferShared(a.id, current.hero, current.revision, 0, { direction: 'deposit', container: 'inventory', itemId: 'atomic' });
  assert.equal(JSON.parse(storage.getItem(PROFILE_PREFIX + a.id)!).hero.inventory.length, 1);
  const reload = new SaveStore(storage, lock); assert.equal(reload.read(a.id).hero.inventory.length, 0); assert.equal(reload.list().find(profile => profile.id === a.id)!.hero.inventory.length, 0);
  assert.equal(parseCharacterFile(reload.exportCharacter(a.id).content).hero.inventory.length, 0);
  await assert.rejects(reload.transferShared(a.id, current.hero, current.revision, 1, { direction: 'deposit', container: 'inventory', itemId: 'atomic' }), SaveError);
  assert.throws(() => reload.save(a.id, current.hero, current.revision), SaveError);
  storage.failKey = undefined; const saved = reload.save(a.id, moved.profile.hero, moved.profile.revision); assert.equal(saved.hero.inventory.length, 0);
});

test('simultaneous withdrawals serialize and only one role can acquire the shared item', async () => {
  const { store, storage, lock, a, b } = fixture(); storage.setItem(SHARED_STASH_KEY, JSON.stringify({ version: 1, revision: 1, checkpoints: {}, items: [gear('contended')] }));
  const second = new SaveStore(storage, lock), request = { direction: 'withdraw' as const, container: 'inventory' as const, itemId: 'contended' };
  const results = await Promise.allSettled([store.transferShared(a.id, a.hero, a.revision, 1, request), second.transferShared(b.id, b.hero, b.revision, 1, request)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(store.readShared().items.length, 0); assert.equal(store.list().flatMap(profile => profile.hero.inventory).filter(item => item.id === 'contended').length, 1);
});

test('an autosave racing with an atomic transfer fails rather than adopting the same revision with old items', () => {
  const { store, storage, a } = fixture(); a.hero.inventory = [gear('race')]; const current = store.save(a.id, a.hero, a.revision);
  storage.afterWrite = key => {
    if (key !== PROFILE_PREFIX + a.id) return;
    const profile = structuredClone(current); profile.revision++; profile.hero.inventory = [];
    storage.data.set(SHARED_STASH_KEY, JSON.stringify({ version: 1, revision: 1, items: [gear('race')], checkpoints: { [a.id]: profile } }));
  };
  assert.throws(() => store.save(a.id, current.hero, current.revision), SaveError);
  assert.equal(store.read(a.id).hero.inventory.length, 0); assert.equal(store.readShared().items.length, 1);
});

test('corruption, duplicate IDs and invalid directions never silently reset or duplicate shared items', async () => {
  const { store, storage, a } = fixture();
  for (const raw of ['{broken', JSON.stringify({ version: 1, revision: 1, checkpoints: {}, items: [gear('dup'), gear('dup')] })]) {
    storage.setItem(SHARED_STASH_KEY, raw); assert.throws(() => store.readShared(), /原数据已保留/); assert.equal(storage.getItem(SHARED_STASH_KEY), raw);
    await assert.rejects(store.transferShared(a.id, a.hero, a.revision, 1, { direction: 'withdraw', container: 'inventory', itemId: 'dup' })); assert.equal(storage.getItem(SHARED_STASH_KEY), raw);
  }
  const hero = newHero(); hero.inventory = [gear('same')]; const items = [gear('same')];
  assert.throws(() => moveSharedItem(hero, items, { direction: 'withdraw', container: 'stash', itemId: 'same' }), /相同标识/);
  assert.equal(hero.inventory.length, 1); assert.equal(items.length, 1);
});

test('unacknowledged higher-revision autosaves cannot resurrect items after a shared transfer', async () => {
  const { store, storage, a } = fixture(); a.hero.inventory = [gear('receipt')]; const current = store.save(a.id, a.hero, a.revision);
  const result = await store.transferShared(a.id, current.hero, current.revision, 0, { direction: 'deposit', container: 'inventory', itemId: 'receipt' });
  storage.data.set(PROFILE_PREFIX + a.id, JSON.stringify({ ...current, revision: current.revision + 5 }));
  assert.equal(store.read(a.id).hero.inventory.length, 0); assert.equal(store.read(a.id).sharedRevision, 1);
  const next = store.save(a.id, result.profile.hero, result.profile.revision);
  assert.equal(next.sharedRevision, 1); assert.equal(store.read(a.id).revision, next.revision);
});

test('shared exact equipment drops preserve worn gear on commit failure and persist their coordinates on retry', async () => {
  const { store, storage, a } = fixture(), original = structuredClone(a.hero.equipment.weapon);
  const request = { direction: 'unequip' as const, slot: 'weapon' as const, position: { x: 8, y: 7 } };
  storage.failKey = SHARED_STASH_KEY;
  await assert.rejects(store.transferShared(a.id, a.hero, a.revision, 0, request));
  assert.deepEqual(store.read(a.id).hero.equipment.weapon, original); assert.equal(store.readShared().items.length, 0);
  storage.failKey = undefined;
  const result = await store.transferShared(a.id, a.hero, a.revision, 0, request);
  assert.equal(result.profile.hero.equipment.weapon, null);
  assert.deepEqual(store.readShared().items[0], { ...original, x: 8, y: 7 });
  await assert.rejects(store.transferShared(a.id, a.hero, a.revision, 0, request), SaveError);
});

test('shared charms stop contributing immediately and deleting a depositor preserves the shared item', async () => {
  const { store, a, b } = fixture(); const charm = { ...gear('charm'), charm: true, identified: true, mods: { life: 50 } };
  a.hero.inventory = [charm]; a.hero.hp = stats(a.hero).maxHp; const current = store.save(a.id, a.hero, a.revision);
  const result = await store.transferShared(a.id, current.hero, current.revision, 0, { direction: 'deposit', container: 'inventory', itemId: 'charm' });
  assert.equal(stats(result.profile.hero).mods.life, undefined); assert.equal(result.profile.hero.hp, stats(result.profile.hero).maxHp);
  store.delete(a.id, result.profile.revision); assert.equal(store.list().some(profile => profile.id === a.id), false); assert.equal(store.readShared().items[0].id, 'charm');
  const received = await store.transferShared(b.id, b.hero, b.revision, 1, { direction: 'withdraw', container: 'inventory', itemId: 'charm' }); assert.equal(stats(received.profile.hero).mods.life, 50);
});
