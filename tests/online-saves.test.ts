import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineSaveCoordinator, type OnlineSaveStore } from '../src/online-saves.ts';
import { newHero, type HeroState } from '../src/model.ts';
import type { SavedProfile } from '../src/save-format.ts';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
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
