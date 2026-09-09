import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHero, SAVE_KEY, serializeSave } from '../src/model.ts';
import { SaveStore, SaveError, PROFILE_PREFIX, MIGRATION_KEY, CHARACTER_FILE_LIMIT, parseCharacterFile, parseProfile } from '../src/saves.ts';

class MemoryStorage {
  data = new Map<string, string>();
  failKey?: string;
  failWrites = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites || key === this.failKey) throw new Error('Quota exceeded'); this.data.set(key, value); }
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
  assert.deepEqual(store.read(a.id).hero, a.hero); assert.equal(store.read(b.id).hero.equipment.weapon!.power, b.hero.equipment.weapon!.power);
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

test('single-character export transfers progress and possessions to independent storage', () => {
  const storage = new MemoryStorage(), source = new SaveStore(storage), a = source.create('远征者');
  source.create('留守者'); source.remember(a.id);
  const h = a.hero;
  Object.assign(h, { level: 45, gold: 123456, kills: 678, points: 12, strength: 85, skillPoints: 3, difficultyLevel: 1, unlockedDifficulty: 1, stage: 7 });
  h.campaign.cleared = [25, 7, 0]; h.campaign.current = 6;
  h.inventory = [{ ...h.equipment.weapon!, id: 'bag-sword', x: 0, y: 0 }];
  h.stash = [{ ...h.equipment.shield!, id: 'stash-shield', x: 0, y: 0 }];
  h.alternate.weapon = { ...h.equipment.weapon!, id: 'alternate-sword' };
  h.runes = ['el', 'tir']; h.questRewards = ['0:boss']; h.respecUsed = [0];
  h.corpse = { equipment: { ...h.equipment, weapon: null, shield: { ...h.equipment.shield!, id: 'corpse-shield' } }, extras: [], x: 2, z: 3, xpLost: 400, gold: 500 };
  source.save(a.id, h, a.revision);
  const before = [...storage.data], file = source.exportCharacter(a.id);
  assert.deepEqual([...storage.data], before, 'Export performs no writes');
  assert.ok(!file.content.includes('留守者'), 'Only the selected character is exported');
  assert.match(file.filename, /^eclipse-ii-远征者-.*\.json$/);
  const target = new SaveStore(new MemoryStorage()), imported = target.importCharacter(file.content);
  assert.notEqual(imported.id, a.id); assert.equal(imported.revision, 1); assert.equal(imported.name, a.name);
  assert.deepEqual(imported.hero, h); assert.deepEqual(target.read(imported.id).hero, h);
  assert.equal(target.list().length, 1); assert.equal(target.lastId, null);
  assert.deepEqual([...storage.data], before);
  assert.deepEqual(parseCharacterFile('\uFEFF' + file.content).hero, h);
});

test('import requires a unique name and never replaces the source ID or other records', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage), a = store.create('Alpha');
  store.remember(a.id); const file = store.exportCharacter(a.id), before = [...storage.data];
  for (const name of [undefined, 'alpha', ' ', 'a'.repeat(17)]) assert.throws(() => store.importCharacter(file.content, name), SaveError);
  assert.deepEqual([...storage.data], before);
  const copy = store.importCharacter(file.content, ' Beta ');
  assert.equal(copy.name, 'Beta'); assert.notEqual(copy.id, a.id); assert.equal(store.lastId, a.id);
  assert.equal(storage.getItem(PROFILE_PREFIX + a.id), before.find(([key]) => key === PROFILE_PREFIX + a.id)![1]);
  store.save(copy.id, { ...copy.hero, gold: 99 }, copy.revision);
  assert.equal(store.read(a.id).hero.gold, 0);
});

test('malformed, incomplete, unsupported and oversized files do not modify storage', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage), a = store.create('甲');
  const file = JSON.parse(store.exportCharacter(a.id).content), before = [...storage.data];
  const broken = [null, {}, [], { ...file, format: 'other-game' }, { ...file, version: 2 },
    { ...file, profile: { ...file.profile, version: 99 } }, { ...file, profile: { ...file.profile, hero: {} } },
    { ...file, profile: { ...file.profile, id: '../bad' } }, { ...file, profile: { ...file.profile, name: '' } },
    ...[{ inventory: null }, { gold: '100' }, { campaign: { version: 99 } }, { rulesVersion: 99 }].map(change => ({ ...file, profile: { ...file.profile, hero: { ...file.profile.hero, ...change } } }))];
  for (const value of broken) assert.throws(() => store.importCharacter(JSON.stringify(value), '乙'), SaveError);
  for (const raw of ['', '{bad', 'x'.repeat(CHARACTER_FILE_LIMIT + 1), '中'.repeat(Math.ceil(CHARACTER_FILE_LIMIT / 3))]) {
    assert.throws(() => store.importCharacter(raw, '乙'), SaveError);
  }
  assert.deepEqual([...storage.data], before);
});

test('failed import can be retried without leaving a partial character', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage), a = store.create('甲');
  const file = store.exportCharacter(a.id), before = [...storage.data]; storage.failWrites = true;
  assert.throws(() => store.importCharacter(file.content, '乙'), /Quota exceeded/);
  assert.deepEqual([...storage.data], before);
  storage.failWrites = false; store.importCharacter(file.content, '乙'); assert.equal(store.list().length, 2);
});

test('export reads the latest saved revision and rejects missing or corrupt characters', () => {
  const storage = new MemoryStorage(), store = new SaveStore(storage), a = store.create('A/B:*?');
  store.save(a.id, { ...a.hero, gold: 500 }, a.revision);
  const file = store.exportCharacter(a.id);
  assert.equal(parseCharacterFile(file.content).hero.gold, 500); assert.ok(!/[<>:"/\\|?*]/.test(file.filename));
  assert.throws(() => store.exportCharacter('missing'), SaveError);
  storage.setItem(PROFILE_PREFIX + a.id, '{broken'); assert.throws(() => store.exportCharacter(a.id), SaveError);
  assert.equal(storage.getItem(PROFILE_PREFIX + a.id), '{broken');
});
