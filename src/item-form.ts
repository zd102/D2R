import { createBeastActor } from './expansion-models.ts';
import * as THREE from 'three';
import type { Actor } from './world.ts';
import { createMonsterActor } from './monster-models.ts';
import { MONSTERS } from './bestiary.ts';

type FormState = { actor?: Actor; wolf?:Actor; bear?:Actor; materials: Map<THREE.Material, { opacity: number; transparent: boolean }>; fading: boolean };
const states = new WeakMap<Actor, FormState>();

export function updateItemForm(actor: Actor, buffs: Partial<Record<string, unknown>>, time: number) {
  let state = states.get(actor);
  if (!state && !buffs.delirium && !buffs.fade && !buffs.boneArmor && !buffs.wearwolf && !buffs.wearbear) return;
  if (!state) { state = { materials: new Map(), fading: false }; states.set(actor, state); }
  if (buffs.delirium && !state.actor) {
    state.actor = createMonsterActor(MONSTERS.doll);
    state.actor.group.name = 'item-delirium-form'; actor.group.add(state.actor.group);
  }
  if (state.actor) {
    state.actor.group.visible = !!buffs.delirium;
    actor.group.userData.itemForm = buffs.delirium ? state.actor : undefined;
    const rig = actor.group.getObjectByName('hero-rig'); if (rig) rig.visible = !buffs.delirium;
  }
  if(buffs.wearwolf&&!state.wolf){state.wolf=createBeastActor(false,true);actor.group.add(state.wolf.group);state.wolf.group.name='hero-werewolf';}
  if(buffs.wearbear&&!state.bear){state.bear=createBeastActor(true,true);actor.group.add(state.bear.group);state.bear.group.name='hero-werebear';}
  if(state.wolf)state.wolf.group.visible=!!buffs.wearwolf;
  if(state.bear)state.bear.group.visible=!!buffs.wearbear;
  const transformed=buffs.wearwolf?state.wolf:buffs.wearbear?state.bear:buffs.delirium?state.actor:undefined;
  actor.group.userData.itemForm=transformed;
  const heroRig=actor.group.getObjectByName('hero-rig');if(heroRig)heroRig.visible=!transformed;
  if (buffs.fade || state.fading) {
    actor.group.traverse(node => {
      if (!(node instanceof THREE.Mesh) || node.name.startsWith('ward-')) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!state!.materials.has(material)) state!.materials.set(material, { opacity: material.opacity, transparent: material.transparent });
        const original = state!.materials.get(material)!;
        const transparent = buffs.fade ? true : original.transparent;
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.opacity = buffs.fade ? original.opacity * .55 : original.opacity;
      }
    });
    state.fading = !!buffs.fade;
  }
  let bone = actor.group.getObjectByName('ward-bone');
  if (buffs.boneArmor && !bone) {
    bone = new THREE.Group(); bone.name = 'ward-bone'; actor.group.add(bone);
    const material = new THREE.MeshStandardMaterial({ color: 0xd9d0ae, emissive: 0x393124 });
    for (let i = 0; i < 3; i++) {
      const shard = new THREE.Mesh(new THREE.CylinderGeometry(.035, .06, .55, 5), material);
      shard.position.set(Math.cos(i * Math.PI * 2 / 3) * .65, .8, Math.sin(i * Math.PI * 2 / 3) * .65);
      shard.rotation.z = .3; bone.add(shard);
    }
  }
  if (bone) { bone.visible = !!buffs.boneArmor; bone.rotation.y = time * 1.7; }
}
