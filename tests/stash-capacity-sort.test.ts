import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, organizeItems, packItems, footprint, stashRows, type Item } from '../src/items.ts';
import { newHero, moveStorage, parseSave, serializeSave } from '../src/model.ts';
import { moveSharedItem, parseSharedItems, SHARED_STASH_ROWS } from '../src/shared-stash.ts';

const ring = (id: string): Item => makeItem(BASES.find(base => base.baseCode === 'rin')!, id);
const properties = (items: Item[]) => items.map(({ x, y, ...item }) => item).sort((a, b) => a.id.localeCompare(b.id));

test('personal capacity counts occupied cells, permits 300 small items and persists all of them', () => {
  const hero = newHero(); hero.inventory = [ring('last')];
  hero.stash = Array.from({ length: 299 }, (_, i) => ring(`stored-${i}`));
  assert.ok(moveStorage(hero, 'last', true)); assert.equal(stashRows(hero.stash), 30);
  assert.equal(parseSave(serializeSave(hero))!.stash.length, 300);
  hero.inventory = [ring('overflow')]; const before = structuredClone(hero);
  assert.equal(moveStorage(hero, 'overflow', true), false); assert.deepEqual(hero, before);
  hero.stash = Array.from({ length: 50 }, (_, i) => ({ ...ring(`large-${i}`), width: 2, height: 3 }));
  assert.equal(moveStorage(hero, 'overflow', true), false);
});

test('shared capacity accepts 500 cells and rejects 501 or out-of-bounds drops without mutation', () => {
  assert.equal(SHARED_STASH_ROWS, 50);
  const items = Array.from({ length: 500 }, (_, i) => ring(`shared-${i}`));
  assert.equal(parseSharedItems(items).length, 500);
  assert.throws(() => parseSharedItems([...items, ring('extra')]));
  const hero = newHero(); hero.inventory = [ring('incoming')];
  const before = structuredClone({ hero, items });
  assert.throws(() => moveSharedItem(hero, items, { direction: 'deposit', container: 'inventory', itemId: 'incoming' }));
  assert.deepEqual({ hero, items }, before);
  assert.throws(() => moveSharedItem(hero, items, { direction: 'move', itemId: items[0].id, x: 0, y: 50 }));
});

for (const container of ['inventory', 'stash'] as const) test(`shared exact region exchange with ${container} works both ways and rejects partial coverage`, () => {
  const hero = newHero(); hero[container] = [{ ...ring('large'), width: 2, height: 3, x: 2, y: 0 }];
  const shared = [{ ...ring('one'), x: 6, y: 0 }, { ...ring('two'), x: 7, y: 2 }];
  const original = properties([...hero[container], ...shared]);
  moveSharedItem(hero, shared, { direction: 'deposit', container, itemId: 'large', position: { x: 6, y: 0 } });
  assert.deepEqual(hero[container].map(item => [item.id, item.x, item.y]).sort(), [['one', 2, 0], ['two', 3, 2]]);
  const before = structuredClone({ hero, shared });
  assert.throws(() => moveSharedItem(hero, shared, { direction: 'deposit', container, itemId: 'one', position: { x: 6, y: 0 } }));
  assert.deepEqual({ hero, shared }, before);
  moveSharedItem(hero, shared, { direction: 'withdraw', container, itemId: 'large', position: { x: 2, y: 0 } });
  assert.deepEqual(properties([...hero[container], ...shared]), original);
  assert.equal(hero[container][0].id, 'large');
});

test('organize groups quality, fills holes, preserves properties and is deterministic', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ ...ring(`ring-${i}`), rarity: i % 2 ? 'unique' as const : 'common' as const, x: i % 10, y: 25 + Math.floor(i / 10) }));
  const before = properties(items);
  assert.ok(organizeItems(items, 30)); assert.deepEqual(properties(items), before);
  assert.ok(items.slice(0, 15).every(item => item.rarity === 'unique'));
  assert.equal(Math.max(...items.map(item => item.y!)), 2);
  const once = structuredClone(items); assert.ok(organizeItems(items, 30)); assert.deepEqual(items, once);
  const mixed = [...items, ...Array.from({ length: 30 }, (_, i) => ({ ...ring(`big-${i}`), width: 2, height: 3 }))];
  assert.ok(organizeItems(mixed, 30)); assert.ok(packItems(mixed, 30));
  const cells = new Set<string>();
  for (const item of mixed) for (let y = 0; y < footprint(item)[1]; y++) for (let x = 0; x < footprint(item)[0]; x++) cells.add(`${item.x! + x},${item.y! + y}`);
  assert.equal(cells.size, 210);
  const invalid = [{ ...ring('too-large'), width: 11, height: 1 }], unchanged = structuredClone(invalid);
  assert.equal(organizeItems(invalid, 30), false); assert.deepEqual(invalid, unchanged);
});

test('legacy over-capacity personal items can be taken out without losing the remainder', () => {
  const hero = newHero(); hero.inventory = []; hero.stash = Array.from({ length: 60 }, (_, i) => ({ ...ring(`old-${i}`), width: 2, height: 3 }));
  assert.ok(moveStorage(hero, 'old-0', false)); assert.equal(hero.stash.length, 59);
  const shared: Item[] = []; moveSharedItem(hero, shared, { direction: 'deposit', container: 'stash', itemId: 'old-1' });
  assert.equal(hero.stash.length, 58); assert.equal(shared[0].id, 'old-1');
});

test('shared exchanges reject a returned item already owned in another personal container', () => {
  const hero = newHero(); hero.inventory = [{ ...ring('incoming'), x: 0, y: 0 }]; hero.stash = [ring('duplicate')];
  const shared = [{ ...ring('duplicate'), x: 0, y: 0 }], before = structuredClone({ hero, shared });
  assert.throws(() => moveSharedItem(hero, shared, { direction: 'deposit', container: 'inventory', itemId: 'incoming', position: { x: 0, y: 0 } }), /相同标识/);
  assert.deepEqual({ hero, shared }, before);
});
