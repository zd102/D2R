import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Surface = 'skin' | 'hide' | 'bone' | 'steel' | 'bronze' | 'cloth' | 'leather';

// Object-space patina needs no texture allocation and follows each articulated joint.
// Every actor still owns its materials so hit flashes and summon tints stay local.
export function actorMaterial(color: THREE.ColorRepresentation, surface: Surface) {
  const metal = surface === 'steel' || surface === 'bronze';
  const material = new THREE.MeshStandardMaterial({ color, roughness: metal ? .63 : surface === 'skin' ? .87 : .94, metalness: metal ? .58 : 0 });
  material.userData.surface = surface;
  material.customProgramCacheKey = () => `actor-surface-v2-${surface}`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vActorSurface;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvActorSurface = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vActorSurface;
      float actorHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float actorNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(actorHash(i), actorHash(i + vec3(1,0,0)), f.x),
          mix(actorHash(i + vec3(0,1,0)), actorHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(actorHash(i + vec3(0,0,1)), actorHash(i + vec3(1,0,1)), f.x),
          mix(actorHash(i + vec3(0,1,1)), actorHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
    `).replace('#include <color_fragment>', `#include <color_fragment>
      float grain = actorNoise(vActorSurface * ${surface === 'skin' ? '95.0' : '72.0'});
      float wear = actorNoise(vActorSurface * 13.0);
      ${surface === 'cloth' ? `
        vec3 weave = sin(vActorSurface * 460.0);
        float thread = (weave.x * weave.y + weave.z * .35) * .035;
        diffuseColor.rgb *= .78 + wear * .22 + thread;
      ` : metal ? `
        float scratch = smoothstep(.94, .99, sin(vActorSurface.y * 260.0 + vActorSurface.x * 37.0)) * .09;
        diffuseColor.rgb *= .68 + wear * .30 + grain * .14 + scratch;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.65, .42, .25), smoothstep(.60, .82, wear) * .40);
      ` : `
        diffuseColor.rgb *= ${surface === 'skin' ? '.86 + wear * .14 + grain * .045' : '.54 + wear * .42 + grain * .16'};
      `}
    `).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (grain - .5) * .16, .38, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 surfaceDx = normalize(dFdx(-vViewPosition)), surfaceDy = normalize(dFdy(-vViewPosition));
        vec3 gradientX = cross(surfaceDy, normal), gradientY = cross(normal, surfaceDx);
        float determinant = dot(surfaceDx, gradientX) * faceDirection;
        float relief = grain * ${surface === 'skin' ? '.055' : metal ? '.13' : '.22'} + wear * .06;
        vec3 reliefGradient = sign(determinant) * (dFdx(relief) * gradientX + dFdy(relief) * gradientY);
        normal = normalize(max(abs(determinant), .0001) * normal - reliefGradient);
      `);
  };
  return material;
}

// Cross sections describe an anatomical or hammered-metal silhouette, instead of
// stacking spheres. Sections: height, half-width, half-depth, forward offset.
export function contourGeometry(sections: readonly (readonly [number, number, number, number?])[], segments = 12, folds = 0) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  sections.forEach(([y, rx, rz, z = 0], row) => {
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2, fold = 1 + Math.cos(a * 6) * folds;
      positions.push(Math.sin(a) * rx * fold, y, Math.cos(a) * rz * fold + z);
      uvs.push(i / segments, row / (sections.length - 1));
      if (row && i < segments) {
        const b = row * (segments + 1) + i, t = b - segments - 1;
        indices.push(t, t + 1, b, b, t + 1, b + 1);
      }
    }
  });
  // Cap the first/last ring. The winding faces outwards at both ends.
  for (const row of [0, sections.length - 1]) {
    const [y, , , z = 0] = sections[row], center = positions.length / 3;
    positions.push(0, y, z); uvs.push(.5, .5);
    for (let i = 0; i < segments; i++) {
      const b = row * (segments + 1) + i;
      indices.push(...(row === 0 ? [center, b + 1, b] : [center, b, b + 1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function plateGeometry(points: readonly (readonly [number, number])[], depth = .035, bevel = .015) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel * .65, bevelSegments: 2, curveSegments: 5 });
}

// Only merge siblings: knees, hands, weapons, wings and tails retain their pivots.
export function mergeActorParts(root: THREE.Object3D) {
  const sources = new Set<THREE.BufferGeometry>(), parents: THREE.Object3D[] = [];
  root.traverse(node => { if (node instanceof THREE.Mesh) sources.add(node.geometry); if (node instanceof THREE.Group) parents.push(node); });
  for (const parent of parents) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child.name || child.userData.cloth || Array.isArray(child.material)) continue;
      const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
    }
    for (const [material, meshes] of batches) {
      const copies = meshes.map(mesh => {
        mesh.updateMatrix(); const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        if (!geometry.index) return geometry;
        const unindexed = geometry.toNonIndexed(); geometry.dispose(); return unindexed;
      });
      const merged = mergeGeometries(copies, false); copies.forEach(geometry => geometry.dispose());
      if (!merged) throw new Error('Actor geometry attributes must agree before merging');
      meshes.forEach(mesh => parent.remove(mesh));
      const mesh = new THREE.Mesh(merged, material); mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; parent.add(mesh);
    }
  }
  const retained = new Set<THREE.BufferGeometry>(); root.traverse(node => { if (node instanceof THREE.Mesh) retained.add(node.geometry); });
  sources.forEach(geometry => { if (!retained.has(geometry)) geometry.dispose(); });
}
