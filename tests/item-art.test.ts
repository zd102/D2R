import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, RUNE_ORDER, RUNEWORDS, makeItem, runeNumber, runeLabel } from '../src/items.ts';
import { itemArtwork, itemArtKey, runeArtwork } from '../src/item-art.ts';
import { filterEncyclopediaItems } from '../src/encyclopedia.ts';

test('each actual equipment base has distinct artwork, stable across instances and legacy names', () => {
  const drawings = new Map<string, string>();
  for (const base of BASES) {
    const first = makeItem(base, 'first'), second = makeItem(base, 'second');
    assert.equal(itemArtwork(first), itemArtwork(second));
    const legacy = { ...first }; delete legacy.baseCode;
    assert.equal(itemArtKey(legacy), base.baseCode);
    assert.equal(itemArtwork(legacy), itemArtwork(first));
    const drawing = itemArtwork(first).replace(/ data-[\w-]+="[^"]*"/g, '');
    assert.ok(!drawings.has(drawing) || drawings.get(drawing) === base.baseCode, `${base.baseCode} shares artwork with ${drawings.get(drawing)}`);
    drawings.set(drawing, base.baseCode!);
  }
  assert.equal(drawings.size, new Set(BASES.map(base => base.baseCode)).size);
});

test('rune numbers follow rune order instead of level or recipe socket position', () => {
  assert.equal(runeNumber('el'), '#1'); assert.equal(runeNumber('eld'), '#2'); assert.equal(runeNumber('tir'), '#3');
  assert.equal(runeNumber('jah'), '#31'); assert.equal(runeNumber('zod'), '#33');
  assert.equal(runeLabel('el'), '艾尔 #1');
  assert.deepEqual(RUNEWORDS.find(word => word.name === '钢铁')!.runes.map(runeNumber), ['#3', '#1']);
  assert.deepEqual(RUNEWORDS.find(word => word.name === '精神')!.runes.map(runeNumber), ['#7', '#10', '#9', '#11']);
  assert.equal(new Set(RUNE_ORDER.map(id => runeArtwork(id).replace(/ data-rune-icon="[^"]*"/, ''))).size, 33);
});

test('encyclopedia searches exact rune numbers and finds their recipes', () => {
  assert.deepEqual(filterEncyclopediaItems('#1', 'rune').map(entry => entry.rune), ['el']);
  assert.deepEqual(filterEncyclopediaItems('#33', 'rune').map(entry => entry.rune), ['zod']);
  const recipes = filterEncyclopediaItems('#1', 'runeword');
  assert.ok(recipes.some(entry => entry.word?.name === '钢铁'));
  assert.ok(recipes.every(entry => entry.word?.runes.includes('el')));
  assert.equal(filterEncyclopediaItems('#34').length, 0);
});
