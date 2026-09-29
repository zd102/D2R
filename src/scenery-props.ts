import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { contourGeometry, organicGeometry, plateGeometry } from './actor-modeling.ts';
import { loftGeometry, sculptedHead, sculptedTorso } from './sculpted-surfaces.ts';
import { carveSurface } from './model-detailing.ts';
import { ensureGeometryIndex } from './geometry-batching.ts';
import type { SceneryProp } from './scene-design.ts';

export const SCENERY_MODELS = [
  { id: 'crag', name: '风化岩簇' }, { id: 'root', name: '枯树盘根' }, { id: 'grave', name: '哥特墓碑' },
  { id: 'coffin', name: '浮雕石棺' }, { id: 'ruin', name: '残破拱窗' }, { id: 'pillar', name: '槽纹石柱' },
  { id: 'urn', name: '双耳陶罐' }, { id: 'egg', name: '虫巢卵囊' }, { id: 'obelisk', name: '铭文尖碑' },
  { id: 'tree', name: '扭曲林木' }, { id: 'web', name: '悬挂蛛网' }, { id: 'hut', name: '茅草木屋' },
  { id: 'totem', name: '兽骨图腾' }, { id: 'bones', name: '散落遗骸' }, { id: 'spike', name: '刑罚尖桩' },
  { id: 'barricade', name: '绑扎拒马' }, { id: 'crystal', name: '矿物晶簇' }, { id: 'tent', name: '旧帆布帐篷' },
  { id: 'crate', name: '加固木箱' }, { id: 'workbench', name: '木制工作台' }, { id: 'cask', name: '箍铁木桶' },
  { id: 'statue', name: '守卫石像' }, { id: 'chest', name: '包铁储物箱' }, { id: 'corpse', name: '旅者遗骸' },
] as const satisfies readonly { id: SceneryProp | 'tent' | 'crate' | 'workbench' | 'cask' | 'statue' | 'chest' | 'corpse'; name: string }[];
export type SceneryModelKind = typeof SCENERY_MODELS[number]['id'];
export type SceneryMaterials = Record<'stone' | 'wall' | 'dark' | 'wood' | 'trim' | 'bone' | 'iron' | 'foliage' | 'ice' | 'leaves' | 'silk' | 'cloth', THREE.Material>;

