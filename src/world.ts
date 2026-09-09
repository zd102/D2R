import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import PF from 'pathfinding';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ACTS, LEVELS, FIELD_BOUND, levelLayout, type Level, type QuestProp } from './campaign.ts';
import { CAMP } from './camp.ts';
import type { ClassId } from './classes.ts';

export const BOUNDS = FIELD_BOUND;
export function gridWalkable(grid: Pick<PF.Grid, 'width' | 'height' | 'isWalkableAt'>, point: { x: number; z: number }) {
  return grid.isWalkableAt(Math.round(point.x) + Math.floor(grid.width / 2), Math.round(point.z) + Math.floor(grid.height / 2));
}
export type WorldChest = { id: number; x: number; z: number; opened: boolean; group: THREE.Group; lid: THREE.Group };
export const SHRINES = [{ x: -16, z: 0 }, { x: 15, z: -2 }, { x: 0, z: -17 }];
export const COLORS = { common: 0xc3c4bf, magic: 0x73bdf4, rare: 0xe2c775, set: 0x77cf6c, unique: 0xc9b37c, runeword: 0xdacba0, legendary: 0xf19b4f };
const rng = (seed: number) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const random = rng(8943);
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone = new THREE.ConeGeometry(1, 1, 8);
const mat = (color: number, metalness = 0, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const stone = mat(0x686d65), edgeStone = mat(0x96978b), darkStone = mat(0x383e39), iron = mat(0x343b3d, .7, .5);
const gold = mat(0xb49c60, .7, .36), bone = mat(0xc0b89c), cloth = mat(0x6b1822), steel = mat(0x97a7a5, .75, .28);
const black = mat(0x111b1d), bark = mat(0x484a3e), moss = mat(0x414f37), leather = mat(0x403a31);
const runeMaterial = new THREE.MeshBasicMaterial({ color: 0x75ffdf, transparent: true, opacity: .7 });

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function beam(parent: THREE.Object3D, a: number[], b: number[], radius: number, material: THREE.Material) {
  const start = new THREE.Vector3(...a as [number, number, number]), end = new THREE.Vector3(...b as [number, number, number]);
  const m = mesh(parent, cylinder, material, 0, 0, 0, radius, start.distanceTo(end), radius);
  m.position.copy(start).add(end).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return m;
}
function groundTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#555a4c'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 33000; i++) {
    const c = 45 + Math.floor(random() * 65);
    ctx.fillStyle = `rgba(${c},${c + 6},${c - 4},${.1 + random() * .5})`;
    const size = random() * 4 + .3; ctx.fillRect(random() * 512, random() * 512, size, size);
  }
  for (let i = 0; i < 170; i++) {
    ctx.beginPath(); const x = random() * 512, y = random() * 512;
    ctx.ellipse(x, y, random() * 4 + 1, random() * 2 + 1, random() * 6, 0, Math.PI * 2);
    ctx.fillStyle = '#7b7c69'; ctx.fill();
    ctx.strokeStyle = '#383e35'; ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(18, 18); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function sigilTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.strokeStyle = '#a4eddd'; ctx.lineWidth = 3;
  for (const radius of [167, 178, 218, 228]) { ctx.beginPath(); ctx.arc(256, 256, radius, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 12; i++) {
    ctx.save(); ctx.translate(256, 256); ctx.rotate(i * Math.PI / 6);
    ctx.beginPath(); ctx.moveTo(-6, -190); ctx.lineTo(-6, -207); ctx.lineTo(6, -198); ctx.lineTo(-6, -194); ctx.moveTo(6, -207); ctx.lineTo(6, -189); ctx.stroke(); ctx.restore();
  }
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) { const a = i * Math.PI * 2 / 3 - Math.PI / 2; ctx.lineTo(256 + Math.cos(a) * 145, 256 + Math.sin(a) * 145); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(256, 256, 60, 0, Math.PI * 2); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function stoneTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#92978a'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16000; i++) {
    const c = 90 + Math.floor(random() * 90); ctx.fillStyle = `rgba(${c},${c + 3},${c - 5},${random() * .25})`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 4, .5 + random() * 3);
  }
  for (let i = 0; i < 4; i++) {
    let x = random() * 256, y = i % 2 ? 0 : 256;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (random() - .5) * 45; y += (i % 2 ? 1 : -1) * (6 + random() * 16); ctx.lineTo(x, y); }
    ctx.strokeStyle = '#3c453780'; ctx.lineWidth = 1 + random(); ctx.stroke();
    ctx.strokeStyle = '#bbc1aa33'; ctx.lineWidth = .5; ctx.translate(1, 1); ctx.stroke(); ctx.translate(-1, -1);
  }
  for (let i = 0; i < 120; i++) {
    const x = random() * 256, y = random() > .5 ? random() * 12 : 244 + random() * 12;
    ctx.fillStyle = `rgba(58,74,40,${random() * .6})`; ctx.fillRect(x, y, random() * 9, random() * 5);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
export type Actor = { group: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; cape?: THREE.Mesh; kind: string; animate?: (time: number, moving: boolean, attacking: number) => void };
export function createActor(kind: 'hero' | 'skeleton' | 'demon' | 'boss', classId: ClassId = 'paladin'): Actor {
  const group = new THREE.Group(), upper = new THREE.Group(); group.add(upper);
  const hero = kind === 'hero', skeleton = kind === 'skeleton', boss = kind === 'boss', female = hero && classId !== 'paladin', sorceress = classId === 'sorceress';
  const flesh=mat(0xc39570), hair=mat(sorceress?0x211c26:0xd1aa55), robe=mat(sorceress?0x277f91:0x766a39,.2);
  group.userData.classId=hero?classId:undefined;
  const skin = hero ? female ? robe : steel : skeleton ? bone : boss ? mat(0x533a42, .4) : mat(0x694a46);
  const torso = mesh(upper, sphere, skin, 0, 1.03, 0, .3, .39, .21);
  if (hero) {
    if(!female) {mesh(upper, box, gold, 0, 1.05, .22, .055, .42, .035);
    mesh(upper, box, gold, 0, 1.19, .23, .4, .055, .035);}
    else {torso.scale.set(.25,.36,.19);mesh(upper,sphere,gold,0,1.26,.18,.07,.09,.035);}
    mesh(upper, cylinder, leather, 0, .79, 0, .31, .09, .22);
    mesh(upper, box, gold, 0, .79, .22, .11, .11, .055);
    mesh(upper, cone, female?robe:steel, 0, sorceress?.45:.65, 0, sorceress?.37:.31, sorceress?.9:.35, .26);
  } else if (skeleton) {
    torso.scale.set(.09, .32, .1);
    for (let i = 0; i < 4; i++) {
      const rib = mesh(upper, new THREE.TorusGeometry(.20 - i * .017, .028, 5, 10, Math.PI * 1.75), bone, 0, 1.15 - i * .11, .01);
      rib.rotation.x = Math.PI / 2;
    }
  } else {
    mesh(upper, cone, black, 0, 1.35, -.06, .4, .45, .25).rotation.x = -.4;
    for (const side of [-1, 1]) beam(upper, [side * .25, 1.2, 0], [side * .75, 1.4, -.15], .11, skin);
  }
  mesh(upper, sphere, hero ? female?flesh:steel : skin, 0, 1.54, 0, female?.17:.205, .245, .185);
  if (female) {
    mesh(upper,sphere,hair,0,1.7,-.045,.19,.14,.18);
    mesh(upper,sphere,hair,0,1.47,-.13,.18,.28,.09);
    for(const side of [-1,1]) {mesh(upper,box,black,side*.07,1.57,.169,.04,.025,.025);mesh(upper,cylinder,gold,side*.16,1.47,.02,.023,.11,.023);}
    mesh(upper,box,gold,0,1.7,.14,.3,.025,.04);
    if(!sorceress)mesh(upper,sphere,hair,0,1.2,-.22,.07,.3,.075);
  } else if (hero) {
    mesh(upper, box, black, 0, 1.57, .174, .30, .075, .025);
    mesh(upper, box, gold, 0, 1.61, .2, .035, .25, .026);
    mesh(upper, box, gold, 0, 1.76, -.01, .04, .08, .34);
  } else {
    mesh(upper, box, skin, 0, 1.38, .07, .23, .09, .20);
    const eyeMat = new THREE.MeshBasicMaterial({ color: skeleton ? 0x90f9c9 : 0xff592b });
    for (const side of [-1, 1]) {
      mesh(upper, sphere, black, side * .087, 1.57, .16, .072, .071, .025);
      mesh(upper, sphere, eyeMat, side * .087, 1.57, .18, .027, .023, .015);
      if (!skeleton) {
        const horn = mesh(upper, cone, bone, side * .22, 1.82, -.05, .09, .45, .10); horn.rotation.z = -side * .6;
      }
    }
    mesh(upper, cone, black, 0, 1.48, .18, .035, .075, .015).rotation.z = Math.PI;
  }
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
  for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]] as const) {
    leg.position.set(side * .16, .72, 0); group.add(leg);
    mesh(leg, cylinder, hero ? leather : skin, 0, -.18, 0, .09, .36, .09);
    mesh(leg, sphere, hero ? gold : skin, 0, -.36, .025, .105, .105, .10);
    mesh(leg, cylinder, skin, 0, -.49, 0, hero ? .115 : .07, .28, .095);
    mesh(leg, box, hero ? iron : skin, 0, -.66, .055, .17, .13, .29);
  }
  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  for (const [arm, side] of [[leftArm, -1], [rightArm, 1]] as const) {
    arm.position.set(side * .33, 1.23, 0); upper.add(arm);
    mesh(arm, sphere, skin, side * .04, -.02, 0, hero && !female ? .18 : .11, .14, .17);
    if (hero) mesh(arm, cone, gold, side * .04, .08, 0, .16, .07, .16);
    beam(arm, [0, -.06, 0], [side * .06, -.38, .09], .073, female?flesh:hero ? leather : skin);
    mesh(arm, sphere, female?flesh:hero ? steel : skin, side * .06, -.4, .10, .10, .12, .09);
  }
  if (hero || skeleton) {
    const sword = new THREE.Group(); sword.position.set(.06, -.35, .18); rightArm.add(sword); if (hero) sword.name = 'hero-weapon';
    mesh(sword, cylinder, leather, 0, 0, 0, .038, .27, .038).rotation.x = Math.PI / 2;
    mesh(sword, box, gold, 0, 0, .14, .37, .065, .07);
    mesh(sword, box, steel, 0, 0, .67, .095, .036, 1.04);
    mesh(sword, cone, steel, 0, 0, 1.25, .067, .2, .03).rotation.x = Math.PI / 2;
    if (hero) {
      const staff=new THREE.Group();staff.name='hero-staff';staff.position.copy(sword.position);rightArm.add(staff);staff.visible=false;
      beam(staff,[0,-.6,.05],[0,1.4,.05],.04,leather);mesh(staff,new THREE.TorusGeometry(.15,.025,5,12),gold,0,1.5,.05);
      mesh(staff,new THREE.IcosahedronGeometry(.10,1),new THREE.MeshStandardMaterial({color:0x96dfee,emissive:0x368ba9,emissiveIntensity:.7}),0,1.5,.05);
      const shape = new THREE.Shape(); shape.moveTo(-.29, .3); shape.lineTo(.29, .3); shape.lineTo(.26, -.08); shape.lineTo(0, -.4); shape.lineTo(-.26, -.08); shape.closePath();
      const shield = mesh(leftArm, new THREE.ExtrudeGeometry(shape, { depth: .065, bevelEnabled: true, bevelThickness: .025, bevelSize: .02, bevelSegments: 1 }), iron, -.10, -.26, .29);
      shield.rotation.y = -.25; shield.name = 'hero-shield';
      mesh(shield, box, gold, 0, -.015, .09, .046, .53, .022);
      mesh(shield, box, gold, 0, .12, .09, .42, .04, .022);
      const ranged = new THREE.Group(); ranged.name = 'hero-ranged'; ranged.position.copy(sword.position); rightArm.add(ranged);
      for (const kind of ['bow', 'crossbow', 'javelin', 'knife', 'axe']) {
        const weapon = new THREE.Group(); weapon.name = `hero-${kind}`; weapon.visible = false; ranged.add(weapon);
        if (kind === 'bow') {
          beam(weapon, [0, -.65, .1], [0, 0, .38], .045, gold); beam(weapon, [0, 0, .38], [0, .65, .1], .045, gold);
          beam(weapon, [0, -.65, .1], [0, .65, .1], .009, bone);
        } else if (kind === 'crossbow') {
          mesh(weapon, box, leather, 0, 0, .25, .12, .1, .8);
          beam(weapon, [-.45, 0, .35], [0, 0, .5], .04, steel); beam(weapon, [0, 0, .5], [.45, 0, .35], .04, steel);
          beam(weapon, [-.45, 0, .35], [0, 0, .1], .009, bone); beam(weapon, [0, 0, .1], [.45, 0, .35], .009, bone);
        } else {
          const length = kind === 'javelin' ? 1.35 : .45;
          beam(weapon, [0, 0, -.15], [0, 0, length], .035, leather);
          if (kind === 'axe') mesh(weapon, box, steel, .12, 0, length, .35, .05, .22);
          else mesh(weapon, cone, steel, 0, 0, length, .09, .3, .035).rotation.x = Math.PI / 2;
        }
      }
    }
  } else {
    beam(rightArm, [.06, -.4, .1], [.1, .45, .12], .07, iron);
    mesh(rightArm, new THREE.IcosahedronGeometry(.25, 0), iron, .1, .5, .12);
    for (let i = 0; i < 4; i++) mesh(rightArm, cone, bone, .1 + Math.cos(i * Math.PI / 2) * .22, .5 + Math.sin(i * Math.PI / 2) * .22, .12, .07, .25, .07).rotation.z = i * Math.PI / 2 - Math.PI / 2;
  }
  let cape: THREE.Mesh | undefined;
  if (hero || boss) {
    const geo = new THREE.PlaneGeometry(.75, 1, 5, 7);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (1.15 - y * .5)); pos.setZ(i, Math.sin(pos.getX(i) * 22) * .035 - (.5 - y) * .27); }
    geo.computeVertexNormals();
    cape = mesh(upper, geo, new THREE.MeshStandardMaterial({ color: boss ? 0x331722 : female ? sorceress?0x1c5868:0x3b5740 : 0x8a2433, side: THREE.DoubleSide, roughness: 1 }), 0, .87, -.24);
    if(female)cape.scale.set(.7,sorceress?1:.6,1);
  }
  if (boss) group.scale.setScalar(2.05);
  if (kind === 'demon') group.scale.setScalar(.92);
  if(hero) {
    // Hero actors survive area reloads and own the resources disposed on class changes.
    const geometries=new Map<THREE.BufferGeometry,THREE.BufferGeometry>(), materials=new Map<THREE.Material,THREE.Material>();
    group.traverse(node=>{if(node instanceof THREE.Mesh){if([box,sphere,cylinder,cone].includes(node.geometry)){if(!geometries.has(node.geometry))geometries.set(node.geometry,node.geometry.clone());node.geometry=geometries.get(node.geometry)!;}if([stone,edgeStone,darkStone,iron,gold,bone,cloth,steel,black,bark,moss,leather].includes(node.material)){if(!materials.has(node.material))materials.set(node.material,node.material.clone());node.material=materials.get(node.material)!;}}});
  }
  return { group, leftLeg, rightLeg, leftArm, rightArm, cape, kind };
}

