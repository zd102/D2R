import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticGeometry } from '../src/geometry-batching.ts';
import { contourGeometry, mergeActorParts } from '../src/actor-modeling.ts';

test('contour seams have continuous normals and flat caps', () => {
  const geometry = contourGeometry([[-1,.5,.3],[0,.7,.4],[1,.4,.25]], 16);
  const normals = geometry.attributes.normal;
  for (let row=0;row<3;row++) {
    const a=new THREE.Vector3().fromBufferAttribute(normals,row*17);
    const b=new THREE.Vector3().fromBufferAttribute(normals,row*17+16);
    assert.ok(a.distanceTo(b)<1e-6);
  }
  for (let i=51;i<normals.count;i++) {
    assert.equal(normals.getX(i),0); assert.equal(normals.getZ(i),0);
    assert.equal(Math.abs(normals.getY(i)),1);
  }
  geometry.dispose();
});

test('mixed actor primitives keep indexed vertex storage and shadow flags', () => {
  const root=new THREE.Group(), material=new THREE.MeshStandardMaterial();
  const sphere=new THREE.SphereGeometry(1,16,12), box=new THREE.BoxGeometry().toNonIndexed();
  root.add(new THREE.Mesh(sphere,material),new THREE.Mesh(box,material));
  const vertices=sphere.attributes.position.count+box.attributes.position.count;
  const triangles=sphere.index!.count+box.attributes.position.count;
  mergeActorParts(root);
  assert.equal(root.children.length,1);
  const mesh=root.children[0] as THREE.Mesh;
  assert.equal(mesh.geometry.attributes.position.count,vertices);
  assert.equal(mesh.geometry.index!.count,triangles);
  assert.equal(mesh.castShadow,false);
  mesh.geometry.dispose(); material.dispose();
});

test('static instances preserve nested world transforms, bounds and shared geometry', () => {
  const scene=new THREE.Scene(), root=new THREE.Group(), nested=new THREE.Group();
  scene.position.set(3,0,1); root.rotation.y=Math.PI/2; nested.position.set(2,0,5);
  scene.add(root); root.add(nested);
  const geometry=new THREE.BoxGeometry(), material=new THREE.MeshStandardMaterial();
  const sources=Array.from({length:20},(_,i)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i*2,i%3,0);mesh.scale.set(1,2,1);mesh.castShadow=true;nested.add(mesh);return mesh;
  });
  scene.updateMatrixWorld(true); const expected=sources.map(mesh=>mesh.matrixWorld.clone());
  batchStaticGeometry(root,scene); scene.updateMatrixWorld(true);
  const batch=scene.children.find(node=>node instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
  assert.equal(batch.count,20);assert.equal(batch.geometry,geometry);assert.equal(batch.castShadow,true);
  const matrix=new THREE.Matrix4();
  for(let i=0;i<20;i++) {
    batch.getMatrixAt(i,matrix);matrix.premultiply(batch.matrixWorld);
    assert.ok(matrix.elements.every((value,j)=>Math.abs(value-expected[i].elements[j])<1e-5));
  }
  assert.ok(batch.boundingSphere!.radius>19);
  assert.equal(root.parent,null);assert.equal(root.children.length,0);
  batch.dispose(); geometry.dispose(); material.dispose();
});
