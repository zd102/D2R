import test from 'node:test';
import assert from 'node:assert/strict';
import { newHero, completeCampaignLevel, parseSave, serializeSave } from '../src/model.ts';
import { BASES, makeItem } from '../src/items.ts';
import { LEVELS, AREA_LEVELS } from '../src/campaign.ts';
import { basePool, refreshBaseStock, buyProgressionBase, parseBaseStock } from '../src/progression-equipment.ts';

test('merchant refreshes five offers only on successful clears, including repeated clears', () => {
  const hero = newHero();
  assert.equal(completeCampaignLevel(hero), false);
  assert.equal(hero.baseStock.offers.length, 0);
  hero.campaign.kills = LEVELS[0].quest.count;
  assert.equal(completeCampaignLevel(hero), true);
  assert.equal(hero.baseStock.offers.length, 5);
  const first = structuredClone(hero.baseStock);
  assert.equal(completeCampaignLevel(hero), false);
  assert.deepEqual(hero.baseStock, first);
  hero.bossDefeated = false;
  assert.equal(completeCampaignLevel(hero), true);
  assert.notDeepEqual(hero.baseStock, first);
  assert.equal(hero.campaign.cleared[0], 1);
});
test('all difficulties retain lowest bases and respect difficulty caps, with varied sockets', () => {
  for (const diff of [0, 1, 2] as const) {
    const pool = basePool(diff);
    assert.ok(pool.some(base => base.baseCode === 'cap'));
    assert.ok(pool.every(base => (base.qualityLevel ?? base.level) <= AREA_LEVELS[diff][24]));
    if (diff) assert.ok(pool.length > basePool((diff - 1) as 0 | 1).length);
    const hero = newHero(); hero.difficultyLevel = diff;
    for (const random of [() => 0, () => .999999, Math.random]) {
      refreshBaseStock(hero, random);
      assert.equal(hero.baseStock.offers.length, 5);
      assert.equal(new Set(hero.baseStock.offers.map(offer => offer.code)).size, 5);
      for (const offer of hero.baseStock.offers) {
        const base = pool.find(base => base.baseCode === offer.code)!;
        assert.ok(base); assert.ok(offer.sockets >= 1 && offer.sockets <= base.sockets!);
      }
    }
  }
});
test('single purchase is atomic and persists without reroll; invalid or legacy stock is empty', () => {
  const hero = newHero(); refreshBaseStock(hero, () => 0);
  const offer = hero.baseStock.offers[0], initial = structuredClone(hero.baseStock);
  assert.equal(buyProgressionBase(hero, offer.id), undefined); assert.deepEqual(hero.baseStock, initial);
  hero.gold = 100000;
  hero.inventory = Array.from({ length: 40 }, (_, i) => ({ ...makeItem(BASES.find(base => base.baseCode === 'rin')!, String(i)), width: 1, height: 1 }));
  assert.equal(buyProgressionBase(hero, offer.id), undefined); assert.equal(hero.gold, 100000); assert.equal(offer.sold, false);
  hero.inventory = [];
  const item = buyProgressionBase(hero, offer.id)!;
  assert.equal(item.baseCode, offer.code); assert.equal(item.sockets, offer.sockets);
  assert.equal(hero.gold, 100000 - offer.price); assert.equal(offer.sold, true);
  const saved = serializeSave(hero);
  assert.equal(buyProgressionBase(hero, offer.id), undefined); assert.equal(serializeSave(hero), saved);
  const loaded = parseSave(saved)!;
  assert.deepEqual(loaded.baseStock, hero.baseStock); assert.equal(buyProgressionBase(loaded, offer.id), undefined);
  loaded.campaign.cleared = [25, 25, 25]; loaded.difficultyLevel = 2;
  assert.deepEqual(parseSave(serializeSave(loaded))!.baseStock, hero.baseStock);
  refreshBaseStock(loaded, () => .999999);
  assert.equal(loaded.baseStock.difficulty, 2); assert.ok(loaded.baseStock.offers.every(entry => !entry.sold));
  assert.equal(buyProgressionBase(loaded, offer.id), undefined);
  assert.deepEqual(parseBaseStock(undefined).offers, []);
  const corrupt = structuredClone(hero.baseStock); corrupt.offers[0].sockets = 99;
  assert.equal(parseBaseStock(corrupt).offers.length, 0);
  corrupt.offers[0] = { ...offer, id: '\" onclick=bad' };
  assert.equal(parseBaseStock(corrupt).offers.length, 0);
});
