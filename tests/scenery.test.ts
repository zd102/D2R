import { test } from 'node:test';
import assert from 'node:assert/strict';
import PF from 'pathfinding';
import { LEVELS, levelLayout, FIELD_BOUND } from '../src/campaign.ts';
import { SCENE_DESIGNS } from '../src/scene-design.ts';
import { layoutWalkable } from '../src/level-layouts.ts';

test('all 25 areas have independent authored layouts, distinct landmarks and complete scene palettes', () => {
  assert.equal(SCENE_DESIGNS.length, LEVELS.length);
  assert.equal(new Set(SCENE_DESIGNS.map(scene => scene.landmark)).size, 25);
  assert.equal(new Set(LEVELS.map(level => JSON.stringify(levelLayout(level)))).size, 25);
  for (const [index, scene] of SCENE_DESIGNS.entries()) {
    assert.ok(scene.props.length >= 2, LEVELS[index].name);
    for (const color of Object.values(scene.palette)) assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
    assert.ok(scene.ambient > 0 && scene.sunlight > 0 && scene.fog < .02);
  }
  assert.equal(SCENE_DESIGNS[8].liquid, 'abyss');
  assert.equal(SCENE_DESIGNS[17].liquid, 'lava');
  assert.equal(SCENE_DESIGNS[22].surface, 'ice');
  assert.equal(SCENE_DESIGNS[23].landmark, 'ancients');
  assert.equal(SCENE_DESIGNS[24].landmark, 'worldstone');
});

test('expanded geography preserves four arcane arms, narrow nests, a moat and the summit arena', () => {
  assert.equal(FIELD_BOUND,73);
  for (const level of LEVELS) {
    const layout = levelLayout(level);
    assert.ok(layout.rooms.some(room=>Math.max(Math.abs(room.x),Math.abs(room.z))>49),level.name);
  }
  const arcane=levelLayout(LEVELS[8]), offset=FIELD_BOUND+1, size=offset*2+1;
  const grid = new PF.Grid(Array.from({length:size},(_,z)=>Array.from({length:size},(_,x)=>
    layoutWalkable(arcane,x-offset,z-offset) && !(Math.abs(x-offset)<=6&&Math.abs(z-offset)<=6) ? 0:1)));
  const finder = new PF.AStarFinder({diagonalMovement:PF.DiagonalMovement.OnlyWhenNoObstacles});
  assert.equal(finder.findPath(offset-35,offset,offset+35,offset,grid.clone()).length,0,'west and east arms only connect through the hub');
  assert.equal(finder.findPath(offset,offset+35,offset,offset-35,grid.clone()).length,0,'south and north arms only connect through the hub');
  assert.ok(levelLayout(LEVELS[7]).corridorWidth <= 1.4);
  assert.equal(layoutWalkable(levelLayout(LEVELS[14]),0,-23),false,'moat keeps the central approach closed');
  assert.ok(levelLayout(LEVELS[23]).bossRadius >= 14);
  assert.equal(levelLayout(LEVELS[19]).objects.length + levelLayout(LEVELS[18]).objects.length,5);
});

test('authored maps keep every room, task, chest, supply and exit connected to the saved entrance', () => {
  for (const level of LEVELS) {
    const layout = levelLayout(level), offset = FIELD_BOUND + 1, size = offset * 2 + 1;
    assert.deepEqual(layout.spawn, { x: 0, z: 11 });
    assert.equal(layout.objects.length, level.quest.kind === 'interact' ? level.quest.count : 0);
    assert.deepEqual(layout.chests.map(chest => chest.id), Array.from({ length: 4 + Math.floor(level.act / 2) }, (_, i) => i));
    const matrix = Array.from({length:size}, (_, z) => Array.from({length:size}, (_, x) => layoutWalkable(layout, x-offset, z-offset) ? 0 : 1));
    const grid = new PF.Grid(matrix), finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
    const cells = matrix.flat().filter(cell => !cell).length; assert.ok(cells > 1700 && cells < 10000, `${level.name}: ${cells}`);
    for (const target of [layout.boss, layout.exit, layout.supply, ...layout.objects, ...layout.chests, ...layout.rooms]) {
      const x = Math.round(target.x), z = Math.round(target.z);
      assert.ok(grid.isWalkableAt(x+offset,z+offset), `${level.name}: target ${x},${z} has floor`);
      const path = finder.findPath(offset,11+offset,x+offset,z+offset,grid.clone());
      assert.ok(path.length, `${level.name}: target ${x},${z} is reachable`);
    }
    assert.equal(layoutWalkable(layout, FIELD_BOUND, 0), false);
  }
});
