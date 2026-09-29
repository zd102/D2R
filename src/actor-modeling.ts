import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import { ensureGeometryIndex } from './geometry-batching.ts';
import { modelGeometryCache } from './model-geometry-cache.ts';
import { bakeModelCavity } from './model-detailing.ts';

type Surface = 'skin' | 'hide' | 'bone' | 'steel' | 'bronze' | 'cloth' | 'leather' | 'fur' | 'chitin' | 'stone';

// Continuous low-frequency planes break the perfect ellipsoid without adding
// separate floating muscle balls. Deterministic positions preserve batch reuse.
export function organicGeometry(style: 'muscle' | 'fur' | 'stone' | 'carapace' = 'muscle', segments = 16) {
  return modelGeometryCache.get(`organic:${style}:${segments}`,()=>{
  // These volumes mostly become knuckles, eyes, rivets and small muscle masses.
  // Spend the silhouette budget on the authored lofts instead of hidden sphere rings.
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(6, Math.floor(segments * .625))), position = geometry.attributes.position;
  for (let i=0;i<position.count;i++) {
    const x=position.getX(i), y=position.getY(i), z=position.getZ(i);
    const planes = style === 'stone' ? .11*Math.sin(x*8+y*3+z*5)*Math.sin(y*7-z*4)
      : style === 'carapace' ? .045*Math.cos(z*17)*(.6+.4*Math.max(0,y))+.025*Math.cos(x*7-y*4)
      : style === 'fur' ? .055*Math.sin(x*11+z*9)*Math.sin(y*7)
      : .055*Math.cos(y*4+x*2)*Math.cos(z*3)-.035*Math.sin(y*7);
    const r=1+planes;
    position.setXYZ(i,x*r,y*r,z*r);
  }
  geometry.computeVertexNormals();bakeModelCavity(geometry);return geometry;
  });
}

