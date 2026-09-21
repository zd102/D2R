import test from 'node:test';
import assert from 'node:assert/strict';
import { newHero, parseSave, serializeSave } from '../src/model.ts';
import { BASES, makeItem, placeItems } from '../src/items.ts';
import { GAMBLING_FAMILIES, gamblingUnlocked, gamblingStock, gamblingPool, gamblingPrice, gamblingRarity, gamblingBase, gamblingBaseTier, buyGamble } from '../src/gambling.ts';

const hero = () => { const h = newHero(); h.level = 80; h.campaign.cleared[0] = 25; h.gold = 1000000; return h; };
const base = (code: string) => BASES.find(base => base.baseCode === code)!;
const rolls = (...values: number[]) => () => values.shift() ?? .5;

test('gambling unlocks only after normal and stocks eligible normal bases with jewelry', () => {
  const h = hero(); h.campaign.cleared = [24, 25, 25];
  assert.equal(gamblingUnlocked(h), false); assert.deepEqual(gamblingStock(h), []);
  const before = serializeSave(h); assert.equal(buyGamble(h, 'rin'), undefined); assert.equal(serializeSave(h), before);
  h.campaign.cleared[0] = 25;
  assert.equal(gamblingUnlocked(h), true);
  for (const family of GAMBLING_FAMILIES) assert.ok(family.every(Boolean));
  const pool = gamblingPool(h);
  for (const code of ['rin', 'amu', 'ci0', 'ci1', 'ktr', 'lgl', 'crs']) assert.ok(pool.includes(base(code)));
  for (const code of ['7cr', 'ci3', 'cm1', 'jew', 'ob1', 'pa1', 'sst', 'wnd', 'scp']) assert.ok(!pool.includes(base(code)));
  const stock = gamblingStock(h, () => .4); assert.equal(stock.length, 14); assert.equal(new Set(stock).size, 14);
  assert.deepEqual(stock.slice(0, 2), ['rin', 'amu']);
  h.level = 1; assert.ok(gamblingPool(h).every(b => b.level <= 5));
});

test('quality thresholds and exceptional/elite upgrades follow gambling rules', () => {
  assert.equal(gamblingBaseTier('cap'), '普通');
  assert.equal(gamblingBaseTier('xap'), '拓展');
  assert.equal(gamblingBaseTier('uap'), '精英');
  assert.equal(gamblingBaseTier('ci1'), '普通');
  assert.equal(gamblingBaseTier('ci2'), '拓展');
  assert.equal(gamblingBaseTier('ci3'), '精英');
  assert.equal(gamblingBaseTier('rin'), '普通');
  assert.equal(gamblingBaseTier(undefined), undefined);
  for (const [roll, rarity] of [[0, 'unique'], [.0004999, 'unique'], [.0005, 'set'], [.0014999, 'set'], [.0015, 'rare'], [.1014999, 'rare'], [.1015, 'magic'], [.99999, 'magic']] as const) assert.equal(gamblingRarity(roll), rarity);
  assert.equal(gamblingBase(base('cap'), 99, () => 0).baseCode, 'uap');
  assert.equal(gamblingBase(base('cap'), 99, rolls(.99, 0)).baseCode, 'xap');
  assert.equal(gamblingBase(base('cap'), 5, () => 0).baseCode, 'cap');
  assert.equal(gamblingBase(base('ci1'), 99, () => 0).baseCode, 'ci3');
  assert.equal(gamblingBase(base('rin'), 99, () => 0).baseCode, 'rin');
});

test('purchases reveal rolled items, charge once, repeat and persist; MF and difficulty do not affect results', () => {
  for (const diff of [0, 1, 2] as const) {
    const h = hero(); h.difficultyLevel = diff; h.equipment.weapon!.mods = { magicFind: diff * 1000 };
    for (const [roll, rarity] of [[0, 'unique'], [.001, 'set'], [.05, 'rare'], [.5, 'magic']] as const) {
      const gold = h.gold, item = buyGamble(h, 'rin', rolls(.9, roll))!;
      assert.equal(item.rarity, rarity); assert.equal(item.level, 84); assert.equal(item.identified, true); assert.ok(!item.ethereal);
      assert.equal(gold - h.gold, 50000); assert.equal(item.baseCode, 'rin');
      assert.deepEqual(parseSave(serializeSave(h))!.inventory.find(i => i.id === item.id), item);
    }
    assert.equal(new Set(h.inventory.map(i => i.id)).size, 4);
  }
  const h = hero(); h.level = 99;
  assert.equal(buyGamble(h, 'amu', rolls(.99, .5))!.level, 99);
  h.level = 1; assert.equal(buyGamble(h, 'rin', rolls(0, .5))!.level, 5);
});

test('failed unique/set rolls downgrade; equipment cannot become ethereal', () => {
  for (const [quality, rarity] of [[0, 'rare'], [.001, 'magic']] as const) {
    const h = hero(); h.level = 1;
    const item = buyGamble(h, 'rin', rolls(0, quality))!;
    assert.equal(item.rarity, rarity); assert.equal(item.baseCode, 'rin'); assert.ok(!item.ethereal);
  }
  assert.ok(!buyGamble(hero(), 'cap', () => 0)!.ethereal);
});

test('invalid purchases and full bags never charge or mutate; discounts apply', () => {
  const h = hero();
  for (const code of ['missing', '7cr', 'cm1']) { const before = serializeSave(h); assert.equal(buyGamble(h, code), undefined); assert.equal(serializeSave(h), before); }
  h.gold = 49999; let before = serializeSave(h); assert.equal(buyGamble(h, 'rin'), undefined); assert.equal(serializeSave(h), before);
  h.gold = 1000000; h.inventory = Array.from({ length: 40 }, () => makeItem(base('rin'))); placeItems(h.inventory);
  before = serializeSave(h); assert.equal(buyGamble(h, 'rin'), undefined); assert.equal(serializeSave(h), before);
  h.inventory = []; h.equipment.weapon!.mods = { vendorDiscount: 15 };
  assert.equal(gamblingPrice(h, base('rin')), 42500); assert.equal(gamblingPrice(h, base('amu')), 53550);
  buyGamble(h, 'rin'); assert.equal(h.gold, 957500);
});
