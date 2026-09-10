import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GameWorld, makeRing } from '../src/world.ts';
import { LEVELS } from '../src/campaign.ts';

test('completing an objective updates its rendered material without orphaning it', () => {
  const world = Object.create(GameWorld.prototype) as GameWorld;
  const group = new THREE.Group(), indicator = makeRing(1.5, 0xff0000), original = indicator.material;
  indicator.name = 'indicator'; group.add(indicator); world.shrineMeshes = [group]; world.level = LEVELS[0];
  for (let i = 0; i < 20; i++) world.completeObjective(0);
  assert.equal(indicator.material, original); assert.equal(original.color.getHex(), 0xd6e8b6);
  assert.equal(original.opacity, .7); assert.equal(group.userData.complete, true);
  indicator.geometry.dispose(); original.dispose();
});

test('scene disposal releases instance attributes, shared resources, particles and both shadow targets', () => {
  const world = Object.create(GameWorld.prototype) as GameWorld;
  world.scene = new THREE.Scene(); world.physics = new CANNON.World(); world.physics.addBody(new CANNON.Body());
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture(), material = new THREE.MeshBasicMaterial({ map: texture });
  const instances = new THREE.InstancedMesh(geometry, material, 2); instances.setColorAt(0, new THREE.Color('red'));
  const pointsGeometry = new THREE.BufferGeometry(), pointsMaterial = new THREE.PointsMaterial();
  const light = new THREE.DirectionalLight(); light.shadow.map = new THREE.WebGLRenderTarget(16, 16); light.shadow.mapPass = new THREE.WebGLRenderTarget(16, 16);
  const resources = [geometry, texture, material, instances, pointsGeometry, pointsMaterial, light.shadow.map, light.shadow.mapPass];
  const counts = resources.map(() => 0); resources.forEach((resource, i) => resource.addEventListener('dispose', () => counts[i]++));
  world.scene.add(instances, new THREE.Mesh(geometry, material), new THREE.Points(pointsGeometry, pointsMaterial), light);
  world.dispose();
  assert.deepEqual(counts, resources.map(() => 1)); assert.equal(world.physics.bodies.length, 0); assert.equal(world.scene.children.length, 0);
});