export class GameWorld {
  scene = new THREE.Scene();
  physics = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  grid = new PF.Grid(57, 57);
  finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles });
  staticGroup = new THREE.Group();
  torches: { flame: THREE.Mesh; light?: THREE.PointLight; phase: number }[] = [];
  shrineMeshes: THREE.Group[] = [];
  chests: WorldChest[] = [];
  portal: THREE.Group;
  rune: THREE.Mesh;
  particles: THREE.Points;
  obstacles: { x: number; z: number; w: number; d: number }[] = [];
  ground: THREE.Mesh;
  exit: THREE.Group;
  level: Level;
  isCamp: boolean;
  sharedStash?: THREE.Group;
  floorCells: { x: number; z: number }[] = [];
  constructor(level = LEVELS[0], isCamp = false) {
    this.level = level; this.isCamp = isCamp;
    if (!isCamp) this.grid = new PF.Grid((FIELD_BOUND + 1) * 2 + 1, (FIELD_BOUND + 1) * 2 + 1);
    const theme = ACTS[isCamp ? 0 : level.act];
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.FogExp2(theme.sky, .009);
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.defaultContactMaterial.friction = 0;
    this.scene.add(new THREE.HemisphereLight(0xb7dcda, 0x424533, 1.7));
    const sun = new THREE.DirectionalLight(0xd8e5d2, 2.5); sun.position.set(-12, 24, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 100 });
    sun.shadow.normalBias = .04; sun.shadow.bias = -.0003; this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x69a5b0, 1.0); fill.position.set(20, 15, -20); this.scene.add(fill);
    const groundMap = groundTexture();
    this.ground = mesh(this.scene, new THREE.PlaneGeometry(170, 170), new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, bumpMap: groundMap, bumpScale: .18 }), 0, -.05, 0);
    this.ground.rotation.x = -Math.PI / 2; this.ground.castShadow = false;
    this.scene.add(this.staticGroup);
    (this.ground.material as THREE.MeshStandardMaterial).color.setHex(theme.ground);
    if (isCamp) this.buildCamp(); else this.buildLevel();
    const offset = this.gridOffset, last = this.grid.width - 1;
    for (let i = 0; i <= last; i++) {
      this.grid.setWalkableAt(i, 0, false); this.grid.setWalkableAt(i, last, false);
      this.grid.setWalkableAt(0, i, false); this.grid.setWalkableAt(last, i, false);
    }
    this.addCollider(0, -offset, last, .7); this.addCollider(0, offset, last, .7); this.addCollider(-offset, 0, .7, last); this.addCollider(offset, 0, .7, last);
    const runeMat = new THREE.MeshBasicMaterial({ map: sigilTexture(), transparent: true, opacity: .5, depthWrite: false, color: 0x69dbc4 });
    this.rune = mesh(this.scene, new THREE.PlaneGeometry(7, 7), runeMat, 0, .16, 11); this.rune.rotation.x = -Math.PI / 2;
    this.rune.castShadow = false;
    if (isCamp) {
      this.rune.position.set(CAMP.portal.x, .24, CAMP.portal.z); this.rune.scale.setScalar(.75);
      this.portal = this.makeWaypoint(); this.exit = new THREE.Group();
    } else {
      const layout = levelLayout(level);
      this.portal = this.makePortal(layout.supply.x, layout.supply.z);
      layout.objects.forEach((p, i) => this.shrineMeshes.push(this.makeObjective(p.x, p.z, i, level.quest.prop)));
      layout.chests.forEach(p => this.chests.push(this.makeChest(p.id, p.x, p.z)));
      this.exit = this.makePortal(layout.exit.x, layout.exit.z);
    }
    this.exit.visible = false;
    const particleGeo = new THREE.BufferGeometry(), pos = new Float32Array(420 * 3);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = (random() - .5) * (offset * 2 + 8); pos[i + 1] = random() * 7; pos[i + 2] = (random() - .5) * (offset * 2 + 8); }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({ color: !isCamp && level.act === 4 ? 0xf2ffff : theme.accent, size: !isCamp && level.act === 4 ? .085 : .04, transparent: true, opacity: .5, depthWrite: false })); this.scene.add(this.particles);
    this.mergeStatic();
  }
  buildCamp() {
    const paving = new THREE.MeshStandardMaterial({ color: 0x959d91, map: stoneTexture(), roughness: 1 });
    const timber = mat(0x64675b), redCanvas = mat(0x923f4b), blueCanvas = mat(0x4b7885);
    for (let z = -13; z <= 18; z++) for (let x = -15; x <= 15; x++) {
      this.floorCells.push({ x, z });
      if (Math.abs(x) <= 2 || Math.abs(z - 8) <= 2 || Math.hypot(x - CAMP.portal.x, z - CAMP.portal.z) < 3.5) {
        mesh(this.staticGroup, box, paving, x, .015, z, .96, .13, .96);
      }
    }
    for (const x of [-16, 16]) {
      this.addCollider(x, 2.5, 1, 33);
      for (let z = -14; z <= 19; z += .8) {
        mesh(this.staticGroup, cylinder, timber, x, .9, z, .22, 1.8, .22);
        mesh(this.staticGroup, cone, timber, x, 1.95, z, .22, .3, .22);
      }
    }
    for (const z of [-14, 19]) {
      this.addCollider(0, z, 33, 1);
      for (let x = -16; x <= 16; x += .8) {
        mesh(this.staticGroup, cylinder, timber, x, .9, z, .22, 1.8, .22);
        mesh(this.staticGroup, cone, timber, x, 1.95, z, .22, .3, .22);
      }
    }
    for (let row = 0; row < 57; row++) for (let column = 0; column < 57; column++) {
      if (column < 13 || column > 43 || row < 15 || row > 46) this.grid.setWalkableAt(column, row, false);
    }
    for (const [x, z, color] of [[-9, 1, redCanvas], [8, 1, blueCanvas], [-6, -8, blueCanvas], [7, -8, redCanvas]] as const) {
      const tent = new THREE.Group(); tent.position.set(x, 0, z); this.staticGroup.add(tent);
      const roof = new THREE.BufferGeometry();
      roof.setAttribute('position', new THREE.Float32BufferAttribute([
        -2.5, .3, -2, 0, 3.3, -2, -2.5, .3, 2, 0, 3.3, -2, 0, 3.3, 2, -2.5, .3, 2,
        0, 3.3, -2, 2.5, .3, -2, 0, 3.3, 2, 2.5, .3, -2, 2.5, .3, 2, 0, 3.3, 2,
      ], 3)); roof.computeVertexNormals();
      const canvas = color.clone(); canvas.side = THREE.DoubleSide; mesh(tent, roof, canvas, 0, 0, 0);
      for (const side of [-1, 1]) beam(tent, [0, 0, side * 2.1], [0, 3.4, side * 2.1], .08, timber);
      mesh(tent, box, leather, 0, .1, 0, 4.8, .2, 3.8);
      this.addCollider(x, z, 5, 4);
      for (const side of [-1, 1]) {
        beam(tent, [side * 2.4, .4, 2], [side * 3, .1, 2.7], .025, bone);
        mesh(tent, cylinder, timber, side * 3, .2, 2.7, .07, .4, .07);
      }
    }
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2;
      mesh(this.staticGroup, new THREE.DodecahedronGeometry(.32), stone, Math.cos(angle), .2, 3 + Math.sin(angle), 1, .7, 1);
    }
    for (const angle of [-.6, .6]) mesh(this.staticGroup, cylinder, timber, 0, .3, 3, .18, 1.8, .18).rotation.set(Math.PI / 2, 0, angle);
    this.torch(0, 3, .6, true); this.addCollider(0, 3, 2, 2);
    for (const [x, z] of [[-12, 8], [10, 8], [0, -8]]) this.torch(x, z, 2, true);
    const { x, z } = CAMP.supply;
    mesh(this.staticGroup, box, timber, x, .75, z, 2.4, .18, 1.2);
    for (const side of [-1, 1]) mesh(this.staticGroup, box, timber, x + side, .35, z, .15, .7, 1);
    for (let i = 0; i < 4; i++) mesh(this.staticGroup, sphere, i % 2 ? blueCanvas : redCanvas, x - .75 + i * .5, 1, z, .16, .24, .16);
    mesh(this.staticGroup, box, timber, x + 2.2, .55, z, 1.2, 1.1, 1.1);
    this.addCollider(x, z, 2.4, 1.2); this.addCollider(x + 2.2, z, 1.2, 1.1);
    const chest = new THREE.Group(); chest.position.set(CAMP.stash.x, 0, CAMP.stash.z); this.sharedStash = chest; this.scene.add(chest);
    mesh(chest, box, leather, 0, .45, 0, 2, .9, 1.2);
    mesh(chest, box, timber, 0, .98, 0, 2.1, .2, 1.3);
    for (const side of [-1, 1]) { mesh(chest, box, gold, side * .7, .5, .615, .12, .9, .05); mesh(chest, box, gold, side * .7, 1.1, 0, .12, .04, 1.3); }
    mesh(chest, box, gold, 0, .75, .66, .3, .3, .07);
    const lamp = new THREE.PointLight(0xe0bf76, 3, 5); lamp.position.set(0, 1.8, 0); chest.add(lamp);
    this.addCollider(CAMP.stash.x, CAMP.stash.z, 2, 1.2);
  }
  makeWaypoint() {
    const group = new THREE.Group(); group.position.set(CAMP.portal.x, 0, CAMP.portal.z); this.scene.add(group);
    mesh(group, cylinder, darkStone, 0, .07, 0, 2.5, .14, 2.5);
    mesh(group, cylinder, edgeStone, 0, .15, 0, 2.3, .12, 2.3);
    for (const radius of [2, 2.2]) {
      const ring = mesh(group, new THREE.TorusGeometry(radius, .035, 6, 64), runeMaterial, 0, .24, 0); ring.rotation.x = Math.PI / 2;
    }
    for (const side of [-1, 1]) {
      mesh(group, cylinder, stone, side * 2.5, .5, 0, .25, 1, .25);
      mesh(group, new THREE.OctahedronGeometry(.24), runeMaterial, side * 2.5, 1.15, 0);
      this.addCollider(CAMP.portal.x + side * 2.5, CAMP.portal.z, .5, .5);
    }
    const light = new THREE.PointLight(0x70e9de, 6, 7); light.position.y = 1.2; group.add(light);
    return group;
  }
  buildLevel() {
    const level = this.level, theme = ACTS[level.act], layout = levelLayout(level), random = rng(7421 + level.index * 103);
    const surface = mat(theme.stone), rock = mat(theme.ground), trim = mat(theme.accent, .3), wood = mat(level.act === 4 ? 0x555e61 : 0x4d5545);
    const pathMaterial = new THREE.MeshStandardMaterial({ color: theme.stone, map: stoneTexture(), roughness: 1 });
    const segments = layout.connections;
    const distance = (x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
      return Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z));
    };
    const width = level.terrain === 'field' || level.terrain === 'snow' ? 4.3 : level.terrain === 'arcane' ? 2.2 : 2.6;
    const walkable = (x: number, z: number) => Math.abs(x) < FIELD_BOUND && Math.abs(z) < FIELD_BOUND && (segments.some(([a, b]) => distance(x, z, a, b) < width) || Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 6 || Math.hypot(x - layout.boss.x, z - layout.boss.z) < 5.5 || layout.rooms.some(p => level.terrain === 'cave' ? ((x - p.x) / (p.width / 2)) ** 2 + ((z - p.z) / (p.depth / 2)) ** 2 < 1 : Math.abs(x - p.x) < p.width / 2 && Math.abs(z - p.z) < p.depth / 2));
    const size = this.grid.width, offset = this.gridOffset;
    const matrix = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => walkable(column - offset, row - offset) ? 0 : 1));
    // Terrain and physics share the same corridor mask, including every objective branch.
    for (let z = -FIELD_BOUND; z <= FIELD_BOUND; z++) {
      for (let x = -FIELD_BOUND; x <= FIELD_BOUND;) {
        if (walkable(x, z)) { this.floorCells.push({ x, z }); x++; continue; }
        const start = x; while (x <= FIELD_BOUND && !walkable(x, z)) x++;
        this.addCollider((start + x - 1) / 2, z, x - start, 1);
      }
    }
    this.grid = new PF.Grid(matrix);
    for (const { x, z } of this.floorCells) {
      const slab = mesh(this.staticGroup, box, pathMaterial, x, .015, z, .99, .15, .99);
      if (level.terrain === 'field' || level.terrain === 'snow') slab.material = rock;
      if (level.terrain === 'arcane' || level.terrain === 'lava') mesh(this.staticGroup, box, surface, x, -.45, z, 1, .8, 1);
    }
    if (level.terrain === 'arcane' || level.terrain === 'lava') {
      this.ground.position.y = -1.2;
      (this.ground.material as THREE.MeshStandardMaterial).color.setHex(level.terrain === 'lava' ? 0x7a3239 : 0x263445);
      const glow = new THREE.MeshBasicMaterial({ color: level.terrain === 'lava' ? 0xea6950 : 0x507c9c });
      for (let i = 0; i < 65; i++) {
        const x = (random() - .5) * 52, z = (random() - .5) * 52;
        if (walkable(x, z)) continue;
        mesh(this.staticGroup, box, glow, x, -1.05, z, .1 + random() * .4, .02, 1 + random() * 3).rotation.y = random() * 6;
      }
    }
    for (let x = -FIELD_BOUND + 1; x < FIELD_BOUND; x += 2.8) for (let z = -FIELD_BOUND + 1; z < FIELD_BOUND; z += 2.8) {
      if (walkable(x, z) || !segments.some(([a, b]) => distance(x, z, a, b) < width + 5) || random() < .18) continue;
      const h = .6 + random() * 1.4;
      if (level.terrain === 'cave') {
        const crag = mesh(this.staticGroup, new THREE.DodecahedronGeometry(1, 0), rock, x, h / 2, z, 1.5, h, 1.6); crag.rotation.y = random() * 6;
        if (level.act === 4) mesh(this.staticGroup, cone, trim, x + .4, h, z, .24, 1.5, .24);
      } else if (level.terrain === 'field' && level.act === 2) {
        beam(this.staticGroup, [x, 0, z], [x + .3, 3.8, z + .3], .22, wood);
        for (let i = 0; i < 4; i++) mesh(this.staticGroup, sphere, rock, x + Math.cos(i * 1.57), 3 + random(), z + Math.sin(i * 1.57), 1.3, .5, 1.1);
      } else if (level.terrain === 'snow') {
        mesh(this.staticGroup, cone, surface, x, .9, z, .8, 1.8, .8);
        mesh(this.staticGroup, cone, rock, x, 2, z, .55, 1.5, .55);
      } else if (level.terrain === 'field') {
        mesh(this.staticGroup, box, surface, x, .6, z, .8, 1.2, .3);
        mesh(this.staticGroup, cylinder, surface, x, 1.2, z, .4, .3, .4).rotation.x = Math.PI / 2;
      } else {
        mesh(this.staticGroup, box, surface, x, h / 2, z, 1.8, h, 1.7);
        mesh(this.staticGroup, box, trim, x, h + .08, z, 1.9, .1, 1.8);
        if (level.terrain === 'ruins') beam(this.staticGroup, [x, h, z], [x + 1, h + .8, z], .09, wood);
      }
    }
    for (const [i, p] of layout.route.slice(0, -1).entries()) {
      this.torch(p.x + width - .6, p.z, 1.7, i % 2 === 0);
    }
    const arena = mesh(this.staticGroup, cylinder, surface, layout.boss.x, .06, layout.boss.z, 4.4, .14, 4.4);
    if (level.actBoss) {
      arena.material = trim;
      mesh(this.staticGroup, cylinder, surface, layout.boss.x, .15, layout.boss.z, 4.1, .1, 4.1);
      for (const side of [-1, 1]) {
        mesh(this.staticGroup, box, surface, layout.boss.x + side * 4.5, 1.8, layout.boss.z - 2, 1, 3.6, 1);
        mesh(this.staticGroup, cone, trim, layout.boss.x + side * 4.5, 4, layout.boss.z - 2, .65, .8, .65);
      }
    }
  }
  makeObjective(x: number, z: number, id: number, prop: QuestProp) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.userData.id = id; this.scene.add(group);
    const theme = ACTS[this.level.act], material = mat(theme.stone), accent = mat(theme.accent, .35), bars = mat(0x7a8889, .7);
    mesh(group, cylinder, material, 0, .15, 0, 1.25, .3, 1.25);
    if (prop === 'cage') {
      for (const side of [-1, 1]) for (const p of [-.65, 0, .65]) {
        mesh(group, cylinder, bars, side * .75, 1.1, p, .045, 2, .045); mesh(group, cylinder, bars, p, 1.1, side * .75, .045, 2, .045);
      }
      mesh(group, box, material, 0, 2.15, 0, 1.7, .18, 1.7);
      mesh(group, sphere, accent, 0, .7, 0, .24, .4, .24); mesh(group, sphere, accent, 0, 1.28, 0, .2, .22, .2);
    } else if (prop === 'chest') {
      mesh(group, box, material, 0, .55, 0, 1.2, .7, .85); mesh(group, box, accent, 0, .95, 0, 1.3, .16, .95);
      mesh(group, box, gold, 0, .66, .45, .18, .22, .06);
    } else if (prop === 'grave') {
      mesh(group, box, material, 0, .9, 0, .8, 1.5, .32); mesh(group, box, accent, 0, 1.1, .2, .55, .08, .07);
    } else if (prop === 'siege') {
      mesh(group, box, material, 0, .8, 0, 1.8, .45, 1.5);
      beam(group, [-.8, .5, 0], [.8, 2, 0], .18, bars); mesh(group, sphere, accent, .8, 2, 0, .4, .3, .4);
    } else if (prop === 'ice') {
      mesh(group, new THREE.OctahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0xb7f3ff, transparent: true, opacity: .8, metalness: .4, roughness: .2 }), 0, 1.2, 0, .8, 1.3, .8);
    } else {
      mesh(group, cylinder, material, 0, .75, 0, .5, 1.1, .5);
      mesh(group, prop === 'forge' ? box : new THREE.OctahedronGeometry(1), accent, 0, 1.55, 0, .65, .45, .65);
    }
    const indicator = makeRing(1.5, theme.accent); indicator.name = 'indicator'; group.add(indicator);
    this.addCollider(x, z, 1.5, 1.5); return group;
  }
  makeChest(id: number, x: number, z: number): WorldChest {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.scene.add(group);
    const wood = mat(0x796c53), band = mat(0xb2a071, .65, .45);
    mesh(group, box, darkStone, 0, .12, 0, 1.65, .2, 1.1);
    mesh(group, box, wood, 0, .45, 0, 1.5, .65, 1);
    const lid = new THREE.Group(); lid.position.set(0, .78, -.5); group.add(lid);
    mesh(lid, box, wood, 0, .08, .5, 1.6, .2, 1.08);
    for (const side of [-1, 1]) {
      mesh(group, box, band, side * .5, .48, .51, .09, .6, .04);
      mesh(lid, box, band, side * .5, .19, .5, .1, .025, 1.08);
    }
    mesh(lid, box, band, 0, -.03, 1.06, .18, .26, .05);
    this.addCollider(x, z, 1.6, 1.1);
    return { id, x, z, opened: false, group, lid };
  }
  get gridOffset() { return Math.floor(this.grid.width / 2); }
  completeObjective(id: number) {
    const group = this.shrineMeshes[id]; if (!group) return;
    group.userData.complete = true;
    (group.getObjectByName('indicator') as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0xd6e8b6, transparent: true, opacity: .7, side: THREE.DoubleSide });
    if (this.level.quest.prop === 'cage' || this.level.quest.prop === 'ice') group.scale.y = .35;
  }
  dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
      }
      if (object instanceof THREE.Light && 'shadow' in object) (object as THREE.DirectionalLight).shadow.map?.dispose();
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    for (const body of [...this.physics.bodies]) this.physics.removeBody(body);
    this.scene.clear();
  }
  addCollider(x: number, z: number, w: number, d: number) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w / 2, 2, d / 2)), position: new CANNON.Vec3(x, 0, z) }); this.physics.addBody(body);
    this.obstacles.push({ x, z, w, d });
    for (let ix = Math.floor(x - w / 2 - .35); ix <= Math.ceil(x + w / 2 + .35); ix++) for (let iz = Math.floor(z - d / 2 - .35); iz <= Math.ceil(z + d / 2 + .35); iz++) {
      const offset = this.gridOffset;
      if (ix + offset >= 0 && ix + offset < this.grid.width && iz + offset >= 0 && iz + offset < this.grid.height) this.grid.setWalkableAt(ix + offset, iz + offset, false);
    }
  }
  body(x: number, z: number, radius = .4) {
    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(radius), position: new CANNON.Vec3(x, .5, z), linearDamping: .95, fixedRotation: true });
    body.linearFactor.set(1, 0, 1); body.updateMassProperties(); this.physics.addBody(body); return body;
  }
  path(from: { x: number; z: number }, to: { x: number; z: number }): THREE.Vector3[] {
    const offset = this.gridOffset, last = this.grid.width - 1;
    const sx = Math.round(from.x) + offset, sy = Math.round(from.z) + offset;
    const ex = Math.max(1, Math.min(last - 1, Math.round(to.x) + offset)), ey = Math.max(1, Math.min(last - 1, Math.round(to.z) + offset));
    if (sx < 0 || sy < 0 || sx > last || sy > last) return [];
    const candidates: { x: number; y: number; distance: number }[] = [];
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
      if (this.grid.isWalkableAt(ex + dx, ey + dy)) candidates.push({ x: ex + dx, y: ey + dy, distance: dx * dx + dy * dy + Math.hypot(ex + dx - sx, ey + dy - sy) * .001 });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    // Clicks on scenery resolve to the closest reachable tile, including enclosed pockets.
    for (const candidate of candidates) {
      const grid = this.grid.clone(); grid.setWalkableAt(sx, sy, true);
      const result = this.finder.findPath(sx, sy, candidate.x, candidate.y, grid);
      if (result.length) {
        const path = PF.Util.compressPath(result).slice(1).map(([x, z]) => new THREE.Vector3(x - offset, 0, z - offset));
        // The actor can round into the destination cell before reaching its interactable center.
        if (!path.length && Math.hypot(from.x - candidate.x + offset, from.z - candidate.y + offset) > .1) path.push(new THREE.Vector3(candidate.x - offset, 0, candidate.y - offset));
        return path;
      }
    }
    return [];
  }
  paving() {
    const texture = stoneTexture();
    const materials = [0x69726c, 0x778077, 0x828379, 0x59665e, 0x7b8176].map(color => new THREE.MeshStandardMaterial({ color, map: texture, bumpMap: texture, bumpScale: .1, roughness: 1 }));
    for (const material of [stone, edgeStone, darkStone]) { material.map = texture; material.bumpMap = texture; material.bumpScale = .075; }
    for (let x = -26; x <= 26; x += 1.5) for (let z = -26; z <= 26; z += 1.5) {
      const isPath = Math.abs(x) < 3.5 || (Math.abs(z) < 2.6 && Math.abs(x) < 21) || (Math.hypot(x, z - 11) < 5) || (z < -16 && Math.abs(x) < 7);
      if (isPath && random() > .065) {
        const slab = mesh(this.staticGroup, box, materials[Math.floor(random() * materials.length)], x + random() * .08, .015 + random() * .045, z + random() * .08, 1.39 + random() * .05, .13, 1.37 + random() * .06);
        slab.rotation.y = (random() - .5) * .035;
        if (random() > .83) mesh(this.staticGroup, box, moss, x + .5, .095, z + .6, random() * .5 + .15, .005, .13);
      }
    }
    for (const side of [-1, 1]) for (let z = -25; z < 25; z += 1.8) mesh(this.staticGroup, box, darkStone, side * 4.1, .08, z, .35, .22, 1.65);
  }
  pillar(x: number, z: number, height = 3.5) {
    mesh(this.staticGroup, box, darkStone, x, .15, z, 1.6, .3, 1.6);
    mesh(this.staticGroup, box, edgeStone, x, .36, z, 1.3, .16, 1.3);
    for (let y = .6; y < height; y += .47) mesh(this.staticGroup, box, stone, x, y, z, 1.0, .43, 1.0);
    mesh(this.staticGroup, box, edgeStone, x, height + .08, z, 1.3, .24, 1.3);
    for (const dx of [-.37, .37]) mesh(this.staticGroup, cylinder, edgeStone, x + dx, height / 2 + .2, z + .51, .095, height - .5, .095);
    this.addCollider(x, z, 1.4, 1.4);
  }
  arch(x: number, z: number, width: number, height: number) {
    this.pillar(x - width / 2, z, height); this.pillar(x + width / 2, z, height);
    const radius = width / 2;
    for (let i = 0; i < 13; i++) {
      const a = (i + .5) / 13 * Math.PI;
      const shape = new THREE.Shape();
      const a1 = i / 13 * Math.PI + .013, a2 = (i + 1) / 13 * Math.PI - .013;
      shape.moveTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
      shape.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius);
      shape.lineTo(Math.cos(a2) * (radius + .65), Math.sin(a2) * (radius + .65));
      shape.lineTo(Math.cos(a1) * (radius + .65), Math.sin(a1) * (radius + .65)); shape.closePath();
      mesh(this.staticGroup, new THREE.ExtrudeGeometry(shape, { depth: .9, bevelEnabled: false }), i % 3 ? stone : edgeStone, x, height, z - .45);
      if (i === 6) mesh(this.staticGroup, box, darkStone, x + Math.cos(a) * radius, height + radius + .3, z + .1, .6, .8, 1.15);
    }
  }
  ruins() {
    this.arch(0, 1, 8, 2.5);
    this.arch(0, -10, 8, 3.0);
    this.arch(0, -25, 10, 4.7);
    for (const side of [-1, 1]) {
      this.pillar(side * 4.8, 18, 2.8);
      this.torch(side * 4.8, 18, 3.15, true);
      for (const z of [-23, -18, -13]) this.pillar(side * 8, z, 2.6 + random() * 2);
      for (let z = -24; z < -10; z += 1.1) for (let row = 0; row < 2 + Math.floor(random() * 2); row++) mesh(this.staticGroup, box, stone, side * 8, .3 + row * .54, z + (row % 2) * .35, .8, .5, 1.05);
      this.addCollider(side * 8, -18, .9, 15);
      for (let x = 7; x < 26; x += 1.3) {
        const h = 1 + Math.floor(random() * 4);
        for (let row = 0; row < h; row++) mesh(this.staticGroup, box, row === h - 1 ? edgeStone : stone, side * x, row * .45 + .2, 20, 1.23, .4, .75);
      }
      this.addCollider(side * 16, 20, 18, .8);
      for (const z of [5, -5]) this.torch(side * 4.5, z, 1.65, true);
      for (let z = -26; z < 26; z += 3.5) {
        this.pillar(side * 27, z, 1.3 + random());
        for (let i = 1; i < 7; i++) {
          mesh(this.staticGroup, cylinder, iron, side * 27, 1, z + i * .5, .035, 1.8, .035);
          mesh(this.staticGroup, cone, iron, side * 27, 1.98, z + i * .5, .08, .2, .08);
        }
        mesh(this.staticGroup, box, iron, side * 27, .7, z + 1.75, .065, .055, 3.5);
        mesh(this.staticGroup, box, iron, side * 27, 1.45, z + 1.75, .065, .055, 3.5);
      }
    }
    for (let i = 0; i < 125; i++) {
      const x = (random() - .5) * 52, z = (random() - .5) * 50;
      if (Math.abs(x) < 4 || Math.abs(z) < 3 || Math.hypot(x, z - 11) < 6) continue;
      const rubble = mesh(this.staticGroup, new THREE.DodecahedronGeometry(1, 0), i % 3 ? stone : moss, x, .12, z, .15 + random() * .4, .1 + random() * .3, .2 + random() * .5); rubble.rotation.set(random(), random(), random());
    }
    for (const p of [[-10, 8], [9, 9], [-10, -8], [20, 11]]) {
      const col = mesh(this.staticGroup, cylinder, stone, p[0], .45, p[1], .45, 3.2, .45); col.rotation.z = Math.PI / 2; col.rotation.y = .4;
      mesh(this.staticGroup, box, edgeStone, p[0] + 1.4, .5, p[1] - .6, .35, 1, 1).rotation.y = .4;
      this.addCollider(p[0], p[1], 3.3, 1.1);
    }
  }
  graves() {
    for (const side of [-1, 1]) for (const x of [10, 14, 19, 23]) for (const z of [-12, -7, 5, 10, 15]) {
      if (random() > .75 || (side === -1 && z === 10 && x === 10)) continue;
      const gx = side * x + random() * .7, gz = z + random() * .7;
      const group = new THREE.Group(); group.position.set(gx, 0, gz); group.rotation.y = (random() - .5) * .3; this.staticGroup.add(group);
      mesh(group, box, darkStone, 0, .05, .7, 1.25, .12, 2.1);
      mesh(group, box, stone, 0, .14, .7, 1.05, .12, 1.9);
      if (random() > .5) {
        mesh(group, box, stone, 0, .72, -.25, .66, 1.25, .24);
        mesh(group, cylinder, edgeStone, 0, 1.32, -.25, .33, .25, .33).rotation.x = Math.PI / 2;
        mesh(group, box, darkStone, 0, .85, -.105, .035, .38, .016);
        mesh(group, box, darkStone, 0, .94, -.102, .22, .036, .017);
      } else {
        mesh(group, box, edgeStone, 0, .9, -.25, .22, 1.7, .27);
        mesh(group, box, edgeStone, 0, 1.2, -.25, .9, .24, .27);
        mesh(group, box, stone, 0, .18, -.25, .7, .35, .6);
      }
      this.addCollider(gx, gz + .65, 1.2, 2.1);
    }
  }
  vegetation() {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-.055, 0, 0, .06, 0, 0, .025, .43, .05, 0, 0, -.07, 0, 0, .07, -.08, .32, .02], 3)); geo.computeVertexNormals();
    const grass = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x596c40, roughness: 1, side: THREE.DoubleSide }), 6500);
    const dummy = new THREE.Object3D(); let count = 0;
    for (let i = 0; i < 9000 && count < 6500; i++) {
      const x = (random() - .5) * 67, z = (random() - .5) * 67;
      if ((Math.abs(x) < 4 || Math.abs(z) < 3 || Math.hypot(x, z - 11) < 5) && random() > .025) continue;
      dummy.position.set(x, .02, z); dummy.rotation.y = random() * Math.PI; dummy.scale.setScalar(.7 + random() * 1.4); dummy.updateMatrix(); grass.setMatrixAt(count, dummy.matrix);
      grass.setColorAt(count++, new THREE.Color().setHSL(.22 + random() * .09, .16 + random() * .19, .22 + random() * .2));
    }
    grass.count = count; this.scene.add(grass);
    for (const [x, z] of [[-21, 11], [22, -7], [-22, -17], [13, 16], [-13, -22], [23, 22], [-23, 23], [16, -23]]) {
      const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = random() * 6; this.staticGroup.add(group);
      beam(group, [0, 0, 0], [.3, 3.3, .2], .22, bark); beam(group, [.3, 3, .2], [.1, 5, 0], .13, bark);
      for (let i = 0; i < 6; i++) {
        const a = random() * 6.28, y = 1.7 + random() * 2.6;
        const end = [Math.cos(a) * 1.8, y + .8, Math.sin(a) * 1.8];
        beam(group, [.2, y, .1], end, .09, bark);
        beam(group, end, [end[0] * 1.5, end[1] + .65, end[2] * 1.4], .045, bark);
        beam(group, end, [end[0] * .8, end[1] + 1.0, end[2] * 1.15], .034, bark);
      }
      for (let i = 0; i < 5; i++) beam(group, [0, .2, 0], [Math.cos(i * 1.25) * .85, .02, Math.sin(i * 1.25) * .85], .11, bark);
      this.addCollider(x, z, .8, .8);
    }
  }
  torch(x: number, z: number, y: number, light = false) {
    mesh(this.staticGroup, cylinder, iron, x, y / 2, z, .10, y, .1);
    mesh(this.staticGroup, cylinder, darkStone, x, .12, z, .38, .24, .38);
    mesh(this.staticGroup, cone, iron, x, y - .08, z, .31, .32, .31).rotation.z = Math.PI;
    const flame = mesh(this.scene, new THREE.IcosahedronGeometry(.22, 1), new THREE.MeshBasicMaterial({ color: 0xffb653 }), x, y + .22, z, 1, 1.7, 1);
    mesh(flame, sphere, new THREE.MeshBasicMaterial({ color: 0xffefd1 }), 0, -.04, 0, .095, .14, .095);
    let lamp: THREE.PointLight | undefined;
    if (light) { lamp = new THREE.PointLight(0xffa246, 7, 7, 1.6); lamp.position.set(x, y + .4, z); this.scene.add(lamp); }
    this.torches.push({ flame, light: lamp, phase: random() * 6 });
  }
  makePortal(x: number, z: number) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.scene.add(group);
    mesh(group, cylinder, darkStone, 0, .12, 0, 1.5, .25, 1.5);
    const ring = mesh(group, new THREE.TorusGeometry(1.18, .12, 8, 48), edgeStone, 0, 1.48, 0); ring.rotation.y = Math.PI / 4;
    const portalMat = new THREE.MeshBasicMaterial({ color: 0x62e3d2, transparent: true, opacity: .65, side: THREE.DoubleSide });
    const portal = mesh(group, new THREE.TorusGeometry(1.01, .035, 5, 64), portalMat, 0, 1.48, 0); portal.rotation.y = Math.PI / 4;
    for (let i = 0; i < 6; i++) {
      const r = mesh(group, new THREE.TorusGeometry(.93 - i * .13, .012, 4, 48), new THREE.MeshBasicMaterial({ color: 0x62cdbd, transparent: true, opacity: .17 + i * .035 }), 0, 1.48, 0);
      r.rotation.y = Math.PI / 4; r.userData.portal = true;
    }
    const lamp = new THREE.PointLight(0x59e9d3, 8, 6); lamp.position.set(0, 1.5, 0); group.add(lamp);
    this.addCollider(x, z, 1.4, 1.4); return group;
  }
  makeShrine(x: number, z: number, id: number) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.userData.id = id; this.scene.add(group);
    for (let i = 0; i < 3; i++) mesh(group, cylinder, i === 1 ? edgeStone : darkStone, 0, .1 + i * .16, 0, 1.5 - i * .25, .17, 1.5 - i * .25);
    mesh(group, cylinder, stone, 0, .8, 0, .5, .75, .5);
    mesh(group, cylinder, gold, 0, 1.19, 0, .64, .1, .64);
    const crystal = mesh(group, new THREE.OctahedronGeometry(.48), new THREE.MeshStandardMaterial({ color: 0xf37863, emissive: 0xcf382c, emissiveIntensity: 1.5, metalness: .4, roughness: .2 }), 0, 1.9, 0, .7, 1.5, .7); crystal.name = 'crystal';
    const ring = mesh(group, new THREE.TorusGeometry(.72, .025, 5, 40), gold, 0, 1.9, 0); ring.rotation.x = Math.PI / 2.7; ring.name = 'halo';
    const light = new THREE.PointLight(0xec614b, 6, 5); light.position.y = 2; light.name = 'light'; group.add(light);
    this.addCollider(x, z, 1.2, 1.2); return group;
  }
  cleanseShrine(id: number) {
    const shrine = this.shrineMeshes[id];
    const crystal = shrine.getObjectByName('crystal') as THREE.Mesh;
    (crystal.material as THREE.MeshStandardMaterial).color.setHex(0x7cffe0); (crystal.material as THREE.MeshStandardMaterial).emissive.setHex(0x39ba99);
    (shrine.getObjectByName('light') as THREE.PointLight).color.setHex(0x70ffda);
  }
  mergeStatic() {
    this.staticGroup.updateMatrixWorld(true);
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    this.staticGroup.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      // Static primitives have different attribute layouts; keep only attributes shared by all.
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      const list = byMaterial.get(object.material) ?? []; list.push(geometry.index ? geometry.toNonIndexed() : geometry); byMaterial.set(object.material, list);
      if (geometry.index) geometry.dispose();
    });
    for (const [material, geometries] of byMaterial) {
      const merged = mergeGeometries(geometries, false);
      if (merged) { const object = new THREE.Mesh(merged, material); object.castShadow = true; object.receiveShadow = true; this.scene.add(object); }
      geometries.forEach(geo => geo.dispose());
    }
    this.scene.remove(this.staticGroup); this.staticGroup.clear();
  }
  update(time: number, dt: number) {
    for (const chest of this.chests) chest.lid.rotation.x = THREE.MathUtils.lerp(chest.lid.rotation.x, chest.opened ? -1.7 : 0, Math.min(1, dt * 9));
    for (const torch of this.torches) {
      torch.flame.scale.y = 1.5 + Math.sin(time * 12 + torch.phase) * .35; torch.flame.rotation.y = time * 2;
      if (torch.light) torch.light.intensity = 6.5 + Math.sin(time * 11 + torch.phase) * 1.2;
    }
    this.shrineMeshes.forEach(shrine => { const indicator = shrine.getObjectByName('indicator'); if (indicator) indicator.scale.setScalar(shrine.userData.complete ? 1 : 1 + Math.sin(time * 2) * .04); });
    this.portal.children.forEach((child, i) => { if (child.userData.portal) { child.rotation.z = time * .15 * (i % 2 ? 1 : -1); child.scale.setScalar(1 + Math.sin(time * 2 + i) * .055); } });
    this.rune.rotation.z = time * .015;
    const positions = this.particles.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) { let y = positions.getY(i) + dt * (!this.isCamp && this.level.act === 4 ? -.7 : .07); if (y > 7) y = 0; if (y < 0) y = 7; positions.setY(i, y); }
    positions.needsUpdate = true;
  }
}

