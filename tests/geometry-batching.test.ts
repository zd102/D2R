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
  const batches=scene.children.filter(node=>node instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  assert.equal(batches.reduce((count,batch)=>count+batch.count,0),20);
  const matrix=new THREE.Matrix4();
  const unmatched=new Set(expected);
  for(const batch of batches) {
    assert.equal(batch.geometry,geometry);assert.equal(batch.castShadow,true);
    for(let i=0;i<batch.count;i++) {
      batch.getMatrixAt(i,matrix);matrix.premultiply(batch.matrixWorld);
      const match=[...unmatched].find(expected=>matrix.elements.every((value,j)=>Math.abs(value-expected.elements[j])<1e-5));
      assert.ok(match,'each source keeps its world transform exactly once');unmatched.delete(match);
      const point=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(batch.matrixWorld.clone().invert());
      assert.ok(batch.boundingSphere!.containsPoint(point),'spatial bound contains every instance');
    }
  }
  assert.equal(unmatched.size,0);
  assert.equal(root.parent,null);assert.equal(root.children.length,0);
  batches.forEach(batch=>batch.dispose()); geometry.dispose(); material.dispose();
});

test('distant repeated scenery can be culled without discarding nearby instances',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();scene.add(root);
  for(const offset of [0,200])for(let i=0;i<8;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(offset+i,0,0);root.add(mesh);}
  batchStaticGeometry(root,scene);scene.updateMatrixWorld(true);
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,50);camera.position.set(3,5,15);camera.lookAt(3,0,0);camera.updateMatrixWorld(true);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const batches=scene.children as THREE.InstancedMesh[],visible=batches.filter(batch=>frustum.intersectsObject(batch));
  assert.equal(visible.reduce((sum,batch)=>sum+batch.count,0),8);assert.ok(batches.length>visible.length);
  batches.forEach(batch=>batch.dispose());geometry.dispose();material.dispose();
});
