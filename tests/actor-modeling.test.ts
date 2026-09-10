import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { contourGeometry } from '../src/actor-modeling.ts';
import { createMonsterActor } from '../src/monster-models.ts';
import { MONSTERS, BOSSES } from '../src/bestiary.ts';
import { disposeVisual } from '../src/visual-effects.ts';

test('anatomical contours have outward winding on their sides and both end caps', () => {
  const geometry = contourGeometry([[-1, .5, .3], [0, .7, .4], [1, .4, .25]], 12);
  const position = geometry.attributes.position, index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + offset)));
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
    const center = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).divideScalar(3);
    assert.ok(normal.dot(center) > 0, `triangle ${i / 3} faces outside`);
  }
  geometry.dispose();
});

test('all monster families restore their idle transforms after combat and keep world placement', () => {
  const families = new Map([...Object.values(MONSTERS), ...BOSSES].map(def => [def.model, def]));
  assert.equal(families.size, 28);
  for (const definition of families.values()) {
    const actor = createMonsterActor(definition); actor.group.position.set(7, 0, -3);
    const transforms = () => { const result: number[] = []; actor.group.updateMatrixWorld(true); actor.group.traverse(node => result.push(...node.matrix.elements)); return result; };
    actor.animate!(0, false, 0); const rest = transforms();
    for (const t of [.15, .43, .8, 1.2]) { actor.animate!(t, true, .7); assert.deepEqual(actor.group.position.toArray(), [7, 0, -3]); }
    assert.notDeepEqual(transforms(), rest, definition.id);
    actor.animate!(0, false, 0); assert.deepEqual(transforms(), rest, `${definition.id} returns to rest without drift`);
    disposeVisual(actor.group);
  }
});

test('monster copies own merged resources and keep held equipment attached to the forearm', () => {
  for (const definition of [MONSTERS.fallen, MONSTERS.boneMage, MONSTERS.rogue, MONSTERS.doomKnight, MONSTERS.hellCow, BOSSES[19]]) {
    const a = createMonsterActor(definition), b = createMonsterActor(definition), resources = new Set();
    a.group.traverse(node => { if (node instanceof THREE.Mesh) { resources.add(node.geometry); resources.add(node.material); } });
    b.group.traverse(node => { if (node instanceof THREE.Mesh) { assert.ok(!resources.has(node.geometry)); assert.ok(!resources.has(node.material)); } });
    if (definition.model !== 'cow') {
      const grip = a.group.getObjectByName(definition.model === 'archer' ? 'monster-left-grip' : 'monster-right-grip')!;
      a.group.updateMatrixWorld(true); const before = grip.getWorldPosition(new THREE.Vector3());
      grip.parent!.rotation.x -= .5; a.group.updateMatrixWorld(true);
      assert.ok(grip.getWorldPosition(new THREE.Vector3()).distanceTo(before) > .03, `${definition.id} grip follows elbow`);
    } else assert.ok(a.group.getObjectByName('monster-polearm'));
    disposeVisual(a.group); disposeVisual(b.group);
  }
});
