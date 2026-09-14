import * as THREE from 'three';
import type { Actor } from './world.ts';
import { createMonsterActor } from './monster-models.ts';
import { MONSTERS } from './bestiary.ts';

type FormState = { actor?: Actor; materials: Map<THREE.Material, { opacity: number; transparent: boolean }>; fading: boolean };
const states = new WeakMap<Actor, FormState>();

export function updateItemForm(actor: Actor, buffs: Partial<Record<string, unknown>>, time: number) {
  let state = states.get(actor);
  if (!state && !buffs.delirium && !buffs.fade && !buffs.boneArmor) return;
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
