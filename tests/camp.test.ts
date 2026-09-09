import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMP, prepareCampArrival } from '../src/camp.ts';
import { newHero, selectCampaignLevel, emptyEquipment } from '../src/model.ts';
import { canEnterLevel, questComplete } from '../src/campaign.ts';

test('camp arrival preserves campaign, possessions and resources while removing lingering afflictions', () => {
  const hero = newHero(); hero.campaign.cleared = [5, 0, 0]; hero.campaign.current = 5;
  hero.gold = 1000; hero.hp = 30; hero.poison = 5; hero.curse = 3; hero.cold = 2;
  hero.corpse = { equipment: emptyEquipment(), extras: [], gold: 250, xpLost: 800, x: 12, z: -20 };
  const before = structuredClone(hero);
  prepareCampArrival(hero);
  assert.deepEqual(hero, { ...before, poison: 0, curse: 0, cold: 0, corpse: { ...before.corpse, ...CAMP.spawn, xpLost: 0 } });
});

test('departing camp resumes partial kills and objects on the current unfinished level', () => {
  const hero = newHero(); hero.campaign.kills = 4;
  hero.hp = 12; hero.mana = 4; hero.holyShield = 30;
  assert.equal(selectCampaignLevel(hero, 0, 0, true), true); assert.equal(hero.campaign.kills, 4);
  assert.equal(hero.hp, 12); assert.equal(hero.mana, 4); assert.equal(hero.holyShield, 30);
  hero.campaign.cleared = [1, 0, 0]; hero.campaign.current = 1; hero.campaign.kills = 0; hero.campaign.objects = [0];
  assert.equal(selectCampaignLevel(hero, 1, 0, true), true); assert.deepEqual(hero.campaign.objects, [0]);
  assert.equal(questComplete(hero.campaign), false);
});

test('departing camp refreshes a cleared level without repeating its quest or advancing progress', () => {
  const hero = newHero(); hero.campaign.cleared = [2, 0, 0]; hero.campaign.current = 1; hero.bossDefeated = true;
  assert.equal(selectCampaignLevel(hero, 1, 0, true), true);
  assert.equal(hero.bossDefeated, false); assert.equal(questComplete(hero.campaign), true);
  assert.deepEqual(hero.campaign.cleared, [2, 0, 0]);
  assert.equal(selectCampaignLevel(hero, 2, 0, true), true); assert.deepEqual(hero.campaign.objects, []);
  assert.equal(questComplete(hero.campaign), false);
});

test('camp departure permits cleared stages and each unlocked difficulty frontier only', () => {
  const hero = newHero(); hero.campaign.cleared = [25, 7, 0]; hero.unlockedDifficulty = 1;
  for (const diff of [0, 1, 2]) for (let index = 0; index < 25; index++) {
    assert.equal(canEnterLevel(hero.campaign, index, diff), diff === 0 || diff === 1 && index <= 7);
  }
  const before = structuredClone(hero);
  for (const [index, diff] of [[8, 1], [0, 2], [-1, 0], [25, 0]]) {
    assert.equal(selectCampaignLevel(hero, index, diff as 0 | 1 | 2, true), false); assert.deepEqual(hero, before);
  }
});
