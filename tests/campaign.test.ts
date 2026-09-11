import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, LEVELS, newCampaign, canEnterLevel, questComplete, levelLayout, levelTuning } from '../src/campaign.ts';
import { newHero, parseSave, serializeSave, selectCampaignLevel, prepareCampaignReplay, completeCampaignLevel, recordQuestKill, activateQuestObject, grantQuestReward, respec, stats } from '../src/model.ts';
import { SaveStore, PROFILE_PREFIX } from '../src/saves.ts';

function finishQuest(hero: ReturnType<typeof newHero>) {
  const quest = LEVELS[hero.campaign.current].quest;
  for (let i = 0; i < quest.count; i++) quest.kind === 'kill' ? recordQuestKill(hero) : activateQuestObject(hero, i);
  assert.equal(questComplete(hero.campaign), true);
}
test('five acts each contain four minor bosses, one act boss and a short completable quest', () => {
  assert.equal(ACTS.length, 5); assert.equal(LEVELS.length, 25); assert.equal(new Set(LEVELS.map(level => level.id)).size, 25);
  for (const act of [0, 1, 2, 3, 4]) {
    const levels = LEVELS.filter(level => level.act === act);
    assert.equal(levels.length, 5); assert.deepEqual(levels.map(level => level.actBoss), [false, false, false, false, true]);
    for (const level of levels) { assert.ok(level.quest.name && level.quest.description && level.enemies.every(Boolean)); assert.equal(levelLayout(level).objects.length, level.quest.kind === 'interact' ? level.quest.count : 0); }
  }
  assert.deepEqual(LEVELS.filter(level => level.actBoss).map(level => level.boss), ['安达利尔', '都瑞尔', '墨菲斯托', '迪亚波罗', '巴尔']);
});
test('level selection rejects skipping, locked difficulties and malformed indices without mutation', () => {
  const hero = newHero(), before = structuredClone(hero);
  for (const [index, diff] of [[1, 0], [24, 0], [0, 1], [-1, 0], [25, 0], [.5, 0], [NaN, 0], [0, -1], [0, 3]]) {
    assert.equal(canEnterLevel(hero.campaign, index, diff), false); assert.equal(selectCampaignLevel(hero, index, diff as 0 | 1 | 2), false); assert.deepEqual(hero, before);
  }
});
test('quests gate bosses, object activations are unique and replaying never repeats first-clear rewards', () => {
  const hero = newHero(); assert.equal(completeCampaignLevel(hero), false);
  finishQuest(hero); assert.equal(recordQuestKill(hero), false); assert.equal(completeCampaignLevel(hero), true);
  assert.deepEqual(hero.campaign.cleared, [1, 0, 0]); assert.equal(hero.skillPoints, 1); assert.equal(hero.unlockedDifficulty, 0);
  const gold = hero.gold; assert.equal(completeCampaignLevel(hero), false);
  selectCampaignLevel(hero, 0); finishQuest(hero); completeCampaignLevel(hero); assert.equal(hero.gold, gold); assert.equal(hero.skillPoints, 1);
  selectCampaignLevel(hero, 1); assert.equal(activateQuestObject(hero, 0), true); assert.equal(activateQuestObject(hero, 0), false); assert.equal(activateQuestObject(hero, 2), false); assert.equal(completeCampaignLevel(hero), false);
  assert.equal(activateQuestObject(hero, 1), true); assert.equal(completeCampaignLevel(hero), true); assert.deepEqual(hero.campaign.cleared, [2, 0, 0]);
});
test('all 75 levels advance in order; only 25 clears unlock the next difficulty', () => {
  const hero = newHero();
  for (const diff of [0, 1, 2] as const) {
    for (const level of LEVELS) {
      assert.equal(selectCampaignLevel(hero, level.index, diff), true);
      finishQuest(hero); assert.equal(completeCampaignLevel(hero), true);
      assert.equal(hero.campaign.cleared[diff], level.index + 1);
      assert.equal(hero.unlockedDifficulty, level.index === 24 ? Math.min(2, diff + 1) : diff);
      if (diff < 2 && level.index < 24) assert.equal(canEnterLevel(hero.campaign, 0, diff + 1), false);
    }
    assert.equal(hero.skillPoints, (diff + 1) * 6); assert.equal(hero.points, (diff + 1) * 10);
    assert.equal(hero.bonusLife, (diff + 1) * 20); assert.equal(hero.bonusResist, (diff + 1) * 5);
  }
  assert.deepEqual(hero.campaign.cleared, [25, 25, 25]);
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('replay leaves the frontier and other difficulties intact; partial tasks survive reloading', () => {
  const hero = newHero(); hero.campaign.cleared = [25, 8, 0]; hero.unlockedDifficulty = 1;
  assert.equal(selectCampaignLevel(hero, 6, 1), true); assert.equal(questComplete(hero.campaign), true); assert.equal(activateQuestObject(hero, 0), false);
  const loaded = parseSave(serializeSave(hero))!; assert.deepEqual(loaded, hero); completeCampaignLevel(loaded);
  assert.deepEqual(loaded.campaign.cleared, [25, 8, 0]); assert.equal(loaded.difficultyLevel, 1);
  assert.equal(selectCampaignLevel(loaded, 8, 1), true); assert.deepEqual(loaded.campaign.objects, []);
  assert.equal(selectCampaignLevel(loaded, 12, 0), true); assert.deepEqual(loaded.campaign.cleared, [25, 8, 0]);
});
test('every cleared boss is farmable repeatedly in its own difficulty without repeating permanent rewards', () => {
  const hero = newHero(); hero.campaign.cleared = [25, 25, 25]; hero.unlockedDifficulty = 2;
  hero.gold = 4321; hero.skillPoints = 8; hero.points = 12; hero.bonusLife = 60; hero.bonusResist = 30; hero.questRewards = ['0:shrine0', ...[0, 1, 2].flatMap(diff => ['shrine1', 'jungle', 'boss', 'resistance', 'summit'].map(key => `${diff}:${key}`))];
  const rewards = () => [hero.gold, hero.skillPoints, hero.points, hero.bonusLife, hero.bonusResist, ...hero.questRewards];
  const before = rewards();
  for (const diff of [0, 1, 2] as const) for (const level of LEVELS) for (let run = 0; run < 2; run++) {
    assert.equal(selectCampaignLevel(hero, level.index, diff), true);
    assert.equal(hero.bossDefeated, false); assert.equal(questComplete(hero.campaign), true);
    assert.equal(completeCampaignLevel(hero), true); assert.equal(completeCampaignLevel(hero), false);
    assert.deepEqual(hero.campaign.cleared, [25, 25, 25]); assert.deepEqual(rewards(), before);
  }
});
test('continuing a cleared save refreshes the boss but preserves inventory, resources and progression', () => {
  const hero = newHero(); hero.campaign.cleared = [5, 0, 0]; hero.campaign.current = 4; hero.stage = 5; hero.campaign.objects = [0, 1]; hero.bossDefeated = true;
  hero.gold = 990; hero.hp = 23; hero.mana = 7; hero.inventory = [{ ...hero.equipment.weapon!, id: 'farm-loot' }];
  const loaded = parseSave(serializeSave(hero))!;
  assert.equal(prepareCampaignReplay(loaded), true); assert.equal(loaded.bossDefeated, false); assert.equal(questComplete(loaded.campaign), true);
  const expected = structuredClone(hero); expected.bossDefeated = false; assert.deepEqual(loaded, expected);
  assert.deepEqual(parseSave(serializeSave(loaded)), loaded);
});
test('first-clear tasks and partial progress remain gated on resume and higher difficulties', () => {
  const hero = newHero(); hero.campaign.cleared = [25, 1, 0]; hero.difficultyLevel = 1; hero.unlockedDifficulty = 1;
  selectCampaignLevel(hero, 1, 1); activateQuestObject(hero, 0);
  const before = structuredClone(hero); assert.equal(prepareCampaignReplay(hero), false); assert.deepEqual(hero, before); assert.equal(questComplete(hero.campaign), false); assert.equal(completeCampaignLevel(hero), false);
  const loaded = parseSave(serializeSave(hero))!; assert.equal(prepareCampaignReplay(loaded), false); assert.deepEqual(loaded, before);
});
test('difficulty flags and legacy boss rewards cannot bypass the complete-campaign gate', () => {
  const hero = newHero(); grantQuestReward(hero, 'boss'); assert.equal(hero.unlockedDifficulty, 0);
  const loaded = parseSave(JSON.stringify({ version: 2, hero: { ...hero, difficultyLevel: 2, unlockedDifficulty: 2, bossDefeated: true, campaign: { version: 1, current: 24, cleared: [1, 25, 25], kills: 12, objects: [0, 0, 99] } } }))!;
  assert.deepEqual(loaded.campaign.cleared, [1, 0, 0]); assert.equal(loaded.campaign.current, 1); assert.equal(loaded.difficultyLevel, 0); assert.equal(loaded.bossDefeated, false); assert.deepEqual(loaded.campaign.objects, []);
});
test('old graveyard characters retain equipment and rewards but start the new campaign at normal act I', () => {
  const hero = newHero(); hero.level = 20; hero.gold = 3000; hero.questRewards = ['0:shrine0'];
  const { campaign: _, ...oldHero } = hero;
  const loaded = parseSave(JSON.stringify({ version: 2, hero: { ...oldHero, stage: 8, difficultyLevel: 2, unlockedDifficulty: 2, bossDefeated: true } }))!;
  assert.equal(loaded.level, 20); assert.equal(loaded.gold, 3000); assert.deepEqual(loaded.equipment, hero.equipment); assert.deepEqual(loaded.questRewards, hero.questRewards);
  assert.deepEqual(loaded.campaign, newCampaign()); assert.equal(loaded.stage, 1); assert.equal(loaded.difficultyLevel, 0); assert.equal(loaded.bossDefeated, false);
  assert.equal(parseSave(JSON.stringify({ version: 2, hero: { ...hero, campaign: { version: 2 } } })), null);
});
test('small-level scaling is gentle and act-boundary scaling is substantially larger', () => {
  for (const diff of [0, 1, 2]) for (let i = 1; i < LEVELS.length; i++) {
    const previous = levelTuning(LEVELS[i - 1], diff), current = levelTuning(LEVELS[i], diff);
    assert.ok(current.level > previous.level || current.level === 96); assert.ok(current.hp > previous.hp); assert.ok(current.damage > previous.damage);
    if (i % 5) assert.ok(current.hp / previous.hp <= 1.071);
    else assert.ok(current.hp / previous.hp > 1.25);
  }
});
test('campaign changes are included in independent profile persistence and legacy backups', () => {
  class MemoryStorage { map = new Map<string, string>(); get length() { return this.map.size; } key(i: number) { return [...this.map.keys()][i] ?? null; } getItem(key: string) { return this.map.get(key) ?? null; } setItem(key: string, value: string) { this.map.set(key, value); } removeItem(key: string) { this.map.delete(key); } }
  const storage = new MemoryStorage(), store = new SaveStore(storage), profile = store.create('战役测试');
  const raw = JSON.parse(storage.getItem(PROFILE_PREFIX + profile.id)!); delete raw.hero.campaign; raw.hero.stage = 4;
  const legacy = JSON.stringify(raw); storage.setItem(PROFILE_PREFIX + profile.id, legacy);
  const migrated = store.read(profile.id); finishQuest(migrated.hero); completeCampaignLevel(migrated.hero); store.save(migrated.id, migrated.hero, migrated.revision);
  assert.equal(storage.getItem('eclipse-ii-before-campaign:' + profile.id), legacy); assert.equal(store.read(profile.id).hero.campaign.cleared[0], 1);
});

for (const diff of [0, 1, 2] as const) test(`permanent campaign rewards persist and cannot be reclaimed in difficulty ${diff}`, () => {
  let hero = newHero(); hero.campaign.cleared = [25, 25, 25];
  const attributes = ['strength', 'dexterity', 'vitality', 'energy'] as const;
  for (const index of [5, 11, 16, 22, 23]) {
    selectCampaignLevel(hero, index, diff);
    const before = structuredClone(hero), previousStats = stats(hero);
    assert.equal(completeCampaignLevel(hero), true);
    assert.equal(hero.skillPoints - before.skillPoints, index === 5 || index === 16 ? 2 : index === 23 ? 1 : 0);
    for (const key of attributes) assert.equal(hero[key] - before[key], index === 11 ? 5 : 0);
    assert.equal(hero.bonusResist - before.bonusResist, index === 22 ? 5 : 0);
    if (index === 22) for (const type of ['fire', 'cold', 'lightning', 'poison'] as const) assert.equal(stats(hero).resistances[type] - previousStats.resistances[type], 5);
    assert.equal(hero.level - before.level, index === 23 ? 1 : 0);
    assert.equal(hero.points - before.points, index === 23 ? 5 : 0);
    hero = parseSave(serializeSave(hero))!;
    const after = structuredClone(hero);
    selectCampaignLevel(hero, index, diff); completeCampaignLevel(hero);
    for (const key of [...attributes, 'skillPoints', 'points', 'bonusResist', 'level', 'xp', 'gold', 'questRewards'] as const) assert.deepEqual(hero[key], after[key]);
  }
  hero.questRewards.push(`${diff}:shrine0`); hero.strength += 10;
  const points = hero.points;
  assert.equal(respec(hero), true); assert.equal(hero.points, points + 10);
  for (const key of attributes) assert.equal(hero[key], newHero()[key] + 5);
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
});

test('summit reward preserves current experience and respects level 99 cap', () => {
  for (const level of [50, 98, 99]) {
    const hero = newHero(); hero.campaign.cleared = [25, 0, 0]; hero.level = level; hero.xp = level === 99 ? 0 : 123;
    selectCampaignLevel(hero, 23); completeCampaignLevel(hero);
    assert.equal(hero.level, Math.min(99, level + 1)); assert.equal(hero.xp, level >= 98 ? 0 : 123);
    assert.equal(hero.skillPoints, level === 99 ? 0 : 1); assert.equal(hero.points, level === 99 ? 0 : 5);
    assert.ok(hero.questRewards.includes('0:summit'));
  }
});

test('legacy claimed rewards are retained without duplicate grants', () => {
  const hero = newHero(); hero.campaign.cleared = [25, 0, 0];
  hero.questRewards = ['0:shrine1', '0:boss', '0:shrine2']; hero.bonusResist = 10;
  for (const index of [5, 16, 22]) { selectCampaignLevel(hero, index); completeCampaignLevel(hero); }
  assert.equal(hero.skillPoints, 0); assert.equal(hero.bonusResist, 10);
  assert.deepEqual(hero.questRewards, ['0:shrine1', '0:boss', '0:shrine2']);
});
