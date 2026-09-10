import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Actor } from './world.ts';
import type { ClassId } from './classes.ts';
import { createHeroWards } from './visual-effects.ts';

export type HeroAction = 'swing' | 'thrust' | 'shoot' | 'throw' | 'cast' | 'shield' | 'recover';
export function heroAction(id: string, ranged?: string, melee?: string): HeroAction {
  if (id === 'smite' || id === 'holyShield') return 'shield';
  if (['jab','fend','impale','powerStrike','chargedStrike','lightningStrike'].includes(id)) return 'thrust';
  if (['attack','sacrifice','zeal','vengeance','conversion'].includes(id)) return ranged === 'bow' || ranged === 'crossbow' ? 'shoot' : ranged ? 'throw' : melee === 'spear' || melee === 'dagger' ? 'thrust' : 'swing';
  if (/Arrow|Shot|strafe/.test(id)) return 'shoot';
  if (/Javelin|lightningFury|lightningBolt/.test(id)) return 'throw';
  return 'cast';
}
export function playHeroAction(actor: Actor, action: HeroAction, time: number, duration: number) {
  actor.group.userData.action = { action, time, duration: Math.max(.18, Math.min(1.1, duration)) };
}

// Every actor owns its materials and geometries. Static pieces are merged within
// each joint, preserving articulated elbows, knees and independently visible gear.
export function createHeroActor(classId: ClassId): Actor {
  const paladin=classId==='paladin', amazon=classId==='amazon', sorceress=classId==='sorceress';
  const group=new THREE.Group(), rig=new THREE.Group(), chest=new THREE.Group(), head=new THREE.Group();
  group.name=`hero-${classId}`; group.userData.classId=classId; group.userData.bodyPlan='articulated-hero';
  group.add(rig); rig.add(chest); chest.position.y=1.13; chest.add(head); head.position.y=.48;
  const material=(color:number,metalness=0,roughness=.8)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const skin=material(paladin?0x80533d:sorceress?0xb88562:0xc89b76,0,.88);
  const leather=material(0x392d24), dark=material(0x171c21), steel=material(0x79858b,.55,.57);
  const gold=material(paladin?0xb59856:0xb69a61,.65,.47), fabric=material(sorceress?0x246d79:amazon?0x50614a:0x2e4153);
  const hair=material(paladin?0x231f1c:amazon?0xae873f:0x181b20), light=material(0xd5cbb1,.15,.67);
  const bronze=material(0x927544,.55,.53), clothBack=material(paladin?0x642d30:sorceress?0x174954:0x3b4937);
  const geos={ball:new THREE.SphereGeometry(1,16,12),box:new THREE.BoxGeometry(),tube:new THREE.CylinderGeometry(1,1,1,12),cone:new THREE.ConeGeometry(1,1,8)};
  const part=(parent:THREE.Object3D,geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;
  };
  const ball=(p:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>part(p,geos.ball,m,x,y,z,sx,sy,sz);
  const bar=(p:THREE.Object3D,m:THREE.Material,a:number[],b:number[],r:number)=>{
    const from=new THREE.Vector3(...a as [number,number,number]),to=new THREE.Vector3(...b as [number,number,number]);
    const mesh=part(p,geos.tube,m,0,0,0,r,from.distanceTo(to),r);mesh.position.copy(from).lerp(to,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return mesh;
  };
  const profile=(p:THREE.Object3D,mat:THREE.Material,points:[number,number][],x:number,y:number,z:number,depth=1)=>{
    const geometry=new THREE.LatheGeometry(points.map(([r,h])=>new THREE.Vector2(r,h)),16);
    return part(p,geometry,mat,x,y,z,1,1,depth);
  };
  const trim=(p:THREE.Object3D,x:number,y:number,z:number,r:number,scaleZ=1)=>{
    const m=part(p,new THREE.TorusGeometry(r,.015,5,24),gold,x,y,z,1,1,scaleZ);m.rotation.x=Math.PI/2;return m;
  };
  profile(chest,paladin?fabric:skin,[[.18,-.28],[.19,-.19],[.17,-.06],[.23,.09],[paladin?.29:.24,.24],[.19,.29]],0,0,0,.72);
  profile(rig,leather,[[.19,.76],[.23,.84],[.20,.94]],0,0,0,.78);
  part(rig,geos.tube,leather,0,.94,0,.22,.075,.17);part(rig,geos.box,gold,0,.95,.174,.085,.085,.025);
  for(const side of [-1,1]){part(rig,geos.box,gold,side*.16,.95,.12,.024,.065,.025);ball(chest,skin,side*.265,.20,0,.087,.11,.09);}
  profile(chest,skin,[[.079,.28],[.077,.41]],0,0,0,.88);
  // Brow, cheek and jaw volumes read as a face even at the isometric camera distance.
  const faceGeometry=new THREE.SphereGeometry(1,24,18),faceVertices=faceGeometry.attributes.position;
  for(let i=0;i<faceVertices.count;i++){const x=faceVertices.getX(i),y=faceVertices.getY(i),z=faceVertices.getZ(i);faceVertices.setXYZ(i,x*.14*(y<-.15?1+(y+.15)*.28:1),y*.19+.06,z*.125+(z>0?Math.exp(-x*x*25-(y+.05)**2*10)*.02:0));}
  faceGeometry.computeVertexNormals();part(head,faceGeometry,skin,0,0,0);head.scale.setScalar(.80);
  for(const side of [-1,1]) {
    ball(head,skin,side*.138,.025,-.005,.017,.034,.018);
    part(head,geos.box,dark,side*.052,.078,.117,.044,.014,.008);
    const brow=part(head,geos.box,hair,side*.051,.106,.112,.064,.014,.015);brow.rotation.z=side*.09;
  }
  ball(head,skin,0,.035,.135,.017,.036,.023);part(head,geos.box,paladin?hair:leather,0,-.045,.133,.057,.008,.006);
  ball(head,hair,0,.174,-.02,.146,.088,.13);
  if(paladin) {
    ball(head,hair,0,-.092,.083,.089,.036,.061);
    profile(chest,steel,[[.19,-.13],[.25,.02],[.29,.18],[.22,.28]],0,0,.007,.76);
    for(const side of [-1,1]) {
      const plate=ball(chest,steel,side*.14,.15,.153,.14,.105,.060);plate.rotation.z=side*-.12;
      bar(chest,gold,[side*.24,.20,.16],[side*.17,-.10,.16],.016);
      for(let i=0;i<3;i++)part(chest,geos.box,steel,side*.19,-.08-i*.045,.07,.13,.037,.17);
    }
    part(chest,geos.box,gold,0,.075,.235,.027,.29,.016);part(chest,geos.box,gold,0,.145,.235,.21,.027,.016);
    // Open helmet keeps the Paladin's face visible.
    for(const side of [-1,1]){part(head,geos.box,steel,side*.136,.108,-.027,.032,.22,.17);bar(head,gold,[side*.135,.225,-.08],[side*.135,.225,.09],.015);}
    part(head,geos.box,steel,0,.258,-.025,.255,.027,.18);
    part(head,geos.box,gold,0,.269,-.022,.022,.036,.23);
  } else if(amazon) {
    profile(chest,bronze,[[.19,-.08],[.235,.09],[.247,.19],[.18,.24]],0,0,.012,.8);
    for(const side of [-1,1]){bar(chest,gold,[side*.1,-.07,.16],[side*.16,.22,.15],.017);bar(chest,leather,[side*.17,.27,.08],[side*.14,.17,.18],.025);}
    for(let i=0;i<9;i++){const a=i*Math.PI*2/9;const skirt=part(rig,geos.box,i%2?leather:bronze,Math.sin(a)*.205,.77,Math.cos(a)*.16,.09,.25,.025);skirt.rotation.set(.14*Math.cos(a),a,-.14*Math.sin(a));}
    const ponytail=new THREE.Group();head.add(ponytail);ponytail.name='hero-hair';ponytail.position.set(0,.18,-.12);
    for(let i=0;i<5;i++)ball(ponytail,hair,Math.sin(i*.8)*.027,-i*.088,-.025-i*.022,.058-i*.006,.09,.052-i*.005);
    bar(chest,leather,[-.22,.23,-.15],[.22,-.23,.15],.033);
    const quiver=new THREE.Group();chest.add(quiver);quiver.position.set(-.19,-.05,-.18);quiver.rotation.z=-.3;
    profile(quiver,leather,[[.065,-.28],[.09,.23]],0,0,0,.8);trim(quiver,0,.21,0,.09);
    for(let i=0;i<5;i++){bar(quiver,gold,[(i-2)*.023,.15,0],[(i-2)*.023,.42+(i%2)*.04,0],.008);part(quiver,geos.box,light,(i-2)*.023,.39+(i%2)*.04,0,.032,.065,.012);}
  } else {
    profile(chest,fabric,[[.176,-.06],[.228,.09],[.233,.20],[.175,.25]],0,0,.008,.8);
    for(const side of [-1,1]){bar(chest,gold,[side*.15,.23,.135],[0,-.03,.148],.017);ball(head,hair,side*.105,-.025,-.06,.052,.24,.078);}
    const crest=part(chest,new THREE.OctahedronGeometry(.048),gold,0,.20,.185);crest.scale.set(.8,1.1,.4);
    for(let i=0;i<4;i++)part(chest,geos.box,gold,0,-.15-i*.035,.126,.05-i*.007,.018,.016);
  }
  if(!paladin) {
    const circlet=part(head,new THREE.TorusGeometry(.144,.013,6,24),gold,0,.152,0);circlet.rotation.x=Math.PI/2;
    part(head,new THREE.OctahedronGeometry(.028),sorceress?fabric:light,0,.157,.144,1,1.3,.4);
    for(const side of [-1,1]){const earring=part(head,new THREE.TorusGeometry(.025,.005,5,12),gold,side*.148,-.023,.01);earring.rotation.y=side*.5;}
  }
  const leftLeg=new THREE.Group(),rightLeg=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();
  const knees:THREE.Group[]=[],elbows:THREE.Group[]=[],hands:THREE.Group[]=[];
  for(const [leg,side] of [[leftLeg,-1],[rightLeg,1]] as const) {
    leg.position.set(side*(paladin?.14:.125),.85,0);rig.add(leg);
    profile(leg,sorceress?fabric:paladin?leather:skin,[[.08,-.35],[.106,-.18],[.113,-.04],[.1,0]],0,0,0,.88);
    const knee=new THREE.Group();knee.position.y=-.36;leg.add(knee);knees.push(knee);
    ball(knee,paladin?steel:leather,0,0,.033,.081,.075,.085);
    profile(knee,paladin?steel:leather,[[.058,-.39],[.066,-.26],[.09,-.11],[.076,-.015]],0,0,0,.89);
    ball(knee,leather,0,-.405,.055,.075,.066,.15);
    if(paladin){part(knee,geos.box,gold,0,-.15,.074,.022,.27,.016);ball(knee,steel,0,-.404,.085,.082,.035,.145);}
    else for(let i=0;i<3;i++){part(knee,geos.box,bronze,0,-.09-i*.10,.073,.10,.018,.015);}
  }
  for(const [arm,side] of [[leftArm,-1],[rightArm,1]] as const) {
    arm.position.set(side*(paladin?.31:.265),.20,0);chest.add(arm);
    profile(arm,paladin?leather:skin,[[.059,-.25],[.077,-.16],[.095,-.035],[.082,.015]],0,0,0,.93);
    if(paladin||amazon){ball(arm,paladin?steel:bronze,side*.024,.01,-.006,paladin?.16:.11,.10,.14);trim(arm,side*.024,-.025,0,paladin?.142:.10,.85);}
    const elbow=new THREE.Group();elbow.position.y=-.255;arm.add(elbow);elbows.push(elbow);
    ball(elbow,paladin?steel:skin,0,0,0,.06,.063,.065);
    profile(elbow,paladin?steel:leather,[[.04,-.225],[.064,-.14],[.069,-.045]],0,0,0,.82);
    trim(elbow,0,-.20,0,.047,.84);if(sorceress)trim(elbow,0,-.06,0,.065,.84);
    const hand=new THREE.Group();hand.position.set(0,-.25,.012);elbow.add(hand);hands.push(hand);
    ball(hand,paladin?leather:skin,0,-.01,0,.046,.066,.042);
    for(let i=0;i<3;i++)ball(hand,paladin?leather:skin,(i-1)*.018,-.037,.026,.012,.031,.014);
  }
  const weaponRoot=new THREE.Group();weaponRoot.name='hero-weapon';hands[1].add(weaponRoot);
  const blade=new THREE.Group();blade.name='melee-sword';weaponRoot.add(blade);blade.position.z=.06;
  bar(blade,leather,[0,0,-.15],[0,0,.1],.028);part(blade,geos.box,gold,0,0,.1,.25,.04,.04);
  const shape=new THREE.Shape();shape.moveTo(-.046,.12);shape.lineTo(.046,.12);shape.lineTo(.035,.89);shape.lineTo(0,1.04);shape.lineTo(-.035,.89);shape.closePath();
  const sword=part(blade,new THREE.ExtrudeGeometry(shape,{depth:.022,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:1}),steel,0,0,0);sword.rotation.x=Math.PI/2;
  bar(blade,light,[0,-.02,.17],[0,-.02,.87],.009);ball(blade,gold,0,0,-.17,.041,.036,.041);
  for(const kind of ['axe','mace','spear']) {
    const weapon=new THREE.Group();weapon.name=`melee-${kind}`;weapon.visible=false;weaponRoot.add(weapon);
    const length=kind==='spear'?1.5:.7;bar(weapon,leather,[0,0,kind==='spear'?-.42:-.14],[0,0,length],.032);
    if(kind==='spear'){part(weapon,geos.cone,steel,0,0,1.64,.072,.28,.035).rotation.x=Math.PI/2;bar(weapon,gold,[0,0,1.37],[0,0,1.48],.046);}
    else if(kind==='mace'){ball(weapon,steel,0,0,.72,.13,.12,.18);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const flange=part(weapon,geos.box,gold,Math.sin(a)*.115,Math.cos(a)*.115,.74,.025,.14,.21);flange.rotation.z=-a;}}
    else {const edge=new THREE.Shape();edge.moveTo(-.025,.51);edge.lineTo(.25,.45);edge.quadraticCurveTo(.36,.75,.21,.88);edge.lineTo(-.025,.80);edge.closePath();const axe=part(weapon,new THREE.ExtrudeGeometry(edge,{depth:.04,bevelEnabled:true,bevelSize:.015,bevelThickness:.01,bevelSegments:1}),steel,0,0,0);axe.rotation.x=Math.PI/2;}
  }
  const shield=new THREE.Group();shield.name='hero-shield';hands[0].add(shield);shield.position.set(-.07,.09,.13);shield.rotation.y=-.15;
  const shieldShape=new THREE.Shape();shieldShape.moveTo(-.25,.3);shieldShape.quadraticCurveTo(0,.39,.25,.3);shieldShape.lineTo(.22,-.03);shieldShape.lineTo(0,-.35);shieldShape.lineTo(-.22,-.03);shieldShape.closePath();
  const shieldGeo=new THREE.ExtrudeGeometry(shieldShape,{depth:.045,bevelEnabled:true,bevelSize:.02,bevelThickness:.012,bevelSegments:2});
  part(shield,shieldGeo,paladin?steel:bronze,0,0,0);part(shield,shieldGeo,paladin?fabric:leather,0,0,.05,.87,.88,.3);
  bar(shield,gold,[0,-.27,.085],[0,.28,.085],.015);bar(shield,gold,[-.16,.12,.085],[.16,.12,.085],.015);
  ball(shield,gold,0,.11,.086,.046,.046,.022);
  const staff=new THREE.Group();staff.name='hero-staff';hands[1].add(staff);staff.visible=false;
  bar(staff,leather,[0,-.6,0],[0,1.16,0],.027);for(const y of [-.05,.09,.95,1.1])trim(staff,0,y,0,.035);
  const crook=part(staff,new THREE.TorusGeometry(.115,.018,6,24,Math.PI*1.75),gold,0,1.25,0);crook.rotation.z=.4;
  part(staff,new THREE.OctahedronGeometry(.074),fabric,0,1.26,0,.8,1.3,.8);
  const ranged=new THREE.Group();ranged.name='hero-ranged';hands[1].add(ranged);
  for(const kind of ['bow','crossbow','javelin','knife','axe']) {
    const weapon=new THREE.Group();weapon.name=`hero-${kind}`;(kind==='bow'?hands[0]:ranged).add(weapon);weapon.visible=false;
    if(kind==='bow') {
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.66,.04),new THREE.Vector3(0,-.43,.23),new THREE.Vector3(0,0,.12),new THREE.Vector3(0,.43,.23),new THREE.Vector3(0,.66,.04)]);
      part(weapon,new THREE.TubeGeometry(curve,20,.028,7,false),bronze,0,0,0);
      bar(weapon,light,[0,-.66,.04],[0,.66,.04],.005);bar(weapon,leather,[0,-.09,.12],[0,.09,.12],.035);
    } else if(kind==='crossbow') {
      part(weapon,geos.box,leather,0,0,.24,.075,.07,.61);
      for(const side of [-1,1]){bar(weapon,steel,[0,0,.43],[side*.36,0,.29],.025);bar(weapon,light,[side*.36,0,.29],[0,0,.1],.005);}
    } else {
      const length=kind==='javelin'?1.43:.44;bar(weapon,leather,[0,0,-.29],[0,0,length],.023);
      if(kind==='axe'){const axe=part(weapon,geos.ball,steel,.10,0,length,.20,.032,.13);axe.rotation.y=.25;}
      else part(weapon,geos.cone,steel,0,0,length+.12,.06,.24,.025).rotation.x=Math.PI/2;
      trim(weapon,0,0,.15,.032);
    }
  }
  // Split cloth panels follow the hips; no rigid cone skirt hides leg articulation.
  const clothPanels:THREE.Mesh[]=[];
  const cloth=(parent:THREE.Object3D,width:number,height:number,x:number,y:number,z:number,mat:THREE.Material)=>{
    const geo=new THREE.PlaneGeometry(width,height,8,12),pos=geo.attributes.position;
    for(let i=0;i<pos.count;i++){const h=.5-pos.getY(i)/height;pos.setX(i,pos.getX(i)*(1+h*.3));pos.setZ(i,Math.sin(pos.getX(i)*35)*.018*h);}
    geo.computeVertexNormals();const panel=part(parent,geo,mat,x,y,z);panel.material.side=THREE.DoubleSide;panel.userData.rest=Float32Array.from(pos.array);panel.userData.cloth=true;clothPanels.push(panel);return panel;
  };
  let cape:THREE.Mesh|undefined;
  if(paladin){cape=cloth(chest,.50,.83,0,-.20,-.20,clothBack);cloth(rig,.21,.43,0,.69,.18,fabric);}
  if(sorceress){for(const side of [-1,1]){const panel=cloth(rig,.23,.78,side*.155,.52,side>0?-.06:.13,fabric);panel.rotation.y=side*.4;}cape=cloth(chest,.28,.57,-.18,-.17,-.16,clothBack);}
  // Merge only unnamed rigid meshes sharing a joint/material. Gear groups remain addressable.
  const sourceGeometries=new Set<THREE.BufferGeometry>();
  rig.traverse(node=>{if(node instanceof THREE.Mesh)sourceGeometries.add(node.geometry);});
  const parents:THREE.Object3D[]=[];rig.traverse(node=>{if(node instanceof THREE.Group)parents.push(node);});
  for(const parent of parents) {
    const batches=new Map<THREE.Material,THREE.Mesh[]>();
    for(const child of parent.children)if(child instanceof THREE.Mesh&&!child.userData.cloth&&!child.name){const mat=child.material as THREE.Material;const list=batches.get(mat)??[];list.push(child);batches.set(mat,list);}
    for(const [mat,meshes] of batches){const geometries=meshes.map(mesh=>{mesh.updateMatrix();const geo=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(!geo.index)return geo;const unindexed=geo.toNonIndexed();geo.dispose();return unindexed;});const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!merged)continue;
      const vertices=merged.attributes.position,tints=new Float32Array(vertices.count*3);for(let i=0;i<vertices.count;i++){const variation=Math.sin(vertices.getX(i)*137+vertices.getY(i)*91+vertices.getZ(i)*173);const tint=mat===skin?.97+variation*.025:.91+variation*.07;tints.set([tint,tint,tint],i*3);}merged.setAttribute('color',new THREE.BufferAttribute(tints,3));(mat as THREE.MeshStandardMaterial).vertexColors=true;
      meshes.forEach(m=>parent.remove(m));const m=new THREE.Mesh(merged,mat);m.castShadow=m.receiveShadow=true;parent.add(m);}
  }
  const retained=new Set<THREE.BufferGeometry>();rig.traverse(node=>{if(node instanceof THREE.Mesh)retained.add(node.geometry);});sourceGeometries.forEach(g=>{if(!retained.has(g))g.dispose();});
  const actor:Actor={group,leftLeg,rightLeg,leftArm,rightArm,cape,kind:'hero',animate(time,moving,attacking){
    const running=!!group.userData.running,cycle=time*(running?11:7.5),walk=moving?Math.sin(cycle):0,stride=moving?(running?.63:.40):0;
    rig.position.y=moving?Math.abs(Math.sin(cycle))* (running?.035:.018):Math.sin(time*1.8)*.006;
    rig.rotation.x=moving?(running?.065:.025):0;chest.rotation.set(0,moving?walk*.055:Math.sin(time*1.3)*.012,0);
    head.rotation.set(0,-chest.rotation.y*.4,0);
    leftLeg.rotation.set(walk*stride,0,0);rightLeg.rotation.set(-walk*stride,0,0);
    knees[0].rotation.x=Math.max(0,-walk)*stride*.9;knees[1].rotation.x=Math.max(0,walk)*stride*.9;
    leftArm.rotation.set(-walk*stride*.4,0,-.10);rightArm.rotation.set(walk*stride*.4,0,.10);
    elbows[0].rotation.set(-.30,0,0);elbows[1].rotation.set(sorceress?-.28:-.22,0,0);
    const rangedKind=group.userData.rangedKind;
    if(rangedKind==='bow'||rangedKind==='crossbow'){rightArm.rotation.x=-.48;elbows[1].rotation.x=-.5;}
    if(staff.visible){rightArm.rotation.x=-.12;rightArm.rotation.z=.18;elbows[1].rotation.x=-.3;}
    const action=group.userData.action as {action:HeroAction;time:number;duration:number}|undefined;
    const progress=action?(time-action.time)/action.duration:1-attacking;
    const active=action?progress>=0&&progress<1:attacking>0;
    const pose=active?(action?.action??(rangedKind==='bow'?'shoot':rangedKind?'throw':'swing')):undefined;
    const t=Math.max(0,Math.min(1,progress)),weight=Math.sin(Math.PI*t),release=Math.sin(Math.min(1,t*2.5)*Math.PI/2)*(1-t);
    if(pose==='swing'){chest.rotation.y=-.5*weight;rightArm.rotation.set(-1.3*weight,.25*weight,.15+.7*release);elbows[1].rotation.x=-.25-.9*weight;leftArm.rotation.x=-.30*weight;}
    if(pose==='thrust'){chest.rotation.y=-.25*weight;rightArm.rotation.set(-1.4*release,0,.2);elbows[1].rotation.x=-.7+release*.6;rig.rotation.x+=release*.09;}
    if(pose==='shoot'){chest.rotation.y=.4*weight;leftArm.rotation.set(-1.45*weight,0,-.2);rightArm.rotation.set(-1.1*weight,-.6*weight,.15);elbows[0].rotation.x=-.12;elbows[1].rotation.x=-1.4*weight;}
    if(pose==='throw'){chest.rotation.y=.4*weight;rightArm.rotation.set(-2.3*weight,-.35*weight,.25);elbows[1].rotation.x=-.8+release*.7;}
    if(pose==='cast'){chest.rotation.x=-.045*weight;leftArm.rotation.set(-1.25*release,-.25*weight,-.3*weight);rightArm.rotation.set(staff.visible?-.25:-1.1*release,.2*weight,.22);elbows[0].rotation.x=-.6*weight;elbows[1].rotation.x=-.35*weight;}
    if(pose==='shield'){leftArm.rotation.set(-.65*weight,-.45*weight,-.1);elbows[0].rotation.x=-1.15*weight;chest.rotation.y=.25*weight;}
    if(pose==='recover'){chest.rotation.x=-.16*weight;head.rotation.x=-.13*weight;leftArm.rotation.x=-.4*weight;}
    group.userData.pose=pose??(moving?running?'run':'walk':'idle');
    const hairJoint=head.getObjectByName('hero-hair');if(hairJoint){hairJoint.rotation.x=Math.sin(time*4)*.06+(moving?.15:0);hairJoint.rotation.z=walk*.09;}
    for(const panel of clothPanels){const pos=panel.geometry.attributes.position,rest=panel.userData.rest as Float32Array,height=(panel.geometry as THREE.PlaneGeometry).parameters.height;
      for(let i=0;i<pos.count;i++){const loose=.5-rest[i*3+1]/height;pos.setZ(i,rest[i*3+2]+Math.sin(time*(moving?8:2.5)+loose*3+rest[i*3]*7)*loose*(moving?.065:.018)-(moving?loose*.09:0));}pos.needsUpdate=true;
    }
  }};
  group.add(createHeroWards());actor.animate!(0,false,0);return actor;
}
