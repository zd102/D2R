import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ProjectileVisualPool, updateVisual } from '../src/visual-effects.ts';

test('projectile reuse restores its pose, visibility and effect fade', () => {
  const pool = new ProjectileVisualPool(), scene = new THREE.Scene();
  const mesh = pool.acquire('lightning', 'bolt', .2); scene.add(mesh);
  const initial = mesh.children.map(node => ({ node, position: node.position.clone(), scale: node.scale.clone() }));
  mesh.position.set(20, 3, -10); mesh.scale.setScalar(4); mesh.children[0].visible = false;
  updateVisual(mesh, .6, .1);
  assert.ok(pool.release(mesh)); assert.equal(mesh.parent, null);
  const reused = pool.acquire('lightning', 'bolt', .2);
  assert.equal(reused, mesh); assert.deepEqual(reused.position.toArray(), [0, 0, 0]); assert.deepEqual(reused.scale.toArray(), [1, 1, 1]);
  for (const { node, position, scale } of initial) { assert.ok(node.visible); assert.ok(node.position.equals(position)); assert.ok(node.scale.equals(scale)); }
  reused.traverse(node => { if (node instanceof THREE.Mesh && node.material instanceof THREE.ShaderMaterial && node.material.uniforms.effectFade) assert.equal(node.material.uniforms.effectFade.value, node.material.userData.fxOpacity); });
  pool.clear(); assert.equal(pool.release(mesh), false);
});

test('projectile cache is bounded and releases both idle and active GPU resources exactly once', () => {
  const pool = new ProjectileVisualPool(), counts = new Map<THREE.BufferGeometry | THREE.Material, number>();
  const meshes = Array.from({ length: 40 }, () => pool.acquire('lightning', 'bolt', .2));
  for (const mesh of meshes) mesh.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const resource of [node.geometry, ...(Array.isArray(node.material) ? node.material : [node.material])]) if (!counts.has(resource)) {
      counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
    }
  });
  meshes.forEach(mesh => pool.release(mesh));
  assert.ok([...counts.values()].some(count => count === 1), 'overflow is freed instead of retained');
  assert.ok([...counts.values()].some(count => count === 0), 'bounded warm cache retains reusable buffers');
  pool.acquire('lightning', 'bolt', .2); // Clear must also release a currently flying object.
  pool.clear(); pool.clear();
  assert.ok([...counts.values()].every(count => count === 1));
});
