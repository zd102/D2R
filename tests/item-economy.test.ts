import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, placeItems, DROP_RATES, rollDropKinds } from '../src/items.ts';
import { newHero, identifyItem, IDENTIFY_COST, sellItem, stats, serializeSave, parseSave } from '../src/model.ts';

const ring = (id: string) => ({ ...makeItem(BASES.find(base => base.slot === 'ring')!, id), identified: false, rarity: 'rare' as const });
test('identification charges exactly 80 gold in either container without using scrolls', () => {
  const hero = newHero(); hero.gold = 160; hero.identifyScrolls = 0; hero.inventory = [ring('bag')]; hero.stash = [ring('stash')];
  assert.equal(IDENTIFY_COST, 80); assert.equal(identifyItem(hero, 'bag'), true); assert.equal(hero.gold, 80); assert.equal(hero.identifyScrolls, 0);
  assert.equal(identifyItem(hero, 'stash'), true); assert.equal(hero.gold, 0); assert.equal(hero.stash[0].identified, true);
  assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('insufficient gold, repeat identification and unavailable item ids never spend gold or scrolls', () => {
  const hero = newHero(); hero.inventory = [ring('unidentified')]; hero.gold = 79; hero.identifyScrolls = 99;
  const before = structuredClone(hero); assert.equal(identifyItem(hero, 'unidentified'), false); assert.deepEqual(hero, before);
  hero.gold = 80; assert.equal(identifyItem(hero, 'unidentified'), true);
  hero.gold = 100; assert.equal(identifyItem(hero, 'unidentified'), false); assert.equal(identifyItem(hero, 'missing'), false); assert.equal(hero.gold, 100); assert.equal(hero.identifyScrolls, 99);
  assert.equal(identifyItem(hero, hero.equipment.weapon!.id), false);
});
test('stash items can be sold with a completely full backpack and do not rearrange other items', () => {
  const hero = newHero(); hero.inventory = Array.from({ length: 40 }, (_, i) => ring(`bag-${i}`)); placeItems(hero.inventory);
  hero.stash = [{ ...ring('sale'), value: 275, x: 7, y: 8 }, { ...ring('keep'), x: 9, y: 9 }]; hero.gold = 30;
  const bag = structuredClone(hero.inventory), keep = structuredClone(hero.stash[1]);
  assert.equal(sellItem(hero, 'sale'), true); assert.equal(hero.gold, 305); assert.deepEqual(hero.inventory, bag); assert.deepEqual(hero.stash, [keep]);
  assert.equal(sellItem(hero, 'sale'), false); assert.equal(hero.gold, 305); assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('selling a backpack charm updates resources and never sells worn or alternate equipment', () => {
  const hero = newHero(); hero.inventory = [{ ...ring('charm'), charm: true, identified: true, mods: { life: 50, mana: 20 } }];
  hero.hp = stats(hero).maxHp; hero.mana = stats(hero).maxMana;
  assert.equal(sellItem(hero, 'charm'), true); assert.equal(hero.hp, 55); assert.equal(hero.mana, 15);
  const before = structuredClone(hero); assert.equal(sellItem(hero, hero.equipment.weapon!.id), false); assert.deepEqual(hero, before);
});
test('expansion drops reduce ordinary gear clutter and favor repeatable boss rewards', () => {
  assert.deepEqual(DROP_RATES.monster, { equipment: .16, rune: .035, charm: .006 });
  assert.deepEqual(DROP_RATES.miniboss, { equipment: .80, rune: .28, charm: .025 });
  assert.deepEqual(DROP_RATES.actBoss, { equipment: 1, rune: .70, charm: .04 });
  for (const rank of ['monster', 'miniboss', 'actBoss'] as const) {
    const counts = { equipment: 0, rune: 0, charm: 0 };
    for (let i = 0; i < 10000; i++) { const drops = rollDropKinds(rank, () => i / 10000); for (const key of ['equipment', 'rune', 'charm'] as const) counts[key] += Number(drops[key]); }
    for (const key of ['equipment', 'rune', 'charm'] as const) assert.equal(counts[key], Math.round(DROP_RATES[rank][key] * 10000), `${rank}: ${key}`);
  }
});
