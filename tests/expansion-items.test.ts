import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, RUNE_ORDER, RUNES, RUNEWORDS, SPECIAL_ITEMS, makeItem, rollItem, socketItem, itemMods, itemRequirements, runewordFits } from '../src/items.ts';
import { runePool, rollRune, rollLoot, rollCharm, upgradeRune, runeUpgradeCost } from '../src/loot.ts';
import { newHero, stats, parseSave, serializeSave, equipReason } from '../src/model.ts';
const seeded = (seed = 73) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

test('all 33 ordered runes, 25 usable recipes, tiered bases and expanded uniques are present', () => {
  assert.equal(RUNE_ORDER.length, 33); assert.deepEqual(Object.keys(RUNES), [...RUNE_ORDER]);
  assert.equal(RUNEWORDS.length, 25); assert.ok(BASES.length >= 80); assert.ok(SPECIAL_ITEMS.length >= 40);
  assert.equal(new Set(BASES.map(b => b.name)).size, BASES.length);
  for (const id of RUNE_ORDER) for (const slot of ['weapon', 'armor', 'shield'] as const) assert.ok(Object.keys(RUNES[id][slot]).length, `${id}: ${slot}`);
  for (const word of RUNEWORDS) {
    const base = BASES.find(b => (b.sockets ?? 0) >= word.runes.length && runewordFits({ ...makeItem(b), sockets: word.runes.length }, word));
    assert.ok(base, `${word.name} has a droppable base`);
    const item = makeItem(base); item.sockets = word.runes.length;
    for (const rune of word.runes) assert.equal(socketItem(item, rune), true);
    assert.equal(item.name, word.name); assert.equal(item.rarity, 'runeword');
  }
});
test('rune words reject wrong weapon categories, wrong order, quality and socket counts', () => {
  const spirit = RUNEWORDS.find(w => w.name === '精神')!;
  for (const name of ['连枷', '巨战权杖', '锐利之斧']) {
    const item = makeItem(BASES.find(b => b.name === name)!); item.sockets = 4;
    spirit.runes.forEach(r => socketItem(item, r)); assert.equal(item.rarity, 'common');
  }
  for (const variant of ['order', 'rarity', 'count']) {
    const item = makeItem(BASES.find(b => b.name === '水晶剑')!); item.sockets = variant === 'count' ? 5 : 4; if (variant === 'rarity') item.rarity = 'magic';
    (variant === 'order' ? [...spirit.runes].reverse() : spirit.runes).forEach(r => socketItem(item, r)); assert.notEqual(item.rarity, 'runeword');
  }
});
test('Hel changes actual equipment requirements and high-rune modifiers survive saves', () => {
  const hero = newHero(), item = makeItem(BASES.find(b => b.name === '水晶剑')!); item.sockets = 2; socketItem(item, 'hel');
  assert.equal(itemRequirements(item).strength, 34); hero.strength = 34; hero.inventory = [item]; assert.equal(equipReason(hero, item), '');
  socketItem(item, 'zod'); hero.runes = [...RUNE_ORDER];
  assert.equal(itemMods(item).indestructible, 1); assert.deepEqual(parseSave(serializeSave(hero)), hero);
});
test('maximum life, resistance caps and per-level defense have real stat effects', () => {
  const hero = newHero(); hero.equipment.armor = { ...makeItem(BASES.find(b => b.slot === 'armor')!), mods: { maxLifePercent: 5, maxFireRes: 5, fireRes: 100, defensePerLevel: 3 } };
  const s = stats(hero); assert.equal(s.maxHp, 57.75); assert.equal(s.resistances.fire, 80); assert.equal(s.maxResistances.fire, 80);
  const armor = hero.equipment.armor; armor.mods = {}; assert.equal(s.defense - stats(hero).defense, 3);
});
test('rune pools obey both area level and difficulty, every rune is reachable', () => {
  assert.ok(!runePool(99, 0, 4).includes('zod')); assert.ok(!runePool(99, 1, 4).includes('ber'));
  assert.ok(!runePool(1, 2, 4).includes('ist')); assert.deepEqual(runePool(99, 2, 4), [...RUNE_ORDER]);
  assert.equal(rollRune(99, 2, 4, true, () => .99999999), 'zod');
  const random = seeded(), counts = new Map<string, number>();
  for (let i = 0; i < 100000; i++) { const rune = rollRune(90, 2, 4, false, random); counts.set(rune, (counts.get(rune) ?? 0) + 1); }
  assert.ok((counts.get('el') ?? 0) > (counts.get('ist') ?? 0) * 3); assert.ok((counts.get('ist') ?? 0) > (counts.get('zod') ?? 0) * 5); assert.ok((counts.get('zod') ?? 0) > 5);
});
test('boss first-clear guarantees an eligible unique; repeats stay worthwhile without guaranteed uniques', () => {
  const context = { level: 35, act: 2, difficulty: 0, rank: 'actBoss' as const };
  const first = rollLoot({ ...context, firstClear: true }, () => .5);
  assert.equal(first.items.length, 2); assert.equal(first.items[0].rarity, 'unique'); assert.equal(first.runes.length, 1);
  assert.ok(first.items.every(item => (item.requiredLevel ?? 1) <= 35));
  const repeat = rollLoot(context, () => .5); assert.equal(repeat.items.length, 2); assert.ok(repeat.items.every(i => i.rarity === 'rare'));
  for (const random of [() => 0, () => .99]) { const countess = rollLoot({ ...context, rank: 'miniboss', countess: true }, random); assert.ok(countess.runes.length >= 2 && countess.runes.length <= 3); }
});
test('loot level comes from the encounter; MF improves quality but cannot remove white bases', () => {
  const random = seeded(), ordinary = { level: 5, act: 0, difficulty: 0, rank: 'monster' as const };
  for (let i = 0; i < 300; i++) for (const item of rollLoot(ordinary, random).items) assert.equal(item.level, 5);
  let low = 0, high = 0, white = 0;
  for (let i = 0; i < 1000; i++) { const r = (i + .5) / 1000; low += Number(rollItem(80, r, false, 0, random).rarity === 'unique'); const item = rollItem(80, r, false, 500, random); high += Number(item.rarity === 'unique'); white += Number(item.rarity === 'common'); }
  assert.ok(high > low * 2 && high < low * 4); assert.equal(white, 320);
  assert.equal(rollCharm(99, () => .9).height, 1); assert.equal(rollCharm(99, () => 0).height, 3);
});
test('rune upgrading is atomic, preserves unrelated runes and makes Zod terminal', () => {
  const runes = ['el', 'tir', 'el', 'el', 'pul', 'pul'] as const, bag = [...runes];
  assert.equal(upgradeRune(bag, 'el'), true); assert.deepEqual(bag, ['tir', 'pul', 'pul', 'eld']);
  assert.equal(upgradeRune(bag, 'pul'), true); assert.deepEqual(bag, ['tir', 'eld', 'um']);
  const before = [...bag]; assert.equal(upgradeRune(bag, 'el'), false); assert.equal(upgradeRune(bag, 'zod'), false); assert.deepEqual(bag, before); assert.equal(runeUpgradeCost('zod'), null);
});