export function animateActor(actor: Actor, time: number, moving: boolean, attacking: number) {
  if (actor.animate) { actor.animate(time, moving, attacking); return; }
  const walk = moving ? Math.sin(time * 10) * .5 : Math.sin(time * 2) * .025;
  actor.leftLeg.rotation.x = walk; actor.rightLeg.rotation.x = -walk;
  actor.leftArm.rotation.x = -walk * .4;
  actor.rightArm.rotation.x = attacking > 0 ? -1.2 + Math.sin((1 - attacking) * Math.PI * 2) * 1.2 : walk * .5;
  actor.rightArm.rotation.z = attacking > 0 ? -.45 : 0;
  const ranged = actor.group.userData.rangedKind;
  if (ranged === 'bow' || ranged === 'crossbow') {
    actor.leftArm.rotation.x = -.35; actor.rightArm.rotation.x = -.15 + (attacking > 0 ? Math.sin(attacking * Math.PI) * .12 : 0); actor.rightArm.rotation.z = 0;
  }
  if (actor.cape) actor.cape.rotation.x = Math.sin(time * 5) * .06 + (moving ? .25 : 0);
}

export function styleCampaignEnemy(actor: Actor, level: Level, boss: boolean, demon: boolean) {
  const color = boss && level.actBoss ? [0x698753, 0x958b64, 0x92bbaa, 0xa74346, 0xb7b494][level.act] : ACTS[level.act].stone;
  const replacements = new Map<THREE.Material, THREE.Material>();
  actor.group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    let material = replacements.get(object.material);
    if (!material) { material = object.material.clone(); (material as THREE.MeshStandardMaterial).color.lerp(new THREE.Color(color), boss ? .75 : .24); replacements.set(object.material, material); }
    object.material = material;
  });
  if (!boss) { actor.group.scale.multiplyScalar(level.act === 2 && demon ? .8 : 1); return; }
  actor.group.scale.setScalar(level.actBoss ? 1.9 : 1.4);
  const hide = mat(color, .15), spikes = mat(0xc6c0a4);
  if (!level.actBoss) { mesh(actor.group, cone, hide, 0, 1.9, 0, .24, .55, .24); return; }
  if (actor.cape) actor.cape.visible = false;
  if (level.act === 0) {
    for (const side of [-1, 1]) for (const height of [.7, 1.15]) {
      beam(actor.group, [side * .2, height, -.2], [side * .95, height + .8, -.6], .08, hide);
      beam(actor.group, [side * .95, height + .8, -.6], [side * 1.1, height + 1, .15], .045, spikes);
    }
  } else if (level.act === 1) {
    mesh(actor.group, sphere, hide, 0, .85, -.35, .7, .7, .9);
    for (const side of [-1, 1]) for (const z of [-.6, -.15, .3]) beam(actor.group, [side * .4, .7, z], [side * 1, .05, z + .2], .12, spikes);
    actor.group.scale.set(2.2, 1.5, 2.1);
  } else if (level.act === 2) {
    actor.leftLeg.visible = actor.rightLeg.visible = false;
    for (const side of [-1, 1]) {
      beam(actor.group, [side * .3, 1.25, 0], [side * 1.1, 1.7, -.2], .08, spikes);
      beam(actor.group, [side * 1.1, 1.7, -.2], [side * 1.35, .7, .3], .04, spikes);
    }
    mesh(actor.group, cone, hide, 0, .5, -.1, .28, 1, .28).rotation.z = Math.PI;
  } else if (level.act === 3) {
    for (let i = 0; i < 5; i++) mesh(actor.group, cone, spikes, 0, .9 + i * .17, -.35, .1, .55, .12).rotation.x = -.8;
    beam(actor.group, [0, .7, -.2], [.6, .25, -1.3], .13, hide);
  } else {
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = side * (.5 + i * .3), z = -.5 + i * .5;
      beam(actor.group, [side * .2, .8, 0], [x, .35, z], .1, hide);
      beam(actor.group, [x, .35, z], [x * 1.3, .06, z + .7], .065, hide);
    }
  }
}

export function makeRing(radius: number, color: number, opacity = .65) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .025, radius, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .07; return ring;
}
export { mesh, sphere, runeMaterial };
