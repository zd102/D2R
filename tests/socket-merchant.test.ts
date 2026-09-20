import test from 'node:test';
import assert from 'node:assert/strict';
import { newHero, parseSave, serializeSave } from '../src/model.ts';
import { BASES, makeItem, socketItem, type Item } from '../src/items.ts';
import { buySocketing, socketMerchantUnlocked, socketMerchantPrice, socketQuestRange } from '../src/socket-merchant.ts';

const gear = (code = 'crs', level = 41, rarity: Item['rarity'] = 'common') => ({ ...makeItem(BASES.find(base => base.baseCode === code)!), level, rarity });

test('Larzuk caps use item level thresholds, base type and rarity', () => {
  for (const [level, cap] of [[1, 3], [25, 3], [26, 4], [40, 4], [41, 6], [99, 6]]) {
    assert.deepEqual(socketQuestRange(gear('crs', level)), [cap, cap]);
  }
  assert.deepEqual(socketQuestRange(gear('cap')), [2, 2]);
  assert.deepEqual(socketQuestRange(gear('buc', 99, 'magic')), [1, 1]);
  assert.deepEqual(socketQuestRange(gear('crs', 99, 'magic')), [1, 2]);
  for (const rarity of ['rare', 'unique', 'set', 'legendary'] as const) assert.deepEqual(socketQuestRange(gear('crs', 99, rarity)), [1, 1]);
  for (const code of ['rin', 'amu', 'jav', 'tbl', 'lgl', 'lbt']) assert.equal(socketQuestRange(gear(code)), undefined);
  assert.equal(socketQuestRange({ ...gear(), baseCode: 'missing' }), undefined);
});

test('unlock requires normal completion and invalid transactions never mutate saves', () => {
  const hero = newHero(); hero.gold = 100000; hero.inventory = [gear()];
  hero.campaign.cleared = [24, 25, 25];
  assert.equal(socketMerchantUnlocked(hero), false);
  let before = serializeSave(hero);
  assert.equal(buySocketing(hero, hero.inventory[0].id), undefined); assert.equal(serializeSave(hero), before);
  hero.campaign.cleared[0] = 25;
  for (const item of [{ ...gear(), identified: false }, { ...gear(), sockets: 1 }, { ...gear(), runes: ['el'] as Item['runes'] }, { ...gear(), misc: true }, gear('jav')]) {
    hero.inventory = [item]; before = serializeSave(hero);
    assert.equal(buySocketing(hero, item.id), undefined); assert.equal(serializeSave(hero), before);
  }
  hero.inventory = [gear()]; hero.gold = socketMerchantPrice(hero, hero.inventory[0]) - 1; before = serializeSave(hero);
  assert.equal(buySocketing(hero, hero.inventory[0].id), undefined);
  assert.equal(buySocketing(hero, 'missing'), undefined); assert.equal(serializeSave(hero), before);
});

test('paid socketing preserves properties, persists and supports subsequent runewords', () => {
  const hero = newHero(); hero.campaign.cleared[0] = 25; hero.gold = 100000;
  const item = { ...gear('crs', 26), ethereal: true, baseQuality: 'superior' as const, mods: { damage: 15 } };
  hero.inventory = [item]; const before = structuredClone(item), price = socketMerchantPrice(hero, item);
  assert.equal(buySocketing(hero, item.id), item);
  assert.deepEqual(item, { ...before, sockets: 4 }); assert.equal(hero.gold, 100000 - price);
  const save = serializeSave(hero); assert.equal(buySocketing(hero, item.id), undefined); assert.equal(serializeSave(hero), save);
  const loaded = parseSave(save)!; assert.equal(loaded.inventory[0].sockets, 4);
  for (const rune of ['tal', 'thul', 'ort', 'amn'] as const) assert.equal(socketItem(loaded.inventory[0], rune), true);
  assert.equal(loaded.inventory[0].rarity, 'runeword');
});

test('magic rolls both outcomes and is capped by base; multiple items can be serviced', () => {
  const hero = newHero(); hero.campaign.cleared[0] = 25; hero.gold = 100000;
  for (const [roll, sockets] of [[0, 1], [.49999, 1], [.5, 2], [.99999, 2]]) {
    const item = gear('crs', 41, 'magic'); hero.inventory = [item];
    assert.equal(buySocketing(hero, item.id, () => roll)?.sockets, sockets);
  }
  const item = gear('buc', 99, 'magic'); hero.inventory = [item];
  assert.equal(buySocketing(hero, item.id, () => .9)?.sockets, 1);
});
