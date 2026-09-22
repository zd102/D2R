import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ModelGeometryCache } from '../src/model-geometry-cache.ts';
import { loftGeometry, sculptedHead } from '../src/sculpted-surfaces.ts';

test('geometry templates isolate deformation and disposal and evict least recently used entries',()=>{
  const cache=new ModelGeometryCache(4096,2);
  let builds=0;
  const build=()=>{builds++;return new THREE.BoxGeometry();};
  const a=cache.get('a',build),b=cache.get('b',build);
  const original=a.attributes.position.getX(0);
  a.attributes.position.setX(0,99);a.dispose();
  const copy=cache.get('a',build);
  assert.equal(copy.attributes.position.getX(0),original);
  assert.notEqual(copy.attributes.position.array,a.attributes.position.array);
  cache.get('c',build).dispose();
  cache.get('a',build).dispose();
  assert.equal(builds,3);
  cache.get('b',build).dispose();
  assert.equal(builds,4);
  assert.ok(cache.stats().bytes<=4096);assert.equal(cache.stats().entries,2);
  cache.clear();assert.equal(cache.stats().bytes,0);
  assert.equal(copy.attributes.position.getX(0),original);
  b.dispose();copy.dispose();
  const tiny=new ModelGeometryCache(1);
  tiny.get('large',build).dispose();assert.equal(tiny.stats().entries,0);
});

test('smooth loft preserves authored silhouette bounds and watertight UV seam',()=>{
  const geometry=loftGeometry([[0,.1,.2],[.5,.4,.3],[1,.05,.08]],16);
  const position=geometry.attributes.position,rows=geometry.userData.sideRows;
  for(let row=0;row<rows;row++) {
    const first=row*17,last=first+16;
    for(const axis of [0,1,2])assert.ok(Math.abs(position.array[first*3+axis]-position.array[last*3+axis])<1e-6);
  }
  for(let i=0;i<position.count;i++) {
    assert.ok(Math.abs(position.getX(i))<=.400001);
    assert.ok(Math.abs(position.getZ(i))<=.300001);
    assert.ok(position.getY(i)>=0&&position.getY(i)<=1);
  }
  assert.ok(geometry.index);geometry.dispose();
  const head=sculptedHead();
  for(const value of head.attributes.normal.array)assert.ok(Number.isFinite(value));
  for(let row=0;row<head.userData.sideRows;row++) {
    const first=row*33,last=first+32;
    for(let axis=0;axis<3;axis++)assert.equal(head.attributes.normal.array[first*3+axis],head.attributes.normal.array[last*3+axis]);
  }
  const clone=sculptedHead();assert.deepEqual(clone.attributes.position.array,head.attributes.position.array);
  head.dispose();clone.dispose();
});
