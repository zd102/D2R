import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineSaveCoordinator, OnlineSaveStore } from '../src/online-saves.ts';
import { newHero, stats, type HeroState } from '../src/model.ts';
import type { OnlineClient } from '../src/online-client.ts';
import { DEFAULT_POTION_BINDINGS, useRecoveryPotion, tickPotionTimers } from '../src/potions.ts';
import type { SavedProfile } from '../src/save-format.ts';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function oldProfile() {
  const hero = newHero(); hero.gold = 1234; hero.runes = ['el'];
  const legacy: Partial<HeroState> = structuredClone(hero);
  delete legacy.potionTimers; delete legacy.potionBindings; delete legacy.potionRecovery;
  return { version: 2, id: 'legacy-online', name: '旧角色', createdAt: 1, updatedAt: 2, revision: 7, sharedRevision: 3, resourcesRevision: 9, hero: legacy } as SavedProfile;
}

test('old online characters migrate before entering gameplay without changing progress or revisions', async () => {
  const original = oldProfile(), shared = { version: 1, revision: 3, items: [], checkpoints: {}, resources: { revision: 9, gold: 4567, runes: ['el', 'tir'], members: [], potions: [6, 4, 0, 0, 0], potionMembers: [] } };
  const client = { request: async (path: string) => structuredClone(path === '/characters' ? [original] : shared) } as unknown as OnlineClient;
  const store = new OnlineSaveStore(client); await store.refresh();
  for (const profile of [store.list()[0], store.read(original.id)]) {
    assert.deepEqual(profile.hero.potionTimers, [0, 0, 0]);
    assert.deepEqual(profile.hero.potionBindings, DEFAULT_POTION_BINDINGS);
    assert.deepEqual(profile.hero.potionRecovery, []); assert.equal(profile.hero.potions.length, 15);
    assert.equal(profile.hero.gold, 4567); assert.deepEqual(profile.hero.runes, ['el', 'tir']);
    assert.deepEqual(profile.hero.equipment, original.hero.equipment);
    assert.equal(profile.revision, 7); assert.equal(profile.sharedRevision, 3); assert.equal(profile.resourcesRevision, 9);
    const current = stats(profile.hero); profile.hero.hp = 1;
    assert.equal(useRecoveryPotion(profile.hero, 0, current.maxHp, current.maxMana), null);
    assert.doesNotThrow(() => tickPotionTimers(profile.hero, .1));
  }
  assert.equal(original.hero.potionTimers, undefined, 'reading does not modify the received record');
});

test('creation, save responses and stash transfers cannot reintroduce missing online fields', async () => {
  const original = oldProfile(), shared = { version: 1, revision: 3, items: [], checkpoints: {} };
  const client = { reliable: async (path: string) => structuredClone(path === '/stash/transfer' ? { profile: original, shared } : original) } as unknown as OnlineClient;
  const store = new OnlineSaveStore(client);
  const created = await store.create('旧角色'), saved = await store.save(created.id, created.hero, created.revision);
  const moved = await store.transferShared(saved.id, saved.hero, saved.revision, 3, { direction: 'sort', container: 'shared' });
  for (const profile of [created, saved, moved.profile, store.read(saved.id)]) {
    assert.deepEqual(profile.hero.potionTimers, [0, 0, 0]);
    assert.deepEqual(profile.hero.potionBindings, DEFAULT_POTION_BINDINGS);
    assert.doesNotThrow(() => stats(profile.hero));
  }
});

test('unreadable online profiles fail before replacing the last usable snapshot', async () => {
  let response = oldProfile();
  const client = { reliable: async () => response } as unknown as OnlineClient;
  const store = new OnlineSaveStore(client), previous = await store.create('旧角色');
  response = { ...response, version: 99 } as unknown as SavedProfile;
  await assert.rejects(store.save(previous.id, previous.hero, previous.revision), /在线角色数据无法读取/);
  assert.equal(store.read(previous.id).revision, previous.revision);
});
test('online saves serialize revisions, freeze sent snapshots and coalesce only unsent work', async () => {
  let profile: SavedProfile = { version: 2, id: 'online', name: '在线', createdAt: 1, updatedAt: 1, revision: 1, hero: newHero() };
  const calls: { gold: number; revision: number }[] = [], releases: (() => void)[] = [];
  const store = { read: () => profile, save: async (_id: string, hero: HeroState, revision: number) => {
    calls.push({ gold: hero.gold, revision }); await new Promise<void>(resolve => releases.push(resolve));
    profile = { ...profile, hero, revision: revision + 1 }; return profile;
  } } as unknown as OnlineSaveStore;
  const saves = new OnlineSaveCoordinator(store), hero = newHero();
  hero.gold = 1; saves.request('online', hero); hero.gold = 2; saves.request('online', hero); hero.gold = 3; saves.request('online', hero); hero.gold = 999;
  assert.deepEqual(calls, [{ gold: 1, revision: 1 }]); assert.equal(saves.busy, true);
  releases.shift()!(); await tick(); assert.deepEqual(calls, [{ gold: 1, revision: 1 }, { gold: 3, revision: 2 }]);
  releases.shift()!(); await saves.flush(); assert.equal(profile.hero.gold, 3); assert.equal(saves.busy, false);
});
test('failed online saves reject flush and fence all later queued snapshots', async () => {
  let calls = 0, errors = 0;
  const failure = new Error('session expired');
  const store = { read: () => ({ revision: 1 }), save: async () => { calls++; await tick(); throw failure; } } as unknown as OnlineSaveStore;
  const saves = new OnlineSaveCoordinator(store); saves.onError = () => { errors++; };
  saves.request('online', newHero()); saves.request('online', newHero());
  await assert.rejects(saves.flush(), failure); saves.request('online', newHero()); await tick();
  assert.equal(calls, 1); assert.equal(errors, 1); assert.equal(saves.busy, false);
});
