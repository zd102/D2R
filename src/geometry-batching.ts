import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Extrusions are unindexed, while spheres and contours are indexed. Supply a
// sequential index for extrusions instead of expanding every curved surface.
export function ensureGeometryIndex(geometry: THREE.BufferGeometry) {
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
  return geometry;
}

export function batchStaticGeometry(root: THREE.Group, scene: THREE.Scene) {
  root.updateMatrixWorld(true);
  const repeated = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    const list = repeated.get(key) ?? [];
    list.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>); repeated.set(key, list);
  });
  const unique = new Map<string, { source: THREE.Mesh; geometries: THREE.BufferGeometry[] }>();
  const inverse = new THREE.Matrix4(); scene.updateWorldMatrix(true, false); inverse.copy(scene.matrixWorld).invert();
  const matrix = new THREE.Matrix4();
  for (const meshes of repeated.values()) {
    const source = meshes[0];
    // Transparent decals retain the existing merged rendering path and ordering.
    if (meshes.length >= 8 && !source.material.transparent) {
      const batch = new THREE.InstancedMesh(source.geometry, source.material, meshes.length);
      batch.name = 'static-instances'; batch.castShadow = source.castShadow; batch.receiveShadow = source.receiveShadow;
      meshes.forEach((mesh, i) => batch.setMatrixAt(i, matrix.multiplyMatrices(inverse, mesh.matrixWorld)));
      batch.instanceMatrix.needsUpdate = true; batch.computeBoundingBox(); batch.computeBoundingSphere(); scene.add(batch);
    } else {
      const key = `${source.material.uuid}:${source.castShadow}:${source.receiveShadow}`;
      const entry = unique.get(key) ?? { source, geometries: [] };
      for (const mesh of meshes) {
        const geometry = mesh.geometry.clone().applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld));
        for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
        entry.geometries.push(ensureGeometryIndex(geometry));
      }
      unique.set(key, entry);
    }
  }
  for (const { source, geometries } of unique.values()) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(copy => copy.dispose());
    if (!geometry) throw new Error('Static geometry attributes must agree before merging');
    const mesh = new THREE.Mesh(geometry, source.material);
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow; scene.add(mesh);
  }
  root.removeFromParent(); root.clear();
}
