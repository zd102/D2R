import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, SAVE_KEY, serializeSave } from '../src/model.ts';
import { SaveStore, SaveError, PROFILE_PREFIX, MIGRATION_KEY, parseProfile } from '../src/saves.ts';

class MemoryStorage {
  data = new Map<string, string>();
  failKey?: string;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (key === this.failKey) throw new Error('Quota exceeded'); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

test('legacy migration preserves every field and the original backup, and runs once', () => {
  const storage = new MemoryStorage(), hero = newHero(); hero.level = 4; hero.gold = 789; hero.shrines = [0, 1]; hero.points = 9;
  const original = serializeSave(hero); storage.setItem(SAVE_KEY, original);
  const store = new SaveStore(storage);
  assert.equal(store.migrateLegacy(), true);
  const migrated = store.list()[0]; assert.deepEqual(migrated.hero, hero);
  assert.equal(storage.getItem(SAVE_KEY), original); assert.equal(store.migrateLegacy(), false);
  store.delete(migrated.id, migrated.revision);
  assert.equal(store.migrateLegacy(), false); assert.equal(store.list().length, 0);
});
test('interrupted migration retries without duplicating or overwriting the migrated role', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage);
  storage.setItem(SAVE_KEY, serializeSave(newHero())); storage.failKey = MIGRATION_KEY;
  assert.throws(() => store.migrateLegacy()); assert.equal(store.list().length, 1);
  storage.failKey = undefined; assert.equal(store.migrateLegacy(), true); assert.equal(store.list().length, 1);
});
test('characters retain separate inventory, gold, quests, attributes and equipment', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage);
  const a = store.create('甲'), b = store.create('乙'); const originalB = storage.getItem(PROFILE_PREFIX + b.id);
  a.hero.gold = 600; a.hero.strength = 30; a.hero.shrines = [2]; a.hero.equipment.weapon!.power = 100;
  store.remember(b.id); store.save(a.id, a.hero, a.revision);
  assert.equal(storage.getItem(PROFILE_PREFIX + b.id), originalB);
  assert.deepEqual(store.read(a.id).hero, a.hero); assert.equal(store.read(b.id).hero.equipment.weapon!.power, 8);
});
test('rename keeps progress and rejects empty, duplicate and oversized names', () => {
  const store = new SaveStore(new MemoryStorage()), a = store.create('Alpha'), b = store.create('Beta');
  assert.throws(() => store.create('  '), SaveError); assert.throws(() => store.create('alpha'), SaveError);
  assert.throws(() => store.create('a'.repeat(17)), SaveError);
  const renamed = store.rename(a.id, ' 守夜者 ', a.revision);
  assert.equal(renamed.name, '守夜者'); assert.deepEqual(renamed.hero, a.hero);
  assert.throws(() => store.rename(b.id, '守夜者', b.revision), SaveError);
});
test('stale windows cannot overwrite, rename, or resurrect another window changes', () => {
  const storage = new MemoryStorage(), one = new SaveStore(storage), two = new SaveStore(storage);
  const a = one.create('甲'); const updated = two.save(a.id, { ...a.hero, gold: 88 }, a.revision);
  assert.throws(() => one.save(a.id, a.hero, a.revision), SaveError);
  assert.throws(() => one.rename(a.id, '乙', a.revision), SaveError);
  assert.throws(() => one.delete(a.id, a.revision), SaveError);
  two.delete(a.id, updated.revision);
  assert.throws(() => one.save(a.id, a.hero, a.revision), SaveError); assert.equal(one.list().length, 0);
});
test('quota failure leaves the previous save and other characters intact', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage), a = store.create('甲'); store.create('乙');
  const before = [...storage.data]; storage.failKey = PROFILE_PREFIX + a.id;
  assert.throws(() => store.save(a.id, { ...a.hero, gold: 999 }, a.revision)); assert.deepEqual([...storage.data], before);
});
test('damaged profiles are retained, skipped in the list and never silently reset', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage); store.create('甲');
  storage.setItem(PROFILE_PREFIX + 'broken', '{bad');
  assert.equal(store.list().length, 1); assert.equal(store.invalidCount, 1);
  assert.equal(storage.getItem(PROFILE_PREFIX + 'broken'), '{bad'); assert.throws(() => store.read('broken'), SaveError);
  assert.equal(parseProfile('{"version":2,"id":"bad"}'), null);
  storage.setItem(SAVE_KEY, '{bad'); assert.throws(() => store.migrateLegacy(), SaveError); assert.equal(storage.getItem(SAVE_KEY), '{bad');
});