// A chipped, eight-sided paving slab: 28 triangles, including the bottom.
export function pavingSlabGeometry() {
  const outline = [[-.46,-.50],[.42,-.50],[.50,-.42],[.50,.44],[.44,.50],[-.43,.50],[-.50,.43],[-.50,-.44]];
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (const y of [-.5,.5]) for (const [x,z] of outline) { positions.push(x,y,z); uvs.push(x+.5,z+.5); }
  for(let i=1;i<7;i++){ indices.push(8,8+i+1,8+i); indices.push(0,i,i+1); }
  for(let i=0;i<8;i++){const j=(i+1)%8;indices.push(i,8+i,j,j,8+i,8+j);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  const flat=geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals();return flat;
}

// Each library belongs to one world. Templates are built on demand, merged by
// material, then cloned with shared geometry so scenery remains instanceable.
export function createSceneryLibrary(materials: SceneryMaterials) {
  const templates = new Map<SceneryModelKind, THREE.Group>();
  return (kind: SceneryModelKind) => {
    let template = templates.get(kind);
    if (!template) { template = buildSceneryModel(kind, materials); templates.set(kind, template); }
    return template.clone(true);
  };
}

function buildSceneryModel(kind: SceneryModelKind, m: SceneryMaterials) {
  const root = new THREE.Group(); root.name = `scenery-${kind}`;
  const box = new THREE.BoxGeometry(), shaft = new THREE.CylinderGeometry(.85, 1, 1, 8), rock = carveSurface(new THREE.DodecahedronGeometry(1, 1), .055);
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const block = (material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0) => {
    const mesh = part(box, material, x, y, z, w, h, d); mesh.rotation.y = angle; return mesh;
  };
  const beam = (a: number[], b: number[], radius: number, material = m.wood) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = part(shaft, material, 0, 0, 0, radius, start.distanceTo(end), radius);
    mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return mesh;
  };
  const curve = (points: number[][], radius: number, material = m.wood, taper = .85) => {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), geometry = new THREE.TubeGeometry(path, 10, radius, 7, false);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const t = Math.floor(i / 8) / 10, center = path.getPointAt(t), vertex = new THREE.Vector3().fromBufferAttribute(vertices, i).sub(center).multiplyScalar(1 - t * taper).add(center);
      vertices.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.computeVertexNormals(); return part(geometry, material);
  };
  const ring = (radius: number, y: number, material = m.iron, thickness = .025) => {
    const mesh = part(new THREE.TorusGeometry(radius, thickness, 5, 16), material, 0, y, 0); mesh.rotation.x = Math.PI / 2; return mesh;
  };
  const skull = (x: number, y: number, z: number, size = 1) => {
    part(sculptedHead(1.1, .024, 'gaunt'), m.bone, x, y, z, size, size, size);
    for (const side of [-1,1]) part(organicGeometry(), m.dark, x + side * .054 * size, y + .060 * size, z + .104 * size, .034 * size, .032 * size, .022 * size);
    block(m.dark,x,y-.035*size,z+.136*size,.026*size,.047*size,.009*size);
    for(let i=0;i<5;i++)block(m.bone,x+(i-2)*.025*size,y-.12*size,z+.10*size,.017*size,.038*size,.025*size);
  };
  if (kind === 'crag') {
    part(rock, m.stone, -.15, .74, 0, 1.03, 1.12, .82).rotation.set(.2, .45, -.18);
    part(rock, m.dark, .58, .34, .30, .57, .49, .55).rotation.set(.3, -.5, .2);
    part(rock, m.stone, -.54, .20, .57, .35, .27, .42);
  } else if (kind === 'root' || kind === 'tree') {
    const tall = kind === 'tree' ? 1.5 : 1;
    curve([[0,0,0],[-.14,.8,0],[.18,1.6*tall,.08],[.02,2.8*tall,.12]], .25);
    for(let i=0;i<5;i++) {
      const a=i*2.4,dx=Math.cos(a),dz=Math.sin(a);
      curve([[0,.43,0],[dx*.42,.10,dz*.42],[dx*1.1,.025,dz*.9]],.14);
      curve([[.07,1.3*tall,.05],[dx*.65,2.1*tall,dz*.4],[dx*1.1,2.7*tall,dz*.75],[dx*.86,3*tall,dz*.9]],.11);
      curve([[dx*.65,2.1*tall,dz*.4],[dx*1.3,2.45*tall,dz*.6]],.054);
      if(kind==='tree') {
        const card=part(new THREE.PlaneGeometry(2.3,2.7),m.leaves,dx*.85,2.7*tall,dz*.65);card.rotation.set(-1.1,a,.3);card.castShadow=false;
      }
    }
  } else if (kind === 'grave') {
    block(m.dark,0,.055,.35,.72,.11,1.45);
    const outline:[number,number][]=[[-.33,0],[.33,0],[.31,.83],[.23,1.05],[0,1.24],[-.23,1.05],[-.31,.83]];
    part(plateGeometry(outline,.19,.025),m.stone,0,.1,0);
    part(plateGeometry(outline.map(([x,y])=>[x*.76,y*.78] as [number,number]),.025,.012),m.wall,0,.21,.216);
    block(m.dark,0,.71,.260,.045,.40,.012);block(m.dark,0,.81,.261,.24,.045,.012);
    for(let i=0;i<3;i++)block(m.dark,0,.36-i*.065,.259,.18-i*.045,.012,.008);
  } else if (kind === 'coffin') {
    const outline:[number,number][]=[[-.34,-1.10],[.34,-1.10],[.57,.49],[.42,1.10],[-.42,1.10],[-.57,.49]];
    part(plateGeometry(outline,.43,.045),m.wall,0,.29,0).rotation.x=-Math.PI/2;
    part(plateGeometry(outline.map(([x,z])=>[x*1.06,z*1.025]),.13,.035),m.stone,0,.58,0).rotation.x=-Math.PI/2;
    part(loftGeometry([[-.61,.15,.04],[.10,.21,.055],[.40,.11,.04]],14,.025),m.bone,0,.77,-.04).rotation.x=-Math.PI/2;
    part(sculptedHead(1,.01,'gaunt'),m.bone,0,.78,-.58,.9,.9,.7).rotation.x=-Math.PI/2;
    for(const s of [-1,1]) {beam([s*.20,.80,-.28],[s*.07,.83,.08],.045,m.bone);block(m.trim,s*.57,.35,.26,.04,.11,.19);}
  } else if (kind === 'ruin') {
    for(const side of [-1,1]) {
      block(m.wall,side*.98,.95,0,.58,1.9,.53);block(m.stone,side*.96,.16,0,.68,.32,.65);
      block(m.wall,side*.99,2.12,0,.57,.46,.53);
      for(let i=0;i<5;i++)block(m.stone,side*.55,.25+i*.32,.02,.22,.28,.60);
    }
    for(let i=0;i<9;i++) {
      const a=Math.PI*i/8,stone=block(m.wall,Math.cos(a)*.66,1.72+Math.sin(a)*.65,0,.24,.29,.57);stone.rotation.z=a-Math.PI/2;
    }
    beam([-1.3,2.3,-.07],[.18,3.05,-.05],.10);beam([-.08,2.98,-.05],[.82,2.52,-.05],.09);
    part(rock,m.stone,-1.13,.15,.44,.28,.25,.30);part(rock,m.stone,.69,.12,.54,.38,.18,.23);
  } else if (kind === 'pillar') {
    block(m.stone,0,.16,0,1.20,.32,1.20);
    part(contourGeometry([[.30,.49,.49],[.41,.49,.49],[.48,.35,.35],[1.5,.32,.32],[2.55,.29,.29],[2.68,.43,.43],[2.82,.46,.46]],20,.032),m.wall);
    block(m.stone,0,2.9,0,1.06,.20,1.06);ring(.39,.47,m.trim,.018);ring(.34,2.54,m.trim,.018);
    for(const s of [-1,1])block(m.dark,s*.17,1.53,.285,.025,1.77,.028);
  } else if (kind === 'urn') {
    part(new THREE.LatheGeometry([[.15,0],[.23,.045],[.21,.12],[.33,.25],[.37,.46],[.32,.67],[.18,.79],[.17,.86],[.22,.89],[.22,.94],[.16,.94],[.135,.86],[.14,.79],[.26,.65],[.30,.46],[.27,.27],[.14,.14],[0,.14]].map(([r,y])=>new THREE.Vector2(r,y)),20),m.stone);
    ring(.21,.10,m.trim,.014);ring(.245,.74,m.trim,.015);
    for(const s of [-1,1])curve([[s*.19,.81,0],[s*.43,.72,0],[s*.46,.48,0],[s*.34,.38,0]],.035,m.stone,0);
  } else if (kind === 'egg') {
    for(let i=0;i<3;i++) {
      const x=(i-1)*.44,z=Math.abs(i-1)*.24;
      part(organicGeometry('carapace'),m.foliage,x,.42,z,.33,.55,.35);
      for(const side of [-1,1])curve([[x,.1,z+.30],[x+side*.21,.45,z+.26],[x+side*.12,.82,z+.08]],.016,m.wood);
    }
    for(let i=0;i<3;i++)curve([[-.7,.045,.13+i*.22],[0,.04,.54-i*.12],[.8,.055,.11+i*.20]],.025);
  } else if (kind === 'obelisk') {
    block(m.stone,0,.14,0,1.05,.28,1.05);
    part(contourGeometry([[.26,.40,.40],[.43,.34,.34],[2.65,.255,.255],[3.15,.002,.002]],4),m.wall).rotation.y=Math.PI/4;
    block(m.trim,0,.44,0,.65,.065,.65);block(m.trim,0,2.51,0,.53,.05,.53);
    for(let i=0;i<5;i++) {
      const y=.77+i*.29,z=.25-(y-.77)*.021;
      beam([-.07,y+.07,z],[.07,y-.07,z],.010,m.trim);beam([-.08,y-.035,z],[.06,y+.07,z],.010,m.trim);
    }
  } else if (kind === 'web') {
    for(const side of [-1,1])curve([[side*1.3,0,0],[side*1.15,1.3,-.08],[side*1.25,2.5,0]],.065);
    part(new THREE.PlaneGeometry(2.6,2.6),m.silk,0,1.3,0).castShadow=false;
  } else if (kind === 'hut') {
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;if(i===0)continue;
      block(m.wood,Math.sin(a)*.82,.74,Math.cos(a)*.82,.45,1.48,.075,a);
    }
    for(const s of [-1,1])beam([s*.31,0,.89],[s*.31,1.5,.89],.07);
    beam([-.4,1.45,.90],[.4,1.45,.90],.075);
    for(let i=0;i<3;i++)part(contourGeometry([[1.25+i*.35,1.32-i*.28,1.32-i*.28],[1.50+i*.35,1.20-i*.28,1.20-i*.28],[1.91+i*.35,.64-i*.23,.64-i*.23]],24,.035),m.foliage);
    part(new THREE.ConeGeometry(.22,.45,10),m.foliage,0,2.65,0);ring(.84,.25,m.wood,.035);ring(.84,1.31,m.wood,.035);
  } else if (kind === 'totem' || kind === 'spike') {
    part(contourGeometry([[0,.18,.16],[1.68,.13,.115],[2.5,.003,.003]],7,.015),kind==='spike'?m.dark:m.wood);
    if(kind==='totem')for(let i=0;i<3;i++){skull(0,.76+i*.51,.12,1.3);for(const s of [-1,1])curve([[s*.14,.94+i*.51,.10],[s*.32,1.02+i*.51,.05],[s*.38,1.28+i*.51,.08]],.056,m.bone);}
    else {beam([-.6,1.35,0],[.6,1.35,0],.07,m.iron);for(const x of [-.4,.4])curve([[x,1.34,0],[x,1.0,.03],[x*.85,.83,.01]],.019,m.iron,0);}
    for(const y of [.3,.45,1.45])ring(.17,y,m.iron,.02);
  } else if (kind === 'bones') {
    skull(-.20,.21,-.10,1.4);
    for(const s of [-1,1])for(let i=0;i<4;i++)curve([[.08,.10,.15+i*.105],[s*.23,.18,.19+i*.105],[s*.21,.055,.22+i*.105]],.020,m.bone,.2);
    for(const s of [-1,1]){beam([s*.44,.06,.02],[s*.29,.065,.73],.043,m.bone);part(rock,m.bone,s*.29,.065,.73,.064,.045,.063);}
  } else if (kind === 'barricade') {
    for(const x of [-.6,0,.6]) {
      beam([x,0,.30],[x,1.70,-.30],.12);part(new THREE.ConeGeometry(.125,.38,7),m.wood,x,1.86,-.35).rotation.x=-.34;
      for(const y of [.62,1.16]){const lashing=part(new THREE.TorusGeometry(.14,.02,5,10),m.dark,x,y,.07-y*.19);lashing.rotation.x=Math.PI/2+.4;}
    }
    beam([-1,.60,.05],[1,.60,.05],.11);beam([-1,1.12,-.10],[1,1.12,-.10],.085);
    beam([-.90,.22,.12],[.85,1.30,-.14],.065);
  } else if (kind === 'crystal') {
    const prism=contourGeometry([[0,.36,.36],[.25,.37,.37],[1.95,.28,.28],[2.65,.003,.003]],6);
    const flat=prism.toNonIndexed();flat.computeVertexNormals();prism.dispose();
    part(flat,m.ice,0,0,0).rotation.z=-.10;part(flat,m.ice,.44,0,.20,.58,.65,.62).rotation.z=-.40;part(flat,m.ice,-.45,0,-.14,.48,.56,.56).rotation.z=.45;
    part(rock,m.dark,0,.10,0,.70,.24,.56);
  } else if (kind === 'tent') {
    const geometry=new THREE.PlaneGeometry(5,4,20,16),vertices=geometry.attributes.position;
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),z=vertices.getY(i),edge=Math.abs(x)/2.5;
      vertices.setXYZ(i,x,3.28-Math.abs(x)*1.17-.12*Math.sin(Math.PI*(z+2)/4)+Math.sin(z*13+x)*.032*edge,z);
    }
    geometry.computeVertexNormals();part(geometry,m.cloth);
    for(const side of [-1,1]) {
      beam([0,0,side*2.06],[0,3.40,side*2.06],.075);
      beam([side*2.4,.45,2],[side*2.9,.08,2.5],.019,m.bone);beam([side*2.9,0,2.5],[side*2.9,.28,2.5],.035);
      const flap=plateGeometry([[side*.16,3.15],[side*2.42,.38],[side*.55,.20],[side*.31,1.4]],.007,.002);part(flap,m.cloth,0,0,2.012);
      beam([side*.15,3.12,2.04],[side*2.42,.38,2.04],.016,m.bone);
    }
    beam([0,3.3,-2.12],[0,3.3,2.12],.065);block(m.dark,0,.06,0,4.8,.12,3.8);
  } else if (kind === 'crate') {
    block(m.dark,0,.50,0,1.08,.94,.97);
    for(let i=0;i<5;i++) {
      for(const s of [-1,1])block(m.wood,-.45+i*.225,.51,s*.50,.21,.97,.045);
      block(m.wood,-.45+i*.225,1.02,0,.21,.05,1.02);
    }
    for(const s of [-1,1]){for(const x of [-.52,.52])block(m.wood,x,.51,s*.54,.075,1.05,.065);const brace=block(m.wood,0,.51,s*.545,1.26,.11,.065);brace.rotation.z=s*.63;}
  } else if (kind === 'workbench') {
    for(let i=0;i<4;i++)block(m.wood,0,.83,-.43+i*.285,2.32,.12,.27);
    for(const s of [-1,1]){for(const z of [-.37,.37])block(m.wood,s*.88,.39,z,.13,.77,.13);block(m.wood,s*.88,.23,0,.12,.12,.92);}
    block(m.wood,0,.26,0,1.86,.11,.13);beam([-.87,.2,.36],[-.40,.74,.36],.055);beam([.87,.2,-.36],[.40,.74,-.36],.055);
  } else if (kind === 'cask') {
    part(contourGeometry([[0,.35,.35],[.08,.38,.38],[.40,.44,.44],[.72,.43,.43],[1.03,.35,.35]],16,.009),m.wood);
    for(const y of [.09,.26,.81,1.00])ring(y>.85?.36:y<.15?.39:.435,y,m.iron,.025);
    for(let i=0;i<5;i++){const x=(i-2)*.132;block(m.wood,x,1.015,0,.12,.035,Math.sqrt(.34**2-x*x)*2);}
  } else if (kind === 'chest') {
    block(m.wood,0,.42,0,1.9,.82,1.15);
    part(contourGeometry([[-.60,.96,.02],[-.54,.96,.25],[-.32,.96,.38],[0,.96,.42],[.32,.96,.38],[.54,.96,.25],[.60,.96,.02]],12),m.wood,0,.82,0).rotation.x=Math.PI/2;
    for(const s of [-1,1]) {
      block(m.iron,s*.68,.42,.591,.11,.80,.035);block(m.iron,s*.68,.42,-.591,.11,.80,.035);
      curve([[s*.68,.83,-.59],[s*.68,1.18,-.30],[s*.68,1.24,0],[s*.68,1.18,.30],[s*.68,.83,.59]],.029,m.iron,0);
      for(const y of [.12,.69])part(organicGeometry(),m.trim,s*.68,y,.616,.025,.025,.016);
    }
    block(m.iron,0,.83,.622,.20,.27,.045);block(m.dark,0,.83,.648,.040,.06,.01);
  } else if (kind === 'statue') {
    block(m.stone,0,.16,0,1.30,.32,1.14);
    part(loftGeometry([[.32,.37,.27],[.58,.33,.24],[1.15,.25,.19],[1.42,.20,.14],[1.70,.32,.20],[2.12,.40,.21],[2.24,.19,.12]],18,.035),m.stone);
    part(sculptedHead(1.06,.016,'veteran'),m.stone,0,2.47,0,1.5,1.5,1.5);
    for(const s of [-1,1]){beam([s*.39,2.09,0],[s*.48,1.62,.15],.12,m.stone);beam([s*.48,1.62,.15],[s*.22,1.57,.32],.085,m.stone);}
    part(plateGeometry([[0,-.66],[.24,-.43],[.29,.25],[.15,.39],[0,.33],[-.15,.39],[-.29,.25],[-.24,-.43]],.065,.025),m.stone,-.18,1.32,.37);
    beam([.64,.35,.08],[.64,2.85,.08],.035,m.trim);part(new THREE.ConeGeometry(.12,.48,4),m.trim,.64,3.02,.08);
  } else if (kind === 'corpse') {
    part(sculptedTorso([[-.22,.13,.10],[.03,.17,.10],[.28,.23,.12],[.50,.17,.10]],.01),m.cloth,0,.17,-.10).rotation.x=-Math.PI/2;
    part(sculptedHead(.98,.02,'gaunt'),m.bone,.025,.19,-.72,1,1,1).rotation.set(-Math.PI/2,.1,.16);
    for(const s of [-1,1]){beam([s*.14,.16,.15],[s*.22,.10,.67],.075,m.cloth);beam([s*.22,.10,.67],[s*.32,.09,1.1],.058,m.wood);curve([[s*.22,.17,-.40],[s*.36,.12,-.12],[s*.20,.12,.07]],.061,m.cloth,.38);}
  }

  // Store a compact template (one mesh per material); no per-frame surface work.
  root.updateMatrixWorld(true);
  const buckets=new Map<THREE.Material,THREE.BufferGeometry[]>(),sources=new Set<THREE.BufferGeometry>([box,shaft,rock]);
  root.traverse(node=>{if(node instanceof THREE.Mesh){
    sources.add(node.geometry);const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    const list=buckets.get(node.material)??[];list.push(ensureGeometryIndex(geometry));buckets.set(node.material,list);
  }});
  root.clear();
  for(const [material,geometries] of buckets) {
    const merged=mergeGeometries(geometries,false);geometries.forEach(geometry=>geometry.dispose());
    if(!merged)throw new Error(`Cannot merge scenery model ${kind}`);
    const mesh=new THREE.Mesh(merged,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;root.add(mesh);
  }
  sources.forEach(geometry=>geometry.dispose());return root;
}
