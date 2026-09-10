import * as THREE from 'three';
import type { Actor } from './world.ts';
import type { MonsterDef } from './bestiary.ts';
import { actorMaterial, contourGeometry, mergeActorParts, plateGeometry } from './actor-modeling.ts';

export function createMonsterActor(def: MonsterDef, boss = false): Actor {
  const group = new THREE.Group(), rig = new THREE.Group(); group.name = def.id; group.add(rig);
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const limbs: THREE.Group[] = [], tails: THREE.Group[] = [], knees: THREE.Group[] = [], elbows: THREE.Group[] = [];
  const skin = actorMaterial(new THREE.Color(def.color).lerp(new THREE.Color(0x75634f), .12), 'hide');
  const bone = actorMaterial(new THREE.Color(0xb9ad8b).lerp(new THREE.Color(def.color), def.race === 'undead' ? .25 : .08), 'bone');
  const metal = actorMaterial(0x727b7b, 'steel'), brass = actorMaterial(0x917342, 'bronze');
  const dark = actorMaterial(0x24201d, 'leather');
  const cloth = actorMaterial(new THREE.Color(def.color).multiplyScalar(.42), 'cloth');
  const glow = new THREE.MeshBasicMaterial({ color: def.race === 'undead' ? 0x9abdb0 : 0xdb8739 });
  const sphere = new THREE.SphereGeometry(1, 14, 10), box = new THREE.BoxGeometry(), cone = new THREE.ConeGeometry(1, 1, 9), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const ball = (p: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material = skin) => part(p, sphere, mat, x, y, z, sx, sy, sz);
  const link = (p: THREE.Object3D, a: number[], b: number[], r: number, mat: THREE.Material = skin) => {
    const start = new THREE.Vector3(...a as [number, number, number]), end = new THREE.Vector3(...b as [number, number, number]);
    const length = start.distanceTo(end);
    const geometry = mat === skin ? contourGeometry([[-.5,r*.65,r*.7],[-.35,r*.85,r*.85],[0,r*1.18,r],[.3,r*.96,r*.88],[.5,r*.72,r*.7]],10)
      : mat === bone ? contourGeometry([[-.5,r*1.12,r],[-.38,r*.7,r*.75],[0,r*.56,r*.62],[.38,r*.7,r*.75],[.5,r*1.12,r]],8) : cylinder;
    const mesh = part(p, geometry, mat, 0, 0, 0, mat === skin || mat === bone ? 1 : r, length, mat === skin || mat === bone ? 1 : r);
    mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()); return mesh;
  };
  const horn = (p: THREE.Object3D, x: number, y: number, z: number, length: number, tilt = 0) => {
    const mesh = ribbon(p, [[0,-length*.5,0],[0,-length*.1,0],[.025,length*.24,-length*.08],[.015,length*.5,-length*.23]], Math.min(.09,length*.22), bone);
    mesh.position.set(x,y,z); mesh.rotation.z=tilt; return mesh;
  };
  const eyes = (p: THREE.Object3D, y: number, z: number, spacing = .095) => { for (const side of [-1, 1]) { ball(p, side * spacing, y, z - .018, .060, .036, .027, dark); ball(p, side * spacing, y, z + .012, .017, .010, .012, glow); const brow = part(p, box, skin, side * spacing, y + .035, z, .125, .032, .038); brow.rotation.z = side * .22; } };
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
  if(['diablo','venom','lord'].includes(model)){skin.color.lerp(new THREE.Color(0x55382c),.24);bone.color.lerp(skin.color,.55);}
  const plate = (p: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, width: number, height: number) =>
    part(p, plateGeometry([[-.45,.45],[.30,.5],[.50,.2],[.38,-.32],[0,-.52],[-.43,-.28]], .04, .012), mat, x,y,z,width,height,1);
  const robe = (p: THREE.Object3D, y: number, height: number, radius: number, mat = cloth) => {
    const geo = contourGeometry([[-height*.5,radius,radius*.75],[-height*.27,radius*.85,radius*.66],[height*.28,radius*.55,radius*.46],[height*.5,radius*.56,radius*.47]],24,.055);
    const positions=geo.attributes.position;
    for(let i=0;i<25;i++)positions.setY(i,positions.getY(i)+(.5+.5*Math.sin(i*2.7))*.10);
    geo.computeVertexNormals(); return part(p,geo,mat,0,y,-.025,1,1,1);
  };
  const fur = (p: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, mat = dark) => {
    for(let i=0;i<7;i++){const m=part(p,cone,mat,x+(i-3)*width/7,y-Math.abs(i-3)*.018,z+Math.sin(i*2)*.025,width/6,height*(.75+(i%3)*.12),.065);m.rotation.z=Math.PI+(i-3)*.10;}
  };
  const skull = (p: THREE.Object3D, x: number, y: number, z: number, scale=1) => {
    const h=new THREE.Group();h.position.set(x,y,z);h.scale.setScalar(scale);p.add(h);
    part(h,contourGeometry([[-.16,.095,.075,.035],[-.065,.135,.10,.025],[.025,.165,.13],[.15,.145,.12,-.02],[.205,.075,.075,-.02]],12),bone,0,0,0,1,1,1);
    for(const s of [-1,1]){ball(h,s*.071,.02,.114,.054,.044,.022,dark);ball(h,s*.071,.02,.137,.012,.009,.009,glow);link(h,[s*.105,-.035,.1],[s*.06,-.10,.13],.024,bone);}
    part(h,cone,dark,0,-.038,.131,.024,.056,.018).rotation.z=Math.PI;
    part(h,box,dark,0,-.109,.113,.133,.035,.025);
    for(let i=0;i<6;i++)part(h,box,bone,(i-2.5)*.022,-.098,.135,.016,.029,.017);
    return h;
  };
  const insect = ['spider', 'beetle', 'maggot', 'duriel'].includes(model), serpentine = model === 'viper', floating = ['ghost', 'mephisto'].includes(model);
  if (model === 'cow') {
    part(rig,contourGeometry([[.67,.26,.23],[.9,.38,.29],[1.22,.47,.28],[1.49,.38,.23],[1.60,.24,.20]]),skin,0,0,0,1,1,1);
    ball(rig,0,1.75,.08,.25,.32,.23);ball(rig,0,1.61,.32,.26,.16,.21,bone);
    eyes(rig,1.82,.25,.13);
    for(const s of [-1,1]){ball(rig,s*.115,1.65,.513,.043,.03,.015,dark);ribbon(rig,[[s*.18,1.94,0],[s*.42,2.02,-.02],[s*.53,2.28,.02]],.09,bone);ball(rig,s*.30,1.85,.01,.16,.065,.10);}
    robe(rig,.79,.35,.34,dark);fur(rig,0,1.48,-.22,.72,.28);
    for (const side of [-1, 1]) {
      const leg = side < 0 ? leftLeg : rightLeg;
      leg.position.set(side*.23,.77,0);rig.add(leg);link(leg,[0,0,0],[side*.03,-.35,-.10],.13);
      const knee=new THREE.Group();knee.position.set(side*.03,-.35,-.10);leg.add(knee);knees.push(knee);link(knee,[0,0,0],[0,-.30,.10],.085);
      for(const toe of [-1,1])part(knee,contourGeometry([[-.405,.05,.13,.03],[-.34,.058,.12,.025],[-.25,.042,.075]]),dark,toe*.06,0,.14,1,1,1);
      const arm=side<0?leftArm:rightArm;arm.position.set(side*.45,1.38,0);rig.add(arm);
      link(arm,[0,0,0],[side*.05,-.32,.08],.14);link(arm,[side*.05,-.32,.08],[side*.02,-.52,.25],.11);ball(arm,side*.02,-.52,.25,.095,.10,.08,dark);
      ball(rig,side*.26,1.14,.235,.16,.22,.045,bone);
    }
    const tail=new THREE.Group();rig.add(tail);tails.push(tail);ribbon(tail,[[0,.84,-.22],[.35,.55,-.40],[.52,.34,-.30]],.035);fur(tail,.52,.32,-.30,.10,.16);
    const polearm=new THREE.Group();polearm.name='monster-polearm';rightArm.add(polearm);polearm.position.set(.03,-.50,.27);polearm.rotation.x=.25;
    link(polearm,[0,-.77,0],[0,1.36,0],.032,dark);horn(polearm,0,1.50,0,.28);
    part(polearm,plateGeometry([[0,.08],[.28,.23],[.35,.06],[.34,-.18],[.15,-.29],[0,-.16]],.035,.008),metal,0,1.12,0,1,1,1);
  } else if (insect) {
    const heavy = model === 'duriel';
    ball(rig, 0, heavy ? .85 : .5, -.35, heavy ? .66 : .48, heavy ? .64 : .34, heavy ? .95 : .67);
    part(rig,contourGeometry([[heavy?.57:.25,.23,.25],[heavy?.92:.46,.40,.39],[heavy?1.37:.68,.32,.27],[heavy?1.58:.76,.16,.15]],14),model==='beetle'?metal:skin,0,0,.43,1,1,1);
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
      const knee=new THREE.Group();knee.position.set(s*.58,.18,-.14);limb.add(knee);knees.push(knee);
      link(knee,[0,0,0],[s*.27,-.63,-.16],.04,model==='spider'?dark:bone);
      ball(limb,s*.58,.18,-.14,.067,.063,.065,model==='spider'?dark:skin);
    }
    eyes(rig, heavy ? 1.22 : .62, .8, .14);
    for (const s of [-1, 1]) {
      ribbon(rig, [[s * .25, .45, .7], [s * .35, .35, .98], [s * .12, .35, 1.04]], .065, bone);
      if (heavy) { const arm = s < 0 ? leftArm : rightArm; arm.position.set(s * .52, 1.05, .35); rig.add(arm); ribbon(arm, [[0, 0, 0], [s * .42, .38, .4], [s * .58, -.32, 1.0]], .13, bone); }
    }
    if(model==='spider'){
      for(const s of [-1,1])for(let i=0;i<3;i++)ball(rig,s*(.07+i*.064),.76-i*.023,.71,.025,.022,.022,glow);
      for(let i=0;i<5;i++){const band=plate(rig,cloth,0,.83-i*.015,-.13-i*.15,.30-i*.035,.16);band.rotation.x=-Math.PI/2;}
      for(const s of [-1,1])fur(rig,s*.36,.61,-.26,.19,.12,skin);
    }
    if(model==='beetle'){
      link(rig,[0,.84,.32],[0,.83,-.73],.018,brass);
      for(const s of [-1,1])for(let i=0;i<5;i++)ribbon(rig,[[s*.035,.845,-.55+i*.17],[s*.27,.83,-.53+i*.17],[s*.46,.65,-.48+i*.17]],.011,brass,false);
      ribbon(rig,[[0,.66,.69],[0,1.05,.89],[0,1.12,1.06]],.073,bone);
    }
    if(model==='maggot'){
      for(let i=0;i<7;i++){const ring=part(rig,new THREE.TorusGeometry(.37-i*.025,.025,5,16),cloth,0,.46-i*.045,-.27-i*.20,1,.82,1);ring.rotation.x=.18;}
      part(rig,box,dark,0,.39,.84,.33,.16,.04);
      for(const s of [-1,1])for(let i=0;i<3;i++)horn(rig,s*(.06+i*.065),.40,.89,.11+i*.02,s*.5).rotation.x=Math.PI/2;
    }
    if(heavy){
      horn(rig,0,1.61,.40,.47).rotation.x=.30;
      for(const s of [-1,1])for(let i=0;i<3;i++)plate(rig,cloth,s*.28,1.04-i*.16,.77,.32,.18);
      fur(rig,0,.77,.73,.4,.18,bone);
    }
  } else if (serpentine) {
    const tail = new THREE.Group(); rig.add(tail); tails.push(tail);
    ribbon(tail, [[0, .2, 0], [.65, .18, -.4], [.7, .14, -1], [-.2, .12, -1.25]], .2);
    part(rig,contourGeometry([[.16,.23,.22],[.40,.24,.24],[.72,.22,.19],[1.0,.29,.18],[1.24,.17,.16,.04]]),skin,0,0,0,1,1,1);
    ball(rig, 0, 1.3, .16, .24, .18, .31); eyes(rig, 1.38, .43, .14);
    for (const s of [-1, 1]) { horn(rig, s * .2, 1.37, -.1, .5, s * .5); link(rig, [s * .2, .8, 0], [s * .65, .6, .6], .09); }
    for(let i=0;i<8;i++)plate(rig,bone,0,.34+i*.115,.235-Math.sin(i*.48)*.06,.25+Math.sin(i*.5)*.04,.095);
    for(const s of [-1,1]){const hood=plate(rig,cloth,s*.28,1.13,-.06,.35,.52);hood.rotation.y=s*.4;horn(rig,s*.13,1.21,.44,.19).rotation.x=Math.PI;for(let i=0;i<3;i++)ribbon(rig,[[s*.64,.60,.58],[s*(.67+i*.04),.58,.75],[s*(.64+i*.06),.46,.84]],.023,bone);}
  } else {
    const skeletal = ['skeleton', 'mephisto', 'mage', 'ghost'].includes(model), bulky = ['mauler', 'frozen', 'venom', 'diablo', 'lord'].includes(model);
    const feminine=['archer','succubus','andariel'].includes(model), waist=bulky?.25:feminine?.15:.17, shoulder=bulky?.43:feminine?.225:.265;
    part(rig,contourGeometry([[.70,waist*1.1,waist*.8],[.86,waist,.15],[1.05,shoulder*.78,bulky?.28:.17],[1.26,shoulder,bulky?.28:.16],[1.40,shoulder*.62,.12]]),skeletal?bone:skin,0,0,0,skeletal?.28:1,1,skeletal?.55:1);
    if (skeletal) for (let i = 0; i < 5; i++) {
      for(const s of [-1,1])ribbon(rig,[[0,1.34-i*.095,-.08],[s*(.25-i*.018),1.29-i*.095,-.015],[s*(.22-i*.018),1.25-i*.09,.12],[s*.025,1.26-i*.09,.17]],.021,bone,false);
    }
    const head=new THREE.Group();head.name='monster-head';rig.add(head);head.position.set(0,1.58,model==='zombie'||model==='mauler'?.13:.01);
    if(skeletal)skull(head,0,0,0,model==='mephisto'?1.20:1);
    else {
      part(head,contourGeometry([[-.17,.085,.083,.05],[-.095,.13,.12,.015],[.025,bulky?.195:.145,bulky?.17:.125],[.13,bulky?.18:.13,.12,-.02],[.215,.08,.08,-.025]],14),skin,0,0,0,1,model==='baal'?1.23:1,1);
      eyes(head,.065,bulky?.17:.13,feminine?.060:.078);
      ball(head,0,-.005,.15,.028,.057,.036);part(head,box,dark,0,-.10,.14,.105,.020,.018);
    }
    if (['diablo', 'baal', 'venom', 'lord'].includes(model)) {
      ball(rig, 0, 1.47, .16, .16, .1, .16, skeletal ? bone : skin);
      for (const s of [-1, 1]) { part(rig, box, dark, s * .06, 1.52, .27, .035, .04, .03); horn(rig, s * .11, 1.47, .27, .13, s * .15).rotation.x = Math.PI; }
    }
    for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]] as const) {
      leg.position.set(side * (bulky ? .26 : .16), .75, 0); rig.add(leg);
      const hock=['goat','lord','diablo','venom'].includes(model),knee=new THREE.Group();
      knee.position.set(side*.04,-.34,hock?-.13:.035);leg.add(knee);knees.push(knee);
      link(leg,[0,0,0],knee.position.toArray(),bulky?.16:feminine?.095:.085,skeletal?bone:skin);
      link(knee,[0,0,0],[-side*.04,-.29,hock?.20:.045],bulky?.11:.055,skeletal?bone:skin);
      const footMat=['diablo','andariel','venom','frozen'].includes(model)?skin:skeletal?bone:dark;
      if(hock&&model!=='diablo'&&model!=='venom')for(const toe of [-1,1])part(knee,contourGeometry([[-.385,.038,.10,.03],[-.33,.041,.095,.02],[-.25,.028,.06]]),dark,toe*.043,0,.20,1,1,1);
      else part(knee,contourGeometry([[-.385,bulky?.12:.067,.145,.04],[-.35,bulky?.125:.070,.14,.04],[-.30,bulky?.09:.052,.10,.015],[-.24,bulky?.065:.04,.06]]),footMat,0,0,hock?.22:.07,1,1,1);
      if (['diablo', 'venom', 'frozen'].includes(model)) for (let i = 0; i < 3; i++) horn(knee, (i - 1) * .075, -.30, hock?.43:.29, .16).rotation.x = Math.PI / 2;
    }
    const grips: THREE.Group[] = [];
    for (const [arm, side] of [[leftArm, -1], [rightArm, 1]] as const) {
      arm.position.set(side * (bulky ? .49 : .32), 1.28, 0); rig.add(arm);
      ball(arm, 0, -.015, 0, skeletal?.047:bulky?.16:.082, skeletal?.06:.11, skeletal?.053:bulky?.14:.083, skeletal ? bone : skin);
      link(arm,[0,0,0],[side*.05,-.24,.035],bulky?.14:.065,skeletal?bone:skin);
      const elbow=new THREE.Group();elbow.position.set(side*.05,-.24,.035);arm.add(elbow);elbows.push(elbow);
      const grip=new THREE.Group();grip.name=side<0?'monster-left-grip':'monster-right-grip';elbow.add(grip);grip.position.copy(elbow.position).negate();grips.push(grip);
      link(elbow,[0,0,0],[side*.055,-.22,.13],bulky?.115:.055,skeletal?bone:skin);
      ball(elbow,side*.055,-.23,.13,bulky?.09:.062,.085,.065,skeletal?bone:skin);
      for(let i=0;i<3;i++)link(elbow,[side*.055+(i-1)*.025,-.24,.16],[side*.055+(i-1)*.026,-.29,.20],.012,skeletal?bone:skin);
      if (['andariel', 'diablo', 'baal', 'venom', 'frozen', 'mephisto'].includes(model)) for (let i = 0; i < 3; i++) ribbon(grip, [[side * .1 + i * .065 - .06, -.48, .2], [side * .1 + i * .065 - .06, -.56, .38], [side * .1 + i * .065 - .06, -.67, .47]], .032, bone);
    }
    const [leftGrip,rightGrip]=grips;
    if (['mage', 'council', 'shaman', 'mummy'].includes(model)) {
      robe(rig,.57,1.03,model==='mummy'?.34:.40);
      if(model==='mage'||model==='council'){
        const hood=part(head,new THREE.SphereGeometry(1,14,10,Math.PI*.42,Math.PI*1.16),cloth,0,.035,-.018,.205,.29,.20);hood.rotation.y=Math.PI;
        for(const s of [-1,1])link(head,[s*.16,-.19,.07],[s*.14,.17,.085],.028,dark);
      }
      link(rightGrip, [.1, -.6, .3], [.1, .55, .3], .04, dark);
      skull(rightGrip,.1,.65,.3,.48);for(const s of [-1,1])horn(rightGrip,.1+s*.07,.79,.3,.19,-s*.4);
    }
    if (model === 'mummy') for (let i = 0; i < 7; i++) { const band = part(rig, cylinder, bone, 0, .7 + i * .13, .01, .3, .035, .24); band.rotation.z = i % 2 ? .08 : -.08; }
    if (model === 'archer' || model === 'flayer' || def.attacks.includes('fireArrow')) {
      if (model === 'flayer') { link(leftGrip, [0, -.2, .2], [0, -.2, 1.25], .027, dark);plate(rig,bone,0,1.67,.18,.39,.56);eyes(rig,1.72,.25);for(const s of [-1,1])plate(rig,cloth,s*.12,1.55,.25,.075,.16);}
      else { ribbon(leftGrip, [[0, .45, .25], [0, 0, .65], [0, -.55, .25]], .025, dark, false); link(leftGrip, [0, .45, .25], [0, -.55, .25], .005, bone); }
    } else if (['skeleton', 'knight', 'lord', 'fallen', 'goat', 'zombie'].includes(model)) {
      for (const arm of model === 'lord' ? [leftGrip, rightGrip] : [rightGrip]) {
        link(arm, [.08, -.4, .2], [.08, -.4, .65], .035, dark);
        if (model === 'lord' || model === 'goat') {const axe=part(arm,plateGeometry([[-.03,-.13],[.19,-.25],[.31,-.16],[.30,.14],[.12,.22],[-.03,.11]],.028,.008),metal,.08,-.4,.8,1,1,1);axe.rotation.x=Math.PI/2;}
        else {const blade=part(arm,plateGeometry([[-.037,-.4],[.037,-.4],[.032,.28],[0,.46],[-.032,.28]],.018,.004),metal,.08,-.4,.87,1,1,1);blade.rotation.x=Math.PI/2;link(arm,[-.045,-.4,.50],[.205,-.4,.50],.016,brass);}
      }
      if (model === 'knight') {
        part(rig,contourGeometry([[.84,.21,.15],[1.03,.27,.20],[1.27,.32,.19],[1.39,.20,.12]]),metal,0,0,.015,1,1,1);
        plate(leftGrip,metal,-.15,-.25,.25,.48,.68);plate(leftGrip,cloth,-.15,-.24,.30,.37,.54);link(leftGrip,[-.15,-.02,.34],[-.15,-.43,.34],.015,brass);
        part(head,contourGeometry([[-.14,.14,.14],[.07,.17,.16],[.22,.13,.13],[.30,.03,.04]],10),metal,0,0,-.01,1,1,1);part(head,box,dark,0,.02,.157,.23,.029,.02);
        for(const s of [-1,1])plate(s<0?leftArm:rightArm,metal,s*.03,.02,.03,.30,.29);
        horn(head,0,.38,-.05,.23);
      }
    } else if (model === 'mauler') { link(rightGrip, [.05, -.45, .15], [.05, .5, .15], .055, dark);part(rightGrip,plateGeometry([[-.26,-.12],[-.22,.17],[.24,.15],[.28,-.14]],.27,.025),metal,.05,.6,.01,1,1,1);for(const s of [-1,1])link(rightGrip,[s*.14,.45,.16],[s*.14,.75,.16],.036,dark); }
    if (['venom', 'baal'].includes(model)) for (const s of [-1, 1]) horn(head,s*.14,.31,-.065,model==='baal'?.52:.42,-s*.55);
    if (model === 'frozen') for (let i = 0; i < 7; i++) horn(rig, (i - 3) * .13, 1.36, -.26, .4, (i - 3) * -.25);
    if (floating) {
      leftLeg.visible = rightLeg.visible = false;
      const tail = new THREE.Group(); rig.add(tail); tails.push(tail);
      ribbon(tail, [[0, .95, 0], [0, .45, -.3], [.3, .12, -.8], [.1, .1, -1.2]], .13, model === 'ghost' ? skin : bone);
      if (model === 'ghost') { skin.transparent=true;skin.opacity=.42;skin.depthWrite=false;robe(rig,.86,1.13,.32,skin);for(const s of [-1,1])ribbon(tail,[[s*.20,1.0,-.08],[s*.32,.58,-.16],[s*.36,.23,-.60],[s*.20,.16,-.95]],.065,cloth); }
    }
    if (['succubus', 'venom', 'mephisto'].includes(model)) for (const side of [-1, 1]) {
      const wing = new THREE.Group(); wing.position.set(side * .25, 1.28, -.18); rig.add(wing); tails.push(wing);
      link(wing, [0, 0, 0], [side * .7, .7, -.2], .065, bone);
      for (let i = 0; i < 3; i++) link(wing, [side * .7, .7, -.2], [side * (1.25 - i * .3), -.35 - i * .1, -.45], .035, bone);
      if (model !== 'mephisto') {
        const positions:number[]=[],uvs:number[]=[];
        for(let i=0;i<3;i++){const a=[side*(1.25-i*.3),-.35-i*.1,-.45],b=i===2?[0,0,0]:[side*(.95-i*.3),-.45-i*.1,-.45],mid=[(a[0]+b[0])*.5,(a[1]+b[1])*.5+.16,-.36],tip=[side*.7,.7,-.2];for(const end of [[a,mid],[mid,b]]){positions.push(...tip,...end[0],...end[1]);uvs.push(.5,1,0,0,1,0);}}
        const geo=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.computeVertexNormals();
        const membrane=actorMaterial(new THREE.Color(def.color).multiplyScalar(.38),'leather');membrane.side=THREE.DoubleSide;const mesh=new THREE.Mesh(geo,membrane);mesh.castShadow=true;wing.add(mesh);
      }
    }
    if (model === 'andariel') for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const limb = new THREE.Group(); limb.position.set(s * .25, 1.25 - i * .35, -.13); rig.add(limb); tails.push(limb);
      ribbon(limb, [[0, 0, 0], [s * .75, .8 - i * .35, -.4], [s * 1.0, .4, .4], [s * .8, -.45, .9]], .075, bone);
    }
    if (model === 'andariel') {
      const hair = actorMaterial(0x662b21, 'leather');
      for (let i = 0; i < 7; i++) ribbon(rig, [[(i - 3) * .05, 1.79, -.08], [(i - 3) * .1, 1.7, -.3], [(i - 3) * .1, 1.1, -.38]], .07, hair);
      ball(rig, 0, .74, 0, .27, .14, .23, cloth); part(rig, box, cloth, 0, 1.25, .2, .44, .13, .07);
    }
    if (model === 'diablo') {
      for (const s of [-1, 1]) {
        const pectoral=part(rig,contourGeometry([[-.14,.12,.025],[0,.22,.055],[.11,.17,.035]],12),skin,s*.19,1.22,.25,1,1,1);pectoral.rotation.z=-s*.15;
        for (let i = 0; i < 3; i++) horn(rig, s * (.4 + i * .08), 1.5 - i * .1, -.04, .5 - i * .08, -s * .8);
        ribbon(head,[[s*.12,.14,-.04],[s*.28,.29,-.12],[s*.40,.41,-.28],[s*.45,.48,-.16]],.075,bone);
        ribbon(head,[[s*.10,.17,-.09],[s*.17,.47,-.16],[s*.14,.59,-.27]],.065,bone);
      }
      for(let i=0;i<3;i++)for(const s of [-1,1])plate(rig,skin,s*.07,1.06-i*.10,.275-i*.028,.135-i*.016,.12);
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
    // Distinct silhouettes for every body plan, including the small Act I enemies.
    if(['fallen','shaman','imp'].includes(model)){
      for(const s of [-1,1]){
        const ear=plate(head,skin,s*.20,.015,-.015,.22,.12);ear.rotation.z=s*.35;
        horn(head,s*.14,.24,-.06,model==='shaman'?.43:.28,-s*.50);
        horn(head,s*.067,-.075,.14,.09,s*.16).rotation.x=Math.PI;
      }
      robe(rig,.73,.33,.25,dark);fur(head,0,-.17,.06,.14,.16,cloth);
      link(rig,[-.23,1.34,-.05],[.18,.84,.16],.027,dark);
      if(model==='fallen'){
        const buckler=part(leftGrip,new THREE.CylinderGeometry(.20,.20,.045,10),dark,-.035,-.29,.25,1,1,1);buckler.rotation.x=Math.PI/2;
        ball(leftGrip,-.035,-.29,.285,.066,.066,.04,metal);
      }
      if(model==='shaman'){
        for(let i=0;i<5;i++)skull(rig,(i-2)*.077,1.21-Math.abs(i-2)*.043,.19,.23);
        fur(head,0,.23,-.065,.28,.17,dark);
      }
      if(model==='imp'){
        const tail=new THREE.Group();rig.add(tail);tails.push(tail);ribbon(tail,[[0,.8,-.1],[.3,.5,-.4],[.46,.60,-.68]],.04);
        leftArm.position.y-=.05;rightArm.position.y-=.05;rig.scale.set(1.10,.91,1);
      }
    }
    if(model==='zombie'){
      robe(rig,.67,.50,.25);fur(head,-.03,.18,-.03,.23,.10,dark);
      for(let i=0;i<4;i++)link(rig,[-.02,1.29-i*.085,.17],[-.19,1.25-i*.085,.145],.015,bone);
      plate(rig,dark,.14,1.09,.163,.13,.29);plate(rig,bone,.14,1.09,.177,.07,.18);
      leftArm.position.y-=.10;leftArm.scale.y=1.08;rightLeg.scale.set(.92,1,.90);
      head.rotation.z=.12;skull(rig,-.22,.82,.03,.22);
    }
    if(model==='skeleton'||model==='mephisto'){
      for(const s of [-1,1]){
        link(rig,[0,1.35,.02],[s*.27,1.33,.01],.025,bone);
        const pelvis=part(rig,new THREE.TorusGeometry(.09,.023,5,10,Math.PI*1.65),bone,s*.09,.77,.035,1,1,.55);pelvis.rotation.z=-s*.25;
      }
      for(let i=0;i<6;i++)ball(rig,0,.89+i*.078,-.065,.055,.035,.04,bone);
      if(model==='skeleton'){
        plate(leftGrip,metal,-.04,-.27,.24,.32,.45);plate(rig,cloth,.10,.73,.07,.19,.35);
        for(const knee of knees)for(let i=0;i<3;i++)link(knee,[-.026,-.29,.07+i*.038],[.03,-.29,.09+i*.038],.012,bone);
      }else{
        for(const s of [-1,1]){
          ribbon(head,[[s*.12,.13,-.03],[s*.34,.37,-.02],[s*.53,.30,.02],[s*.65,.54,-.05]],.067,bone);
          ribbon(head,[[s*.075,.15,-.08],[s*.12,.41,-.22],[s*.20,.51,-.29]],.047,bone);
        }
        robe(rig,.63,.80,.34,cloth);head.scale.set(.90,1.15,1);leftArm.scale.y=rightArm.scale.y=1.18;
      }
    }
    if(model==='archer'||model==='succubus'){
      const hair=actorMaterial(def.id==='bloodRaven'?0x6d2524:0x27221e,'leather');
      for(const s of [-1,1])ribbon(head,[[s*.08,.16,-.025],[s*.14,.02,-.07],[s*.16,-.32,-.12]],.057,hair);
      part(rig,contourGeometry([[.94,.165,.13],[1.15,.23,.17],[1.30,.225,.145]]),dark,0,0,0,1,1,1);
      for(const s of [-1,1]){link(rig,[s*.18,1.38,.055],[s*.13,1.12,.18],.021,dark);plate(rig,brass,s*.12,1.21,.164,.17,.17);}
      robe(rig,.74,.31,.25,dark);link(rig,[-.21,.87,.14],[.21,.87,.14],.027,brass);
      if(model==='archer'){
        const quiver=new THREE.Group();rig.add(quiver);quiver.position.set(-.19,1.13,-.18);quiver.rotation.z=-.35;
        part(quiver,cylinder,dark,0,0,0,.065,.51,.065);
        for(let i=0;i<4;i++){link(quiver,[(i-1.5)*.022,.12,0],[(i-1.5)*.022,.42,0],.007,bone);plate(quiver,bone,(i-1.5)*.022,.39,0,.027,.08);}
        for(const knee of knees)plate(knee,dark,0,-.12,.068,.13,.27);
      }else{
        for(const s of [-1,1])horn(head,s*.12,.27,-.05,.30,-s*.35);
        const tail=new THREE.Group();rig.add(tail);tails.push(tail);ribbon(tail,[[0,.80,-.10],[.3,.36,-.50],[.64,.45,-.76],[.78,.70,-.83]],.045);
      }
    }
    if(model==='mage'){
      for(const s of [-1,1]){plate(rig,metal,s*.20,1.30,-.025,.24,.24);link(rig,[s*.15,1.36,.11],[s*.12,.97,.16],.016,brass);}
      plate(rig,brass,0,1.14,.16,.085,.20);
      for(let i=0;i<3;i++)plate(rig,brass,0,.39+i*.18,.26-i*.03,.04,.09);
    }
    if(model==='goat'||model==='lord'){
      ball(head,0,-.055,.17,.105,.095,.14);fur(head,0,-.18,.15,.16,.20);
      for(const s of [-1,1]){
        ribbon(head,[[s*.14,.15,-.02],[s*.33,.24,-.13],[s*.38,.08,-.24],[s*.23,-.035,-.24],[s*.19,.035,-.16]],model==='lord'?.105:.085,bone);
        fur(s<0?leftLeg:rightLeg,0,-.14,0,.24,.30);
        fur(rig,s*.20,1.29,-.10,.27,.21);
      }
      robe(rig,.79,.29,model==='lord'?.34:.24,dark);
      if(model==='lord')for(const arm of [leftArm,rightArm]){plate(arm,metal,0,.015,.04,.37,.29);horn(arm,0,.19,-.025,.24);}
    }
    if(model==='ghost'){
      head.scale.set(.85,1.08,.90);
      for(const s of [-1,1])ribbon(head,[[s*.12,.15,0],[s*.22,-.08,-.07],[s*.21,-.41,-.12]],.065,cloth);
      leftArm.scale.y=rightArm.scale.y=1.25;
    }
    if(model==='mummy'){
      for(const arm of [leftArm,rightArm])for(let i=0;i<5;i++){const band=part(arm,cylinder,bone,.015,-.075-i*.065,.02,.079,.028,.071);band.rotation.z=.16;}
      for(let i=0;i<5;i++){const band=part(head,cylinder,bone,0,-.10+i*.065,-.01,.151,.028,.14);band.rotation.z=i%2?.1:-.1;}
      part(head,box,dark,0,.059,.137,.23,.026,.018);
      if(def.revive){for(const s of [-1,1]){plate(rig,brass,s*.27,1.33,0,.31,.23);plate(head,brass,s*.17,.065,-.01,.12,.42);}plate(head,brass,0,.22,.085,.22,.21);}
      else {rightArm.scale.y=1.1;plate(rig,bone,-.13,.47,.22,.07,.42);}
    }
    if(model==='flayer'){
      robe(rig,.76,.31,.26,dark);
      for(let i=0;i<7;i++){const tooth=plate(rig,brass,(i-3)*.045,1.79,.25,.025,.075);tooth.rotation.z=(i-3)*.12;}
      fur(head,0,.27,-.025,.42,.26,dark);
      for(const s of [-1,1]){horn(head,s*.22,.10,-.015,.30,-s*.75);link(rig,[s*.08,1.35,.11],[s*.15,1.05,.17],.018,bone);}
    }
    if(model==='council'){
      for(const s of [-1,1]){plate(rig,cloth,s*.20,1.28,.06,.40,.43);link(rig,[s*.31,1.38,.085],[s*.08,.94,.17],.02,brass);horn(head,s*.14,.32,-.06,.34,-s*.22);}
      plate(head,brass,0,.22,.04,.24,.15);plate(rig,brass,0,1.11,.19,.095,.20);
      for(let i=0;i<5;i++)plate(rig,brass,0,.27+i*.12,.29-i*.024,.04,.065);
    }
    if(model==='knight'){
      for(const s of [-1,1]){for(let i=0;i<3;i++)plate(rig,metal,s*.16,.83-i*.07,.14,.19,.09);plate(s<0?leftLeg:rightLeg,metal,0,-.15,.083,.18,.30);}
      for(const knee of knees)plate(knee,metal,0,-.12,.07,.16,.29);
      plate(rig,brass,0,1.20,.222,.06,.21);
    }
    if(model==='mauler'){
      ball(rig,0,1.32,-.10,.38,.23,.25);head.position.set(0,1.54,.21);
      for(const s of [-1,1]){const muscle=part(rig,contourGeometry([[-.10,.09,.025],[0,.19,.05],[.10,.14,.035]]),skin,s*.19,1.22,.25,1,1,1);muscle.rotation.z=-s*.15;link(rig,[s*.36,1.38,.08],[s*.17,.82,.27],.035,dark);plate(s<0?leftArm:rightArm,metal,0,-.16,.12,.23,.19);}
      robe(rig,.74,.37,.38,dark);skull(rig,0,.86,.28,.42);
      fur(head,0,.20,-.08,.33,.16,dark);
    }
    if(model==='venom'||model==='diablo'){
      for(const s of [-1,1]){
        for(let i=0;i<4;i++)plate(rig,cloth,s*.22,1.25-i*.115,.255-i*.019,.27-i*.02,.12);
        for(let i=0;i<3;i++)horn(s<0?leftArm:rightArm,s*.13,-.05-i*.11,-.06,.22-i*.025,-s*.70);
        plate(head,skin,s*.09,-.08,.17,.10,.14);horn(head,s*.10,-.13,.22,.13,s*.2).rotation.x=Math.PI;
      }
      if(model==='venom'){const tail=new THREE.Group();rig.add(tail);tails.push(tail);ribbon(tail,[[0,.8,-.19],[.15,.35,-.63],[.49,.24,-1.08],[.71,.34,-1.23]],.10);}
      else {head.scale.set(1.04,.94,1.23);rig.scale.set(1.04,1,1);part(head,contourGeometry([[-.14,.068,.09,.09],[-.06,.11,.11,.08],[.02,.075,.075,.06]]),skin,0,0,.10,1,1,1);part(head,box,dark,0,-.115,.27,.14,.026,.018);for(let i=0;i<5;i++)horn(head,(i-2)*.028,-.12,.286,.042).rotation.x=Math.PI;}
    }
    if(model==='frozen'){
      for(const s of [-1,1]){
        for(let i=0;i<3;i++)fur(rig,s*.27,1.42-i*.16,-.01-i*.03,.37,.28,bone);
        fur(s<0?leftArm:rightArm,0,-.20,.02,.26,.35,bone);fur(s<0?leftLeg:rightLeg,0,-.16,.04,.28,.29,bone);
      }
      fur(head,0,.24,-.03,.36,.24,bone);fur(head,0,-.15,.12,.24,.17,bone);
      leftArm.scale.y=rightArm.scale.y=1.15;
    }
    if(model==='andariel'){
      for(const s of [-1,1]){plate(rig,brass,s*.14,.80,.15,.13,.16);plate(rig,brass,s*.13,1.23,.17,.17,.17);horn(head,s*.09,.27,-.06,.30,-s*.25);}
      leftLeg.scale.set(.86,1,.87);rightLeg.scale.set(.86,1,.87);leftArm.scale.y=rightArm.scale.y=1.15;
    }
    if(model==='baal'){
      for(const s of [-1,1]){plate(rig,brass,s*.25,1.30,.04,.29,.34);ribbon(head,[[s*.07,-.10,.14],[s*.12,-.26,.16],[s*.20,-.32,.09]],.035,bone);}
      plate(head,brass,0,.20,.08,.16,.30);part(head,box,dark,0,-.09,.16,.13,.027,.02);
    }
    // Named variants keep family anatomy while gaining recognizable equipment.
    if(def.id==='huntress'){
      for(const s of [-1,1])horn(head,s*.12,.25,0,.23,-s*.3);
      const tail=new THREE.Group();rig.add(tail);tails.push(tail);ribbon(tail,[[0,.8,-.1],[.3,.4,-.5],[.55,.6,-.8]],.055);
    }
    if(def.id==='flayerShaman'||def.id==='endugu'){
      plate(head,bone,0,.045,.16,.32,.43);eyes(head,.09,.21);
      for(const s of [-1,1])skull(rig,s*.23,.90,.12,.34);
    }
    if(['bloodRaven','countess','sarina','summoner'].includes(def.id)){
      for(const s of [-1,1])horn(head,s*.12,.30,-.03,.28,-s*.20);
      robe(rig,.53,.90,.31,cloth);plate(rig,brass,0,1.23,.20,.075,.15);
    }
    if(['doomKnight','oblivion','deSeis','reanimated','abyssVanguard'].includes(def.id)){
      for(const s of [-1,1]){plate(s<0?leftArm:rightArm,metal,s*.02,.06,.005,.31,.27);horn(s<0?leftArm:rightArm,s*.02,.25,-.05,.29,-s*.3);}
    }
    if(['griswold','hephasto','shenk','overseer'].includes(def.id)){
      plate(rig,dark,0,.94,.30,.54,.65);for(const s of [-1,1])link(rig,[s*.28,1.39,.08],[s*.13,1.0,.31],.035,dark);
      for(let i=0;i<3;i++)plate(leftArm,metal,-.01,-.04-i*.09,.12,.27,.08);
    }
    if(def.id==='vampire'){rig.scale.y=1.07;robe(rig,.63,1.19,.45,dark);for(const s of [-1,1])horn(head,s*.058,-.11,.14,.12).rotation.x=Math.PI;}
    if(def.id==='izual'){for(const s of [-1,1])ribbon(rig,[[s*.19,1.39,-.1],[s*.52,1.94,-.2],[s*.95,1.50,-.35]],.085,bone);}
    if(def.id==='talic'){fur(rig,0,1.39,-.10,.64,.20,dark);plate(head,brass,0,.20,.08,.18,.17);}
  }
  if (boss) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.1), glow); gem.position.set(0, insect ? 1.12 : 1.22, insect ? .4 : .28); rig.add(gem);
  }
  group.scale.setScalar(def.scale);
  group.userData.bodyPlan = model;
  mergeActorParts(rig);
  const actor: Actor = { group, leftLeg, rightLeg, leftArm, rightArm, kind: def.id, animate(time, moving, attacking) {
    const heavy=['mauler','frozen','duriel','cow'].includes(model),cadence=model==='zombie'?4.7:heavy?6.5:insect?14:9;
    const walk = moving ? Math.sin(time * cadence) : 0;
    const release=Number(group.userData.release??0),flash=Number(group.userData.hitFlash??0);
    skin.emissive.setRGB(flash*.24,flash*.13,flash*.06);metal.emissive.setRGB(flash*.12,flash*.12,flash*.10);
    rig.position.y = floating ? .18 + Math.sin(time * 2) * .12 : moving ? Math.abs(walk) * .035 : Math.sin(time * 2) * .012;
    const stoop=model==='zombie'?.12:['fallen','imp','goat','mauler'].includes(model)?.055:0;
    rig.position.z=release*(heavy?.14:.09);rig.rotation.x=stoop+(moving?(heavy?.06:.025):release*.065);
    rig.rotation.y=moving&&!insect?walk*(heavy?.045:.025):0;
    const crouch=['fallen','imp','flayer','goat','diablo','venom'].includes(model)?.10:0;
    leftLeg.rotation.x = walk * .45-crouch; rightLeg.rotation.x = -walk * .45-crouch;
    knees.forEach((joint,i)=>{joint.rotation.x=insect?0:Math.max(0,(i%2?walk:-walk))*.36;joint.rotation.z=insect&&moving?Math.sin(time*13+i*1.7)*.12:0;});
    elbows.forEach((joint,i)=>{joint.rotation.x=-.045-(attacking?Math.sin(attacking*Math.PI)*.07:moving?Math.sin(time*cadence+i*Math.PI)*.025:0);});
    const head=rig.getObjectByName('monster-head');if(head){head.rotation.x=Math.sin(time*2.2)*.018-attacking*.045;head.rotation.y=Math.sin(time*1.6)*.035-walk*.035;}
    const ready=['fallen','goat','lord','knight','cow'].includes(model)?.23:['archer','shaman','mage','council'].includes(model)?.33:.08;
    leftArm.rotation.x = attacking ? -Math.sin(attacking * Math.PI) * 1.3 : -ready-walk * .25;
    rightArm.rotation.x = attacking ? -Math.sin(attacking * Math.PI) * 1.8 : -ready*.65+walk * .25;
    limbs.forEach((limb, i) => { limb.rotation.z = moving ? Math.sin(time * 13 + i * Math.PI / 2) * .15 : 0; limb.rotation.y = Math.sin(time * (moving ? 11 : 2) + i) * (moving ? .2 : .025); });
    tails.forEach((tail, i) => { tail.rotation.y = Math.sin(time * 3 + i) * .12; tail.rotation.x = attacking * Math.sin(time * 8 + i) * .12; });
    if (model === 'zombie') { leftArm.rotation.x -= .7; rightArm.rotation.x -= .7; }
    if (['archer', 'flayer'].includes(model) && attacking) {leftArm.rotation.x=-1.15;rightArm.rotation.x=-.8;rightArm.rotation.y=-.3*attacking;rig.rotation.y=.2;}
    else rightArm.rotation.y=0;
    if (['shaman','mage','council','mummy','mephisto','baal'].includes(model)&&attacking) {
      leftArm.rotation.x=-.6-attacking*.5;rightArm.rotation.x=-.35-attacking*.7;leftArm.rotation.z=-.25*attacking;rightArm.rotation.z=.2*attacking;
    } else {leftArm.rotation.z=heavy?-.08:-.035;rightArm.rotation.z=heavy?.08:.035;}
    if(heavy&&attacking){rightArm.rotation.x=-2*attacking;leftArm.rotation.x=-.9*attacking;rig.rotation.x=stoop-.09*attacking;}
    if(release>0){rightArm.rotation.x-=release*.5;rig.rotation.y+=(['knight','lord','goat'].includes(model)?-.25:.08)*release;}
  } };
  actor.animate!(0,false,0);
  return actor;
}
