import * as THREE from 'three';
import type { Actor } from './world.ts';
import type { MonsterDef } from './bestiary.ts';

export function createMonsterActor(def: MonsterDef, boss = false): Actor {
  const group = new THREE.Group(), rig = new THREE.Group(); group.name = def.id; group.add(rig);
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const limbs: THREE.Group[] = [], tails: THREE.Group[] = [];
  const skin = new THREE.MeshStandardMaterial({ color: def.color, roughness: .8 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc9c5ab, roughness: .75 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ba9a9, metalness: .65, roughness: .38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x282c32, roughness: .9 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color).multiplyScalar(.6), roughness: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: def.race === 'undead' ? 0xa0ece1 : 0xffb35c });
  const sphere = new THREE.SphereGeometry(1, 10, 7), box = new THREE.BoxGeometry(), cone = new THREE.ConeGeometry(1, 1, 7), cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const ball = (p: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material = skin) => part(p, sphere, mat, x, y, z, sx, sy, sz);
  const link = (p: THREE.Object3D, a: number[], b: number[], r: number, mat: THREE.Material = skin) => {
    const start = new THREE.Vector3(...a as [number, number, number]), end = new THREE.Vector3(...b as [number, number, number]);
    const mesh = part(p, cylinder, mat, 0, 0, 0, r, start.distanceTo(end), r);
    mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return mesh;
  };
  const horn = (p: THREE.Object3D, x: number, y: number, z: number, length: number, tilt = 0) => { const m = part(p, cone, bone, x, y, z, .09, length, .09); m.rotation.z = tilt; return m; };
  const eyes = (p: THREE.Object3D, y: number, z: number, spacing = .095) => { for (const side of [-1, 1]) { ball(p, side * spacing, y, z - .018, .073, .049, .027, dark); ball(p, side * spacing, y, z + .012, .026, .016, .017, glow); const brow = part(p, box, skin, side * spacing, y + .045, z, .16, .05, .045); brow.rotation.z = side * .2; } };
  const ribbon = (parent: THREE.Object3D, points: number[][], radius: number, mat = skin, taper = true) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])));
    const geometry = new THREE.TubeGeometry(curve, 16, radius, 6, false);
    if (taper) {
      const vertices = geometry.attributes.position, point = new THREE.Vector3();
      for (let i = 0; i < vertices.count; i++) { const t = Math.floor(i / 7) / 16, center = curve.getPointAt(t); point.fromBufferAttribute(vertices, i).sub(center).multiplyScalar(1 - .97 * t).add(center); vertices.setXYZ(i, point.x, point.y, point.z); }
      geometry.computeVertexNormals();
    }
    const m = new THREE.Mesh(geometry, mat); m.castShadow = true; parent.add(m); return m;
  };
  const model = def.model;
  const insect = ['spider', 'beetle', 'maggot', 'duriel'].includes(model), serpentine = model === 'viper', floating = ['ghost', 'mephisto'].includes(model);
  if (insect) {
    const heavy = model === 'duriel';
    ball(rig, 0, heavy ? .85 : .5, -.35, heavy ? .7 : .48, heavy ? .67 : .36, heavy ? 1 : .7);
    ball(rig, 0, heavy ? 1.05 : .52, .48, .4, heavy ? .55 : .3, .42, model === 'beetle' ? metal : skin);
    if (heavy) {
      for (let i = 0; i < 5; i++) { ball(rig, 0, 1.37 - i * .1, -.15 - i * .25, .58 - i * .04, .14, .2, i % 2 ? cloth : skin); for (const s of [-1, 1]) horn(rig, s * (.42 - i * .035), 1.4 - i * .12, -.15 - i * .25, .3, -s * .55); }
      part(rig, box, dark, 0, .9, .84, .38, .15, .06);
      for (const s of [-1, 1]) horn(rig, s * .15, .87, .9, .3, s * .2).rotation.x = Math.PI;
    }
    if (model === 'beetle') { for (const s of [-1, 1]) ball(rig, s * .23, .71, -.22, .26, .12, .62, cloth); }
    if (model === 'maggot' || heavy) for (let i = 0; i < 5; i++) ball(rig, 0, .55 - i * .065, -.6 - i * .25, .48 - i * .055, .4 - i * .04, .28, i % 2 ? cloth : skin);
    const count = model === 'spider' ? 4 : 3;
    for (const s of [-1, 1]) for (let i = 0; i < count; i++) {
      const limb = new THREE.Group(); limb.position.set(s * .3, heavy ? .6 : .45, .45 - i * .4); rig.add(limb); limbs.push(limb);
      link(limb, [0, 0, 0], [s * .58, .18, -.14], .055, model === 'spider' ? dark : bone);
      link(limb, [s * .58, .18, -.14], [s * .85, -.45, -.3], .04, model === 'spider' ? dark : bone);
    }
    eyes(rig, heavy ? 1.22 : .62, .8, .14);
    for (const s of [-1, 1]) {
      ribbon(rig, [[s * .25, .45, .7], [s * .35, .35, .98], [s * .12, .35, 1.04]], .065, bone);
      if (heavy) { const arm = s < 0 ? leftArm : rightArm; arm.position.set(s * .52, 1.05, .35); rig.add(arm); ribbon(arm, [[0, 0, 0], [s * .42, .38, .4], [s * .58, -.32, 1.0]], .13, bone); }
    }
  } else if (serpentine) {
    const tail = new THREE.Group(); rig.add(tail); tails.push(tail);
    ribbon(tail, [[0, .2, 0], [.65, .18, -.4], [.7, .14, -1], [-.2, .12, -1.25]], .2);
    ball(rig, 0, .7, 0, .27, .65, .3); ball(rig, 0, 1.3, .16, .27, .2, .35); eyes(rig, 1.38, .43, .14);
    for (const s of [-1, 1]) { horn(rig, s * .2, 1.37, -.1, .5, s * .5); link(rig, [s * .2, .8, 0], [s * .65, .6, .6], .09); }
  } else {
    const skeletal = ['skeleton', 'mephisto'].includes(model), bulky = ['mauler', 'frozen', 'venom', 'diablo', 'lord'].includes(model);
    const torso = ball(rig, 0, 1.05, 0, skeletal ? .12 : bulky ? .48 : .28, .4, bulky ? .32 : .22, skeletal ? bone : skin);
    if (model === 'andariel') torso.scale.set(.27, .48, .2);
    if (skeletal) for (let i = 0; i < 5; i++) {
      const rib = part(rig, new THREE.TorusGeometry(.27 - i * .022, .03, 5, 10, Math.PI * 1.7), bone, 0, 1.3 - i * .11, 0, 1, 1, 1); rib.rotation.x = Math.PI / 2;
    }
    ball(rig, 0, 1.61, .01, bulky ? .25 : .2, model === 'baal' ? .31 : .23, .2, skeletal ? bone : skin); eyes(rig, 1.67, .19);
    part(rig, box, dark, 0, 1.49, .2, .19, .035, .04);
    if (skeletal || ['diablo', 'baal', 'venom', 'lord'].includes(model)) {
      ball(rig, 0, 1.47, .16, .16, .1, .16, skeletal ? bone : skin);
      for (const s of [-1, 1]) { part(rig, box, dark, s * .06, 1.52, .27, .035, .04, .03); horn(rig, s * .11, 1.47, .27, .13, s * .15).rotation.x = Math.PI; }
    }
    for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]] as const) {
      leg.position.set(side * (bulky ? .26 : .16), .75, 0); rig.add(leg);
      link(leg, [0, 0, 0], [side * .04, -.34, model === 'goat' ? -.15 : .04], bulky ? .16 : .085, skeletal ? bone : skin);
      link(leg, [side * .04, -.34, 0], [0, -.63, .08], bulky ? .14 : .065, skeletal ? bone : skin);
      part(leg, box, ['diablo', 'andariel', 'venom', 'frozen'].includes(model) ? skin : dark, 0, -.66, .14, bulky ? .3 : .17, .16, .3);
      if (['diablo', 'venom', 'frozen'].includes(model)) for (let i = 0; i < 3; i++) horn(leg, (i - 1) * .085, -.65, .35, .2).rotation.x = Math.PI / 2;
    }
    for (const [arm, side] of [[leftArm, -1], [rightArm, 1]] as const) {
      arm.position.set(side * (bulky ? .49 : .32), 1.28, 0); rig.add(arm);
      ball(arm, 0, 0, 0, bulky ? .23 : .11, .15, .16, skeletal ? bone : skin);
      link(arm, [0, 0, 0], [side * .11, -.45, .17], bulky ? .13 : .075, skeletal ? bone : skin);
      ball(arm, side * .11, -.45, .17, .10, .13, .1, skeletal ? bone : skin);
      if (['andariel', 'diablo', 'baal', 'venom', 'frozen', 'mephisto'].includes(model)) for (let i = 0; i < 3; i++) ribbon(arm, [[side * .1 + i * .065 - .06, -.48, .2], [side * .1 + i * .065 - .06, -.56, .38], [side * .1 + i * .065 - .06, -.67, .47]], .032, bone);
    }
    if (['mage', 'council', 'shaman', 'mummy'].includes(model)) {
      part(rig, cone, cloth, 0, .62, -.02, .46, 1.2, .35);
      part(rig, cone, cloth, 0, 1.77, -.07, .25, .38, .24);
      link(rightArm, [.1, -.6, .3], [.1, .55, .3], .04, dark);
      ball(rightArm, .1, .62, .3, .14, .16, .14, glow);
    }
    if (model === 'mummy') for (let i = 0; i < 7; i++) { const band = part(rig, cylinder, bone, 0, .7 + i * .13, .01, .3, .035, .24); band.rotation.z = i % 2 ? .08 : -.08; }
    if (model === 'archer' || model === 'flayer' || def.attacks.includes('fireArrow')) {
      if (model === 'flayer') { link(leftArm, [0, -.2, .2], [0, -.2, 1.25], .045, dark); part(rig, box, bone, 0, 1.68, .18, .38, .5, .08); eyes(rig, 1.72, .24); }
      else { ribbon(leftArm, [[0, .45, .25], [0, 0, .65], [0, -.55, .25]], .04, bone, false); link(leftArm, [0, .45, .25], [0, -.55, .25], .008, metal); }
    } else if (['skeleton', 'knight', 'lord', 'fallen', 'goat', 'zombie'].includes(model)) {
      for (const arm of model === 'lord' ? [leftArm, rightArm] : [rightArm]) {
        link(arm, [.08, -.4, .2], [.08, -.4, .65], .035, dark);
        if (model === 'lord' || model === 'goat') part(arm, box, metal, .08, -.4, .8, .5, .09, .25);
        else part(arm, box, metal, .08, -.4, .85, .075, .035, .85);
      }
      if (model === 'knight') { ball(rig, 0, 1.08, .02, .38, .39, .28, metal); part(leftArm, box, metal, -.15, -.25, .25, .45, .65, .07); horn(rig, 0, 1.96, 0, .35); }
    } else if (model === 'mauler') { link(rightArm, [.05, -.45, .15], [.05, .5, .15], .075, dark); part(rightArm, box, metal, .05, .6, .15, .55, .35, .35); }
    if (['goat', 'fallen', 'venom', 'lord', 'diablo', 'imp', 'baal'].includes(model)) for (const s of [-1, 1]) horn(rig, s * .23, 1.95, -.07, model === 'baal' ? .85 : .55, -s * .55);
    if (model === 'frozen') for (let i = 0; i < 7; i++) horn(rig, (i - 3) * .13, 1.36, -.26, .4, (i - 3) * -.25);
    if (floating) {
      leftLeg.visible = rightLeg.visible = false;
      const tail = new THREE.Group(); rig.add(tail); tails.push(tail);
      ribbon(tail, [[0, .95, 0], [0, .45, -.3], [.3, .12, -.8], [.1, .1, -1.2]], .13, model === 'ghost' ? skin : bone);
      if (model === 'ghost') { skin.transparent = true; skin.opacity = .7; part(rig, cone, skin, 0, .83, -.1, .4, 1.2, .3).rotation.z = Math.PI; }
    }
    if (['succubus', 'venom', 'mephisto'].includes(model)) for (const side of [-1, 1]) {
      const wing = new THREE.Group(); wing.position.set(side * .25, 1.28, -.18); rig.add(wing); tails.push(wing);
      link(wing, [0, 0, 0], [side * .7, .7, -.2], .065, bone);
      for (let i = 0; i < 3; i++) link(wing, [side * .7, .7, -.2], [side * (1.25 - i * .3), -.35 - i * .1, -.45], .035, bone);
      if (model !== 'mephisto') {
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, side * .7, .7, -.2, side * 1.25, -.35, -.45, 0, 0, 0, side * 1.25, -.35, -.45, side * .65, -.55, -.45], 3)); geo.computeVertexNormals();
        const membrane = cloth.clone(); membrane.side = THREE.DoubleSide; wing.add(new THREE.Mesh(geo, membrane));
      }
    }
    if (model === 'andariel') for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const limb = new THREE.Group(); limb.position.set(s * .25, 1.25 - i * .35, -.13); rig.add(limb); tails.push(limb);
      ribbon(limb, [[0, 0, 0], [s * .75, .8 - i * .35, -.4], [s * 1.0, .4, .4], [s * .8, -.45, .9]], .075, bone);
    }
    if (model === 'andariel') {
      const hair = new THREE.MeshStandardMaterial({ color: 0x872d35, roughness: 1 });
      for (let i = 0; i < 7; i++) ribbon(rig, [[(i - 3) * .05, 1.79, -.08], [(i - 3) * .1, 1.7, -.3], [(i - 3) * .1, 1.1, -.38]], .07, hair);
      ball(rig, 0, .74, 0, .27, .14, .23, cloth); part(rig, box, cloth, 0, 1.25, .2, .44, .13, .07);
    }
    if (model === 'diablo') {
      for (const s of [-1, 1]) {
        ball(rig, s * .2, 1.19, .26, .23, .18, .1, cloth);
        for (let i = 0; i < 3; i++) horn(rig, s * (.4 + i * .08), 1.5 - i * .1, -.04, .5 - i * .08, -s * .8);
        ribbon(rig, [[s * .18, 1.79, -.06], [s * .45, 1.94, -.16], [s * .55, 2.06, .03]], .1, bone);
      }
      for (let i = 0; i < 3; i++) ball(rig, 0, 1.04 - i * .11, .3 - i * .035, .15 - i * .025, .08, .07, cloth);
      for (let i = 0; i < 6; i++) horn(rig, 0, 1.6 - i * .16, -.22 - i * .06, .65 - i * .06, 0).rotation.x = -.8;
      const tail = new THREE.Group(); rig.add(tail); tails.push(tail); ribbon(tail, [[0, .7, -.2], [0, .4, -.9], [.5, .15, -1.5], [.8, .2, -1.8]], .15);
    }
    if (model === 'baal') {
      leftLeg.visible = rightLeg.visible = false;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) ribbon(rig, [[s * .12, 1.8, -.03], [s * (.3 + i * .15), 2.08 + i * .04, -.14], [s * (.4 + i * .2), 1.85 - i * .1, .02]], .06, bone);
        ball(rig, s * .24, 1.22, 0, .16, .3, .25, cloth);
      }
      for (let i = 0; i < 4; i++) part(rig, box, bone, 0, .8 + i * .15, .21, .3 - i * .025, .045, .07);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const tentacle = new THREE.Group(); tentacle.position.set(s * .15, .6, 0); rig.add(tentacle); tails.push(tentacle);
        ribbon(tentacle, [[0, 0, 0], [s * .5, -.15, .6 - i * .5], [s * .85, -.45, .85 - i * .8], [s * 1.15, -.48, .65 - i * .8]], .1);
      }
    }
  }
  if (boss) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.1), glow); gem.position.set(0, insect ? 1.12 : 1.22, insect ? .4 : .28); rig.add(gem);
  }
  group.scale.setScalar(def.scale);
  group.userData.bodyPlan = model;
  const actor: Actor = { group, leftLeg, rightLeg, leftArm, rightArm, kind: def.id, animate(time, moving, attacking) {
    const heavy=['mauler','frozen','duriel'].includes(model),cadence=model==='zombie'?4.7:heavy?6.5:insect?14:9;
    const walk = moving ? Math.sin(time * cadence) : 0;
    const release=Number(group.userData.release??0),flash=Number(group.userData.hitFlash??0);
    skin.emissive.setRGB(flash*.24,flash*.13,flash*.06);metal.emissive.setRGB(flash*.12,flash*.12,flash*.10);
    rig.position.y = floating ? .18 + Math.sin(time * 2) * .12 : moving ? Math.abs(walk) * .035 : Math.sin(time * 2) * .012;
    rig.position.z=release*(heavy?.14:.09);rig.rotation.x=moving?(model==='zombie'?.13:heavy?.07:.025):release*.065;
    rig.rotation.y=moving&&!insect?walk*(heavy?.045:.025):0;
    leftLeg.rotation.x = walk * .45; rightLeg.rotation.x = -walk * .45;
    leftArm.rotation.x = attacking ? -Math.sin(attacking * Math.PI) * 1.3 : -walk * .25;
    rightArm.rotation.x = attacking ? -Math.sin(attacking * Math.PI) * 1.8 : walk * .25;
    limbs.forEach((limb, i) => { limb.rotation.z = moving ? Math.sin(time * 13 + i * Math.PI / 2) * .15 : 0; limb.rotation.y = Math.sin(time * (moving ? 11 : 2) + i) * (moving ? .2 : .025); });
    tails.forEach((tail, i) => { tail.rotation.y = Math.sin(time * 3 + i) * .12; tail.rotation.x = attacking * Math.sin(time * 8 + i) * .12; });
    if (model === 'zombie') { leftArm.rotation.x -= .7; rightArm.rotation.x -= .7; }
    if (['archer', 'flayer'].includes(model) && attacking) {leftArm.rotation.x=-1.15;rightArm.rotation.x=-.8;rightArm.rotation.y=-.3*attacking;rig.rotation.y=.2;}
    else rightArm.rotation.y=0;
    if (['shaman','mage','council','mummy','mephisto','baal'].includes(model)&&attacking) {
      leftArm.rotation.x=-.6-attacking*.5;rightArm.rotation.x=-.35-attacking*.7;leftArm.rotation.z=-.25*attacking;rightArm.rotation.z=.2*attacking;
    } else {leftArm.rotation.z=0;rightArm.rotation.z=0;}
    if(heavy&&attacking){rightArm.rotation.x=-2*attacking;leftArm.rotation.x=-.9*attacking;rig.rotation.x=-.09*attacking;}
    if(release>0){rightArm.rotation.x-=release*.5;rig.rotation.y+=(['knight','lord','goat'].includes(model)?-.25:.08)*release;}
  } };
  return actor;
}
