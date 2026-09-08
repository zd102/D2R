import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, packItems, placeItems, canMoveItem, moveItem, stashRows } from '../src/items.ts';
import { newHero, moveStorage, parseSave, serializeSave } from '../src/model.ts';

const sword = (id: string, x?: number, y?: number) => ({ ...makeItem(BASES[0], id), ...(x === undefined ? {} : { x, y }) });
const ring = (id: string, x?: number, y?: number) => ({ ...makeItem(BASES.find(base => base.slot === 'ring')!, id), ...(x === undefined ? {} : { x, y }) });

test('moving multi-cell equipment preserves every other position, item and array order', () => {
  const items = [sword('sword', 0, 0), ring('ring', 5, 2)], originalRing = structuredClone(items[1]);
  assert.equal(moveItem(items, 'sword', 8, 1), true);
  assert.deepEqual(items.map(item => [item.id, item.x, item.y]), [['sword', 8, 1], ['ring', 5, 2]]);
  assert.deepEqual(items[1], originalRing); assert.equal(items[0].maxDamage, 7);
  assert.equal(moveItem(items, 'sword', 7, 1), true, 'The moving item may overlap its own old footprint');
});
test('occupied, partial-overlap, out-of-bounds and invalid moves are atomic failures', () => {
  const items = [sword('sword', 0, 0), ring('ring', 4, 2)], original = structuredClone(items);
  for (const [x, y] of [[3, 0], [4, 2], [-1, 0], [9, 0], [0, 2], [0, -1], [0.5, 0], [NaN, 0], [0, Infinity]]) {
    assert.equal(canMoveItem(items, 'sword', x, y), false, `${x},${y}`);
    assert.equal(moveItem(items, 'sword', x, y), false); assert.deepEqual(items, original);
  }
  assert.equal(moveItem(items, 'missing', 7, 0), false); assert.deepEqual(items, original);
});
test('new items cannot push hand-placed items out of saved cells, regardless of array order', () => {
  const items = [sword('new'), sword('placed', 0, 0), ring('corner', 9, 3)];
  assert.equal(placeItems(items), true);
  assert.deepEqual([items[1].x, items[1].y], [0, 0]); assert.deepEqual([items[2].x, items[2].y], [9, 3]);
  assert.deepEqual([items[0].x, items[0].y], [2, 0]);
});
test('moving a legacy item materializes the displayed positions without rearranging other items', () => {
  const items = [sword('legacy'), ring('other')], before = packItems(items)!;
  assert.equal(moveItem(items, 'legacy', 8, 1), true);
  assert.deepEqual([items[1].x, items[1].y], [before.get('other')!.x, before.get('other')!.y]);
  assert.equal(placeItems(items), true); assert.deepEqual([items[0].x, items[0].y], [8, 1]);
});
test('backpack and stash moves persist across save loading and container transfers', () => {
  const hero = newHero(); hero.inventory = [sword('bag', 0, 0)]; hero.stash = [sword('stash', 0, 0), ring('stored-ring', 4, 4)];
  assert.equal(moveItem(hero.inventory, 'bag', 8, 1, 4), true);
  assert.equal(moveItem(hero.stash, 'stash', 8, 7, stashRows(hero.stash)), true);
  const loaded = parseSave(serializeSave(hero))!;
  assert.deepEqual(loaded.inventory, hero.inventory); assert.deepEqual(loaded.stash, hero.stash);
  assert.equal(moveStorage(loaded, 'stored-ring', false), true);
  assert.deepEqual([loaded.inventory[0].x, loaded.inventory[0].y], [8, 1]);
  assert.deepEqual([loaded.stash[0].x, loaded.stash[0].y], [8, 7]);
});
test('expanded legacy stash rows retain their manual coordinates when another item is transferred in', () => {
  const hero = newHero(); hero.stash = [sword('legacy', 8, 14)]; hero.inventory = [ring('new')];
  assert.equal(stashRows(hero.stash), 17);
  assert.equal(moveStorage(hero, 'new', true), true); assert.equal(hero.stash[0].y, 14);
  assert.equal(stashRows(parseSave(serializeSave(hero))!.stash), 17);
});
