import { test } from 'node:test';
import assert from 'node:assert/strict';
import PF from 'pathfinding';
import { LEVELS, SPECIAL_LEVELS, levelLayout } from '../src/campaign.ts';
import { SCENE_DESIGNS } from '../src/scene-design.ts';
import { layoutWalkable } from '../src/level-layouts.ts';
import { rotateMapPoint } from '../src/map-orientation.ts';

test('campaign and hidden areas have distinct landmarks and complete scene palettes', () => {
  const areas = [...LEVELS, ...Object.values(SPECIAL_LEVELS)];
  assert.equal(SCENE_DESIGNS.length, areas.length);
  assert.equal(new Set(SCENE_DESIGNS.map(scene => scene.landmark)).size, areas.length);
  assert.equal(new Set(LEVELS.map(level => JSON.stringify(levelLayout(level)))).size, 25);
  for (const [index, scene] of SCENE_DESIGNS.entries()) {
    assert.ok(scene.props.length >= 2, areas[index].name);
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
  const arcane=levelLayout(LEVELS[8]), offset=arcane.bounds.x+1, size=arcane.width;
  const grid = new PF.Grid(Array.from({length:size},(_,z)=>Array.from({length:size},(_,x)=>
    layoutWalkable(arcane,x-offset,z-offset) && !(Math.abs(x-offset)<=6&&Math.abs(z-offset)<=6) ? 0:1)));
  const finder = new PF.AStarFinder({diagonalMovement:PF.DiagonalMovement.OnlyWhenNoObstacles});
  assert.equal(finder.findPath(offset-35,offset,offset+35,offset,grid.clone()).length,0,'west and east arms only connect through the hub');
  assert.equal(finder.findPath(offset,offset+35,offset,offset-35,grid.clone()).length,0,'south and north arms only connect through the hub');
  assert.ok(levelLayout(LEVELS[7]).corridorWidth <= 1.4);
  const durance = levelLayout(LEVELS[14]), moat = rotateMapPoint({ x: 0, z: -23 }, durance.rotation);
  assert.equal(layoutWalkable(durance,moat.x,moat.z),false,'moat keeps the central approach closed');
  assert.ok(levelLayout(LEVELS[23]).bossRadius >= 14);
  assert.equal(levelLayout(LEVELS[19]).objects.length + levelLayout(LEVELS[18]).objects.length,5);
});

test('authored maps keep every room, task, chest, supply and exit connected to the saved entrance', () => {
  for (const level of LEVELS) {
    const layout = levelLayout(level), offsetX=layout.bounds.x+1,offsetZ=layout.bounds.z+1;
    assert.deepEqual(layout.spawn, layout.route[0]);
    assert.equal(layout.objects.length, level.quest.kind === 'interact' ? level.quest.count : 0);
    assert.deepEqual(layout.chests.map(chest => chest.id), Array.from({ length: 4 + Math.floor(level.act / 2) }, (_, i) => i));
    const matrix = Array.from({length:layout.height}, (_, z) => Array.from({length:layout.width}, (_, x) => layoutWalkable(layout, x-offsetX, z-offsetZ) ? 0 : 1));
    const grid = new PF.Grid(matrix), finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
    const cells = matrix.flat().filter(cell => !cell).length; assert.ok(cells > 1000 && cells < 25000, `${level.name}: ${cells}`);
    for (const target of [layout.boss, layout.exit, layout.supply, ...layout.objects, ...layout.chests, ...layout.rooms]) {
      const x = Math.round(target.x), z = Math.round(target.z);
      assert.ok(grid.isWalkableAt(x+offsetX,z+offsetZ), `${level.name}: target ${x},${z} has floor`);
      const path = finder.findPath(layout.spawn.x+offsetX,layout.spawn.z+offsetZ,x+offsetX,z+offsetZ,grid.clone());
      assert.ok(path.length, `${level.name}: target ${x},${z} is reachable`);
    }
    assert.equal(layoutWalkable(layout, layout.bounds.x, 0), false);
    assert.equal(layoutWalkable(layout, 0, layout.bounds.z), false);
  }
});
