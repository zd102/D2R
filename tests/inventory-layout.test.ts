import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, packItems, placeItems, canMoveItem, moveItem, itemMovePlan, stashRows } from '../src/items.ts';
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
test('partially covered items, out-of-bounds and invalid moves are atomic failures', () => {
  const items = [sword('sword', 0, 0), { ...ring('blocker', 4, 2), width: 2, height: 2 }], original = structuredClone(items);
  for (const [x, y] of [[3, 0], [4, 2], [-1, 0], [9, 0], [0, 2], [0, -1], [0.5, 0], [NaN, 0], [0, Infinity]]) {
    assert.equal(canMoveItem(items, 'sword', x, y), false, `${x},${y}`);
    assert.equal(moveItem(items, 'sword', x, y), false); assert.deepEqual(items, original);
  }
  assert.equal(moveItem(items, 'missing', 7, 0), false); assert.deepEqual(items, original);
});

test('a covered region exchanges every whole item while preserving relative positions and array order', () => {
  const items = [sword('source', 0, 0), ring('top', 6, 0), ring('bottom', 7, 2), ring('untouched', 9, 3)];
  const references = [...items], other = structuredClone(items[3]);
  const plan = itemMovePlan(items, 'source', 6, 0)!;
  assert.deepEqual(plan.swapped, ['top', 'bottom']);
  assert.ok(moveItem(items, 'source', 6, 0));
  assert.deepEqual(items.map(item => [item.id, item.x, item.y]), [['source', 6, 0], ['top', 0, 0], ['bottom', 1, 2], ['untouched', 9, 3]]);
  for (let i = 0; i < items.length; i++) assert.equal(items[i], references[i]);
  assert.deepEqual(items[3], other);
  assert.ok(moveItem(items, 'source', 0, 0));
  assert.deepEqual(items.map(item => [item.x, item.y]), [[0, 0], [6, 0], [7, 2], [9, 3]]);
});

test('one complete item does not permit an exchange when another is only partly covered', () => {
  const items = [sword('source', 0, 0), ring('whole', 6, 0), { ...ring('partial', 7, 1), width: 2, height: 2 }];
  const before = structuredClone(items);
  assert.equal(itemMovePlan(items, 'source', 6, 0), null);
  assert.equal(moveItem(items, 'source', 6, 0), false); assert.deepEqual(items, before);
});

test('overlapping exchange regions cannot put a returned item inside the incoming equipment', () => {
  const items = [sword('source', 0, 0), ring('covered', 2, 1)], before = structuredClone(items);
  assert.equal(moveItem(items, 'source', 1, 0), false); assert.deepEqual(items, before);
});

test('region exchanges persist through save loading and reject duplicate identities', () => {
  const hero = newHero(); hero.stash = [sword('source', 0, 0), sword('other', 8, 7)];
  assert.ok(moveItem(hero.stash, 'source', 8, 7, 10));
  assert.deepEqual(parseSave(serializeSave(hero))!.stash, hero.stash);
  const duplicate = [ring('duplicate', 0, 0), ring('duplicate', 2, 0)], before = structuredClone(duplicate);
  assert.equal(moveItem(duplicate, 'duplicate', 4, 0), false); assert.deepEqual(duplicate, before);
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
