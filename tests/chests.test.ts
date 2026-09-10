import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chestContext, chestTreasure, rollChestCodes, rollChestLoot, chestItem, chestQualityChance } from '../src/chests.ts';
import { CHEST_TREASURES, CHEST_MISC } from '../src/chest-data.ts';
import { LEVELS, levelLayout, FIELD_BOUND } from '../src/campaign.ts';
import { BASES, isAvailableItem, type Item } from '../src/items.ts';
import { newHero, parseSave, serializeSave, equipReason, moveStorage, sellItem } from '../src/model.ts';
import { gridWalkable, GameWorld } from '../src/world.ts';
import PF from 'pathfinding';

function rng(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
const context = chestContext(LEVELS[0], 0);
test('bonus chest rolls retain the original empty check and four NoDrop picks', () => {
  assert.equal(chestTreasure(context).id, 'Act 1 Chest A');
  assert.deepEqual(rollChestCodes(context, () => 0), []);
  const draws = [.5, 0, 100 / 142, 0, 0];
  assert.deepEqual(rollChestCodes(context, () => draws.shift() ?? 0), ['gld']);
  const random = rng(94); let empty = 0, count = 0;
  for (let i = 0; i < 25000; i++) { const codes = rollChestCodes(context, random); empty += Number(!codes.length); count += codes.length; assert.ok(codes.length <= 4); }
  // Junk retains only 8/16 Potion 1 picks, of which 25/30 are usable;
  // Good retains 5/10 Jewelry picks. Removed leaves do not get rerolled.
  const usefulWeight = 15 + 15 * (8 / 16) * (25 / 30) + 10 + 2 * (5 / 10);
  assert.ok(Math.abs(empty / 25000 - (.25 + .75 * (1 - usefulWeight / 142) ** 4)) < .015);
  assert.ok(Math.abs(count / 25000 - .75 * 4 * usefulWeight / 142) < .03);
});
test('all chest branches resolve with usable drops and without replacing removed junk with equipment', () => {
  const tableNames = new Set(CHEST_TREASURES.map(row => row.id));
  const baseCodes = new Set(BASES.map(base => base.baseCode));
  const miscCodes = new Set(CHEST_MISC.map(item => item.code));
  for (const row of CHEST_TREASURES) for (const [code, weight] of row.entries) {
    assert.ok(weight > 0); assert.ok(tableNames.has(code) || baseCodes.has(code) || miscCodes.has(code) || /^(gld|r\d\d|weap\d+|armo\d+)$/.test(code), code);
  }
  const random = rng(401); let items = 0, runes = 0;
  for (const level of LEVELS) for (const diff of [0, 1, 2]) for (let i = 0; i < 160; i++) {
    const ctx = chestContext(level, diff);
    assert.ok(chestTreasure(ctx).id.startsWith(`Act ${level.act + 1}`));
    const drops = rollChestLoot(ctx, random); assert.ok(drops.length <= 6);
    assert.ok(drops.some(drop => (drop.gold ?? 0) > 0)); assert.ok(drops.some(drop => drop.potion !== undefined));
    for (const drop of drops) {
      if (drop.rune) runes++;
      if (drop.item) { items++; assert.ok(isAvailableItem(drop.item)); assert.equal(drop.item.level, ctx.level); assert.notEqual(drop.item.rarity, 'runeword'); }
    }
  }
  assert.ok(items > 500 && runes > 5);
});
test('even an empty bonus table gives a gold pile and usable potion in all 75 areas', () => {
  for (const level of LEVELS) for (const diff of [0, 1, 2]) for (const goldFind of [0, 100]) {
    const ctx = chestContext(level, diff, 0, goldFind), drops = rollChestLoot(ctx, () => 0);
    assert.deepEqual(drops, [{ gold: (5 + ctx.level) * (1 + goldFind / 100) }, { potion: 0 }]);
    let calls = 0;
    const mana = rollChestLoot(ctx, () => calls++ ? .99 : 0);
    assert.equal(mana.at(-1)!.potion, 1);
  }
});
test('MF changes quality only, while gold find changes pile size only', () => {
  const without = rng(999);
  const summary = (drops: ReturnType<typeof rollChestLoot>) => drops.map(drop => drop.item ? { base: drop.item.baseCode, misc: !!drop.item.misc } : drop);
  for (let i = 0; i < 1000; i++) {
    const seed = Math.floor(without() * 1e9), ctx = chestContext(LEVELS[24], 2);
    const a = rollChestLoot(ctx, rng(seed)), b = rollChestLoot({ ...ctx, magicFind: 500 }, rng(seed)), c = rollChestLoot({ ...ctx, goldFind: 100 }, rng(seed));
    assert.deepEqual(summary(a), summary(b));
    assert.deepEqual(c.map(drop => drop.gold ? { gold: drop.gold / 2 } : drop.item ? { base: drop.item.baseCode } : drop), a.map(drop => drop.item ? { base: drop.item.baseCode } : drop));
  }
  const base = BASES[0];
  assert.equal(chestQualityChance(base, base.qualityLevel!, 'unique', 0), 1 / 400);
  assert.ok(chestQualityChance(base, 80, 'unique', 500) > chestQualityChance(base, 80, 'unique', 0));
});
test('chest unique and set rolls preserve the selected base, with failed quality downgrades', () => {
  for (const base of BASES.filter(base => !base.charm).slice(0, 80)) {
    const item = chestItem(base, 99, 0, () => 0);
    assert.equal(item.baseCode, base.baseCode); assert.ok(['unique', 'rare'].includes(item.rarity));
  }
  const charm = chestItem(BASES.find(base => base.baseCode === 'cm1')!, 1, 0, () => 0);
  assert.equal(charm.charm, true); assert.equal(charm.rarity, 'magic');
});
test('legacy miscellaneous items survive saves and storage, cannot be equipped and can be sold', () => {
  const hero = newHero();
  const misc = CHEST_MISC.find(entry => entry.code === 'gcv')!;
  hero.inventory = [{ id: 'legacy-gem', name: misc.name, base: misc.name, baseCode: misc.code, slot: 'amulet', rarity: 'common', power: 0, level: 1, value: 125, identified: true, width: misc.width, height: misc.height, misc: true } as Item];
  const item = hero.inventory[0]; assert.equal(equipReason(hero, item), '杂物无法装备');
  assert.ok(moveStorage(hero, item.id, true));
  const restored = parseSave(serializeSave(hero))!; assert.deepEqual(restored.stash, hero.stash);
  assert.ok(sellItem(restored, item.id)); assert.equal(restored.gold, item.value); assert.equal(restored.stash.length, 0);
});
test('expanded layouts keep stable IDs, side rooms, loops and 4-6 separated chests', () => {
  for (const level of LEVELS) {
    const map = levelLayout(level); assert.deepEqual(map, levelLayout(level));
    assert.ok(map.chests.length >= 4 && map.chests.length <= 6); assert.ok(map.rooms.length >= 8);
    assert.ok(map.connections.length > map.route.length + 5);
    for (const chest of map.chests) {
      assert.ok(Math.abs(chest.x) < FIELD_BOUND - 3 && Math.abs(chest.z) < FIELD_BOUND - 3);
      assert.ok(Math.hypot(chest.x - map.spawn.x, chest.z - map.spawn.z) > 10);
      assert.ok(map.objects.every(p => Math.hypot(p.x - chest.x, p.z - chest.z) > 2.5));
    }
    // The Worldstone procession is deliberately straight; exploration also uses its side galleries.
    assert.ok(map.route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - map.route[i].x, p.z - map.route[i].z), 0) >= 40);
    assert.ok(map.connections.reduce((sum, [a,b]) => sum + Math.hypot(a.x-b.x,a.z-b.z), 0) > 200);
  }
});
test('large-grid pathfinding and projectile checks use the real grid origin beyond the old boundary', () => {
  const world = Object.create(GameWorld.prototype) as GameWorld;
  world.grid = new PF.Grid(81, 81); world.finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
  assert.equal(gridWalkable(world.grid, { x: 35, z: -34 }), true);
  world.grid.setWalkableAt(75, 6, false);
  assert.equal(gridWalkable(world.grid, { x: 35, z: -34 }), false);
  const route = world.path({ x: 0, z: 11 }, { x: -32, z: -34 });
  assert.deepEqual({ x: route.at(-1)!.x, z: route.at(-1)!.z }, { x: -32, z: -34 });
});
