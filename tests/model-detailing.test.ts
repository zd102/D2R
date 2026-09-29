import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeModelCavity } from '../src/model-detailing.ts';
import { actorMaterial, mergeActorParts } from '../src/actor-modeling.ts';
import { batchStaticGeometry } from '../src/geometry-batching.ts';
import { createSceneryLibrary, pavingSlabGeometry, SCENERY_MODELS } from '../src/scenery-props.ts';
import { disposeVisual } from '../src/visual-effects.ts';

test('cavity shading darkens a recess without adding geometry or changing UV seams',()=>{
  const flat=new THREE.PlaneGeometry(2,2,4,4),bowl=flat.clone(),vertices=bowl.attributes.position;
  for(let i=0;i<vertices.count;i++)vertices.setZ(i,(vertices.getX(i)**2+vertices.getY(i)**2)*.3);
  bowl.computeVertexNormals();
  const original=Float32Array.from(vertices.array),indices=Array.from(bowl.index!.array),uv=Float32Array.from(bowl.attributes.uv.array);
  bakeModelCavity(flat);bakeModelCavity(bowl);
  assert.ok(Array.from(flat.attributes.surfaceCavity.array).every(value=>Math.abs(value-1)<1e-6));
  assert.ok(bowl.attributes.surfaceCavity.getX(12)<.85,'concave centre receives cavity shading');
  assert.ok(Array.from(bowl.attributes.surfaceCavity.array).every(value=>Number.isFinite(value)&&value>=.479&&value<=1));
  assert.deepEqual(vertices.array,original);assert.deepEqual(Array.from(bowl.index!.array),indices);assert.deepEqual(bowl.attributes.uv.array,uv);
  const attribute=bowl.attributes.surfaceCavity;bakeModelCavity(bowl);assert.equal(bowl.attributes.surfaceCavity,attribute,'bake is reused');
  flat.dispose();bowl.dispose();
});

test('camp batching retains actor cavity values in both merged and instanced paths',()=>{
  for(const count of [2,8]){
    const root=new THREE.Group(),scene=new THREE.Scene(),material=actorMaterial(0x82735d,'cloth'),geometry=new THREE.SphereGeometry(1,8,6);
    for(let i=0;i<count;i++){const parent=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);parent.position.x=i*3;parent.add(mesh);root.add(parent);}
    mergeActorParts(root);scene.add(root);batchStaticGeometry(root,scene);
    const result=scene.children[0] as THREE.Mesh;
    assert.equal(material.userData.actorCavity,true);assert.ok(result.geometry.hasAttribute('surfaceCavity'));
    assert.equal(result.geometry.attributes.surfaceCavity.count,result.geometry.attributes.position.count);
    assert.equal(result instanceof THREE.InstancedMesh,count>=8);
    disposeVisual(scene);geometry.dispose();
  }
});

test('scenery templates share geometry only within their owning library and keep a bounded model budget',()=>{
  const material=new THREE.MeshStandardMaterial(),materials={stone:material,wall:material,dark:material,wood:material,trim:material,bone:material,iron:material,foliage:material,ice:material,leaves:material,silk:material,cloth:material};
  const create=createSceneryLibrary(materials),separate=createSceneryLibrary(materials);
  for(const {id} of SCENERY_MODELS){
    const a=create(id),b=create(id),c=separate(id),geometries=new Set<THREE.BufferGeometry>();let triangles=0;
    for(const group of [a,b,c])group.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const value of node.geometry.attributes.position.array)assert.ok(Number.isFinite(value),id);}});
    a.traverse(node=>{if(node instanceof THREE.Mesh)triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;});
    assert.ok(triangles>0&&triangles<12000,`${id}: ${triangles} triangles`);
    assert.equal((a.children[0] as THREE.Mesh).geometry,(b.children[0] as THREE.Mesh).geometry,id);
    assert.notEqual((a.children[0] as THREE.Mesh).geometry,(c.children[0] as THREE.Mesh).geometry,id);
    assert.notEqual(a,b);geometries.forEach(geometry=>geometry.dispose());
  }
  material.dispose();
});

test('camp paving has outward top faces and a small repeated triangle budget',()=>{
  const geometry=pavingSlabGeometry(),positions=geometry.attributes.position,normals=geometry.attributes.normal;
  assert.equal(positions.count/3,28);
  for(let i=0;i<12*3;i+=3)for(let j=0;j<3;j++)assert.ok(normals.getY(i+j)*positions.getY(i+j)>0);
  geometry.dispose();
});
