import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MonsterBatches } from '../src/monster-batches.ts';
import { createMonsterActor } from '../src/monster-models.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { disposeVisual } from '../src/visual-effects.ts';

test('batched monsters keep animation transforms, inherited visibility, geometry sharing and owned resources', () => {
  const scene = new THREE.Scene(), batches = new MonsterBatches(scene);
  const a = createMonsterActor(MONSTERS.hellCow), b = createMonsterActor(MONSTERS.hellCow);
  a.group.position.set(3, 0, 7); b.group.position.set(-4, 0, 2); b.group.scale.multiplyScalar(1.2);
  scene.add(a.group, b.group); batches.add(a, 'cow'); batches.add(b, 'cow');
  a.animate!(.7, true, .3); b.animate!(1.1, false, .8); scene.updateMatrixWorld(true); batches.update();
  const meshes = scene.children.filter(node => node instanceof THREE.BatchedMesh) as THREE.BatchedMesh[];
  assert.ok(meshes.length > 0 && meshes.length < 12);
  // The source rig remains usable for targeting and model inspection.
  const sourceMatrices: number[][] = [];
  a.group.traverse(node => { if (node instanceof THREE.Mesh && !node.layers.isEnabled(0)) sourceMatrices.push(node.matrixWorld.elements); });
  const rendered: number[][] = [];
  for (const mesh of meshes) for (let i = 0; i < mesh.instanceCount; i++) if (mesh.getVisibleAt(i)) rendered.push(mesh.getMatrixAt(i, new THREE.Matrix4()).elements);
  assert.ok(sourceMatrices.every(source => rendered.some(matrix => source.every((value, i) => Math.abs(value - matrix[i]) < 1e-5))));
  const geometryCount = meshes.reduce((sum, mesh) => sum + new Set(Array.from({ length: mesh.instanceCount }, (_, i) => mesh.getGeometryIdAt(i))).size, 0);
  assert.ok(geometryCount < rendered.length, 'copies reuse their geometry uploads');
  a.group.visible = false; batches.update();
  assert.equal(meshes.reduce((sum, mesh) => sum + Array.from({ length: mesh.instanceCount }, (_, i) => Number(mesh.getVisibleAt(i))).reduce((x, y) => x + y, 0), 0), rendered.length / 2);
  b.group.removeFromParent(); batches.update(); assert.equal(meshes.reduce((sum, mesh) => sum + mesh.instanceCount, 0), rendered.length / 2);
  let disposed = 0; meshes.forEach(mesh => mesh.geometry.addEventListener('dispose', () => disposed++));
  batches.dispose(); assert.equal(disposed, meshes.length); assert.ok(!scene.children.some(node => node instanceof THREE.BatchedMesh));
  a.group.traverse(node => { if (node instanceof THREE.Mesh) assert.ok(node.layers.isEnabled(0)); });
  disposeVisual(a.group); disposeVisual(b.group);
});
