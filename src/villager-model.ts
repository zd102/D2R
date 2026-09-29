import * as THREE from 'three';
import { actorMaterial, mergeActorParts, organicGeometry, plateGeometry } from './actor-modeling.ts';
import { drapedCloth, insetLoftTop, loftGeometry, sculptedBeard, sculptedHead } from './sculpted-surfaces.ts';

export const NPC_MODELS = [
  { id: 'merchant', name: '军需商人', cloth: 0x514c3b, skin: 0xac876a },
  { id: 'captain', name: '雇佣兵队长', cloth: 0x50342c, skin: 0x977156 },
  { id: 'artisan', name: '符文工匠', cloth: 0x62513c, skin: 0xae8562 },
  { id: 'gambler', name: '游商', cloth: 0x3b4540, skin: 0x987858 },
  { id: 'healer', name: '补给修士', cloth: 0x848273, skin: 0xb18f73 },
] as const;
export type NpcRole = typeof NPC_MODELS[number]['id'];

// Static inhabitants share the actor surface vocabulary, but own no combat rig
// or hidden equipment. Clothing and tools make each camp service recognisable.
export function createVillagerModel(role: NpcRole = 'merchant') {
  const design = NPC_MODELS.find(entry => entry.id === role)!;
  const root = new THREE.Group(); root.name = `npc-${role}`;
  const skin = actorMaterial(design.skin, 'skin'), cloth = actorMaterial(design.cloth, 'cloth');
  const leather = actorMaterial(0x493629, 'leather'), dark = actorMaterial(0x24241e, 'leather');
  const bone = actorMaterial(0xbfb69b, 'bone'), steel = actorMaterial(0x777d79, 'steel');
  const brass = actorMaterial(0x92794d, 'bronze'), hair = actorMaterial(role === 'artisan' ? 0x7b7563 : 0x383329, 'fur');
  const sphere = organicGeometry(), box = new THREE.BoxGeometry();
  const part = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const link = (parent: THREE.Object3D, a: number[], b: number[], radius: number, material: THREE.Material) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = part(parent, new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 8), material, 0, 0, 0);
    mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return mesh;
  };
  const plaque = (width: number, height: number) => plateGeometry([[-width / 2, height / 2], [width / 2, height / 2], [width / 2, -height / 2], [-width / 2, -height / 2]], .025, .007);
  const body = new THREE.Group(); root.add(body); body.rotation.x = role === 'merchant' ? .045 : 0;
  part(body, loftGeometry([[.22, .29, .20], [.55, .26, .17], [.84, .19, .13], [1.02, .20, .14], [1.24, .255, .15], [1.36, .135, .09]], 20, .06), cloth, 0, 0, 0);
  part(body, loftGeometry([[0, .062, .055], [.18, .07, .065]], 12), skin, 0, 1.31, 0);
  const head = new THREE.Group(); head.position.set(0, 1.55, .015); head.scale.setScalar(.78); body.add(head);
  part(head, sculptedHead(role === 'artisan' ? 1.09 : .98, role === 'merchant' ? .022 : .008, role === 'healer' ? 'gaunt' : 'veteran'), skin, 0, 0, 0);
  for (const side of [-1, 1]) {
    part(head, sphere, dark, side * .052, .067, .113, .023, .009, .010);
    part(head, sphere, bone, side * .052, .067, .120, .014, .0035, .004);
    part(head, sphere, dark, side * .052, .067, .124, .004, .004, .002);
    part(head, sphere, skin, side * .052, .078, .113, .025, .008, .012);
    part(head, sphere, hair, side * .055, .102, .107, .032, .008, .012).rotation.z = side * .12;
    part(head, sphere, skin, side * .132, .031, -.003, .023, .043, .018);
    const sleeve = part(body, insetLoftTop(loftGeometry([[-.42, .052, .052, .05], [-.24, .070, .07, .025], [-.08, .09, .085], [.03, .075, .073], [.11,.016,.023]], 14, .065),-side*.12,-.015,.11), cloth, side * .265, 1.27, 0); sleeve.rotation.z = side * .10;
    part(body, loftGeometry([[-.07, .032, .027], [0, .049, .034], [.07, .036, .029]], 10), skin, side * .309, .815, .055);
    part(body, loftGeometry([[.018, .058, .14, .08], [.07, .078, .15, .08], [.14, .060, .10, .027], [.23, .052, .064]], 12), leather, side * .13, 0, .015);
    part(body, loftGeometry([[-.04, .056, .055], [.04, .057, .054]], 12), leather, side * .307, .884, .046);
    link(body, [side * .065, 1.34, .080], [side * .20, 1.21, .144], .018, leather);
  }
  part(head, sphere, dark, 0, -.049, .121, .029, .0028, .004);
  part(body, loftGeometry([[-.034, .209, .149], [.034, .211, .151]], 20), leather, 0, .89, 0);
  part(body, plaque(.084, .064), brass, 0, .89, .157);
  part(body, loftGeometry([[-.10, .066, .052], [-.04, .088, .055], [.09, .069, .036]], 12), leather, .225, .77, .08);
  if (role === 'captain') {
    part(body, loftGeometry([[.95, .205, .151], [1.05, .22, .163], [1.24, .267, .172], [1.37, .13, .099]], 16), steel, 0, 0, .009);
    for (const side of [-1, 1]) {
      part(body, plaque(.19, .17), steel, side * .275, 1.26, .058).rotation.z = side * .5;
      link(body, [side * .19, .99, .16], [side * .23, 1.23, .165], .010, brass);
      part(head, plaque(.06, .15), steel, side * .13, -.015, .055).rotation.y = side * .5;
    }
    part(head, loftGeometry([[.105, .149, .135, -.01], [.19, .139, .13, -.02], [.29, .033, .05, -.02]], 16), steel, 0, 0, 0);
    part(head, sculptedBeard(false), hair, 0, -.01, .012, .75, .65, .88);
    link(root, [.43, .05, .15], [.43, 1.9, .15], .024, leather);
    part(root, plateGeometry([[0, .28], [.075, .07], [.035, -.13], [-.035, -.13], [-.075, .07]], .017, .005), steel, .43, 1.91, .15);
  } else if (role === 'artisan') {
    leather.side = THREE.DoubleSide;
    part(body, drapedCloth(.34, .85), leather, 0, .86, .167);
    for (const side of [-1, 1]) link(body, [side * .14, .99, .178], [side * .14, 1.30, .13], .016, leather);
    part(head, sculptedBeard(true), hair, 0, -.01, .01, .83, .9, .85);
    part(head, loftGeometry([[.12, .145, .135, -.02], [.21, .135, .115, -.025], [.25, .06, .06, -.02]], 18, .035), leather, 0, 0, 0);
    for (let i = 0; i < 3; i++) link(body, [.06 + i * .035, .68, .19], [.07 + i * .035, .91, .19], .013, steel);
    link(body, [-.34, .65, .09], [-.34, 1.01, .10], .021, leather);
    part(body, plaque(.17, .08), steel, -.34, 1.04, .10, 1, 1, 2);
  } else if (role === 'healer') {
    cloth.side = THREE.DoubleSide;
    part(body, drapedCloth(.42, .72), cloth, 0, 1.0, -.16);
    part(head, new THREE.SphereGeometry(1, 18, 12, Math.PI * .85, Math.PI * 1.30), cloth, 0, .065, -.02, .18, .26, .16);
    link(body, [-.085, 1.31, .12], [0, 1.10, .18], .006, brass); link(body, [.085, 1.31, .12], [0, 1.10, .18], .006, brass);
    part(body, plaque(.05, .07), brass, 0, 1.10, .184);
    const book = part(body, box, leather, -.31, .86, .19, .13, .18, .065); book.rotation.z = -.15;
    part(book, box, bone, 0, 0, .52, .82, .84, .08);
    part(body, loftGeometry([[0, .034, .034], [.08, .044, .04], [.12, .021, .021], [.17, .020, .020]], 10), brass, .24, .71, .13);
  } else {
    part(head, loftGeometry([[.12, .149, .137, -.016], [.19, .143, .119, -.023], [.26, .066, .072, -.02]], 18, .045), leather, 0, 0, 0);
    if (role === 'gambler') {
      part(head, new THREE.CylinderGeometry(.25, .255, .023, 20), leather, 0, .13, -.006, 1, 1, .83);
      part(head, plateGeometry([[0, -.10], [.04, .04], [.025, .17], [0, .22], [-.025, .06]], .003, .001), cloth, -.14, .26, -.025).rotation.z = -.30;
      for (let i = 0; i < 4; i++) part(body, new THREE.TorusGeometry(.023, .006, 5, 8), brass, -.10 + i * .043, .83 - Math.sin(i) * .025, .165);
    } else {
      leather.side = THREE.DoubleSide;
      part(body, drapedCloth(.43, .60), leather, 0, 1.09, -.16);
      for (let i = 0; i < 5; i++) part(body, sphere, brass, .028, 1.24 - i * .065, .158, .010, .010, .006);
      link(body, [-.17, 1.30, .13], [.21, .83, .17], .019, leather);
    }
  }
  mergeActorParts(root); return root;
}
