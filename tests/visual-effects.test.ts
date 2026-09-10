import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHeroActor,heroAction,playHeroAction,type HeroAction} from '../src/hero-models.ts';
import {createImpact,createProjectileVisual,decorateGround,disposeVisual,updateVisual,updateHeroWards} from '../src/visual-effects.ts';

test('hero motion keeps world placement, returns to rest and uses distinct action poses',()=>{
  for(const id of ['paladin','amazon','sorceress'] as const){
    const actor=createHeroActor(id);actor.group.position.set(3,0,7);const signatures=new Set<string>();
    for(const pose of ['swing','thrust','shoot','throw','cast','shield','recover'] as HeroAction[]){
      playHeroAction(actor,pose,0,1);actor.animate!(.35,false,.8);
      signatures.add([actor.leftArm.rotation.toArray(),actor.rightArm.rotation.toArray()].join());
      assert.deepEqual(actor.group.position.toArray(),[3,0,7]);
      const size=new THREE.Box3().setFromObject(actor.group).getSize(new THREE.Vector3());assert.ok(size.toArray().every(Number.isFinite)&&size.length()<7);
      actor.animate!(2,false,0);assert.equal(actor.group.userData.pose,'idle');
    }
    assert.ok(signatures.size>=6);
    actor.group.userData.running=true;actor.animate!(2,true,0);assert.equal(actor.group.userData.pose,'run');
    disposeVisual(actor.group);
  }
  assert.equal(heroAction('attack','bow'),'shoot');assert.equal(heroAction('jab'),'thrust');assert.equal(heroAction('fireBall'),'cast');
  assert.equal(heroAction('attack',undefined,'spear'),'thrust');assert.equal(heroAction('attack',undefined,'axe'),'swing');
});

test('hero and summon models own their materials; switching gear does not orphan geometry',()=>{
  const a=createHeroActor('amazon'),b=createHeroActor('amazon'),materials=new Set<THREE.Material>();
  a.group.traverse(node=>{if(node instanceof THREE.Mesh)materials.add(node.material as THREE.Material);});
  b.group.traverse(node=>{if(node instanceof THREE.Mesh)assert.ok(!materials.has(node.material as THREE.Material));});
  for(const name of ['hero-bow','hero-javelin','hero-weapon','hero-staff','hero-shield','melee-spear','melee-mace'])assert.ok(a.group.getObjectByName(name));
  disposeVisual(a.group);disposeVisual(b.group);
});

test('ice armor and energy shield retain independent visual state and expire without changing equipment',()=>{
  const actor=createHeroActor('sorceress');const shield=actor.group.getObjectByName('hero-shield')!;shield.visible=false;
  updateHeroWards(actor.group,{frozenArmor:{},energyShield:{}},1);
  assert.equal(actor.group.getObjectByName('ward-frost')!.visible,true);assert.equal(actor.group.getObjectByName('ward-energy')!.visible,true);
  updateHeroWards(actor.group,{energyShield:{}},2);assert.equal(actor.group.getObjectByName('ward-frost')!.visible,false);assert.equal(actor.group.getObjectByName('ward-energy')!.visible,true);
  updateHeroWards(actor.group,{},3);assert.equal(actor.group.getObjectByName('ward-energy')!.visible,false);assert.equal(shield.visible,false);disposeVisual(actor.group);
});

test('batched sparks are bounded and every points, instance and shared material resource is disposed once',()=>{
  const root=new THREE.Group(),burst=createImpact(new THREE.Vector3(),0xffaa55,10000).mesh;
  assert.equal(burst.geometry.attributes.position.count,48);root.add(burst);
  const field=new THREE.Mesh(new THREE.CircleGeometry(2),new THREE.MeshBasicMaterial());decorateGround(field,'fire',2);root.add(field);
  const resources=new Set<THREE.EventDispatcher>();root.traverse(node=>{
    if(node instanceof THREE.Mesh||node instanceof THREE.Points){resources.add(node.geometry);resources.add(node.material as THREE.Material);}
    if(node instanceof THREE.InstancedMesh)resources.add(node);
  });
  const counts=new Map<unknown,number>();for(const r of resources)(r as any).addEventListener('dispose',()=>counts.set(r,(counts.get(r)??0)+1));
  const scene=new THREE.Scene();scene.add(root);updateVisual(field,.3);updateVisual(burst,.3,.7);disposeVisual(root);
  assert.equal(scene.children.length,0);assert.equal(counts.size,resources.size);assert.ok([...counts.values()].every(n=>n===1));
});

test('spell decoration animates without changing projectile world position or simulation direction',()=>{
  for(const type of ['fire','cold','lightning','poison','magic'] as const){const mesh=createProjectileVisual(type,type==='cold'?'orb':'bolt');mesh.position.set(4,.9,5);const rotation=mesh.quaternion.clone();
    for(let i=0;i<20;i++)updateVisual(mesh,i*.05);assert.deepEqual(mesh.position.toArray(),[4,.9,5]);assert.deepEqual(mesh.quaternion.toArray(),rotation.toArray());disposeVisual(mesh);
  }
  for(const look of ['knife','axe'] as const){const mesh=createProjectileVisual('physical',look);mesh.position.set(4,.9,5);mesh.rotation.x=Math.PI/2;const rotation=mesh.quaternion.toArray();
    updateVisual(mesh,.2);assert.notEqual(mesh.children[0].rotation.z,0);assert.deepEqual(mesh.position.toArray(),[4,.9,5]);assert.deepEqual(mesh.quaternion.toArray(),rotation);disposeVisual(mesh);
  }
});