// Object-space patina needs no texture allocation and follows each articulated joint.
// Every actor still owns its materials so hit flashes and summon tints stay local.
export function actorMaterial(color: THREE.ColorRepresentation, surface: Surface) {
  const metal = surface === 'steel' || surface === 'bronze';
  const material = new THREE.MeshStandardMaterial({ color, roughness: metal ? .43 : surface === 'skin' ? .76 : surface === 'chitin' ? .39 : surface === 'leather' ? .68 : .91, metalness: metal ? .74 : 0 });
  material.userData.surface = surface;
  material.customProgramCacheKey = () => `actor-surface-v5-${surface}-${material.userData.actorCavity ? 'cavity' : 'plain'}`;
  material.onBeforeCompile = shader => {
    if (material.userData.actorCavity) (shader.defines ??= {}).ACTOR_CAVITY = 1;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vActorSurface;
      #ifdef ACTOR_CAVITY
      attribute float surfaceCavity; varying float vSurfaceCavity;
      #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vActorSurface = position;
        #ifdef ACTOR_CAVITY
        vSurfaceCavity=surfaceCavity;
        #endif`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vActorSurface;
      #ifdef ACTOR_CAVITY
      varying float vSurfaceCavity;
      #endif
      float actorHash(vec3 p) {
        p = fract(p * vec3(.1031,.11369,.13787)); p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float actorNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(actorHash(i), actorHash(i + vec3(1,0,0)), f.x),
          mix(actorHash(i + vec3(0,1,0)), actorHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(actorHash(i + vec3(0,0,1)), actorHash(i + vec3(1,0,1)), f.x),
          mix(actorHash(i + vec3(0,1,1)), actorHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
    `).replace('#include <color_fragment>', `#include <color_fragment>
      // Band-limit pores, weave and hair to their projected footprint. Detail
      // must settle into the base material when automatic resolution decreases.
      float footprint = max(length(dFdx(vActorSurface)), length(dFdy(vActorSurface)));
      float detail = 1.0 - smoothstep(.006, .026, footprint);
      float fiberDetail = 1.0 - smoothstep(1.5, 3.14, footprint * 460.0);
      float grain = mix(.5, actorNoise(vActorSurface * ${surface === 'skin' ? '95.0' : '72.0'}), detail);
      float wear = actorNoise(vActorSurface * 11.0);
      float patina = smoothstep(.53, .86, wear);
      float relief = grain * ${surface === 'skin' ? '.018' : metal ? '.055' : '.09'} + wear * .055;
      ${surface === 'fur' ? `
        float strand = sin(vActorSurface.x * 300.0 + vActorSurface.z * 160.0 + wear * 8.0) * fiberDetail;
        diffuseColor.rgb *= .73 + wear * .26 + strand * .065;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.10,1.04,.90), patina * .35);
        relief += strand * .022;
      ` : surface === 'chitin' ? `
        float plates = abs(sin(vActorSurface.y * 43.0 + sin(vActorSurface.x * 23.0) * .9));
        diffuseColor.rgb *= .61 + wear * .28 + mix(.75, smoothstep(.10,.30,plates),detail) * .23;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.79,.88,1.04), patina * .45);
        relief += mix(.5, smoothstep(.1,.35,plates),detail) * .022;
      ` : surface === 'bone' ? `
        float pores = smoothstep(.62, .78, grain);
        diffuseColor.rgb *= .76 + wear * .26 - pores * .10;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.73,.61,.44), patina * .40);
        relief -= pores * .035;
      ` : surface === 'cloth' ? `
        vec3 weave = sin(vActorSurface * 460.0);
        float thread = (weave.x * weave.y + weave.z * .35) * .06 * fiberDetail;
        diffuseColor.rgb *= .73 + wear * .30 + thread;
        relief += thread * .7;
      ` : metal ? `
        float scratch = smoothstep(.92, .99, sin(vActorSurface.y * 260.0 + vActorSurface.x * 37.0)) * .14 * detail;
        diffuseColor.rgb *= .89 + wear * .08 + grain * .035 + scratch;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(${surface === 'bronze' ? '.38,.64,.52' : '.67,.43,.27'}), patina * .35);
        relief -= scratch * .25;
      ` : surface === 'leather' || surface === 'hide' ? `
        float crease = (1.0-smoothstep(.015,.11,abs(wear-.48)+grain*.07))*detail;
        float pore = smoothstep(.56,.76,grain);
        diffuseColor.rgb *= .74+wear*.23-crease*.055-pore*.045;
        diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.12,.98,.79),patina*.32);
        relief -= crease*.025+pore*.025;
      ` : surface === 'stone' ? `
        float fissure = (1.0-smoothstep(.01,.09,abs(wear-.43)+grain*.08))*detail;
        float mineral = smoothstep(.57,.75,grain);
        diffuseColor.rgb *= .69+wear*.26-fissure*.10+mineral*.075;
        diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.82,.88,.77),patina*.35);
        relief += mineral*.05-fissure*.045;
      ` : `
        diffuseColor.rgb *= ${surface === 'skin' ? '.88 + wear * .14 + grain * .025' : '.59 + wear * .36 + grain * .14'};
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(${surface === 'skin' ? '1.08,.91,.84' : '1.04,.91,.76'}), patina * .28);
      `}
      #ifdef ACTOR_CAVITY
      diffuseColor.rgb *= .78+.22*vSurfaceCavity;
      #endif
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (grain - .5) * .12 + patina * ${metal ? '.09' : '.07'}, .30, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${metal ? 'metalnessFactor *= 1.0-patina*.25;' : ''}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        #ifdef ACTOR_CAVITY
        reflectedLight.indirectDiffuse *= vSurfaceCavity;
        reflectedLight.indirectSpecular *= vSurfaceCavity;
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 surfaceDx = normalize(dFdx(-vViewPosition)), surfaceDy = normalize(dFdy(-vViewPosition));
        vec3 gradientX = cross(surfaceDy, normal), gradientY = cross(normal, surfaceDx);
        float determinant = dot(surfaceDx, gradientX) * faceDirection;
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
    // Separate cap vertices keep the rim crisp without bending side normals.
    const rim = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const source = (row * (segments + 1) + i) * 3;
      positions.push(positions[source], positions[source + 1], positions[source + 2]);
      uvs.push(.5 + Math.sin(i / segments * Math.PI * 2) * .5, .5 + Math.cos(i / segments * Math.PI * 2) * .5);
    }
    for (let i = 0; i < segments; i++) {
      const b = rim + i;
      indices.push(...(row === 0 ? [center, b + 1, b] : [center, b, b + 1]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // The UV seam duplicates a vertex; average its normals to remove the lit stripe.
  const normals = geometry.attributes.normal, normal = new THREE.Vector3();
  for (let row = 0; row < sections.length; row++) {
    const first = row * (segments + 1), last = first + segments;
    normal.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z); normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  bakeModelCavity(geometry);return geometry;
}

export function plateGeometry(points: readonly (readonly [number, number])[], depth = .035, bevel = .015) {
  return modelGeometryCache.get(`plate:${depth}:${bevel}:${JSON.stringify(points)}`,()=>{
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  const source=new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel * .65, bevelSegments: 2, curveSegments: 5 });
  const geometry=mergeVertices(source);source.dispose();bakeModelCavity(geometry);return geometry;
  });
}

// Only merge siblings: knees, hands, weapons, wings and tails retain their pivots.
export function mergeActorParts(root: THREE.Object3D) {
  const sources = new Set<THREE.BufferGeometry>(), parents: THREE.Object3D[] = [];
  root.traverse(node => {
    if (node instanceof THREE.Mesh) {
      sources.add(node.geometry);bakeModelCavity(node.geometry);
      for(const material of Array.isArray(node.material)?node.material:[node.material]) {
        if(material instanceof THREE.MeshStandardMaterial&&material.userData.surface)material.userData.actorCavity=true;
      }
    }
    if (node instanceof THREE.Group) parents.push(node);
  });
  for (const parent of parents) {
    const batches = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child.name || child.userData.cloth || Array.isArray(child.material)) continue;
      const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}`;
      const list = batches.get(key) ?? []; list.push(child); batches.set(key, list);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const copies = meshes.map(mesh => {
        mesh.updateMatrix(); const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        return ensureGeometryIndex(geometry);
      });
      const merged = mergeGeometries(copies, false); copies.forEach(geometry => geometry.dispose());
      if (!merged) throw new Error('Actor geometry attributes must agree before merging');
      meshes.forEach(mesh => parent.remove(mesh));
      const mesh = new THREE.Mesh(merged, meshes[0].material); mesh.castShadow = meshes[0].castShadow; mesh.receiveShadow = meshes[0].receiveShadow; mesh.matrixAutoUpdate = false; parent.add(mesh);
    }
  }
  const retained = new Set<THREE.BufferGeometry>(); root.traverse(node => { if (node instanceof THREE.Mesh) retained.add(node.geometry); });
  sources.forEach(geometry => { if (!retained.has(geometry)) geometry.dispose(); });
}
