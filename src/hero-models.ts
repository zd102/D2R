import * as THREE from 'three';
import { actorMaterial, contourGeometry, mergeActorParts, plateGeometry } from './actor-modeling.ts';
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
  group.add(rig); rig.add(chest); chest.position.y=1.13; chest.add(head); head.position.y=.43;
  const skin=actorMaterial(paladin?0x70462f:sorceress?0xb88869:0xc69e7b,'skin');
  const leather=actorMaterial(0x3c2c21,'leather'), dark=actorMaterial(0x1b1c1c,'leather'), steel=actorMaterial(0x8a9292,'steel');
  const gold=actorMaterial(0xa88a4d,'bronze'), fabric=actorMaterial(sorceress?0x285c65:amazon?0x554b30:0x343c42,'cloth');
  const hair=actorMaterial(paladin?0x211b17:amazon?0x967036:0x18191b,'leather'), light=actorMaterial(0xc9bda2,'bone');
  const bronze=actorMaterial(0x8c7045,'bronze'), clothBack=actorMaterial(paladin?0x582727:sorceress?0x243d43:0x3b4937,'cloth');
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
  part(chest,contourGeometry([[-.28,.18,.12],[-.19,.185,.13],[-.055,.155,.115],[.09,.22,.145],[.22,paladin?.27:.235,.13],[.29,.16,.105]]),paladin?fabric:skin,0,0,0);
  profile(rig,leather,[[.19,.76],[.23,.84],[.20,.94]],0,0,0,.78);
  part(rig,geos.tube,leather,0,.94,0,.22,.075,.17);part(rig,geos.box,gold,0,.95,.174,.085,.085,.025);
  for(const side of [-1,1]){part(rig,geos.box,gold,side*.16,.95,.12,.024,.065,.025);ball(chest,skin,side*.265,.20,0,.087,.11,.09);}
  profile(chest,skin,[[.079,.28],[.077,.41]],0,0,0,.88);
  // Brow, cheek and jaw volumes read as a face even at the isometric camera distance.
  const faceGeometry=new THREE.SphereGeometry(1,24,18),faceVertices=faceGeometry.attributes.position;
  for(let i=0;i<faceVertices.count;i++){const x=faceVertices.getX(i),y=faceVertices.getY(i),z=faceVertices.getZ(i);faceVertices.setXYZ(i,x*.14*(y<-.15?1+(y+.15)*.28:1),y*.19+.06,z*.125+(z>0?Math.exp(-x*x*25-(y+.05)**2*10)*.02:0));}
  faceGeometry.computeVertexNormals();part(head,faceGeometry,skin,0,0,0);head.scale.setScalar(.86);
  for(const side of [-1,1]) {
    ball(head,skin,side*.138,.025,-.005,.017,.034,.018);
    part(head,geos.box,dark,side*.052,.078,.117,.032,.009,.006);
    const brow=part(head,geos.box,hair,side*.051,.106,.112,.049,.010,.010);brow.rotation.z=side*.09;
  }
  ball(head,skin,0,.035,.135,.017,.036,.023);part(head,geos.box,paladin?hair:leather,0,-.045,.133,.057,.008,.006);
  ball(head,hair,0,.174,-.02,.146,.088,.13);
  if(paladin) {
    ball(head,hair,0,-.092,.083,.089,.036,.061);
    part(chest,contourGeometry([[-.16,.18,.13],[-.06,.205,.16],[.08,.265,.18],[.20,.28,.15],[.27,.19,.115]]),steel,0,0,.007);
    for(const side of [-1,1]) {
      const plate=part(chest,plateGeometry([[-.105,-.07],[.09,-.05],[.12,.06],[.045,.12],[-.105,.08]],.025,.012),steel,side*.135,.115,.161);plate.rotation.y=side*.20;
      bar(chest,gold,[side*.24,.20,.16],[side*.17,-.10,.16],.016);
      for(let i=0;i<3;i++)part(chest,plateGeometry([[-.065,.035],[.07,.03],[.085,-.035],[-.07,-.04]],.022,.006),steel,side*.19,-.13-i*.055,.11+i*.006);
      for(const y of [-.08,.20])ball(chest,gold,side*.21,y,.18,.011,.011,.008);
    }
    part(chest,geos.box,gold,0,.075,.235,.027,.29,.016);part(chest,geos.box,gold,0,.145,.235,.21,.027,.016);
    // Open helmet keeps the Paladin's face visible.
    part(head,contourGeometry([[.16,.149,.137,-.02],[.23,.136,.12,-.02],[.275,.08,.075,-.02],[.29,.015,.025,-.02]],16),steel,0,0,0);
    for(const side of [-1,1]){const guard=part(head,plateGeometry([[-.028,.10],[.026,.12],[.04,-.07],[0,-.12],[-.028,-.05]],.02,.006),steel,side*.128,.065,.025);guard.rotation.y=side*1.1;bar(head,gold,[side*.135,.18,.04],[side*.075,.21,.11],.009);}
    bar(head,gold,[0,.29,-.07],[0,.27,.08],.012);
  } else if(amazon) {
    profile(chest,bronze,[[.19,-.08],[.235,.09],[.247,.19],[.18,.24]],0,0,.012,.8);
    for(const side of [-1,1]){bar(chest,gold,[side*.1,-.07,.16],[side*.16,.22,.15],.017);bar(chest,leather,[side*.17,.27,.08],[side*.14,.17,.18],.025);}
    for(let i=0;i<11;i++){const a=i*Math.PI*2/11;const skirt=part(rig,plateGeometry([[-.043,.11],[.043,.11],[.047,-.105],[.025,-.145],[-.036,-.13]],.014,.004),i%3?leather:bronze,Math.sin(a)*.205,.77,Math.cos(a)*.16);skirt.rotation.set(.14*Math.cos(a),a,-.14*Math.sin(a));ball(skirt,gold,0,.075,.028,.009,.009,.008);}
    const ponytail=new THREE.Group();head.add(ponytail);ponytail.name='hero-hair';ponytail.position.set(0,.18,-.12);
    part(ponytail,contourGeometry([[-.46,.016,.02,-.10],[-.34,.033,.039,-.12],[-.20,.043,.045,-.09],[-.08,.049,.048,-.035],[.015,.03,.03]],12,.1),hair,0,0,0);
    trim(ponytail,0,-.02,0,.04);
    bar(chest,leather,[-.22,.23,-.15],[.22,-.23,.15],.033);
    const quiver=new THREE.Group();chest.add(quiver);quiver.position.set(-.19,-.05,-.18);quiver.rotation.z=-.3;
    profile(quiver,leather,[[.065,-.28],[.09,.23]],0,0,0,.8);trim(quiver,0,.21,0,.09);
    for(let i=0;i<5;i++){bar(quiver,gold,[(i-2)*.023,.15,0],[(i-2)*.023,.42+(i%2)*.04,0],.008);part(quiver,geos.box,light,(i-2)*.023,.39+(i%2)*.04,0,.032,.065,.012);}
  } else {
    profile(chest,fabric,[[.176,-.06],[.228,.09],[.233,.20],[.175,.25]],0,0,.008,.8);
    for(const side of [-1,1]){bar(chest,gold,[side*.15,.23,.135],[0,-.03,.148],.012);part(head,contourGeometry([[-.28,.027,.04,-.065],[-.10,.05,.065,-.04],[.10,.052,.07,-.035],[.19,.025,.04,-.02]],12,.12),hair,side*.11,0,0);}
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
    if(paladin||amazon){
      part(arm,contourGeometry([[-.055,paladin?.137:.102,.125],[-.005,paladin?.15:.109,.135],[.065,paladin?.13:.095,.105],[.095,.055,.065]],10),paladin?steel:bronze,side*.024,0,-.006);
      trim(arm,side*.024,-.04,0,paladin?.135:.098,.85);
      if(paladin)for(let i=0;i<2;i++){const lame=part(arm,plateGeometry([[-.08,.025],[.08,.025],[.095,-.036],[-.075,-.047]],.022,.008),steel,side*.065,-.095-i*.052,.063);lame.rotation.y=side*.65;}
    }
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
  if(paladin){cape=cloth(chest,.49,.83,0,-.20,-.20,clothBack);cloth(rig,.25,.46,0,.67,.18,fabric);for(const side of [-1,1])cloth(rig,.018,.44,side*.10,.67,.191,gold);}
  if(sorceress){for(let i=0;i<5;i++){const a=(i+1)*Math.PI/3;const panel=cloth(rig,.225,.78,Math.sin(a)*.16,.49,Math.cos(a)*.14,fabric);panel.rotation.y=a;const edge=cloth(rig,.014,.76,Math.sin(a)*.16+Math.cos(a)*.10,.49,Math.cos(a)*.14-Math.sin(a)*.10,gold);edge.rotation.y=a;}cape=cloth(chest,.28,.57,-.18,-.17,-.16,clothBack);}
  // Merge only unnamed rigid meshes sharing a joint/material. Gear groups remain addressable.
  mergeActorParts(rig);
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
