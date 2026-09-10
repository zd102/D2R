import * as THREE from 'three';
import type { Actor } from './world.ts';

type Surface = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
type Batch = { mesh: THREE.BatchedMesh; material: Surface; emission: THREE.DataTexture; geometries: Map<string, number>; vertices: number; capacity: number; instances: number };
type Part = { source: THREE.Mesh<THREE.BufferGeometry, Surface>; batch: Batch; id: number; layers: number; parents: THREE.Object3D[] };

// Keep the articulated models as the source of truth. Only their opaque surfaces
// are submitted together; joints, colors, hit flashes, corpses and shadows retain
// their original transforms. Identical monster parts share one geometry upload.
export class MonsterBatches {
  private batches = new Map<string, Batch>();
  private actors = new Map<THREE.Group, Part[]>();
  private beforeRender: THREE.Scene['onBeforeRender'];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.beforeRender = scene.onBeforeRender;
    scene.onBeforeRender = (...args) => { this.beforeRender.apply(scene, args); this.update(); };
  }

  private createBatch(source: Part['source']) {
    const original = source.material, material = original.clone();
    material.color.setHex(0xffffff);
    if (material instanceof THREE.MeshStandardMaterial) { material.emissive.setHex(0); material.emissiveIntensity = 1; }
    const emission = new THREE.DataTexture(new Float32Array(64 * 64 * 4), 64, 64, THREE.RGBAFormat, THREE.FloatType);
    emission.needsUpdate = true;
    const batch: Batch = { mesh: new THREE.BatchedMesh(4096, 8192, 0, material), material, emission, geometries: new Map(), vertices: 0, capacity: 8192, instances: 4096 };
    material.customProgramCacheKey = () => `${original.customProgramCacheKey()}:monster-batch-v1`;
    material.onBeforeCompile = (shader, renderer) => {
      original.onBeforeCompile(shader, renderer);
      shader.uniforms.monsterEmission = { get value() { return batch.emission; } };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D monsterEmission; varying vec3 vMonsterEmission;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          int monsterIndex = int(getIndirectIndex(gl_DrawID));
          int monsterSize = textureSize(monsterEmission, 0).x;
          vMonsterEmission = texelFetch(monsterEmission, ivec2(monsterIndex % monsterSize, monsterIndex / monsterSize), 0).rgb;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMonsterEmission;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vMonsterEmission;');
    };
    batch.mesh.name = 'monster-batch'; batch.mesh.castShadow = source.castShadow; batch.mesh.receiveShadow = source.receiveShadow;
    batch.mesh.frustumCulled = false; batch.mesh.sortObjects = false;
    batch.mesh.matrixAutoUpdate = false;
    this.scene.add(batch.mesh);
    return batch;
  }

  add(actor: Actor, variant: string) {
    if (this.actors.has(actor.group)) return;
    const parts: Part[] = []; let index = 0;
    actor.group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial || object.material instanceof THREE.MeshBasicMaterial)) return;
      const source = object as Part['source'], material = source.material, geometryKey = `${variant}:${index++}`;
      if (material instanceof THREE.MeshStandardMaterial && !material.userData.surface || material.transparent || material.map) return;
      const key = `${material.type}:${material.userData.surface}:${material.side}:${source.castShadow}:${source.receiveShadow}:${Object.keys(source.geometry.attributes).sort()}`;
      let batch = this.batches.get(key);
      if (!batch) { batch = this.createBatch(source); this.batches.set(key, batch); }
      let geometryId = batch.geometries.get(geometryKey);
      if (geometryId === undefined) {
        const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry;
        const needed = batch.vertices + geometry.attributes.position.count;
        if (needed > batch.capacity) { batch.capacity = Math.max(needed, batch.capacity * 2); batch.mesh.setGeometrySize(batch.capacity, 0); }
        geometryId = batch.mesh.addGeometry(geometry); batch.vertices = needed; batch.geometries.set(geometryKey, geometryId);
        if (geometry !== source.geometry) geometry.dispose();
      }
      if (batch.mesh.instanceCount === batch.instances) {
        batch.instances *= 2; batch.mesh.setInstanceCount(batch.instances);
        const size = 2 ** Math.ceil(Math.log2(Math.sqrt(batch.instances))), previous = batch.emission;
        const data = new Float32Array(size * size * 4); data.set(previous.image.data);
        batch.emission = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType); batch.emission.needsUpdate = true; previous.dispose();
      }
      const id = batch.mesh.addInstance(geometryId), parents: THREE.Object3D[] = [];
      for (let node: THREE.Object3D | null = source; node && node !== this.scene; node = node.parent) parents.push(node);
      parts.push({ source, batch, id, layers: source.layers.mask, parents });
      source.layers.disable(0);
      batch.mesh.setColorAt(id, material.color);
    });
    this.actors.set(actor.group, parts);
  }

  update() {
    for (const [root, parts] of this.actors) {
      if (root.parent !== this.scene) {
        for (const part of parts) { part.batch.mesh.deleteInstance(part.id); part.source.layers.mask = part.layers; }
        this.actors.delete(root); continue;
      }
      for (const { source, batch, id, parents } of parts) {
        const visible = parents.every(parent => parent.visible);
        batch.mesh.setVisibleAt(id, visible);
        if (!visible) continue;
        batch.mesh.setMatrixAt(id, source.matrixWorld);
        batch.mesh.setColorAt(id, source.material.color);
        const material = source.material, data = batch.emission.image.data;
        if (material instanceof THREE.MeshStandardMaterial) {
          data[id * 4] = material.emissive.r * material.emissiveIntensity;
          data[id * 4 + 1] = material.emissive.g * material.emissiveIntensity;
          data[id * 4 + 2] = material.emissive.b * material.emissiveIntensity;
        }
      }
    }
    for (const batch of this.batches.values()) batch.emission.needsUpdate = true;
  }

  dispose() {
    this.scene.onBeforeRender = this.beforeRender;
    for (const parts of this.actors.values()) for (const part of parts) part.source.layers.mask = part.layers;
    for (const batch of this.batches.values()) { batch.mesh.removeFromParent(); batch.mesh.dispose(); batch.material.dispose(); batch.emission.dispose(); }
    this.actors.clear(); this.batches.clear();
  }
}
